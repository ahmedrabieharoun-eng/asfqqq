// ================================================================
//  PANDA BAMBOO FACTORY — Auction Page Worker v1.0
//  Cloudflare Worker — Dedicated to Auction Page
//  Firebase Realtime Database
//
//  Environment Variables required:
//    FIREBASE_DATABASE_URL   e.g. https://YOUR-DB.firebaseio.com
//    FIREBASE_API_KEY        Firebase API key
//    BOT_TOKEN               Telegram Bot Token
//    ADMIN_IDS               comma-separated admin Telegram IDs
//
//  Routes handled:
//    GET  /                  → serves index.html
//    GET  /back music.mp3    → serves background music
//    POST /api               → JSON API (action-based)
//    POST /admin             → Admin actions (requires admin auth)
// ================================================================

// ── Auction Config ─────────────────────────────────────────────
const AUCTION = {
  DURATION_MS : 3 * 24 * 60 * 60 * 1000,
  MIN_BID     : 1,
  REFUND_PCT  : 20,
  PACKAGE_PLAYERS: [
    'cruyff','kaka','buffon','casillas','maldini','cafu',
    'ronaldinho','ronaldo','pele','roberto_carlos','zidane',
    'maradona','iniesta',
  ],
  PLAYER_RATING: 99,
};

// ── CORS headers ───────────────────────────────────────────────
const CORS = {
  'Access-Control-Allow-Origin' : '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, X-Telegram-Init-Data',
};

// ── Helpers ────────────────────────────────────────────────────
function jRes(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS },
  });
}

function errRes(msg, status = 400) {
  return jRes({ success: false, error: msg }, status);
}

// ── Firebase helpers ───────────────────────────────────────────
async function fbReq(env, method, path, body) {
  const url = `${env.FIREBASE_DATABASE_URL}/${path}.json?auth=${env.FIREBASE_API_KEY}`;
  const opts = { method, headers: { 'Content-Type': 'application/json' } };
  if (body !== undefined) opts.body = JSON.stringify(body);
  const r = await fetch(url, opts);
  if (!r.ok) throw new Error(`Firebase ${method} ${path} => ${r.status}`);
  return r.json();
}

async function dbGet(env, path) {
  const data = await fbReq(env, 'GET', path);
  return { data };
}

async function dbSet(env, path, data) {
  await fbReq(env, 'PUT', path, data);
}

async function dbUpdate(env, path, data) {
  await fbReq(env, 'PATCH', path, data);
}

