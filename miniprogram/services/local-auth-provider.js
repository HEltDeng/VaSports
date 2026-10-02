const {createStore,uid,fail}=require('./local-store');
const fixtures=require('../mock/identities');
const defaultConfig=require('../config/runtime');
function createAuthProvider(storage,clock=()=>new Date(),config=defaultConfig){
 const {read,write,serial}=createStore(storage);
 function current(db){const s=db.session;return s&&s.expiresAt>clock().getTime()?db.users.find(u=>u.userId===s.userId):null;}
 function user(db){const u=current(db);if(!u)fail('AUTH_REQUIRED','请先登录');return u;}
 function studentStatus(u){return u.student&&u.student.status==='APPROVED'&&u.student.validUntil<=clock().getTime()?'EXPIRED':u.student?.status||'UNSUBMITTED';}
 function ready(u){return !!u&&!!u.phone&&u.phone.status==='DEMO_VERIFIED'&&(u.identity==='VISITOR'&&u.profileComplete&&!!u.visitor&&!!u.visitor.surname&&['MR','MS','NONE'].includes(u.visitor.honorific)||u.identity==='STUDENT'&&studentStatus(u)==='APPROVED');}
 function view(u){if(!u)return null;const status=studentStatus(u),name=u.identity==='STUDENT'&&u.student?.realName?u.student.realName+'同学':u.visitor?u.visitor.surname+({MR:'先生',MS:'女士',NONE:'访客'}[u.visitor.honorific]):'完善资料';
  return Object.assign({},u,{phone:u.phone?{masked:u.phone.number.slice(0,3)+'****'+u.phone.number.slice(-4),status:u.phone.status,source:u.phone.source}:null,student:u.student?Object.assign({},u.student,{status,studentCode:u.student.studentCode.replace(/.(?=.{4})/g,'*')}):null,displayName:name,avatar:(u.identity==='STUDENT'?u.student?.realName:u.visitor?.surname)?.slice(0,1)||'V',identityText:u.identity==='STUDENT'?(status==='APPROVED'?'本校学生':'本校学生 · 待核验'):u.identity==='VISITOR'?'校外访客':'待完善身份',ready:ready(u),studentStatus:status,qualification:ready(u)?u.identity==='STUDENT'?'LOCAL_STUDENT':'LOCAL_VISITOR':'NONE'});
 }
 function requireReady(db){const u=user(db);if(!ready(u))fail('PROFILE_REQUIRED','请先完成身份资料');return u.userId;}
 function guardPhone(u){if(!u.phone||u.phone.status!=='DEMO_VERIFIED')fail('PHONE_REQUIRED','请先绑定手机号');}
 function revoke(db,id){db.credentials=db.credentials.filter(c=>c.userId!==id);}
 return {
  requireReady,billing(db){const u=user(db);requireReady(db);return {environment:'LOCAL_DEMO',qualification:view(u).qualification,ruleId:null,amount:null,currency:null,capturedAt:clock().getTime()};},
  async getCurrentUser(){return view(current(read()));},
  login({account='A',outcome='SUCCESS',consent=false}={}){return serial(()=>{if(config.mode!=='LOCAL_DEMO')fail('MODE_ERROR','当前模式不允许演示登录');if(!consent)fail('CONSENT_REQUIRED','请先阅读并同意协议与隐私说明');if(outcome==='CANCEL')fail('CANCELLED','已取消登录');if(outcome==='FAIL')fail('LOGIN_FAILED','登录失败，请重试');if(!['A','B'].includes(account)&&!/^QA-[0-9]{13,17}$/.test(account))fail('ACCOUNT_INVALID','账号不可用');const db=read();if(db.session)revoke(db,db.session.userId);let id=db.demoAccounts[account];if(!id){id=uid('local-user-');db.demoAccounts[account]=id;db.users.push({userId:id,identity:null,phone:null,profileComplete:false,student:null,visitor:null});}db.session={userId:id,account,environment:'LOCAL_DEMO',expiresAt:clock().getTime()+7*86400000};write(db);return view(user(db));});},
  logout(){return serial(()=>{const db=read();if(db.session)revoke(db,db.session.userId);db.session=null;write(db);});},
  bindPhone({outcome='SUCCESS'}={}){return serial(()=>{const db=read(),u=user(db);if(outcome==='CANCEL')fail('PHONE_DENIED','未绑定手机号，可重新操作');if(outcome==='FAIL')fail('PHONE_FAILED','绑定失败，请重试');u.phone={number:fixtures.phones[db.session.account]||('199'+String(Object.keys(db.demoAccounts).indexOf(db.session.account)+101).padStart(8,'0')),status:'DEMO_VERIFIED',source:'FICTIONAL_QA_ONLY',verifiedAt:clock().getTime()};write(db);return view(u);});},
  selectIdentity(identity){return serial(()=>{const db=read(),u=user(db);guardPhone(u);if(!['STUDENT','VISITOR'].includes(identity))fail('IDENTITY_INVALID','请选择身份');u.identity=identity;write(db);return view(u);});},
  updateVisitor({surname,honorific}){return serial(()=>{const db=read(),u=user(db);guardPhone(u);surname=String(surname||'').trim();if(!surname||surname.length>30||!['MR','MS','NONE'].includes(honorific))fail('INVALID_PROFILE','请填写姓氏并选择称呼');if(u.identity!=='VISITOR')fail('IDENTITY_INVALID','请先选择校外访客');u.visitor={surname,honorific};u.profileComplete=true;write(db);return view(u);});},
  submitStudent({realName,studentCode}){return serial(()=>{const db=read(),u=user(db);guardPhone(u);if(u.identity!=='STUDENT')fail('IDENTITY_INVALID','请先选择本校学生');realName=String(realName||'').trim();studentCode=String(studentCode||'').trim();if(!realName||realName.length>60)fail('INVALID_NAME','请填写姓名');if(!new RegExp(config.school.studentPattern).test(studentCode))fail('INVALID_STUDENT_CODE','学号格式应为'+config.school.studentFormat);const fixture=fixtures.students.find(s=>s.schoolId===config.school.id&&s.realName===realName&&s.studentCode===studentCode);const bound=db.users.some(x=>x.userId!==u.userId&&x.student?.schoolId===config.school.id&&x.student.studentCode===studentCode&&['APPROVED','PENDING'].includes(studentStatus(x)));
   if(bound||fixture?.status==='BOUND')fail('STUDENT_BOUND','该学号已绑定其他账号，请核对或申请人工处理');
   const now=clock().getTime();u.student={schoolId:config.school.id,studentCode,realName,status:fixture?.status||'REJECTED',rosterMatch:fixture?.match||'NOT_MATCHED',source:fixtures.source,submittedAt:now,validUntil:fixture?.status==='APPROVED'?now+config.school.verificationDays*86400000:fixture?.status==='EXPIRED'?now-1:null,reason:fixture?'':'姓名与学号不匹配，请核对后重试'};u.profileComplete=true;write(db);return view(u);
  });},
  updateDraft(kind,data){return serial(()=>{const db=read(),u=user(db);if(!['student','visitor'].includes(kind))fail('INVALID_DRAFT','资料类型无效');const fields=kind==='student'?['realName','studentCode']:['surname','honorific'];const draft={};fields.forEach(k=>draft[k]=String(data[k]||'').slice(0,60));u.drafts=u.drafts||{};u.drafts[kind]=draft;write(db);});},
  async getStudentStatus(){return view(user(read())).student;},
  async sendSms(){fail('SMS_UNAVAILABLE','短信验证暂不可用');},async verifySms(){fail('SMS_UNAVAILABLE','短信验证暂不可用');}
 };
}
module.exports={createAuthProvider};
