# VaSports 视觉与运行验收 · 2026-10-02

状态：本机开发者工具运行与业务回归通过；视觉已交付候选，等待用户人工验收。未上传、未提交审核、未发布。

## 基准与范围
以用户提供的六张渲染图为视觉基准，首页优先。原位修改现行 miniprogram，没有运行 build-demo.py；工程父目录原位更名为 001_VaSports-维阿斯场馆预约。未新建副本，没有 Git 仓库可供提交或重命名远端。

登录页、手机号页、身份选择页、首页、场馆页、个人中心重构；核销页仅同步卡片风格。白底绿色 VA Logo 使用原文件，不修改图形。页面、配置、包名、README、业务文档及当前输出统一新品牌。旧 Storage 名称仅作为只读迁移来源，历史输出保留原始证据。

## 实际证据
- 已通过当前微信开发者工具重新打开改名后的同一个工程并编译。官方 QuickStart 不在运行入口。
- 实际点击：游客浏览、登录勾选与演示登录、绑定演示手机号、选择访客、填写王/先生、进入首页、Tab 切换、我的订单空状态及返回。
- 新增本地预约：次日羽毛球 1 号场 08:00–09:00，经确认页创建成功；成功页进入对应核销码，个人中心统计为 1。
- 已实际取消本轮新增预约，待使用列表为空，已取消分类保留记录且无核销入口；库存释放另外由业务测试覆盖。
- 核销码真实模拟器截图经独立 ZXing-C++ 解码成功，协议 VASPORTS / 1 / LOCAL_DEMO；未记录完整 token。未进行真机扫码或真实后台核销。
- npm test：32/32 通过，包括预约取消库存、防重、用户隔离、退出失效、核销幂等和品牌命名空间迁移。npm run check：16 页面、24 页面/组件引用通过。
- 当前截图检查未见阻塞性红色业务错误。Console 仍有开发工具 WAService 预加载和 WAWorker reportRealtimeAction not support 警告；没有隐藏日志。此前 DOMNodeRemoved 本轮未复现，不能据此宣称已修复。

## 与目标图的差异
布局、绿蓝红色分工、卡片层级及入口顺序已对齐；尚非逐像素复刻。运动素材的朝向、立体效果和背景波纹不同；微信原生导航、Tab、设备字体与参考渲染图不同。场馆元信息为两行，避免小屏拥挤；首页空闲数为实时本地计算，夜间为 0，不硬编码参考图的 6/7。当前个人中心显示实际填写的王先生，不修改其他既有用户资料。

身份卡展示“本校学生 / 教职工”，现有业务仍为学生核验分支；教职工独立资料及核验未实现，不会额外授予资格。我的订单提供受保护的空状态，没有真实支付或收费订单。登录、手机号及身份均为原有 LOCAL_DEMO provider；未增加真实接口联调。

## 截图
05_Output/vasports-ui-20261002/ 内保存六页原始窗口截图、裁剪后的模拟器截图、六页总览及核销码补图。裁剪仅去除工具外框，不修改页面内容。用户手动验收和真机显示仍待确认。

## 主要改动位置
miniprogram/pages/{login,bind-phone,identity-select,home,venues,profile,orders,redemption-code}；components/venue-card；styles/{visual,account}；assets；app.js/app.json；services/local-store.js；utils/{auth-flow,brand-storage}；mock/venues.js；project.config.json/project.private.config.json；package.json；README.md/docs；tests/brand-migration.test.js；资产处理脚本。
