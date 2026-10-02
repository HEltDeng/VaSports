# 登录、身份与账号接入契约

## 本轮实际状态

2026-10-02，工程只配置 LOCAL_DEMO，未发现独立测试API地址或真实认证实现。没有连通真实登录、手机号、短信或学校核验接口。HTTP适配代码已建立，但未联调；HTTP错误绝不回退模拟成功。未使用、修改旧项目或生产数据库。

AppID已配置不等于手机号权限已开通。本轮未获得该AppID后台接口权限页证据，也未调用真实手机号兑换接口，因此 phoneCapability=UNKNOWN。只有将权限证据和独立服务端配置核实后，才能设为ENABLED并启用原生getPhoneNumber按钮。未知/不可用时保留短信适配；当前没有短信服务，不能成功验证任何用户输入号码。没有开通云开发或付费资源。

官方文档入口：https://developers.weixin.qq.com/miniprogram/dev/framework/open-ability/getPhoneNumber.html 与 https://developers.weixin.qq.com/miniprogram/dev/framework/open-ability/login.html 。本轮检索器无法读取官方正文，因此不据此声称已核验账号权限或当前准入条件。

## 数据和迁移

继续使用同一Storage key vasports.reservations.v1，schema version=3。v1/v2复制为内存对象，所有迁移完成后单次set写回；失败不覆盖旧数据，可重复读取不重新迁移。

新增users、demoAccounts、session、wechatIdentities（本地为空）、migrations。账号A唯一映射原localUserId，旧records.userId不改变；账号B首次登录独立生成userId。旧记录不复制给B；所有用户共享同一records库存。新用户不会继承其他用户预约。登录恢复只依赖未过期session；迁移不会自动登录。退出只撤销当前会话与本用户凭证，不删用户或预约。

- 业务用户：userId、phone{number,status,source,verifiedAt}、identity申请身份、profileComplete、visitor、student、drafts。
- 微信身份：正式后端保存appid/openid/userId，未来确有unionid才保存；本地不生成假OpenID。
- 学生资格：schoolId、studentCode字符串、realName、status、rosterMatch、source、submittedAt、validUntil、reason。
- 访客：surname、honorific=MR/MS/NONE，无强制gender。
- 会话：本地仅演示userId/account/environment/expiresAt；真实业务sessionToken独立保存，不保存session_key/AppSecret。
- 预约：原稳定userId保留。新增billingSnapshot{environment,qualification,ruleId,amount,currency,capturedAt}；当前金额与收费规则为null。资料变化不回写旧预约或历史价格。
- 核销：原reservationId/userId/courtId/token/redemptionId关联不变；页面隐藏内部ID，二维码仍为不透明LOCAL_DEMO凭证。

## 状态与资格

身份选择只是申请。phone绑定后再选STUDENT或VISITOR。VISITOR完成姓氏/称谓；STUDENT必须有效APPROVED才允许提交预约。UNSUBMITTED/PENDING/REJECTED/EXPIRED不获得学生计费资格，不自动切换访客。允许用户主动重新选择身份。既有有效学生资格在更换申请身份时仍独立保留，学号不会因切换身份释放给另一账号。

profileComplete仅表示资料已提交；rosterMatch仅表示数据匹配。正式本人资格必须来自学校授权认证或授权资料+人工复核，不能只依靠姓名学号匹配。演示APPROVED来源始终FICTIONAL_QA_ONLY，qualification为LOCAL_STUDENT而非正式STUDENT。演示学号规则为8位数字，来自config/runtime.js，不是任何学校实际规则。

游客能浏览场馆、日期和时段；个人预约、核销码、预约提交由页面及provider双层检查。登录前目标仅允许已知内部页面，不接受任意外部URL；完成后恢复场位日期，重新读取可用时段，确认页及提交再次检查库存。隐藏时清理敏感卡片与QR；退出撤销旧token。正式后端仍必须逐请求鉴权，本地检查不代表防篡改安全。

## API草案（尚未连通）