// ── Telegram notification ──────────────────────────────────────
async function sendTgNotification(env, userId, text) {
  if (!env.BOT_TOKEN || !userId) return;
  await fetch(`https://api.telegram.org/bot${env.BOT_TOKEN}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: userId, text, parse_mode: 'HTML' }),
  });
}

// ── Rate limiting (KV-based, optional) ────────────────────────
const ACTION_COOLDOWNS = {
  auctionBid   : 3000,
  getAuction   : 500,
  deposit      : 5000,
};

// ── Telegram init data validation ─────────────────────────────
function parseTgInitData(initData) {
  if (!initData) return null;
  const params = new URLSearchParams(initData);
  const userStr = params.get('user');
  if (!userStr) return null;
  try {
    return JSON.parse(decodeURIComponent(userStr));
  } catch {
    return null;
  }
}

// ════════════════════════════════════════════════════════════════
//  AUCTION HANDLERS
// ════════════════════════════════════════════════════════════════

// Get auction state & leaderboard
async function hGetAuction(env, uid) {
  try {
    let meta = (await dbGet(env, 'auction/meta')).data;
    if (!meta || !meta.endDate) {
      meta = {
        endDate   : Date.now() + AUCTION.DURATION_MS,
        startDate : Date.now(),
        status    : 'active',
      };
      await dbSet(env, 'auction/meta', meta);
    }

    const userBid = (await dbGet(env, `auction/bids/${uid}`)).data;
    const myBid   = userBid ? (userBid.totalAmount || 0) : 0;

    const lbData     = (await dbGet(env, 'auction/leaderboard')).data;
    const leaderboard = lbData ? (lbData.top || []) : [];
    const totalBidders = lbData ? (lbData.totalBidders || 0) : 0;
    const totalAmount  = lbData ? (lbData.totalAmount  || 0) : 0;

    return {
      success: true,
      data: {
        endDate       : meta.endDate,
        startDate     : meta.startDate,
        status        : meta.status,
        myBid,
        leaderboard,
        totalPlayers  : AUCTION.PACKAGE_PLAYERS.length,
        totalBidders,
        totalAmount,
      },
    };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

// Place a bid
async function hAuctionBid(env, uid, data) {
  try {
    const { amount } = data;
    if (!amount || typeof amount !== 'number' || amount < AUCTION.MIN_BID)
      return { success: false, error: `Minimum bid is ${AUCTION.MIN_BID} TON` };
    if (amount > 10000)
      return { success: false, error: 'Bid too large' };

    // Check auction active
    const meta = (await dbGet(env, 'auction/meta')).data;
    if (!meta || !meta.endDate)
      return { success: false, error: 'Auction not started' };
    if (Date.now() > meta.endDate)
      return { success: false, error: 'Auction has ended' };
    if (meta.status !== 'active')
      return { success: false, error: 'Auction is not active' };

    // Get user
    const user = (await dbGet(env, `users/${uid}`)).data;
    if (!user) return { success: false, error: 'User not found' };
    if ((user.tonBalance || 0) < amount)
      return { success: false, error: 'Insufficient TON balance' };

    // Deduct balance
    const newBalance = (user.tonBalance || 0) - amount;
    await dbUpdate(env, `users/${uid}`, { tonBalance: newBalance });

    // Record bid
    const existingBid = (await dbGet(env, `auction/bids/${uid}`)).data;
    const prevTotal   = existingBid ? (existingBid.totalAmount || 0) : 0;
    const newTotal    = prevTotal + amount;
    const newBidCount = (existingBid ? (existingBid.bidCount || 0) : 0) + 1;

    await dbSet(env, `auction/bids/${uid}`, {
      userId      : uid,
      name        : `${user.firstName || ''} ${user.lastName || ''}`.trim() || 'Panda',
      photo       : user.photoUrl || null,
      totalAmount : newTotal,
      lastBidAt   : Date.now(),
      bidCount    : newBidCount,
    });

    // Rebuild leaderboard
    const previousTop = await rebuildAuctionLeaderboard(env);

    // Notify outbid user
    const lb = (await dbGet(env, 'auction/leaderboard')).data;
    if (lb?.top?.[0]?.userId === uid && previousTop && previousTop !== uid) {
      sendTgNotification(env, previousTop,
        `🔔 <b>مزاد باكج الأساطير!</b>\nتم تجاوزك! أعلى مزايد الآن دفع <b>${newTotal.toFixed(2)} TON</b>\n\n🏆 ادخل وزايد الآن!`
      ).catch(() => {});
    }

    return {
      success: true,
      data: {
        tonBalance : newBalance,
        totalBid   : newTotal,
        bidCount   : newBidCount,
      },
    };
  } catch (e) {
    console.error('hAuctionBid:', e);
    return { success: false, error: e.message };
  }
}

// Get user info
async function hGetUser(env, uid) {
  try {
    const user = (await dbGet(env, `users/${uid}`)).data;
    if (!user) return { success: false, error: 'User not found' };
    return {
      success: true,
      data: {
        uid,
        firstName  : user.firstName || '',
        lastName   : user.lastName  || '',
        photoUrl   : user.photoUrl  || null,
        tonBalance : user.tonBalance || 0,
        ownedPlayers: user.ownedPlayers || [],
      },
    };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

// ── Rebuild leaderboard, returns previous top uid ──────────────
async function rebuildAuctionLeaderboard(env) {
  try {
    const allBids = (await dbGet(env, 'auction/bids')).data;
    if (!allBids) return null;

    const entries = Object.values(allBids)
      .filter(b => b && b.totalAmount > 0)
      .sort((a, b) => b.totalAmount - a.totalAmount);

    const top = entries.slice(0, 10).map((e, i) => ({
      rank     : i + 1,
      userId   : e.userId,
      name     : e.name,
      photo    : e.photo,
      amount   : e.totalAmount,
    }));

    const currentLb  = (await dbGet(env, 'auction/leaderboard')).data;
    const previousTop = currentLb?.top?.[0]?.userId || null;

    await dbSet(env, 'auction/leaderboard', {
      top,
      previousTop,
      totalBidders : entries.length,
      totalAmount  : entries.reduce((s, e) => s + e.totalAmount, 0),
      updatedAt    : Date.now(),
    });

    return previousTop;
  } catch (e) {
    console.error('rebuildAuctionLeaderboard:', e);
    return null;
  }
}

// ════════════════════════════════════════════════════════════════
//  ADMIN HANDLERS
// ════════════════════════════════════════════════════════════════

async function hAdminEndAuction(env) {
  try {
    const meta = (await dbGet(env, 'auction/meta')).data;
    if (!meta) return { success: false, error: 'No auction found' };
    if (meta.status === 'distributed')
      return { success: false, error: 'Auction already distributed' };

    const allBids = (await dbGet(env, 'auction/bids')).data;
    if (!allBids) return { success: false, error: 'No bids found' };

    const entries = Object.entries(allBids)
      .filter(([_, b]) => b && b.totalAmount > 0)
      .sort(([_, a], [__, b]) => b.totalAmount - a.totalAmount);

    if (entries.length === 0)
      return { success: false, error: 'No valid bids' };

    const results = [];

    // Winner (rank 1) — gets ALL players
    const [winnerUid, winnerBid] = entries[0];
    const winnerUser = (await dbGet(env, `users/${winnerUid}`)).data;
    if (winnerUser) {
      const currentOwned = winnerUser.ownedPlayers || [];
      const newPlayers   = AUCTION.PACKAGE_PLAYERS.filter(p => !currentOwned.includes(p));
      await dbUpdate(env, `users/${winnerUid}`, {
        ownedPlayers: [...currentOwned, ...newPlayers],
      });
      results.push({ uid: winnerUid, name: winnerBid.name, reward: 'FULL_PACKAGE', players: newPlayers.length });
      sendTgNotification(env, winnerUid,
        `🏆🎉 <b>تهانينا! فزت بالمزاد!</b>\n\nحصلت على <b>باكج الأساطير كاملاً</b> (${AUCTION.PACKAGE_PLAYERS.length} لاعب أسطوري)!\n\n💰 يمكنك بيعهم فور بدء الموسم الجديد!\nالقيمة المتوقعة: <b>75 - 130 TON</b> 🔥`
      ).catch(() => {});
    }

    // Runners-up (rank 2-10) — 1 random player + 20% refund
    for (let i = 1; i < entries.length; i++) {
      const [uid, bid] = entries[i];
      const user = (await dbGet(env, `users/${uid}`)).data;
      if (!user) continue;

      const available = AUCTION.PACKAGE_PLAYERS.filter(
        p => !(user.ownedPlayers || []).includes(p)
      );
      const randomPlayer = available.length > 0
        ? available[Math.floor(Math.random() * available.length)]
        : null;

      const refund  = bid.totalAmount * (AUCTION.REFUND_PCT / 100);
      const updates = { tonBalance: (user.tonBalance || 0) + refund };
      if (randomPlayer) updates.ownedPlayers = [...(user.ownedPlayers || []), randomPlayer];

      await dbUpdate(env, `users/${uid}`, updates);
      results.push({ uid, name: bid.name, reward: 'ONE_PLAYER', player: randomPlayer, refund: refund.toFixed(2) });

      sendTgNotification(env, uid,
        `🎯 <b>نتيجة المزاد!</b>\n\nحصلت على <b>لاعب أسطوري واحد</b>${randomPlayer ? ` (${randomPlayer})` : ''}!\n💰 تم استرداد <b>${refund.toFixed(2)} TON</b> (20%) إلى محفظتك.\n\nشكراً لمشاركتك! ⚽`
      ).catch(() => {});
    }

    await dbUpdate(env, 'auction/meta', { status: 'distributed', distributedAt: Date.now() });

    return { success: true, data: { results, totalBidders: entries.length } };
  } catch (e) {
    console.error('hAdminEndAuction:', e);
    return { success: false, error: e.message };
  }
}

async function hAdminResetAuction(env) {
  try {
    await dbSet(env, 'auction/meta', {
      endDate   : Date.now() + AUCTION.DURATION_MS,
      startDate : Date.now(),
      status    : 'active',
    });
    await dbSet(env, 'auction/bids', null);
    await dbSet(env, 'auction/leaderboard', null);
    return { success: true, data: { message: 'Auction reset successfully' } };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

async function hAdminGetStats(env) {
  try {
    const meta = (await dbGet(env, 'auction/meta')).data;
    const lb   = (await dbGet(env, 'auction/leaderboard')).data;
    return {
      success: true,
      data: {
        meta,
        totalBidders  : lb?.totalBidders  || 0,
        totalAmount   : lb?.totalAmount   || 0,
        top3          : (lb?.top || []).slice(0, 3),
        timeRemaining : meta?.endDate ? Math.max(0, meta.endDate - Date.now()) : 0,
      },
    };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

// ════════════════════════════════════════════════════════════════
//  MAIN HANDLER
// ════════════════════════════════════════════════════════════════
export default {
  async fetch(request, env) {
    const url    = new URL(request.url);
    const method = request.method.toUpperCase();

    // CORS preflight
    if (method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS });
    }

    // ── Static assets ──────────────────────────────────────────
    if (method === 'GET' && url.pathname === '/') {
      // Serve index.html from KV or inline
      // If using KV: const html = await env.ASSETS.get('index.html');
      // For now, redirect to your actual hosted HTML
      return new Response('Auction page — serve index.html here', {
        headers: { 'Content-Type': 'text/plain' },
      });
    }

    // ── API endpoint ───────────────────────────────────────────
    if (url.pathname === '/api' || url.pathname === '/api/') {
      if (method !== 'POST') return errRes('Method not allowed', 405);

      let body;
      try {
        body = await request.json();
      } catch {
        return errRes('Invalid JSON');
      }

      const { action, data = {}, initData } = body;
      if (!action) return errRes('Missing action');

      // Parse Telegram user
      const tgUser = parseTgInitData(initData);
      const uid    = tgUser ? String(tgUser.id) : (data.uid || null);
      if (!uid) return errRes('Unauthorized — missing user id', 401);

      // Route actions
      switch (action) {
        case 'getAuction':
          return jRes(await hGetAuction(env, uid));

        case 'auctionBid':
          return jRes(await hAuctionBid(env, uid, data));

        case 'getUser':
          return jRes(await hGetUser(env, uid));

        default:
          return errRes(`Unknown action: ${action}`);
      }
    }

    // ── Admin endpoint ─────────────────────────────────────────
    if (url.pathname === '/admin' || url.pathname === '/admin/') {
      if (method !== 'POST') return errRes('Method not allowed', 405);

      let body;
      try {
        body = await request.json();
      } catch {
        return errRes('Invalid JSON');
      }

      const { action, adminId } = body;

      // Validate admin
      const adminIds = (env.ADMIN_IDS || '').split(',').map(s => s.trim());
      if (!adminId || !adminIds.includes(String(adminId))) {
        return errRes('Forbidden', 403);
      }

      switch (action) {
        case 'adminEndAuction':
          return jRes(await hAdminEndAuction(env));

        case 'adminResetAuction':
          return jRes(await hAdminResetAuction(env));

        case 'adminGetStats':
          return jRes(await hAdminGetStats(env));

        default:
          return errRes(`Unknown admin action: ${action}`);
      }
    }

    return new Response('Not Found', { status: 404 });
  },
};
