/* ════════════════════════════════════════════
   CONFIG — 🔧 edit these before deploying
════════════════════════════════════════════ */
const CFG = {
  API_URL      : 'https://kjikm-production.up.railway.app', // ✏️ ضع رابط Railway هنا
  DEPOSIT_WALLET:'UQA1c65zeiKZg4lpf4mwZeaSsNRyZhQ181M13brLTm2i_s5k',
  RATE         : 30,
  MIN_WD       : 200,
  TON_PER_COIN : 0.00005,
  TON_USD      : 3.5,
  FREE_WD_LIMIT: 200,
  REF_BONUS    : 20,
  BOT_USERNAME : 'PandaBamboBot',
  BOT_APP_LINK : 'https://t.me/PandaBamboBot/app',
};

/* ════ MULTI-SERVER RACE SYSTEM ════════════════════════════════════
   On first load: race all servers → fastest wins.
   Winner stored in sessionStorage for the whole session.
   If sticky server fails → re-race automatically.
   Dead servers skipped for DEAD_WINDOW_MS before retry.
   SECURITY: write ops (withdraw, exchange, buy) go to ONE server only.
═══════════════════════════════════════════════════════════════════ */
const SERVERS = [
  'https://kjikm-production.up.railway.app', // ✏️ ضع رابط Railway هنا (نفس CFG.API_URL)
];

// Actions that MUST go to ONE server only (write ops — prevent double execution)
const WRITE_ACTIONS = new Set([
  'withdraw','exchange','buy','upgradeTank','collect',
  'claimTask','verifyTask','createTask','deposit'
]);

const API_TIMEOUT_MS  = 8000;
const DEAD_WINDOW_MS  = 12 * 60 * 60 * 1000; // 12h
const SESS_KEY        = 'panda_active_srv';
const DEAD_KEY        = 'panda_dead_srvs';

function _getDeadMap(){
  try{ return JSON.parse(sessionStorage.getItem(DEAD_KEY)||'{}'); }catch(_){ return {}; }
}
function _markDead(url){
  const m=_getDeadMap(); m[url]=Date.now();
  try{ sessionStorage.setItem(DEAD_KEY,JSON.stringify(m)); }catch(_){}
}
function _isDead(url){
  const m=_getDeadMap(); const t=m[url];
  return t && (Date.now()-t < DEAD_WINDOW_MS);
}
function _getStickyServer(){
  try{ return sessionStorage.getItem(SESS_KEY)||null; }catch(_){ return null; }
}
function _setStickyServer(url){
  try{ sessionStorage.setItem(SESS_KEY,url); }catch(_){}
}

async function _callOne(url, action, data, authHdr){
  const heads = {'Content-Type':'application/json'};
  if(authHdr) heads.Authorization = authHdr;
  const ctrl = new AbortController();
  const tOut = setTimeout(()=>ctrl.abort(), API_TIMEOUT_MS);
  try{
    const r = await fetch(`${url}/api`,{method:'POST',headers:heads,body:JSON.stringify({action,data}),signal:ctrl.signal});
    clearTimeout(tOut);
    if(!r.ok) throw new Error(`HTTP ${r.status}`);
    return await r.json();
  }catch(e){ clearTimeout(tOut); throw e; }
}

// Race all live servers — used only for read ops at startup
async function _raceServers(action, data, authHdr){
  const live = SERVERS.filter(s=>!_isDead(s));
  if(!live.length){ // all dead — reset and try all
    try{ sessionStorage.removeItem(DEAD_KEY); }catch(_){}
    live.push(...SERVERS);
  }
  return new Promise((resolve, reject)=>{
    let done=false, fails=0;
    live.forEach(url=>{
      _callOne(url, action, data, authHdr)
        .then(res=>{
          if(done) return;
          done=true;
          _setStickyServer(url);
          resolve(res);
        })
        .catch(()=>{
          _markDead(url);
          fails++;
          if(fails===live.length && !done) reject(new Error('All servers unreachable'));
        });
    });
  });
}

// Route call: write ops → sticky server only; read ops → sticky or race
async function _call(url/*ignored*/, action, data, authHdr){
  const isWrite = WRITE_ACTIONS.has(action);
  const sticky  = _getStickyServer();

  if(isWrite){
    // Write ops MUST use sticky server to prevent duplicate execution
    const srv = sticky || SERVERS[0];
    return _callOne(srv, action, data, authHdr);
  }

  // Read op: try sticky first, fall back to race
  if(sticky && !_isDead(sticky)){
    try{
      const res = await _callOne(sticky, action, data, authHdr);
      return res;
    }catch(e){
      _markDead(sticky);
      try{ sessionStorage.removeItem(SESS_KEY); }catch(_){}
    }
  }
  // Race to find fastest live server
  return _raceServers(action, data, authHdr);
}

// Exposed for loading screen to race servers explicitly at startup
window._raceServersNow = async function(authHdr){
  return _raceServers('ping', {}, authHdr).catch(()=>
    _raceServers('getState', {start_param:'',_initData:''}, authHdr)
  );
};

const BAM_URL='https://i.supaimg.com/ec27537b-aa6a-42cf-8ba1-d6850eeea36d/d7e19f8c-7876-4dc6-8542-d4f615704e46.png';

// Fix 4: rebalanced items — clear ROI progression, higher tier always better per coin
const ITEMS = [
  {id:'bamboo_stick',   name:'Bamboo Stick',       icon:'img', iconUrl:'https://i.supaimg.com/ec27537b-aa6a-42cf-8ba1-d6850eeea36d/a995343f-ab46-4c91-9cf2-1140c0bdd6f5.png',  price:7500,    power:50    },
  {id:'panda_paw',      name:'Panda Paw Drill',    icon:'img', iconUrl:'https://i.supaimg.com/ec27537b-aa6a-42cf-8ba1-d6850eeea36d/f8d2d332-fa72-447e-94e9-62f4e5cf75c9.png',  price:25000,   power:200   },
  {id:'leaf_fan',       name:'Leaf Fan Cooler',    icon:'img', iconUrl:'https://i.supaimg.com/ec27537b-aa6a-42cf-8ba1-d6850eeea36d/c1657ae3-3927-41e9-a32d-70ab89ddfe3b.png',  price:125000,  power:1200  },
  {id:'bamboo_energy',  name:'Bamboo Energy Pod',  icon:'img', iconUrl:'https://i.supaimg.com/ec27537b-aa6a-42cf-8ba1-d6850eeea36d/73a7e781-107c-4598-9c1a-e9db2c65dbf5.png',  price:625000,  power:7500  },
  {id:'panda_den',      name:'Panda Den Hub',      icon:'img', iconUrl:'https://i.supaimg.com/ec27537b-aa6a-42cf-8ba1-d6850eeea36d/a4cd4f37-ce88-4115-92af-3170bb1654b7.png',  price:3130000, power:45000 },
  {id:'bamboo_forest',  name:'Bamboo Forest Rig',  icon:'img', iconUrl:'https://i.supaimg.com/ec27537b-aa6a-42cf-8ba1-d6850eeea36d/273f8ce0-bfa2-4618-895a-00481620d1d9.png',  price:6500000, power:110000},
];
// 27 tank levels — capacity only, no speedBonus
const TANK_LVS = {
  1 :{cap:5000,      upgCost:1000,       label:'Starter Tank'},
  2 :{cap:10000,     upgCost:3000,       label:'Leaf Tank'},
  3 :{cap:20000,     upgCost:8000,       label:'Bamboo Tank'},
  4 :{cap:40000,     upgCost:20000,      label:'Panda Tank'},
  5 :{cap:80000,     upgCost:50000,      label:'Mega Tank'},
  6 :{cap:150000,    upgCost:120000,     label:'Empire Tank'},
  7 :{cap:250000,    upgCost:250000,     label:'Forest Tank'},
  8 :{cap:400000,    upgCost:450000,     label:'Giant Tank'},
  9 :{cap:600000,    upgCost:750000,     label:'Legend Tank'},
  10:{cap:900000,    upgCost:1200000,    label:'Titan Tank'},
  11:{cap:1300000,   upgCost:1800000,    label:'Storm Tank'},
  12:{cap:1800000,   upgCost:2700000,    label:'Thunder Tank'},
  13:{cap:2500000,   upgCost:4000000,    label:'Volcano Tank'},
  14:{cap:3300000,   upgCost:5500000,    label:'Glacier Tank'},
  15:{cap:4300000,   upgCost:8000000,    label:'Aurora Tank'},
  16:{cap:5500000,   upgCost:11000000,   label:'Nova Tank'},
  17:{cap:7000000,   upgCost:15000000,   label:'Cosmic Tank'},
  18:{cap:8800000,   upgCost:20000000,   label:'Galaxy Tank'},
  19:{cap:11000000,  upgCost:27000000,   label:'Nebula Tank'},
  20:{cap:14000000,  upgCost:35000000,   label:'Supernova Tank'},
  21:{cap:17500000,  upgCost:45000000,   label:'Quantum Tank'},
  22:{cap:22000000,  upgCost:58000000,   label:'Infinity Tank'},
  23:{cap:28000000,  upgCost:75000000,   label:'Eternal Tank'},
  24:{cap:35000000,  upgCost:95000000,   label:'Celestial Tank'},
  25:{cap:44000000,  upgCost:120000000,  label:'Divine Tank'},
  26:{cap:55000000,  upgCost:150000000,  label:'Absolute Tank'},
  27:{cap:70000000,  upgCost:200000000,  label:'Universe Tank'},
};
// Fix 5: Added r200 + r500 — rewards reduced to 10% of original
const REF_TASKS=[
  {id:'r1',  n:1,   bam:50,    coins:2   },
  {id:'r5',  n:5,   bam:250,   coins:10  },
  {id:'r10', n:10,  bam:600,   coins:25  },
  {id:'r20', n:20,  bam:1500,  coins:60  },
  {id:'r50', n:50,  bam:4000,  coins:150 },
  {id:'r70', n:70,  bam:6000,  coins:220 },
  {id:'r100',n:100, bam:10000, coins:400 },
  {id:'r200',n:200, bam:20000, coins:800 },
  {id:'r500',n:500, bam:50000, coins:2000},
];
// Active referrals (who deposited) — 2x original rewards
const REF_ACTIVE_TASKS=[
  {id:'ra1',  n:1,   bam:5000,    coins:20   },
  {id:'ra5',  n:5,   bam:25000,   coins:100  },
  {id:'ra10', n:10,  bam:60000,   coins:250  },
  {id:'ra20', n:20,  bam:150000,  coins:600  },
  {id:'ra50', n:50,  bam:400000,  coins:1500 },
  {id:'ra70', n:70,  bam:600000,  coins:2200 },
  {id:'ra100',n:100, bam:1000000, coins:4000 },
  {id:'ra200',n:200, bam:2000000, coins:8000 },
  {id:'ra500',n:500, bam:5000000, coins:20000},
];
const SOC_TASKS=[
  {id:'tg_payouts', name:'💰 Join Payouts Channel', icon:'💰', link:'https://t.me/PandaBambooPayouts', bam:1000},
  {id:'tg_news',    name:'📰 Join Mining News Channel', icon:'📰', link:'https://t.me/PandaMiningNews', bam:500},
  {id:'tg_ch', name:'Join Telegram Channel', icon:'📢', link:'https://t.me/YOUR_CHANNEL', bam:1000},
  {id:'tg_grp',name:'Join Telegram Group',   icon:'👥', link:'https://t.me/YOUR_GROUP',   bam:500 },
  {id:'tg_bot',name:'Start our Bot',          icon:'🤖', link:`https://t.me/${CFG.BOT_USERNAME}`, bam:300},
];

/* ════ STATE ════ */
const S={
  userId:null,
  startParam:'', // Fix 3: referral ID from URL
  user:{bamboo:0,coins:0,miningRate:0,totalEarned:0,machines:{},tankLevel:1,hasDeposited:false,freeWdUsed:false,tonBalance:0},
  refs:[],exchHist:[],wdHist:[],balLog:[],doneTasks:[],
  tasks:{partner:[],community:[]},
  tankProgress:0,tankInt:null,
  tg:null,tonUI:null,wallet:null,depCheckInt:null,
  mineTimerInt:null,
  _collectCooldown:false,
};

/* ════ SECURITY: escape HTML to prevent XSS ════ */
function esc(s){
  return String(s||'')
    .replace(/&/g,'&amp;')
    .replace(/</g,'&lt;')
    .replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;')
    .replace(/'/g,'&#39;');
}

/* ════ DEVICE FINGERPRINT ════════════════════════════════════════════
   Generates a stable hardware-based ID that survives:
   ✓ IP change / VPN
   ✓ Incognito mode
   ✓ Clearing cookies/cache
   Based on: GPU, screen, fonts, audio, canvas, hardware concurrency
═══════════════════════════════════════════════════════════════════ */
async function getDeviceFingerprint(){
  try{
    const parts=[];
    // 1. Canvas fingerprint
    try{
      const c=document.createElement('canvas');
      const ctx=c.getContext('2d');
      ctx.textBaseline='top';
      ctx.font='14px Arial';
      ctx.fillStyle='#f60';ctx.fillRect(125,1,62,20);
      ctx.fillStyle='#069';ctx.fillText('🐼PandaBamboo',2,15);
      ctx.fillStyle='rgba(102,204,0,0.7)';ctx.fillText('🐼PandaBamboo',4,17);
      parts.push(c.toDataURL());
    }catch(_){}
    // 2. WebGL GPU fingerprint
    try{
      const c=document.createElement('canvas');
      const gl=c.getContext('webgl')||c.getContext('experimental-webgl');
      if(gl){
        const dbg=gl.getExtension('WEBGL_debug_renderer_info');
        if(dbg){
          parts.push(gl.getParameter(dbg.UNMASKED_VENDOR_WEBGL));
          parts.push(gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL));
        }
        parts.push(gl.getParameter(gl.VERSION));
        parts.push(gl.getParameter(gl.SHADING_LANGUAGE_VERSION));
      }
    }catch(_){}
    // 3. Screen & hardware
    parts.push(`${screen.width}x${screen.height}x${screen.colorDepth}`);
    parts.push(`${navigator.hardwareConcurrency||0}cores`);
    parts.push(`${navigator.deviceMemory||0}gb`);
    parts.push(navigator.platform||'');
    parts.push(navigator.language||'');
    // 4. Audio fingerprint
    try{
      const AudioCtx=window.OfflineAudioContext||window.webkitOfflineAudioContext;
      if(AudioCtx){
        const ac=new AudioCtx(1,44100,44100);
        const osc=ac.createOscillator();
        const analyser=ac.createAnalyser();
        const gain=ac.createGain();
        gain.gain.value=0;
        osc.connect(analyser);analyser.connect(gain);gain.connect(ac.destination);
        osc.start(0);
        const buf=await ac.startRendering();
        const data=buf.getChannelData(0);
        let sum=0;for(let i=0;i<data.length;i+=100)sum+=Math.abs(data[i]);
        parts.push(sum.toFixed(6));
      }
    }catch(_){}
    // 5. Timezone
    parts.push(Intl.DateTimeFormat().resolvedOptions().timeZone||'');
    parts.push(new Date().getTimezoneOffset());
    // Add Telegram userId as a stable anchor — same person, same ID across TG apps
    if(S.userId) parts.push('tguid:'+S.userId);
    // Hash everything into a stable 40-char hex string
    const raw=parts.join('|||');
    const enc=new TextEncoder();
    const hashBuf=await crypto.subtle.digest('SHA-256',enc.encode(raw));
    const hex=[...new Uint8Array(hashBuf)].map(b=>b.toString(16).padStart(2,'0')).join('');
    return hex;
  }catch(e){
    console.warn('Fingerprint error:',e);
    return '';
  }
}
// Compute once and cache
let _fp='';
async function getOrComputeFp(){
  if(_fp) return _fp;
  _fp=await getDeviceFingerprint();
  return _fp;
}

/* ════ ANTI-CLICKER DEBOUNCE SYSTEM ════ */
const _debounceMap = new Map();
const DEBOUNCE_MS  = 3000;
function debounce(key){
  const now = Date.now();
  const last = _debounceMap.get(key) || 0;
  if(now - last < DEBOUNCE_MS){
    const rem = Math.ceil((DEBOUNCE_MS - (now - last)) / 1000);
    showNotif(`\u23F3 Wait ${rem}s before trying again`,'w');
    return false;
  }
  _debounceMap.set(key, now);
  return true;
}

/* ════ API — Single Server ═════════════════════════════════════════ */
let _apiInFlight = 0;

async function api(action, data={}){
  if(_apiInFlight > 8) throw new Error('Too many requests');
  _apiInFlight++;
  const authHdr = S.tg?.initData ? `Telegram ${S.tg.initData}` : null;
  try{
    const j = await _call(null, action, data, authHdr);
    if(!j.success){
      const err = new Error(j.error || 'API error');
      err.errorCode = j.errorCode || '';
      err.missing   = j.missing;
      throw err;
    }
    return j.data;
  } finally { _apiInFlight--; }
}

async function loadState(){
  try{
    // Pass raw initData so server can extract start_param from it
    const d = await api('getState', {
      start_param : S.startParam || '',
      _initData   : S.tg?.initData || '',
    });

    // 🔔 Check for new referrals since last check (referral join notification)
    const prevRefCount = S.refs ? S.refs.length : 0;
    S.user      = d.user    || S.user;
    S.refs      = d.referrals || [];
    S.exchHist  = d.exchHistory || [];
    S.wdHist    = d.wdHistory   || [];
    S.balLog    = d.balanceLog  || [];
    S.doneTasks = d.completedTasks || [];
    S.deposits  = d.deposits  || [];
    S.tasks     = d.tasks || { partner:[], community:[] };
    // Active ref count computed in renderTasks from refs[].hasDeposited
    if(d.user && d.user.tankAccrued !== undefined){
      S.tankProgress = parseFloat(d.user.tankAccrued) || 0;
    }
    // Mark data as successfully loaded from server
    S._dataLoaded = true;
    // 🔔 Show in-app notification if new referral joined
    if(S._initialized && S.refs.length > prevRefCount){
      const newest = S.refs[0];
      const name = newest ? esc(newest.name||'') : '';
      const lang = localStorage.getItem('pandaLang')||'en';
      const t = TRANSLATIONS[lang]||TRANSLATIONS['en'];
      const msg = (t.newRefNotif||TRANSLATIONS['en'].newRefNotif).replace('{name}', name||'👤');
      showNotif(msg,'s');
    }
    if(d.pendingDeposit) startDepVerify(d.pendingDeposit.depId, d.pendingDeposit.txHash);
  }catch(e){
    console.warn('loadState:', e.message);
    // If data was never loaded yet, don't call updateUI (keeps UI in loading state)
    if(!S._dataLoaded) return;
  }
  // Only update UI if we have confirmed server data at least once
  if(S._dataLoaded) updateUI();
  S._initialized = true;
}

/* ════ UPDATE UI ════ */
function updateUI(){
  const u = S.user;
  document.getElementById('tbCoins').textContent   = fmt(u.coins||0);
  document.getElementById('tbBamboo').textContent  = fmt(u.bamboo||0);
  const rateDay = Math.round((u.miningRate||0)*24);
  document.getElementById('champRateDay').textContent = fmt(rateDay);
  if(document.getElementById('exchBamboo')) document.getElementById('exchBamboo').textContent = fmt(u.bamboo||0);
  if(document.getElementById('exchCoins'))  document.getElementById('exchCoins').textContent  = fmt(u.coins||0);
  const finC = document.getElementById('finCoinsDisp');
  const finB = document.getElementById('finBambooDisp');
  if(finC) finC.textContent = fmt(u.coins||0);
  if(finB) finB.textContent = fmt(u.bamboo||0);
  if(document.getElementById('wdCoinsDisp')) document.getElementById('wdCoinsDisp').textContent = fmt(u.coins||0);
  updSwapBals();
  ITEMS.forEach(it=>{
    const el = document.getElementById(`owned_${it.id}`);
    if(el) el.textContent = (u.machines?.[it.id]||0)>0 ? `Owned: ${u.machines[it.id]}` : '';
    updateBuyBtn(it.id);
  });
  updateRefUI();
  renderExchHist();
  renderWdHist();
}

