// Read-only compatibility with the previous brand namespace. Never remove old data.
function migrate(storage){for(const suffix of ['auth.intent','http.session','qa']){const key='vasports.'+suffix,old=['vaa','sports.',suffix].join('');const current=storage.getStorageSync(key);if(current===''||current==null){const value=storage.getStorageSync(old);if(value!==''&&value!=null)storage.setStorageSync(key,value);}}}
module.exports={migrate};