| 方法及路径 | 输入 | 行为 |
|---|---|---|
| POST /v1/auth/wechat | loginCode | 后端兑换微信身份，关联业务userId，返回sessionToken与user |
| POST /v1/me/phone/wechat | phoneCode | 已登录会话归属；后端兑换手机号绑定，返回脱敏用户摘要 |
| POST /v1/me/phone/sms | phone | 发送短信挑战，限速、防枚举、费用控制；当前未开通 |
| POST /v1/me/phone/sms/verify | phone,smsCode | 服务端核对挑战、次数、有效期并绑定 |
| GET /v1/me | Bearer业务会话 | 返回用户摘要、脱敏phone/studentCode、ready、资格来源和状态 |
| PUT /v1/me/identity | identity | 保存申请身份，不授予学生资格 |
| PUT /v1/me/visitor | surname,honorific | 保存访客资料，号码沿用已验证绑定 |
| PUT /v1/me/drafts/{student或visitor} | 对应表单字段 | 保存当前用户未提交草稿，不触发核验，不赋予资格 |
| POST /v1/me/student-verification | realName,studentCode | schoolId由服务端机构配置确定；启动授权核验流程 |
| GET /v1/me/student-verification | 已登录会话 | 返回当前核验状态与脱敏资料 |
| POST /v1/auth/logout | 已登录会话 | 服务端撤销会话和当前可重用核销凭证 |

HTTP user摘要必须与前端current契约一致：userId、phone{masked,status,source}、identity、profileComplete、student{脱敏studentCode,realName,status,...}、visitor、displayName、avatar、identityText、ready、studentStatus、qualification。不返回完整OpenID或任何微信服务端密钥。编辑草稿仅本人访问；常规资料页只显示脱敏学号/手机号。

服务端不信任客户端isStudent/price/role/userId。学生资格唯一约束至少(schoolId,studentCode)；原子核验并绑定本人，待审核也占用审核关联，冲突返回STUDENT_BOUND。生产认定身份、到期、价格及权限均以服务端可信数据为准。管理员与学生/访客身份完全分离。

未来管理端应关联：用户→微信身份与已验证联系方式→学生资格/访客资料→预约→核销。需独立部署、真实身份链路、授权来源、管理员复核、访问审计、资料更正和隐私保留/删除制度；不直接接旧生产库。

## 验收数据与操作

全部为虚构测试数据，位于miniprogram/mock/identities.js。不要输入真实个人资料。默认账号A沿用旧预约，B为独立测试账号。登录页“切换账号”只在LOCAL_DEMO显示。

| 姓名 | 学号 | 模拟结果 |
|---|---|---|
| 林知远 | 00000001 | 已通过（模拟本人核验结果，非真实学校认证） |
| 周予安 | 00000002 | 审核中，名单匹配不授予资格 |
| 陈望舒 | 00000003 | 已失效 |
| 沈星河 | 00000004 | 已绑定，拒绝 |
| 任意其他测试组合 | 如00000999 | 未通过 |

A先绑定00000001后，B提交同一组合应返回已绑定。手机号fixture为A=19900000001，B=19900000002，来源FICTIONAL_QA_ONLY，状态DEMO_VERIFIED；没有发送短信或取得微信授权。换号页面再次走验证适配，不能直接编辑号码标记成功。

在开发工具Console仅设置验收控制项（不打印真实资料）：

```js
wx.setStorageSync('vasports.qa', {account:'A',login:'CANCEL',phone:'SUCCESS'})
// login: SUCCESS / CANCEL / FAIL；phone: SUCCESS / CANCEL / FAIL。
// 每次点击重新读取。重试前把对应值改为SUCCESS。
```

“我的→退出登录”回登录引导且保留全部预约。再次登录已完成A/B会自动恢复。要重演完整首次流程：退出→登录页“切换账号”→“新建体验账号”→同意协议→微信登录。它只在LOCAL_DEMO提供，每次创建独立QA用户，保留A/B和全部预约，库存仍共享；无任何真实账号创建或外部请求。新账号可走访客全流程；学生00000001如已归属A，必须显示绑定冲突，不能以重新体验绕过。要继续查看已完成学生用例，选择账号A。

交付最终会话保持退出状态；A的学生资料、B的访客资料保留。可从新建体验账号开始人工验收，无需删除任何Storage。