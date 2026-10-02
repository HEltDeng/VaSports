const {instant}=require('../utils/date');
const KEY='vasports.reservations.v1';
const queues=new WeakMap();
function uid(prefix){return prefix+Array.from({length:32},()=>Math.floor(Math.random()*16).toString(16)).join('');}
function fail(code,message){const e=new Error(message);e.code=code;throw e;}
function createStore(storage){
  function write(db){try{storage.set(KEY,db);}catch(e){fail('STORAGE_FAILED','本机存储失败，操作未保存，请重试');}}
  function read(){
    let raw=storage.get(KEY);let dirty=false;
    if(raw===''||raw==null){const legacy=storage.get(['vaa','sports.reservations.v1'].join(''));if(legacy!==''&&legacy!=null){raw=legacy;dirty=true;}}
    if(raw===''||raw==null){raw={version:2,localUserId:uid('local-user-'),records:[],credentials:[],redemptions:[]};dirty=true;}
    if(!raw||![1,2,3].includes(raw.version)||!Array.isArray(raw.records))fail('STORAGE_INVALID','本机预约数据无法读取，请保留数据并联系开发者');
    const db=JSON.parse(JSON.stringify(raw));
    if(db.version===1){
      db.localUserId=uid('local-user-');db.credentials=[];db.redemptions=[];
      db.records=db.records.map(r=>Object.assign({},r,{userId:r.userId||db.localUserId,courtId:r.courtId||`${r.venueId}:court:${r.courtNumber}`,startsAt:instant(r.date,r.timeSlot.split('-')[0]),endsAt:instant(r.date,r.timeSlot.split('-')[1]),redemptionStatus:'PENDING'}));
      db.version=2;dirty=true;
    }
    if(!db.localUserId||!Array.isArray(db.credentials)||!Array.isArray(db.redemptions))fail('STORAGE_INVALID','本机预约数据无法读取，请保留数据并联系开发者');
    if(db.version===2){
      db.users=[{userId:db.localUserId,identity:null,phone:null,profileComplete:false,student:null,visitor:null}];
      db.demoAccounts={A:db.localUserId};db.session=null;db.wechatIdentities=[];
      db.migrations=[{from:2,to:3,legacyOwner:db.localUserId,rule:'DEFAULT_DEMO_ACCOUNT_A_ONLY'}];
      db.version=3;dirty=true;
    }
    if(!Array.isArray(db.users)||!db.demoAccounts)fail('STORAGE_INVALID','用户资料无法读取，请保留数据');
    if(dirty)write(db);
    return db;
  }
  function serial(fn){const next=(queues.get(storage)||Promise.resolve()).then(fn);queues.set(storage,next.catch(()=>{}));return next;}
  return {read,write,serial};
}
module.exports={createStore,KEY,uid,fail};
