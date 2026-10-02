const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
const {createProvider}=require('../miniprogram/services/local-provider');const {days}=require('../miniprogram/utils/date');
test('page hides stale image on cancellation/redemption, retries failed loading, and clears timers on hide',async()=>{
 let db,now=new Date();now.setHours(7,0,0,0);const storage={get:()=>db,set:(k,v)=>{db=JSON.parse(JSON.stringify(v));}},clock=()=>now,p=createProvider(storage,clock);
 const date=days(now)[1].value,courts=await p.availability('badminton',date),court=courts.find(c=>c.slots.some(t=>t.status==='AVAILABLE')),slot=court.slots.find(t=>t.status==='AVAILABLE');
 const r=await p.createReservation({venueId:'badminton',date,courtNumber:court.number,timeSlot:slot.timeSlot},'page-test');
 let page,timer,failed=false;const FakeDate=class extends Date{static now(){return now.getTime();}};
 const services={'../../utils/auth-flow':{guard:async()=>true},'../../services/redemption-service':{get:id=>failed?Promise.reject(new Error('读取失败')):p.getRedemptionCredential(id)},'../../services/reservation-service':{get:p.getReservation},'../../utils/qr':{image:()=> 'encoded-image'}};
 vm.runInNewContext(fs.readFileSync('miniprogram/pages/redemption-code/index.js','utf8'),{require:n=>services[n],Page:v=>{page=v;},Date:FakeDate,setInterval:fn=>{timer=fn;return 1;},clearInterval:()=>{timer=null;}});
 page.setData=function(v){Object.assign(this.data,v);};page.onLoad({reservationId:r.id});page.visible=true;await page.load();assert.equal(page.data.phase,'ready');assert.ok(timer);
 page.onHide();assert.equal(timer,null);assert.equal(page.data.image,'');
 page.visible=true;failed=true;await page.load();assert.equal(page.data.phase,'invalid');assert.equal(page.data.image,'');failed=false;await page.load();assert.equal(page.data.phase,'ready');
 const old=db.credentials[0].token;now=new Date(db.credentials[0].expiresAt);await page.tick(page.sequence);await new Promise(resolve=>setImmediate(resolve));assert.notEqual(db.credentials[0].token,old);assert.equal(page.data.phase,'ready');
 await p.cancelReservation(r.id);await page.tick(page.sequence);assert.equal(page.data.image,'');assert.equal(page.data.message,'预约已取消');await page.load();assert.equal(page.data.phase,'invalid');
 const second=await p.createReservation({venueId:'badminton',date,courtNumber:court.number,timeSlot:slot.timeSlot},'page-new-test');page.id=second.id;now=new Date(second.startsAt-60000);await page.load();const c=await p.getRedemptionCredential(second.id),admin=createProvider(storage,clock,{operator:{id:'qa',permissions:['redemptions:confirm'],venueIds:['badminton']}});await admin.confirmRedemption(c.payload,'page-redeem');await page.tick(page.sequence);assert.equal(page.data.image,'');assert.equal(page.data.message,'预约已核销');await page.load();assert.equal(page.data.phase,'invalid');
});
