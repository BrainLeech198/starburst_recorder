# Web Push 中继（Cloudflare Worker）

网页版 / PWA 关掉之后还能提醒，靠的就是这个 Worker。它做三件事：

- `POST /subscribe`：收下订阅端点、时区、「几点 + 哪类」的提醒清单
- `POST /unsubscribe`：用户关推送时删订阅
- 每分钟被 Cron 唤醒，把到点的提醒加密后推给浏览器的推送服务

**它不知道提醒的内容。** 服务端只知道「8:00 有一条称重提醒」，文案是客户端订阅时
交上来的通用版本。这条线见 `docs/PWA-IOS.md` §9.1。

---

## 官方频道：公告 / 邮箱订阅 / 反馈

同一个 Worker 还托管了另一组接口。它们**不是推送**，是给所有平台用的普通 HTTP 接口。

**为什么必须分开**：Web Push 只有浏览器有。安卓与 Windows 安装包的用户收不到任何推送——
他们在系统通知里跟应用完全隔离。所以「紧急公告」不能只挂在推送链路上，
否则最重要的用户反而收不到。

| 接口 | 谁能调 | 干什么 |
| --- | --- | --- |
| `GET /notices` | 公开 | 当前公告列表，新的在前 |
| `POST /subscribe-email` | 公开 + IP 限流 | 提交邮箱；队列发送确认邮件，未确认地址不加入群发名单 |
| `GET/POST /confirm-email?token=` | 持有邮件内签名链接 | 确认邮箱订阅；GET 只显示页面，POST 才生效 |
| `GET /unsubscribe-email?token=` | 持有邮件内签名链接 | 显示退订确认页，GET 不会直接退订 |
| `POST /unsubscribe-email?token=` | 持有邮件内签名链接 | 退订；支持 RFC 8058 邮件客户端单击退订 |
| `POST /unsubscribe-email` | 公开 | 兼容 App 直接输入邮箱退订 |
| `GET /subscription?email=` | 公开 | 这个地址是不是已订阅 |
| `POST /feedback` | 公开 | 用户给官方的反馈 |
| `POST /admin/session` | 管理员名称 / 密码 + 登录限流 | 管理网页登录，换取 30 分钟会话 |
| `GET /admin/api/notices` | 管理网页会话 | 从官网管理员网页查看完整公告历史 |
| `POST /admin/api/notices` | 管理网页会话 | 从官网管理员网页发布公告 |
| `PUT /admin/api/notices/:id` | 管理网页会话 | 原位编辑公告，保留发布时间 |
| `DELETE /admin/api/notices/:id` | 管理网页会话 | 删除公告，之后不再出现在公开列表 |
| `POST /admin/api/messages` | 管理网页会话 | 只发公告、只发邮件或同时发送 |
| `GET /admin/api/subscribers` | 管理网页会话 | 从官网管理员网页查看订阅者 |
| `GET /admin/api/feedback` | 管理网页会话 | 从官网管理员网页查看反馈 |
| `POST /admin/notices` | `ADMIN_TOKEN` | 发一条公告（`level: urgent` 即紧急公告） |
| `GET /admin/subscribers` | `ADMIN_TOKEN` | 导出订阅邮箱表 |
| `GET /admin/feedback` | `ADMIN_TOKEN` | 翻用户反馈 |

**公开接口不需要客户端令牌**：公告是公开信息，订阅与反馈是用户主动发起的。
管理员登录和邮箱订阅使用各自独立的限流 binding，并按 `X-Forwarded-For` 最后一跳地址限流。Pages Service Binding 跨 zone 调用时 `CF-Connecting-IP` 可能变成所有请求共用的 Worker 子请求地址。Cloudflare Rate Limiting 是近似限流，不能当作全局严格配额。

**命令行管理接口需要独立的 `ADMIN_TOKEN`**，与客户端的 `PUSH_TOKEN` 分开：
客户端令牌会打进网页产物，谁都能扒出来；而「发公告、导出订阅邮箱、翻用户反馈」
这些动作不能开放给任何人。没配 `ADMIN_TOKEN` 时这组 CLI 管理接口**整体关闭**（返回 503），
而不是放行——忘了配等于没开管理后台。

