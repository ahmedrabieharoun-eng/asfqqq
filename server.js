// ================================================================
//  BALI RALLY — Cloudflare Worker v4.0
//  Firebase Realtime Database
//  Environment Variables:
//    FIREBASE_DATABASE_URL  e.g. https://YOUR-DB.firebaseio.com
//    FIREBASE_API_KEY       Firebase API key
//    BOT_TOKEN              Telegram Bot Token
//    ADMIN_IDS              comma-separated admin Telegram IDs
// ================================================================

const G = {
  TON_PER_COIN:0.00005,
  MIN_WITHDRAW:200,
  MIN_DEPOSIT_TON:1,
  REF_BONUS_PCT:20,
  WELCOME_COINS:200000,
  UPGRADE_INCREMENTS:{ speed:5, nitro:5, accel:5, maneuver:3 },
  REF_TASKS:{
    r1  :{n:1,   coins:2   },
    r5  :{n:5,   coins:10  },
    r10 :{n:10,  coins:25  },
    r20 :{n:20,  coins:60  },
    r50 :{n:50,  coins:150 },
    r70 :{n:70,  coins:220 },
    r100:{n:100, coins:400 },
    r200:{n:200, coins:800 },
    r500:{n:500, coins:2000},
  },
  REF_ACTIVE_TASKS:{
    ra1  :{n:1,   coins:40   },
    ra5  :{n:5,   coins:200  },
    ra10 :{n:10,  coins:500  },
    ra20 :{n:20,  coins:1200 },
    ra50 :{n:50,  coins:3000 },
    ra70 :{n:70,  coins:4400 },
    ra100:{n:100, coins:8000 },
    ra200:{n:200, coins:16000},
    ra500:{n:500, coins:40000},
  },
  SOC_TASKS:{
    tg_payouts:1000,
    tg_news   :500,
    tg_ch     :1000,
    tg_grp    :500,
    tg_bot    :300,
  },
  BOT_USERNAME:'PandaBamboBot',
};

// Bike base stats
const BIKE_BASE_STATS = {
  1 :{ speed:40,  nitro:20,  accel:15, maneuver:10, price:1   },
  2 :{ speed:60,  nitro:35,  accel:25, maneuver:16, price:5   },
  3 :{ speed:90,  nitro:55,  accel:38, maneuver:24, price:10  },
  4 :{ speed:135, nitro:85,  accel:57, maneuver:36, price:20  },
  5 :{ speed:200, nitro:130, accel:85, maneuver:50, price:50  },
  6 :{ speed:300, nitro:200, accel:125,maneuver:70, price:100 },
  7 :{ speed:450, nitro:300, accel:180,maneuver:95, price:200 },
  8 :{ speed:700, nitro:450, accel:260,maneuver:130,price:250 },
  9 :{ speed:1100,nitro:700, accel:380,maneuver:180,price:400 },
  10:{ speed:1800,nitro:1100,accel:550,maneuver:250,price:500 },
};

const BIKE_DAILY_TON = {
  1:0.022, 2:0.111, 3:0.222, 4:0.444, 5:1.11,
  6:2.22, 7:4.44, 8:5.55, 9:8.88, 10:11.11,
};
const BIKE_MINING_MS = 24*60*60*1000;

// Default partner tasks
const DEFAULT_PARTNER_TASKS = [
  { id:'partner_payouts', name:'Join Payouts Channel', type:'channel', link:'https://t.me/PandaBambooPayouts', bambooReward:100, targetUsers:null, status:'active', isDefault:true },
  { id:'partner_news',    name:'Join News Channel',    type:'channel', link:'https://t.me/PandaMiningNews',   bambooReward:100, targetUsers:null, status:'active', isDefault:true },
];

async function seedPartnerTasks(env){
  try{
    const tpr=await dbGet(env,'tasks/partner');
    const existing=tpr.data||{};
    for(const task of DEFAULT_PARTNER_TASKS){
      if(!existing[task.id]){
        const now=Date.now();
        await dbSet(env,`tasks/partner/${task.id}`,{...task,completions:0,completedBy:[],createdAt:now,updatedAt:now});
      }
    }
  }catch(e){console.error('seedPartnerTasks:',e.message);}
}

async function sendTgNotification(env,userId,message){
  try{
    if(!env.BOT_TOKEN) return;
    await fetch(`https://api.telegram.org/bot${env.BOT_TOKEN}/sendMessage`,{
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({chat_id:userId,text:message,parse_mode:'HTML'}),
    });
  }catch(e){console.error('sendTgNotification:',e.message);}
}

const CORS={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Methods':'GET, POST, OPTIONS','Access-Control-Allow-Headers':'Content-Type, Authorization, X-Action','Access-Control-Max-Age':'86400'};
const JSON_CT={'Content-Type':'application/json',...CORS};
const jRes=(b,s=200)=>new Response(JSON.stringify(b),{status:s,headers:JSON_CT});
const ok=d=>jRes({success:true,data:d});
const fail=(m,s=400)=>jRes({success:false,error:m},s);

function sanitise(i){if(!i)return i;return i.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi,'').replace(/[<>]/g,m=>m==='<'?'&lt;':'&gt;');}

