> 首次品类设置与品牌纠错接口以 [CATEGORY-GOVERNANCE.md](CATEGORY-GOVERNANCE.md) 为准：后续助力省略 categoryId，平台统一审核归属。

> 动态榜单接口增量见 [LIVE-RANKINGS.md](LIVE-RANKINGS.md)。当前公开角色切换与退款已关闭，后台改为独立 /admin，品牌指标位于卡片；下文对应的旧流程已由 PUBLIC-SUPPORT-PLAN.md 覆盖。


# 奢榜本地实现 API
Base: /api/v1。除 /links/:id/go 返回302外，响应均为 JSON；资金字段 snake_case 的分值来自数据库，订单创建请求使用 amountFen 安全整数。
这是当前精简实现契约，原始 contracts/openapi.json 是后续完整契约目标。

公开 GET：
- /health、/capabilities、/categories
- /categories/:id/brands、/categories/:id/merchant-board
- /brands/:id、/search?q=、/compare?ids=（同品类最多3项）
- /merchants/:id、/links/:id/resolve
- /me（无会话返回 null）

开发登录：POST /auth/local {name: user|editor|reviewer|finance|admin}。响应含 csrf；会话保存在 HttpOnly/SameSite=Strict cookie。后续写请求必须附 X-CSRF-Token。
生产环境不提供此开发登录，正式认证尚未接入。

用户写：
- POST /assets {data: "data:image/png;base64,..."}：PNG/JPEG/WebP≤5MB，重编码256方图、删除元数据。
- POST /merchants {displayName,logoAssetId}；PATCH /merchants/:id {description}
- POST /contributions/orders {merchantId,categoryId,amountFen}，要求 Idempotency-Key。
- POST /sandbox/orders/:id/pay {}：只在 local 模式；服务端模拟渠道入账，不是生产回调。
- POST /sandbox/orders/:id/refund {amountFen}，要求 Idempotency-Key。
- GET /me/orders、/me/merchants、/me/favorites
- POST /me/favorites {profileId}；DELETE /me/favorites/:id
- POST /merchants/:id/links {type:WEBSITE|STORE|LIVE|VIDEO,platform,url}，新链接待审核
- POST /feedback {target?,reason}，匿名可用
- POST /outbound-events 已停用，拒绝旧客户端直接上报点击；请使用服务端跳转入口。

运营：
- GET /admin/overview：EDITOR/REVIEWER/FINANCE
- POST /admin/profiles：EDITOR，字段 categoryId/name/english/tier/summary/recognition/occasion/source
- POST /admin/profiles/:id/decision {approved,reason}：REVIEWER，拒绝自审
- POST /admin/links/:id/decision {approved,reason}：REVIEWER
- POST /admin/merchants/:id/visibility {visible,reason}：REVIEWER，不改资金
- POST /admin/feedback/:id/resolve {resolution}：REVIEWER

本地商家名称/Logo自动通过仅用于沙箱。无真实支付适配器、短信、正式商家审核体系、回调验签或渠道对账，不具备生产上线条件。

## 当前补充接口
- GET /merchant-board：全站累计总榜，同一商家跨品类汇总，只出现一次；category_names说明实际参与品类。
- GET /merchants/:id：补充 entries 各品类金额，详情中区分全站和分类榜。
- GET /admin/categories：全部品类（含停用）；EDITOR/REVIEWER/ADMIN。
- POST /admin/categories，PATCH /admin/categories/:id：name、slug、sortOrder、active；EDITOR/ADMIN。只支持一级品类。
- POST /admin/profiles/:id/revisions：创建修订稿，字段与新建品牌相同，原公开版本不变。
- POST /admin/revisions/:id/decision：approved、reason；REVIEWER/ADMIN，禁止自审和过期版本覆盖。
- POST /admin/profiles/:id/archive：reason；REVIEWER/ADMIN，下线资料保留历史。
- 本地新增 admin 演示账号，后台入口 /#admin。正式登录方式仍待接入。

## 浏览与引流统计
- POST /analytics/events {merchantId, kind:IMPRESSION|VIEW, eventKey:UUID, source:total|category|detail|direct}：匿名可用，已登录时仍校验CSRF。仅允许可展示商家；事件键幂等，同一访客每分钟最多120条，登录商家本人访问不计。
- GET /links/:id/go?eventKey=UUID：校验商家及链接审核状态，记录官网/店铺/直播/视频点击后302跳转。跳转不缓存；拒绝非HTTPS、IP、私有域名与不允许的直播平台。eventKey可省略，由服务器生成。
- GET /me/analytics?days=7|30|90&merchantId=：仅返回自己的推广品牌，指定非自有品牌403。
- GET /admin/analytics?days=7|30|90&merchantId=：仅ADMIN可用，全平台汇总。
- 返回 summary（曝光次数/曝光访客、详情PV/UV、外链点击/点击访客、website/store/live/video分类），series（UTC逐日补零）、channels（包括待审渠道的0点击）、brands、merchants、from、updatedAt。
- /me 初始化匿名第一方 HttpOnly Cookie sb_visitor；数据库只保存其SHA256摘要，不采集IP。UV以浏览器标识计算，跨设备及清除Cookie会重复。统计不代表站外观看、交易与成交；接入前历史不回填。
