const test=require('node:test'),assert=require('node:assert/strict');
const {createProvider,KEY,PREFIX}=require('../miniprogram/services/local-provider');
const {days,instant}=require('../miniprogram/utils/date');
function setup(seed){let now=new Date();now.setHours(7,0,0,0);let db=seed;
 const storage={get:()=>db,set:(k,v)=>{db=JSON.parse(JSON.stringify(v));}};
 const clock=()=>new Date(now),p=createProvider(storage,clock);
 const op={id:'local-operator-a',permissions:['redemptions:confirm'],venueIds:['badminton','table-tennis']};
 return {p,storage,clock,admin:createProvider(storage,clock,{operator:op}),db:()=>db,set:t=>{now=new Date(t);}};
}
async function book(s,id='badminton',offset=1){const date=days(s.clock())[offset].value,courts=await s.p.availability(id,date),court=courts.find(c=>c.slots.some(t=>t.status==='AVAILABLE')),timeSlot=court.slots.find(t=>t.status==='AVAILABLE').timeSlot;
 return s.p.createReservation({venueId:id,date,courtNumber:court.number,timeSlot},'request-'+Math.random());}
const rejects=(p,code)=>assert.rejects(p,e=>e.code===code);
test('v1 migration retains original IDs, cancellation and stable owner; v2 restart is stable',async()=>{
 const date=days()[1].value,legacy={version:1,records:[{id:'old-active',venueId:'badminton',courtNumber:1,date,timeSlot:'11:00-12:00',status:'ACTIVE',createdAt:123},{id:'old-cancelled',venueId:'table-tennis',courtNumber:1,date,timeSlot:'09:00-10:00',status:'CANCELLED',cancelledAt:456,createdAt:122}]};
 const s=setup(legacy),before=JSON.stringify(legacy),r=await s.p.listReservations();assert.equal(r.length,2);assert.equal(s.db().version,3);assert.equal(JSON.stringify(legacy),before);
 assert.equal(r[0].id,'old-active');assert.equal(r[1].cancelledAt,456);assert.notEqual(r[0].courtId,r[1].courtId);
 const user=await s.p.getUser(),again=createProvider(s.storage,s.clock);assert.deepEqual(await again.getUser(),user);assert.equal((await again.listReservations())[0].userId,user.userId);
});
test('separate local identities and ownership; other user cannot obtain/cancel code',async()=>{
 const s=setup(),r=await book(s),other=createProvider(s.storage,s.clock,{userId:'local-test-user-b'});
 assert.notEqual((await setup().p.getUser()).userId,(await s.p.getUser()).userId);
 assert.equal((await other.listReservations()).length,0);await rejects(other.getRedemptionCredential(r.id),'FORBIDDEN');await rejects(other.cancelReservation(r.id),'FORBIDDEN');
});
test('per-booking tokens resolve exact user, venue, court and time; query never redeems',async()=>{
 const s=setup(),a=await book(s),b=await book(s,'table-tennis',2),ca=await s.p.getRedemptionCredential(a.id),cb=await s.p.getRedemptionCredential(b.id);
 assert.notEqual(ca.payload,cb.payload);assert.ok(ca.payload.startsWith(PREFIX));assert.ok(!ca.payload.includes(a.id));assert.ok(!ca.payload.includes(a.userId));
 const qa=await s.admin.queryRedemption(ca.payload),qb=await s.admin.queryRedemption(cb.payload);assert.equal(qa.reservation.id,a.id);assert.equal(qb.reservation.id,b.id);assert.equal(qa.reservation.courtId,a.courtId);assert.equal(qa.canRedeem,false);assert.equal(s.db().redemptions.length,0);
 await rejects(s.admin.confirmRedemption(ca.payload,'outside-window'),'OUTSIDE_WINDOW');
});
test('expiry invalidates old payload; refresh issues different token without changing reservation',async()=>{
 const s=setup(),r=await book(s),a=await s.p.getRedemptionCredential(r.id),before=JSON.stringify(s.db().records);
 s.set(a.expiresAt);await rejects(s.admin.queryRedemption(a.payload),'TOKEN_EXPIRED');
 const b=await s.p.getRedemptionCredential(r.id);assert.notEqual(a.payload,b.payload);assert.equal(JSON.stringify(s.db().records),before);await rejects(s.admin.queryRedemption(a.payload),'INVALID_TOKEN');
});
test('forgery, wrong environment, unknown reservation and token-owner mismatch reject',async()=>{
 const s=setup(),r=await book(s),c=await s.p.getRedemptionCredential(r.id);
 for(const payload of ['x',c.payload.replace('LOCAL_DEMO','PRODUCTION'),PREFIX+'local-token-'+ '0'.repeat(32)])await rejects(s.admin.queryRedemption(payload),'INVALID_TOKEN');
 await rejects(s.p.getRedemptionCredential('missing'),'NOT_FOUND');
 s.db().credentials[0].userId='wrong';await rejects(s.admin.queryRedemption(c.payload),'TOKEN_MISMATCH');
 s.db().records=[];await rejects(s.admin.queryRedemption(c.payload),'NOT_FOUND');
});
test('cancel revokes existing token and old reservation route',async()=>{
 const s=setup(),r=await book(s),c=await s.p.getRedemptionCredential(r.id);await s.p.cancelReservation(r.id);
 await rejects(s.admin.queryRedemption(c.payload),'CANCELLED');await rejects(s.p.getRedemptionCredential(r.id),'CANCELLED');
});
test('only scoped operator can query/confirm; client role argument cannot elevate',async()=>{
 const s=setup(),r=await book(s),c=await s.p.getRedemptionCredential(r.id);
 await rejects(s.p.queryRedemption(c.payload),'OPERATOR_FORBIDDEN');await rejects(s.p.confirmRedemption(c.payload,'user-request',{role:'admin'}),'OPERATOR_FORBIDDEN');
 const wrong=createProvider(s.storage,s.clock,{operator:{id:'wrong-venue',permissions:['redemptions:confirm'],venueIds:['table-tennis']}});await rejects(wrong.confirmRedemption(c.payload,'wrong-scope'),'OPERATOR_FORBIDDEN');
});
test('concurrent confirmation creates exactly one record; repeat request is idempotent; inventory stays reserved',async()=>{
 const s=setup(),r=await book(s);s.set(r.startsAt-60000);const c=await s.p.getRedemptionCredential(r.id);
 const [a,b]=await Promise.all([s.admin.confirmRedemption(c.payload,'confirm-once'),s.admin.confirmRedemption(c.payload,'confirm-once')]);assert.equal(a.redemptionId,b.redemptionId);assert.equal(s.db().redemptions.length,1);assert.equal(a.redeemedAt,s.clock().getTime());assert.equal(a.operatorId,'local-operator-a');
 await rejects(s.admin.confirmRedemption(c.payload,'another-scan'),'REDEEMED');await rejects(s.p.getRedemptionCredential(r.id),'REDEEMED');await rejects(s.p.cancelReservation(r.id),'CANNOT_CANCEL');
 const view=await s.p.getReservation(r.id);assert.equal(view.canShowCode,false);assert.equal(view.statusText,'已核销');assert.equal(view.status,'ACTIVE');
 const court=(await s.p.availability(r.venueId,r.date)).find(c=>c.number===r.courtNumber);assert.equal(court.slots.find(t=>t.timeSlot===r.timeSlot).status,'RESERVED');
});
test('time ending is distinct from redemption; no redemption event is synthesized',async()=>{
 const s=setup(),r=await book(s);s.set(r.endsAt);const view=await s.p.getReservation(r.id);assert.equal(view.statusText,'已结束');assert.equal(view.redemptionStatus,'PENDING');assert.equal(s.db().redemptions.length,0);await rejects(s.p.getRedemptionCredential(r.id),'ENDED');
});
test('migration and redemption write failures preserve previous data',async()=>{
 const s=setup(),r=await book(s);s.set(r.startsAt);const c=await s.p.getRedemptionCredential(r.id),before=JSON.stringify(s.db());
 const bad=createProvider({get:()=>s.db(),set:()=>{throw Error('quota');}},s.clock,{operator:{id:'op',permissions:['redemptions:confirm'],venueIds:['badminton']}});
 await rejects(bad.confirmRedemption(c.payload,'failed-confirm'),'STORAGE_FAILED');assert.equal(JSON.stringify(s.db()),before);
 const legacy={version:1,records:[]},migration=createProvider({get:()=>legacy,set:()=>{throw Error('quota');}});await rejects(migration.listReservations(),'STORAGE_FAILED');assert.equal(legacy.version,1);
});