/* ════ COMPETITION COUNTDOWN BANNER ════ */
(function(){
  // 🔧 غيّر التاريخ هنا (UTC)
  const END_DATE = new Date('2026-12-31T23:59:59Z');
  function tick(){
    const el = document.getElementById('compCountdown');
    const b  = document.getElementById('compBanner');
    if(!el || !b) return;
    // تأكد إن الكارت ظاهر دايماً طالما التاريخ لسه ما وصلش
    b.style.display = 'flex';
    const diff = END_DATE.getTime() - Date.now();
    if(diff <= 0){
      el.textContent = 'Ended';
      b.classList.add('ended');
      return;
    }
    b.classList.remove('ended');
    const d = Math.floor(diff / 86400000);
    const h = Math.floor((diff % 86400000) / 3600000);
    const m = Math.floor((diff % 3600000) / 60000);
    const s = Math.floor((diff % 60000) / 1000);
    el.textContent = d > 0
      ? `${d}d ${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}`
      : `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
  }
  // شغّل بعد تحميل الـ DOM كامل
  if(document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', function(){ tick(); setInterval(tick, 1000); });
  } else {
    tick(); setInterval(tick, 1000);
  }
})();

/* ════ TANK ════ */
function startTank(){
  if(S.tankInt) clearInterval(S.tankInt);
  S.tankInt = setInterval(()=>{
    const u=S.user, lv=u.tankLevel||1, cfg=TANK_LVS[lv]||TANK_LVS[1], rate=u.miningRate||0;
    if(rate<=0){updateTankUI();return;}
    S.tankProgress += (rate/3600);
    if(S.tankProgress>cfg.cap) S.tankProgress=cfg.cap;
    updateTankUI();
  },1000);
}
function updateTankUI(){
  const u=S.user, lv=u.tankLevel||1, cfg=TANK_LVS[lv]||TANK_LVS[1];
  const pct = Math.min(100, Math.round((S.tankProgress/cfg.cap)*100));
  const accruedExact = S.tankProgress.toFixed(6);
  document.getElementById('champAccrued').textContent = accruedExact;
  const btn=document.getElementById('collectBtn');
  const pctEl=document.getElementById('claimPct');
  const txtEl=document.getElementById('claimBtnTxt');
  const has = S.tankProgress>=1;
  btn.disabled = !has;
  if(pctEl) pctEl.textContent = pct+'%';
  if(txtEl) txtEl.innerHTML = has
    ? `<img src="https://i.supaimg.com/ec27537b-aa6a-42cf-8ba1-d6850eeea36d/d7e19f8c-7876-4dc6-8542-d4f615704e46.png" style="width:32px;height:32px;object-fit:contain;vertical-align:middle;margin-right:5px"> Claim ${fmt(Math.floor(S.tankProgress))} Bamboo`
    : `<img src="https://i.supaimg.com/ec27537b-aa6a-42cf-8ba1-d6850eeea36d/d7e19f8c-7876-4dc6-8542-d4f615704e46.png" style="width:32px;height:32px;object-fit:contain;vertical-align:middle;margin-right:5px"> Tank Empty...`;
  const lvEl=document.getElementById('tankLvDisp');
  if(lvEl) lvEl.textContent=lv;
}
async function collectBamboo(){
  if(S._collectCooldown) return;
  if(!debounce('collect')) return;
  const amt = Math.floor(S.tankProgress);
  if(amt<1){showNotif('Tank is empty!','e');return;}
  S._collectCooldown=true;
  setTimeout(()=>S._collectCooldown=false, 3000);
  S.user.bamboo=(S.user.bamboo||0)+amt;
  S.user.totalEarned=(S.user.totalEarned||0)+amt;
  S.tankProgress=0;
  updateUI(); updateTankUI(); spawnPtc();
  showNotif(`+${fmt(amt)} Bamboo collected!`,'s');
  api('collect',{amount:amt}).catch(()=>{});
}

/* Tank upgrade modal */
function buildUpgradeContent(){
  const u=S.user, lv=u.tankLevel||1, cur=TANK_LVS[lv], next=TANK_LVS[lv+1];
  let h=`<div style="background:rgba(0,0,0,.28);border:1px solid var(--border);border-radius:14px;padding:12px;margin-bottom:10px">
    <div class="upg-levels">
      <div class="upg-lv"><div class="lvn">Lv.${lv}</div><div class="lvl">${esc(cur.label)}</div><div style="font-size:10px;color:var(--muted);margin-top:2px">Cap: ${fmt(cur.cap)}</div></div>
      <div class="upg-arrow">→</div>`;
  if(next){
    h+=`<div class="upg-lv" style="border-color:var(--bamboo)"><div class="lvn" style="color:var(--coin)">Lv.${lv+1}</div><div class="lvl">${esc(next.label)}</div><div style="font-size:10px;color:var(--muted);margin-top:2px">Cap: ${fmt(next.cap)}</div></div>`;
  } else {
    h+=`<div class="upg-lv"><div class="lvn">MAX</div><div class="lvl">Max Level</div></div>`;
  }
  h+=`</div>`;
  if(next){
    h+=`<div class="upg-det">📦 Capacity: <span>${fmt(cur.cap)} → ${fmt(next.cap)} Bamboo</span><br>💰 Cost: <span>${fmt(next.upgCost)} <img src="${BAM_URL}" style="width:14px;height:14px;object-fit:contain;vertical-align:middle"></span></div>
    <button class="btn-upg" onclick="upgradeTank()">⬆️ Upgrade for ${fmt(next.upgCost)} <img src="${BAM_URL}" style="width:16px;height:16px;object-fit:contain;vertical-align:middle"></button>`;
  } else {
    h+=`<div style="text-align:center;padding:12px;color:var(--bamboo);font-weight:800">🏆 Maximum Level!</div>`;
  }
  h+=`</div>`;
  document.getElementById('upgradeContent').innerHTML=h;
}
async function upgradeTank(){
  if(!debounce('upgradeTank')) return;
  const u=S.user, lv=u.tankLevel||1, next=TANK_LVS[lv+1];
  if(!next){showNotif('Already max!','e');return;}
  if((u.bamboo||0)<next.upgCost){showNotif(`Need ${fmt(next.upgCost)} Bamboo!`,'e');return;}
  S.user.bamboo-=next.upgCost; S.user.tankLevel=lv+1;
  api('upgradeTank',{newLevel:lv+1}).catch(()=>{});
  buildUpgradeContent(); updateUI();
  showNotif(`✅ Tank → Level ${lv+1}!`,'s');
}

/* ════ NAVIGATION ════ */
function hideFab(){const f=document.getElementById('floatAddTask');if(f)f.style.display='none';}
function showFab(){const f=document.getElementById('floatAddTask');if(f)f.style.display='flex';}

function goNav(el){
  document.querySelectorAll('.ni').forEach(n=>n.classList.remove('active'));
  document.querySelectorAll('.sec').forEach(s=>s.classList.remove('active'));
  el.classList.add('active');
  document.getElementById(el.dataset.s).classList.add('active');
  hideFab(); // always hide when changing main section
}

/* ════ MARKET ════ */
function renderMarket(){
  document.getElementById('marketList').innerHTML=ITEMS.map(it=>`
    <div class="mkt-item">
      <div class="mkt-icon">${it.icon==='img'?`<img src="${esc(it.iconUrl)}" style="width:90px;height:90px;object-fit:contain">`:esc(it.icon)}</div>
      <div class="mkt-info">
        <div class="mkt-name">${esc(it.name)}</div>
        <div class="mkt-power">+${fmt(it.power)} Bamboo/hr per unit</div>
        <div class="mkt-price-lbl"><img src="https://i.supaimg.com/ec27537b-aa6a-42cf-8ba1-d6850eeea36d/d7e19f8c-7876-4dc6-8542-d4f615704e46.png" style="width:26px;height:26px;object-fit:contain;vertical-align:middle"> ${fmt(it.price)} Bamboo each</div>
        <div class="mkt-owned" id="owned_${it.id}"></div>
      </div>
      <div class="mkt-actions">
        <div style="display:flex;flex-direction:column;align-items:center;gap:5px">
          <div class="qty-ctrl">
            <button class="qty-btn" onclick="chgQty('${it.id}',-1)">−</button>
            <div class="qty-num" id="qty_${it.id}">1</div>
            <button class="qty-btn" onclick="chgQty('${it.id}',+1)">+</button>
          </div>
          <button class="btn-buy-price" id="buybtn_${it.id}" onclick="buyItem('${it.id}')" style="width:100%">${fmt(it.price)}</button>
        </div>
      </div>
    </div>`).join('');
}
function chgQty(id,d){
  const el=document.getElementById(`qty_${id}`);
  let v=parseInt(el.textContent)||1;
  v=Math.max(1,Math.min(99,v+d));
  el.textContent=v; updateBuyBtn(id);
}
function updateBuyBtn(id){
  const it=ITEMS.find(i=>i.id===id);
  if(!it) return;
  const el=document.getElementById(`buybtn_${id}`);
  const qEl=document.getElementById(`qty_${id}`);
  if(!el||!qEl) return;
  el.textContent=fmt(it.price*(parseInt(qEl.textContent)||1));
}
async function buyItem(id){
  if(!debounce('buy_'+id)) return;
  const it=ITEMS.find(i=>i.id===id);
  const q=parseInt(document.getElementById(`qty_${id}`)?.textContent)||1;
  const total=it.price*q;
  if((S.user.bamboo||0)<total){showNotif(`Need ${fmt(total)} Bamboo!`,'e');return;}
  api('buyItem',{itemId:id,qty:q}).catch(()=>{});
  S.user.bamboo-=total;
  S.user.machines=S.user.machines||{};
  S.user.machines[id]=(S.user.machines[id]||0)+q;
  S.user.miningRate=(S.user.miningRate||0)+(it.power*q);
  updateUI(); showNotif(`✅ ${q}x ${esc(it.name)}! +${fmt(it.power*q)} Bamboo/hr`,'s'); spawnPtc();
}

/* ════ TASKS ════ */
let _socTab='partner';
const _taskInFlight=new Set(); // Fix 1: double-click guard
const BAM_IMG='<img src="https://i.supaimg.com/ec27537b-aa6a-42cf-8ba1-d6850eeea36d/d7e19f8c-7876-4dc6-8542-d4f615704e46.png" style="width:18px;height:18px;object-fit:contain;vertical-align:middle">'; // Fix 7

function switchSocTab(tab){
  _socTab=tab;
  document.getElementById('stab-partner').className  ='ttab'+(tab==='partner' ?' active':'');
  document.getElementById('stab-community').className='ttab'+(tab==='community'?' active':'');
  document.getElementById('socPartnerList').style.display  =tab==='partner'  ?'block':'none';
  document.getElementById('socCommunityList').style.display=tab==='community'?'block':'none';
  // Show floating button ONLY on community sub-tab
  if(tab==='community') showFab(); else hideFab();
}

function buildTaskCard(t,cat){
  const tid=t.id, done=S.doneTasks.includes(tid), inFlight=_taskInFlight.has(tid);
  const icon=t.type==='channel'?'📢':'🤖';
  const name=esc(t.name||('@'+(t.link?.split('t.me/')[1]?.split('/')[0]||'Task')));
  const bam=t.bambooReward||500;
  const link=esc(t.link||'');
  return`<div class="task-item">
    <div class="ticon" style="font-size:28px">${icon}</div>
    <div class="tinfo">
      <div class="tname">${name}</div>
      <div class="trew">${BAM_IMG} ${fmt(bam)} Bamboo</div>
      ${t.completions!==undefined?`<div class="tstat">${t.completions||0}/${t.targetUsers||0} completed</div>`:''}
    </div>
    ${done?`<button class="tbtn done">✅ Done</button>`
      :inFlight?`<button class="tbtn done" style="opacity:.6">⏳</button>`
      :`<button class="tbtn go" onclick="doDbTask('${tid}','${link}','${t.type||'bot'}','${cat}')">Go →</button>`}
  </div>`;
}

function renderSocTasks(){
  const p=S.tasks?.partner||[], c=S.tasks?.community||[];
  document.getElementById('socPartnerList').innerHTML=p.length?p.map(t=>buildTaskCard(t,'partner')).join(''):`<div class="hist-empty">No partner tasks yet</div>`;
  document.getElementById('socCommunityList').innerHTML=c.length?c.map(t=>buildTaskCard(t,'community')).join(''):`<div class="hist-empty">No community tasks yet</div>`;
}

function switchRefTab(tab){
  const aEl=document.getElementById('rtab-active');
  const rEl=document.getElementById('rtab-regular');
  if(aEl){
    aEl.style.background   = tab==='active'  ? 'rgba(255,193,7,.18)'  : 'rgba(0,0,0,.55)';
    aEl.style.border       = tab==='active'  ? '2px solid rgba(255,193,7,.55)' : '1px solid rgba(255,255,255,.1)';
    aEl.style.color        = tab==='active'  ? 'var(--coin)' : 'rgba(255,255,255,.4)';
  }
  if(rEl){
    rEl.style.background   = tab==='regular' ? 'rgba(124,179,66,.18)' : 'rgba(0,0,0,.55)';
    rEl.style.border       = tab==='regular' ? '2px solid rgba(124,179,66,.55)' : '1px solid rgba(255,255,255,.1)';
    rEl.style.color        = tab==='regular' ? 'var(--bamboo)' : 'rgba(255,255,255,.4)';
  }
  document.getElementById('refActivePane').style.display  = tab==='active'  ? 'block':'none';
  document.getElementById('refRegularPane').style.display = tab==='regular' ? 'block':'none';
}

function renderTasks(){
  const lang=localStorage.getItem('pandaLang')||'en';
  const T=TRANSLATIONS[lang]||TRANSLATIONS['en'];

  // ── Update stats card ──
  const totalRefs = S.refs.length;
  // Active = referrals with hasDeposited:true (set by server from users/{id}/hasDeposited)
  const activeCount = S.refs.filter(r=>r.hasDeposited).length;
  S._activeRefCount = activeCount;
  const totalEl=document.getElementById('refTotalCount');
  const activeEl=document.getElementById('refActiveCount');
  if(totalEl) totalEl.textContent=totalRefs;
  if(activeEl) activeEl.textContent=activeCount;

  // ── Regular referral tasks (r200/r500 excluded) ──
  const REGULAR_TASKS = REF_TASKS.filter(t=>!['r200','r500'].includes(t.id));
  document.getElementById('refTaskList').innerHTML=REGULAR_TASKS.map(t=>{
    const done=S.doneTasks.includes(t.id), can=totalRefs>=t.n&&!done;
    const inviteLbl=(T.inviteFriend||'Invite {n} Friend').replace('{n}',t.n)+(t.n>1?(T.friendsPlural||'s'):'');
    return`<div class="task-item">
      <div class="ticon"><img src="https://i.supaimg.com/ec27537b-aa6a-42cf-8ba1-d6850eeea36d/15fbd061-8b44-44ee-8d01-78162480b21c.png" style="width:48px;height:48px;object-fit:contain"></div>
      <div class="tinfo">
        <div class="tname">${inviteLbl}</div>
        <div class="trew">${BAM_IMG} ${fmt(t.bam)} Bamboo + <img src="https://i.supaimg.com/ec27537b-aa6a-42cf-8ba1-d6850eeea36d/561b20f9-2900-4845-a7ac-55242dc38c28.png" style="width:20px;height:20px;object-fit:contain;vertical-align:middle;border-radius:50%"> ${t.coins} Coins</div>
      </div>
      ${done?`<button class="tbtn done">✅ Done</button>`:can?`<button class="tbtn claim" onclick="claimRefTask('${t.id}')">${T.claimBtn2||'Claim'}</button>`:`<button class="tbtn done" style="background:rgba(255,255,255,.05)">${totalRefs}/${t.n}</button>`}
    </div>`;
  }).join('');

  // ── Active referral tasks ──
  const activeListEl = document.getElementById('refActiveTaskList');
  if(activeListEl){
    const depositedLbl = T.friendsDeposited||'Friends who deposited TON';
    activeListEl.innerHTML=REF_ACTIVE_TASKS.map(t=>{
      const done=S.doneTasks.includes(t.id), can=activeCount>=t.n&&!done;
      const activeLbl=(T.inviteActive||'💎 {n} Active Friend').replace('{n}',t.n)+(t.n>1?(T.friendsPlural||'s'):'');
      return`<div class="task-item" style="border-color:rgba(255,215,0,.3)">
        <div class="ticon"><img src="https://i.supaimg.com/ec27537b-aa6a-42cf-8ba1-d6850eeea36d/15fbd061-8b44-44ee-8d01-78162480b21c.png" style="width:48px;height:48px;object-fit:contain;filter:drop-shadow(0 0 6px gold)"></div>
        <div class="tinfo">
          <div class="tname" style="color:var(--coin)">${activeLbl}</div>
          <div style="font-size:10px;color:var(--muted);font-weight:600;margin-bottom:2px">${depositedLbl}</div>
          <div class="trew">${BAM_IMG} ${fmt(t.bam)} Bamboo + <img src="https://i.supaimg.com/ec27537b-aa6a-42cf-8ba1-d6850eeea36d/561b20f9-2900-4845-a7ac-55242dc38c28.png" style="width:20px;height:20px;object-fit:contain;vertical-align:middle;border-radius:50%"> ${t.coins} Coins</div>
        </div>
        ${done?`<button class="tbtn done">✅ Done</button>`:can?`<button class="tbtn claim" style="background:linear-gradient(135deg,#f9a825,#e65100)" onclick="claimRefTask('${t.id}')">${T.claimBtn2||'Claim'}</button>`:`<button class="tbtn done" style="background:rgba(255,215,0,.07);color:var(--coin)">${activeCount}/${t.n}</button>`}
      </div>`;
    }).join('');
  }
  renderSocTasks();
}

function switchTTab(el,t){
  document.querySelectorAll('.ttab').forEach(x=>x.classList.remove('active'));
  document.querySelectorAll('.tcont').forEach(x=>x.classList.remove('active'));
  el.classList.add('active');
  document.getElementById(`tc${t.charAt(0).toUpperCase()+t.slice(1)}`).classList.add('active');
  // Hide fab — switchSocTab will show it again if community is selected
  hideFab();
}
async function claimRefTask(id){
  if(_taskInFlight.has(id)) return; // Fix 1
  if(!debounce('claimRef_'+id)) return;
  _taskInFlight.add(id);
  try{
    const t=REF_TASKS.find(x=>x.id===id)||REF_ACTIVE_TASKS.find(x=>x.id===id);
    if(!t) return;
    api('claimTask',{taskId:id}).catch(()=>{});
    S.doneTasks.push(id);
    S.user.bamboo=(S.user.bamboo||0)+t.bam;
    S.user.coins=(S.user.coins||0)+t.coins;
    updateUI(); renderTasks();
    showNotif(`🎉 +${fmt(t.bam)} Bamboo +${t.coins} Coins`,'s');
  }finally{_taskInFlight.delete(id);}
}
async function doDbTask(tid,link,type,cat){
  if(_taskInFlight.has(tid)){showNotif('⏳ Already processing...','w');return;} // Fix 1
  if(!debounce('task_'+tid)) return;
  _taskInFlight.add(tid);
  renderSocTasks();
  if(link&&link.startsWith('https://t.me/')) window.open(link,'_blank','noopener');
  showNotif('⏳ Verifying...','i');
  setTimeout(async()=>{
    try{
      const r=await api('verifyTask',{taskId:tid,taskType:type,taskCategory:cat});
      S.doneTasks.push(tid);
      if(r.bambooAdded) S.user.bamboo=(S.user.bamboo||0)+r.bambooAdded;
      updateUI(); renderTasks();
      showNotif(`🎉 +${fmt(r.bambooAdded||0)} Bamboo Task done!`,'s');
    }catch(e){
      showNotif(`❌ ${e.message||'Verification failed'}`,'e');
    }finally{
      _taskInFlight.delete(tid);
      renderSocTasks();
    }
  },3000);
}

/* ════ ADD TASK MODAL ════ */
let _atType='channel';
const TASK_COINS_PER_USER=60; // 100 users = 6,000 Coins | 500 users = 30,000 Coins
const MIN_TASK_TARGET=100;
let _submitInFlight=false; // Fix 1

function setTaskType(t){
  _atType=t;
  const sel='flex:1;padding:9px;border-radius:10px;border:2px solid var(--bamboo);background:rgba(124,179,66,.2);color:var(--bamboo);font-size:13px;font-weight:800;cursor:pointer';
  const unsel='flex:1;padding:9px;border-radius:10px;border:1px solid var(--border);background:transparent;color:var(--muted);font-size:13px;font-weight:800;cursor:pointer';
  document.getElementById('atTypeChannel').style.cssText=t==='channel'?sel:unsel;
  document.getElementById('atTypeBot').style.cssText=t==='bot'?sel:unsel;
  // Fix 5: show bot-admin hint only for channel
  const hint=document.getElementById('atBotHint');
  if(hint) hint.style.display=t==='channel'?'block':'none';
  updAtCost();
}
function setAtTarget(v){document.getElementById('atTarget').value=v;updAtCost();}
function updAtCost(){
  const tgt=parseInt(document.getElementById('atTarget').value)||0;
  document.getElementById('atCostPreview').textContent=fmt(tgt*TASK_COINS_PER_USER)+' Coins'; // Fix 2
}
async function submitAddTask(){
  if(_submitInFlight) return; // Fix 1
  if(!debounce('submitTask')) return;
  const link=(document.getElementById('atLink').value||'').trim();
  const target=parseInt(document.getElementById('atTarget').value)||0;
  const st=document.getElementById('atStatus');
  st.style.display='block';st.style.color='var(--muted)';st.textContent='⏳ Checking...';
  if(!link.includes('t.me/')){st.style.color='#ff8a80';st.textContent='❌ Invalid Telegram link';return;}
  if(target<MIN_TASK_TARGET){st.style.color='#ff8a80';st.textContent=`❌ Min ${MIN_TASK_TARGET} users`;return;}
  const cost=target*TASK_COINS_PER_USER;
  if((S.user.coins||0)<cost){st.style.color='#ff8a80';st.textContent=`❌ Need ${fmt(cost)} Coins (have ${fmt(S.user.coins||0)})`;return;}
  st.style.display='none';
  // Show admin confirmation modal
  showAdminConfirmModal(link, target, cost);
}

function showAdminConfirmModal(link, target, cost){
  const lang=localStorage.getItem('pandaLang')||'en';
  const T=TRANSLATIONS[lang]||TRANSLATIONS['en'];
  const isRtl=lang==='ar';
  const existing=document.getElementById('adminConfirmModal');
  if(existing) existing.remove();
  const modal=document.createElement('div');
  modal.id='adminConfirmModal';
  modal.style.cssText='position:fixed;inset:0;z-index:10000;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,.82);backdrop-filter:blur(8px);padding:20px;animation:fi .2s ease';
  modal.innerHTML=`
    <div style="background:linear-gradient(145deg,rgba(10,28,10,.98),rgba(6,18,6,.98));border:1px solid rgba(255,165,0,.4);border-radius:24px;padding:26px 20px;max-width:340px;width:100%;text-align:center;box-shadow:0 0 40px rgba(255,165,0,.2);direction:${isRtl?'rtl':'ltr'}">
      <div style="font-size:50px;margin-bottom:12px">⚠️</div>
      <div style="font-size:17px;font-weight:800;color:#ffa726;margin-bottom:10px">${T.taskConfirmTitle||'Important Confirmation'}</div>
      <div style="height:1px;background:linear-gradient(90deg,transparent,rgba(255,165,0,.3),transparent);margin-bottom:14px"></div>
      <div style="background:rgba(255,100,0,.08);border:1px solid rgba(255,100,0,.25);border-radius:14px;padding:14px;margin-bottom:14px;font-size:13px;font-weight:700;color:#ffcc80;line-height:1.7;text-align:${isRtl?'right':'left'}">
        ${T.taskConfirmBody||'🤖 You must add <b style="color:#fff">@PandaBamboBot</b> as admin in your channel <b>before</b> creating the task.<br><br>⛔ If the bot is not admin, <b style="color:#ff8a80">the task will be deleted and your balance will NOT be refunded.</b>'}
      </div>
      <div style="font-size:12px;color:var(--muted);margin-bottom:16px">${T.taskConfirmChannel||'Channel:'} <b style="color:var(--bamboo)">${esc(link)}</b><br>${T.taskConfirmCost||'Cost:'} <b style="color:var(--coin)">${fmt(cost)} Coins</b></div>
      <div style="display:flex;gap:10px">
        <button onclick="document.getElementById('adminConfirmModal').remove();openModal('addTaskModal')" style="flex:1;padding:13px;background:rgba(255,255,255,.07);border:1px solid rgba(255,255,255,.15);border-radius:12px;color:var(--muted);font-size:14px;font-weight:800;cursor:pointer;font-family:Fredoka,cursive">${T.cancelBtn||'Cancel'}</button>
        <button onclick="confirmAndCreateTask('${esc(link)}',${target},${cost})" style="flex:1;padding:13px;background:linear-gradient(135deg,#e65100,#bf360c);border:none;border-radius:12px;color:#fff;font-size:14px;font-weight:800;cursor:pointer;font-family:Fredoka,cursive;box-shadow:0 0 14px rgba(230,81,0,.4)">${T.taskConfirmBtn||'✅ Understood, Create Task'}</button>
      </div>
    </div>`;
  document.body.appendChild(modal);
  modal.addEventListener('click',e=>{if(e.target===modal)modal.remove();});
}

async function confirmAndCreateTask(link, target, cost){
  document.getElementById('adminConfirmModal')?.remove();
  closeModal('addTaskModal');
  if(_submitInFlight) return;
  _submitInFlight=true;
  try{
    await api('createTask',{type:_atType,link,targetUsers:target});
    S.user.coins=(S.user.coins||0)-cost;
    updateUI();
    showNotif('✅ Task created successfully!','s');
    setTimeout(()=>loadState(),1500);
  }catch(e){showNotif(`❌ ${e.message||'Failed'}`,'e');}
  finally{_submitInFlight=false;}
}

/* ════ EXCHANGE ════ */
/* ════ EXCHANGE ════ */
function swapMax(){
  document.getElementById('swapFromAmt').value=Math.floor(S.user.bamboo||0);
  updSwapCalc();
}
function updSwapCalc(){
  const a=parseInt(document.getElementById('swapFromAmt').value)||0;
  document.getElementById('swapToAmt').textContent=fmt(Math.floor(a/CFG.RATE));
}
function updSwapBals(){
  document.getElementById('swapFromBal').textContent=`Balance: ${fmt(S.user.bamboo||0)} Bamboo`;
  document.getElementById('swapToBal').textContent=`Balance: ${fmt(S.user.coins||0)} Coins`;
}
let _exchInFlight=false;
async function doExchange(){
  if(_exchInFlight) return;
  if(!debounce('exchange')) return;
  const a=parseInt(document.getElementById('swapFromAmt').value)||0;
  if(a<=0){showNotif('Enter amount!','e');return;}
  if(a<CFG.RATE){showNotif(`Min ${CFG.RATE} Bamboo!`,'e');return;}
  if(a>(S.user.bamboo||0)){showNotif('Not enough Bamboo!','e');return;}
  const coins=Math.floor(a/CFG.RATE);
  _exchInFlight=true;
  try{
    await api('exchange',{bambooAmount:a});
    S.user.bamboo-=a;
    S.user.coins=(S.user.coins||0)+coins;
    S.exchHist.unshift({b:a,c:coins,dir:'B→C',ts:Date.now()});
    document.getElementById('swapFromAmt').value='';
    document.getElementById('swapToAmt').textContent='0';
    updateUI(); renderExchHist();
    showNotif(`⚡ ${fmt(a)} Bamboo → ${fmt(coins)} Coins`,'s');
  }catch(e){showNotif(`❌ ${e.message||'Failed'}`,'e');}
  finally{_exchInFlight=false;}
}
function renderExchHist(){
  const el=document.getElementById('exchHist');
  if(!el) return;
  if(!S.exchHist.length){el.innerHTML='<div class="hist-empty">No conversions yet</div>';return;}
  el.innerHTML=S.exchHist.slice(0,30).map(h=>{
    // Fix 2: handle both local (b/c) and DB format (bam/coins) + always show real values
    const bamAmt = h.b   !== undefined ? h.b   : (h.bam   || 0);
    const coiAmt = h.c   !== undefined ? h.c   : (h.coins || 0);
    const dir    = h.dir || 'B→C';
    const isB2C  = dir==='B→C';
    const date   = h.d || (h.ts ? new Date(h.ts).toLocaleDateString() : '');
    const fromAmt= isB2C ? fmt(bamAmt) : fmt(coiAmt);
    const toAmt  = isB2C ? fmt(coiAmt) : fmt(bamAmt);
    const BAM_ICON=`<img src="https://i.supaimg.com/ec27537b-aa6a-42cf-8ba1-d6850eeea36d/d7e19f8c-7876-4dc6-8542-d4f615704e46.png" style="width:13px;height:13px;object-fit:contain;vertical-align:middle">`;
    const fromLbl= isB2C ? `${BAM_ICON} Bamboo` : 'Coins';
    const toLbl  = isB2C ? 'Coins' : `${BAM_ICON} Bamboo`;
    return`<div class="hist-row" style="flex-direction:column;align-items:flex-start;gap:2px">
      <div style="display:flex;justify-content:space-between;width:100%">
        <span class="hist-l">${esc(dir)} · ${esc(date)}</span>
        <span style="font-size:12px;font-weight:800;color:var(--bamboo)">${toAmt} ${toLbl}</span>
      </div>
      <span style="font-size:11px;color:var(--muted);font-weight:500">From: ${fromAmt} ${fromLbl}</span>
    </div>`;
  }).join('');
}

/* ════ WITHDRAW ════ */
function updWdPrev(){
  const a=parseFloat(document.getElementById('wdAmt').value)||0;
  document.getElementById('wdTonVal').textContent=(a*CFG.TON_PER_COIN).toFixed(4);
}
function goToTasksPartner(){
  document.querySelectorAll('.ni').forEach(n=>n.classList.remove('active'));
  document.querySelectorAll('.sec').forEach(s=>s.classList.remove('active'));
  const tn=document.querySelector('.ni[data-s="sectionTasks"]');
  if(tn) tn.classList.add('active');
  document.getElementById('sectionTasks').classList.add('active');
  // Switch to social → partner
  const stab=document.querySelector('.ttab[data-t="social"]');
  if(stab) switchTTab(stab,'social');
  switchSocTab('partner');
  hideFab();
}

async function doWithdraw(){
  if(!debounce('withdraw')) return;
  const addr=(document.getElementById('wdAddr').value||'').trim();
  const amt=parseFloat(document.getElementById('wdAmt').value)||0;
  const u=S.user;
  if(!addr||addr.length<10){showNotif('Enter valid TON address!','e');return;}
  if(amt<CFG.MIN_WD){showNotif(`Min ${CFG.MIN_WD} Coins!`,'e');return;}
  if(amt>(u.coins||0)){showNotif('Not enough Coins!','e');return;}

  // Fix 9+10: check partner tasks locally first (fast feedback)
  const partnerTasks=S.tasks?.partner||[];
  const missingPartner=partnerTasks.filter(t=>t.status==='active'&&!S.doneTasks.includes(t.id));
  if(missingPartner.length>0){
    showNotif(`❌ Complete all Partner tasks first (${missingPartner.length} remaining)`,'e');
    setTimeout(()=>goToTasksPartner(), 5000);
    return;
  }

  try{
    // Get device fingerprint (hardware-based, survives VPN/IP change)
    const fp = await getOrComputeFp();
    const res=await api('withdraw',{address:addr,amount:amt,deviceFingerprint:fp});
    u.coins-=amt;
    S.wdHist.unshift({amt,addr,ts:Date.now(),status:'pending'});
    document.getElementById('wdAddr').value='';
    document.getElementById('wdAmt').value='';
    updWdPrev(); updateUI(); renderWdHist();
    showNotif(`✅ Withdrawal requested: ${fmt(amt)} Coins`,'s');
  }catch(e){
    const msg=e.message||'';
    const errCode=e.errorCode||'';
    if(errCode==='MULTI_ACCOUNT'||msg.includes('MULTI_ACCOUNT')){
      const lang=localStorage.getItem('pandaLang')||'en';
      const T=TRANSLATIONS[lang]||TRANSLATIONS['en'];
      showNotif(T.multiAccount||'⚠️ Multiple accounts detected — one device per account 🐼','e');
    } else {
      showNotif(`❌ ${msg}`,'e');
    }
    if(msg.includes('partner tasks')||msg.includes('PARTNER_TASKS')){
      setTimeout(()=>goToTasksPartner(), 5000);
    }
  }
}

function showDepositRequiredModal(){
  const lang=localStorage.getItem('pandaLang')||'en';
  const t=TRANSLATIONS[lang]||TRANSLATIONS['en'];
  const isRtl=lang==='ar';

  // Remove existing modal if any
  const existing=document.getElementById('depositReqModal');
  if(existing) existing.remove();

  const modal=document.createElement('div');
  modal.id='depositReqModal';
  modal.style.cssText=`
    position:fixed;inset:0;z-index:9999;
    display:flex;align-items:center;justify-content:center;
    background:rgba(0,0,0,.78);backdrop-filter:blur(8px);
    animation:fi .25s ease;
    padding:20px;
  `;
  modal.innerHTML=`
    <div style="
      background:linear-gradient(145deg,rgba(10,28,10,.97),rgba(6,18,6,.97));
      border:1px solid rgba(239,83,80,.35);
      border-radius:24px;
      padding:28px 22px;
      max-width:340px;width:100%;
      text-align:center;
      box-shadow:0 0 40px rgba(239,83,80,.2),0 20px 60px rgba(0,0,0,.6);
      direction:${isRtl?'rtl':'ltr'};
      position:relative;
    ">
      <!-- Close btn -->
      <button onclick="document.getElementById('depositReqModal').remove()" style="
        position:absolute;top:14px;${isRtl?'left':'right'}:14px;
        background:rgba(255,255,255,.08);border:none;border-radius:50%;
        width:28px;height:28px;color:rgba(255,255,255,.5);font-size:16px;
        cursor:pointer;display:flex;align-items:center;justify-content:center;
      ">×</button>

      <!-- Icon -->
      <div style="font-size:56px;margin-bottom:14px;filter:drop-shadow(0 0 16px rgba(239,83,80,.5))">🔒</div>

      <!-- Title -->
      <div style="font-size:18px;font-weight:800;color:#ff8a80;margin-bottom:10px;line-height:1.3">
        ${lang==='ar'?'السحب مقفل':'Withdrawal Locked'}
      </div>

      <!-- Divider -->
      <div style="height:1px;background:linear-gradient(90deg,transparent,rgba(239,83,80,.3),transparent);margin-bottom:14px"></div>

      <!-- Body — 3 lines -->
      <div style="display:flex;flex-direction:column;gap:9px;margin-bottom:20px">
        <div style="
          background:rgba(239,83,80,.07);border:1px solid rgba(239,83,80,.18);
          border-radius:12px;padding:10px 12px;
          font-size:13px;font-weight:700;color:#ff8a80;line-height:1.5;
        ">
          ${_depReqLine1(lang)}
        </div>
        <div style="
          background:rgba(0,212,255,.06);border:1px solid rgba(0,212,255,.18);
          border-radius:12px;padding:10px 12px;
          font-size:13px;font-weight:700;color:#00D4FF;line-height:1.5;
        ">
          ${_depReqLine2(lang)}
        </div>
        <div style="
          background:rgba(124,179,66,.06);border:1px solid rgba(124,179,66,.18);
          border-radius:12px;padding:8px 12px;
          font-size:12px;font-weight:600;color:var(--muted);line-height:1.5;
        ">
          ${_depReqLine3(lang)}
        </div>
      </div>

      <!-- CTA Button -->
      <button onclick="document.getElementById('depositReqModal').remove();goToFinanceDeposit();" style="
        width:100%;padding:14px;
        background:linear-gradient(135deg,#1a6ed8,#0d47a1);
        border:none;border-radius:14px;
        color:#fff;font-size:15px;font-weight:800;
        cursor:pointer;
        box-shadow:0 0 18px rgba(0,100,255,.4);
        display:flex;align-items:center;justify-content:center;gap:8px;
        font-family:'Fredoka',cursive;
      ">
        💎 ${t.depositRequiredBtn||'Deposit Now'}
      </button>
    </div>
  `;

  // Auto-redirect after 4 seconds
  const timer=setTimeout(()=>{
    if(document.getElementById('depositReqModal')){
      modal.remove();
      goToFinanceDeposit();
    }
  }, 4000);

  // Cancel auto-redirect if user closes manually
  modal.querySelector('button[onclick*="remove"]').addEventListener('click',()=>clearTimeout(timer));

  document.body.appendChild(modal);
  // Close on backdrop click
  modal.addEventListener('click',e=>{if(e.target===modal){clearTimeout(timer);modal.remove();}});
}

function _depReqLine1(lang){
  const m={
    ar:'⛔ السحب متاح فقط للمستخدمين الذين قاموا بالإيداع',
    en:'⛔ Withdrawals are only available for depositors',
    ru:'⛔ Вывод доступен только для пополнивших счёт',
    es:'⛔ Los retiros solo están disponibles para quienes han depositado',
    fr:'⛔ Les retraits sont réservés aux utilisateurs ayant déposé',
  };
  return m[lang]||m['en'];
}
function _depReqLine2(lang){
  const m={
    ar:'💎 أودِع 1 TON على الأقل لتفعيل السحب',
    en:'💎 Deposit at least 1 TON to unlock withdrawals',
    ru:'💎 Пополните счёт хотя бы на 1 TON для разблокировки',
    es:'💎 Deposita al menos 1 TON para desbloquear los retiros',
    fr:'💎 Effectuez un dépôt d\'au moins 1 TON pour débloquer',
  };
  return m[lang]||m['en'];
}
function _depReqLine3(lang){
  const m={
    ar:'🔄 سيتم توجيهك لصفحة الإيداع تلقائياً خلال 4 ثوانٍ...',
    en:'🔄 Redirecting to deposit page in 4 seconds...',
    ru:'🔄 Перенаправление на страницу пополнения через 4 секунды...',
    es:'🔄 Redirigiendo a la página de depósito en 4 segundos...',
    fr:'🔄 Redirection vers la page de dépôt dans 4 secondes...',
  };
  return m[lang]||m['en'];
}
function renderWdHist(){
  const el=document.getElementById('wdHist');
  if(!el) return;
  if(!S.wdHist.length){el.innerHTML='<div class="hist-empty">No withdrawals yet</div>';return;}
  el.innerHTML=S.wdHist.slice(0,20).map((h,idx)=>{
    // Normalise legacy status values from old DB records
    const rawStatus = (h.status||'pending').toLowerCase();
    const normStatus = rawStatus==='paid'?'approved' : rawStatus==='failed'?'rejected' : rawStatus;
    const sc={approved:'sb-approved',pending:'sb-pending',rejected:'sb-rejected'}[normStatus]||'sb-pending';
    const statusIcon={approved:'✅',pending:'⏳',rejected:'❌'}[normStatus]||'⏳';
    const statusColor={approved:'var(--neon-green)',pending:'var(--coin)',rejected:'#ff8a80'}[normStatus]||'var(--coin)';
    const statusText={approved:'Approved',pending:'Pending',rejected:'Rejected'}[normStatus]||normStatus.charAt(0).toUpperCase()+normStatus.slice(1);
    const tonVal=((h.amt||0)*CFG.TON_PER_COIN).toFixed(4);
    const amt=h.amt||0;
    // Fix date: always use en-US locale to avoid RTL/Arabic date display issues
    const ts=h.ts||null;
    const dateStr=ts
      ? new Date(ts).toLocaleDateString('en-US',{day:'2-digit',month:'short',year:'numeric'})
      : (h.d ? new Date(h.d).toLocaleDateString('en-US',{day:'2-digit',month:'short',year:'numeric'}) : '—');
    return`<div style="background:linear-gradient(135deg,rgba(6,20,6,.9),rgba(0,0,0,.6));border:1px solid rgba(255,215,0,.2);border-radius:16px;padding:14px 16px;margin-bottom:10px;position:relative;overflow:hidden;box-shadow:0 4px 20px rgba(0,0,0,.4)">
      <!-- glow line top -->
      <div style="position:absolute;top:0;left:0;right:0;height:2px;background:linear-gradient(90deg,transparent,${statusColor},transparent);opacity:.6"></div>
      <!-- Row 1: amount + status -->
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px">
        <div style="display:flex;align-items:center;gap:8px">
          <span style="font-size:22px">💸</span>
          <div>
            <div style="font-size:22px;font-weight:800;color:var(--coin);line-height:1">${fmt(amt)}</div>
            <div style="font-size:10px;color:var(--muted);font-weight:600;margin-top:1px">Coins</div>
          </div>
        </div>
        <div style="display:flex;flex-direction:column;align-items:flex-end;gap:4px">
          <span class="stat-badge ${sc}" style="font-size:11px;padding:4px 12px">${statusIcon} ${statusText}</span>
        </div>
      </div>
      <!-- Divider -->
      <div style="height:1px;background:rgba(255,255,255,.06);margin-bottom:10px"></div>
      <!-- Row 2: details — TON / Date / Coins value -->
      <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:6px">
        <div style="background:rgba(0,0,0,.3);border-radius:10px;padding:7px 9px;text-align:center">
          <div style="font-size:9px;color:var(--muted);font-weight:600;margin-bottom:2px">💎 TON</div>
          <div style="font-size:13px;font-weight:800;color:#00D4FF">${tonVal}</div>
        </div>
        <div style="background:rgba(0,0,0,.3);border-radius:10px;padding:7px 9px;text-align:center">
          <div style="font-size:9px;color:var(--muted);font-weight:600;margin-bottom:2px">📅 Date</div>
          <div style="font-size:11px;font-weight:800;color:var(--text);direction:ltr">${esc(dateStr)}</div>
        </div>
        <div style="background:rgba(0,0,0,.3);border-radius:10px;padding:7px 9px;text-align:center">
          <div style="font-size:9px;color:var(--muted);font-weight:600;margin-bottom:2px">🪙 Amount</div>
          <div style="font-size:13px;font-weight:800;color:var(--coin)">${fmt(amt)}</div>
        </div>
      </div>
    </div>`;
  }).join('');
}

/* ════ FINANCE NAV ════ */
function switchFinTab(el,t){
  document.querySelectorAll('.ftab').forEach(x=>x.classList.remove('active'));
  document.querySelectorAll('.ftcont').forEach(x=>x.classList.remove('active'));
  el.classList.add('active');
  document.getElementById(`ft-${t}`).classList.add('active');
  if(t==='withdraw' && S._dataLoaded) loadSeasonAlloc();
}
function goToFinanceDeposit(){
  document.querySelectorAll('.ni').forEach(n=>n.classList.remove('active'));
  document.querySelectorAll('.sec').forEach(s=>s.classList.remove('active'));
  const fn=document.querySelector('.ni[data-s="sectionFinance"]');
  if(fn) fn.classList.add('active');
  document.getElementById('sectionFinance').classList.add('active');
  const dt=document.querySelector('.ftab[data-ft="deposit"]');
  if(dt) switchFinTab(dt,'deposit');
  document.getElementById('depositUserIdDisplay').textContent=S.userId||'???';
}
function goToFinanceWithdraw(){
  document.querySelectorAll('.ni').forEach(n=>n.classList.remove('active'));
  document.querySelectorAll('.sec').forEach(s=>s.classList.remove('active'));
  const fn=document.querySelector('.ni[data-s="sectionFinance"]');
  if(fn) fn.classList.add('active');
  document.getElementById('sectionFinance').classList.add('active');
  const wt=document.querySelector('.ftab[data-ft="withdraw"]');
  if(wt) switchFinTab(wt,'withdraw');
  if(S._dataLoaded) loadSeasonAlloc();
}

/* ════ REFERRAL ════ */
function updateRefUI(){
  // Fix 7: use bot app deep link
  const link=`${CFG.BOT_APP_LINK}?startapp=${encodeURIComponent(S.userId||'000')}`;
  document.getElementById('refLinkInp').value=link;
  document.getElementById('depositUserIdDisplay').textContent=esc(S.userId||'...');
  const cntEl=document.getElementById('totalRefsDisp');
  if(cntEl) cntEl.textContent=`${S.refs.length} Friends`;
  const listEl=document.getElementById('recentRefsList');
  if(listEl){
    if(!S.refs.length){
      listEl.innerHTML=`<div class="hist-empty">No referrals yet</div>`;
    } else {
      listEl.innerHTML=S.refs.slice(0,20).map(r=>`
        <div class="ref-list-item">
          <div class="rli-av">${r.photo?`<img src="${esc(r.photo)}" onerror="this.parentElement.innerHTML='🐼'">` :'🐼'}</div>
          <div class="rli-info">
            <div class="rli-name">${esc(r.name||'Friend')}</div>
            <div class="rli-date">${esc(r.date||'Joined recently')}</div>
          </div>
          <div class="rli-earn">+${fmt(r.earned||0)} <img src="${BAM_URL}" style="width:14px;height:14px;object-fit:contain;vertical-align:middle"></div>
        </div>`).join('');
    }
  }
}
function copyRefLink(){
  const v=document.getElementById('refLinkInp').value;
  navigator.clipboard.writeText(v)
    .then(()=>showNotif('✅ Link copied!','s'))
    .catch(()=>{document.getElementById('refLinkInp').select();document.execCommand('copy');showNotif('✅ Link copied!','s');});
}

/* ════ DEPOSIT PREVIEW ════ */
const TON_TO_BAMBOO=50000;
function setDepAmt(v){document.getElementById('depositAmountInput').value=Math.max(1,v);updDepPreview();}
function updDepPreview(){
  const ton=parseFloat(document.getElementById('depositAmountInput').value)||0;
  const bam=Math.floor(ton*TON_TO_BAMBOO);
  const el=document.getElementById('depBambooPreview');
  if(el) el.innerHTML=`<img src="https://i.supaimg.com/ec27537b-aa6a-42cf-8ba1-d6850eeea36d/d7e19f8c-7876-4dc6-8542-d4f615704e46.png" style="width:20px;height:20px;object-fit:contain"> ${fmt(bam)} Bamboo`;
}

/* ════ TON CONNECT ════ */
async function initTON(){
  try{
    if(window.TON_CONNECT_UI){
      S.tonUI=new TON_CONNECT_UI.TonConnectUI({
        manifestUrl:`${CFG.API_URL}/tonconnect-manifest.json`,
        uiPreferences:{theme:'DARK'}
      });
      S.tonUI.onStatusChange(w=>w?onWConn(w):onWDisc());
      setTimeout(()=>{if(S.tonUI.connected)S.tonUI.getWallets();},500);
    }
  }catch(e){console.error('TON:',e);}
}
function onWConn(w){
  S.wallet={address:w.account.address,chain:w.account.chain,appName:w.device.appName};
  const sh=`${S.wallet.address.substring(0,6)}...${S.wallet.address.slice(-4)}`;
  document.getElementById('walletAddressDisplay').textContent=`${sh} · ${S.wallet.appName}`;
  document.getElementById('connectWalletBtn').innerHTML='<i class="fas fa-unlink"></i> Disconnect';
  document.getElementById('connectWalletBtn').onclick=disconnectWallet;
  document.getElementById('submitDepositBtn').disabled=false;
}
function onWDisc(){
  S.wallet=null;
  document.getElementById('walletAddressDisplay').textContent='Not connected';
  document.getElementById('connectWalletBtn').innerHTML='<i class="fas fa-plug"></i> Connect';
  document.getElementById('connectWalletBtn').onclick=connectWallet;
  document.getElementById('submitDepositBtn').disabled=true;
}
async function connectWallet(){if(S.tonUI)await S.tonUI.openModal();}
async function disconnectWallet(){if(S.tonUI)await S.tonUI.disconnect();}

window.initiateDeposit=async function(){
  if(!S.wallet){alert('Connect wallet first');return;}
  const amt=parseFloat(document.getElementById('depositAmountInput').value);
  if(!amt||amt<1){alert('Minimum 1 TON');return;}
  if(amt>1000){alert('Amount too large');return;}
  try{
    const comment=String(S.userId);
    const nano=String(Math.floor(amt*1e9));
    if(!window.TonWeb) throw new Error('TonWeb not loaded');
    const TW=window.TonWeb; new TW();
    const cell=new TW.boc.Cell();
    cell.bits.writeUint(0,32); cell.bits.writeString(comment);
    const boc=await cell.toBoc(false);
    const payload=TW.utils.bytesToBase64(boc);
    const tx={validUntil:Math.floor(Date.now()/1000)+600,messages:[{address:CFG.DEPOSIT_WALLET,amount:nano,payload}]};
    const result=await S.tonUI.sendTransaction(tx);
    // Show pending message — balance will be credited by server within 3 minutes
    const sd=document.getElementById('depositStatus');
    sd.classList.add('visible');
    sd.querySelector('.txsi').innerHTML='⏳';
    sd.querySelector('.txsm').innerHTML='Transaction sent!';
    document.getElementById('depositStatusDetail').textContent='Your balance will be added to your account within 3 minutes.';
    showNotif('✅ Transaction sent! Balance will be credited within 3 minutes','s');
    // Register deposit in DB (fire and forget — server monitors wallet independently)
    try{ await api('deposit',{amount:amt,txHash:result.boc,comment}); }catch(_){}
  }catch(e){
    const sd=document.getElementById('depositStatus');
    sd.classList.add('visible');
    sd.querySelector('.txsi').innerHTML='❌';
    sd.querySelector('.txsm').innerHTML=e.message?.includes('rejected')?'Transaction rejected':'Transaction failed';
    document.getElementById('depositStatusDetail').textContent=e.message||'Please try again';
  }
};
async function handleDepOk(result,amt,comment){
  try{
    const d=await api('deposit',{amount:amt,txHash:result.boc,comment});
    const sd=document.getElementById('depositStatus');
    sd.classList.add('visible');
    sd.querySelector('.txsi').innerHTML='⏳';
    sd.querySelector('.txsm').innerHTML='Transaction sent!';
    document.getElementById('depositStatusDetail').textContent='Waiting for confirmation (~1 min)...';
    startDepVerify(d.depositId,result.boc);
  }catch(e){console.error(e);}
}
function startDepVerify(depId,txHash){
  if(S.depCheckInt) clearInterval(S.depCheckInt);
  if(!depId) return;
  let attempts=0;
  const prevBamboo = S.user?.bamboo||0;
  S.depCheckInt=setInterval(async()=>{
    attempts++;
    try{
      // Poll getState — السيرفر الخارجي هيضيف الرصيد تلقائياً
      const r=await api('getState',{});
      if(r && r.user && r.user.bamboo > prevBamboo){
        clearInterval(S.depCheckInt);
        const diff = r.user.bamboo - prevBamboo;
        const sd=document.getElementById('depositStatus');
        if(sd){
          sd.querySelector('.txsi').innerHTML='✅';
          sd.querySelector('.txsm').innerHTML='Deposit confirmed!';
          document.getElementById('depositStatusDetail').textContent=`+${diff.toLocaleString()} Bamboo added`;
        }
        showNotif(`💰 Deposit confirmed! +${diff.toLocaleString()} Bamboo`,'s');
        loadState();
        setTimeout(()=>sd&&sd.classList.remove('visible'),3000);
      }
    }catch(e){}
    if(attempts>=36) clearInterval(S.depCheckInt); // توقف بعد 6 دقايق
  },10000);
}

/* ════ MODALS ════ */
function openModal(id){
  if(id==='upgradeModal') buildUpgradeContent();
  else if(id==='infoModal') buildInfoContent();
  document.getElementById(id).classList.add('active');
}
function closeModal(id){document.getElementById(id).classList.remove('active');}
document.querySelectorAll('.modal').forEach(m=>m.addEventListener('click',e=>{if(e.target===m)m.classList.remove('active');}));
function buildInfoContent(){
  const u=S.user, lv=u.tankLevel||1, cfg=TANK_LVS[lv];
  const eff=u.miningRate||0; // no speedBonus
  document.getElementById('infoContent').innerHTML=`
    <div class="info-row"><div class="il">⚡ Mining Rate</div><div class="iv">${fmt(eff)} Bamboo/hr</div></div>
    <div class="info-row"><div class="il">📦 Tank Capacity</div><div class="iv">${fmt(cfg.cap)} Bamboo</div></div>
    <div class="info-row"><div class="il">🔧 Total Machines</div><div class="iv">${Object.values(u.machines||{}).reduce((a,b)=>a+b,0)}</div></div>
    <div class="info-row"><div class="il">👥 Team Members</div><div class="iv">${S.refs.length}</div></div>`;
}

/* ════ HELPERS ════ */
function fmt(n){
  n=Math.floor(n||0);
  if(n>=1000000) return(n/1000000).toFixed(1)+'M';
  if(n>=1000)    return(n/1000).toFixed(1)+'K';
  return n.toString();
}
let _nt;
function showNotif(msg,type='i'){
  const el=document.getElementById('notif');
  if(!el) return;
  el.innerHTML=msg; el.className=`notif show ${type}`;
  clearTimeout(_nt); _nt=setTimeout(()=>el.classList.remove('show'),3200);
}

/* ════ ORBIT EQUIPMENT RENDER (Fix 2) ════ */
function renderOrbit(){
  const wrap=document.getElementById('orbitWrap');
  if(!wrap) return;
  wrap.querySelectorAll('.orbit-item').forEach(e=>e.remove());

  // Left arc top→bottom: 150°, 180°, 210°
  // Right arc top→bottom: 30°, 0°, 330°
  const R = 40;   // % — wider radius = more spacing between items
  const HALF = 12; // half of 24% item width
  const angles = [150, 180, 210,   30, 0, 330];
  const machines = S.user.machines || {};

  ITEMS.forEach((it, i) => {
    const a = angles[i] * Math.PI / 180;
    // Position as % from top-left of wrap
    const cx = 50 + R * Math.cos(a);
    const cy = 50 + R * Math.sin(a);
    const owned = (machines[it.id] || 0) > 0;
    const div = document.createElement('div');
    div.className = 'orbit-item' + (owned ? ' owned' : '');
    div.title = it.name + (owned ? ` (×${machines[it.id]})` : '');
    // left/top as % minus half-item-size to center the item on the point
    div.style.cssText = `left:calc(${cx}% - ${HALF}%);top:calc(${cy}% - ${HALF}%)`;
    div.innerHTML = `<img src="${it.iconUrl}" alt="${esc(it.name)}">`;
    div.addEventListener('click', () => {
      const mktNav = document.querySelector('.ni[data-s="sectionMarket"]');
      if (mktNav) goNav(mktNav);
    });
    wrap.appendChild(div);
  });
}

/* Fix 8: spawn bamboo image particle instead of emoji */
function spawnPtc(){
  const p=document.createElement('img');
  p.src=BAM_URL;
  p.className='ptc';
  p.style.cssText=`left:${30+Math.random()*40}%;top:38%;width:24px;height:24px;object-fit:contain;font-size:0`;
  document.body.appendChild(p);
  setTimeout(()=>p.remove(),960);
}
function pandaClick(){
  const p=document.getElementById('pandaChar');
  if(p){p.style.transition='transform .12s';p.style.transform='scale(.86) rotate(9deg)';setTimeout(()=>{p.style.transform='';},220);}
  spawnPtc();
}

/* ════ LOADING SCREEN ════ */
function ldProgress(pct, msg){
  // Drive the 10 bamboo segments
  const segs = document.querySelectorAll('#ldSegs .ld-seg');
  const filled = Math.round((pct / 100) * segs.length);
  segs.forEach((s, i) => {
    if(i < filled) s.classList.add('active');
    else s.classList.remove('active');
  });
  const pctEl = document.getElementById('ldPct');
  if(pctEl) pctEl.textContent = Math.round(pct) + '%';
  const stat = document.getElementById('ldStatus');
  if(stat){ stat.textContent = msg; stat.style.color = ''; }
}
function ldHide(){
  const s = document.getElementById('loadingScreen');
  if(s){ s.classList.add('hidden'); setTimeout(()=>s.remove(), 700); }
}
function ldError(msg, retryLabel){
  retryLabel = retryLabel || '🔄 Retry';
  const stat = document.getElementById('ldStatus');
  if(stat){
    stat.innerHTML = msg.replace(/\n/g,'<br>');
    stat.style.color = '#ff8a80';
    stat.style.lineHeight = '1.7';
  }
  // Turn all segments red
  document.querySelectorAll('#ldSegs .ld-seg').forEach(s=>{
    s.classList.add('active');
    s.style.background = 'linear-gradient(180deg,#ef5350,#b71c1c)';
    s.style.borderColor = 'rgba(239,83,80,.8)';
    s.style.boxShadow   = '0 0 10px rgba(239,83,80,.6)';
  });
  const pctEl = document.getElementById('ldPct');
  if(pctEl){ pctEl.textContent = '⚠️'; pctEl.style.color = '#ff8a80'; }
  // Add retry button inside loading screen — DO NOT hide the screen
  const ld = document.getElementById('loadingScreen');
  if(ld && !document.getElementById('ldRetryBtn')){
    const btn = document.createElement('button');
    btn.id = 'ldRetryBtn';
    btn.textContent = retryLabel;
    btn.style.cssText = 'margin-top:22px;padding:12px 32px;background:linear-gradient(135deg,#ef5350,#b71c1c);border:none;border-radius:14px;color:#fff;font-size:15px;font-weight:800;cursor:pointer;font-family:Fredoka,cursive;box-shadow:0 4px 16px rgba(239,83,80,.5);';
    btn.onclick = ()=>{ location.reload(); };
    ld.appendChild(btn);
  }
  // ⛔ Loading screen stays visible — app NEVER opens with zero data
}

// Preload all item images + panda image
function preloadImages(){
  const urls=[
    'https://i.supaimg.com/ec27537b-aa6a-42cf-8ba1-d6850eeea36d/a12ebc07-aa51-4ea7-b3ca-cefe4dce2a9e.png',
    BAM_URL,
    ...ITEMS.map(i=>i.iconUrl),
  ];
  return Promise.all(urls.map(u=>new Promise(res=>{
    const img=new Image();img.onload=img.onerror=res;img.src=u;
  })));
}

/* ════ INIT ════ */
window.addEventListener('load',init);

// Smoothly animate progress to a target value
function ldAnimateTo(targetPct, msg, duration=600){
  const start = parseInt(document.getElementById('ldPct')?.textContent||'0');
  const steps = 30;
  const stepTime = duration / steps;
  let step = 0;
  return new Promise(resolve=>{
    const iv = setInterval(()=>{
      step++;
      const pct = start + (targetPct - start) * (step/steps);
      ldProgress(pct, msg);
      if(step >= steps){ clearInterval(iv); ldProgress(targetPct, msg); resolve(); }
    }, stepTime);
  });
}

async function init(){
  // Helper: get current lang translation
  function lt(key){ const lang=localStorage.getItem('pandaLang')||'en'; return (TRANSLATIONS[lang]||TRANSLATIONS['en'])[key]||TRANSLATIONS['en'][key]||key; }

  // Record start time — minimum 6 seconds total
  const startTime = Date.now();
  const MIN_LOADING_MS = 3000;

  // Step 1: Telegram setup
  ldProgress(0, lt('ldLoading'));
  if(window.Telegram?.WebApp){
    S.tg=window.Telegram.WebApp;
    S.tg.ready(); S.tg.expand();
    const u=S.tg.initDataUnsafe?.user;
    if(u){
      S.userId=String(u.id);
      if(u.photo_url){
        const av=document.getElementById('uavatar');
        if(av) av.innerHTML=`<img src="${esc(u.photo_url)}" onerror="this.parentElement.innerHTML='<div class=ap>🐼</div>'">`;
      }
    }
    S.startParam=(
      S.tg.initDataUnsafe?.start_param ||
      S.tg.initDataUnsafe?.startParam  ||
      ''
    ).toString().replace(/\D/g,'');
  }
  await ldAnimateTo(10, lt('ldConnecting'), 700);
  await new Promise(r=>setTimeout(r,400));

  // Step 1.5: Race servers — find fastest live server
  await ldAnimateTo(18, '🏎️ Finding fastest server...', 500);
  try{
    const authHdr = S.tg?.initData ? `Telegram ${S.tg.initData}` : null;
    await window._raceServersNow(authHdr);
    ldProgress(22, '✅ Server connected!');
  }catch(e){
    ldProgress(22, '⚠️ Using fallback server...');
  }
  await new Promise(r=>setTimeout(r,300));

  // Step 2: Preload images
  await ldAnimateTo(20, lt('ldAssets'), 600);
  await Promise.all([
    preloadImages().catch(()=>{}),
    new Promise(r=>setTimeout(r,800)), // min 0.8s on this step
  ]);
  await ldAnimateTo(40, lt('ldAssetsOk'), 500);
  await new Promise(r=>setTimeout(r,300));

  // Step 3: Load user data
  await ldAnimateTo(50, lt('ldConnecting'), 600);
  let loaded = false;
  let attempts = 0;
  const MAX_ATTEMPTS = 3;
  while(!loaded && attempts < MAX_ATTEMPTS){
    attempts++;
    try{
      ldProgress(50 + attempts*5, attempts===1 ? lt('ldConnected') : `${lt('ldRetrying')} (${attempts}/${MAX_ATTEMPTS})`);
      await loadState();
      if(S.user && S.userId) loaded=true;
      else throw new Error('No user data');
    }catch(e){
      console.warn(`Attempt ${attempts} failed:`,e.message);
      if(attempts < MAX_ATTEMPTS){
        ldProgress(50 + attempts*5, `${lt('ldBusy')} (${attempts}/${MAX_ATTEMPTS})`);
        await new Promise(r=>setTimeout(r,2000*attempts));
      }
    }
  }
  if(!loaded){
    ldError(lt('ldErrorMsg'), lt('ldRetryBtn'));
    return;
  }
  await ldAnimateTo(70, lt('ldConnected'), 500);
  await new Promise(r=>setTimeout(r,300));

  // Step 4: Render UI
  await ldAnimateTo(80, lt('ldBuilding'), 400);
  renderMarket();
  renderTasks();
  await new Promise(r=>setTimeout(r,300));

  // Step 5: Init TON + timers
  await ldAnimateTo(90, lt('ldWallet'), 400);
  setTimeout(()=>initTON(), 600);
  // Pre-compute device fingerprint in background
  getOrComputeFp().catch(()=>{});
  startTank();
  setInterval(()=>{ loadState(); }, 30000);
  await new Promise(r=>setTimeout(r,400));

  await ldAnimateTo(100, lt('ldReady'), 500);

  // Ensure minimum loading time (5-10s feel)
  const elapsed = Date.now() - startTime;
  if(elapsed < MIN_LOADING_MS){
    await new Promise(r=>setTimeout(r, MIN_LOADING_MS - elapsed));
  }

  setTimeout(()=>ldHide(), 700);
  // Apply saved language after UI ready
  const savedLang = localStorage.getItem('pandaLang');
  if(savedLang){
    const meta = {ar:['🇸🇦','AR'],en:['🇬🇧','EN'],ru:['🇷🇺','RU'],es:['🇪🇸','ES'],fr:['🇫🇷','FR']};
    if(meta[savedLang]) applyLang(savedLang, meta[savedLang][0], meta[savedLang][1]);
  }
}

/* ════ LANGUAGE SYSTEM ════ */
const TRANSLATIONS = {
  ar:{
    navHome:'الرئيسية',navMarket:'السوق',navTasks:'المهام',navFriends:'أصدقاء',navFinance:'مالية',
    labelCoins:'كوينز',labelBamboo:'بامبو',
    statAccrued:'المتراكم',statRateDay:'المعدل/يوم',statBambooDay:'بامبو/يوم',
    claimBtn:'جمع Bamboo',lvLabel:'مستوى ',
    tabDeposit:'💰 إيداع',tabWithdraw:'🌟 الموسم 2',tabExchange:'⚡ تحويل',
    tabReferralTxt:'إحالة',tabSocialTxt:'اجتماعي',
    tabPartner:'⭐ شريك',tabCommunity:'🌍 مجتمع',floatAdd:'➕ إضافة مهمة',
    friendsTitle:'الأصدقاء والإحالات',refProgTitle:'برنامج الإحالة',
    refCommission:'عمولة 20% عند شراء أصدقائك من السوق!',
    refLinkPh:'رابط الإحالة الخاص بك...',copyBtn:'نسخ',
    refNote:'📤 شارك هذا الرابط مع أصدقائك',
    recentRefs:'أحدث الإحالات',noReferrals:'لا إحالات بعد',
    marketTitle:'سوق التعدين',
    labelWallet:'المحفظة',notConnected:'غير متصل',connectBtn:'ربط',
    important:'مهم:',depositWarning1:'معرف المستخدم الخاص بك',
    depositWarning2:'يجب أن يكون التعليق الوحيد في المعاملة.',
    amountTON:'المبلغ (TON)',rateLabel:'السعر:',youWillReceive:'ستستلم:',
    depositBtn:'إيداع TON',processingDeposit:'جارٍ معالجة الإيداع...',
    freeTrial:'تجربة مجانية:',freeTrialDesc:'سحب مجاني واحد حتى 200 Coins.',
    freeTrialUsed:'انتهت التجربة المجانية. يرجى الإيداع للمتابعة.',
    tonWalletAddr:'عنوان محفظة TON',amountCoins:'المبلغ (Coins)',tonValue:'قيمة TON',
    withdrawBtn:'طلب سحب',withdrawHist:'📋 سجل السحب',noWithdrawals:'لا سحوبات بعد',
    swapFrom:'من',swapTo:'إلى',balance:'الرصيد:',maxBtn:'أقصى',
    swapRate:'📊 300 Bamboo = 10 Coins',exchangeNow:'⚡ تحويل الآن',
    exchangeHist:'📋 سجل التحويل',noConversions:'لا تحويلات بعد',
    helpTitle:'🐼 دليل Panda Bamboo',
    helpPayCh:'قناة\nالمدفوعات',helpNewsCh:'أخبار\nالبوت',helpSupport:'الدعم\nالفني',
    helpWelcomeTitle:'🎁 مكافأة الترحيب المجانية',
    helpWelcomeBody:'عند التسجيل لأول مرة تحصل تلقائياً على:<br><span style="color:#fff;font-weight:800">• 200 Coins</span> — عملة السحب الأساسية<br><span style="color:#fff;font-weight:800">• 100 Bamboo/يوم</span> — طاقة تعدين مجانية تبدأ فوراً',
    helpIdeaTitle:'💡 الفكرة الرئيسية',
    helpIdeaBody:'البوت مصنع بامبو افتراضي 🎋<br>⬅ تشتري آلات من السوق بـ <span style="color:var(--bamboo);font-weight:800">Bamboo</span><br>⬅ الآلات تنتج Bamboo تلقائياً في التانك<br>⬅ تحوّل Bamboo إلى <span style="color:var(--coin);font-weight:800">Coins</span> من صفحة Finance<br>⬅ تسحب Coins إلى محفظة TON 💎',
    helpPagesTitle:'🗂 شرح الصفحات',
    helpPageHome:'🏠 الرئيسية',helpPageHomeDesc:'تشوف الباندا وتانك التجميع ومعدل التعدين اليومي. اضغط Claim Bamboo لجمع ما تراكم.',
    helpPageMarket:'🛒 السوق',helpPageMarketDesc:'اشتري آلات تعدين بـ Bamboo. كل آلة تزيد إنتاجك اليومي.',
    helpPageTasks:'✅ المهام',helpPageTasksDesc:'أكمل مهام للحصول على Bamboo إضافي. مهام الإحالة تكافئك بـ Bamboo + Coins.',
    helpPageFriends:'👥 الأصدقاء',helpPageFriendsDesc:'شارك رابط الإحالة الخاص بك. تكسب <span style="color:var(--bamboo);font-weight:800">20%</span> عمولة من كل مشتريات صديقك.',
    helpPageFinance:'💰 المالية',helpPageFinanceDesc:'تحويل Bamboo → Coins، إيداع TON، وسحب Coins إلى محفظتك.',
    helpPricesTitle:'💲 الأسعار والتحويلات',
    helpDepositTON:'💎 إيداع TON',helpConvertBamboo:'⚡ تحويل Bamboo',
    helpWithdrawRate:'💸 سعر السحب',helpMinWithdraw:'📦 أقل مبلغ سحب',
    helpRefCommission:'👥 عمولة الإحالة',helpRefCommissionVal:'20% من مشتريات الصديق',
    helpAddTask:'➕ إضافة مهمة (100 عضو)',
    helpWdTitle:'📤 شروط السحب',
    helpWdBody:'<span style="color:var(--coin);font-weight:800">شروط السحب العامة:</span><br>• الحد الأدنى: <span style="color:#fff;font-weight:800">2,000 Coins (0.1 TON)</span><br>• يجب إكمال <span style="color:#fff;font-weight:800">مهام الشركاء</span> قبل السحب<br>• تحتاج محفظة TON صالحة<br>• يُعالَج تلقائياً خلال <span style="color:var(--neon-green);font-weight:800">1 إلى 3 دقائق</span><br>• تابع قناة <a href="https://t.me/PandaBambooPayouts" target="_blank" style="color:#00D4FF;font-weight:800">المدفوعات</a> للتأكد',
    upgTitle:'⬆️ ترقية التانك',miningInfoTitle:'⚡ معلومات التعدين',
    addTaskTitle:'➕ إضافة مهمة مجتمعية',
    taskCostFormula:'التكلفة = <strong style="color:var(--coin)">عدد المستخدمين × 60 Coins</strong>',
    taskCostNote:'الحد الأدنى: 100 مستخدم | 100 مستخدم = 6,000 Coins',
    taskTypeChannel:'قناة',taskTypeBot:'بوت',
    taskBotHint:'أضف البوت الخاص بنا كمشرف في قناتك أولاً:',
    taskLinkLabel:'رابط تيليجرام',taskLinkPh:'https://t.me/قناتك',
    taskTargetLabel:'عدد المستخدمين المستهدف (الحد الأدنى 100)',
    taskTotalCost:'التكلفة الإجمالية:',taskCreateBtn:'✅ إنشاء المهمة',
    wdMinHint:'⚠️ الحد الأدنى: 200 Coins',
    multiAccount:'⚠️ أنت تستخدم أكثر من حساب — العب بنزاهة 🐼',
    depositRequired:'⛔ السحب متاح فقط للمودعين\n\n💎 قم بإيداع TON واحد على الأقل لتفعيل السحب\n\n🔄 جارٍ تحويلك لصفحة الإيداع...',
    depositRequiredBtn:'💎 إيداع الآن',
    ldLoading:'جارٍ التحميل...',
    ldConnecting:'الاتصال بتيليجرام...',
    ldAssets:'تحميل الملفات...',
    ldAssetsOk:'تم تحميل الملفات!',
    ldFinding:'🏁 البحث عن أسرع سيرفر...',
    ldRacing:'⚡ السباق بين السيرفرات...',
    ldRetrying:'إعادة المحاولة...',
    ldBusy:'⏳ السيرفرات مشغولة، إعادة المحاولة...',
    ldConnected:'✅ متصل',
    ldBuilding:'بناء الواجهة...',
    ldWallet:'إعداد المحفظة...',
    ldReady:'جاهز! 🐼',
    ldErrorMsg:'⚠️ الخدمة مؤقتاً غير متاحة\nجميع السيرفرات مشغولة\nأعد تشغيل البوت بعد لحظات',
    ldRetryBtn:'🔄 إعادة المحاولة',
    tabRegularRef:'👥 إحالات',
    tabActiveRef:'💎 نشطة',
    refTotalLabel:'👥 إجمالي الإحالات',
    refActiveLabel:'💎 نشطة (أودعوا)',
    inviteFriend:'دعوة {n} صديق',
    friendsPlural:'',
    inviteActive:'💎 {n} صديق نشط',
    friendsDeposited:'أصدقاء أجروا إيداع TON',
    claimBtn2:'استلام',
    taskConfirmTitle:'تأكيد مهم قبل الإنشاء',
    taskConfirmBody:'🤖 يجب رفع البوت <b style="color:#fff">@PandaBamboBot</b> كمشرف في قناتك <b>قبل</b> إنشاء المهمة.<br><br>⛔ في حال عدم رفع البوت كمشرف، <b style="color:#ff8a80">سيتم حذف المهمة ولن يتم إرجاع الرصيد إليك.</b>',
    taskConfirmChannel:'القناة:',
    taskConfirmCost:'التكلفة:',
    taskConfirmBtn:'✅ فهمت، أنشئ المهمة',
    cancelBtn:'إلغاء',
    multiAccount:'⚠️ هذا الجهاز مرتبط بحساب آخر — حساب واحد لكل جهاز 🐼',
    compTitle:'المسابقات',
    compTabActive:'💎 الإحالات النشطة',
    compTabMining:'⚡ سرعة التعدين',
    compActiveTitle:'💎 مسابقة الإحالات النشطة',
    compActiveDesc:'أفضل 20 مستخدم لديهم أكثر إحالات نشطة (أجروا إيداع)',
    compMiningTitle:'⚡ مسابقة سرعة التعدين',
    compMiningDesc:'أفضل 20 مستخدم بأعلى معدل تعدين',
    compPrize:'المكافأة',
    compEnds:'ينتهي خلال',
    compWinners:'الفائزون',
    compMyScore:'نقاطك',
    compMyRank:'مرتبتك',
    compWinning:'أنت فائز!',
    compLeaderboard:'🏅 قائمة المتسابقين — أفضل 50',
    compEmpty:'لا متسابقين بعد. كن الأول!',
    compUnranked:'غير مصنف',
    compActiveScoreLbl:'إحالة نشطة',
    compMiningScoreLbl:'بامبو/يوم',
    loading:'جارٍ التحميل...',
    compHelpTitle:'دليل المسابقة',
    compHelpBody:'<b style="color:#ffa726">🏆 كيف تعمل المسابقة؟</b><br><br>📅 مدة كل مسابقة <b>10 أيام</b>.<br>🏅 الفائزون الأوائل <b>20 مستخدماً</b> يحصلون على مكافآت TON.<br><br><b style="color:#00D4FF">💎 مسابقة الإحالات النشطة</b><br>يُحسب عدد الأصدقاء الذين انضموا عبر رابطك <b>وقاموا بإيداع TON</b>.<br><br><b style="color:var(--bamboo)">⚡ مسابقة سرعة التعدين</b><br>يُحسب <b>معدل إنتاجك اليومي</b> من البامبو (Bamboo/يوم).<br><br><b style="color:var(--coin)">🎁 توزيع المكافآت</b><br>🥇 #1 → 50 TON<br>🥈 #2 → 40 TON<br>🥉 #3 → 30 TON<br>#4 → 20 TON | #5 → 10 TON<br>#6 → 9 | #7 → 8 | #8 → 7 | #9 → 6 | #10 → 5 TON<br>#11–15 → 2 TON لكل منهم<br>#16–20 → 1 TON لكل منهم',
    newRefNotif:'🎉 دعوت {name}! ستحصل على 20% من مشترياتهم',
    s2BadgeTxt:'قريباً',s2BannerTitle:'تحضير الموسم 2',s2BannerSub:'🎯 تحقق من مخصصاتك ←',s2TapTxt:'اضغط',
    snsHeroTitle:'تحضير الموسم 2',snsHeroSub:'تقدمك ينتقل للأمام',
    snsRowCoinsTitle:'الكوينز الحالية',snsRowCoinsDesc:'ترحيل: 20%',
    snsRowRefsTitle:'الإحالات',snsRowRefsDesc:'مكافأة الإحالات النشطة',
    snsRowCompTitle:'ترتيب المسابقة',snsRowCompDesc:'بناءً على مركزك في المتصدرين',
    snsTotalLbl:'🎯 إجمالي مخصصات الموسم',snsSeasonBadge:'الموسم 2',
  },
  en:{
    navHome:'Home',navMarket:'Market',navTasks:'Tasks',navFriends:'Friends',navFinance:'Finance',
    labelCoins:'Coins',labelBamboo:'Bamboo',
    statAccrued:'Accrued',statRateDay:'Rate/Day',statBambooDay:'Bamboo/day',
    claimBtn:'Claim Bamboo',lvLabel:'Lv.',
    tabDeposit:'💰 Deposit',tabWithdraw:'🌟 Season 2',tabExchange:'⚡ Exchange',
    tabReferralTxt:'Referral',tabSocialTxt:'Social',
    tabPartner:'⭐ Partner',tabCommunity:'🌍 Community',floatAdd:'➕ Add Task',
    friendsTitle:'Friends & Referrals',refProgTitle:'Referral Program',
    refCommission:'Commission when friends buy from Market!',
    refLinkPh:'Your referral link...',copyBtn:'Copy',
    refNote:'📤 Share this link with friends',
    recentRefs:'Recent Referrals',noReferrals:'No referrals yet',
    marketTitle:'Mining Market',
    labelWallet:'Wallet',notConnected:'Not connected',connectBtn:'Connect',
    important:'IMPORTANT:',depositWarning1:'Your User ID',
    depositWarning2:'must be the ONLY comment in the transaction.',
    amountTON:'Amount (TON)',rateLabel:'Rate:',youWillReceive:'You will receive:',
    depositBtn:'Deposit TON',processingDeposit:'Processing deposit...',
    freeTrial:'Free Trial:',freeTrialDesc:'1 free withdrawal up to 200 Coins.',
    freeTrialUsed:'Free trial used. Please deposit to continue withdrawing.',
    tonWalletAddr:'TON Wallet Address',amountCoins:'Amount (Coins)',tonValue:'TON Value',
    withdrawBtn:'Request Withdrawal',withdrawHist:'📋 Withdrawal History',noWithdrawals:'No withdrawals yet',
    swapFrom:'FROM',swapTo:'TO',balance:'Balance:',maxBtn:'MAX',
    swapRate:'📊 300 Bamboo = 10 Coins',exchangeNow:'⚡ Exchange Now',
    exchangeHist:'📋 Exchange History',noConversions:'No conversions yet',
    helpTitle:'🐼 Panda Bamboo Guide',
    helpPayCh:'Payouts<br>Channel',helpNewsCh:'Bot<br>News',helpSupport:'Technical<br>Support',
    helpWelcomeTitle:'🎁 Free Welcome Bonus',
    helpWelcomeBody:'When you register for the first time you automatically receive:<br><span style="color:#fff;font-weight:800">• 200 Coins</span> — main withdrawal currency<br><span style="color:#fff;font-weight:800">• 100 Bamboo/day</span> — free mining power starts immediately',
    helpIdeaTitle:'💡 Main Concept',
    helpIdeaBody:'The bot is a virtual Bamboo Factory 🎋<br>⬅ Buy machines from the Market with <span style="color:var(--bamboo);font-weight:800">Bamboo</span><br>⬅ Machines auto-produce Bamboo collected in the Tank<br>⬅ Convert Bamboo to <span style="color:var(--coin);font-weight:800">Coins</span> on the Finance page<br>⬅ Withdraw Coins to your TON wallet 💎',
    helpPagesTitle:'🗂 Pages Guide',
    helpPageHome:'🏠 Home',helpPageHomeDesc:'View the panda, collection tank and daily mining rate. Press Claim Bamboo to collect what has accumulated.',
    helpPageMarket:'🛒 Market',helpPageMarketDesc:'Buy mining machines with Bamboo. Each machine increases your daily output.',
    helpPageTasks:'✅ Tasks',helpPageTasksDesc:'Complete tasks for extra Bamboo. Referral tasks reward you with Bamboo + Coins.',
    helpPageFriends:'👥 Friends',helpPageFriendsDesc:'Share your referral link. Earn <span style="color:var(--bamboo);font-weight:800">20%</span> commission on every purchase your friend makes.',
    helpPageFinance:'💰 Finance',helpPageFinanceDesc:'Convert Bamboo → Coins, deposit TON, and withdraw Coins to your wallet.',
    helpPricesTitle:'💲 Rates & Conversions',
    helpDepositTON:'💎 Deposit TON',helpConvertBamboo:'⚡ Convert Bamboo',
    helpWithdrawRate:'💸 Withdrawal Rate',helpMinWithdraw:'📦 Minimum Withdrawal',
    helpRefCommission:'👥 Referral Commission',helpRefCommissionVal:"20% of friend's purchases",
    helpAddTask:'➕ Add Task (100 members)',
    helpWdTitle:'📤 Withdrawal Conditions',
    helpWdBody:'<span style="color:var(--coin);font-weight:800">General Withdrawal Conditions:</span><br>• Minimum withdrawal: <span style="color:#fff;font-weight:800">2,000 Coins (0.1 TON)</span><br>• Must complete all <span style="color:#fff;font-weight:800">Partner Tasks</span> before withdrawal<br>• A valid TON wallet is required<br>• Processed automatically within <span style="color:var(--neon-green);font-weight:800">1 to 3 minutes</span><br>• Follow the <a href="https://t.me/PandaBambooPayouts" target="_blank" style="color:#00D4FF;font-weight:800">Payouts channel</a> to confirm',
    upgTitle:'⬆️ Upgrade Tank',miningInfoTitle:'⚡ Mining Info',
    addTaskTitle:'➕ Add Community Task',
    taskCostFormula:'Cost = <strong style="color:var(--coin)">Target Users × 60 Coins</strong>',
    taskCostNote:'Min target: 100 users | 100 users = 6,000 Coins',
    taskTypeChannel:'Channel',taskTypeBot:'Bot',
    taskBotHint:'Add our bot as admin in your channel first:',
    taskLinkLabel:'Telegram Link',taskLinkPh:'https://t.me/yourchannel',
    taskTargetLabel:'Target Users (min 100)',
    taskTotalCost:'Total Cost:',taskCreateBtn:'✅ Create Task',
    wdMinHint:'⚠️ Minimum: 200 Coins',
    multiAccount:'⚠️ You are using multiple accounts — play fair 🐼',
    depositRequired:'⛔ Withdrawal is only available for depositors\n\n💎 Make at least one TON deposit to unlock withdrawals\n\n🔄 Redirecting you to the deposit page...',
    depositRequiredBtn:'💎 Deposit Now',
    ldLoading:'Loading...',
    ldConnecting:'Connecting to Telegram...',
    ldAssets:'Loading assets...',
    ldAssetsOk:'Assets loaded!',
    ldFinding:'🏁 Finding fastest server...',
    ldRacing:'⚡ Racing servers...',
    ldRetrying:'Retrying...',
    ldBusy:'⏳ Servers busy, retrying...',
    ldConnected:'✅ Connected',
    ldBuilding:'Building interface...',
    ldWallet:'Setting up wallet...',
    ldReady:'Ready! 🐼',
    ldErrorMsg:'⚠️ Service temporarily unavailable\nAll servers are busy\nPlease restart the app in a moment',
    ldRetryBtn:'🔄 Retry',
    tabRegularRef:'👥 Referrals',
    tabActiveRef:'💎 Active',
    refTotalLabel:'👥 Total Referrals',
    refActiveLabel:'💎 Active (Deposited)',
    inviteFriend:'Invite {n} Friend',
    friendsPlural:'s',
    inviteActive:'💎 {n} Active Friend',
    friendsDeposited:'Friends who deposited TON',
    claimBtn2:'Claim',
    taskConfirmTitle:'Important Confirmation',
    taskConfirmBody:'🤖 You must add <b style="color:#fff">@PandaBamboBot</b> as admin in your channel <b>before</b> creating the task.<br><br>⛔ If the bot is not admin, <b style="color:#ff8a80">the task will be deleted and your balance will NOT be refunded.</b>',
    taskConfirmChannel:'Channel:',
    taskConfirmCost:'Cost:',
    taskConfirmBtn:'✅ Understood, Create Task',
    cancelBtn:'Cancel',
    multiAccount:'⚠️ This device is linked to another account — one device per account 🐼',
    compTitle:'Competitions',
    compTabActive:'💎 Active Refs',
    compTabMining:'⚡ Mining Speed',
    compActiveTitle:'💎 Active Referrals Competition',
    compActiveDesc:'Top 20 users with most active referrals (who deposited)',
    compMiningTitle:'⚡ Mining Speed Competition',
    compMiningDesc:'Top 20 users with highest mining rate',
    compPrize:'Prize Pool',
    compEnds:'Ends In',
    compWinners:'Winners',
    compMyScore:'Your Score',
    compMyRank:'Your Rank',
    compWinning:'You are winning!',
    compLeaderboard:'🏅 Leaderboard — Top 50',
    compEmpty:'No participants yet. Be the first!',
    compUnranked:'Unranked',
    compActiveScoreLbl:'active refs',
    compMiningScoreLbl:'bam/day',
    loading:'Loading...',
    compHelpTitle:'Competition Guide',
    compHelpBody:'<b style="color:#ffa726">🏆 How does it work?</b><br><br>📅 Each competition lasts <b>10 days</b>.<br>🏅 Top <b>20 users</b> win TON prizes.<br><br><b style="color:#00D4FF">💎 Active Referrals Competition</b><br>Counts friends who joined via your link <b>and deposited TON</b>.<br><br><b style="color:var(--bamboo)">⚡ Mining Speed Competition</b><br>Counts your <b>daily Bamboo production rate</b>.<br><br><b style="color:var(--coin)">🎁 Prize Distribution</b><br>🥇 #1 → 50 TON<br>🥈 #2 → 40 TON<br>🥉 #3 → 30 TON<br>#4 → 20 TON | #5 → 10 TON<br>#6 → 9 | #7 → 8 | #8 → 7 | #9 → 6 | #10 → 5 TON<br>#11–15 → 2 TON each<br>#16–20 → 1 TON each',
    newRefNotif:'🎉 You invited {name}! You will earn 20% of their purchases',
    s2BadgeTxt:'Coming Soon',s2BannerTitle:'Season 2 Preparation',s2BannerSub:'🎯 Check your allocation →',s2TapTxt:'Tap',
    snsHeroTitle:'Season 2 Preparation',snsHeroSub:'Your progress carries forward',
    snsRowCoinsTitle:'Current Coins',snsRowCoinsDesc:'Carry Over: 20%',
    snsRowRefsTitle:'Referrals',snsRowRefsDesc:'Active Referrals Bonus',
    snsRowCompTitle:'Competition Rank',snsRowCompDesc:'Based on your leaderboard position',
    snsTotalLbl:'🎯 Total Season Allocation',snsSeasonBadge:'Season 2',
  },
  ru:{
    navHome:'Главная',navMarket:'Рынок',navTasks:'Задания',navFriends:'Друзья',navFinance:'Финансы',
    labelCoins:'Коины',labelBamboo:'Бамбук',
    statAccrued:'Накоплено',statRateDay:'Темп/день',statBambooDay:'Бамбук/день',
    claimBtn:'Забрать Bamboo',lvLabel:'Ур.',
    tabDeposit:'💰 Депозит',tabWithdraw:'🌟 Сезон 2',tabExchange:'⚡ Обмен',
    tabReferralTxt:'Реферал',tabSocialTxt:'Соцсети',
    tabPartner:'⭐ Партнёр',tabCommunity:'🌍 Сообщество',floatAdd:'➕ Добавить задание',
    friendsTitle:'Друзья и рефералы',refProgTitle:'Реферальная программа',
    refCommission:'Комиссия 20% с каждой покупки друга!',
    refLinkPh:'Ваша реферальная ссылка...',copyBtn:'Копировать',
    refNote:'📤 Поделитесь ссылкой с друзьями',
    recentRefs:'Последние рефералы',noReferrals:'Рефералов пока нет',
    marketTitle:'Рынок майнинга',
    labelWallet:'Кошелёк',notConnected:'Не подключён',connectBtn:'Подключить',
    important:'ВАЖНО:',depositWarning1:'Ваш ID пользователя',
    depositWarning2:'должен быть единственным комментарием в транзакции.',
    amountTON:'Сумма (TON)',rateLabel:'Курс:',youWillReceive:'Вы получите:',
    depositBtn:'Депозит TON',processingDeposit:'Обработка депозита...',
    freeTrial:'Пробный вывод:',freeTrialDesc:'1 бесплатный вывод до 200 Coins.',
    freeTrialUsed:'Пробный вывод использован. Пополните счёт для продолжения.',
    tonWalletAddr:'Адрес TON-кошелька',amountCoins:'Сумма (Coins)',tonValue:'Стоимость TON',
    withdrawBtn:'Запрос вывода',withdrawHist:'📋 История выводов',noWithdrawals:'Выводов пока нет',
    swapFrom:'ИЗ',swapTo:'В',balance:'Баланс:',maxBtn:'МАКС',
    swapRate:'📊 300 Bamboo = 10 Coins',exchangeNow:'⚡ Обменять',
    exchangeHist:'📋 История обменов',noConversions:'Обменов пока нет',
    helpTitle:'🐼 Руководство Panda Bamboo',
    helpPayCh:'Канал<br>выплат',helpNewsCh:'Новости<br>бота',helpSupport:'Тех.<br>поддержка',
    helpWelcomeTitle:'🎁 Бесплатный приветственный бонус',
    helpWelcomeBody:'При первой регистрации вы автоматически получаете:<br><span style="color:#fff;font-weight:800">• 200 Coins</span> — основная валюта вывода<br><span style="color:#fff;font-weight:800">• 100 Bamboo/день</span> — бесплатный майнинг сразу',
    helpIdeaTitle:'💡 Основная концепция',
    helpIdeaBody:'Бот — виртуальная Фабрика Бамбука 🎋<br>⬅ Покупайте машины на Рынке за <span style="color:var(--bamboo);font-weight:800">Bamboo</span><br>⬅ Машины автоматически производят Bamboo в Танке<br>⬅ Конвертируйте Bamboo в <span style="color:var(--coin);font-weight:800">Coins</span> в Finance<br>⬅ Выводите Coins на TON-кошелёк 💎',
    helpPagesTitle:'🗂 Руководство по страницам',
    helpPageHome:'🏠 Главная',helpPageHomeDesc:'Смотрите панду, резервуар и скорость майнинга. Нажмите Claim Bamboo для сбора.',
    helpPageMarket:'🛒 Рынок',helpPageMarketDesc:'Покупайте машины за Bamboo. Каждая машина увеличивает суточный доход.',
    helpPageTasks:'✅ Задания',helpPageTasksDesc:'Выполняйте задания за Bamboo. Реферальные задания дают Bamboo + Coins.',
    helpPageFriends:'👥 Друзья',helpPageFriendsDesc:'Делитесь реферальной ссылкой. Зарабатывайте <span style="color:var(--bamboo);font-weight:800">20%</span> с каждой покупки друга.',
    helpPageFinance:'💰 Финансы',helpPageFinanceDesc:'Конвертируйте Bamboo → Coins, пополняйте TON, выводите Coins на кошелёк.',
    helpPricesTitle:'💲 Курсы и конвертация',
    helpDepositTON:'💎 Депозит TON',helpConvertBamboo:'⚡ Обмен Bamboo',
    helpWithdrawRate:'💸 Курс вывода',helpMinWithdraw:'📦 Мин. вывод',
    helpRefCommission:'👥 Реферальная комиссия',helpRefCommissionVal:'20% с покупок друга',
    helpAddTask:'➕ Добавить задание (100 участников)',
    helpWdTitle:'📤 Условия вывода',
    helpWdBody:'<span style="color:var(--coin);font-weight:800">Общие условия вывода:</span><br>• Минимум: <span style="color:#fff;font-weight:800">2,000 Coins (0.1 TON)</span><br>• Выполните все <span style="color:#fff;font-weight:800">Partner Tasks</span><br>• Нужен действительный TON-кошелёк<br>• Обработка: <span style="color:var(--neon-green);font-weight:800">1–3 минуты</span><br>• Следите за <a href="https://t.me/PandaBambooPayouts" target="_blank" style="color:#00D4FF;font-weight:800">каналом выплат</a>',
    upgTitle:'⬆️ Улучшить танк',miningInfoTitle:'⚡ Инфо о майнинге',
    addTaskTitle:'➕ Добавить задание',
    taskCostFormula:'Стоимость = <strong style="color:var(--coin)">Кол-во участников × 60 Coins</strong>',
    taskCostNote:'Мин. участников: 100 | 100 участников = 6,000 Coins',
    taskTypeChannel:'Канал',taskTypeBot:'Бот',
    taskBotHint:'Сначала добавьте нашего бота как администратора:',
    taskLinkLabel:'Ссылка Telegram',taskLinkPh:'https://t.me/вашканал',
    taskTargetLabel:'Целевых участников (мин. 100)',
    taskTotalCost:'Итого:',taskCreateBtn:'✅ Создать задание',
    wdMinHint:'⚠️ Минимум: 200 Coins',
    multiAccount:'⚠️ Вы используете несколько аккаунтов — играйте честно 🐼',
    depositRequired:'⛔ Вывод доступен только для пополнивших счёт\n\n💎 Пополните счёт хотя бы на 1 TON, чтобы разблокировать вывод\n\n🔄 Перенаправление на страницу пополнения...',
    depositRequiredBtn:'💎 Пополнить сейчас',
    ldLoading:'Загрузка...',
    ldConnecting:'Подключение к Telegram...',
    ldAssets:'Загрузка ресурсов...',
    ldAssetsOk:'Ресурсы загружены!',
    ldFinding:'🏁 Поиск быстрого сервера...',
    ldRacing:'⚡ Соревнование серверов...',
    ldRetrying:'Повтор попытки...',
    ldBusy:'⏳ Серверы заняты, повтор...',
    ldConnected:'✅ Подключено',
    ldBuilding:'Сборка интерфейса...',
    ldWallet:'Настройка кошелька...',
    ldReady:'Готово! 🐼',
    ldErrorMsg:'⚠️ Сервис временно недоступен\nВсе серверы заняты\nПожалуйста, перезапустите приложение',
    ldRetryBtn:'🔄 Повторить',
    tabRegularRef:'👥 Рефералы',
    tabActiveRef:'💎 Активные',
    refTotalLabel:'👥 Всего рефералов',
    refActiveLabel:'💎 Активные (с депозитом)',
    inviteFriend:'Пригласить {n} друга',
    friendsPlural:'',
    inviteActive:'💎 {n} активный друг',
    friendsDeposited:'Друзья, пополнившие счёт TON',
    claimBtn2:'Получить',
    taskConfirmTitle:'Важное подтверждение',
    taskConfirmBody:'🤖 Вы должны добавить <b style="color:#fff">@PandaBamboBot</b> как администратора в ваш канал <b>перед</b> созданием задания.<br><br>⛔ Если бот не является администратором, <b style="color:#ff8a80">задание будет удалено и баланс НЕ будет возвращён.</b>',
    taskConfirmChannel:'Канал:',
    taskConfirmCost:'Стоимость:',
    taskConfirmBtn:'✅ Понял, создать задание',
    cancelBtn:'Отмена',
    multiAccount:'⚠️ Это устройство привязано к другому аккаунту — один аккаунт на устройство 🐼',
    compTitle:'Соревнования',
    compTabActive:'💎 Активные рефералы',
    compTabMining:'⚡ Скорость майнинга',
    compActiveTitle:'💎 Соревнование по активным рефералам',
    compActiveDesc:'Топ-20 пользователей с наибольшим числом активных рефералов',
    compMiningTitle:'⚡ Соревнование по скорости майнинга',
    compMiningDesc:'Топ-20 пользователей с наивысшей скоростью майнинга',
    compPrize:'Призовой фонд',
    compEnds:'До конца',
    compWinners:'Победители',
    compMyScore:'Ваши очки',
    compMyRank:'Ваш ранг',
    compWinning:'Вы выигрываете!',
    compLeaderboard:'🏅 Таблица лидеров — Топ 50',
    compEmpty:'Участников пока нет. Будьте первым!',
    compUnranked:'Не в рейтинге',
    compActiveScoreLbl:'акт. реф.',
    compMiningScoreLbl:'бамбук/день',
    loading:'Загрузка...',
    compHelpTitle:'Руководство по соревнованиям',
    compHelpBody:'<b style="color:#ffa726">🏆 Как это работает?</b><br><br>📅 Каждое соревнование длится <b>10 дней</b>.<br>🏅 Топ <b>20 участников</b> получают призы в TON.<br><br><b style="color:#00D4FF">💎 Соревнование по активным рефералам</b><br>Считаются друзья, зарегистрировавшиеся по вашей ссылке <b>и пополнившие счёт</b>.<br><br><b style="color:var(--bamboo)">⚡ Соревнование по скорости майнинга</b><br>Считается ваш <b>дневной объём производства Bamboo</b>.<br><br><b style="color:var(--coin)">🎁 Распределение призов</b><br>🥇 #1 → 50 TON<br>🥈 #2 → 40 TON<br>🥉 #3 → 30 TON<br>#4 → 20 TON | #5 → 10 TON<br>#6 → 9 | #7 → 8 | #8 → 7 | #9 → 6 | #10 → 5 TON<br>#11–15 → 2 TON каждому<br>#16–20 → 1 TON каждому',
    newRefNotif:'🎉 Вы пригласили {name}! Вы получите 20% с их покупок',
    s2BadgeTxt:'Скоро',s2BannerTitle:'Подготовка к Сезону 2',s2BannerSub:'🎯 Проверить распределение →',s2TapTxt:'Нажми',
    snsHeroTitle:'Подготовка к Сезону 2',snsHeroSub:'Ваш прогресс переносится',
    snsRowCoinsTitle:'Текущие монеты',snsRowCoinsDesc:'Перенос: 20%',
    snsRowRefsTitle:'Рефералы',snsRowRefsDesc:'Бонус за активных рефералов',
    snsRowCompTitle:'Рейтинг в соревновании',snsRowCompDesc:'По вашей позиции в таблице лидеров',
    snsTotalLbl:'🎯 Итого распределение сезона',snsSeasonBadge:'Сезон 2',
  },
  es:{
    navHome:'Inicio',navMarket:'Mercado',navTasks:'Tareas',navFriends:'Amigos',navFinance:'Finanzas',
    labelCoins:'Monedas',labelBamboo:'Bambú',
    statAccrued:'Acumulado',statRateDay:'Tasa/Día',statBambooDay:'Bambú/día',
    claimBtn:'Reclamar Bamboo',lvLabel:'Nv.',
    tabDeposit:'💰 Depósito',tabWithdraw:'🌟 Temporada 2',tabExchange:'⚡ Cambio',
    tabReferralTxt:'Referido',tabSocialTxt:'Social',
    tabPartner:'⭐ Socio',tabCommunity:'🌍 Comunidad',floatAdd:'➕ Añadir tarea',
    friendsTitle:'Amigos y referidos',refProgTitle:'Programa de referidos',
    refCommission:'¡Comisión del 20% cuando tus amigos compren en el Mercado!',
    refLinkPh:'Tu enlace de referido...',copyBtn:'Copiar',
    refNote:'📤 Comparte este enlace con amigos',
    recentRefs:'Referidos recientes',noReferrals:'Sin referidos aún',
    marketTitle:'Mercado de minería',
    labelWallet:'Cartera',notConnected:'No conectada',connectBtn:'Conectar',
    important:'IMPORTANTE:',depositWarning1:'Tu ID de usuario',
    depositWarning2:'debe ser el ÚNICO comentario en la transacción.',
    amountTON:'Cantidad (TON)',rateLabel:'Tasa:',youWillReceive:'Recibirás:',
    depositBtn:'Depositar TON',processingDeposit:'Procesando depósito...',
    freeTrial:'Prueba gratis:',freeTrialDesc:'1 retiro gratis hasta 200 Coins.',
    freeTrialUsed:'Prueba gratuita usada. Deposita para continuar retirando.',
    tonWalletAddr:'Dirección de cartera TON',amountCoins:'Cantidad (Monedas)',tonValue:'Valor TON',
    withdrawBtn:'Solicitar retiro',withdrawHist:'📋 Historial de retiros',noWithdrawals:'Sin retiros aún',
    swapFrom:'DE',swapTo:'A',balance:'Saldo:',maxBtn:'MÁX',
    swapRate:'📊 300 Bamboo = 10 Monedas',exchangeNow:'⚡ Cambiar ahora',
    exchangeHist:'📋 Historial de cambios',noConversions:'Sin conversiones aún',
    helpTitle:'🐼 Guía de Panda Bamboo',
    helpPayCh:'Canal de<br>pagos',helpNewsCh:'Noticias<br>del bot',helpSupport:'Soporte<br>técnico',
    helpWelcomeTitle:'🎁 Bono de bienvenida gratis',
    helpWelcomeBody:'Al registrarte por primera vez recibes automáticamente:<br><span style="color:#fff;font-weight:800">• 200 Monedas</span> — moneda principal de retiro<br><span style="color:#fff;font-weight:800">• 100 Bamboo/día</span> — minería gratuita empieza de inmediato',
    helpIdeaTitle:'💡 Concepto principal',
    helpIdeaBody:'El bot es una Fábrica de Bamboo virtual 🎋<br>⬅ Compra máquinas en el Mercado con <span style="color:var(--bamboo);font-weight:800">Bamboo</span><br>⬅ Las máquinas producen Bamboo automáticamente<br>⬅ Convierte Bamboo a <span style="color:var(--coin);font-weight:800">Monedas</span> en Finance<br>⬅ Retira Monedas a tu cartera TON 💎',
    helpPagesTitle:'🗂 Guía de páginas',
    helpPageHome:'🏠 Inicio',helpPageHomeDesc:'Ve el panda, el tanque y la tasa de minería. Pulsa Claim Bamboo para recoger lo acumulado.',
    helpPageMarket:'🛒 Mercado',helpPageMarketDesc:'Compra máquinas de minería con Bamboo. Cada máquina aumenta tu producción diaria.',
    helpPageTasks:'✅ Tareas',helpPageTasksDesc:'Completa tareas para obtener Bamboo extra. Las tareas de referido recompensan con Bamboo + Monedas.',
    helpPageFriends:'👥 Amigos',helpPageFriendsDesc:'Comparte tu enlace de referido. Gana <span style="color:var(--bamboo);font-weight:800">20%</span> de comisión por cada compra de tu amigo.',
    helpPageFinance:'💰 Finanzas',helpPageFinanceDesc:'Convierte Bamboo → Monedas, deposita TON y retira Monedas a tu cartera.',
    helpPricesTitle:'💲 Tarifas y conversiones',
    helpDepositTON:'💎 Depositar TON',helpConvertBamboo:'⚡ Convertir Bamboo',
    helpWithdrawRate:'💸 Tasa de retiro',helpMinWithdraw:'📦 Retiro mínimo',
    helpRefCommission:'👥 Comisión de referido',helpRefCommissionVal:'20% de las compras del amigo',
    helpAddTask:'➕ Añadir tarea (100 miembros)',
    helpWdTitle:'📤 Condiciones de retiro',
    helpWdBody:'<span style="color:var(--coin);font-weight:800">Condiciones generales de retiro:</span><br>• Mínimo: <span style="color:#fff;font-weight:800">2,000 Monedas (0.1 TON)</span><br>• Completa todas las <span style="color:#fff;font-weight:800">Partner Tasks</span><br>• Se requiere cartera TON válida<br>• Procesado automáticamente en <span style="color:var(--neon-green);font-weight:800">1 a 3 minutos</span><br>• Sigue el <a href="https://t.me/PandaBambooPayouts" target="_blank" style="color:#00D4FF;font-weight:800">canal de pagos</a>',
    upgTitle:'⬆️ Mejorar tanque',miningInfoTitle:'⚡ Info de minería',
    addTaskTitle:'➕ Añadir tarea comunitaria',
    taskCostFormula:'Costo = <strong style="color:var(--coin)">Usuarios objetivo × 60 Monedas</strong>',
    taskCostNote:'Mín. objetivo: 100 usuarios | 100 usuarios = 6,000 Monedas',
    taskTypeChannel:'Canal',taskTypeBot:'Bot',
    taskBotHint:'Primero añade nuestro bot como admin en tu canal:',
    taskLinkLabel:'Enlace de Telegram',taskLinkPh:'https://t.me/tucanal',
    taskTargetLabel:'Usuarios objetivo (mín. 100)',
    taskTotalCost:'Costo total:',taskCreateBtn:'✅ Crear tarea',
    wdMinHint:'⚠️ Mínimo: 200 Monedas',
    multiAccount:'⚠️ Estás usando múltiples cuentas — juega limpio 🐼',
    depositRequired:'⛔ El retiro solo está disponible para quienes han depositado\n\n💎 Realiza al menos un depósito de TON para desbloquear los retiros\n\n🔄 Redirigiendo a la página de depósito...',
    depositRequiredBtn:'💎 Depositar ahora',
    ldLoading:'Cargando...',
    ldConnecting:'Conectando a Telegram...',
    ldAssets:'Cargando recursos...',
    ldAssetsOk:'¡Recursos cargados!',
    ldFinding:'🏁 Buscando servidor más rápido...',
    ldRacing:'⚡ Compitiendo servidores...',
    ldRetrying:'Reintentando...',
    ldBusy:'⏳ Servidores ocupados, reintentando...',
    ldConnected:'✅ Conectado',
    ldBuilding:'Construyendo interfaz...',
    ldWallet:'Configurando billetera...',
    ldReady:'¡Listo! 🐼',
    ldErrorMsg:'⚠️ Servicio temporalmente no disponible\nTodos los servidores están ocupados\nPor favor reinicia la app en un momento',
    ldRetryBtn:'🔄 Reintentar',
    tabRegularRef:'👥 Referidos',
    tabActiveRef:'💎 Activos',
    refTotalLabel:'👥 Total referidos',
    refActiveLabel:'💎 Activos (depositaron)',
    inviteFriend:'Invitar {n} amigo',
    friendsPlural:'s',
    inviteActive:'💎 {n} amigo activo',
    friendsDeposited:'Amigos que depositaron TON',
    claimBtn2:'Reclamar',
    taskConfirmTitle:'Confirmación importante',
    taskConfirmBody:'🤖 Debes agregar <b style="color:#fff">@PandaBamboBot</b> como administrador en tu canal <b>antes</b> de crear la tarea.<br><br>⛔ Si el bot no es administrador, <b style="color:#ff8a80">la tarea será eliminada y tu saldo NO será reembolsado.</b>',
    taskConfirmChannel:'Canal:',
    taskConfirmCost:'Costo:',
    taskConfirmBtn:'✅ Entendido, crear tarea',
    cancelBtn:'Cancelar',
    multiAccount:'⚠️ Este dispositivo está vinculado a otra cuenta — una cuenta por dispositivo 🐼',
    compTitle:'Competencias',
    compTabActive:'💎 Referidos activos',
    compTabMining:'⚡ Velocidad de minería',
    compActiveTitle:'💎 Competencia de referidos activos',
    compActiveDesc:'Top 20 usuarios con más referidos activos (que depositaron)',
    compMiningTitle:'⚡ Competencia de velocidad de minería',
    compMiningDesc:'Top 20 usuarios con mayor tasa de minería',
    compPrize:'Premio',
    compEnds:'Termina en',
    compWinners:'Ganadores',
    compMyScore:'Tu puntaje',
    compMyRank:'Tu rango',
    compWinning:'¡Estás ganando!',
    compLeaderboard:'🏅 Clasificación — Top 50',
    compEmpty:'Sin participantes aún. ¡Sé el primero!',
    compUnranked:'Sin clasificar',
    compActiveScoreLbl:'ref. activos',
    compMiningScoreLbl:'bam/día',
    loading:'Cargando...',
    compHelpTitle:'Guía de competencias',
    compHelpBody:'<b style="color:#ffa726">🏆 ¿Cómo funciona?</b><br><br>📅 Cada competencia dura <b>10 días</b>.<br>🏅 Los <b>20 mejores usuarios</b> ganan premios en TON.<br><br><b style="color:#00D4FF">💎 Competencia de referidos activos</b><br>Cuenta amigos que se unieron por tu enlace <b>y depositaron TON</b>.<br><br><b style="color:var(--bamboo)">⚡ Competencia de velocidad de minería</b><br>Cuenta tu <b>tasa diaria de producción de Bamboo</b>.<br><br><b style="color:var(--coin)">🎁 Distribución de premios</b><br>🥇 #1 → 50 TON<br>🥈 #2 → 40 TON<br>🥉 #3 → 30 TON<br>#4 → 20 TON | #5 → 10 TON<br>#6 → 9 | #7 → 8 | #8 → 7 | #9 → 6 | #10 → 5 TON<br>#11–15 → 2 TON c/u<br>#16–20 → 1 TON c/u',
    newRefNotif:'🎉 Invitaste a {name}! Ganarás 20% de sus compras',
    s2BadgeTxt:'Próximamente',s2BannerTitle:'Preparación Temporada 2',s2BannerSub:'🎯 Ver tu asignación →',s2TapTxt:'Toca',
    snsHeroTitle:'Preparación Temporada 2',snsHeroSub:'Tu progreso continúa',
    snsRowCoinsTitle:'Monedas actuales',snsRowCoinsDesc:'Transferencia: 20%',
    snsRowRefsTitle:'Referidos',snsRowRefsDesc:'Bono referidos activos',
    snsRowCompTitle:'Rango de competencia',snsRowCompDesc:'Según tu posición en clasificación',
    snsTotalLbl:'🎯 Total asignación de temporada',snsSeasonBadge:'Temporada 2',
  },
  fr:{
    navHome:'Accueil',navMarket:'Marché',navTasks:'Tâches',navFriends:'Amis',navFinance:'Finance',
    labelCoins:'Pièces',labelBamboo:'Bambou',
    statAccrued:'Accumulé',statRateDay:'Taux/Jour',statBambooDay:'Bambou/jour',
    claimBtn:'Réclamer Bamboo',lvLabel:'Nv.',
    tabDeposit:'💰 Dépôt',tabWithdraw:'🌟 Saison 2',tabExchange:'⚡ Échange',
    tabReferralTxt:'Parrainage',tabSocialTxt:'Réseaux',
    tabPartner:'⭐ Partenaire',tabCommunity:'🌍 Communauté',floatAdd:'➕ Ajouter tâche',
    friendsTitle:'Amis & Parrainages',refProgTitle:'Programme de parrainage',
    refCommission:'Commission 20% quand vos amis achètent sur le Marché!',
    refLinkPh:'Votre lien de parrainage...',copyBtn:'Copier',
    refNote:'📤 Partagez ce lien avec vos amis',
    recentRefs:'Parrainages récents',noReferrals:'Aucun parrainage encore',
    marketTitle:'Marché de minage',
    labelWallet:'Portefeuille',notConnected:'Non connecté',connectBtn:'Connecter',
    important:'IMPORTANT:',depositWarning1:'Votre ID utilisateur',
    depositWarning2:'doit être le SEUL commentaire de la transaction.',
    amountTON:'Montant (TON)',rateLabel:'Taux:',youWillReceive:'Vous recevrez:',
    depositBtn:'Déposer TON',processingDeposit:'Traitement du dépôt...',
    freeTrial:'Essai gratuit:',freeTrialDesc:'1 retrait gratuit jusqu\'à 200 Coins.',
    freeTrialUsed:'Essai gratuit utilisé. Veuillez déposer pour continuer.',
    tonWalletAddr:'Adresse portefeuille TON',amountCoins:'Montant (Pièces)',tonValue:'Valeur TON',
    withdrawBtn:'Demander un retrait',withdrawHist:'📋 Historique des retraits',noWithdrawals:'Aucun retrait encore',
    swapFrom:'DE',swapTo:'VERS',balance:'Solde:',maxBtn:'MAX',
    swapRate:'📊 300 Bamboo = 10 Pièces',exchangeNow:'⚡ Échanger maintenant',
    exchangeHist:'📋 Historique des échanges',noConversions:'Aucune conversion encore',
    helpTitle:'🐼 Guide Panda Bamboo',
    helpPayCh:'Canal de<br>paiements',helpNewsCh:'Actualités<br>du bot',helpSupport:'Support<br>technique',
    helpWelcomeTitle:'🎁 Bonus de bienvenue gratuit',
    helpWelcomeBody:'À votre première inscription vous recevez automatiquement:<br><span style="color:#fff;font-weight:800">• 200 Pièces</span> — monnaie de retrait principale<br><span style="color:#fff;font-weight:800">• 100 Bamboo/jour</span> — minage gratuit démarre immédiatement',
    helpIdeaTitle:'💡 Concept principal',
    helpIdeaBody:'Le bot est une Usine de Bamboo virtuelle 🎋<br>⬅ Achetez des machines sur le Marché avec du <span style="color:var(--bamboo);font-weight:800">Bamboo</span><br>⬅ Les machines produisent automatiquement du Bamboo<br>⬅ Convertissez le Bamboo en <span style="color:var(--coin);font-weight:800">Pièces</span> dans Finance<br>⬅ Retirez les Pièces sur votre portefeuille TON 💎',
    helpPagesTitle:'🗂 Guide des pages',
    helpPageHome:'🏠 Accueil',helpPageHomeDesc:'Voyez le panda, le réservoir et le taux de minage. Appuyez sur Claim Bamboo pour collecter.',
    helpPageMarket:'🛒 Marché',helpPageMarketDesc:'Achetez des machines de minage avec du Bamboo. Chaque machine augmente votre production quotidienne.',
    helpPageTasks:'✅ Tâches',helpPageTasksDesc:'Accomplissez des tâches pour obtenir du Bamboo supplémentaire. Les tâches de parrainage récompensent avec Bamboo + Pièces.',
    helpPageFriends:'👥 Amis',helpPageFriendsDesc:'Partagez votre lien de parrainage. Gagnez <span style="color:var(--bamboo);font-weight:800">20%</span> de commission sur chaque achat de votre ami.',
    helpPageFinance:'💰 Finance',helpPageFinanceDesc:'Convertissez Bamboo → Pièces, déposez du TON, retirez des Pièces vers votre portefeuille.',
    helpPricesTitle:'💲 Taux et conversions',
    helpDepositTON:'💎 Dépôt TON',helpConvertBamboo:'⚡ Convertir Bamboo',
    helpWithdrawRate:'💸 Taux de retrait',helpMinWithdraw:'📦 Retrait minimum',
    helpRefCommission:'👥 Commission de parrainage',helpRefCommissionVal:"20% des achats de l'ami",
    helpAddTask:'➕ Ajouter tâche (100 membres)',
    helpWdTitle:'📤 Conditions de retrait',
    helpWdBody:'<span style="color:var(--coin);font-weight:800">Conditions générales de retrait:</span><br>• Minimum: <span style="color:#fff;font-weight:800">2,000 Pièces (0.1 TON)</span><br>• Complétez toutes les <span style="color:#fff;font-weight:800">Partner Tasks</span><br>• Un portefeuille TON valide est requis<br>• Traité automatiquement en <span style="color:var(--neon-green);font-weight:800">1 à 3 minutes</span><br>• Suivez le <a href="https://t.me/PandaBambooPayouts" target="_blank" style="color:#00D4FF;font-weight:800">canal des paiements</a>',
    upgTitle:'⬆️ Améliorer le réservoir',miningInfoTitle:'⚡ Info de minage',
    addTaskTitle:'➕ Ajouter une tâche communautaire',
    taskCostFormula:'Coût = <strong style="color:var(--coin)">Utilisateurs cibles × 60 Pièces</strong>',
    taskCostNote:'Min. cible: 100 utilisateurs | 100 utilisateurs = 6,000 Pièces',
    taskTypeChannel:'Chaîne',taskTypeBot:'Bot',
    taskBotHint:"Ajoutez d'abord notre bot comme admin dans votre chaîne:",
    taskLinkLabel:'Lien Telegram',taskLinkPh:'https://t.me/votrechaîne',
    taskTargetLabel:'Utilisateurs cibles (min. 100)',
    taskTotalCost:'Coût total:',taskCreateBtn:'✅ Créer la tâche',
    wdMinHint:'⚠️ Minimum: 200 Pièces',
    multiAccount:'⚠️ Vous utilisez plusieurs comptes — jouez honnêtement 🐼',
    depositRequired:'⛔ Le retrait est réservé aux utilisateurs ayant effectué un dépôt\n\n💎 Effectuez au moins un dépôt TON pour débloquer les retraits\n\n🔄 Redirection vers la page de dépôt...',
    depositRequiredBtn:'💎 Déposer maintenant',
    ldLoading:'Chargement...',
    ldConnecting:'Connexion à Telegram...',
    ldAssets:'Chargement des ressources...',
    ldAssetsOk:'Ressources chargées!',
    ldFinding:'🏁 Recherche du serveur le plus rapide...',
    ldRacing:'⚡ Course des serveurs...',
    ldRetrying:'Nouvelle tentative...',
    ldBusy:'⏳ Serveurs occupés, réessai...',
    ldConnected:'✅ Connecté',
    ldBuilding:"Construction de l'interface...",
    ldWallet:'Configuration du portefeuille...',
    ldReady:'Prêt! 🐼',
    ldErrorMsg:'⚠️ Service temporairement indisponible\nTous les serveurs sont occupés\nVeuillez redémarrer l\'application',
    ldRetryBtn:'🔄 Réessayer',
    tabRegularRef:'👥 Parrainages',
    tabActiveRef:'💎 Actifs',
    refTotalLabel:'👥 Total parrainages',
    refActiveLabel:'💎 Actifs (ont déposé)',
    inviteFriend:'Inviter {n} ami',
    friendsPlural:'s',
    inviteActive:'💎 {n} ami actif',
    friendsDeposited:'Amis ayant déposé du TON',
    claimBtn2:'Réclamer',
    taskConfirmTitle:'Confirmation importante',
    taskConfirmBody:'🤖 Vous devez ajouter <b style="color:#fff">@PandaBamboBot</b> comme administrateur dans votre chaîne <b>avant</b> de créer la tâche.<br><br>⛔ Si le bot n\'est pas administrateur, <b style="color:#ff8a80">la tâche sera supprimée et votre solde NE sera PAS remboursé.</b>',
    taskConfirmChannel:'Chaîne:',
    taskConfirmCost:'Coût:',
    taskConfirmBtn:'✅ Compris, créer la tâche',
    cancelBtn:'Annuler',
    multiAccount:'⚠️ Cet appareil est lié à un autre compte — un compte par appareil 🐼',
    compTitle:'Compétitions',
    compTabActive:'💎 Réf. actifs',
    compTabMining:'⚡ Vitesse de minage',
    compActiveTitle:'💎 Compétition de parrainages actifs',
    compActiveDesc:'Top 20 utilisateurs avec le plus de parrainages actifs (ayant déposé)',
    compMiningTitle:'⚡ Compétition de vitesse de minage',
    compMiningDesc:'Top 20 utilisateurs avec le taux de minage le plus élevé',
    compPrize:'Récompense',
    compEnds:'Se termine dans',
    compWinners:'Gagnants',
    compMyScore:'Votre score',
    compMyRank:'Votre rang',
    compWinning:'Vous gagnez!',
    compLeaderboard:'🏅 Classement — Top 50',
    compEmpty:'Aucun participant. Soyez le premier!',
    compUnranked:'Non classé',
    compActiveScoreLbl:'réf. actifs',
    compMiningScoreLbl:'bamb./jour',
    loading:'Chargement...',
    compHelpTitle:'Guide des compétitions',
    compHelpBody:'<b style="color:#ffa726">🏆 Comment ça marche?</b><br><br>📅 Chaque compétition dure <b>10 jours</b>.<br>🏅 Les <b>20 meilleurs utilisateurs</b> gagnent des prix en TON.<br><br><b style="color:#00D4FF">💎 Compétition de parrainages actifs</b><br>Compte les amis inscrits via votre lien <b>qui ont déposé du TON</b>.<br><br><b style="color:var(--bamboo)">⚡ Compétition de vitesse de minage</b><br>Compte votre <b>taux de production quotidien de Bamboo</b>.<br><br><b style="color:var(--coin)">🎁 Distribution des prix</b><br>🥇 #1 → 50 TON<br>🥈 #2 → 40 TON<br>🥉 #3 → 30 TON<br>#4 → 20 TON | #5 → 10 TON<br>#6 → 9 | #7 → 8 | #8 → 7 | #9 → 6 | #10 → 5 TON<br>#11–15 → 2 TON chacun<br>#16–20 → 1 TON chacun',
    newRefNotif:'🎉 Vous avez invité {name}! Vous gagnerez 20% de ses achats',
    s2BadgeTxt:'Bientôt',s2BannerTitle:'Préparation Saison 2',s2BannerSub:'🎯 Voir votre allocation →',s2TapTxt:'Appuyer',
    snsHeroTitle:'Préparation Saison 2',snsHeroSub:'Votre progression continue',
    snsRowCoinsTitle:'Pièces actuelles',snsRowCoinsDesc:'Report: 20%',
    snsRowRefsTitle:'Parrainages',snsRowRefsDesc:'Bonus parrainages actifs',
    snsRowCompTitle:'Classement compétition',snsRowCompDesc:'Selon votre position au classement',
    snsTotalLbl:'🎯 Allocation totale saison',snsSeasonBadge:'Saison 2',
  }
};

function toggleLangMenu(){
  const m=document.getElementById('langMenu');
  m.style.display = m.style.display==='none' ? 'block' : 'none';
  if(m.style.display==='block'){
    setTimeout(()=>document.addEventListener('click',closeLangMenuOutside,{once:true}),10);
  }
}
function closeLangMenuOutside(e){
  const m=document.getElementById('langMenu');
  const btn=document.getElementById('langBtn');
  if(m && !m.contains(e.target) && !btn.contains(e.target)) m.style.display='none';
}
function setLang(lang,flag,code){
  localStorage.setItem('pandaLang',lang);
  applyLang(lang,flag,code);
  document.getElementById('langMenu').style.display='none';
}
function applyLang(lang,flag,code){
  const t=TRANSLATIONS[lang]||TRANSLATIONS['en'];
  document.getElementById('langFlag').textContent=flag;
  document.getElementById('langCode').textContent=code;
  document.querySelectorAll('.lang-opt').forEach(el=>el.classList.toggle('active',el.dataset.lang===lang));
  document.documentElement.dir=lang==='ar'?'rtl':'ltr';

  // ── Loading screen text (if still visible) ──
  const ldStat=document.getElementById('ldStatus');
  if(ldStat && !ldStat.style.color) ldStat.textContent=t.ldLoading||'Loading...';
  const ldRetryBtn=document.getElementById('ldRetryBtn');
  if(ldRetryBtn) ldRetryBtn.textContent=t.ldRetryBtn||'🔄 Retry';

  // ── Universal data-i18n engine ──
  document.querySelectorAll('[data-i18n]').forEach(el=>{
    const key=el.dataset.i18n;
    if(t[key]!==undefined) el.innerHTML=t[key];
  });
  // ── data-i18n-ph: placeholder translation ──
  document.querySelectorAll('[data-i18n-ph]').forEach(el=>{
    const key=el.dataset.i18nPh;
    if(t[key]!==undefined) el.placeholder=t[key];
  });

  // ── Nav labels ──
  const navItems=document.querySelectorAll('.ni .ni-lbl');
  const navKeys=['navHome','navMarket','navTasks','navFriends','navFinance'];
  navItems.forEach((el,i)=>{if(navKeys[i]) el.textContent=t[navKeys[i]];});

  // ── Finance tabs ──
  const ftabs=document.querySelectorAll('.ftab');
  const ftabKeys=['tabDeposit','tabWithdraw','tabExchange'];
  ftabs.forEach((el,i)=>{if(ftabKeys[i]) el.textContent=t[ftabKeys[i]];});

  // ── Task tabs ──
  document.querySelectorAll('.ttab[data-t]').forEach(el=>{
    if(el.dataset.t==='referral') el.innerHTML='👥 '+t.tabReferralTxt;
    if(el.dataset.t==='social')   el.innerHTML='📢 '+t.tabSocialTxt;
  });
  const stP=document.getElementById('stab-partner');   if(stP) stP.innerHTML='⭐ '+t.tabPartner.replace('⭐ ','');
  const stC=document.getElementById('stab-community'); if(stC) stC.innerHTML='🌍 '+t.tabCommunity.replace('🌍 ','');
  const rtR=document.getElementById('rtab-regular'); if(rtR) rtR.textContent=t.tabRegularRef||'👥 Referrals';
  const rtA=document.getElementById('rtab-active');  if(rtA) rtA.textContent=t.tabActiveRef||'💎 Active';
  const ctA=document.getElementById('ctab-active');  if(ctA) ctA.textContent=t.compTabActive||'💎 Active Refs';
  const ctM=document.getElementById('ctab-mining');  if(ctM) ctM.textContent=t.compTabMining||'⚡ Mining Speed';
  const cTitle=document.querySelector('#compPage [data-i18n="compTitle"]'); if(cTitle) cTitle.textContent=t.compTitle||'Competition';

  // ── Claim button (keep image) ──
  const claimTxt=document.getElementById('claimBtnTxt');
  if(claimTxt){const img=claimTxt.querySelector('img');claimTxt.textContent=t.claimBtn;if(img)claimTxt.prepend(img);}

  // ── Deposit button (keep icon) ──
  const depBtn=document.getElementById('submitDepositBtn');
  if(depBtn) depBtn.innerHTML=`<i class="fas fa-arrow-down"></i> ${t.depositBtn}`;

  // ── Connect wallet button (keep icon) ──
  const connBtn=document.getElementById('connectWalletBtn');
  if(connBtn) connBtn.innerHTML=`<i class="fas fa-plug"></i> ${t.connectBtn}`;

  // ── Withdraw button (keep image) ──
  const wdBtn=document.getElementById('wdBtn');
  if(wdBtn){const img=wdBtn.querySelector('img');wdBtn.textContent=t.withdrawBtn;if(img)wdBtn.prepend(img);}

  // ── Copy buttons ──
  document.querySelectorAll('.btn-copy').forEach(el=>el.innerHTML=`<i class="fas fa-copy"></i> ${t.copyBtn}`);

  // ── Float add task ──
  const floatBtn=document.getElementById('floatAddTask');
  if(floatBtn) floatBtn.innerHTML=`➕ ${t.floatAdd}`;

  // ── Season 2 Banner ──
  const s2badge=document.getElementById('s2BadgeTxt'); if(s2badge) s2badge.textContent=t.s2BadgeTxt||'Coming Soon';
  const s2title=document.getElementById('s2BannerTitle'); if(s2title) s2title.textContent=t.s2BannerTitle||'Season 2 Preparation';
  const s2sub=document.getElementById('s2BannerSub'); if(s2sub) s2sub.textContent=t.s2BannerSub||'🎯 Check your allocation →';
  const s2tap=document.getElementById('s2TapTxt'); if(s2tap) s2tap.textContent=t.s2TapTxt||'Tap';

  // ── Season 2 Alloc Page Hero ──
  const snsHeroMain=document.getElementById('sns-hero-main-title'); if(snsHeroMain) snsHeroMain.textContent=t.snsHeroTitle||'Season 2 Preparation';
  const snsHeroSub=document.getElementById('sns-hero-sub-txt'); if(snsHeroSub) snsHeroSub.textContent=t.snsHeroSub||'Your progress carries forward';

  // ── walletAddressDisplay: only if still showing default ──
  const wadEl=document.getElementById('walletAddressDisplay');
  if(wadEl && (wadEl.textContent==='Not connected'||wadEl.textContent===TRANSLATIONS['en'].notConnected||wadEl.dataset.defaultShown==='1')){
    wadEl.textContent=t.notConnected; wadEl.dataset.defaultShown='1';
  }
}

/* ════ COMPETITION ════════════════════════════════════════════════ */
// Competition end date always comes from server — never computed locally
// Prize pool per competition
const COMP_PRIZES_ACTIVE = [50, 40, 30, 20, 10, 9, 8, 7, 6, 5, 2, 2, 2, 2, 2, 1, 1, 1, 1, 1]; // Top 5: 50,40,30,20,10 | 6-10: 9,8,7,6,5 | 11-15: 2 each | 16-20: 1 each = 200 TON
const COMP_PRIZES_MINING = [50, 40, 30, 20, 10, 9, 8, 7, 6, 5, 2, 2, 2, 2, 2, 1, 1, 1, 1, 1];

let _compTab = 'active';
let _compData = null;

function openCompPage(){
  document.getElementById('compPage').style.display='block';
  document.body.style.overflow='hidden';
  loadCompData();
  // Live countdown in header
  if(window._compCdInt) clearInterval(window._compCdInt);
  window._compCdInt=setInterval(()=>{
    const el=document.getElementById('comp-countdown-hdr');
    if(!el){clearInterval(window._compCdInt);return;}
    const end=_compData?.endDate||Date.now();
    el.textContent=fmtCountdown(end-Date.now());
    // refresh countdown chips inside panes
    ['comp-active-content','comp-mining-content'].forEach(id=>{
      const cd=document.querySelector(`#${id} [id^="cd_"]`);
      if(cd) cd.textContent=fmtCountdown(end-Date.now());
    });
  },1000);
  // spawn ambient particles on bg
  if(!window._compParticles){
    window._compParticles=true;
    const pg=document.getElementById('compPage');
    function spawnCompParticle(){
      if(document.getElementById('compPage').style.display==='none') return;
      const p=document.createElement('div');
      const emojis=['🎋','⭐','✨','🌟','💫'];
      p.textContent=emojis[Math.floor(Math.random()*emojis.length)];
      p.style.cssText=`position:fixed;left:${5+Math.random()*90}%;bottom:${80+Math.random()*10}px;font-size:${10+Math.random()*10}px;z-index:3;pointer-events:none;animation:float-particle ${1.5+Math.random()*2}s ease-out forwards;opacity:.5`;
      document.getElementById('compPage').appendChild(p);
      setTimeout(()=>p.remove(),3500);
    }
    window._compParticleInt=setInterval(spawnCompParticle,800);
  }
}
function closeCompPage(){
  document.getElementById('compPage').style.display='none';
  document.body.style.overflow='';
  if(window._compCdInt){clearInterval(window._compCdInt);window._compCdInt=null;}
  if(window._compParticleInt){clearInterval(window._compParticleInt);window._compParticleInt=null;window._compParticles=false;}
}
function openCompHelp(){
  const lang=localStorage.getItem('pandaLang')||'en';
  const T=TRANSLATIONS[lang]||TRANSLATIONS['en'];
  const isRtl=lang==='ar';
  const el=document.getElementById('compHelpContent');
  if(el) el.innerHTML=`<div style="font-size:12px;font-weight:600;color:var(--muted);line-height:1.9;direction:${isRtl?'rtl':'ltr'}">${T.compHelpBody||''}</div>`;
  const titleEl=document.querySelector('#compHelpBox [data-i18n="compHelpTitle"]');
  if(titleEl) titleEl.textContent=T.compHelpTitle||'Competition Guide';
  const modal=document.getElementById('compHelpModal');
  if(modal){modal.style.display='flex';}
}
function closeCompHelp(){
  const modal=document.getElementById('compHelpModal');
  if(modal) modal.style.display='none';
}

