// ================================================================
//  BALI RALLY — Cloudflare Worker v5.0
//  Firebase Realtime Database
//  Environment Variables:
//    FIREBASE_DATABASE_URL  e.g. https://YOUR-DB.firebaseio.com
//    FIREBASE_API_KEY       Firebase API key
//    BOT_TOKEN              Telegram Bot Token
//    ADMIN_IDS              comma-separated admin Telegram IDs
// ================================================================

const G = {
  MIN_WITHDRAW_TON: 0.1,
  MIN_DEPOSIT_TON: 1,
  REF_BONUS_PCT: 20,
  // Referral TON tasks (active referrals only - who have withdrawn)
  REF_TON_TASKS: {
    rt10  : { n:10,   ton:0.1  },
    rt50  : { n:50,   ton:0.5  },
    rt100 : { n:100,  ton:1    },
    rt200 : { n:200,  ton:2    },
    rt500 : { n:500,  ton:5    },
    rt1000: { n:1000, ton:10   },
  },
  // Bike purchase tasks
  BIKE_TASKS: {
    bt5  : { n:5,  ton:2  },
    bt10 : { n:10, ton:20 },
  },
  // Race tasks (number of races played)
  RACE_TASKS: {
    rc10 : { n:10,  ton:0.5 },
    rc20 : { n:20,  ton:1   },
    rc50 : { n:50,  ton:3   },
  },
  // Mining tasks (number of times sent to mining)
  MINE_TASKS: {
    mt20 : { n:20, ton:1 },
    mt50 : { n:50, ton:3 },
  },
  // Upgrade increments per stat — must match frontend UPGRADE_INC
  UPGRADE_INCREMENTS: {
    speed   : 5,
    nitro   : 5,
    accel   : 5,
    maneuver: 3,
  },
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
const ACTION_COOLDOWNS={withdraw:5000,claimTask:2500,verifyTask:2500,createTask:5000,buyBike:2500,upgradeStats:2500,deposit:2500,startBikeMining:2500,claimBikeMining:2500,raceResult:4000,claimMissionTask:2500,submitPartnerPost:5000,saveSeasonAlloc:10000};
function userActionOk(uid,action){const cd=ACTION_COOLDOWNS[action];if(!cd)return true;const key=`${uid}:${action}`;const now=Date.now();const last=_userActionTs.get(key)||0;if(now-last<cd)return false;_userActionTs.set(key,now);return true;}

// Logging
const BALANCE_CHANGE_EVENTS=new Set(['withdraw_request','deposit_completed','claim_task','verify_task','create_task','admin_set_balance','admin_confirm_deposit','referral_commission','buy_bike','upgrade_stats','bike_mining_start','bike_mining_claim','claim_mission_task','partner_post_reward']);
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
      await dbSet(env,`users/${referrerId}/referrals/${uid}`,{userId:uid,firstName:user.firstName,lastName:user.lastName,username:user.username,photoUrl:user.photoUrl,joinedAt:Date.now(),earned:0,hasWithdrawn:false});
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
    tonBalance:0,
    hasDeposited:false,
    hasWithdrawn:false,
    ownedBikes:[],
    bikeUpgrades:{},
    bikeMining:{},
    totalBikesBought:0,
    totalRacesPlayed:0,
    totalMiningRuns:0,
    referralCode:String(uid),
    referredBy:ref||null,
    completedTasks:[],
    completedMissions:[],
    withdrawWallet:null,
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
      });
    }
    const settled=await settleBikeMining(env,uid,user,_meta);
    user=settled.user;
    const rr=await dbGet(env,`users/${uid}/referrals`);
    const refList=Object.values(rr.data||{});
    // Active referral = one who has made a withdrawal
    const referrals=await Promise.all(refList.map(async r=>{
      let hasWithdrawn=r.hasWithdrawn||false;
      if(!hasWithdrawn){
        const ud=await dbGet(env,`users/${r.userId}/hasWithdrawn`);
        hasWithdrawn=ud.data===true;
        if(hasWithdrawn)await dbUpdate(env,`users/${uid}/referrals/${r.userId}`,{hasWithdrawn:true}).catch(()=>{});
      }
      return{userId:r.userId,name:`${r.firstName||''} ${r.lastName||''}`.trim()||'Friend',photo:r.photoUrl||null,date:r.joinedAt?new Date(r.joinedAt).toLocaleDateString():'',earned:r.earned||0,hasWithdrawn};
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
    // Partner posts
    const ppr=await dbGet(env,`users/${uid}/partnerPosts`);
    const partnerPosts=ppr.data?Object.values(ppr.data).sort((a,b)=>b.ts-a.ts):[];
    return{success:true,data:{
      user:{
        tonBalance:user.tonBalance||0,
        hasDeposited:user.hasDeposited||false,
        hasWithdrawn:user.hasWithdrawn||false,
        ownedBikes:user.ownedBikes||[],
        bikeUpgrades:user.bikeUpgrades||{},
        bikeMining:user.bikeMining||{},
        totalBikesBought:user.totalBikesBought||0,
        totalRacesPlayed:user.totalRacesPlayed||0,
        totalMiningRuns:user.totalMiningRuns||0,
        withdrawWallet:user.withdrawWallet||null,
        firstName:user.firstName||'',
        lastName:user.lastName||'',
        username:user.username||'',
        photoUrl:user.photoUrl||'',
      },
      referrals,
      completedTasks:user.completedTasks||[],
      completedMissions:user.completedMissions||[],
      wdHistory,
      balanceLog,
      tasks,
      partnerPosts,
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
    const newTotal=(user.totalBikesBought||0)+1;
    await dbUpdate(env,`users/${uid}`,{tonBalance:newTon,ownedBikes:newOwned,totalBikesBought:newTotal});
    log(env,uid,'buy_bike',{bikeLevel:lv,price:priceTon,tonBalance_before:user.tonBalance||0,tonBalance_after:newTon},_meta);
    if(user.referredBy&&user.referredBy!==uid){
      const comm=Math.round(priceTon*G.REF_BONUS_PCT/100*1e8)/1e8;
      const rr=await dbGet(env,`users/${user.referredBy}`);
      if(rr.data){
        await dbUpdate(env,`users/${user.referredBy}`,{tonBalance:(rr.data.tonBalance||0)+comm});
        sendTgNotification(env,user.referredBy,`💰 Commission! ${user.firstName||'Friend'} bought a bike. +${comm} TON (20%)`).catch(()=>{});
      }
    }
    return{success:true,data:{tonBalance:newTon,ownedBikes:newOwned,totalBikesBought:newTotal}};
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
    const upgPrice=bike.price/4;
    if((user.tonBalance||0)<upgPrice)return{success:false,error:`Need ${upgPrice} TON`};
    const upgs=user.bikeUpgrades||{};
    const bikeUpgs=upgs[lv]||{speed:0,nitro:0,accel:0,maneuver:0};
    const inc=G.UPGRADE_INCREMENTS[stat]||5;
    const maxAdd=bike[stat];
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
      if(reward>0){tonAdded+=reward;completed.push({bikeLevel:Number(lv),reward});}
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
    const newMiningRuns=(user.totalMiningRuns||0)+1;
    await dbUpdate(env,`users/${uid}`,{bikeMining:mining,totalMiningRuns:newMiningRuns});
    log(env,uid,'bike_mining_start',{bikeLevel:lv,reward,startsAt:now,endsAt:rec.endsAt},_meta);
    return{success:true,data:{bikeMining:mining,started:rec,settledTon:settled.tonAdded||0,tonBalance:user.tonBalance||0,totalMiningRuns:newMiningRuns}};
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
    if(amt<G.MIN_WITHDRAW_TON)return{success:false,error:`Minimum withdrawal is ${G.MIN_WITHDRAW_TON} TON`};
    if(amt>100000)return{success:false,error:'Amount too large'};
    
    // Check wallet uniqueness — prevent multi-account abuse
    const safeAddr=addr.replace(/[^a-zA-Z0-9_-]/g,'_').slice(0,120);
    const addrRec=await dbGet(env,`walletAddresses/${safeAddr}`);
    if(addrRec.data&&addrRec.data.uid&&addrRec.data.uid!==uid){
      return{success:false,error:'WALLET_USED',errorCode:'WALLET_USED'};
    }

    const lockKey=`withdrawLocks/${uid}`;
    const lockRec=await dbGet(env,lockKey);
    const now=Date.now();
    if(lockRec.data&&(now-(lockRec.data.ts||0))<60000)return{success:false,error:'A withdrawal is already being processed. Please wait 60 seconds.'};
    await dbSet(env,lockKey,{ts:now,uid});
    try{
      const r=await dbGet(env,`users/${uid}`);const user=r.data;
      if(!user){await dbSet(env,lockKey,{ts:0});return{success:false,error:'User not found'};}
      if((user.tonBalance||0)<amt){await dbSet(env,lockKey,{ts:0});return{success:false,error:'Insufficient TON balance'};}
      if((now-(user._lastWdTs||0))<60000){await dbSet(env,lockKey,{ts:0});return{success:false,error:'Please wait 60 seconds before next withdrawal'};}
      
      const tpr=await dbGet(env,'tasks/partner');
      const partnerTasks=tpr.data?Object.values(tpr.data).filter(t=>t.status==='active'):[];
      const completedTasks=user.completedTasks||[];
      const missingPartner=partnerTasks.filter(t=>!completedTasks.includes(t.id));
      if(missingPartner.length>0){await dbSet(env,lockKey,{ts:0});return{success:false,error:'Complete all partner tasks first',errorCode:'PARTNER_TASKS_REQUIRED',missing:missingPartner.length};}
      
      const wdId=`wd_${uid}_${now}`;
      const upd={tonBalance:parseFloat(((user.tonBalance||0)-amt).toFixed(8)),_lastWdTs:now,hasWithdrawn:true,withdrawWallet:addr};
      await dbUpdate(env,`users/${uid}`,upd);
      
      // Register wallet address
      if(!addrRec.data)await dbSet(env,`walletAddresses/${safeAddr}`,{uid,ts:now});
      
      const rec={wdId,userId:uid,address:addr,amt,status:'pending',ts:now};
      await dbSet(env,`users/${uid}/wdHistory/${wdId}`,rec);
      await dbSet(env,`withdrawQueue/${wdId}`,rec);
      
      // Mark referral as active (has withdrawn)
      if(user.referredBy){
        await dbUpdate(env,`users/${user.referredBy}/referrals/${uid}`,{hasWithdrawn:true}).catch(()=>{});
      }
      
      log(env,uid,'withdraw_request',{wdId,amount_ton:amt,address:addr,tonBalance_before:user.tonBalance||0,tonBalance_after:upd.tonBalance},_meta);
      await dbSet(env,lockKey,{ts:0});
      return{success:true,data:{wdId,tonBalance:upd.tonBalance,status:'pending'}};
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
    const rec={depId,userId:uid,txHash,amount:amt,status:'pending',ts:Date.now()};
    await dbSet(env,`users/${uid}/deposits/${depId}`,rec);
    await dbSet(env,`pendingDeposits/${depId}`,rec);
    await dbSet(env,`txHashes/${safeHash}`,{depId,userId:uid,ts:Date.now()});
    return{success:true,data:{depositId:depId,message:'Transaction registered. Your TON balance will be added within 3 minutes.'}};
  }catch(e){return{success:false,error:e.message};}
}

// ── Claim Task (social/partner) ───────────────────────────────────
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
      let tonReward=0;
      if(G.REF_TON_TASKS[tid]){
        const t=G.REF_TON_TASKS[tid];
        const rr=await dbGet(env,`users/${uid}/referrals`);
        const refIds=rr.data?Object.keys(rr.data):[];
        let activeCount=0;
        for(const refId of refIds){const hw=await dbGet(env,`users/${refId}/hasWithdrawn`);if(hw.data===true)activeCount++;}
        if(activeCount<t.n){await dbSet(env,lockKey,{ts:0});return{success:false,error:`Need ${t.n} active referrals (who have withdrawn)`};}
        tonReward=t.ton;
      }else{
        // Unknown task - still mark completed (e.g. social tasks)
        await dbUpdate(env,`users/${uid}`,{completedTasks:[...(user.completedTasks||[]),tid]});
        await dbSet(env,lockKey,{ts:0});
        return{success:true,data:{tonBalance:user.tonBalance||0,tonAdded:0}};
      }
      const newTon=(user.tonBalance||0)+tonReward;
      await dbUpdate(env,`users/${uid}`,{completedTasks:[...(user.completedTasks||[]),tid],tonBalance:parseFloat(newTon.toFixed(8))});
      log(env,uid,'claim_task',{taskId:tid,ton_reward:tonReward,tonBalance_before:user.tonBalance||0,tonBalance_after:newTon},_meta);
      await dbSet(env,lockKey,{ts:0});
      return{success:true,data:{tonBalance:parseFloat(newTon.toFixed(8)),tonAdded:tonReward}};
    }catch(innerErr){await dbSet(env,lockKey,{ts:0}).catch(()=>{});throw innerErr;}
  }catch(e){return{success:false,error:e.message};}
}

// ── Claim Mission Task (bikes/races/mining) ───────────────────────
async function hClaimMissionTask(env,uid,data,_meta={}){
  try{
    const tid=data.taskId;
    const lockKey=`missionLocks/${uid}_${tid}`;
    const lockRec=await dbGet(env,lockKey);
    const now=Date.now();
    if(lockRec.data&&(now-(lockRec.data.ts||0))<30000)return{success:false,error:'Already processing.'};
    await dbSet(env,lockKey,{ts:now});
    try{
      const r=await dbGet(env,`users/${uid}`);const user=r.data;
      if(!user){await dbSet(env,lockKey,{ts:0});return{success:false,error:'User not found'};}
      if((user.completedMissions||[]).includes(tid)){await dbSet(env,lockKey,{ts:0});return{success:false,error:'Mission already claimed'};}
      let tonReward=0;
      let meetsReq=false;
      if(G.BIKE_TASKS[tid]){
        const t=G.BIKE_TASKS[tid];
        if((user.totalBikesBought||0)>=t.n){meetsReq=true;tonReward=t.ton;}
        else{await dbSet(env,lockKey,{ts:0});return{success:false,error:`Need ${t.n} bikes purchased (you have ${user.totalBikesBought||0})`};}
      }else if(G.RACE_TASKS[tid]){
        const t=G.RACE_TASKS[tid];
        if((user.totalRacesPlayed||0)>=t.n){meetsReq=true;tonReward=t.ton;}
        else{await dbSet(env,lockKey,{ts:0});return{success:false,error:`Need ${t.n} races played (you have ${user.totalRacesPlayed||0})`};}
      }else if(G.MINE_TASKS[tid]){
        const t=G.MINE_TASKS[tid];
        if((user.totalMiningRuns||0)>=t.n){meetsReq=true;tonReward=t.ton;}
        else{await dbSet(env,lockKey,{ts:0});return{success:false,error:`Need ${t.n} mining runs (you have ${user.totalMiningRuns||0})`};}
      }else{
        await dbSet(env,lockKey,{ts:0});
        return{success:false,error:'Unknown mission'};
      }
      const newTon=(user.tonBalance||0)+tonReward;
      await dbUpdate(env,`users/${uid}`,{
        completedMissions:[...(user.completedMissions||[]),tid],
        tonBalance:parseFloat(newTon.toFixed(8))
      });
      log(env,uid,'claim_mission_task',{taskId:tid,ton_reward:tonReward,tonBalance_before:user.tonBalance||0,tonBalance_after:newTon},_meta);
      await dbSet(env,lockKey,{ts:0});
      return{success:true,data:{tonBalance:parseFloat(newTon.toFixed(8)),tonAdded:tonReward}};
    }catch(innerErr){await dbSet(env,lockKey,{ts:0}).catch(()=>{});throw innerErr;}
  }catch(e){return{success:false,error:e.message};}
}

// ── Submit Partner Post ───────────────────────────────────────────
async function hSubmitPartnerPost(env,uid,data,_meta={}){
  try{
    const link=(data.link||'').trim();
    if(!link||link.length<10)return{success:false,error:'Invalid post link'};
    const postId=`pp_${uid}_${Date.now()}`;
    const rec={postId,userId:uid,link,status:'pending',reward:0,ts:Date.now()};
    await dbSet(env,`users/${uid}/partnerPosts/${postId}`,rec);
    await dbSet(env,`partnerPostQueue/${postId}`,rec);
    return{success:true,data:{postId,status:'pending'}};
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
    const newCompletions=(task.completions||0)+1;
    const newCompletedBy=[...(task.completedBy||[]),uid];
    const taskUpdates={completions:newCompletions,completedBy:newCompletedBy,updatedAt:Date.now()};
    if(task.targetUsers!=null&&newCompletions>=(task.targetUsers||Infinity))taskUpdates.status='completed';
    await dbUpdate(env,`tasks/${taskCat}/${taskId}`,taskUpdates);
    const newCompleted=[...(u.completedTasks||[]),taskId];
    await dbUpdate(env,`users/${uid}`,{completedTasks:newCompleted});
    log(env,uid,'verify_task',{taskId,taskType:task.type,taskCategory:taskCat},_meta);
    return{success:true,data:{completions:newCompletions}};
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
    const COST_PER_USER=0.0006; // TON per user
    const cost=target*COST_PER_USER;
    const ur=await dbGet(env,`users/${uid}`);const u=ur.data;
    if(!u)return{success:false,error:'User not found'};
    if((u.tonBalance||0)<cost)return{success:false,error:`Insufficient TON. Need ${cost} TON`};
    await dbUpdate(env,`users/${uid}`,{tonBalance:(u.tonBalance||0)-cost});
    const username=link.split('t.me/')[1]?.split('?')[0]?.split('/')[0]||link;
    const now=Date.now();
    const taskId=`task_${now}_${Math.random().toString(36).substring(2,10)}`;
    const taskData={id:taskId,creatorId:uid,type,link,name:`@${username}`,targetUsers:target,completions:0,completedBy:[],status:'active',createdAt:now,expiresAt:now+(30*24*60*60*1000),updatedAt:now};
    await dbSet(env,`tasks/community/${taskId}`,taskData);
    log(env,uid,'create_task',{taskId,taskType:type,targetUsers:target,cost_ton:cost,tonBalance_before:(u.tonBalance||0)+cost,tonBalance_after:(u.tonBalance||0)},_meta);
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
    const newRaces=(user.totalRacesPlayed||0)+1;
    await dbUpdate(env,`users/${uid}`,{tonBalance:parseFloat(newBal.toFixed(4)),totalRacesPlayed:newRaces});
    log(env,uid,'race_result',{won,cost,prize,tonBalance_before:bal,tonBalance_after:newBal},_meta);
    // Frontend reads: result.success and result.data.tonBalance
    // api() unwraps j.data, so we wrap the payload one level deeper
    return{success:true,data:{success:true,data:{tonBalance:parseFloat(newBal.toFixed(4)),won,prize,totalRacesPlayed:newRaces}}};
  }catch(e){console.error('raceResult:',e);return{success:false,error:e.message};}
}


async function hAdmin(env,action,data){
  switch(action){
    case 'adminGetUser':{const r=await dbGet(env,`users/${data.userId}`);return{success:true,data:r.data||null};}
    case 'adminSetBalance':{
      const r=await dbGet(env,`users/${data.userId}`);if(!r.data)return{success:false,error:'Not found'};
      const u={};
      if(data.tonBalance!==undefined)u.tonBalance=Math.max(0,parseFloat(data.tonBalance));
      await dbUpdate(env,`users/${data.userId}`,u);
      log(env,data.userId,'admin_set_balance',{ton_set:data.tonBalance,by:'admin'});
      return{success:true};
    }
    case 'adminConfirmDeposit':{
      const dep=await dbGet(env,`users/${data.userId}/deposits/${data.depositId}`);
      if(!dep.data)return{success:false,error:'Not found'};
      const ton=parseFloat(data.amount||dep.data.amount);
      await dbUpdate(env,`users/${data.userId}/deposits/${data.depositId}`,{status:'completed',completedAt:Date.now()});
      const u=await dbGet(env,`users/${data.userId}`);
      if(u.data)await dbUpdate(env,`users/${data.userId}`,{tonBalance:(u.data.tonBalance||0)+ton,hasDeposited:true});
      await dbDelete(env,`pendingDeposits/${data.depositId}`);
      log(env,data.userId,'admin_confirm_deposit',{depositId:data.depositId,amount_ton:ton,by:'admin'});
      return{success:true,data:{tonAdded:ton}};
    }
    case 'adminApproveWithdraw':{
      const r=await dbGet(env,`withdrawQueue/${data.wdId}`);if(!r.data)return{success:false,error:'Not found'};
      await dbUpdate(env,`withdrawQueue/${data.wdId}`,{status:'approved'});
      await dbUpdate(env,`users/${r.data.userId}/wdHistory/${data.wdId}`,{status:'approved'});
      sendTgNotification(env,r.data.userId,`✅ Your withdrawal of ${r.data.amt} TON has been approved!`).catch(()=>{});
      return{success:true};
    }
    case 'adminRejectWithdraw':{
      const r=await dbGet(env,`withdrawQueue/${data.wdId}`);if(!r.data)return{success:false,error:'Not found'};
      await dbUpdate(env,`withdrawQueue/${data.wdId}`,{status:'rejected'});
      await dbUpdate(env,`users/${r.data.userId}/wdHistory/${data.wdId}`,{status:'rejected'});
      const u=await dbGet(env,`users/${r.data.userId}`);
      if(u.data)await dbUpdate(env,`users/${r.data.userId}`,{tonBalance:(u.data.tonBalance||0)+r.data.amt});
      sendTgNotification(env,r.data.userId,`❌ Withdrawal rejected. ${r.data.amt} TON refunded.`).catch(()=>{});
      return{success:true};
    }
    case 'adminGetQueue':{const q=await dbGet(env,'withdrawQueue');return{success:true,data:q.data||{}};}
    case 'adminApprovePartnerPost':{
      const r=await dbGet(env,`partnerPostQueue/${data.postId}`);if(!r.data)return{success:false,error:'Not found'};
      const reward=parseFloat(data.reward)||0;
      await dbUpdate(env,`partnerPostQueue/${data.postId}`,{status:'approved',reward});
      await dbUpdate(env,`users/${r.data.userId}/partnerPosts/${data.postId}`,{status:'approved',reward});
      if(reward>0){
        const u=await dbGet(env,`users/${r.data.userId}`);
        if(u.data)await dbUpdate(env,`users/${r.data.userId}`,{tonBalance:(u.data.tonBalance||0)+reward});
        sendTgNotification(env,r.data.userId,`✅ Your post has been approved! You received ${reward} TON reward.`).catch(()=>{});
        log(env,r.data.userId,'partner_post_reward',{postId:data.postId,reward,by:'admin'});
      }
      return{success:true};
    }
    case 'adminRejectPartnerPost':{
      const r=await dbGet(env,`partnerPostQueue/${data.postId}`);if(!r.data)return{success:false,error:'Not found'};
      await dbUpdate(env,`partnerPostQueue/${data.postId}`,{status:'rejected'});
      await dbUpdate(env,`users/${r.data.userId}/partnerPosts/${data.postId}`,{status:'rejected'});
      sendTgNotification(env,r.data.userId,`❌ Your post was rejected.`).catch(()=>{});
      return{success:true};
    }
    default:return{success:false,error:'Unknown admin action'};
  }
}

// ── Save Season Allocation ────────────────────────────────────────
async function hSaveSeasonAlloc(env,uid,data,_meta={}){
  try{
    const{coinsAlloc,refsAlloc,total}=data;
    await dbSet(env,`users/${uid}/seasonAlloc`,{coinsAlloc:coinsAlloc||0,refsAlloc:refsAlloc||0,total:total||0,savedAt:Date.now()});
    return{success:true,data:{saved:true}};
  }catch(e){console.error('saveSeasonAlloc:',e);return{success:false,error:e.message};}
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

    const ADMIN_ACTIONS=new Set(['adminGetUser','adminSetBalance','adminConfirmDeposit','adminApproveWithdraw','adminRejectWithdraw','adminGetQueue','adminApprovePartnerPost','adminRejectPartnerPost']);
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
      case 'getState'         :return jRes(await hGetState        (env,uid,v.user,{...data,_startParam:v.startParam||''},_meta));
      case 'withdraw'         :return jRes(await hWithdraw        (env,uid,data,_meta));
      case 'deposit'          :return jRes(await hDeposit         (env,uid,data,_meta));
      case 'claimTask'        :return jRes(await hClaimTask       (env,uid,data,_meta));
      case 'verifyTask'       :return jRes(await hVerifyTask      (env,uid,data,_meta));
      case 'createTask'       :return jRes(await hCreateTask      (env,uid,data,_meta));
      case 'buyBike'          :return jRes(await hBuyBike         (env,uid,data,_meta));
      case 'upgradeStats'     :return jRes(await hUpgradeStats    (env,uid,data,_meta));
      case 'startBikeMining'  :return jRes(await hStartBikeMining (env,uid,data,_meta));
      case 'claimBikeMining'  :return jRes(await hClaimBikeMining (env,uid,data,_meta));
      case 'raceResult'       :return jRes(await hRaceResult      (env,uid,data,_meta));
      case 'claimMissionTask' :return jRes(await hClaimMissionTask(env,uid,data,_meta));
      case 'submitPartnerPost':return jRes(await hSubmitPartnerPost(env,uid,data,_meta));
      case 'saveSeasonAlloc'  :return jRes(await hSaveSeasonAlloc  (env,uid,data,_meta));
      default:return fail('Unknown action',400);
    }
  }
};
