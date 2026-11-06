# 网页版（PWA）与 iOS 支持

> 起因：只有 Windows 与安卓两个宿主，iOS 用户在 App 层面用不上。
> 没有 Apple 开发者账号、也没有 macOS，所以走「同一份 `dist/` 做成 PWA」这条路：
> iOS Safari 打开网址 →「添加到主屏幕」，独立窗口、有图标、能离线。
> 最近更新：2026-11-03

---

## 1. 现在有哪些东西

| 文件 | 作用 |
| --- | --- |
| `public/manifest.webmanifest` | 安装信息：名称、图标、`standalone`、主题色 |
| `public/icons/` | 图标四件套，见下方「图标」一节 |
| `public/sw.js` | Service Worker：外壳离线、静态资源缓存 |
| `index.html` | `manifest` / `apple-mobile-web-app-*` / `apple-touch-icon` 元信息 |
| `vite.config.ts` → `serviceWorkerBuildId()` | 构建时把 `sw.js` 里的 `__BUILD_ID__` 换成唯一值 |
| `src/platform/pwa.ts` | `isWebApp()` / `registerServiceWorker()` / `requestPersistentStorage()` |
| `src/platform/notify.ts` | 统一的系统通知出口（桌面用构造器，网页版走 Service Worker） |
| `src/platform/saveFile.ts` | iPhone / iPad 网页版改走系统分享面板 |
| `src/features/home/InstallHint.tsx` | 首次进首页提示「添加到主屏幕」，关掉一次就不再出现 |
| `src/features/ai/aiClient.ts` | 配了 `VITE_AI_PROXY` 就走代理，否则维持直连 |

### 几个刻意的取舍

- **只在生产构建注册 SW**。开发时注册会把热更新模块也缓存下来，改代码刷新没反应。
- **不 `skipWaiting`**。新版本等所有页面关掉之后才激活，避免用户写日记写到一半被换页面。
  又因为 HTML 走「网络优先」，其实下次打开就已经是新版本，等待期基本感知不到。
- **缓存只碰同源 GET**。AI 请求是跨域的，缓存它会把一次失败响应永久留在本地。
- **图标有四个，各有各的坑**（`public/icons/`）：

  | 文件 | 用在哪 | 注意 |
  | --- | --- | --- |
  | `icon-192.png` | `link[rel=icon]`（标签页）+ manifest `any` | 来自安卓 `mipmap-xxxhdpi`，透明底 |
  | `icon-512.png` | manifest `any` | 来自 `package/windows/icon.png`，透明底 |
  | `icon-180.png` | `apple-touch-icon`（iOS 主屏） | **必须不透明**：iOS 把透明像素渲染成纯黑，深空主题会露馅；图案占 85% |
  | `icon-maskable-512.png` | manifest `maskable`（安卓/Chrome 安装） | 深色底 + 图案缩到 70%，落在安全圆内，否则圆角裁切会切掉光环两端 |

  180 与 maskable 这两张是用无头 Chrome 渲染「深色底 + 缩放后的透明图标」截图出来的
  （`.local/icon-180.html` / `.local/icon-maskable.html`，不进仓库）。改图标时四张要一起换，
  尺寸写错 manifest 不会报错，只会静默掉回默认图。

---

## 2. AI 请求：需要一层薄代理

**问题**：生产构建下 `aiClient` 是浏览器直连厂商 API，能不能通取决于对方给不给 CORS 头。
安卓 WebView 上一直这么跑，说明常见厂商大多给了；但 iOS Safari 更严格，不能赌。

**办法**：部署一个只做转发的 Cloudflare Worker，客户端把 `VITE_AI_PROXY` 指向它。
协议与 dev server 的 `/__ai` 完全一致（请求头 `x-ai-target` 带目标地址，返回同一个信封），
所以前端只改一个地址，解析逻辑一行都不用动。

### 2.1 Worker 代码

新建目录（例如仓库外的 `starburst-ai-proxy/`），写入 `src/index.js`：