function switchCompTab(tab){
  _compTab=tab;
  const aEl=document.getElementById('ctab-active');
  const mEl=document.getElementById('ctab-mining');
  if(aEl){
    aEl.style.background = tab==='active' ? 'rgba(255,193,7,.15)' : 'rgba(255,255,255,.04)';
    aEl.style.border     = tab==='active' ? '2px solid rgba(255,193,7,.6)' : '1px solid rgba(255,255,255,.1)';
    aEl.style.color      = tab==='active' ? 'var(--coin)' : 'rgba(255,255,255,.35)';
  }
  if(mEl){
    mEl.style.background = tab==='mining' ? 'rgba(124,179,66,.15)' : 'rgba(255,255,255,.04)';
    mEl.style.border     = tab==='mining' ? '2px solid rgba(124,179,66,.6)' : '1px solid rgba(255,255,255,.1)';
    mEl.style.color      = tab==='mining' ? 'var(--bamboo)' : 'rgba(255,255,255,.35)';
  }
  document.getElementById('cpane-active').style.display = tab==='active' ? 'block':'none';
  document.getElementById('cpane-mining').style.display = tab==='mining' ? 'block':'none';
  if(_compData) renderCompetition(_compData);
}

async function loadCompData(){
  const lang=localStorage.getItem('pandaLang')||'en';
  const T=TRANSLATIONS[lang]||TRANSLATIONS['en'];
  // Show loading
  ['comp-active-content','comp-mining-content'].forEach(id=>{
    document.getElementById(id).innerHTML=`<div style="text-align:center;padding:30px;color:var(--muted);font-size:14px">⏳ ${T.loading||'Loading...'}</div>`;
  });
  try{
    const data = await api('getLeaderboard',{});
    _compData = data;
    renderCompetition(data);
  }catch(e){
    ['comp-active-content','comp-mining-content'].forEach(id=>{
      document.getElementById(id).innerHTML=`<div style="text-align:center;padding:30px;color:#ff8a80;font-size:13px">❌ ${e.message||'Failed to load'}</div>`;
    });
  }
}

