const pad = n => String(n).padStart(2, '0');
function dateKey(d) { return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`; }
function days(now = new Date()) {
  return Array.from({length:7}, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate()+i);
    return {value:dateKey(d), label:i===0?'今天':i===1?'明天':i===2?'后天':'周'+'日一二三四五六'[d.getDay()], short:`${pad(d.getMonth()+1)}.${pad(d.getDate())}`};
  });
}
function instant(date, time) { const [y,m,d]=date.split('-').map(Number); const [h,min]=time.split(':').map(Number); return new Date(y,m-1,d,h,min).getTime(); }
module.exports = { dateKey, days, instant };
