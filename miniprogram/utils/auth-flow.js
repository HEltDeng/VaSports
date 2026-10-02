const auth=require('../services/auth-service');
const KEY='vasports.auth.intent';
const tabs=['home','venues','reservations','profile'];
function next(u){return !u?'login':!u.phone?'bind-phone':!u.identity?'identity-select':!u.ready?(u.identity==='STUDENT'?'student-verification':'visitor-profile'):null;}
function safe(url){return typeof url==='string'&&/^\/pages\/(orders|home|venues|venue-detail|booking|booking-confirm|reservations|redemption-code|profile|user-detail|booking-success)\/index(?:\?[^#]*)?$/.test(url);}
function open(url){if(!safe(url))url='/pages/home/index';const tab=tabs.find(t=>url==='/pages/'+t+'/index');if(tab)wx.switchTab({url});else wx.reLaunch({url});}
function remember(url){if(safe(url))wx.setStorageSync(KEY,url);}
async function advance(){const u=await auth.current(),route=next(u);if(route){wx.reLaunch({url:'/pages/'+route+'/index'});return;}const url=wx.getStorageSync(KEY);wx.removeStorageSync(KEY);open(url||'/pages/home/index');}
async function guard(url,complete=true){const u=await auth.current();if(!u||complete&&!u.ready){remember(url);wx.reLaunch({url:'/pages/'+(next(u)||'login')+'/index'});return false;}return true;}
function start(url='/pages/home/index'){remember(url);wx.reLaunch({url:'/pages/login/index'});}
function clearSensitive(){for(const p of getCurrentPages()){if(p.stop)p.stop();const patch={};for(const k of ['user','reservation','recent'])if(k in p.data)patch[k]=null;for(const k of ['all','records'])if(k in p.data)patch[k]=[];if('image'in p.data)patch.image='';if('active'in p.data){patch.active=0;patch.completed=0;}p.setData(patch);}}
async function logout(){try{await auth.logout();}finally{wx.removeStorageSync(KEY);clearSensitive();wx.reLaunch({url:'/pages/login/index'});}}
module.exports={next,advance,guard,start,remember,logout,open,safe};
