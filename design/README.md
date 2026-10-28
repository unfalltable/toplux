# 品阶：跨平台品牌地位与商家榜项目设计包

版本：1.0｜日期：2026-10-27｜状态：开发规格，尚未开发应用。

## 已确认的产品边界

1. Flutter 跨平台，手机体验优先；Android、iOS、Web 为首发交付目标，桌面端复用并单独验收。
2. 覆盖各类商品，品类只设一层。使用“耳机、电脑、手表”等大品类，不设置“蓝牙耳机、笔记本电脑”等子品类。
3. 内容围绕品牌地位、身份表达、大众辨识、圈层认可与消费心理展开。内部理解其核心是虚荣心和社交认同；公开文案保持体面。
4. 品牌排行与商家付费榜分开。每个大品类只有一个商家累计总榜，不做月榜、周榜或周期清零，也不设跨品类混排总榜。
5. 商家打榜只需品牌名、Logo、金额三项；品类由当前页面带入。店铺、直播、介绍等全部选填，不填也可上榜。
6. 本包用于交给 AI 直接开发；不代表已经完成支付开通、内容审核、外部平台接入或应用商店审核。

## 阅读与执行顺序

直接阅读 [完整项目设计方案](PROJECT-DESIGN.md)；交给开发 AI 时同时提供 contracts/，再复制 [AI 开发启动指令](06-ai-development-prompt.md)。

验证范围与实际结果见 [校验报告](TEST_REPORT.md)。

| 文件 | 用途 |
|---|---|
| [01-product-prd.md](01-product-prd.md) | 产品定位、功能范围、角色、内容和商业模式 |
| [02-flutter-ux.md](02-flutter-ux.md) | 页面、交互、视觉、路由和多端差异 |
| [03-ranking-payment-links.md](03-ranking-payment-links.md) | 累计打榜、支付、退款、店铺和直播跳转的唯一业务规则 |
| [04-architecture-data.md](04-architecture-data.md) | 技术架构、数据模型、权限、运维 |
| [05-delivery-acceptance.md](05-delivery-acceptance.md) | 开发任务顺序、测试、上线门槛与运营指标 |
| [06-ai-development-prompt.md](06-ai-development-prompt.md) | 可复制给开发 AI 的完整启动指令 |
| [contracts/openapi.json](contracts/openapi.json) | 首版 API 契约，OpenAPI 3.1 |
| [contracts/categories.json](contracts/categories.json) | 一层大品类种子，24 个首发品类 |
| [contracts/ranking-cases.json](contracts/ranking-cases.json) | 累计榜、并列、退款、跨品类测试向量 |
| [verify-design.cjs](verify-design.cjs) | 文档链接、契约引用、分类和测试向量校验 |

文档冲突优先级：用户后续明确要求 > 03 中的资金与排名规则 > API 契约 > 数据设计 > 其他说明。
API 契约与业务规则有冲突时，先修订契约再生成客户端，禁止静默采用另一套算法。

## 默认实施决策

- 产品工作名“品阶”，英文工程名 Pinjie；商标、域名和商店名称尚未核查。
- 面向中文和人民币业务，初始榜单语境为中国大陆消费认知；资料必须注明市场与更新时间。
- 品类全局一层、后台可新增；不按技术规格或商品形态拆榜。
- 商家收款首发在独立 Web 商家中心完成；原生 App 内是否开放购买由渠道能力控制。不是把支付按钮换成外链来规避商店规则。
- 后端 NestJS + PostgreSQL；Flutter 消费端和商家中心共享 Dart 模块；运营后台 React。
- 首版不自建直播推流、不代管商品交易；负责介绍和导流。
- 全部界面可在开发演示环境运行，真实收款、短信、审核与平台 SDK 通过适配器接入。演示数据有明显标记。

## 参考与依据

此前已查看的同类公开页面：
- [买购全品类奢侈品牌目录](https://www.maigoo.com/top/396784.html)
- [品牌网](https://www.chinapp.com/)
- [腕表之家](https://www.xbiao.com/)
- [OBPAI 品牌分档](https://obpai.com/blog/luxury-brands-tier-list)
- [ToolCup 累计金额规则](https://toolcup.lol/rules)：公开累计付款、分类榜与外链点击。
这些是机制与界面参考，不是可直接复制的内容或已验证盈利证据。

已在本轮核对 [Apple App Review Guidelines 3.1.3(g)](https://developer.apple.com/app-store/review/guidelines/)：
同一 App 中消费的广告曝光购买涉及 IAP；广告管理 App 的例外有适用条件。本项目不自动视为符合例外。
规则会变化，发行前按地区、渠道和最新规则重新确认。

UI 使用用户库的 UI/UX Pro Max 技能；目录式导航和奢侈品配色检索已执行。最终采用轻量编辑排版，不照搬检索中偏 Apple 的玻璃材质效果。
