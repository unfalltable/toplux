> 生产部署验证见 [PRODUCTION-DEPLOYMENT.md](docs/PRODUCTION-DEPLOYMENT.md)：独立 Nginx 8080、PostgreSQL 与应用均健康，53 项测试及公网 Chrome 回归通过；备份恢复验证通过。正式库不含演示资料、账号、订单、资金或预置流量，原项目容器未改动或重启。以下为历史报告。

> 最新品牌填充与定位顺序验证见 [CATEGORY-POSITIONING.md](docs/CATEGORY-POSITIONING.md)：40 品类、131 份资料、120 个品牌／产品线；51 项后端测试、类型检查、构建及四套 Google Chrome 回归通过。补充检查了 40 类手机排版和定位编辑审核。原助力榜金额、名次一致，门店入口继续关闭。以下报告保留为历史记录。

> 最新首次品类设置、先展示后审核及纠错验证见 [CATEGORY-GOVERNANCE.md](docs/CATEGORY-GOVERNANCE.md)，35 项测试通过；历史报告保留如下。

> 最新动态榜单、霸榜计时和打款连击验证见 [LIVE-RANKINGS.md](docs/LIVE-RANKINGS.md)，29 项后端测试及新版 Chrome 回归已通过。

> 当前续作验证见 [CONTINUATION-REPORT.md](docs/CONTINUATION-REPORT.md)。下文为前一轮历史记录，旧登录、退款及独立商家数据页流程不代表当前实现。

# 奢榜实际验证报告
日期：2026-10-27；设备：Windows / Google Chrome。当前为本地开发沙箱。

## 本轮完成
- 取消“商家中心”网页入口；平台后台 /#admin、商家数据 /#analytics、推广与账单 /#promotion 各自明确。旧 /#manage 兼容进入数据看板。
- 平台ADMIN可看全站访问统计，维护品类和品牌、审核修订/商家/链接、处理反馈，查看订单与审计。
- 自有商家数据：榜单曝光次数与访客、详情PV/UV、官网/店铺/直播/视频点击及点击访客，7/30/90天筛选、逐日趋势、渠道明细与CSV导出。
- 003迁移持久保存实际访问，匿名第一方Cookie摘要去重、事件键幂等、基础限频、登录商家本人访问不计。官网与直播链接必须经审核；点击由服务端302跳转记录。
- 网页重做顶部导航、摄影总榜、三甲、品牌图鉴、品牌卡、数据看板及平台后台。首页未增加底部推荐区，图片本地保存。

## 已通过的实际检查
- npm test：22/22。含原资金与总榜、品类品牌审核测试，以及5项新统计测试：匿名标识、曝光/PV/UV/分类点击、事件幂等、租户隔离/审核/本人预览、时间范围/隐藏历史、URL限制。
- npm run typecheck：通过。
- npm run build：通过；React产物 dist/web。
- npm run test:e2e：Chrome通过。总榜三甲、首页旧推荐移除、图鉴、对比、演示登录、Logo上传、沙箱付款与分类榜；375/390/430/768/1280宽度无整页横向溢出，弹窗可操作。
- npx tsx tests/catalog-browser.ts：Chrome通过。品类新增、改名停用、品牌新增、第二人审核、修订发布、版本变更及下线。
- npx tsx tests/analytics-browser.ts：Chrome通过。商家配置官网/直播链接、平台审核、可见曝光、详情PV/UV、服务端302与分类点击、登录/角色隔离、时间筛选与CSV下载、旧路由兼容、各屏幕宽度的数据页及后台。无页面脚本错误。
- npx tsx tests/api-smoke.ts：HTTP集成通过。全站跨品类汇总、退款扣减、商家归属和后台写权限。
- 已在托管Chrome实际查看首页影像、三甲、图鉴、商家数据、平台后台视觉。
- 本轮发现并修复：刷新榜单时已有三甲短暂消失；旧E2E导航选择器仍指向侧栏；保存链接后看板未立即刷新；首次访问多个曝光可能使用不同匿名标识。修正后相关回归已通过。

## 验证边界
- 自动化浏览器验证会生成明确命名的本地演示品牌、订单、链接及少量验证访问，不发生真实扣款。
- 访问仅表示本站曝光、浏览和外跳，不能视作直播真实观看、下单或成交。UV按浏览器计算，跨设备、清Cookie会重复。
- 无历史流量回填，也未提供生产级机器人识别、站外归因、真实支付、短信及正式身份认证。
- Flutter本轮未修改或重建；先前通过的Flutter检查属于上一轮，不能视作本轮新视觉与数据看板验证。
- 外部PostgreSQL多连接/恢复、原生安装包、全页面200%字号矩阵尚未验证。
- 本轮未创建Git、未部署、未推送。

## 证据
- artifacts/browser-result.json、catalog-result.json、analytics-browser-result.json、api-result.json
- artifacts/home-desktop.png、home-375.png等尺寸截图
- artifacts/platform-dashboard.png、merchant-analytics-desktop.png、analytics-375.png等截图、analytics-export.csv
- 方案 docs/VISUAL-ANALYTICS-PLAN.md；接口 docs/API.md；摄影来源 docs/IMAGE-SOURCES.md