// Firebase helpers
function fbUrl(env,path){
  const b=env.FIREBASE_DATABASE_URL?.replace(/\/$/,'');
  if(!b)throw new Error('FIREBASE_DATABASE_URL not set');
  const k=env.FIREBASE_API_KEY;
  if(!k)throw new Error('FIREBASE_API_KEY not set');
  return `${b}/${path.replace(/^\//,'')}.json?key=${k}`;
}
async function dbGet(env,path){try{const r=await fetch(fbUrl(env,path));if(!r.ok)throw new Error(`GET ${r.status}`);return{success:true,data:await r.json()};}catch(e){console.error('DB GET',path,e.message);return{success:false,error:e.message};}}
async function dbSet(env,path,data){try{const r=await fetch(fbUrl(env,path),{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)});if(!r.ok)throw new Error(`SET ${r.status}`);return{success:true};}catch(e){console.error('DB SET',path,e.message);return{success:false,error:e.message};}}
async function dbUpdate(env,path,updates){try{const r=await fetch(fbUrl(env,path),{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify(updates)});if(!r.ok)throw new Error(`UPDATE ${r.status}`);return{success:true};}catch(e){console.error('DB UPDATE',path,e.message);return{success:false,error:e.message};}}
async function dbPush(env,path,data){try{const r=await fetch(fbUrl(env,path),{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)});if(!r.ok)throw new Error(`PUSH ${r.status}`);const j=await r.json();return{success:true,data:{id:j.name}};}catch(e){console.error('DB PUSH',path,e.message);return{success:false,error:e.message};}}
async function dbDelete(env,path){try{const r=await fetch(fbUrl(env,path),{method:'DELETE'});if(!r.ok)throw new Error(`DELETE ${r.status}`);return{success:true};}catch(e){console.error('DB DELETE',path,e.message);return{success:false,error:e.message};}}

// Rate limiter
const _rl=new Map();
function rateOk(ip){const now=Date.now();const d=_rl.get(ip)||{c:0,r:now+60000};if(now>d.r){d.c=0;d.r=now+60000;}d.c++;_rl.set(ip,d);return d.c<=60;}

// Per-user per-action cooldown
const _userActionTs=new Map();
const ACTION_COOLDOWNS={withdraw:5000,claimTask:2500,verifyTask:2500,createTask:5000,buyBike:2500,upgradeStats:2500,deposit:2500,startBikeMining:2500,claimBikeMining:2500};
function userActionOk(uid,action){const cd=ACTION_COOLDOWNS[action];if(!cd)return true;const key=`${uid}:${action}`;const now=Date.now();const last=_userActionTs.get(key)||0;if(now-last<cd)return false;_userActionTs.set(key,now);return true;}

// Logging
const BALANCE_CHANGE_EVENTS=new Set(['withdraw_request','deposit_completed','claim_task','verify_task','create_task','admin_set_balance','admin_confirm_deposit','referral_commission','buy_bike','upgrade_stats','bike_mining_start','bike_mining_claim']);
function log(env,uid,type,details={},meta={}){
  if(!BALANCE_CHANGE_EVENTS.has(type))return;
  const ts=Date.now();const date=new Date(ts).toISOString();
  const entry={ts,date,type,...details};
  dbPush(env,`users/${uid}/log`,entry).catch(e=>console.error('LOG ERROR:',e.message));
}

// Telegram validation
async function validateTg(initData,botToken){
  try{
    if(!initData)return{valid:false,error:'No init data'};
    const p=new URLSearchParams(initData);
    const startParam=(p.get('start_param')||'').replace(/\D/g,'');
    if(!botToken){const u=p.get('user');if(!u)return{valid:false,error:'No user'};return{valid:true,user:JSON.parse(decodeURIComponent(u)),startParam};}
    const hash=p.get('hash');if(!hash)return{valid:false,error:'No hash'};
    p.delete('hash');
    const authDate=parseInt(p.get('auth_date')||'0');
    if(Date.now()/1000-authDate>900)return{valid:false,error:'Expired'};
    const dc=[...p.entries()].sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>`${k}=${v}`).join('\n');
    const enc=new TextEncoder();
    const sec=await crypto.subtle.importKey('raw',enc.encode('WebAppData'),{name:'HMAC',hash:'SHA-256'},false,['sign']);
    const kb=await crypto.subtle.sign('HMAC',sec,enc.encode(botToken));
    const key=await crypto.subtle.importKey('raw',kb,{name:'HMAC',hash:'SHA-256'},false,['sign']);
    const sig=await crypto.subtle.sign('HMAC',key,enc.encode(dc));
    const hex=[...new Uint8Array(sig)].map(b=>b.toString(16).padStart(2,'0')).join('');
    if(hex!==hash)return{valid:false,error:'Bad hash'};
    const u=p.get('user');if(!u)return{valid:false,error:'No user'};
    return{valid:true,user:JSON.parse(decodeURIComponent(u)),startParam};
  }catch(e){return{valid:false,error:e.message};}
}

function extractStartParam(initDataStr){
  try{
    const p=new URLSearchParams(initDataStr||'');
    const sp=p.get('start_param');
    if(sp)return sp.replace(/\D/g,'');
    const userRaw=p.get('user');
    if(userRaw){const u=JSON.parse(decodeURIComponent(userRaw));if(u.start_param)return String(u.start_param).replace(/\D/g,'');}
  }catch(_){}
  return '';
}

