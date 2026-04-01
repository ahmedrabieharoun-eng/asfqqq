// ================================================================
//  FOOTBALL INVESTMENT BOT — Cloudflare Worker v1.0
//  Firebase Realtime Database
//  Environment Variables:
//    FIREBASE_DATABASE_URL  e.g. https://YOUR-DB.firebaseio.com
//    FIREBASE_API_KEY       Firebase API key
//    BOT_TOKEN              Telegram Bot Token
//    ADMIN_IDS              comma-separated admin Telegram IDs
// ================================================================

// ── CORS & Response helpers ──────────────────────────────────────
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Action',
  'Access-Control-Max-Age': '86400',
};
const JSON_CT = { 'Content-Type': 'application/json', ...CORS };
const jRes  = (b, s = 200) => new Response(JSON.stringify(b), { status: s, headers: JSON_CT });
const ok    = d  => jRes({ success: true, data: d });
const fail  = (m, s = 400) => jRes({ success: false, error: m }, s);

// ── Sanitise ─────────────────────────────────────────────────────
function sanitise(i) {
  if (!i) return i;
  return i
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/[<>]/g, m => (m === '<' ? '&lt;' : '&gt;'));
}

// ── Rate limiting (in-memory, per IP) ───────────────────────────
const _rl = new Map();
function rateOk(ip) {
  const now = Date.now();
  const w = _rl.get(ip) || { count: 0, start: now };
  if (now - w.start > 60000) { _rl.set(ip, { count: 1, start: now }); return true; }
  if (w.count >= 120) return false;
  w.count++;
  _rl.set(ip, w);
  return true;
}

// ── Per-user per-action cooldown ─────────────────────────────────
const _uac = new Map();
const ACTION_COOLDOWN = { buyPlayer: 1500, claimMission: 2000, buyPack: 2000, saveSquad: 800, withdraw: 5000, deposit: 3000 };
function userActionOk(uid, action) {
  const cd = ACTION_COOLDOWN[action] || 500;
  const key = `${uid}:${action}`;
  const last = _uac.get(key) || 0;
  const now = Date.now();
  if (now - last < cd) return false;
  _uac.set(key, now);
  return true;
}

