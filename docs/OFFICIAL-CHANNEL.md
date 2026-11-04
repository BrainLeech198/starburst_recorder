# 官方频道：公告、订阅与反馈

> 状态：管理员网站、Worker 与 Pages 频道转发入口已部署。0.15.0 正式版已发布，Android / Windows 客户端已包含新的 Pages 频道地址。Resend 尚未配置，邮件发送未启用，也没有发出真实邮件。启用双重确认前仍需更新 App 订阅页，使其能区分登记与确认邮件状态。更新时间：2026-11-04。
> 这是跨 Web / PWA、Windows 和 Android 的通用频道，不属于 iOS 专项。

## 目标与边界

通过项目自己的 Worker API，为所有平台提供公开公告、用户主动订阅的公告邮件，以及用户主动提交的反馈。频道不读取或上传日记、健康、收支、AI 对话、模型配置或 API Key。

邮箱是用户信息：订阅记录在 Cloudflare KV 中包含邮箱明文；确认和公告邮件由 Resend 处理。当前 App 文案仍声称邮箱“不会给第三方”，与 Resend 处理邮件的事实不一致。上线邮件前必须更正订阅页面与隐私说明，说明 Cloudflare 和 Resend 会处理该地址。只有完成邮件确认的地址才会收到群发邮件。旧版记录若没有 `confirmedAt`，视为用户之前已明确订阅，继续保留。

## 当前实现

- 官网管理员入口：`https://brainleech198.github.io/starburst_recorder/admin/`。官网页脚提供入口；管理员先输入名称和密码，再进入工作台。
- 管理员登录由 Worker 校验 PBKDF2-SHA256 密码哈希，签发 30 分钟 HMAC 会话。令牌只保存在当前页面内存，刷新或关闭页面后重新登录。网页登录与 CLI 的 `ADMIN_TOKEN` 分开。
- 工作台支持三种发送方式：只发应用内公告、只发邮件、同时发布公告和邮件。紧急级别只影响应用内公告。邮件主题默认使用标题，也可单独编辑；邮件选项仅在 Resend、发件地址、退订签名密钥和队列绑定均已配置时开放。
- “公告 + 邮件”先保存应用内公告，再将邮件任务写入 Cloudflare Queues。若队列只接受了部分任务，接口返回部分成功状态并报告已排队与失败数量；管理页面不会把部分成功显示为全部成功。
- 管理员工作台显示完整公告历史。可按原 ID 编辑标题、正文和级别，保留原发布时间；删除后公告从公开列表移除。编辑不会再次发送邮件，删除也无法撤回已送达的邮件。
- App 启动时读取公开公告，并弹出一条尚未查看的公告；紧急公告优先。普通公告确认后记为已读，紧急公告沿用本机最多提醒五次的规则。全部公告仍可在“我的 → 公告”查看。
- 公告读取成功但列表为空时，公告页显示明确空态；接口或网络失败时显示错误与重试入口，不把失败当作空列表。网页 GET 不附带 JSON `Content-Type`，避免触发无必要的跨域预检。
- App 公告、订阅与反馈通过 `https://starburst-recorder.pages.dev/channel/` 进入 Pages Function，再用 Cloudflare Service Binding 调用 `starburst-push` Worker；仅开放五个公开频道路由，不接受任意代理目标。`VITE_CHANNEL_API` 可供自托管覆盖；Web Push 仍单独使用 `VITE_PUSH_API`。
- 新订阅进入待确认状态，队列发送确认邮件。确认链接的 GET 只显示确认页，用户提交确认表单后才生效；七天未确认的记录会失效。退订邮件链接也采用 GET 展示、POST 执行，避免邮件扫描器仅打开链接就误退订。一个订阅周期专用一个随机 ID，旧链接不会作用于后来重新订阅的地址。
- Resend 未配置时，为兼容现有 App，订阅接口保留旧的即时登记流程；管理员页面会禁用邮件发送。邮件服务配置齐全后，新订阅才改为双重确认。
- 启用 Resend 前，需更新 App 订阅页以区分“已登记”和“确认邮件已发送，请打开邮件完成订阅”，并同步九份语言表。否则 App 会把待确认状态显示为已订阅。
- Cloudflare Queues 对 Resend 发信失败进行重试；Worker 配置为每条消息最多重试 5 次、间隔 60 秒，之后进入死信队列。Resend 请求附稳定幂等键，减少队列重复投递造成的重复邮件。Queues 的交付语义是至少一次，不能据此承诺邮件一定送达。
- 管理员可以在工作台查看当前有效订阅邮箱和反馈。反馈目前只有读取能力，没有处理状态、回复或提醒工作流。
- 旧命令行管理脚本继续使用独立 `ADMIN_TOKEN`，可发布应用内公告、导出订阅邮箱和查看反馈。