function fmtCountdown(ms){
  if(ms<=0) return '00:00:00';
  const d=Math.floor(ms/86400000);
  const h=Math.floor((ms%86400000)/3600000);
  const m=Math.floor((ms%3600000)/60000);
  return d>0 ? `${d}d ${h}h ${m}m` : `${h}h ${m}m`;
}

function renderCompetition(data){
  const lang=localStorage.getItem('pandaLang')||'en';
  const T=TRANSLATIONS[lang]||TRANSLATIONS['en'];
  const msLeft = (data.endDate||Date.now()) - Date.now();
  const myUid = S.userId;
  const snap = data.mySnapshot||null; // {activeRefs, miningPerDay} at comp start

  // ── Active Refs competition ──
  const activeBoard = (data.activeRefs||[]).slice(0,50);
  const myActiveRank = activeBoard.findIndex(u=>u.userId===myUid);
  // Score = current active refs MINUS snapshot (growth since comp started)
  const activeNow = S._activeRefCount||0;
  const activeSnap = snap ? (snap.activeRefs||0) : activeNow; // if no snap yet, score=0
  const myActiveScore = myActiveRank>=0
    ? activeBoard[myActiveRank].score
    : Math.max(0, activeNow - activeSnap);

  renderCompPane('comp-active-content', {
    title: T.compActiveTitle||'💎 Active Referrals Competition',
    desc:  T.compActiveDesc||'Top 20 users with most active referrals (who deposited)',
    prizeTotal: '200 TON',
    endDate: msLeft,
    board: activeBoard,
    myRank: myActiveRank,
    myScore: myActiveScore,
    myScoreLbl: T.compActiveScoreLbl||'Active Refs',
    prizes: COMP_PRIZES_ACTIVE,
    scoreSuffix: T.compActiveScoreLbl||'refs',
    color: 'var(--coin)',
    colorRgb: '255,193,7',
    T,
  });

  // ── Mining Speed competition ──
  const miningBoard = (data.miningSpeed||[]).slice(0,50);
  const myMiningRank = miningBoard.findIndex(u=>u.userId===myUid);
  // Score = current mining/day MINUS snapshot (growth since comp started)
  const miningNow = Math.round((S.user?.miningRate||0)*24);
  const miningSnap = snap ? (snap.miningPerDay||0) : 0; // if no snap yet, show full mining score
  const myMiningScore = myMiningRank>=0
    ? miningBoard[myMiningRank].score
    : Math.max(0, miningNow - miningSnap);

  renderCompPane('comp-mining-content', {
    title: T.compMiningTitle||'⚡ Mining Speed Competition',
    desc:  T.compMiningDesc||'Top 20 users with highest mining rate',
    prizeTotal: '200 TON',
    endDate: msLeft,
    board: miningBoard,
    myRank: myMiningRank,
    myScore: myMiningScore,
    myScoreLbl: T.compMiningScoreLbl||'Bamboo/day',
    prizes: COMP_PRIZES_MINING,
    scoreSuffix: T.compMiningScoreLbl||'bam/day',
    color: 'var(--bamboo)',
    colorRgb: '124,179,66',
    T,
  });
}