```js
/**
 * 星芒记录者的 AI 转发。只做三件事：放行跨域、校验目标地址、把响应原样包成信封。
 * 不存 key、不记日志、不改请求体——key 始终只存在于用户自己的设备上。
 */

/** 只允许转发到这些主机。加自己的服务商之前先确认它的域名。 */
const ALLOWED_HOSTS = new Set([
  'api.openai.com',
  'api.deepseek.com',
  'api.moonshot.cn',
  'open.bigmodel.cn',
  'dashscope.aliyuncs.com',
  'api.siliconflow.cn',
])

const json = (payload, cors) =>
  new Response(JSON.stringify(payload), {
    headers: { 'Content-Type': 'application/json; charset=utf-8', ...cors },
  })

export default {
  async fetch(request, env) {
    const allowOrigin = env.APP_ORIGIN || '*'
    const cors = {
      'Access-Control-Allow-Origin': allowOrigin,
      'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type,Authorization,api-key,x-ai-target',
      'Access-Control-Max-Age': '86400',
    }

    // 自定义请求头会触发预检，必须回 204 且带齐 CORS 头
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors })

    const origin = request.headers.get('Origin')
    if (allowOrigin !== '*' && origin && origin !== allowOrigin) {
      return new Response('forbidden', { status: 403, headers: cors })
    }

    const url = new URL(request.url)
    if (!url.pathname.startsWith('/__ai')) {
      return new Response('not found', { status: 404, headers: cors })
    }

    const raw = request.headers.get('x-ai-target') || ''
    let target
    try {
      target = new URL(raw)
    } catch {
      return json({ ok: false, status: 0, body: '', ms: 0, error: '请求头里没有目标地址' }, cors)
    }
    if (!/^https?:$/.test(target.protocol) || !ALLOWED_HOSTS.has(target.hostname)) {
      return json(
        { ok: false, status: 0, body: '', ms: 0, error: `不允许的目标地址：${target.hostname}` },
        cors,
      )
    }

    const headers = { 'Content-Type': 'application/json' }
    const auth = request.headers.get('Authorization')
    if (auth) headers.Authorization = auth
    const apiKey = request.headers.get('api-key')
    if (apiKey) headers['api-key'] = apiKey

    const started = Date.now()
    try {
      const upstream = await fetch(target.toString(), {
        method: request.method,
        headers,
        body: request.method === 'POST' ? await request.text() : undefined,
      })
      return json(
        { ok: upstream.ok, status: upstream.status, body: await upstream.text(), ms: Date.now() - started },
        cors,
      )
    } catch (error) {
      return json({ ok: false, status: 0, body: '', ms: Date.now() - started, error: error.message }, cors)
    }
  },
}
```

**白名单不是可选项**：`x-ai-target` 是客户端给的，没有白名单这个 Worker 就是一个人人可用的
开放代理，会被拿去打内网或者刷额度。

### 2.2 部署

```bash
npx wrangler init starburst-ai-proxy     # 或手写 wrangler.toml
npx wrangler secret put APP_ORIGIN       # 填 https://你的域名，别留 *
npx wrangler deploy
```

`wrangler.toml` 最小内容：

```toml
name = "starburst-ai-proxy"
main = "src/index.js"
compatibility_date = "2026-01-01"
```

### 2.3 客户端接上

仓库根目录建 `.env.production`：

```
VITE_AI_PROXY=https://starburst-ai-proxy.你的账号.workers.dev
```

然后 `npm run build`。不配这个变量时行为与改动前完全一致（直连），
桌面壳和安卓壳都走不到这段代码。

> `VITE_` 前缀的变量会被内联进 JS 产物，**不要**往里放密钥。
> 这里只有一个公开的代理地址，放进去没问题。

> **当前决定：先直连，遇到问题再补。** 上面这套代理代码留着，`VITE_AI_PROXY` 不配就不生效。
> 为了让「被跨域拦」这件事不至于被误判成网络问题，网页版连不上时错误提示会多一句
> 排查方向（`ai.err.corsHint`）。

---

## 3. 通知：已经不会崩了，但「关掉应用也提醒」做不到

**改了什么**：三处 `new Notification()` 全部换成 `notifyNow()`。
iOS 16.4+ 定义了 `Notification` 对象但构造函数是空的，原来那句会直接抛 `TypeError`，
训练页的调用点还没包 try，等于一进页面就可能中断。

**现在的行为**：