## 技术结构

| 层 | 当前技术 | 职责 |
| --- | --- | --- |
| 管理网站 | `site/admin/` 静态 HTML / CSS / JavaScript，随官网 GitHub Pages 发布 | 登录、编辑公告、选择投递方式、查看订阅者和反馈 |
| 公开频道入口 | 根目录 `functions/channel/[[path]].js` Cloudflare Pages Function | 只转发公告、订阅、退订、订阅查询和反馈五个公开路由 |
| HTTP API | `worker/push/src/index.js` Cloudflare Worker | 登录、会话鉴权、公告、订阅确认、退订和反馈接口 |
| 数据 | Worker 绑定的 `PUSH_KV` | 保存公告、订阅邮箱和反馈 |
| 异步队列 | Cloudflare Queues：`starburst-email` 与 `starburst-email-dlq` | 缓冲群发任务、失败重试、隔离重试耗尽的任务 |
| 邮件服务 | Resend Email API | Worker 服务端单人发送；API Key 只保存在 Worker Secret |
| 登录限流 | Cloudflare Rate Limiting | 对管理员登录和订阅提交做近似限流；不是严格的全局配额 |

网页只调用项目自己的 JSON API，不接触邮件服务商密钥。频道入口经 Pages 同域转发，减少客户端直接连接 `workers.dev` 的网络与跨域故障。以后替换邮件供应商，主要改 Worker 的邮件适配层；若迁移到其他平台，可保留管理员网站和 API 契约，替换 KV、队列与邮件服务实现。

## 管理员如何使用

1. 打开官网 `/admin/`，输入配置好的管理员名称和密码。
2. 在“公告历史”查看、编辑或删除已发布公告；删除前会再次确认。
3. 编辑时修改标题、正文或紧急级别，保存后原公告 ID 和发布时间保留；不会重新发送邮件。
4. 发布新公告时选择投递目标。发送前确认影响范围：邮件会发给所有已确认订阅者；紧急级别会在应用内突出显示。
5. 查看结果：公告发布成功、邮件任务已排队、无订阅者、部分排队失败会分别显示。

“已排队”表示 Cloudflare Queues 已接收任务，不代表收件箱已送达。队列处理失败可在 Cloudflare Worker 日志与 DLQ 中排查。反馈页面只供维护者读取，不会把用户本地记录随反馈上传。

## 接口概览

| 接口 | 权限 | 用途 |
| --- | --- | --- |
| `GET /notices` | 公开 | 读取应用内公告 |
| `POST /subscribe-email` | 公开、限流 | 新建待确认订阅并排入确认邮件 |
| `GET /confirm-email?token=` | 签名链接 | 展示确认表单，不修改订阅状态 |
| `POST /confirm-email?token=` | 签名链接 | 确认订阅 |
| `GET /unsubscribe-email?token=` | 签名链接 | 展示退订表单，不修改订阅状态 |
| `POST /unsubscribe-email?token=` | 签名链接 | 退订；支持邮件客户端一键退订 |
| `POST /unsubscribe-email` | 公开 | 兼容 App 通过邮箱地址退订 |
| `GET /subscription?email=` | 公开 | 查询邮箱是否已确认订阅 |
| `POST /feedback` | 公开 | 用户主动提交反馈 |
| `POST /admin/session` | 管理员名称 / 密码、Origin 与限流校验 | 换取短期网页登录会话 |
| `GET /admin/api/notices` | 管理网页会话 | 查看完整公告历史 |
| `PUT /admin/api/notices/:id` | 管理网页会话 | 原位编辑公告，保留发布时间 |
| `DELETE /admin/api/notices/:id` | 管理网页会话 | 删除公告，未来公开列表不再返回 |
| `GET /admin/api/status` | 管理网页会话 | 查询可用投递选项 |
| `POST /admin/api/messages` | 管理网页会话 | 发布公告、发邮件或两者都做 |
| `GET /admin/api/subscribers` | 管理网页会话 | 查看有效订阅者 |
| `GET /admin/api/feedback` | 管理网页会话 | 查看反馈 |
| `POST /admin/notices`、`GET /admin/subscribers`、`GET /admin/feedback` | `ADMIN_TOKEN` | 兼容 CLI 管理脚本 |

## 线上启用前的配置

管理员网站现已发布：`https://brainleech198.github.io/starburst_recorder/admin/`。Pages workflow `41775382671` 成功；Worker `starburst-push` 版本 `17613267-08dd-4503-813a-ba055f7b49c2` 已部署。管理员登录和状态接口均返回 HTTP 200，当前 `emailSendingEnabled=false`。登录凭据保存在本机忽略文件 `.local/keys/admin-credentials.txt`，不要复制到仓库或公开位置。

