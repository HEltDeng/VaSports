function error(e){wx.showToast({title:e.message||'操作失败，请重试',icon:'none',duration:3000});}
function query(s){return Object.keys(s).map(k=>`${k}=${encodeURIComponent(s[k])}`).join('&');}
function selection(o){return {venueId:o.venueId,date:o.date,courtNumber:Number(o.courtNumber),timeSlot:o.timeSlot?decodeURIComponent(o.timeSlot):''};}
module.exports={error,query,selection};