| 平台 | 到点提醒 |
| --- | --- |
| 桌面（Electron） | 应用开着就弹 |
| 安卓原生 | 预排本地通知，应用没开也弹 |
| 网页版 / PWA | 应用开着才弹 |

**要「关掉也提醒」只剩一条路**：Web Push。已经做完并部署（见 §9）——需要配好推送中继
（`VITE_PUSH_API` / `VITE_VAPID_PUBLIC_KEY` / `VITE_PUSH_TOKEN`），没配前两个时设置页里
不会出现「提醒」入口。

**已知限制**：iOS 上 `Notification.requestPermission()` 在没有用户手势时可能直接给 denied，
所以首次进页面大概率拿不到权限。这不是 bug，是 Safari 的策略。

---

## 4. 存储：iOS 会回收，这是唯一需要长期盯着的风险

Safari 对「可写存储」（IndexedDB、localStorage）有清理策略，长期不打开、
磁盘吃紧、或者用户手动清理网站数据，都可能让数据消失。这条在桌面与安卓上都不存在。

已经做的：

- 启动时调 `navigator.storage.persist()`（`src/platform/pwa.ts`）。桌面 Chrome / Edge 上
  这个调用是实打实的保护；**iOS 上不保证生效**，只能算尽力而为。
- **备份提醒**（`src/features/settings/backupReminder.ts`）。数据页「导出」按钮下面显示
  「上次导出：YYYY-MM-DD」；超过 14 天变成红色的「已经 N 天没有导出备份了」。
  只有真的落盘才记时间——在保存对话框、分享面板里取消都不算。
  这条状态刻意不进备份文件，也不进 `userPrefs`：换台设备之后「上次备份是哪天」没有意义。

还可以做的：

1. **WebDAV / iCloud Drive 自动备份**。真正解决回收问题的是「数据在别处也有一份」，
   而不是祈祷浏览器不清理。工作量明显更大，属于独立特性。

在没做第 1、2 条之前，交付给 iOS 用户时**必须在说明里写清楚**：
定期在「数据」页导出备份。

---

## 5. 部署清单

1. `npm run build` → 产物在 `.local/dist/`
2. 整个目录传到静态托管（Cloudflare Pages / Vercel / 对象存储 + CDN 均可）
3. **必须 HTTPS**。Service Worker、相机、扫码、分享全都要安全上下文
4. 子路径部署也可以：`base: './'` 与 hash 路由本来就为此准备
5. 首次部署后确认这四个地址都是 200：
   `/`、`/sw.js`、`/manifest.webmanifest`、`/icons/icon-192.png`
6. 要开后台提醒的话，构建环境里补三个变量（见 §9.2）：`VITE_PUSH_API`、`VITE_VAPID_PUBLIC_KEY`、`VITE_PUSH_TOKEN`

公告、邮箱订阅和反馈共用 Cloudflare Pages 的 `/channel/*` 入口，并由 `functions/channel/[[path]].js`
绑定到 `starburst-push` Worker；频道入口不依赖 `VITE_PUSH_API`。自托管时可通过 `VITE_CHANNEL_API`
覆盖默认的 `https://starburst-recorder.pages.dev/channel`。Web Push 仍使用 `VITE_PUSH_API`。
发布 Pages 时需保留仓库根目录的 `wrangler.jsonc` 服务绑定配置。

**网页版地址定为 `https://starburst-recorder.pages.dev`**，所以 Cloudflare Pages 的项目名必须是
`starburst-recorder`——名字不一样域名就不一样，`worker/push/wrangler.toml` 里的
`ALLOWED_ORIGINS` 与 `APP_URL` 也得跟着改，否则浏览器发的 `Origin` 对不上，推送订阅直接被 403。

> 国内访问：`*.pages.dev`、`*.vercel.app` 的默认域名不稳定，正式分发建议自有域名。

---

## 6. iOS 真机验收清单

按顺序过一遍，任何一条不过都不算「能用」：