官网同时提供账号密码管理员网站：`https://brainleech198.github.io/starburst_recorder/admin/`。
管理员页通过 Pages Function 的固定路由连接 Worker，避免浏览器直接连接 `workers.dev`；会话仍由 Worker 校验，未列入路由表的地址会被拒绝。
网页登录由 Worker 校验 `ADMIN_USERNAME` 与 PBKDF2 格式的 `ADMIN_PASSWORD_HASH`，成功后返回 30 分钟 HMAC 会话；会话只保存在网页内存。当前哈希使用 100,000 次迭代，因为 Worker WebCrypto 拒绝更高次数；生成器与校验器共用同一常量。它使用单独的 `ADMIN_SESSION_SECRET` 和 `ADMIN_LOGIN_LIMITER`，不会把 `ADMIN_TOKEN` 暴露给浏览器，也不影响下方的 CLI。

```bash
# 在本机安全地输入密码并生成 PBKDF2 哈希（输入不会显示）
node worker/push/hash-admin-password.mjs

# 逐项按 Wrangler 的交互提示输入；不要将值放进命令行参数或仓库文件
npx wrangler secret put ADMIN_USERNAME --config worker/push/wrangler.toml
npx wrangler secret put ADMIN_PASSWORD_HASH --config worker/push/wrangler.toml
npx wrangler secret put ADMIN_SESSION_SECRET --config worker/push/wrangler.toml
```

管理员页面可发布应用内公告、查看订阅邮箱与反馈；配置邮件服务后也可只发邮件或同时发公告和邮件。只有配置好 Resend、已验证发件地址、退订签名密钥和队列后，页面才会启用邮件选项。
公告历史支持原位编辑与删除。编辑保留原 ID 和发布时间，不会重新发送邮件；删除后公开公告接口不再返回该条记录，已经送达的邮件无法撤回。

首次部署前创建邮件队列和死信队列：

```bash
npx wrangler queues create starburst-email --config worker/push/wrangler.toml
npx wrangler queues create starburst-email-dlq --config worker/push/wrangler.toml
```

配置发件域名并取得 Resend API Key 后，交互式录入以下 Secrets；值只进 Worker，不进仓库或网页：

```bash
npx wrangler secret put RESEND_API_KEY --config worker/push/wrangler.toml
npx wrangler secret put EMAIL_FROM --config worker/push/wrangler.toml
npx wrangler secret put UNSUBSCRIBE_TOKEN_SECRET --config worker/push/wrangler.toml
```

`EMAIL_FROM` 必须是 Resend 已验证域名下的发件地址。`UNSUBSCRIBE_TOKEN_SECRET` 用本机
`node -e "console.log(require('node:crypto').randomBytes(32).toString('base64url'))"` 生成。
Resend、发件地址、签名密钥和队列都配置好后，新地址会收到确认邮件；七天未确认的地址作废。邮件服务未配置时，订阅接口暂时兼容旧版即时登记，管理员网页的邮件发送选项仍禁用。已有旧版记录（没有 `confirmedAt` 字段）视为用户此前已主动订阅，保留有效状态。

管理员网页入口：`https://brainleech198.github.io/starburst_recorder/admin/`。
`wrangler.toml` 中 Rate Limiting namespace `631942` 与 `631943` 必须在 Cloudflare 账户内唯一；限流绑定或账号 Secrets 缺失时登录/订阅确认均失败关闭。

### 部署时要多做两步

```bash
# 1. 生成管理令牌，存到本机（不进仓库）
node -e "console.log(require('crypto').randomBytes(24).toString('base64url'))"
#    存进 .local/keys/admin-token.txt

# 2. 设成 secret
npx wrangler secret put ADMIN_TOKEN --config worker/push/wrangler.toml
```

> **Windows 上的坑**：`wrangler secret put` 从管道读值，PowerShell 的管道会给它带上
> 尾随换行，导致线上 secret 与本机文件不一致、令牌校验永远 401。
> 用文件重定向：`cmd /c "type token.txt | npx wrangler secret put ADMIN_TOKEN --config ..."`。