async function registerReferral(env,uid,user,referrerId){
  try{
    const rr=await dbGet(env,`users/${referrerId}/referrals`);
    const refs=rr.data||{};
    if(!refs[uid]){
      await dbSet(env,`users/${referrerId}/referrals/${uid}`,{userId:uid,firstName:user.firstName,lastName:user.lastName,username:user.username,photoUrl:user.photoUrl,joinedAt:Date.now(),earned:0});
      const notifKey=`notifSent/ref_${uid}_${referrerId}`;
      const already=await dbGet(env,notifKey);
      if(!already.data){
        const myTs=Date.now();
        await dbSet(env,notifKey,{ts:myTs,by:uid});
        await new Promise(r=>setTimeout(r,150));
        const confirm=await dbGet(env,notifKey);
        if(confirm.data&&confirm.data.ts===myTs){
          const refName=(user.firstName||'Someone').slice(0,32);
          sendTgNotification(env,referrerId,`🎉 <b>${refName}</b> joined using your referral link!\n\n🏍️ You will earn 20% commission on their purchases.`).catch(()=>{});
        }
      }
    }
  }catch(e){console.error('registerReferral:',e.message);}
}

function makeUser(uid,tg={},ref=null){
  return{
    userId:uid,
    firstName:(tg.first_name||'').slice(0,64),
    lastName:(tg.last_name||'').slice(0,64),
    username:(tg.username||'').slice(0,64),
    photoUrl:(tg.photo_url||'').slice(0,512),
    coins:G.WELCOME_COINS,
    totalEarned:0,
    ownedBikes:[],
    bikeUpgrades:{},
    bikeMining:{},
    hasDeposited:false,
    tonBalance:0,
    referralCode:String(uid),
    referredBy:ref||null,
    completedTasks:[],
    createdAt:Date.now(),
    welcomeBonusGiven:true,
  };
}

// ── getState ─────────────────────────────────────────────────────
async function hGetState(env,uid,tg,data={},_meta={}){
  try{
    const rawRef=(
      data?._startParam||
      extractStartParam(data?._initData||'')||
      (data?.start_param||'').toString().replace(/\D/g,'')
    ).replace(/\D/g,'');
    const ref=rawRef&&rawRef!==uid?rawRef:null;

    const ur=await dbGet(env,`users/${uid}`);let user=ur.data;
    seedPartnerTasks(env).catch(()=>{});

    if(!user){
      user=makeUser(uid,tg,ref);
      if(user.referredBy)await registerReferral(env,uid,user,user.referredBy);
      await dbSet(env,`users/${uid}`,user);
    }else{
      let needsSave=false;
      if(!user.welcomeBonusGiven){
        user.coins=(user.coins||0)+G.WELCOME_COINS;
        user.welcomeBonusGiven=true;
        needsSave=true;
      }
      if(tg){
        if(tg.first_name)user.firstName=tg.first_name.slice(0,64);
        if(tg.last_name) user.lastName=tg.last_name.slice(0,64);
        if(tg.username)  user.username=tg.username.slice(0,64);
        if(tg.photo_url) user.photoUrl=tg.photo_url.slice(0,512);
      }
      user.bikeMining=user.bikeMining||{};
      await dbUpdate(env,`users/${uid}`,{
        firstName:user.firstName,lastName:user.lastName,
        username:user.username,photoUrl:user.photoUrl,
        bikeMining:user.bikeMining,
        ...(needsSave?{coins:user.coins,welcomeBonusGiven:true}:{}),
      });
    }
    const settled=await settleBikeMining(env,uid,user,_meta);
    user=settled.user;
    const rr=await dbGet(env,`users/${uid}/referrals`);
    const refList=Object.values(rr.data||{});
    const referrals=await Promise.all(refList.map(async r=>{
      let deposited=r.hasDeposited||false;
      if(!deposited){
        const ud=await dbGet(env,`users/${r.userId}/hasDeposited`);
        deposited=ud.data===true;
        if(deposited)await dbUpdate(env,`users/${uid}/referrals/${r.userId}`,{hasDeposited:true}).catch(()=>{});
      }
      return{userId:r.userId,name:`${r.firstName||''} ${r.lastName||''}`.trim()||'Friend',photo:r.photoUrl||null,date:r.joinedAt?new Date(r.joinedAt).toLocaleDateString():'',earned:r.earned||0,hasDeposited:deposited};
    }));
    const wr=await dbGet(env,`users/${uid}/wdHistory`);
    const wdHistory=wr.data?Object.values(wr.data).sort((a,b)=>b.ts-a.ts).slice(0,30):[];
    const tpr=await dbGet(env,'tasks/partner');
    const tcr=await dbGet(env,'tasks/community');
    const tasks={
      partner  :tpr.data?Object.values(tpr.data).filter(t=>t.status==='active'):[],
      community:tcr.data?Object.values(tcr.data).filter(t=>t.status==='active'):[],
    };
    const lr=await dbGet(env,`users/${uid}/log`);
    const balanceLog=lr.data?Object.values(lr.data).sort((a,b)=>b.ts-a.ts).slice(0,50):[];
    return{success:true,data:{
      user:{
        coins:user.coins||0,
        totalEarned:user.totalEarned||0,
        hasDeposited:user.hasDeposited||false,
        tonBalance:user.tonBalance||0,
        ownedBikes:user.ownedBikes||[],
        bikeUpgrades:user.bikeUpgrades||{},
        bikeMining:user.bikeMining||{},
      },
      referrals,
      completedTasks:user.completedTasks||[],
      wdHistory,
      balanceLog,
      tasks,
    }};
  }catch(e){console.error('getState',e);return{success:false,error:e.message,errorCode:'GET_STATE_ERROR'};}
}

