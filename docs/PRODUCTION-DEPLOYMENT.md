# 独立生产部署

入口：http://149.88.67.92:8080

部署目标为 Ubuntu 24.04 主机；现有 OfferFlow 使用 Caddy 的 80/443。本项目新增独立 Nginx 8080，没有调整旧网关、域名、容器、数据库或服务。

## 隔离与运行

- 目录：/opt/shebang-prod；当前源码链接 current；当前发布目录见末尾更新记录。
- Compose 项目：shebang-prod。应用 Node.js 24、Nginx 1.28、PostgreSQL 16。
- PostgreSQL 独立卷 shebang_prod_postgres；数据库和应用仅在独立内部网络通信，不映射到公网。
- 应用以非 root 用户、只读根文件系统运行，三个容器均设内存与 CPU 上限、日志轮转及自动重启。
- 数据库使用独立受限角色；数据库连接凭据在服务器生成，仅保存在本项目私有目录并挂载给所需服务，没有写入源码和输出到报告。
- 健康检查执行实际数据库查询。公开后台、开发登录、沙箱付款和 Flutter 演示页均关闭。

## 初始数据

从独立空数据库开始，只导入 40 品类、131 份真实品牌图鉴，对应 120 个品牌身份。未上传本机 .data、演示品牌、演示账号、订单、资金流水、流量或关注记录。

图鉴定位为有来源的编辑观点，不代表品牌官方授权或付费推广实力；官网受限的资料继续标注待复核。累计助力榜只计实际到账，因此尚无上榜品牌；不会用编辑定位冒充已支付排名。

真实支付适配器尚未接入，正式环境的下单入口返回 503，付款沙箱返回 404；前台展示“助力收款尚未开放”。没有可操作的模拟付款流程。

## 备份与运维

每日 03:15（服务器时间）运行本项目的 pg_dump 压缩备份，保存到 /opt/shebang-prod/backups，保留 14 天。计划任务：/etc/cron.d/shebang-prod-backup。

只操作本项目的查看命令：

~~~sh
docker compose -f /opt/shebang-prod/current/infra/production/compose.yml ps
docker compose -f /opt/shebang-prod/current/infra/production/compose.yml logs --tail=80 api
/opt/shebang-prod/current/infra/production/backup.sh
~~~

## 待域名接入

当前地址使用 HTTP，仅公开品牌浏览与匿名交互；管理员认证和收款保持关闭。购买域名后，给新域名配置 HTTPS 和转发，再更新本项目 PUBLIC_ORIGIN；HTTPS 下自动启用 Secure Cookie。后续管理登录与真实支付需另行接入，不能将当前部署描述为这些能力已完成。

## 实际验证（2026-10-28）

- 三个新容器均 healthy；公网 /api/v1/health 返回 production，Nginx 配置检查通过。
- 正式库核对：40 品类、131 份真实资料、120 品牌；演示资料、用户、订单、回执、资金流水、统计事件、关注、已打款品牌及金额均为 0。浏览器验证后再次核对仍为 0。
- 53 项后端测试、类型检查、Web 构建和 Linux 服务端编译通过；本地四套 Chrome 回归通过。首次本地回归出现品类请求等待超时，检查接口正常后重试完整通过。
- 公网 Google Chrome 验证首页空榜、图鉴读取与刷新、支付关闭、后台关闭、HTTP 随机编号兼容和访客 Cookie 持续性；375/390/430/768/1280 五种屏宽无横向溢出，无页面脚本错误。验证期间拦截统计上报，没有制造流量、关注或助力订单，浏览器已关闭。
- 已生成首份 600 权限备份，并恢复到本项目的独立临时验证库：131 份真实资料、0 订单、0 演示资料。恢复成功后删除该临时验证库，正式库未修改。
- 原 OfferFlow 全部 7 个容器的 ID 与启动时间与部署前完全一致，原域名 HTTPS 返回 200。未修改或重启原网关与原应用。
- 修复了生产容器内监听回环地址导致的跨容器连接失败；最终应用监听内部网络地址，仅公开 Nginx 的 8080，应用和数据库端口未映射到宿主公网。

证据：artifacts/production/deployment-result.json、browser-result.json、server-before-deployment.json 与 server-after-deployment.json。前两项在 artifacts/production，后两项在 artifacts 根目录。

最终源码包 SHA256：3d4240dd799293f2b64364cc6d14501a08625ac3fdf7590be165a613449b56b7。当前应用发布目录为 releases/20261028-3d4240dd7992；首发目录仍保留供原有本项目数据库初始化脚本与 Nginx 配置挂载使用。

## 图鉴与官方素材更新（2026-10-28）

当前发布目录：releases/20261028-1ff22241b7b9。
源码包 SHA256：1ff22241b7b91d9d0077c94706a583258ad4dc6b105c4b14036b04fa7530aeca。
代码仓库：https://github.com/unfalltable/toplux（main，首次导入现有项目；没有重新初始化项目仓库）。

- 图鉴扩展为 40 品类、180 份资料、164 个品牌身份，涵盖多个定位梯队；40 品类改为分组导航，详情强化官方作品、品牌符号、受众与身份表达。
- 已保存 144 个官方 Logo；360 项作品中 124 项有已核验官方图片，剩余 20 个 Logo 和 236 项作品图片待补。实际发布 303 个引用素材，完整缺口与来源见 BRAND-MEDIA.md。没有用其他型号、社交图标或生成图补缺。
- 发布前后各完成本项目备份，保留旧发布与镜像回退标签。只重建 shebang-prod-api-1；本项目 Nginx 与 PostgreSQL 容器 ID 均保持不变。
- 正式库 180 份真实图鉴、0 演示图鉴、0 用户、0 订单、0 回执、0 流水、0 助力金额。已有访问统计保留；未导入本地 .data、演示账户或模拟金额。收款、公网后台及门店模块继续关闭。
- 56 项测试、类型检查、Web 构建、服务端编译和本地四套 Chrome 回归通过。公网 Chrome 验证通过，303 个静态素材均返回正确图片；Falcon 的 Talon/Tiki 作品图正常，40 品类目录和五种屏宽无横向溢出。验证上下文拦截统计上报，没有创建助力、关注或推广订单，验证浏览器已关闭。
- 原 OfferFlow 7 个容器 ID、启动时间与更新前及首次部署前一致，offerflow.best HTTPS 返回 200。

本次证据：artifacts/recovery-release-validation.log、artifacts/production/visual-release-check.log、media-result.json、browser-result.json、visual-deployment-state.txt、visual-original-after.json、visual-release-state.txt。