管理员登录 Secrets、登录限流器、订阅限流器和邮件队列已配置。邮件仍需 Resend 发件域名和 API Key；启用前还要完成 App 订阅页的待确认提示与隐私文案。设置 Worker Secret 会立即部署新 Worker 版本，应先完成代码检查，再按 `worker/push/README.md` 的发版流程操作。

1. 确认 `worker/push/wrangler.toml` 中 `PUSH_KV` 的命名空间 ID 正确，两个 Rate Limiting `namespace_id` 在 Cloudflare 账户内唯一。
2. 当前账号已创建邮件队列和死信队列。新环境部署时再创建：

   ```bash
   npx wrangler queues create starburst-email --config worker/push/wrangler.toml
   npx wrangler queues create starburst-email-dlq --config worker/push/wrangler.toml
   ```

3. 在 Resend 验证发件域名，准备一个已验证的 `EMAIL_FROM` 地址和 API Key。
4. 当前管理员账号已配置。新环境可在本机交互输入管理员密码，生成 PBKDF2 哈希：

   ```bash
   node worker/push/hash-admin-password.mjs
   ```

5. 新环境需配置管理员 Worker Secrets；本环境已完成。明文密码、哈希、会话密钥、Resend API Key 和退订密钥都不要写入仓库、网页或命令行参数：

   ```bash
   npx wrangler secret put ADMIN_USERNAME --config worker/push/wrangler.toml
   npx wrangler secret put ADMIN_PASSWORD_HASH --config worker/push/wrangler.toml
   npx wrangler secret put ADMIN_SESSION_SECRET --config worker/push/wrangler.toml
   npx wrangler secret put RESEND_API_KEY --config worker/push/wrangler.toml
   npx wrangler secret put EMAIL_FROM --config worker/push/wrangler.toml
   npx wrangler secret put UNSUBSCRIBE_TOKEN_SECRET --config worker/push/wrangler.toml
   ```

   `ADMIN_SESSION_SECRET` 和 `UNSUBSCRIBE_TOKEN_SECRET` 都应由本机安全随机数生成器生成，至少 32 字节。`EMAIL_FROM` 必须属于 Resend 已验证域名。

6. 部署仅公告模式时，Resend 未配置，Worker 会继续使用旧式即时订阅登记，管理页面的邮件选项保持禁用。启用 Resend 前先更新 App 订阅页：展示待确认状态和确认邮件结果，并说明 Cloudflare / Resend 会处理邮箱；同步九份语言表。随后用维护者自己的邮箱验证订阅确认、公告投递、退订、一键退订、队列重试和 DLQ；核对网站 Origin 和邮件链接域名后，再向普通用户开放邮件订阅。

**本次已创建队列、配置管理员 Secrets、部署 Worker 和官网管理员页；没有配置 Resend、发送真实邮件或发布测试公告。** 启用邮件发送仍需有效发件域名、Resend API Key，并先更新 App 的双重确认提示与隐私说明。

## 当前限制与后续工作

- 部分任务排队失败时，管理页给出数量，但没有失败收件人的重试界面；需在 Cloudflare 日志 / 队列侧处理，后续可补管理端发送记录与可控重试。
- 已入队任务的发送状态和邮件商投递 / 退信事件尚未回写到管理页面。
- 公开 `/subscription?email=` 会回答订阅状态；兼容的邮箱退订接口可由知道邮箱的人调用。若要加强隐私和防误退订，应评估改为只接受签名令牌，并同步迁移现有客户端。
- 反馈没有状态、负责人、维护者邮件提醒或回复流程。
- 官网更新日志和订阅说明需明确表达邮件何时可用、邮箱由哪些服务处理、如何退订；在 Resend 域名与生产配置完成前，不应暗示邮件发送已上线。
- App 订阅页面还需适配双重确认流程，并更正“邮箱不会给第三方”的旧文案。

## 参考资料

- [Cloudflare Queues 投递保证](https://developers.cloudflare.com/queues/reference/delivery-guarantees/)
- [Cloudflare Queues 配置](https://developers.cloudflare.com/queues/configuration/configure-queues/)
- [Cloudflare Queues 平台限制](https://developers.cloudflare.com/queues/platform/limits/)
- [Cloudflare Workers Rate Limiting API](https://developers.cloudflare.com/workers/runtime-apis/bindings/rate-limit/)
- [Resend Email API](https://resend.com/features/email-api)
- [Resend 幂等键说明](https://resend.com/blog/engineering-idempotency-keys)
- 可迁移的开源参考：[Novu](https://github.com/novuhq/novu)、[listmonk](https://github.com/knadh/listmonk)