- [ ] Safari 打开 → 分享 → 添加到主屏幕：图标正确、名称是「星芒」
- [ ] 从主屏幕启动：没有地址栏，状态栏下方内容不被遮挡
- [ ] 完全退出后断网再打开：仍能进入（离线外壳生效）
- [ ] 写一条日记 → 上滑杀掉 → 重开：内容还在
- [ ] 数据页导出：弹出系统分享面板，能存进「文件」
- [ ] 食物拍照：相机正常打开，照片能识别
- [ ] 扫码：授权相机后能扫到分享码
- [ ] AI 对话：配好代理后能正常收发（看设置页的连接测试）
- [ ] 切到后台 10 分钟再回来：页面没有白屏或状态错乱
- [ ] 切到浅色主题：状态栏文字仍然看得清（`black-translucent` + 浅色底）
- [ ] 设置 → 提醒：能打开，说明当前状态；配好中继后打开开关 → 上滑杀掉应用 → 到点收到通知

---

## 7. 以后要「真 App 体验」怎么办

只有一条路：Apple 开发者账号（$99/年）+ iOS 工程。**没有 Mac 也不构成阻碍**——
Codemagic、GitHub Actions 的 macOS runner、Expo EAS 都能在云端出包。
Capacitor 已经有 Android 工程，加 iOS 平台是 `npx cap add ios` 的事。

只有为了下面这些才值得付这笔钱：HealthKit 读写、真正的本地定时通知、后台运行、
App Store 分发。其余功能 PWA 都能覆盖。

---

## 8. 改完怎么验证

`.local/probe-pwa.mjs`（不进仓库）起一个静态服务 + 无头 Chrome，跑 20 项断言：
页面挂载、标题、主题、manifest 可解析、图标可取（含 `maskable` 与 `apple-touch-icon`）、
iPhone UA 下出现安装引导且关闭后记住、theme-color 是十六进制且跟随深浅主题、
数据页备份提醒渲染、推送设置页能打开并解释当前状态（没配推送时不给按钮）、
**导出含密钥的备份时先弹口令框**、SW 激活、作用域覆盖站点根、
**只有一个缓存且带当前构建号**、首装就预缓存了入口 HTML 与带哈希资源、
无控制台错误与未捕获异常。

```bash
npm run build && node .local/probe-pwa.mjs
```

端口用 8123 / 9339，避开常用端口；脚本自己起服务、自己收 Chrome，不需要手工清进程。
**每次运行都会删掉 `.local/chrome-profile-pwa` 重新来**——验的是「用户第一次装」这条路径。
复用 profile 会留下上一版的 SW 与缓存，断言看着全绿，其实验的是升级路径。

这一步曾经抓出真问题：SW 首装时只缓存了 HTML，JS 要等第二次访问才进缓存，
用户装完主屏幕立刻断网会白屏。现在 install 会解析入口 HTML 把 `assets/` 一起预缓存。

**上面验的是本地 dist，不是线上那一份。** 线上另有 `.local/verify-online.mjs`（同样不进仓库），
用无头 Chrome 打开 `https://starburst-recorder.pages.dev` 跑 10 项：

```bash
node .local/verify-online.mjs
```

- 线上构建号 == 本地刚构建的构建号（不一致说明 Pages 还在发旧版，后面全是假绿）
- 线上 SW 已激活并接管页面、缓存名带线上构建号
- **线上入口 bundle 里真的带着推送令牌**（漏了的话「开启提醒」会卡在 401）
- 中继：没令牌 401 / 令牌错 401 / 令牌对 200，然后立刻把这条测试订阅删掉
- `/health` 正常

必须走浏览器而不是 `curl`：本机 CLI 到 `*.pages.dev` / `*.workers.dev` 的 TLS 握手会被
中间设备打断（`curl` 报 alert 40、`node fetch` 报 `HANDSHAKE_FAILURE`），只有 Chrome 连得上。
`api.cloudflare.com` 反而正常，所以 KV 之类的管理操作可以用 `curl --noproxy '*'`。

---

## 9. Web Push：已实现并上线

关掉应用也能提醒，iOS 上只有 Web Push 一条路。这条链现在两端都写完了：