function renderCompPane(elId, opt){
  const {title,desc,prizeTotal,endDate,board,myRank,myScore,myScoreLbl,prizes,scoreSuffix,color,colorRgb,T}=opt;
  const isActive = elId.includes('active');
  const scoreIcon = isActive
    ? `<img src="https://i.supaimg.com/ec27537b-aa6a-42cf-8ba1-d6850eeea36d/561b20f9-2900-4845-a7ac-55242dc38c28.png" style="width:16px;height:16px;object-fit:contain;border-radius:50%;vertical-align:middle">`
    : `<img src="https://i.supaimg.com/ec27537b-aa6a-42cf-8ba1-d6850eeea36d/d7e19f8c-7876-4dc6-8542-d4f615704e46.png"  style="width:16px;height:16px;object-fit:contain;vertical-align:middle">`;
  const PODIUM_IMGS = ['https://i.supaimg.com/ec27537b-aa6a-42cf-8ba1-d6850eeea36d/c1a1f7ec-be74-4951-a392-60aee63b33d6.png','https://i.supaimg.com/ec27537b-aa6a-42cf-8ba1-d6850eeea36d/9ef58f91-8445-48ad-a605-24df120891c7.png','https://i.supaimg.com/ec27537b-aa6a-42cf-8ba1-d6850eeea36d/9a976d18-be04-449f-81b5-27fd504946dd.png'];
  const myWinning  = myRank>=0 && myRank<20;
  const rankDisp   = myRank>=0 ? `#${myRank+1}` : (T.compUnranked||'Unranked');
  const rankColor  = myWinning ? '#FFD700' : myRank>=0 ? 'rgba(255,255,255,.6)' : 'rgba(255,255,255,.22)';
  const rankShadow = myWinning ? '0 0 20px rgba(255,215,0,.9)' : 'none';

  let html=`

  <!-- ═══ HERO SECTION (cup + timer + top20) ═══ -->
  <div style="position:relative;padding:0 8px 0;margin-bottom:6px">

    <!-- ambient glow behind cup -->
    <div style="position:absolute;top:10px;left:50%;transform:translateX(-50%);width:180px;height:180px;background:radial-gradient(circle,rgba(255,215,0,.22) 0%,rgba(124,179,66,.1) 40%,transparent 70%);border-radius:50%;z-index:0;animation:cup-glow 2.5s ease-in-out infinite"></div>

    <!-- Center: giant cup -->
    <div style="display:flex;justify-content:center;position:relative;z-index:1;margin-bottom:4px">
      <img src="https://i.supaimg.com/ec27537b-aa6a-42cf-8ba1-d6850eeea36d/fd38c49f-0b7a-4531-b791-aca220f9802c.png" style="width:190px;height:190px;object-fit:contain;filter:drop-shadow(0 0 24px rgba(255,215,0,.55)) drop-shadow(0 8px 20px rgba(0,0,0,.6));animation:cup-float 3s ease-in-out infinite">
    </div>

    <!-- Row: timer  [cup above]  top20 -->
    <div style="display:flex;align-items:center;justify-content:space-between;margin-top:-28px;position:relative;z-index:2;padding:0 4px">

      <!-- Timer card (left) -->
      <div style="position:relative;width:110px;height:75px;border-radius:40px;overflow:hidden;flex-shrink:0">
        <img src="https://i.supaimg.com/ec27537b-aa6a-42cf-8ba1-d6850eeea36d/17d3a8cd-b9d1-4d12-a478-a0e4764c75ae.png" style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover">
        <div style="position:absolute;inset:0;background:rgba(0,0,0,.28);border-radius:40px"></div>
        <div style="position:relative;z-index:1;height:100%;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:2px">
          <div id="cd_${elId}" style="font-size:14px;font-weight:800;color:#fff;text-shadow:0 0 10px rgba(255,140,60,.9);letter-spacing:.3px;line-height:1">${fmtCountdown(endDate)}</div>
          <div style="font-size:8px;font-weight:700;color:rgba(255,255,255,.65);text-transform:uppercase;letter-spacing:1px">${T.compEnds||'ENDS IN'}</div>
        </div>
      </div>

      <!-- Spacer (cup is above in flow) -->
      <div style="flex:1"></div>

      <!-- Top20 card (right) -->
      <div style="position:relative;width:100px;height:70px;border-radius:14px;overflow:hidden;flex-shrink:0">
        <img src="https://i.supaimg.com/ec27537b-aa6a-42cf-8ba1-d6850eeea36d/d03d5885-157e-4ee9-8ab5-dbe6fc358e33.png" style="width:100%;height:100%;object-fit:cover;display:block">
      </div>
    </div>
  </div>

  <!-- ═══ MY STATS CARD ═══ -->
  <div style="margin:10px 8px 8px;background:rgba(0,0,0,.55);border:1px solid rgba(${colorRgb},.28);border-radius:20px;padding:14px 18px;backdrop-filter:blur(14px)">
    <div style="display:flex;align-items:center;justify-content:space-between">
      <div>
        <div style="font-size:9px;font-weight:700;color:rgba(255,255,255,.4);text-transform:uppercase;letter-spacing:1px;margin-bottom:6px">${T.compMyScore||'YOUR SCORE'}</div>
        <div style="display:flex;align-items:center;gap:7px">
          ${scoreIcon}
          <span style="font-size:28px;font-weight:800;color:#fff;line-height:1">${fmt(myScore)}</span>
          <span style="font-size:11px;color:rgba(255,255,255,.38);font-weight:600;margin-top:6px">${scoreSuffix}</span>
        </div>
      </div>
      <div style="text-align:right">
        <div style="font-size:9px;font-weight:700;color:rgba(255,255,255,.4);text-transform:uppercase;letter-spacing:1px;margin-bottom:6px">${T.compMyRank||'YOUR RANK'}</div>
        <div style="font-size:36px;font-weight:800;line-height:1;color:${rankColor};text-shadow:${rankShadow}">${rankDisp}</div>
      </div>
    </div>
  </div>

  <!-- ═══ WINNING BANNER ═══ -->
  ${myWinning ? `
  <div style="margin:0 8px 10px;padding:12px 18px;background:linear-gradient(135deg,rgba(15,40,15,.85),rgba(5,20,5,.9));border:1px solid rgba(255,215,0,.3);border-radius:16px;display:flex;align-items:center;justify-content:space-between;animation:winning-pulse 2s ease-in-out infinite;backdrop-filter:blur(8px)">
    <div style="display:flex;align-items:center;gap:8px">
      <span style="font-size:22px">🐼</span>
      <span style="font-size:14px;font-weight:800;color:#c8e6c9">${T.compWinning||'You are winning!'} <span style="font-size:14px">✨</span></span>
    </div>
    <div style="font-size:22px;font-weight:800;color:#FFD700;text-shadow:0 0 16px rgba(255,215,0,.8)">${prizes[myRank]||0} TON</div>
  </div>` : ''}

  <!-- ═══ PODIUM (chairs style) ═══ -->`;

  if(board.length>=1){
    /* 2nd left, 1st center (biggest), 3rd right */
    const CONF=[
      {i:1, podImg:'https://i.supaimg.com/ec27537b-aa6a-42cf-8ba1-d6850eeea36d/9ef58f91-8445-48ad-a605-24df120891c7.png', wrapW:'30%', podH:'90px',  avSize:'46px', nameSz:'11px', mt:'30px', crowned:false},
      {i:0, podImg:'https://i.supaimg.com/ec27537b-aa6a-42cf-8ba1-d6850eeea36d/c1a1f7ec-be74-4951-a392-60aee63b33d6.png', wrapW:'38%', podH:'118px', avSize:'58px', nameSz:'13px', mt:'0',    crowned:true },
      {i:2, podImg:'https://i.supaimg.com/ec27537b-aa6a-42cf-8ba1-d6850eeea36d/9a976d18-be04-449f-81b5-27fd504946dd.png', wrapW:'30%', podH:'75px',  avSize:'38px', nameSz:'10px', mt:'46px', crowned:false},
    ];
    const BORDER_COLS=['#FFD700','#C0C0C0','#CD7F32'];

    html+=`<div style="display:flex;align-items:flex-end;justify-content:center;gap:2px;padding:6px 4px 0;margin-bottom:18px">`;
    for(const conf of CONF){
      const u=board[conf.i]; if(!u) continue;
      const isMe=u.userId===S.userId;
      const bCol=BORDER_COLS[conf.i];
      const prizeAmt=prizes[conf.i];
      const av=u.photo
        ?`<img src="${esc(u.photo)}" style="width:${conf.avSize};height:${conf.avSize};border-radius:50%;object-fit:cover;border:2.5px solid ${bCol};box-shadow:0 0 ${conf.i===0?'18px rgba(255,215,0,.6)':'10px rgba(200,200,200,.2)'}"  onerror="this.style.display='none'">`
        :`<div style="width:${conf.avSize};height:${conf.avSize};border-radius:50%;background:rgba(0,0,0,.5);border:2.5px solid ${bCol};display:flex;align-items:center;justify-content:center;font-size:${conf.i===0?'26':'18'}px">🐼</div>`;
      const medal=conf.i===0?'👑':conf.i===1?'🥈':'🥉';
      const glowColor=conf.i===0?'rgba(255,215,0,.7)':conf.i===1?'rgba(192,192,192,.4)':'rgba(205,127,50,.4)';
      html+=`
      <div style="width:${conf.wrapW};display:flex;flex-direction:column;align-items:center;margin-top:${conf.mt};animation:podium-rise ${0.2+conf.i*0.15}s ease-out both">
        <!-- medal -->
        <div style="font-size:${conf.i===0?'22':'17'}px;margin-bottom:4px;filter:drop-shadow(0 0 6px ${glowColor})">${medal}</div>
        <!-- avatar -->
        <div style="position:relative;margin-bottom:5px">
          ${av}
          ${isMe?`<div style="position:absolute;inset:-3px;border-radius:50%;border:2px solid ${color};animation:winning-pulse 1.5s ease-in-out infinite"></div>`:''}
        </div>
        <!-- name -->
        <div style="font-size:${conf.nameSz};font-weight:800;color:${isMe?color:'rgba(255,255,255,.9)'};text-align:center;max-width:90%;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;text-shadow:${isMe?'0 0 8px rgba('+colorRgb+',.6)':'0 1px 4px rgba(0,0,0,.8)'};margin-bottom:4px">${esc(u.name||'Panda')}</div>
        <!-- score -->
        <div style="display:flex;align-items:center;gap:3px;background:rgba(0,0,0,.55);border:1px solid rgba(${colorRgb},.3);border-radius:10px;padding:2px 8px;margin-bottom:4px">
          ${scoreIcon}<span style="font-size:${conf.i===0?'12':'10'}px;font-weight:800;color:${color}">${fmt(u.score)}</span>
        </div>
        <!-- prize -->
        <div style="background:${conf.i===0?'linear-gradient(135deg,rgba(255,215,0,.28),rgba(255,165,0,.14))':'rgba(0,0,0,.4)'};border:1px solid ${conf.i===0?'rgba(255,215,0,.6)':'rgba(255,255,255,.15)'};border-radius:10px;padding:3px 10px;font-size:${conf.i===0?'13':'11'}px;font-weight:800;color:${conf.i===0?'#FFD700':'rgba(255,255,255,.7)'};text-shadow:${conf.i===0?'0 0 10px rgba(255,215,0,.7)':'none'};margin-bottom:5px;white-space:nowrap">${prizeAmt} TON</div>
        <!-- chair/podium image -->
        <img src="${conf.podImg}" style="width:100%;height:${conf.podH};object-fit:cover;object-position:top;border-radius:8px 8px 0 0;display:block;filter:drop-shadow(0 -4px 12px ${glowColor})">
      </div>`;
    }
    html+=`</div>`;
  }

  <!-- ═══ LEADERBOARD ROWS 4-50 ═══ -->
  html+=`
  <div style="padding:0 8px">
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px">
      <div style="display:flex;align-items:center;gap:7px">
        <div style="width:3px;height:16px;background:linear-gradient(180deg,${color} 0%,transparent 100%);border-radius:2px"></div>
        <span style="font-size:13px;font-weight:800;color:rgba(255,255,255,.6)">${T.compLeaderboard||'🏅 Leaderboard'}</span>
      </div>
      <div style="font-size:10px;font-weight:700;color:rgba(${colorRgb},.9);background:rgba(${colorRgb},.12);border:1px solid rgba(${colorRgb},.25);border-radius:20px;padding:3px 11px">Top 50</div>
    </div>
    <div style="display:flex;flex-direction:column;gap:5px">`;

  if(!board.length){
    html+=`<div style="text-align:center;padding:44px 20px;color:rgba(255,255,255,.22);font-size:13px;font-weight:600">${T.compEmpty||'No participants yet. Be the first!'}</div>`;
  } else {
    board.forEach((u,i)=>{
      if(i<3) return;
      const prize=i<20?prizes[i]:null;
      const isMe=u.userId===S.userId;
      const isTop=i<20;
      const rowBg   = isMe?`rgba(${colorRgb},.1)`:isTop?'rgba(255,255,255,.035)':'rgba(255,255,255,.018)';
      const rowBord = isMe?`1.5px solid rgba(${colorRgb},.42)`:isTop?'1px solid rgba(255,255,255,.07)':'1px solid rgba(255,255,255,.03)';
      const rowShad = isMe?`0 0 20px rgba(${colorRgb},.18)`:'none';
      const av=u.photo
        ?`<img src="${esc(u.photo)}" style="width:38px;height:38px;border-radius:50%;object-fit:cover;border:1.5px solid rgba(${colorRgb},${isMe?.5:.1})" onerror="this.outerHTML='<div style=\'width:38px;height:38px;border-radius:50%;background:rgba(0,0,0,.5);display:flex;align-items:center;justify-content:center;font-size:15px\'>🐼</div>'">`
        :`<div style="width:38px;height:38px;border-radius:50%;background:rgba(0,0,0,.5);border:1.5px solid rgba(255,255,255,.07);display:flex;align-items:center;justify-content:center;font-size:15px">🐼</div>`;
      const badgeBg = isTop
        ?`linear-gradient(135deg,rgba(${colorRgb},.3),rgba(${colorRgb},.1))`
        :'rgba(255,255,255,.04)';
      html+=`<div style="display:flex;align-items:center;gap:9px;padding:9px 12px;background:${rowBg};border:${rowBord};border-radius:14px;box-shadow:${rowShad};backdrop-filter:blur(6px)">
        <div style="min-width:28px;height:28px;border-radius:8px;background:${badgeBg};display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:800;color:${isTop?color:'rgba(255,255,255,.25)'};flex-shrink:0">${i+1}</div>
        ${av}
        <div style="flex:1;min-width:0">
          <div style="font-size:13px;font-weight:800;color:${isMe?color:'rgba(255,255,255,.85)'};white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(u.name||'Panda')}${isMe?' ✦':''}</div>
          <div style="display:flex;align-items:center;gap:4px;margin-top:2px">${scoreIcon}<span style="font-size:11px;font-weight:600;color:rgba(255,255,255,.38)">${fmt(u.score)} ${scoreSuffix}</span></div>
        </div>
        <div style="text-align:right;flex-shrink:0;min-width:44px">
          ${prize
            ?`<div style="font-size:13px;font-weight:800;color:#FFD700;text-shadow:0 0 8px rgba(255,215,0,.5);line-height:1.1">${prize}</div><div style="font-size:9px;font-weight:600;color:rgba(255,215,0,.5)">TON</div>`
            :`<div style="font-size:20px;color:rgba(255,255,255,.07)">—</div>`}
        </div>
      </div>`;
    });
  }
  html+=`</div></div>`;
  document.getElementById(elId).innerHTML=html;
}