// ── Buy Bike ─────────────────────────────────────────────────────
async function hBuyBike(env,uid,data,_meta={}){
  try{
    const lv=parseInt(data.lv)||0;
    const bike=BIKE_BASE_STATS[lv];
    if(!bike)return{success:false,error:'Unknown bike level'};
    const r=await dbGet(env,`users/${uid}`);const user=r.data;
    if(!user)return{success:false,error:'User not found'};
    const owned=(user.ownedBikes||[]).map(Number);
    if(owned.includes(lv))return{success:false,error:'Bike already owned'};
    const priceTon=bike.price;
    if((user.tonBalance||0)<priceTon)return{success:false,error:`Need ${priceTon} TON. Your balance: ${(user.tonBalance||0).toFixed(2)} TON`};
    const newTon=Math.round(((user.tonBalance||0)-priceTon)*1e8)/1e8;
    const newOwned=[...owned,lv];
    await dbUpdate(env,`users/${uid}`,{tonBalance:newTon,ownedBikes:newOwned});
    log(env,uid,'buy_bike',{bikeLevel:lv,price:priceTon,tonBalance_before:user.tonBalance||0,tonBalance_after:newTon},_meta);
    if(user.referredBy&&user.referredBy!==uid){
      const comm=Math.floor(priceTon*G.REF_BONUS_PCT/100);
      const rr=await dbGet(env,`users/${user.referredBy}`);
      if(rr.data){
        await dbUpdate(env,`users/${user.referredBy}`,{tonBalance:(rr.data.tonBalance||0)+comm});
        sendTgNotification(env,user.referredBy,`💰 Commission! ${user.firstName||'Friend'} bought a bike. +${comm} TON (20%)`).catch(()=>{});
      }
    }
    return{success:true,data:{tonBalance:newTon,ownedBikes:newOwned}};
  }catch(e){return{success:false,error:e.message};}
}

// ── Upgrade Bike Stats ──────────────────────────────────────────
async function hUpgradeStats(env,uid,data,_meta={}){
  try{
    const{bikeLevel,stat}=data;
    const lv=parseInt(bikeLevel)||0;
    const validStats=['speed','nitro','accel','maneuver'];
    if(!validStats.includes(stat))return{success:false,error:'Invalid stat'};
    const bike=BIKE_BASE_STATS[lv];
    if(!bike)return{success:false,error:'Unknown bike'};
    const r=await dbGet(env,`users/${uid}`);const user=r.data;
    if(!user)return{success:false,error:'User not found'};
    if(!(user.ownedBikes||[]).map(Number).includes(lv))return{success:false,error:'Bike not owned'};
    // Price = bike.price / 4 TON per upgrade
    const upgPrice=bike.price/4;
    if((user.tonBalance||0)<upgPrice)return{success:false,error:`Need ${upgPrice} TON`};
    const upgs=user.bikeUpgrades||{};
    const bikeUpgs=upgs[lv]||{speed:0,nitro:0,accel:0,maneuver:0};
    const inc=G.UPGRADE_INCREMENTS[stat];
    const maxAdd=bike[stat]; // can double the stat (base * 2 - base = base)
    const maxUpgrades=Math.floor(maxAdd/inc);
    const curUpgrades=bikeUpgs[stat]||0;
    if(curUpgrades>=maxUpgrades)return{success:false,error:'Already at maximum level'};
    bikeUpgs[stat]=(curUpgrades+1);
    upgs[lv]=bikeUpgs;
    const newTon=(user.tonBalance||0)-upgPrice;
    await dbUpdate(env,`users/${uid}`,{tonBalance:newTon,bikeUpgrades:upgs});
    log(env,uid,'upgrade_stats',{bikeLevel:lv,stat,upgradeCount:bikeUpgs[stat],upgPrice,tonBalance_before:user.tonBalance||0,tonBalance_after:newTon},_meta);
    return{success:true,data:{tonBalance:newTon,bikeUpgrades:upgs,newUpgradeCount:bikeUpgs[stat]}};
  }catch(e){return{success:false,error:e.message};}
}

async function settleBikeMining(env,uid,user,_meta={}){
  const mining=user.bikeMining||{};
  const now=Date.now();
  let tonAdded=0;
  const completed=[];
  let changed=false;
  for(const [lv,rec] of Object.entries(mining)){
    if(rec&&rec.status==='active'&&(rec.endsAt||0)<=now){
      const reward=parseFloat(rec.reward||BIKE_DAILY_TON[lv]||0);
      if(reward>0){
        tonAdded+=reward;
        completed.push({bikeLevel:Number(lv),reward});
      }
      mining[lv]={...rec,status:'idle',claimedAt:now,lastReward:reward};
      changed=true;
    }
  }
  if(!changed)return{user,bikeMining:mining,tonAdded:0,completed:[]};
  const newTon=parseFloat(((user.tonBalance||0)+tonAdded).toFixed(8));
  await dbUpdate(env,`users/${uid}`,{tonBalance:newTon,bikeMining:mining});
  log(env,uid,'bike_mining_claim',{ton_reward:tonAdded,completed,tonBalance_before:user.tonBalance||0,tonBalance_after:newTon},_meta);
  sendTgNotification(env,uid,`🏍️ Bike mining completed!\n\n💎 +${tonAdded.toFixed(3)} TON has been added to your balance.`).catch(()=>{});
  return{user:{...user,tonBalance:newTon,bikeMining:mining},bikeMining:mining,tonAdded,completed};
}

