const p=require('./provider');
module.exports={login:p.login,logout:p.logout,current:p.getCurrentUser,bindPhone:p.bindPhone,sendSms:p.sendSms,verifySms:p.verifySms};
