const fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process');
const root=path.resolve(__dirname,'..'),mp=path.join(root,'miniprogram');
const app=JSON.parse(fs.readFileSync(path.join(mp,'app.json'),'utf8'));
let count=0;
function check(base){
  for(const ext of ['.js','.json','.wxml','.wxss'])if(!fs.existsSync(path.join(mp,base+ext)))throw Error('Missing '+base+ext);
  const config=JSON.parse(fs.readFileSync(path.join(mp,base+'.json'),'utf8'));
  for(const c of Object.values(config.usingComponents||{}))check(c.replace(/^\//,''));
  cp.execFileSync(process.execPath,['--check',path.join(mp,base+'.js')]);count++;
  const content=fs.readFileSync(path.join(mp,base+'.wxml'),'utf8');
  if(/长沙理工|长理|CSUST|官方平台/.test(content))throw Error('Unexpected brand '+base);
}
for(const p of app.pages)check(p);
for(const tab of app.tabBar.list){if(!app.pages.includes(tab.pagePath))throw Error('Unregistered tab');for(const key of ['iconPath','selectedIconPath'])if(!fs.existsSync(path.join(mp,tab[key])))throw Error('Missing icon');}
for(const folder of ['services','utils','mock'])for(const f of fs.readdirSync(path.join(mp,folder)))if(f.endsWith('.js'))cp.execFileSync(process.execPath,['--check',path.join(mp,folder,f)]);
console.log(`PASS: ${app.pages.length} pages, ${count} page/component references, native routes/icons, JS syntax, JSON, brand check.`);