| 位置 | 干什么 |
| --- | --- |
| `src/platform/push.ts` | 申请权限 → `pushManager.subscribe` → 把订阅与提醒清单发给中继；`pushState()` 负责解释「为什么开不了」 |
| `src/features/notifications/reminderSlots.ts` | 把健康档案 / 日程 / 训练计划翻译成「几点 + 哪类」的提醒位 |
| `src/features/notifications/PushReminderHost.tsx` | 清单变了就同步一次（`localStorage` 存指纹，没变不发请求） |
| `src/features/settings/ReminderPage.tsx` | 设置 → 提醒：一个开关 + 当前状态 |
| `public/sw.js` | `push` / `notificationclick`：收到就弹，点了回到应用 |
| `worker/push/` | Cloudflare Worker + KV + Cron：`/subscribe`、`/unsubscribe`，每分钟扫一遍到点的提醒 |

### 9.1 数据边界：只上传「时间 + 类别」

服务器要在客户端不参与的情况下推送，就必须知道「几点推」。所以上传的是提醒位，
不是提醒内容：

```json
{ "id": "weigh-0", "category": "weigh", "time": "08:00", "weekdays": [1, 4] }
```

文案（`title` / `body`）是**订阅时客户端交上去的通用版本**，存在 KV 里随订阅一起走，
服务端不认语言、也不会自己拼。也就是说中继看到的是「8:00 有一条称重提醒」，
看不到「8:00 称重 62.4kg」，也看不到任何日程标题、训练项目、日记内容。

三个方案的取舍（当时选的就是 B）：

| 方案 | 上传什么 | 隐私 | 体验 |
| --- | --- | --- | --- |
| A 完整提醒 | 时间 + 标题 | 日程标题离开设备 | 与安卓原生一致 |
| **B 只传时间** | **时间 + 类别** | **只知道「你设了 8:00 的提醒」** | **推送文案通用，得打开应用才知道是什么** |
| C 加密上传 | 密文 | 服务器看不到明文 | 最复杂，密钥轮换要自己管 |

要改成 A 的话，设置页必须写清楚「提醒标题会经过服务器」，否则就是背着用户改隐私口径。

### 9.2 部署

完整步骤（含生成 VAPID 密钥、建 KV、设 secret）见 `worker/push/README.md`。要点：

1. `node worker/push/gen-vapid.mjs` 生成一对 VAPID 密钥，**存好别重跑**（换密钥＝所有设备重新订阅）
2. `wrangler kv namespace create PUSH_KV`，把 id 填进 `worker/push/wrangler.toml`
3. 四个 secret：`VAPID_PRIVATE_KEY` / `VAPID_PUBLIC_KEY` / `VAPID_SUBJECT`（`mailto:` 地址）/ `PUSH_TOKEN`
4. `wrangler deploy --config worker/push/wrangler.toml`
5. 网页版构建时给三个变量：`VITE_PUSH_API=https://<worker>.workers.dev`、`VITE_VAPID_PUBLIC_KEY=<公钥>`、`VITE_PUSH_TOKEN=<与 PUSH_TOKEN 一致>`

前两个变量缺一个，`pushState()` 返回 `unconfigured`，设置页不会出现提醒入口——
**宁可没有入口，也不要摆一个点了没反应的按钮。**

### 9.2.1 共享令牌：挡的是「扫描把写额度打满」

中继地址一旦公开，任何人都能 `curl` 灌订阅。KV 免费额度是**每天 1000 次写**，被打满之后
`put` 静默失败——**用户当天的提醒会全部不发，而且不报错**，第二天额度恢复又自己好了。
这种「不报错、会自愈」的故障最难查，所以加一道 `x-push-token`：`/subscribe` 与
`/unsubscribe` 必须带对令牌，否则 401（定长比较，不按字符提前返回）。

必须说清它挡不住什么：**令牌最终躺在网页产物里**（`VITE_PUSH_TOKEN` 会被打进 bundle），
针对这个应用逆向一次就能扒出来。它抬高了「无差别扫描」的成本，不是身份认证；
要真正防住得做账号体系，那超出这个个人应用的范围。这一点在 README 的「已知限制」里也写着，
免得以后误以为它是安全的。

改令牌要**两边同时改**：Worker 的 secret + 网页版构建变量。只改一边的后果是用户点「开启提醒」
拿到 401，客户端只能提示开启失败——这是配置错误，不是代码错误。

### 9.3 服务端为什么自己写加密