async function hStartBikeMining(env,uid,data,_meta={}){
  try{
    const lv=parseInt(data.bikeLevel)||0;
    if(!BIKE_BASE_STATS[lv])return{success:false,error:'Unknown bike'};
    const r=await dbGet(env,`users/${uid}`);let user=r.data;
    if(!user)return{success:false,error:'User not found'};
    const settled=await settleBikeMining(env,uid,user,_meta);
    user=settled.user;
    const owned=(user.ownedBikes||[]).map(Number);
    if(!owned.includes(lv))return{success:false,error:'Bike not owned'};
    const mining=user.bikeMining||{};
    const cur=mining[String(lv)]||mining[lv];
    const now=Date.now();
    if(cur&&cur.status==='active'&&(cur.endsAt||0)>now)return{success:false,error:'Bike is already mining'};
    const reward=BIKE_DAILY_TON[lv]||0;
    const rec={bikeLevel:lv,status:'active',startedAt:now,endsAt:now+BIKE_MINING_MS,reward};
    mining[String(lv)]=rec;
    await dbUpdate(env,`users/${uid}`,{bikeMining:mining});
    log(env,uid,'bike_mining_start',{bikeLevel:lv,reward,startsAt:now,endsAt:rec.endsAt},_meta);
    return{success:true,data:{bikeMining:mining,started:rec,settledTon:settled.tonAdded||0,tonBalance:user.tonBalance||0}};
  }catch(e){return{success:false,error:e.message};}
}

async function hClaimBikeMining(env,uid,_data,_meta={}){
  try{
    const r=await dbGet(env,`users/${uid}`);const user=r.data;
    if(!user)return{success:false,error:'User not found'};
    const settled=await settleBikeMining(env,uid,user,_meta);
    return{success:true,data:{bikeMining:settled.bikeMining,tonAdded:settled.tonAdded,completed:settled.completed,tonBalance:settled.user.tonBalance||0}};
  }catch(e){return{success:false,error:e.message};}
}

// ── Withdraw ─────────────────────────────────────────────────────
async function hWithdraw(env,uid,data,_meta={}){
  try{
    const addr=(data.address||'').trim();const amt=parseFloat(data.amount)||0;
    if(!addr||addr.length<10)return{success:false,error:'Invalid TON address'};
    if(amt<G.MIN_WITHDRAW)return{success:false,error:`Min ${G.MIN_WITHDRAW} Coins`};
    if(amt>1000000)return{success:false,error:'Amount too large'};
    const lockKey=`withdrawLocks/${uid}`;
    const lockRec=await dbGet(env,lockKey);
    const now=Date.now();
    if(lockRec.data&&(now-(lockRec.data.ts||0))<60000)return{success:false,error:'A withdrawal is already being processed. Please wait 60 seconds.'};
    await dbSet(env,lockKey,{ts:now,uid});
    try{
      const r=await dbGet(env,`users/${uid}`);const user=r.data;
      if(!user){await dbSet(env,lockKey,{ts:0});return{success:false,error:'User not found'};}
      if((user.coins||0)<amt){await dbSet(env,lockKey,{ts:0});return{success:false,error:'Not enough Coins'};}
      if((now-(user._lastWdTs||0))<60000){await dbSet(env,lockKey,{ts:0});return{success:false,error:'Please wait 60 seconds before next withdrawal'};}
      if(!user.hasDeposited){
        const fp=(data.deviceFingerprint||'').trim();
        if(fp&&fp.length>8){
          const safeKey=fp.replace(/[^a-zA-Z0-9_-]/g,'_').slice(0,120);
          const fpRec=await dbGet(env,`deviceFingerprints/${safeKey}`);
          if(fpRec.data&&fpRec.data.uid&&fpRec.data.uid!==uid){
            await dbSet(env,lockKey,{ts:0});
            return{success:false,error:'MULTI_ACCOUNT',errorCode:'MULTI_ACCOUNT'};
          }
          if(!fpRec.data)await dbSet(env,`deviceFingerprints/${safeKey}`,{uid,ts:now});
        }
      }
      const tpr=await dbGet(env,'tasks/partner');
      const partnerTasks=tpr.data?Object.values(tpr.data).filter(t=>t.status==='active'):[];
      const completedTasks=user.completedTasks||[];
      const missingPartner=partnerTasks.filter(t=>!completedTasks.includes(t.id));
      if(missingPartner.length>0){await dbSet(env,lockKey,{ts:0});return{success:false,error:'Complete all partner tasks first',errorCode:'PARTNER_TASKS_REQUIRED',missing:missingPartner.length};}
      const wdId=`wd_${uid}_${now}`;const ton=amt*G.TON_PER_COIN;
      const upd={coins:(user.coins||0)-amt,_lastWdTs:now};
      await dbUpdate(env,`users/${uid}`,upd);
      const rec={wdId,userId:uid,address:addr,amt,ton,status:'pending',ts:now};
      await dbSet(env,`users/${uid}/wdHistory/${wdId}`,rec);
      await dbSet(env,`withdrawQueue/${wdId}`,rec);
      log(env,uid,'withdraw_request',{wdId,amount_coins:amt,amount_ton:ton,address:addr,coins_before:user.coins||0,coins_after:upd.coins},_meta);
      await dbSet(env,lockKey,{ts:0});
      return{success:true,data:{wdId,coins:upd.coins,status:'pending'}};
    }catch(innerErr){await dbSet(env,lockKey,{ts:0}).catch(()=>{});throw innerErr;}
  }catch(e){return{success:false,error:e.message};}
}

