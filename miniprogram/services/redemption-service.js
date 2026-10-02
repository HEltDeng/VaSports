const provider=require('./provider');
module.exports={get:provider.getRedemptionCredential,query:provider.queryRedemption,confirm:provider.confirmRedemption};
