const provider=require('./provider');
const labels={AVAILABLE:'空闲',RESERVED:'已预约',UNAVAILABLE:'不可用',PAST:'已开场'};
async function availability(id,date){
  const courts=await provider.availability(id,date);
  return courts.map(c=>{
    const free=c.slots.filter(s=>s.status==='AVAILABLE').length;
    const maintained=c.slots.every(s=>s.status==='UNAVAILABLE'||s.status==='PAST');
    return Object.assign({},c,{free,summary:maintained?'不可用':free===0?'已满':free===c.slots.length?'空闲':'部分占用',slots:c.slots.map(s=>Object.assign({},s,{label:labels[s.status]}))});
  });
}
async function list(date){return Promise.all((await provider.listVenues()).map(async v=>{
  const courts=await availability(v.id,date),free=courts.reduce((n,c)=>n+c.free,0);
  return Object.assign({},v,{free,summary:free===0?'暂无空闲':'可预约',availableCourts:courts.filter(c=>c.free>0).length});
}));}
module.exports={list,get:provider.getVenue,availability};