// ── Deposit ──────────────────────────────────────────────────────
async function hDeposit(env,uid,data,_meta={}){
  try{
    const amt=parseFloat(data.amount)||0;const txHash=(data.txHash||'').slice(0,256);
    if(!txHash||amt<G.MIN_DEPOSIT_TON)return{success:false,error:'Invalid deposit data'};
    const safeHash=txHash.replace(/[^a-zA-Z0-9]/g,'_');
    const dup=await dbGet(env,`txHashes/${safeHash}`);
    if(dup.data)return{success:false,error:'Duplicate transaction'};
    const depId=`dep_${uid}_${Date.now()}`;
    const ur=await dbGet(env,`users/${uid}`);const u=ur.data||{};
    const rec={depId,userId:uid,txHash,amount:amt,status:'pending',ts:Date.now()};
    await dbSet(env,`users/${uid}/deposits/${depId}`,rec);
    await dbSet(env,`pendingDeposits/${depId}`,rec);
    await dbSet(env,`txHashes/${safeHash}`,{depId,userId:uid,ts:Date.now()});
    return{success:true,data:{depositId:depId,message:'Transaction registered. Your TON balance will be added within 3 minutes.'}};
  }catch(e){return{success:false,error:e.message};}
}

// ── Claim Task ────────────────────────────────────────────────────
async function hClaimTask(env,uid,data,_meta={}){
  try{
    const tid=data.taskId;
    const lockKey=`taskLocks/${uid}_${tid}`;
    const lockRec=await dbGet(env,lockKey);
    const now=Date.now();
    if(lockRec.data&&(now-(lockRec.data.ts||0))<30000)return{success:false,error:'Already processing.'};
    await dbSet(env,lockKey,{ts:now});
    try{
      const r=await dbGet(env,`users/${uid}`);const user=r.data;
      if(!user){await dbSet(env,lockKey,{ts:0});return{success:false,error:'User not found'};}
      if((user.completedTasks||[]).includes(tid)){await dbSet(env,lockKey,{ts:0});return{success:false,error:'Already claimed'};}
      let coins=0;
      if(G.REF_TASKS[tid]){
        const t=G.REF_TASKS[tid];
        const rr=await dbGet(env,`users/${uid}/referrals`);
        const rc=rr.data?Object.keys(rr.data).length:0;
        if(rc<t.n){await dbSet(env,lockKey,{ts:0});return{success:false,error:`Need ${t.n} referrals`};}
        coins=t.coins;
      }else if(G.REF_ACTIVE_TASKS[tid]){
        const t=G.REF_ACTIVE_TASKS[tid];
        const rr=await dbGet(env,`users/${uid}/referrals`);
        const refIds=rr.data?Object.keys(rr.data):[];
        let activeCount=0;
        for(const refId of refIds){const hd=await dbGet(env,`users/${refId}/hasDeposited`);if(hd.data===true)activeCount++;}
        if(activeCount<t.n){await dbSet(env,lockKey,{ts:0});return{success:false,error:`Need ${t.n} active referrals`};}
        coins=t.coins;
      }else if(G.SOC_TASKS[tid]){coins=0;}
      else{await dbSet(env,lockKey,{ts:0});return{success:false,error:'Unknown task'};}
      const nc=(user.coins||0)+coins;
      await dbUpdate(env,`users/${uid}`,{completedTasks:[...(user.completedTasks||[]),tid],coins:nc});
      log(env,uid,'claim_task',{taskId:tid,coins_reward:coins,coins_before:user.coins||0,coins_after:nc},_meta);
      await dbSet(env,lockKey,{ts:0});
      return{success:true,data:{coins:nc,coinsAdded:coins}};
    }catch(innerErr){await dbSet(env,lockKey,{ts:0}).catch(()=>{});throw innerErr;}
  }catch(e){return{success:false,error:e.message};}
}

// ── Check Membership ──────────────────────────────────────────────
async function checkMembership(env,uid,link){
  try{
    if(!env.BOT_TOKEN)return true;
    let username=link.split('t.me/')[1]?.split('?')[0]?.split('/')[0];
    if(!username)return false;
    if(!username.startsWith('@'))username='@'+username;
    const res=await fetch(`https://api.telegram.org/bot${env.BOT_TOKEN}/getChatMember?chat_id=${encodeURIComponent(username)}&user_id=${uid}`);
    if(!res.ok)return false;
    const j=await res.json();
    if(!j.ok)return false;
    return['member','administrator','creator'].includes(j.result?.status||'left');
  }catch(e){console.error('checkMembership:',e.message);return false;}
}

// ── Verify Task ───────────────────────────────────────────────────
async function hVerifyTask(env,uid,data,_meta={}){
  try{
    const{taskId,taskType,taskCategory}=data;
    const taskCat=taskCategory||'partner';
    const tr=await dbGet(env,`tasks/${taskCat}/${taskId}`);const task=tr.data;
    if(!task)return{success:false,error:'Task not found'};
    if(task.status!=='active')return{success:false,error:'Task no longer active'};
    const ur=await dbGet(env,`users/${uid}`);const u=ur.data||{};
    if((u.completedTasks||[]).includes(taskId))return{success:false,error:'Task already completed'};
    if((task.completedBy||[]).includes(uid))return{success:false,error:'Task already completed'};
    if(task.type==='channel'){const isMember=await checkMembership(env,uid,task.link);if(!isMember)return{success:false,error:'Not a member. Join first!'};}
    const bam=task.bambooReward||500;
    const newCompletions=(task.completions||0)+1;
    const newCompletedBy=[...(task.completedBy||[]),uid];
    const taskUpdates={completions:newCompletions,completedBy:newCompletedBy,updatedAt:Date.now()};
    if(task.targetUsers!=null&&newCompletions>=(task.targetUsers||Infinity))taskUpdates.status='completed';
    await dbUpdate(env,`tasks/${taskCat}/${taskId}`,taskUpdates);
    const newCompleted=[...(u.completedTasks||[]),taskId];
    await dbUpdate(env,`users/${uid}`,{completedTasks:newCompleted});
    log(env,uid,'verify_task',{taskId,taskType:task.type,taskCategory:taskCat},_meta);
    return{success:true,data:{bambooAdded:bam,completions:newCompletions}};
  }catch(e){console.error('verifyTask:',e);return{success:false,error:e.message};}
}