### 用管理脚本发公告、导出订阅表

本机脚本 `worker/push/channel-admin.mjs` 包了上面那几个管理接口，
不用自己拼 curl：

```bash
# 发一条紧急公告
node worker/push/channel-admin.mjs notice --title "标题" --body "正文" --urgent

# 导出订阅邮箱（一行一个，直接贴进邮件客户端）
node worker/push/channel-admin.mjs subscribers

# 看用户反馈
node worker/push/channel-admin.mjs feedback
```

令牌从 `.local/keys/admin-token.txt` 读，不进仓库、不进命令行参数。

---

## 部署（五步）

### 1. 生成 VAPID 密钥

```bash
node worker/push/gen-vapid.mjs
```

输出里的两个值后面都要用。**存到密码管理器里**——换一次密钥，所有已订阅的设备
都要重新订阅（浏览器拿旧公钥签的订阅，新密钥推不过去）。

### 2. 建 KV 命名空间

```bash
npx wrangler kv namespace create PUSH_KV
```

把输出里的 `id` 填进 `wrangler.toml` 的 `[[kv_namespaces]]`。

### 3. 设 secret

```bash
npx wrangler secret put VAPID_PRIVATE_KEY --config worker/push/wrangler.toml
npx wrangler secret put VAPID_PUBLIC_KEY  --config worker/push/wrangler.toml
npx wrangler secret put VAPID_SUBJECT     --config worker/push/wrangler.toml   # mailto:you@example.com
npx wrangler secret put PUSH_TOKEN        --config worker/push/wrangler.toml   # 见下
```

`VAPID_SUBJECT` 是推送服务出问题时能联系到你的人，必须是 `mailto:` 或 `https://` 开头。

**`PUSH_TOKEN` 是共享令牌**，随便一串够长的随机字符（比如
`node -e "console.log(require('crypto').randomBytes(24).toString('base64url'))"`）。
配了之后 `/subscribe` 与 `/unsubscribe` 必须带 `x-push-token` 头，否则 401。

它挡的是**无差别扫描**：这个地址一旦公开，任何人都能 `curl` 灌订阅，把 KV 每天 1000 次的
写额度打满。额度一满，`put` 静默失败，**用户当天的提醒会全部不发、也不报错**——过一天自愈，
最难查的一类故障。一道令牌就把成本压回「没人专门针对你」的水平。

它挡不住什么：令牌最终躺在网页产物里，真针对这个应用逆向一次还是能扒出来。要真正防住
需要账号体系，那超出这个个人应用的范围。**它的定位是「抬高扫描成本」，不是「身份认证」。**

不配 `PUSH_TOKEN` 时闸门整体放行（本地 `wrangler dev` 调试用），生产必须配。

### 4. 改 `wrangler.toml` 里的 `[vars]`

```toml
ALLOWED_ORIGINS = "https://starburst-recorder.pages.dev"   # 多个用逗号分隔；本地调试可临时写 "*"
APP_URL = "https://starburst-recorder.pages.dev/"          # 点通知时打开这个地址
```

### 5. 部署

```bash
npx wrangler deploy --config worker/push/wrangler.toml
```

记下输出的 `https://starburst-push.<子域>.workers.dev`，这是网页版要用的 `VITE_PUSH_API`。

---

## 接上网页版

构建时给两个变量（`.env.local` 或部署平台的环境变量）：

```bash
VITE_PUSH_API=https://starburst-push.<子域>.workers.dev
VITE_VAPID_PUBLIC_KEY=<gen-vapid 输出的公钥>
VITE_PUSH_TOKEN=<与 Worker 上 PUSH_TOKEN 完全一致>
```

前两个都配好，设置页才会出现「提醒」入口。缺一个时 `pushState()` 返回 `unconfigured`，
入口整个不显示——**宁可没有入口，也不要摆一个点了没反应的按钮。**

`VITE_PUSH_TOKEN` 不参与「入口是否显示」的判断，但**必须与 Worker 上的 `PUSH_TOKEN` 一致**：
对不上时用户点「开启提醒」会拿到 401，客户端只会提示开启失败。这是配置错误，不是代码错误，
所以改完令牌两边都要重新部署。

