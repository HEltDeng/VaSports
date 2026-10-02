# VaSports 核销接口与下一阶段接入契约

本文件为设计契约，不表示真实接口已经部署。当前只有原生小程序、本地 provider 和本地验证。内部演示不收费、不连接真实库存、不具备微信用户认证或跨设备核销能力。界面精简不改变此边界。

账户扩展更新：登录与身份流程已将 schema 升级为 version 3，当前用户映射、会话及迁移以 IDENTITY_CONTRACT.md 为准。下文 version 2 为上一阶段数据基线，核销协议及状态规则继续保留。

## 现行数据与迁移

保持 Storage key `vasports.reservations.v1`，内部 schema 从 version 1 原位迁移到 version 2。一次 setStorageSync 原子写入完整对象，不清空历史。迁移失败则报错，保留原数据。version 2 包含 localUserId、records、credentials、redemptions。历史预约 id、requestId、取消状态与时间原样保留；追加 userId、courtId、startsAt、endsAt、redemptionStatus。

默认 localUserId 首次创建后持久化，格式 `local-user-<32 hex>`，并非 OpenID、微信登录或服务端认证。独立存储环境独立生成 ID；自动测试通过 provider 构造器固定不同测试 userId。普通操作方法不接受 userId/role 参数。迁移的历史记录归属于该设备首次创建的本地用户，不代表已核实真实所属人。正式接入应明确历史演示数据隔离方案，不直接迁入生产预约。

courtId 为 `<venueId>:court:<courtNumber>`，如 `badminton:court:1` 和 `table-tennis:court:1` 不同。后端上线时须将其映射为服务端场位主键，不使用显示名称检索。

预约保持 status=ACTIVE/CANCELLED；核销状态单独为 PENDING/REDEEMED。结束只推导显示“已结束”，不更新核销状态、不生成核销事件。已核销显示“已核销”，归入第二个分类，禁止用户取消；ACTIVE 库存约束继续保留至场次结束，核销不释放库存。

## 二维码协议与时间

二维码 ASCII 内容：`VASPORTS|1|LOCAL_DEMO|local-token-<32 hex>`。除业务标识、协议版本、环境和不透明凭证外无其他信息。token 映射到预约、userId、venueId、courtId、起止时间、预约/核销状态和 expiresAt；不包含手机号、OpenID、登录凭据、AppSecret 或完整预约 JSON。

本地默认 TTL=60 秒，配置位于 createProvider 的 policy.ttlSeconds。过期重新请求 provider，签发新 token，旧 token 不再可用；刷新不改预约状态。页面隐藏即停定时器并清图，重新显示重新核验；显示时检查资格，失败清除旧码。到达结束时间时凭证立即失效。退出页面不允许从缓存恢复旧码。

独立核销窗口配置：policy.earlyMinutes=30，允许从开始前 30 分钟至结束前核销。这仅为本地测试配置，不是学校规定。可以提前出示码，但 query 返回 canRedeem=false，confirm 返回 OUTSIDE_WINDOW。TTL 与场馆时间窗互不替代。

本地 token 使用本地随机值与本地存储，客户端可修改，不能提供真实防伪或分布式并发安全。生产必须使用服务端密码学安全随机 token、存储 token 哈希、可信时间、TLS、短 TTL、服务端身份与权限，以及数据库事务。生产协议环境须独立且明确拒绝 LOCAL_DEMO，即使 token 形状匹配也拒绝。

## 未来三个接口

所有时间采用服务端 Unix 毫秒，场馆业务时区显式配置；请求失败返回 `{code,message,requestId}`，不得泄露 token 或他人资料。严禁把前端提交的 userId、operatorId、role 或 canRedeem 当成授权依据。

