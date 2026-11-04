# 官方频道：公告、订阅与反馈

> 状态：现状已核对；管理员网站与自动邮件为已选方向、尚未实施。更新时间：2026-11-04。
> 本文描述跨 Web / PWA、Windows 和 Android 的通用功能，不属于 iOS 专项。

## 目标与边界

星芒记录者保持本地优先、无账号。官方频道只处理公开公告、用户主动登记的邮箱和用户主动提交的反馈；
不得自动上传日记、健康、收支、助手对话或 API Key。

## 当前实现

- 客户端统一经 `src/platform/channel.ts` 访问频道 API。Web / PWA 和 Android 直接请求 Worker；Windows 桌面壳经 Electron 主进程的 `channel:request` 代取，以避开 `file://` 的 CORS 限制。
- `worker/push/src/channel.js` 使用 `PUSH_KV` 保存公告、邮箱订阅和反馈；`worker/push/src/index.js` 暴露公开读写接口及受 `ADMIN_TOKEN` 保护的管理接口。
- 普通 / 紧急公告由应用内公告页和横幅展示。管理脚本可发布公告，紧急公告用 `--urgent`。
- 订阅接口目前只是把邮箱写入 KV；没有确认邮件，也没有邮件发送服务。`subscribers` 命令只导出地址。
- 官网变更说明目前写着订阅后会收到重要公告邮件；这项承诺超过了当前实现。邮件接通前应更正文案，避免继续暗示自动发信已经可用。
- 邮箱键名使用哈希，但 KV 记录值仍保存邮箱明文；这不是加密。邮件发送前应在订阅说明中写明 Cloudflare 和邮件服务商会处理地址。
- 反馈正文会保存到 KV；维护者可用管理脚本查看，但目前没有提醒、处理状态和回复流程。
- `GET /subscription?email=...` 会公开回答地址是否订阅；退订接口只凭邮箱即可操作。这两项应在增加邮件确认流程时改成令牌验证。
- 公告获取失败目前会被客户端当作空列表，页面可能把服务故障显示成“暂无公告”。应把空结果、配置缺失和请求失败分开呈现。
- `channelConfigured()` 已定义但没有调用处；端点未配置时，公告、订阅和反馈入口仍可能显示，应明确呈现“服务未配置”状态。

## 当前人工操作

在仓库根目录执行以下命令。管理令牌从 `.local/keys/admin-token.txt` 读取，服务端另需设置 `ADMIN_TOKEN`；
不要把管理令牌放进客户端或网页构建变量。

```bash
# 发布到应用内公告页；紧急公告另加 --urgent
node worker/push/channel-admin.mjs notice --title "标题" --body "正文"

# 导出订阅邮箱；这条命令不会发邮件
node worker/push/channel-admin.mjs subscribers

# 查看已提交的反馈
node worker/push/channel-admin.mjs feedback
```

若临时用外部邮件客户端发送导出的地址，必须用密送，避免收件人相互看到邮箱。该方式没有逐人退订、退信状态或自动重试，不能替代正式邮件订阅功能。

## 推荐实现方案

### 组件选择

| 层 | 首版技术 | 职责 |
| --- | --- | --- |
| 客户端 API | 现有 `channel.ts` + Worker JSON API | 页面只依赖项目自己的请求 / 响应格式，不调用邮件商 SDK |
| 后端 | 现有 Cloudflare Worker `starburst-push` | 处理公告、订阅、反馈和维护者管理请求 |
| 数据 | 现有 `PUSH_KV` | 首版继续保存公告、订阅和反馈；数据模型不采用邮件商专属格式 |
| 异步任务 | Cloudflare Queues | 每位收件人一条发信任务，承接批量发送、重试和失败记录 |
| 邮件服务 | Resend Email API | Worker 服务端调用；`RESEND_API_KEY` 只存 Worker Secret |
| 管理网站 | `site/admin/`，随官网 GitHub Pages 发布 | 管理员名称 / 密码登录；管理操作仍由 Worker API 执行 |
| 管理工具 | 保留 `worker/push/channel-admin.mjs` | 管理网站之外的应急命令行入口；现有 `ADMIN_TOKEN` 不放到浏览器 |

### 管理员网站与登录