Cloudflare 上没有 `web-push` 这类库（那套依赖 Node 的 `crypto` 与 `Buffer`），
而整条链只需要四个 WebCrypto 原语：HKDF、ECDH、ECDSA、AES-GCM。`worker/push/src/webpush.js`
不到 150 行，省掉了打包步骤。

正确性不靠自证：单测拿 **RFC 8291 §5 的官方样例**逐字节比对（明文、双方密钥、auth、salt、
完整密文都是规范给定的），改错任何一步都会立刻炸。另有 VAPID JWT 的签名验证、
时区换算（含夏令时跳变）与去重键的单测。

### 9.4 Web Push 与官方频道的边界

Web Push 只覆盖网页版 / PWA。**安卓与 Windows 安装包的用户收不到系统推送**，因此紧急公告还需要跨平台的官方频道 API。
公告、邮箱订阅和反馈的通用架构、当前操作与后续发信方案见 [`docs/OFFICIAL-CHANNEL.md`](OFFICIAL-CHANNEL.md)。

本节其余内容只说明与 Web Push 的边界：Web Push 权限和 iOS 安装条件见本页 §9.5；官方频道公告不依赖 Push。

### 9.5 已知限制

- **iOS 必须 16.4+，且必须已「添加到主屏幕」**。Safari 标签页里永远拿不到订阅，
  `pushState()` 会返回 `needs-install` 并给出对应文案。
- **权限必须由用户手势触发**。所以 `enablePush()` 把 `requestPermission()` 放在第一个
  `await` 位置——中间夹一个 `await`，iOS 可能直接给 denied。
- **cron 每分钟一次，命中靠「本地时间正好等于 HH:MM」**。Worker 的 cron 偶尔会延迟几秒，
  跨分钟就可能漏一条；这个精度对提醒够用，追求秒级就得换 Durable Objects 定时器。
- **去重是「先写标记再推」**（at-most-once）。cron 重叠执行时宁可掉一条，也不重复弹两次。
- **一个端点出问题不会中断整轮扫描**：网络失败单独计 `failed`，`sent` 只统计真的被推送服务
  收下的。否则一个死地址就能让所有人的提醒都不响——这条是本地 workerd 里实跑时发现的。
- **KV 是最终一致的**：刚点「开启」后立刻到点的那一条可能推不出去，下一次同步就好了。
- 推送服务返回 404/410（用户清了网站数据 / 卸载）时，Worker 会顺手删掉这条订阅。
- **`PUSH_TOKEN` 不是身份认证**，只是抬高扫描成本（见 9.2.1）。令牌公开在 bundle 里，
  别把它当成访问控制来依赖。

---

## 10. 当前部署状态（2026-11-05）

| 项目 | 值 |
| --- | --- |
| 网页版 | https://starburst-recorder.pages.dev （Pages 项目名 `starburst-recorder`，生产分支 `main`） |
| 推送中继 | https://starburst-push.starburst-recorder.workers.dev （cron `* * * * *`） |
| KV | 绑定 `PUSH_KV`，id `be50f38dcf4d4b4f8dfd7adc01e62908` |
| VAPID 公钥 | `BEwRKmJAcmqc1ppUK685WQXzBwDZDokYNd2fBtWxT7qZV-CuyXSVcTgNwalnoUxNYkniVaHHCK8N4jMOhtxLlwU` |
| 共享令牌 | `PUSH_TOKEN`（Worker secret）与 `VITE_PUSH_TOKEN`（`.env.local`，构建时进 bundle），两边必须一致 |
| 账号 | yhl198guge@gmail.com（账号 id `abc210d10655756a374ffa6712de9296`） |

几个必须记住的点：

- **VAPID 私钥只在两处**：`worker/push/.dev.vars`（本机，不进 git）与 Worker 的 secret。
  另有备份在 `.local/keys/vapid.json`。**丢了就得重新生成，换一次所有设备都要重新订阅。**
- **网页版靠 `.env.local` 里的 `VITE_PUSH_API`、`VITE_VAPID_PUBLIC_KEY` 与 `VITE_PUSH_TOKEN`**，
  这个文件不进 git。换成 Git 集成或 CI 构建时，这三个变量要写进 Pages 项目的环境变量，否则
  线上构建出来的网页版要么没有「提醒」入口，要么点「开启」拿到 401。