| 操作 | 建议接口 | 输入 | 返回 |
|---|---|---|---|
| 本人获取凭证 | POST /v1/reservations/{reservationId}/redemption-credential | 已登录会话，路径预约 ID | payload, expiresAt, serverTime, environment, reservation 摘要 |
| 管理员扫码查询 | POST /v1/admin/redemptions/resolve | payload；管理员会话 | reservation 摘要, canRedeem, reason, windowOpensAt, expiresAt |
| 管理员确认核销 | POST /v1/admin/redemptions/confirm | payload, requestId；管理员会话 | redemptionId, reservationId, redeemedAt, operatorId, requestId |

reservation 摘要至少包含 id、userId（受授权的内部短编号）、venueId、courtId、courtNumber、date、timeSlot、startsAt、endsAt、status、redemptionStatus。查询不改变预约或核销状态。确认必须重新检查所有条件，不能信任上一次查询结果。

确认事务中：认证管理员与场馆权限 → 校验环境和 token → 锁定预约 → 核对所属用户/场位映射、取消/结束/已核销状态与时间窗 → 插入唯一 reservationId 核销记录 → 更新 redemptionStatus → 提交。唯一约束至少覆盖 redemptions.reservationId 与 (operatorId,requestId)。相同 requestId 与相同 payload 重试返回同一结果；同一 requestId 不同输入返回 IDEMPOTENCY_CONFLICT；新 requestId 扫已核销预约返回 REDEEMED。确认与取消应锁同一预约行，避免两者同时成功。现行库存唯一约束保留。

核销审计至少记录 redemptionId、reservationId、redeemedAt、operatorId、requestId，可追加设备/场馆与结果代码；不记录可重用的明文凭证。本地 redemptions.payload 仅用于幂等输入比对，正式实现必须改为 payload/token 哈希，不上传演示凭证。

错误码：INVALID_TOKEN、TOKEN_EXPIRED、TOKEN_MISMATCH、NOT_FOUND、FORBIDDEN、CANCELLED、ENDED、REDEEMED、OPERATOR_FORBIDDEN、OUTSIDE_WINDOW、IDEMPOTENCY_CONFLICT、STORAGE_FAILED。真实 API 应按权限设计不泄露存在性的错误回应。

## 旧项目只读审计（2026-10-02）

依据我的长理 SOURCE_OF_TRUTH.md 定位：业务后端及管理员页面位于 `01_Source-当前源码/02_Backend-Admin`，其 `admin` 子目录包含界面；官网为独立 `03_Website`，承担展示/下载，不是预约业务后端。审计 Backend HEAD：11b7f95b8aacda665363b6c1fb236895c466cac4。未修改旧代码、线上配置或数据库。

源代码确有 admin/app.js 的 reservations 渲染器、分页和筛选、预约详情、管理员取消、资料查看/核验操作，以及 server.py 对应路由、schema.sql 数据表与 tests/test_api.py。它不是只有一个 server.py 的概念占位。**本轮只读源码，没有启动或登录旧后台，因此不声明已实机验证当前管理页面可运行。**

可参考：场馆/时段配置，court_number + venue_id 库存键，七天规则，维护关闭，预约列表/详情/取消，角色权限与审计，事务及库存唯一约束。

需重构或新增：独立 VaSports 部署与数据库、真实微信登录和用户绑定、稳定 courtId、短时凭证表、扫码解析、确认核销事务、幂等/一次性约束、redemptions 记录与服务端时间窗、用户端状态刷新。旧 `/api/v1/admin/reservations/{id}/verify` 实际是资料核验，可在 PENDING/VERIFIED/REJECTED/NOT_REQUIRED 间改状态，并非一次性扫码到场核销；不可直接复用为本次核销成功证明。

## 下一阶段验收链路

真实用户预约 → 独立后端持久化 → 管理端可查看 → 另一设备管理员扫码查询 → 人工确认 → 写入核销事件 → 用户端刷新为已核销。必须验证跨设备、鉴权失败、过期、取消与核销竞争、重复提交、数据库唯一约束和库存不释放。走通之前状态保持“真实后端核销未完成”。

本轮不启用截屏拦截；截图用于验收。不声称开发工具、iOS 或 Android 支持禁止截图。二维码图片解码、本地核销、真机扫码和跨设备服务端核销分别验收。
