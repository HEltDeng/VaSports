const flow=require('../../utils/auth-flow');
const redemption=require('../../services/redemption-service');
const reservations=require('../../services/reservation-service');
const qr=require('../../utils/qr');
Page({
  data:{reservation:null,phase:'loading',message:'正在获取核销码…',image:'',remaining:0},
  onLoad(o){this.id=o.reservationId||'';this.sequence=0;},
  async onShow(){this.visible=true;const sequence=++this.sequence;try{if(await flow.guard('/pages/redemption-code/index?reservationId='+encodeURIComponent(this.id))&&this.visible&&sequence===this.sequence)this.load();}catch(e){this.fail(e);}},
  onHide(){this.stop();},onUnload(){this.stop();},
  stop(){this.visible=false;this.sequence++;clearInterval(this.timer);this.timer=null;this.setData({reservation:null,image:'',phase:'loading',remaining:0});},
  fail(e){clearInterval(this.timer);this.timer=null;this.setData({image:'',remaining:0,phase:'invalid',message:e.message||'核销码获取失败，请重试'});},
  async load(){
    const sequence=++this.sequence;clearInterval(this.timer);this.timer=null;
    this.setData({image:'',phase:'loading',message:'正在获取核销码…',remaining:0});
    try{
      const value=await redemption.get(this.id);
      if(!this.visible||sequence!==this.sequence)return;
      if(value.expiresAt<=Date.now())throw new Error('核销码已过期，请刷新');
      const image=qr.image(value.payload);
      this.expiresAt=value.expiresAt;
      this.setData({reservation:value.reservation,image,phase:'ready',remaining:Math.ceil((value.expiresAt-Date.now())/1000)});
      this.timer=setInterval(()=>this.tick(sequence),500);
    }catch(e){if(this.visible&&sequence===this.sequence)this.fail(e);}
  },
  async tick(sequence){
    if(!this.visible||sequence!==this.sequence)return;
    const remaining=Math.max(0,Math.ceil((this.expiresAt-Date.now())/1000));
    if(!remaining){this.setData({image:'',phase:'loading',message:'核销码已过期，正在刷新…'});this.load();return;}
    this.setData({remaining});
    // Recheck eligibility while visible; never continue showing a cancelled/redeemed code.
    if(this.checking)return;this.checking=true;
    try{const r=await reservations.get(this.id);if(this.visible&&sequence===this.sequence&&!r.canShowCode)this.fail(new Error(r.statusText==='已取消'?'预约已取消':r.redemptionStatus==='REDEEMED'?'预约已核销':'预约已结束'));}
    catch(e){if(this.visible&&sequence===this.sequence)this.fail(e);}
    finally{this.checking=false;}
  },
  imageFailed(){this.fail(new Error('二维码加载失败，请刷新'));}
});