// ── Firebase helpers ─────────────────────────────────────────────
function fbUrl(env, path) {
  const b = env.FIREBASE_DATABASE_URL?.replace(/\/$/, '');
  if (!b) throw new Error('FIREBASE_DATABASE_URL not set');
  const k = env.FIREBASE_API_KEY;
  if (!k) throw new Error('FIREBASE_API_KEY not set');
  return `${b}/${path.replace(/^\//, '')}.json?key=${k}`;
}
async function dbGet(env, path) {
  try {
    const r = await fetch(fbUrl(env, path));
    if (!r.ok) throw new Error(`GET ${r.status}`);
    return { success: true, data: await r.json() };
  } catch (e) {
    console.error('DB GET', path, e.message);
    return { success: false, error: e.message };
  }
}
async function dbSet(env, path, data) {
  try {
    const r = await fetch(fbUrl(env, path), {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (!r.ok) throw new Error(`SET ${r.status}`);
    return { success: true };
  } catch (e) {
    console.error('DB SET', path, e.message);
    return { success: false, error: e.message };
  }
}
async function dbUpdate(env, path, updates) {
  try {
    const r = await fetch(fbUrl(env, path), {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates),
    });
    if (!r.ok) throw new Error(`UPDATE ${r.status}`);
    return { success: true };
  } catch (e) {
    console.error('DB UPDATE', path, e.message);
    return { success: false, error: e.message };
  }
}

// ── Telegram initData validation ──────────────────────────────────
async function validateTg(initData, botToken) {
  try {
    if (!initData || !botToken) return { valid: false, error: 'Missing initData or botToken' };
    const params = new URLSearchParams(initData);
    const hash = params.get('hash');
    if (!hash) return { valid: false, error: 'No hash in initData' };
    params.delete('hash');
    const sorted = [...params.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => `${k}=${v}`).join('\n');
    const enc = new TextEncoder();
    const secretKey = await crypto.subtle.importKey('raw', enc.encode('WebAppData'), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
    const secretBytes = await crypto.subtle.sign('HMAC', secretKey, enc.encode(botToken));
    const dataKey = await crypto.subtle.importKey('raw', secretBytes, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
    const sig = await crypto.subtle.sign('HMAC', dataKey, enc.encode(sorted));
    const computed = Array.from(new Uint8Array(sig)).map(b => b.toString(16).padStart(2, '0')).join('');
    if (computed !== hash) return { valid: false, error: 'Hash mismatch' };
    const userStr = params.get('user');
    const user = userStr ? JSON.parse(userStr) : null;
    const startParam = params.get('start_param') || '';
    return { valid: true, user, startParam };
  } catch (e) {
    return { valid: false, error: e.message };
  }
}

// ── Default user state ────────────────────────────────────────────
function defaultUser(uid, tgUser) {
  return {
    uid,
    firstName: tgUser?.first_name || 'لاعب',
    lastName: tgUser?.last_name || '',
    username: tgUser?.username || '',
    photoUrl: tgUser?.photo_url || '',
    coins: 500,           // Welcome coins
    tonBalance: 0,
    ownedPlayers: [],
    squad: new Array(11).fill(null),
    completedMissions: [],
    refs: [],
    hasDeposited: false,
    referredBy: null,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
}

// ── getState ──────────────────────────────────────────────────────
async function hGetState(env, uid, tgUser, data) {
  try {
    let res = await dbGet(env, `users/${uid}`);
    let user = res.data;

    // New user
    if (!user) {
      user = defaultUser(uid, tgUser);
      // Handle referral
      const refId = data?._startParam || '';
      if (refId && refId !== uid) {
        user.referredBy = refId;
        // Add to referrer's refs list
        const refUser = (await dbGet(env, `users/${refId}`)).data;
        if (refUser) {
          const refs = refUser.refs || [];
          if (!refs.some(r => r.uid === uid)) {
            refs.push({ uid, firstName: user.firstName, photoUrl: user.photoUrl, hasDeposited: false, joinedAt: Date.now() });
            await dbUpdate(env, `users/${refId}`, {
              refs,
              coins: (refUser.coins || 0) + 200,
              updatedAt: Date.now(),
            });
          }
        }
      }
      await dbSet(env, `users/${uid}`, user);
    } else {
      // Update Telegram user info
      await dbUpdate(env, `users/${uid}`, {
        firstName: tgUser?.first_name || user.firstName,
        lastName: tgUser?.last_name || user.lastName,
        photoUrl: tgUser?.photo_url || user.photoUrl,
        updatedAt: Date.now(),
      });
      user.firstName = tgUser?.first_name || user.firstName;
    }

    return {
      success: true,
      data: {
        coins: user.coins || 0,
        tonBalance: user.tonBalance || 0,
        ownedPlayers: user.ownedPlayers || [],
        squad: user.squad || new Array(11).fill(null),
        completedMissions: user.completedMissions || [],
        refs: user.refs || [],
        hasDeposited: user.hasDeposited || false,
      },
    };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

// ── buyPlayer ─────────────────────────────────────────────────────
async function hBuyPlayer(env, uid, data) {
  try {
    const { playerId, currency, price } = data;
    if (!playerId || !currency || price === undefined) return { success: false, error: 'Missing fields' };

    const res = await dbGet(env, `users/${uid}`);
    const user = res.data;
    if (!user) return { success: false, error: 'User not found' };

    // Check already owned
    const owned = user.ownedPlayers || [];
    if (owned.includes(playerId)) return { success: false, error: 'Already owned' };

    // Check balance
    if (currency === 'coins') {
      if ((user.coins || 0) < price) return { success: false, error: 'Insufficient coins' };
      await dbUpdate(env, `users/${uid}`, {
        coins: (user.coins || 0) - price,
        ownedPlayers: [...owned, playerId],
        updatedAt: Date.now(),
      });
    } else if (currency === 'ton') {
      if ((user.tonBalance || 0) < price) return { success: false, error: 'Insufficient TON' };
      await dbUpdate(env, `users/${uid}`, {
        tonBalance: (user.tonBalance || 0) - price,
        ownedPlayers: [...owned, playerId],
        updatedAt: Date.now(),
      });
    } else {
      return { success: false, error: 'Invalid currency' };
    }

    return { success: true, data: { playerId } };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

// ── buyPack ───────────────────────────────────────────────────────
async function hBuyPack(env, uid, data) {
  try {
    const PACKS = {
      pkg1: { price: 200,  currency: 'coins' },
      pkg2: { price: 1000, currency: 'coins' },
      pkg3: { price: 3000, currency: 'coins' },
      pkg4: { price: 1,    currency: 'ton'   },
      pkg5: { price: 3,    currency: 'ton'   },
    };
    const { packId } = data;
    const pkg = PACKS[packId];
    if (!pkg) return { success: false, error: 'Invalid pack' };

    const res = await dbGet(env, `users/${uid}`);
    const user = res.data;
    if (!user) return { success: false, error: 'User not found' };

    if (pkg.currency === 'coins') {
      if ((user.coins || 0) < pkg.price) return { success: false, error: 'Insufficient coins' };
      await dbUpdate(env, `users/${uid}`, { coins: (user.coins || 0) - pkg.price, updatedAt: Date.now() });
    } else {
      if ((user.tonBalance || 0) < pkg.price) return { success: false, error: 'Insufficient TON' };
      await dbUpdate(env, `users/${uid}`, { tonBalance: (user.tonBalance || 0) - pkg.price, updatedAt: Date.now() });
    }

    return { success: true, data: { packId } };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

// ── claimMission ──────────────────────────────────────────────────
async function hClaimMission(env, uid, data) {
  try {
    const MISSIONS = {
      d1: { reward: 50,    isTon: false },
      d2: { reward: 100,   isTon: false },
      d3: { reward: 200,   isTon: false },
      d4: { reward: 350,   isTon: false },
      d5: { reward: 500,   isTon: false },
      d6: { reward: 750,   isTon: false },
      d7: { reward: 1000,  isTon: false },
      w1: { reward: 1000,  isTon: false },
      w2: { reward: 2500,  isTon: false },
      w3: { reward: 5000,  isTon: false },
      w4: { reward: 10000, isTon: false },
      w5: { reward: 0.5,   isTon: true  },
    };
    const { missionId } = data;
    const mission = MISSIONS[missionId];
    if (!mission) return { success: false, error: 'Invalid mission' };

    const res = await dbGet(env, `users/${uid}`);
    const user = res.data;
    if (!user) return { success: false, error: 'User not found' };

    const completed = user.completedMissions || [];
    if (completed.includes(missionId)) return { success: false, error: 'Already claimed' };

    completed.push(missionId);
    const updates = { completedMissions: completed, updatedAt: Date.now() };
    if (mission.isTon) {
      updates.tonBalance = (user.tonBalance || 0) + mission.reward;
    } else {
      updates.coins = (user.coins || 0) + mission.reward;
    }

    await dbUpdate(env, `users/${uid}`, updates);
    return { success: true, data: { missionId, reward: mission.reward, isTon: mission.isTon } };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

// ── saveSquad ─────────────────────────────────────────────────────
async function hSaveSquad(env, uid, data) {
  try {
    const { squad } = data;
    if (!Array.isArray(squad) || squad.length !== 11) return { success: false, error: 'Invalid squad' };
    await dbUpdate(env, `users/${uid}`, { squad, updatedAt: Date.now() });
    return { success: true };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

// ── withdraw ──────────────────────────────────────────────────────
async function hWithdraw(env, uid, data) {
  try {
    const { amount, address } = data;
    if (!amount || amount < 0.5) return { success: false, error: 'الحد الأدنى للسحب 0.5 TON' };
    if (!address) return { success: false, error: 'يرجى توفير عنوان محفظة' };

    const res = await dbGet(env, `users/${uid}`);
    const user = res.data;
    if (!user) return { success: false, error: 'User not found' };
    if ((user.tonBalance || 0) < amount) return { success: false, error: 'رصيد غير كافٍ' };

    // Deduct and add to pending queue
    await dbUpdate(env, `users/${uid}`, {
      tonBalance: (user.tonBalance || 0) - amount,
      updatedAt: Date.now(),
    });
    await dbSet(env, `withdrawQueue/${uid}_${Date.now()}`, {
      uid, amount, address,
      status: 'pending',
      createdAt: Date.now(),
    });

    return { success: true, data: { amount } };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

// ── deposit (manual — admin confirms) ────────────────────────────
async function hDeposit(env, uid, data) {
  try {
    const { amount, txHash } = data;
    if (!amount || amount < 0.5) return { success: false, error: 'الحد الأدنى للإيداع 0.5 TON' };

    await dbSet(env, `depositQueue/${uid}_${Date.now()}`, {
      uid, amount, txHash: txHash || '',
      status: 'pending',
      createdAt: Date.now(),
    });

    return { success: true, data: { message: 'تم إرسال طلب الإيداع، سيتم المراجعة خلال دقائق' } };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

// ── Admin handlers ────────────────────────────────────────────────
async function hAdmin(env, action, data) {
  try {
    if (action === 'adminGetUser') {
      const { uid } = data;
      const res = await dbGet(env, `users/${uid}`);
      return { success: true, data: res.data };
    }
    if (action === 'adminSetBalance') {
      const { uid, coins, tonBalance } = data;
      const updates = { updatedAt: Date.now() };
      if (coins !== undefined) updates.coins = coins;
      if (tonBalance !== undefined) updates.tonBalance = tonBalance;
      await dbUpdate(env, `users/${uid}`, updates);
      return { success: true };
    }
    if (action === 'adminConfirmDeposit') {
      const { uid, amount, queueKey } = data;
      const res = await dbGet(env, `users/${uid}`);
      const user = res.data;
      if (!user) return { success: false, error: 'User not found' };
      await dbUpdate(env, `users/${uid}`, {
        tonBalance: (user.tonBalance || 0) + amount,
        hasDeposited: true,
        updatedAt: Date.now(),
      });
      if (queueKey) await dbUpdate(env, `depositQueue/${queueKey}`, { status: 'confirmed' });
      // Referral bonus — if this is first deposit, give referrer 5% bonus
      if (!user.hasDeposited && user.referredBy) {
        const refRes = await dbGet(env, `users/${user.referredBy}`);
        const refUser = refRes.data;
        if (refUser) {
          const bonus = amount * 0.05;
          const refs = (refUser.refs || []).map(r => r.uid === uid ? { ...r, hasDeposited: true } : r);
          await dbUpdate(env, `users/${user.referredBy}`, {
            tonBalance: (refUser.tonBalance || 0) + bonus,
            refs,
            updatedAt: Date.now(),
          });
        }
      }
      return { success: true };
    }
    if (action === 'adminApproveWithdraw') {
      const { queueKey } = data;
      await dbUpdate(env, `withdrawQueue/${queueKey}`, { status: 'approved', approvedAt: Date.now() });
      return { success: true };
    }
    if (action === 'adminRejectWithdraw') {
      const { uid, queueKey, amount } = data;
      // Refund
      const res = await dbGet(env, `users/${uid}`);
      const user = res.data;
      if (user) {
        await dbUpdate(env, `users/${uid}`, {
          tonBalance: (user.tonBalance || 0) + amount,
          updatedAt: Date.now(),
        });
      }
      await dbUpdate(env, `withdrawQueue/${queueKey}`, { status: 'rejected' });
      return { success: true };
    }
    if (action === 'adminGetQueue') {
      const dep = (await dbGet(env, 'depositQueue')).data || {};
      const wd = (await dbGet(env, 'withdrawQueue')).data || {};
      return { success: true, data: { deposits: dep, withdrawals: wd } };
    }
    return { success: false, error: 'Unknown admin action' };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

// ── TON Connect Manifest ──────────────────────────────────────────
const TON_MANIFEST = {
  url: 'https://silent-block-bedf.ahmedrabieharoun.workers.dev',
  name: 'Football Investment Bot',
  iconUrl: 'https://i.imgur.com/placeholder.png', // ← ضع رابط أيقونة التطبيق هنا
  description: 'Football Investment Bot on Telegram',
};

// ── Main fetch handler ────────────────────────────────────────────
export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') return new Response(null, { headers: CORS });

    const url = new URL(request.url);
    const path = url.pathname;

    // Health check
    if (path === '/health') return ok({ status: 'ok', ts: Date.now(), env: env.ENVIRONMENT || 'production' });

    // TON Connect manifest
    if (path === '/tonconnect-manifest.json') return jRes(TON_MANIFEST);

    // Only /api POST is handled beyond this point
    if (path !== '/api' || request.method !== 'POST') return fail('Not found', 404);

    // Rate limit by IP
    const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
    if (!rateOk(ip)) return fail('Rate limit exceeded', 429);

    // Parse body
    let body;
    try {
      const raw = await request.text();
      if (raw.length > 10240) return fail('Payload too large', 413);
      body = JSON.parse(sanitise(raw));
    } catch (_) {
      return fail('Invalid JSON', 400);
    }

    const authHeader = request.headers.get('Authorization') || '';
    const action = request.headers.get('X-Action') || body.action;
    const data = body.data || {};
    if (!action) return fail('Missing action', 400);

    // Ping — no auth needed
    if (action === 'ping') return jRes({ success: true, data: { pong: true, ts: Date.now() } });

    // ── Admin actions ──
    const ADMIN_ACTIONS = new Set(['adminGetUser', 'adminSetBalance', 'adminConfirmDeposit', 'adminApproveWithdraw', 'adminRejectWithdraw', 'adminGetQueue']);
    if (ADMIN_ACTIONS.has(action)) {
      const v = await validateTg(authHeader.replace('Telegram ', ''), env.BOT_TOKEN);
      if (!v.valid) return fail('Unauthorized', 401);
      const adminIds = (env.ADMIN_IDS || '').split(',').map(s => s.trim());
      if (!adminIds.includes(String(v.user?.id))) return fail('Forbidden', 403);
      return jRes(await hAdmin(env, action, data));
    }

    // ── User auth required ──
    if (!authHeader.startsWith('Telegram ')) return fail('Telegram authentication required', 401);
    const v = await validateTg(authHeader.replace('Telegram ', ''), env.BOT_TOKEN);
    if (!v.valid) {
      return jRes({
        success: false,
        error: 'Invalid Telegram authentication',
        errorCode: 'INVALID_TELEGRAM_AUTH',
        debug: {
          hasInitData: !!authHeader,
          botTokenConfigured: !!env.BOT_TOKEN,
          environment: env.ENVIRONMENT || 'production',
          validationError: v.error,
        },
      }, 401);
    }

    const uid = String(v.user.id);
    console.log(`[${new Date().toISOString()}] User:${uid} Action:${action} IP:${ip}`);

    // Per-user cooldown
    if (!userActionOk(uid, action)) return fail('Too fast. Please wait a moment.', 429);

    // ── Route actions ──
    switch (action) {
      case 'getState':     return jRes(await hGetState    (env, uid, v.user, { ...data, _startParam: v.startParam || '' }));
      case 'buyPlayer':    return jRes(await hBuyPlayer   (env, uid, data));
      case 'buyPack':      return jRes(await hBuyPack     (env, uid, data));
      case 'claimMission': return jRes(await hClaimMission(env, uid, data));
      case 'saveSquad':    return jRes(await hSaveSquad   (env, uid, data));
      case 'withdraw':     return jRes(await hWithdraw    (env, uid, data));
      case 'deposit':      return jRes(await hDeposit     (env, uid, data));
      default:             return fail('Unknown action', 400);
    }
  },
};