/* ════ NEW SEASON ALLOCATION ════ */
// Competition prizes by rank (1-indexed, ranks 1-20)
const SNS_COMP_PRIZES = [50,40,30,20,10,9,8,7,6,5,2,2,2,2,2,1,1,1,1,1];

function snsSetRow(id, rightHtml){
  const el = document.getElementById(id);
  if(!el) return;
  const right = el.querySelector('.sns-row-right');
  if(right) right.innerHTML = rightHtml;
}

function snsCoinsRight(coins, sub){
  return `<div class="sns-val-coins">${fmt(coins)}</div><div class="sns-val-sub">${sub}</div>`;
}

function snsTonRight(ton, rankBadge){
  if(ton > 0){
    return `${rankBadge?`<div class="sns-val-badge">🏆 #${rankBadge}</div>`:''}
    <div class="sns-val-ton">${ton} TON</div><div class="sns-val-sub">Competition Prize</div>`;
  }
  return `<div class="sns-empty-tag">Not in top 20</div>`;
}

async function loadSeasonAlloc(){
  // Reset to loading
  ['sns-row-coins','sns-row-refs','sns-row-comp'].forEach(id=>{
    snsSetRow(id,'<div class="sns-spin"></div>');
  });
  document.getElementById('sns-total').style.display='none';

  // Fetch competition data if not yet loaded
  if(!_compData){
    try{
      const ld = await api('getLeaderboard',{});
      _compData = ld;
    }catch(_){}
  }

  // 1. Coins balance — 20% carry over
  const coins = S.user?.coins || 0;
  const coinsAlloc = Math.floor(coins * 0.20);
  snsSetRow('sns-row-coins', snsCoinsRight(coinsAlloc, `20% of ${fmt(coins)} Coins`));

  // 2. Active referrals — 3000 each
  const activeRefs = (S.refs||[]).filter(r=>r.hasDeposited).length;
  const refsAlloc = activeRefs * 3000;
  const refBadge = activeRefs > 0
    ? `<div class="sns-val-badge">+${fmt(refsAlloc)}</div><div class="sns-val-sub">${activeRefs} active × 3,000</div>`
    : `<div class="sns-val-coins">0</div><div class="sns-val-sub">No active referrals yet</div>`;
  snsSetRow('sns-row-refs', refBadge);

  // 3. Competition rank → TON prize
  let compTon = 0;
  let myRank = 0;
  let compAlloc = 0;
  try{
    // Use cached leaderboard data if available, else try to get from _compData
    const lb = _compData || {};
    const myId = S.userId;
    // Find rank in both boards, take best rank
    ['activeRefs','miningSpeed'].forEach(tab=>{
      const board = (lb[tab]||[]);
      const idx = board.findIndex(u=>String(u.userId)===String(myId));
      if(idx>=0 && idx<20){
        const rank = idx+1;
        if(!myRank || rank < myRank) myRank = rank;
      }
    });
    if(myRank > 0 && myRank <= SNS_COMP_PRIZES.length){
      compTon = SNS_COMP_PRIZES[myRank-1];
    }
  }catch(_){}

  // Show competition row
  const compDesc = document.getElementById('sns-comp-desc');
  if(compDesc) compDesc.textContent = myRank > 0 ? `Rank #${myRank} in competition` : 'Based on your leaderboard position';
  snsSetRow('sns-row-comp', snsTonRight(compTon, myRank > 0 ? myRank : null));

  // Total: Coins (rows 1+2) separately from TON (row 3)
  const totalCoins = coinsAlloc + refsAlloc;

  document.getElementById('sns-total-coins-num').textContent = fmt(totalCoins);
  document.getElementById('sns-total-ton-num').textContent   = compTon > 0 ? compTon : '0';
  document.getElementById('sns-total').style.display = 'block';

  // Save to DB (fire-and-forget)
  api('saveSeasonAlloc',{
    coinsAlloc, refsAlloc, compAlloc:0, compRank: myRank, compTon,
    total: totalCoins, totalTon: String(compTon)
  }).catch(()=>{});
}

/* ════ END COMPETITION ════ */