- 管理员入口放在现有官网的 `site/admin/`，独立于记录者 PWA；静态网页公开可访问，所有实际管理 API 仍由 Worker 鉴权。
- 登录页接收管理员名称与密码，通过 HTTPS 发送给 Worker。Worker 按专用账号配置验证密码哈希，成功后签发短期 HMAC 会话令牌。浏览器令牌只保存在页面内存，不写入 `localStorage`、Cookie 或 URL；刷新页面需要重新登录。
- Worker 仅保存 `ADMIN_USERNAME`、`ADMIN_PASSWORD_HASH`、`ADMIN_SESSION_SECRET` 等 Secret。登录接口需要限流；管理 API 仅接受官网允许的 Origin 和有效会话。`ADMIN_TOKEN` 保留给原有 CLI，两个凭据不互相替代。
- 管理页提供一份消息编辑器，发送目标可选：**只发应用内公告、只发邮件、公告和邮件都发**。紧急级别只影响应用内公告提醒；邮件主题可默认取公告标题，也允许单独编辑。
- “只发邮件”不创建应用内公告；“公告和邮件都发”使用同一份正文，应用内公告保存成功后再投递邮件任务。页面必须区分“公告已发布”“邮件已排队”“邮件失败”，不能把部分成功显示成整体成功。
- 邮件未配置时，管理网站要明确提示缺少发件域名 / `RESEND_API_KEY`，禁用发送按钮；公告发布仍可单独使用。

Resend 作为首选邮件适配器，主要是它提供 HTTP API、幂等发送和投递记录；Worker 可用 `fetch` 调用，前端不需要知道邮件商。它免费方案当前列出的上限为每月 3,000 封、每天 100 封，适合小规模先行验证；正式发信仍需验证发件域名。[Resend 邮件 API](https://resend.com/features/email-api) [定价](https://resend.com/pricing) [幂等键](https://resend.com/blog/engineering-idempotency-keys)

Cloudflare Email Service 可作为另一种 `EmailSender` 实现；截至 2026-11-04，它仍是公开 Beta，向任意收件人发信需要 Workers Paid 方案和由 Cloudflare DNS 管理的发件域名。[Cloudflare Email Service 计划与价格](https://developers.cloudflare.com/email-service/platform/pricing/)

### 发送流程

1. 用户提交邮箱后，Worker 把地址存为待确认状态，生成限时、一次性的确认令牌并发送确认邮件；确认后才加入有效订阅名单。
2. 维护者用现有 `notice` 命令发布公告。增加显式的 `--email` 选项，由操作者决定是否向订阅者发送；公告级别（普通 / 紧急）和是否发邮件是两个独立设置。
3. Worker 保存公告后，为每位有效订阅者写入一条队列任务。任务携带公告 ID 与订阅 ID，消费者调用 `EmailSender` 发单人邮件，并记录邮件商返回的 ID 和状态。
4. 队列重试时使用稳定幂等键，避免重复邮件。Cloudflare Queues 是至少一次投递，所以应用仍需去重。[Queues 投递保证](https://developers.cloudflare.com/queues/reference/delivery-guarantees/)
5. 邮件附项目生成的一次性退订链接；单封邮件同时带可见退订入口和 `List-Unsubscribe` / `List-Unsubscribe-Post` 邮件头。
6. 反馈继续写入 Worker。可用同一邮件服务通知维护者，但通知邮件只含反馈编号；维护者通过受 `ADMIN_TOKEN` 保护的接口读取正文。联系方式选填，不自动附加用户记录。

### 可移植的代码边界

业务逻辑只依赖 `NoticeStore`、`SubscriptionStore`、`FeedbackStore`、`EmailSender` 和 `JobQueue` 这些小接口。
首版实现分别连接 Cloudflare KV、Resend 和 Cloudflare Queues。未来可替换为 D1 / PostgreSQL、SQS 或其他邮件服务，
而客户端 JSON API 和业务数据结构保持不变。不要把完整邮件服务商产品或通知平台模型泄漏到客户端。

Novu 可参考其统一通知工作流和多邮件商适配方式；若以后需要多渠道偏好、可视化流程和应用内通知中心，再评估是否引入整套服务。[Novu](https://github.com/novuhq/novu)

listmonk 可参考其订阅者确认和邮件活动管理；它需要独立部署和 PostgreSQL，适合将来确实需要自托管可视化邮件后台时评估。[listmonk](https://github.com/knadh/listmonk)

## 实施顺序

1. 在 `site/admin/` 搭管理员登录和管理网站；先接通只发布应用内公告的流程，保留 CLI 应急操作。
2. 确认可配置 DNS 的发件域名；仓库目前只记录 `pages.dev` / `workers.dev`，尚未记录自有发件域名。
3. 接入邮件商、待确认订阅、逐人退订和幂等发送，再实现“邮件”与“公告 + 邮件”两种发送目标；更新隐私说明。
4. 给反馈增加维护者提醒、处理状态和可选联系方式；公开接口加防滥用限制。

接口部署保持向后兼容：先部署 Worker，再发布 Web/PWA 与桌面 / Android 客户端。邮件验证先用维护者自己的测试地址，确认退订和重试行为后再开放给订阅者。
