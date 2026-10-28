# 技术架构与数据模型

## 1. 固定技术方案

| 部分 | 选择 | 理由 |
|---|---|---|
| 消费客户端 | Flutter stable + Dart | 用户指定跨平台，手机优先 |
| 商家中心 | 同一 Flutter 工程的独立 Web 入口/原生受控路由 | 共享模型和 UI，支付能力按环境区分 |
| 状态/导航/网络 | Riverpod、go_router、Dio | 控制业务状态、深链与类型化错误 |
| DTO | freezed + json_serializable（或经验证的等价生成方案） | 与 OpenAPI 字段一致 |
| 运营后台 | React + TypeScript + Vite + Ant Design | 内容和财务审核需要清晰表格与表单 |
| API/任务 | NestJS 模块化单体 | 初期减少微服务和运维成本 |
| 主库 | PostgreSQL + Prisma migrations | 资金事务、关系和唯一约束 |
| 缓存/任务 | Redis + BullMQ（非金额真相源） | 清缓存、通知、对账任务 |
| 文件 | S3 兼容对象存储 + CDN | Logo/图片私有上传与公开衍生图 |
| 本地 | Docker Compose | PostgreSQL/Redis/对象存储/API 一键启动 |
| API 契约 | OpenAPI 3.1 | 生成 Dart DTO/客户端并做契约测试 |

开发开始时记录 Flutter/Dart/Node/数据库具体版本并锁定 lockfile，不在规格里猜未来插件版本。
Flutter Web/桌面/移动使用相同领域模型，但每个系统插件必须证明平台支持。

## 2. 工程目录

```text
apps/
  client_flutter/
    lib/app/          # 路由、主题、能力、环境
    lib/core/         # 网络、错误、平台适配接口
    lib/features/    # discover/categories/brands/compare/merchant_board
                     # merchant_manage/payments/links/account
    lib/shared/      # 卡片、金额组件、空态、加载态
    test/
    integration_test/
  api/
    src/modules/     # auth/catalog/content/brand_board/merchants
                     # contributions/payments/refunds/outbound/admin/audit
    prisma/
    test/
  admin_web/
packages/
  api_contract/      # OpenAPI 与生成输入
infra/               # Compose、部署、备份和监控
docs/                # 本设计包
```

本任务只输出设计。开发 AI 应在用户提供的目标项目执行；不要在闲聊目录擅自创建应用仓库。
已有 Git 工程先检查工作区和远端，按用户约定拉取；不覆盖并行工作，不自动推送。

## 3. 数据实体与关键约束

全部主键使用 UUID；时间 timestamptz/UTC，展示为当地时间。人民币分使用 bigint，API 转安全整数。

