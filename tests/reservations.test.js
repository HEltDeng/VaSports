const test=require('node:test');
const assert=require('node:assert/strict');
const {createProvider,KEY}=require('../miniprogram/services/local-provider');
function setup(){
  let data={},now=new Date(2026,9,2,7);
  const storage={get:k=>data[k],set:(k,v)=>{data[k]=JSON.parse(JSON.stringify(v));}};
  return {provider:createProvider(storage,()=>now),storage,advance:d=>{now=d;}};
}
async function free(p,venue='badminton',date='2026-10-03'){
  const courts=await p.availability(venue,date);
  const c=courts.find(c=>c.slots.some(s=>s.status==='AVAILABLE'));
  return {venueId:venue,date,courtNumber:c.number,timeSlot:c.slots.find(s=>s.status==='AVAILABLE').timeSlot};
}
test('book, persist through provider restart, cancel, release, rebook',async()=>{
  const {provider:p,storage}=setup(),s=await free(p);
  const r=await p.createReservation(s,'request-1');
  assert.equal((await p.listReservations()).length,1);
  const restarted=createProvider(storage,()=>new Date(2026,9,2,7));
  assert.equal((await restarted.getReservation(r.id)).status,'ACTIVE');
  const state=async()=> (await p.availability(s.venueId,s.date))[s.courtNumber-1].slots.find(x=>x.timeSlot===s.timeSlot).status;
  assert.equal(await state(),'RESERVED');
  await restarted.cancelReservation(r.id);
  assert.equal((await p.getReservation(r.id)).displayState,'CANCELLED');
  assert.equal(await state(),'AVAILABLE');
  const next=await p.createReservation(s,'request-2');
  assert.notEqual(next.id,r.id);
});
test('concurrent duplicate clicks are idempotent and competing requests reject',async()=>{
  const {provider:p}=setup(),s=await free(p);
  const [a,b]=await Promise.all([p.createReservation(s,'same-request'),p.createReservation(s,'same-request')]);
  assert.equal(a.id,b.id);assert.equal((await p.listReservations()).length,1);
  await assert.rejects(p.createReservation(s,'different-request'),/不可用/);
});
test('invalid dates, court numbers, time slots, occupied and maintenance reject',async()=>{
  const {provider:p}=setup(),s=await free(p);
  for(const change of [{date:'2026-10-01'},{date:'2026-10-09'},{date:'2026-99-99'},{courtNumber:0},{courtNumber:9},{courtNumber:1.5},{timeSlot:'22:00-23:00'},{courtNumber:8}]){
    await assert.rejects(p.createReservation({...s,...change},'invalid-request'));
  }
  const c=(await p.availability('badminton',s.date)).find(c=>c.slots.some(x=>x.status==='RESERVED'));
  await assert.rejects(p.createReservation({...s,courtNumber:c.number,timeSlot:c.slots.find(x=>x.status==='RESERVED').timeSlot},'reserved-request'));
  assert.equal((await p.listReservations()).length,0);
});
test('eight badminton courts and ten tables with three fixture states',async()=>{
  const {provider:p}=setup();
  for(const [id,count] of [['badminton',8],['table-tennis',10]]){
    const c=await p.availability(id,'2026-10-03');assert.equal(c.length,count);
    assert.deepEqual(new Set(c.flatMap(x=>x.slots.map(s=>s.status))),new Set(['AVAILABLE','RESERVED','UNAVAILABLE']));
  }
});
test('started slots reject; ended bookings derive completed; cancelled takes precedence',async()=>{
  const {provider:p,advance}=setup(),s=await free(p);const r=await p.createReservation(s,'clock-request');
  const [hour]=s.timeSlot.split(':').map(Number);
  advance(new Date(2026,9,3,hour,1));
  assert.equal((await p.getReservation(r.id)).canCancel,false);
  await assert.rejects(p.cancelReservation(r.id));
  advance(new Date(2026,9,3,hour+1));
  assert.equal((await p.getReservation(r.id)).displayState,'COMPLETED');
  await assert.rejects(p.createReservation({...s,courtNumber:2},'past-request'));
});
test('same time across different venues rejects double personal booking',async()=>{
  const {provider:p}=setup(),s=await free(p);await p.createReservation(s,'first-request');
  const courts=await p.availability('table-tennis',s.date);
  const c=courts.find(c=>c.slots.some(t=>t.timeSlot===s.timeSlot&&t.status==='AVAILABLE'));
  await assert.rejects(p.createReservation({...s,venueId:'table-tennis',courtNumber:c.number},'overlap-request'),/已有预约/);
});
test('write failure reports failure without creating inventory; corrupt storage is not overwritten',async()=>{
  const broken=createProvider({get:()=>({version:3,localUserId:'local-test',records:[],credentials:[],redemptions:[],users:[],demoAccounts:{}}),set:()=>{throw Error('quota');}},()=>new Date(2026,9,2,7));
  await assert.rejects(broken.createReservation(await free(broken),'storage-request'),/未保存/);
  assert.equal((await broken.listReservations()).length,0);
  const corrupt=createProvider({get:()=>({version:99}),set:()=>assert.fail('must not overwrite')});
  await assert.rejects(corrupt.listReservations(),/无法读取/);
});
test('cancel is idempotent and does not touch another booking',async()=>{
  const {provider:p}=setup(),s=await free(p);const a=await p.createReservation(s,'cancel-request');
  const b=await p.createReservation(await free(p,'table-tennis','2026-10-04'),'other-request');
  await p.cancelReservation(a.id);await p.cancelReservation(a.id);
  assert.equal((await p.getReservation(b.id)).status,'ACTIVE');
  await assert.rejects(p.cancelReservation('not-found'));
});
