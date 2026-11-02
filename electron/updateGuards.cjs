// 更新链路的输入守卫。
//
// 主进程替渲染层下载并拉起安装包，这两件事单独看都危险：
// 下载接受任意 URL、安装接受任意路径，渲染层一旦被控制（例如记录正文里带进来的东西），
// 就能「下一个任意 exe + 就地执行」。所以 URL 与路径在这里一次收口，
// 并且做成不依赖 electron 的纯函数——能用真数据直接跑一遍，不用起窗口。
const path = require('node:path')

/**
 * 安装包的命名形状。版本号允许带预发布尾（0.12.0-beta.1 也是合法包名），
 * 否则测试版的下载与安装会被自己拦掉。
 */
const VERSION = '[0-9][0-9A-Za-z.\\-]*'
const INSTALLER = new RegExp(`^starburst-recorder-${VERSION}-setup\\.exe$`, 'i')
/** 下到一半的残留：清理缓存时要一起收掉，但绝不能拿去安装 */
const INSTALLER_OR_PARTIAL = new RegExp(`^starburst-recorder-${VERSION}-setup\\.exe(\\.part)?$`, 'i')

/** GitHub 上我们的 release 资产固定长在这个路径下；别的仓库、别的用户的同名文件一概不认 */
const GITHUB_REPO_RELEASES = '/BrainLeech198/starburst_recorder/releases/download/'

/** 域名认到厂商自己那层为止（Gitee 的附件走 *.gitee.com） */
const ALLOWED_DOWNLOAD_HOSTS = new Set(['gitee.com'])

function installerInUrl(url) {
  const leaf = path.posix.basename(url.pathname)
  let name = leaf
  try {
    name = decodeURIComponent(leaf)
  } catch {
    // 地址里的百分号编码是坏的，按原样比对就行，别把整个校验炸掉
  }
  return INSTALLER.test(name)
}

/**
 * 只放行「我们自己在 GitHub / Gitee 上发的那个安装包」。
 * 域名、路径、文件名三样都要对得上，缺一不认。
 */
function isAllowedDownloadUrl(rawUrl) {
  let url
  try {
    url = new URL(String(rawUrl))
  } catch {
    return false
  }
  if (url.protocol !== 'https:') return false
  const host = url.hostname.toLowerCase()
  if (!installerInUrl(url)) return false
  if (host === 'github.com') return url.pathname.startsWith(GITHUB_REPO_RELEASES)
  return host === 'gitee.com' || host.endsWith('.gitee.com')
}

/** 落到「下载」目录里的文件名必须是我们自己安装包的那个形状 */
function isInstallerName(rawName) {
  return INSTALLER.test(String(rawName ?? ''))
}

/**
 * 校验要拉起的路径：只能是「下载」目录**这一层**里的安装包。
 * 目录比较不分大小写（Windows），且不允许子目录——`..\` 与嵌套路径一律否掉；
 * 下到一半的 .part 也不算安装包，不能拿去过时的半截文件去装。
 */
function resolveInstallerPath(dir, rawPath) {
  const target = path.resolve(String(rawPath ?? ''))
  if (!INSTALLER.test(path.basename(target))) return null
  if (path.dirname(target).toLowerCase() !== path.resolve(dir).toLowerCase()) return null
  return target
}

module.exports = {
  ALLOWED_DOWNLOAD_HOSTS,
  GITHUB_REPO_RELEASES,
  INSTALLER,
  INSTALLER_OR_PARTIAL,
  isAllowedDownloadUrl,
  isInstallerName,
  resolveInstallerPath,
}