| 表 | 核心字段与约束 |
|---|---|
| users | id、登录标识、状态、createdAt；标识加密/脱敏；注销保留必要财务关系 |
| sessions | userId、refreshTokenHash、expiresAt、revokedAt；不存明文刷新令牌 |
| categories | id、slug UNIQUE、name、sortOrder、active；**无 parentId** |
| brands | id、中文/英文名、aliases、origin、imageAssetId |
| brand_profiles | id、brandId、categoryId、publishedVersionId；UNIQUE(brandId,categoryId) |
| profile_versions | profileId、version、structuredContent、state、editorId、reviewerId、publishedAt；发布后不可改 |
| sources | url、title、publisher、capturedAt、claimType、market、rightsNote |
| profile_sources | versionId、sourceId、supportedClaim；资料与具体结论绑定 |
| series | brandId、categoryId、name、summary、sources；不是子品类 |
| brand_board_versions | categoryId、version、state、reason、publishedAt、reviewerId |
| brand_board_entries | boardVersionId、profileVersionId、rank、reason；榜内 rank 与 profile 各唯一 |
| assets | ownerId、用途、对象路径、MIME、size、hash、reviewState、rightsNote；URL 不任意外链输入 |
| merchants | id、ownerUserId、displayName、normalizedName、logoAssetId、publishedVersionId、state；无经营资料必填 |
| merchant_members | merchantId、userId、role；UNIQUE(merchantId,userId)，初始 OWNER |
| merchant_versions | merchantId、version、displayName、logoAssetId、optionalContent、reviewState、reason |
| merchant_categories | id、merchantId、categoryId、state；UNIQUE(merchantId,categoryId) |
| merchant_links | id、merchantId、categoryId、type、platform、httpsUrl、title、state、primary、expiresAt；全部可不创建 |
| live_claims | linkId、status、scheduledAt、claimedAt、expiresAt；有效期服务端限制 |
| contribution_orders | id、merchantCategoryId、actorId、amountFen、currency、channel、state、expiresAt、termsVersion、acceptedReceiptId |
| payment_receipts | id、orderId、provider、transactionId、amountFen、currency、paidAt、accepted、rawDigest；UNIQUE(provider,transactionId) |
| refunds | id、receiptId、amountFen、state、providerRefundId、reason、reviewerId；providerRefundId 唯一 |
| rank_ledger | id、merchantCategoryId、orderId、refundId、kind、deltaFen、committedAt、auditRef |
| rank_balances | merchantCategoryId PK、grossFen、refundedFen、netFen、attainedAt、revision；可由流水重建 |
| board_snapshots | categoryId、version、generatedAt、entries、expiresAt；快照不可变，支持稳定翻页 |
| idempotency_keys | actorId、operation、key、bodyHash、responseRef、expiresAt；联合唯一 |
| favorites | userId、targetType、targetId、categoryId；唯一约束，重复收藏不新增 |
| outbound_events | eventId UNIQUE、linkId、clientType、eventType、anonymousSessionHash、occurredAt |
| feedback | submitterId?、target、reason、state、resolution；避免收集不必要个人资料 |
| outbox | eventType、aggregateId、payload、publishedAt；与主业务事务同提交 |
| audit_logs | actor、action、target、beforeDigest、afterDigest、reason、at；敏感数据脱敏 |
| invoices | orderIds、抬头加密、state；仅申请发票时要求抬头信息 |
| notifications | userId、type、target、readAt；首版站内消息即可 |

推广条目字段必填：displayName、logoAssetId；打榜订单字段必填：上下文 merchant/category、amountFen。
法律主体、联系人、店铺、直播等不能在数据库 NOT NULL 或 DTO required 中变相变成必填。
可选链接在独立表，无数据即无入口；品牌库关联 brandId 可空。

### 资金数据库规则

- CREDIT：deltaFen > 0、orderId 必有、refundId 为空；每 order 只允许一条 CREDIT。
- REFUND：deltaFen < 0、refundId 必有，关联原订单；每成功 refund 只允许一条 REFUND。
- 用部分唯一索引分别约束 orderId 的 CREDIT 和 refundId 的 REFUND。
- receipts 允许记录异常重复扣款；同 order 最多一个 accepted=true 的收款。
- ledger、receipt、refund 必须归属于相同 merchantCategory；服务端事务核对关联链，不信任请求里的 ownerId。
- rank_balances 上 CHECK(grossFen>=0 AND refundedFen>=0 AND refundedFen<=grossFen AND netFen=grossFen-refundedFen)。
- 更新资金先锁同一订单/余额行，统一锁顺序避免死锁；序列化失败做有限幂等重试。
- 余额表不能接受任意外部 PATCH；后台没有“手改名次”“手改累计金额”接口。
- 应用常规数据库角色对 rank_ledger 不具备 UPDATE/DELETE；纠正追加审计流水并重新计算。
- 索引：merchant_categories(categoryId,state)、rank_balances(netFen DESC,attainedAt,merchantCategoryId)、orders(actorId,createdAt)、events(linkId,occurredAt)。

schema 与 Prisma 迁移必须实现这些约束，不能只在文字里声明。

## 4. API 约定

详细路径和必填字段以 contracts/openapi.json 为准。
base /api/v1；JSON camelCase；UTC ISO8601；ID 为 UUID；资金为整数分。
错误体：code、message、requestId、fieldErrors?、retryable。
公共读允许匿名；私有写要求认证与资源权限；后台独立 RBAC。上传和登录受限流保护。