配完重新 `npm run build` 部署网页版，iOS 上「添加到主屏幕」后进设置 → 提醒 → 打开。

---

## 自检

```bash
curl https://starburst-push.<子域>.workers.dev/health
# {"ok":true}
```

验令牌闸门是不是真的生效（配了 `PUSH_TOKEN` 时，前两条必须 401、第三条才 200）：

```bash
R=https://starburst-push.<子域>.workers.dev
curl -s -o /dev/null -w '%{http_code}\n' -X POST $R/subscribe -H 'Content-Type: application/json' -d '{}'   # 401
curl -s -o /dev/null -w '%{http_code}\n' -X POST $R/subscribe -H 'Content-Type: application/json' \
     -H "x-push-token: wrong" -d '{}'                                                                          # 401
curl -s -o /dev/null -w '%{http_code}\n' -X POST $R/subscribe -H 'Content-Type: application/json' \
     -H "x-push-token: $PUSH_TOKEN" -d '{}'                                                                    # 400（过了鉴权，卡在载荷校验）
```

注意第三条是 **400 而不是 200**：空载荷本来就该被拒。看到 400 才说明令牌这一关过了。

看 cron 有没有在跑、有没有推送失败：

```bash
npx wrangler tail --config worker/push/wrangler.toml
```

每分钟会打一行 `cron * {"scanned":N,"sent":M,"failed":K}`：`sent` 只统计**真的被推送服务收下**的，
网络失败算 `failed`，`push failed <状态码>` / `push error <原因>` 是具体原因。
一个端点出问题不会中断整轮扫描——否则一个死地址就能让所有人的提醒都不响。

本地调试（不碰线上 KV）：

```bash
npx wrangler dev --config worker/push/wrangler.toml --test-scheduled
# 手动触发一次 cron：
curl "http://localhost:8787/__scheduled?cron=*+*+*+*+*"
```

`wrangler dev` 读同目录的 `.dev.vars`（不进 git）：

```
VAPID_PRIVATE_KEY=...
VAPID_PUBLIC_KEY=...
VAPID_SUBJECT=mailto:you@example.com
PUSH_TOKEN=...            # 不写也行，本地就不校验令牌
```

---

## 单测

```bash
node package/run-tests.cjs run worker/push
```

`src/webpush.test.js` 用 **RFC 8291 §5 的官方样例**逐字节比对密文，另外验 VAPID JWT 的
签名能被公钥验过；`src/schedule.test.js` 测时区换算（含夏令时跳变）、命中判断与去重键；
`src/index.test.js` 用假 KV 跑通订阅/退订/去重/410 清理，以及令牌闸门（没配放行、配了必须对）。
这几块是最容易「看起来对、实际推不出去」的地方，改动前后都该跑。

---

## 成本

免费额度：Workers 每天 10 万次请求，KV 每天 10 万次读 / 1000 次写，Cron 免费。

每分钟一次 cron = 1440 次/天，加每次 1 次 KV `list`，一个人用远在额度内。
KV 的**写**只发生在订阅、退订、以及真的推了一条（去重标记）时——按每天 5 条提醒算，
一天不到 10 次写。真到 1000 次写/天，说明有几百条提醒在跑，那时该升级付费计划了。

---

## 已知限制

| 限制 | 说明 |
| --- | --- |
| iOS 16.4+ 且已「添加到主屏幕」 | Safari 标签页里拿不到订阅，`pushState()` 返回 `needs-install` |
| 精度到分钟 | cron 延迟几秒就可能跨分钟漏一条；要秒级得换 Durable Objects |
| 去重是 at-most-once | 先写标记再推，cron 重叠时宁可掉一条也不重复弹 |
| KV 最终一致 | 刚订阅后立刻到点的那条可能推不出去，下一次同步就好 |
| 换 VAPID 密钥要重新订阅 | 老订阅是用旧公钥签的 |
| `PUSH_TOKEN` 不是身份认证 | 令牌躺在网页产物里，逆向能拿到。它只把「随手 curl 灌订阅」挡在外面，真要防住得做账号体系 |
