const slots = Array.from({length:13}, (_,i)=>`${String(i+8).padStart(2,'0')}:00-${String(i+9).padStart(2,'0')}:00`);
// Stable inventory fixtures: last court is under maintenance; other courts mix reserved/free.
function fixture(venue, date, slot, court) {
  if (court===venue.count) return 'UNAVAILABLE';
  const seed=Number(date.replace(/-/g,''))+slots.indexOf(slot)+court*3;
  return seed%7===0 || (court===venue.count-1 && slots.indexOf(slot)%3!==0) ? 'RESERVED':'AVAILABLE';
}
module.exports={slots,fixture};