列表返回 items、nextCursor、updatedAt；资金榜附 snapshotId、boardVersion。pageSize 默认 20、最大 50。
写接口需要 Idempotency-Key 的范围见契约。回调不使用用户 JWT，而采用渠道签名。
客户端不能提交 netFen、rank、verified、role、paymentSuccess；服务端拒绝额外敏感字段。

认证：
- 原生：短时 access token + 轮转 refresh token，刷新令牌在系统安全存储。
- Web：HttpOnly/Secure/SameSite cookie 会话，写操作 CSRF 防护；跨域白名单。
- 后台：独立会话、敏感动作二次认证；编辑/审核/财务权限拆分。
- 开发登录与假支付仅 local/test 环境；生产启动检测禁止开启。

## 5. 事件与一致性

PaymentAccepted → ledger/balance/outbox 同事务 → cache invalidation → 站内结果更新。
RefundSucceeded → 负流水/balance/outbox 同事务 → 新榜面版本。
MerchantContentApproved → 原稿替换为新 publishedVersion。
LinkRejected → 只隐藏对应链接，基础推广条目保持已通过状态。
MerchantHidden → 榜面资格隐藏；资金保留。
所有异步消费者 eventId 去重；任务失败进入重试和死信可见队列。

首版单体内事务处理资金，禁止拆成“先加钱再写账”的两个独立 HTTP 调用。
搜索使用 PostgreSQL 名称、别名、拼音和 trigram；规模需要时再接独立搜索，不先搭大搜索集群。

## 6. 配置与外部适配

必须提供接口：PaymentProvider、RefundProvider、SmsProvider、AssetStore、ExternalLinkResolver、NotificationProvider。
配置项仅写变量名与说明：DATABASE_URL、REDIS_URL、S3_ENDPOINT、S3_BUCKET、PAYMENT_PROVIDER、PAYMENT_ENABLED、APP_ENV 等。
密钥通过运行环境注入，不放移动端、不提交仓库、不输出日志、不要求用户在聊天中粘贴。

Capability API 返回环境可用功能，例如 canManageMerchant、canPurchasePromotion、paymentChannels、supportedLinkActions。
发行目标与地区由服务端签发配置和可信发行包共同判定，不能只靠客户端传一个 platform=web 就越权购买。
Web 商家中心使用专门会话/来源与配置；不能把 iOS 内嵌页识别为独立 Web 绕过规则。
参数只调整能力，不改变资金榜算法。

## 7. 文件、隐私与运营

Logo 上传：PNG/JPEG/WebP，<=5MB；服务端检测真实类型、去 EXIF、重编码为安全衍生图；比例 1:1；禁止用户 SVG 执行内容。
对象存储使用短时上传凭据；用户只能确认自己上传的对象。
不要求广告商提供经营资料才能上榜；平台自身收款开户和发行主体材料仍需在上线时准备。
可选联系方式默认不公开，明确用户选择后才展示；证件私有、加密、授权访问、限定保留期。
日志默认只含 requestId、内部ID和脱敏信息；用户注销不删除应依法保留的支付审计，但解除公开个人信息。
数据保留建议值是实施默认，正式发布前按主体和法域确定：业务事件明细 90 天，聚合 1 年；财务按适用要求保存。

## 8. 部署、可观测与故障恢复

开发 Compose：API、worker、PostgreSQL、Redis、MinIO；管理端与 Flutter 按启动文档运行。
生产：HTTPS、API/worker 独立进程、托管 PostgreSQL、持久 Redis、对象存储/CDN；单区域起步。
不得把此任务附带的历史服务器信息当成本次部署授权；本任务没有部署要求。

监控：错误率、P95、支付确认延迟、入账延迟、对账差异、回调验签失败、任务积压、链接失败率。
目标：内容缓存 API P95<500ms；资金服务可用性目标 99.9%；支付成功到榜面更新通常 <=5s，异常有可见状态。
每日加密备份、定期恢复演练；资金表具备时间点恢复能力。上述是验收目标，不是当前已达到的实测结果。
故障时优先停止新付款并保留阅读服务；确认渠道支付真相，修复账本后重建缓存，禁止清库解决金额异常。
