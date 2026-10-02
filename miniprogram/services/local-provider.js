const venues=require('../mock/venues');
const {slots,fixture}=require('../mock/schedules');
const {days,instant}=require('../utils/date');
const {createStore,KEY,uid,fail}=require('./local-store');
const PREFIX='VASPORTS|1|LOCAL_DEMO|';
function createProvider(storage,clock=()=>new Date(),options={}) {
  const policy=Object.assign({ttlSeconds:60,earlyMinutes:30},options.policy||{});
  if(policy.ttlSeconds<1||policy.ttlSeconds>300||policy.earlyMinutes<0)throw Error('Invalid local redemption policy');
  const {read,write,serial}=createStore(storage);
  const actor=db=>options.requireUser?options.requireUser(db):options.userId||db.localUserId;
  function venue(id){const v=venues.find(x=>x.id===id);if(!v)fail('VENUE_NOT_FOUND','场馆不存在，请重新选择');return v;}
  function owned(db,id){const userId=actor(db);const r=db.records.find(r=>r.id===id);if(!r)fail('NOT_FOUND','未找到这条预约');if(r.userId!==userId)fail('FORBIDDEN','无权查看此预约');return r;}
  function validate(s){const v=venue(s.venueId);if(!days(clock()).some(d=>d.value===s.date))fail('INVALID_DATE','仅支持今天起未来 7 天，请重新选择日期');if(!Number.isInteger(s.courtNumber)||s.courtNumber<1||s.courtNumber>v.count||!slots.includes(s.timeSlot))fail('INVALID_SELECTION','场位或时段无效，请重新选择');return v;}
  function status(s,records){const v=validate(s);if(records.some(r=>r.status==='ACTIVE'&&r.venueId===s.venueId&&r.date===s.date&&r.courtNumber===s.courtNumber&&r.timeSlot===s.timeSlot))return 'RESERVED';if(instant(s.date,s.timeSlot.split('-')[0])<=clock().getTime())return 'PAST';return fixture(v,s.date,s.timeSlot,s.courtNumber);}
  function display(r){
    const v=venue(r.venueId),ended=r.endsAt<=clock().getTime(),started=r.startsAt<=clock().getTime(),redeemed=r.redemptionStatus==='REDEEMED';
    const state=r.status==='CANCELLED'?'CANCELLED':ended||redeemed?'COMPLETED':'ACTIVE';
    return Object.assign({},r,{venueName:v.name,unit:v.unit,displayState:state,statusText:r.status==='CANCELLED'?'已取消':redeemed?'已核销':ended?'已结束':started?'待核销':'待使用',canCancel:r.status==='ACTIVE'&&!started&&!redeemed,canShowCode:r.status==='ACTIVE'&&!ended&&!redeemed});
  }
  function eligible(r){if(!r)fail('NOT_FOUND','预约不存在');if(r.status==='CANCELLED')fail('CANCELLED','预约已取消');if(r.redemptionStatus==='REDEEMED')fail('REDEEMED','预约已核销');if(r.endsAt<=clock().getTime())fail('ENDED','预约已结束');}
  function operator(r){const op=options.operator;if(!op||!op.id||!Array.isArray(op.permissions)||!op.permissions.includes('redemptions:confirm')||!Array.isArray(op.venueIds)||!op.venueIds.includes(r.venueId))fail('OPERATOR_FORBIDDEN','没有此场馆的核销权限');return op;}
  function resolve(db,payload){
    if(typeof payload!=='string'||!new RegExp('^VASPORTS\\|1\\|LOCAL_DEMO\\|local-token-[0-9a-f]{32}$').test(payload))fail('INVALID_TOKEN','核销码无效');
    const c=db.credentials.find(c=>PREFIX+c.token===payload);if(!c)fail('INVALID_TOKEN','核销码无效或已刷新');
    const r=db.records.find(r=>r.id===c.reservationId);eligible(r);
    if(r.userId!==c.userId||r.courtId!==c.courtId)fail('TOKEN_MISMATCH','核销码信息不匹配');
    if(c.expiresAt<=clock().getTime())fail('TOKEN_EXPIRED','核销码已过期，请刷新');
    return {r,c};
  }
  function inWindow(r){return clock().getTime()>=r.startsAt-policy.earlyMinutes*60000&&clock().getTime()<r.endsAt;}
  return {
    async getUser(){const db=read();return {userId:actor(db),identityType:'LOCAL_DEMO'};},
    async listVenues(){return venues.map(v=>Object.assign({},v));},async getVenue(id){return Object.assign({},venue(id));},
    async availability(id,date){const v=venue(id),records=read().records;return Array.from({length:v.count},(_,i)=>({number:i+1,courtId:`${id}:court:${i+1}`,slots:slots.map(timeSlot=>({timeSlot,status:status({venueId:id,date,courtNumber:i+1,timeSlot},records)}))}));},
    async listReservations(){const db=read(),userId=actor(db);return db.records.filter(r=>r.userId===userId).map(display).sort((a,b)=>b.createdAt-a.createdAt);},
    async getReservation(id){return display(owned(read(),id));},
    createReservation(s,requestId){return serial(()=>{
      const db=read(),userId=actor(db),records=db.records;
      if(typeof requestId!=='string'||requestId.length<8)fail('INVALID_REQUEST','请求标识无效，请重新进入确认页');
      const existing=records.find(r=>r.userId===userId&&r.requestId===requestId);if(existing)return display(existing);
      validate(s);if(status(s,records)!=='AVAILABLE')fail('UNAVAILABLE','该场位时段已被预约或不可用，请返回重新选择');
      if(records.some(r=>r.userId===userId&&r.status==='ACTIVE'&&r.date===s.date&&r.timeSlot===s.timeSlot))fail('OVERLAP','您在这个时段已有预约，请选择其他时间');
      const record={billingSnapshot:options.billing?options.billing(db):null,id:uid('VS'),requestId,userId,venueId:s.venueId,courtId:`${s.venueId}:court:${s.courtNumber}`,date:s.date,courtNumber:s.courtNumber,timeSlot:s.timeSlot,startsAt:instant(s.date,s.timeSlot.split('-')[0]),endsAt:instant(s.date,s.timeSlot.split('-')[1]),status:'ACTIVE',redemptionStatus:'PENDING',createdAt:clock().getTime()};
      db.records.unshift(record);write(db);return display(record);
    });},
    cancelReservation(id){return serial(()=>{const db=read(),r=owned(db,id);if(r.status==='CANCELLED')return display(r);if(!display(r).canCancel)fail('CANNOT_CANCEL',r.redemptionStatus==='REDEEMED'?'已核销预约不可取消':'预约已开始或结束，无法取消');r.status='CANCELLED';r.cancelledAt=clock().getTime();write(db);return display(r);});},
    getRedemptionCredential(id){return serial(()=>{
      const db=read(),r=owned(db,id);eligible(r);
      const now=clock().getTime();let c=db.credentials.find(c=>c.reservationId===id&&c.expiresAt>now);
      if(!c){c={token:uid('local-token-'),reservationId:id,userId:r.userId,venueId:r.venueId,courtId:r.courtId,issuedAt:now,expiresAt:Math.min(now+policy.ttlSeconds*1000,r.endsAt)};db.credentials=db.credentials.filter(c=>c.expiresAt>now&&c.reservationId!==id);db.credentials.push(c);write(db);}
      return {reservation:display(r),payload:PREFIX+c.token,expiresAt:c.expiresAt,serverTime:now,environment:'LOCAL_DEMO'};
    });},
    async queryRedemption(payload){const db=read(),{r,c}=resolve(db,payload);operator(r);return {reservation:display(r),expiresAt:c.expiresAt,canRedeem:inWindow(r),reason:inWindow(r)?'':'尚未到可核销时间',windowOpensAt:r.startsAt-policy.earlyMinutes*60000};},
    confirmRedemption(payload,requestId){return serial(()=>{
      if(typeof requestId!=='string'||requestId.length<8)fail('INVALID_REQUEST','请求标识无效');
      const db=read(),old=db.redemptions.find(x=>x.requestId===requestId&&x.operatorId===(options.operator||{}).id);
      if(old){const r=db.records.find(r=>r.id===old.reservationId);if(!r)fail('NOT_FOUND','预约不存在');operator(r);if(old.payload!==payload)fail('IDEMPOTENCY_CONFLICT','请求标识已被其他操作使用');return Object.assign({},old);}
      const {r}=resolve(db,payload),op=operator(r);if(!inWindow(r))fail('OUTSIDE_WINDOW','尚未到可核销时间');
      const entry={redemptionId:uid('local-redemption-'),reservationId:r.id,redeemedAt:clock().getTime(),operatorId:op.id,requestId,payload};
      r.redemptionStatus='REDEEMED';r.redemptionId=entry.redemptionId;r.redeemedAt=entry.redeemedAt;r.operatorId=entry.operatorId;db.redemptions.push(entry);write(db);return Object.assign({},entry);
    });}
  };
}
module.exports={createProvider,KEY,PREFIX};