// ── Create Task ───────────────────────────────────────────────────
async function hCreateTask(env,uid,data,_meta={}){
  try{
    const{type,link,targetUsers}=data;
    if(!['channel','bot'].includes(type))return{success:false,error:'Invalid type'};
    const target=parseInt(targetUsers)||0;
    if(target<100)return{success:false,error:'Minimum target is 100 users'};
    if(target>100000)return{success:false,error:'Maximum target is 100,000 users'};
    if(!link||!link.includes('t.me/'))return{success:false,error:'Valid Telegram link required'};
    const COINS_PER_USER=60;
    const cost=target*COINS_PER_USER;
    const ur=await dbGet(env,`users/${uid}`);const u=ur.data;
    if(!u)return{success:false,error:'User not found'};
    if((u.coins||0)<cost)return{success:false,error:`Insufficient Coins. Need ${cost} Coins`};
    await dbUpdate(env,`users/${uid}`,{coins:(u.coins||0)-cost});
    const username=link.split('t.me/')[1]?.split('?')[0]?.split('/')[0]||link;
    const now=Date.now();
    const taskId=`task_${now}_${Math.random().toString(36).substring(2,10)}`;
    const taskData={id:taskId,creatorId:uid,type,link,name:`@${username}`,targetUsers:target,bambooReward:500,completions:0,completedBy:[],status:'active',createdAt:now,expiresAt:now+(30*24*60*60*1000),updatedAt:now};
    await dbSet(env,`tasks/community/${taskId}`,taskData);
    log(env,uid,'create_task',{taskId,taskType:type,targetUsers:target,coins_spent:cost,coins_before:(u.coins||0)+cost,coins_after:(u.coins||0)},_meta);
    return{success:true,data:{taskId,type,targetUsers:target,totalCost:cost}};
  }catch(e){console.error('createTask:',e);return{success:false,error:e.message};}
}

// ── Race Result ───────────────────────────────────────────────────
async function hRaceResult(env,uid,data,_meta={}){
  try{
    const won=!!data.won;
    const cost=0.5;
    const prize=won?0.9:0;
    const lv=parseInt(data.bikeLevel)||0;
    const r=await dbGet(env,`users/${uid}`);const user=r.data;
    if(!user)return{success:false,error:'User not found'};
    if(lv){
      const rec=(user.bikeMining||{})[String(lv)]||(user.bikeMining||{})[lv];
      if(rec&&rec.status==='active'&&(rec.endsAt||0)>Date.now())return{success:false,error:'This bike is mining now'};
    }
    const bal=user.tonBalance||0;
    if(bal<cost)return{success:false,error:'Insufficient TON balance'};
    const newBal=Math.max(0,bal-cost)+(won?prize:0);
    await dbUpdate(env,`users/${uid}`,{tonBalance:parseFloat(newBal.toFixed(4))});
    log(env,uid,'race_result',{won,cost,prize,tonBalance_before:bal,tonBalance_after:newBal},_meta);
    return{success:true,data:{tonBalance:parseFloat(newBal.toFixed(4)),won,prize}};
  }catch(e){console.error('raceResult:',e);return{success:false,error:e.message};}
}


async function hAdmin(env,action,data){
  switch(action){
    case 'adminGetUser':{const r=await dbGet(env,`users/${data.userId}`);return{success:true,data:r.data||null};}
    case 'adminSetBalance':{
      const r=await dbGet(env,`users/${data.userId}`);if(!r.data)return{success:false,error:'Not found'};
      const u={};
      if(data.coins!==undefined)u.coins=Math.max(0,parseFloat(data.coins));
      if(data.tonBalance!==undefined)u.tonBalance=Math.max(0,parseFloat(data.tonBalance));
      await dbUpdate(env,`users/${data.userId}`,u);
      log(env,data.userId,'admin_set_balance',{coins_set:data.coins,ton_set:data.tonBalance,by:'admin'});
      return{success:true};
    }
    case 'adminConfirmDeposit':{
      const dep=await dbGet(env,`users/${data.userId}/deposits/${data.depositId}`);
      if(!dep.data)return{success:false,error:'Not found'};
      const ton=parseFloat(data.amount||dep.data.amount);
      await dbUpdate(env,`users/${data.userId}/deposits/${data.depositId}`,{status:'completed',completedAt:Date.now()});
      const u=await dbGet(env,`users/${data.userId}`);
      if(u.data)await dbUpdate(env,`users/${data.userId}`,{tonBalance:(u.data.tonBalance||0)+ton,hasDeposited:true});
      if(u.data?.referredBy){await dbUpdate(env,`users/${u.data.referredBy}/referrals/${data.userId}`,{hasDeposited:true}).catch(()=>{});}
      await dbDelete(env,`pendingDeposits/${data.depositId}`);
      log(env,data.userId,'admin_confirm_deposit',{depositId:data.depositId,amount_ton:ton,by:'admin'});
      return{success:true,data:{tonAdded:ton}};
    }
    case 'adminApproveWithdraw':{
      const r=await dbGet(env,`withdrawQueue/${data.wdId}`);if(!r.data)return{success:false,error:'Not found'};
      await dbUpdate(env,`withdrawQueue/${data.wdId}`,{status:'approved'});
      await dbUpdate(env,`users/${r.data.userId}/wdHistory/${data.wdId}`,{status:'approved'});
      sendTgNotification(env,r.data.userId,`✅ Your withdrawal of ${r.data.amt} Coins has been approved!`).catch(()=>{});
      return{success:true};
    }
    case 'adminRejectWithdraw':{
      const r=await dbGet(env,`withdrawQueue/${data.wdId}`);if(!r.data)return{success:false,error:'Not found'};
      await dbUpdate(env,`withdrawQueue/${data.wdId}`,{status:'rejected'});
      await dbUpdate(env,`users/${r.data.userId}/wdHistory/${data.wdId}`,{status:'rejected'});
      const u=await dbGet(env,`users/${r.data.userId}`);
      if(u.data)await dbUpdate(env,`users/${r.data.userId}`,{coins:(u.data.coins||0)+r.data.amt});
      sendTgNotification(env,r.data.userId,`❌ Withdrawal rejected. ${r.data.amt} Coins refunded.`).catch(()=>{});
      return{success:true};
    }
    case 'adminGetQueue':{const q=await dbGet(env,'withdrawQueue');return{success:true,data:q.data||{}};}
    default:return{success:false,error:'Unknown admin action'};
  }
}