- 目前是 **CLI 部署**（`wrangler pages deploy .local/dist --project-name starburst-recorder`），
  没有接 Git 自动构建；改了代码要重新 `npm run build` 再 deploy。
- `starburst-push` 这个 Worker 是**先建 secret 再 deploy** 出来的：第一次 `secret put` 时
  它自动创建了一个只有 secret 的空 Worker，所以 `wrangler.toml` 里不需要额外的初始化步骤。
- workers.dev 子域是账号级的 `starburst-recorder`，所以 Worker 域名是
  `starburst-push.starburst-recorder.workers.dev`（前缀是 Worker 名，后缀是子域名）。
- **2026-11-03 补了两件事**：备份导出时用口令加密 AI 密钥（`src/features/settings/secretBox.ts`，
  PBKDF2-SHA256 15 万次 + AES-GCM，只加密 `apiKey`，其余字段保持明文以便出错时还能导入）；
  中继加共享令牌。两件都跑过 `.local/verify-online.mjs` 的线上验收（10/10），
  构建号 `mw0e1d3j`。
- **2026-11-03 网页版更新**：提交 `abd7ce7`（含单条记录 PNG 卡片与 AI 气泡秒级时间）已部署到生产 Pages；
  线上构建号 `mw0vecnn`，部署地址 `https://0acdbb16.starburst-recorder.pages.dev`，
  正式域名 `https://starburst-recorder.pages.dev` 的 `.local/verify-online.mjs` 验收 10/10。
- **2026-11-04 网页版更新**：提交 `5ec61a3`（小型非 JPEG 助手图片附件统一转成 JPEG）已部署到生产 Pages；
  线上构建号 `mw0wq4hi`，部署地址 `https://7b81e493.starburst-recorder.pages.dev`，
  正式域名 `https://starburst-recorder.pages.dev` 的 `.local/verify-online.mjs` 验收 10/10，
  本地 `.local/probe-pwa.mjs` 验收 20/20。
- **2026-11-04 频道与公告修复**：提交 `ec0e239`（Pages 同域频道转发、启动公告弹窗与公告空/错态）已部署到生产；
  部署地址 `https://ba6aab6d.starburst-recorder.pages.dev`，构建号 `mw1tgq6q`。
  正式域名公告接口返回 JSON 200；网页与 Android WebView Origin 预检返回 204；空反馈和无效邮箱返回 400，
  未向生产写入测试数据。Android / Windows 安装包仍需下次签名发版。
- **2026-11-04 v0.15.1 公告回执**：标签 `v0.15.1`（提交 `ef10c44`）已部署到生产 Pages，地址
  `https://028fcd74.starburst-recorder.pages.dev`，构建号 `mw1xmho8`；`.local/verify-online.mjs`
  通过 10/10，`.local/probe-pwa.mjs` 通过 20/20。新客户端点“确认收到”后本机记住公告 ID；关闭弹窗仍会在下次启动提醒。
- **2026-11-05 v0.16.2**：标签 `v0.16.2`（提交 `dc99b75`）已部署到生产 Pages，地址
  `https://c75b25f8.starburst-recorder.pages.dev`，构建号 `mw3j9k4u`；正式域名
  `https://starburst-recorder.pages.dev` 的线上验收 10/10，本地 PWA 探针 20/20；Service Worker 已激活并接管页面，
  推送中继鉴权与 `/health` 均通过，测试订阅已删除。
- **2026-11-06 v0.17.0**：标签 `v0.17.0`（提交 `0df4cd0`）已部署到生产 Pages，地址
  `https://9b321ee2.starburst-recorder.pages.dev`，构建号 `mw4lb8z3`；正式域名
  `https://starburst-recorder.pages.dev` 的线上验收 10/10，本地 PWA 探针 20/20；Service Worker 已激活并接管页面，
  推送中继鉴权与 `/health` 均通过，测试订阅已删除。反馈路由无效安装标识请求返回 400，未创建生产测试数据。
- **KV 里现在只剩一条记录**，是早先在 workerd 里手测留下的 FCM 端点、`slots` 为 0
  （永远不会命中，不产生推送）。真正的用户订阅会在开启提醒时自己写进来。
