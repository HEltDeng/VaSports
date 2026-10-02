const config=require('../config/runtime');
const storage={get:key=>wx.getStorageSync(key),set:(key,value)=>wx.setStorageSync(key,value)};
if(config.mode==='LOCAL_DEMO'){
 const auth=require('./local-auth-provider').createAuthProvider(storage);
 const booking=require('./local-provider').createProvider(storage,()=>new Date(),{requireUser:auth.requireReady,billing:auth.billing});
 module.exports=Object.assign({},booking,auth);
}else if(config.mode==='HTTP')module.exports=require('./http-provider').createHttpProvider(config,wx);
else throw Error('Unknown VaSports environment');