// ── Main handler ──────────────────────────────────────────────────
export default {
  async fetch(request,env){
    if(request.method==='OPTIONS')return new Response(null,{headers:CORS});
    const url=new URL(request.url);const path=url.pathname;
    if(path==='/health')return ok({status:'ok',ts:Date.now(),env:env.ENVIRONMENT||'production'});
    if(path==='/tonconnect-manifest.json')return jRes({url:'https://pandabambo.vercel.app',name:'BaliRallyBot',iconUrl:'https://i.supaimg.com/ec27537b-aa6a-42cf-8ba1-d6850eeea36d/9b1e5a6e-3d27-4f28-9d79-4ff5ec1cd0d3.png',description:'Bali Rally Garage'});
    if(path!=='/api'||request.method!=='POST')return fail('Not found',404);

    const ip=request.headers.get('CF-Connecting-IP')||'unknown';
    if(!rateOk(ip))return fail('Rate limit exceeded',429);

    let body;
    try{const raw=await request.text();if(raw.length>10240)return fail('Payload too large',413);body=JSON.parse(sanitise(raw));}
    catch(_){return fail('Invalid JSON',400);}

    const authHeader=request.headers.get('Authorization')||'';
    const action=request.headers.get('X-Action')||body.action;
    const data=body.data||{};
    if(!action)return fail('Missing action',400);

    const ADMIN_ACTIONS=new Set(['adminGetUser','adminSetBalance','adminConfirmDeposit','adminApproveWithdraw','adminRejectWithdraw','adminGetQueue']);
    if(ADMIN_ACTIONS.has(action)){
      const v=await validateTg(authHeader.replace('Telegram ',''),env.BOT_TOKEN);
      if(!v.valid)return fail('Unauthorized',401);
      const adminIds=(env.ADMIN_IDS||'').split(',').map(s=>s.trim());
      if(!adminIds.includes(String(v.user?.id)))return fail('Forbidden',403);
      return jRes(await hAdmin(env,action,data));
    }

    if(action==='ping')return jRes({success:true,data:{pong:true,ts:Date.now()}});
    if(!authHeader.startsWith('Telegram '))return fail('Telegram authentication required',401);
    const v=await validateTg(authHeader.replace('Telegram ',''),env.BOT_TOKEN);
    if(!v.valid){
      console.error('TG validation failed:',v.error);
      return jRes({success:false,error:'Invalid Telegram authentication',errorCode:'INVALID_TELEGRAM_AUTH',debug:{hasInitData:!!authHeader,botTokenConfigured:!!env.BOT_TOKEN,environment:env.ENVIRONMENT||'production',validationError:v.error}},401);
    }

    const uid=String(v.user.id);
    const _meta={ip,ua:request.headers.get('User-Agent')||''};
    console.log(`[${new Date().toISOString()}] User:${uid} Action:${action} IP:${ip}`);

    if(!userActionOk(uid,action)){return fail('Too fast. Please wait a moment.',429);}

    switch(action){
      case 'getState'     :return jRes(await hGetState    (env,uid,v.user,{...data,_startParam:v.startParam||''},_meta));
      case 'withdraw'     :return jRes(await hWithdraw    (env,uid,data,_meta));
      case 'deposit'      :return jRes(await hDeposit     (env,uid,data,_meta));
      case 'claimTask'    :return jRes(await hClaimTask   (env,uid,data,_meta));
      case 'verifyTask'   :return jRes(await hVerifyTask  (env,uid,data,_meta));
      case 'createTask'   :return jRes(await hCreateTask  (env,uid,data,_meta));
      case 'buyBike'      :return jRes(await hBuyBike     (env,uid,data,_meta));
      case 'upgradeStats' :return jRes(await hUpgradeStats(env,uid,data,_meta));
      case 'startBikeMining':return jRes(await hStartBikeMining(env,uid,data,_meta));
      case 'claimBikeMining':return jRes(await hClaimBikeMining(env,uid,data,_meta));
      case 'raceResult'   :return jRes(await hRaceResult  (env,uid,data,_meta));
      default:return fail('Unknown action',400);
    }
  }
};
