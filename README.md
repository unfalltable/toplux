
# 奢榜 Shèbang

已独立部署生产展示版：[http://149.88.67.92:8080](http://149.88.67.92:8080)。正式数据库不导入本地演示数据；收款和公网后台关闭。部署、备份及后续域名接入见 [生产部署记录](docs/PRODUCTION-DEPLOYMENT.md)。下文本地开发说明继续保留。

可运行的本地开发版。首页展示跨品类品牌累计助力总榜，同一品牌各品类金额合并，前三名独立展示。首页用独立筛选查看品类榜，导航保留“奢品图鉴”。真实支付未开通，所有资金操作均是本地沙箱。

## 本地启动（Windows / Node.js 24）

```bat
npm ci
npm run build
npm run dev
```

打开 http://127.0.0.1:3100 。Flutter Web 编译版入口为 http://127.0.0.1:3100/flutter/ 。API 和 Web 同源。默认使用 .data/postgres 下的持久化 PostgreSQL（PGlite），不用先装 Docker。请勿启动两个 API 同时打开同一目录。

后台启动可用：

```bat
powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts\start-persistent.ps1
```

- 前台无需登录，可浏览品牌、关注和为任意公开品牌助力。关注与助力记录保存在当前浏览器，清除 Cookie 或更换设备后无法恢复访客记录。
- 首页直接展示跨品类累计总榜，前三名独立展示，可用榜单品类下拉框切换；导航不再单列品类榜。每 3 秒自动刷新，支持升降换位、金额过渡和持久化霸榜计时。
- 品类仅首次成功助力时建议，立即进入暂定品类榜并标注待核实；后续自动沿用。可在助力表单或详情提交纠错，平台后台“品牌归类”确认或纠正，保留依据与修改记录，付款金额和总榜不变。规则及验证见 docs/CATEGORY-GOVERNANCE.md。
- 成功到账触发光效与提示；同一品牌 30 秒内连续到账叠加连击，三连起触发暴击动画，仅视觉反馈，不改变入账金额。
- 通过“为品牌助力”选择品牌和金额（1 至 100000 整数元）；尚未设置归属时选择建议品类，完成沙箱助力。款项收款方固定为平台，不支持退款。
- 榜单与详情卡可直达当前品牌奢品图鉴，阅读品牌故事、代表产品、价值与身份表达；支持 40 个品类、180 份品牌资料（164 个独立品牌或产品线），均附官方入口。各品类按编辑定位与参考顺序阅读，高端专业参考单独标注，详见 docs/CATEGORY-POSITIONING.md。后台支持完整内容编辑与第二人审核，见 docs/BRAND-ATLAS.md。
- 首版先聚焦品牌图鉴与打榜，门店／销售的前后台入口及相关业务接口默认关闭。已完成的沙箱代码与数据保留；该模块尚未接入正式账号和真实收费，记录见 docs/PARTNER-MARKET.md。
- 图鉴已增加受众、大众／圈内辨识度、表达风格和社交场景，并支持按编辑定位筛选；编辑判断独立于累计助力。
- 品牌卡和详情展示实际热度、关注、官网与直播跳转次数；没有单独的公开商家数据页。热度为详情浏览次数，直播指标为跳转次数。
- 平台后台独立入口为 http://127.0.0.1:3100/admin ，游客不能访问，前台不展示后台入口。当前本机开发账号可执行下列命令，在 Google Chrome 中打开一次性后台入口，凭据不输出到终端：

```bat
powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts\\open-admin.ps1
```

- 后台支持品类、品牌、修订及链接审核、商家可见性、反馈和全站数据。正式后台认证尚未接入。
- 常驻服务为当前账号计划任务 CloseAI-Paihang-LocalDev-54ff658e；停止可运行 Stop-ScheduledTask -TaskName CloseAI-Paihang-LocalDev-54ff658e。
- 原始设计在 design/；后续变更见 docs/DESIGN-UPDATE.md、docs/PUBLIC-SUPPORT-PLAN.md。旧文档中的退款、公开角色切换和独立商家数据页描述已被当前规则覆盖。

## 验证

```bat
npm run typecheck
npm test
npm run build
npm run test:e2e
```

本轮品牌图鉴更新：56 项后端测试通过，类型检查、构建及 Google Chrome 回归通过；40 品类目录、定位顺序和来源边界见 docs/CATEGORY-POSITIONING.md。证据位于 artifacts/atlas/ 与 artifacts/catalogue-verification-v1.json。

本轮 Chrome 回归检查实际页面、总榜三甲、图鉴对比及游客后台隔离，并在独立浏览器上下文模拟慢网、关注、沙箱助力成功和错误重试，不向共享开发数据库新增订单。验证 375/390/430/768/1280 五种屏宽，截图与结果位于 artifacts/live-ranking/。门店补齐回归和五种屏宽截图另见 artifacts/partners/，新接口、模拟计费及所有权边界见 docs/PARTNER-MARKET.md。新增动态换位、到账特效、去重、三连暴击、霸榜计时及减少动态效果回归；动态实现见 docs/LIVE-RANKINGS.md；本轮新增品类治理验证见 docs/CATEGORY-GOVERNANCE.md，截图位于 artifacts/classification/。

历史 catalog-browser、analytics-browser 和 api-smoke 脚本依赖旧版登录/页面流程，本轮未作为当前端到端验证运行。当前验证范围见 docs/CONTINUATION-REPORT.md；旧报告保留作历史记录。

## Flutter

SDK 已安装到 .tools/flutter（第三方开发工具，不是本项目 Git 仓库）。
Flutter 项目在 apps/client_flutter，采用 Riverpod / go_router / Dio。
消费端支持跨品类总榜、奢品图鉴、搜索、资料、对比、分类榜与外链。首页同步突出前三名；内部Dart包名暂保留pinjie。
当前原生账号同步/商家管理未完成，不宣称与 Web 全量等价。

```bat
cd apps\client_flutter
..\..\.tools\flutter\bin\flutter.bat pub get
..\..\.tools\flutter\bin\flutter.bat analyze
..\..\.tools\flutter\bin\flutter.bat test
..\..\.tools\flutter\bin\flutter.bat build web --base-href /flutter/
```

API_BASE 可通过 --dart-define=API_BASE=http://127.0.0.1:3100/api/v1 指定。Android模拟器应使用10.0.2.2，真机需要可访问的API地址与安全网络配置。当前API只监听127.0.0.1。
Windows设备无法构建iOS/macOS；Android SDK与签名还未配置。
若从独立端口启动 Flutter Web，应配置受控代理到 /api/v1，默认不启用任意跨域访问。

## 数据库和配置

可通过 DATABASE_URL 环境变量连接外部 PostgreSQL。首次启动执行 apps/api/migrations/001_initial.sql。
infra/compose.yml 提供 PostgreSQL/Redis 开发配置，Docker在当前设备未安装，尚未验证。Redis尚未用于业务。
不提供真实密钥；配置说明见 config.example.txt。
PGlite 仅用于本地开发；生产使用独立 PostgreSQL 16，已验证备份及隔离恢复。

## 生产限制

生产展示版已部署，代码仓库为 https://github.com/unfalltable/toplux 。APP_ENV=production 关闭开发登录与沙箱；正式认证和支付适配器尚未实现，收款与公网后台保持关闭。
尚需完成短信、正式身份/权限管理、支付验签与对账、品牌榜版本回退/快照、S3、Redis工作队列、完整API契约与平台发行。演示内容不能作为真实品牌评价发布。

本轮用户新要求及总榜汇总规则见 docs/DESIGN-UPDATE.md；它覆盖初始设计包不设跨品类总榜的旧限制。

本轮将 40 品类整理为分组导航，品牌卡与图鉴使用已核验的官方 Logo 和作品图片，扩展二、三梯队并强化品牌符号、受众与身份表达。素材来源、覆盖率与缺口见 [品牌素材记录](docs/BRAND-MEDIA.md)。

网页采用深松绿、铂金白、古铜金；首页保留跨品类总榜、三甲和后续名次，未增加底部推荐区。视觉和统计方案见 docs/VISUAL-ANALYTICS-PLAN.md。
