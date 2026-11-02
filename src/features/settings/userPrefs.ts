/**
 * 用户偏好与助手设置：把所有散在 localStorage 里的「用户数据」收成一份可备份的快照。
 *
 * 为什么要有这一层（2026-11-02 定，写进 AGENTS.md 的硬规矩）：
 * 数据库里的记录（日记、健康、收支…）早就跟着整库备份走了，但**同样是用户数据**的
 * 外观、语言、助手的长期记忆与技能、AI 模型配置、图片存法、天气地点，一直只活在本机
 * localStorage 里——换台机器或清了浏览器数据就全没了，备份文件里连影子都没有。
 * 规矩是「凡是用户自己攒出来的东西，都必须能被导出、再导入回来」，于是有了这一块。
 *
 * 实现上刻意不逐项建模：
 *   - 白名单只列「键」，值原样进出（`string`）。每一项的形状由它自己的模块负责校验
 *     （`loadModels` / `normalizeMemories` / `parseCareState` …），备份层不重复一遍。
 *   - 这样以后新加一个偏好键，只要加进 `PREF_GROUPS` 就自动进备份，
 *     不会再出现「新功能忘了接备份」这种漏。
 *
 * 两条安全约束：
 *   1. **只认白名单**：导入时不在名单里的键一律丢弃，别人塞进来的任意键写不进本机存储。
 *   2. **AI 模型那一项含明文 apiKey**，属于用户自己的密钥。备份照带（不带就等于没备份完整），
 *      但界面必须提示「这份文件里有密钥，别外发」——见 `prefsContainSecrets`。
 */

/** 分组的唯一作用是给界面一句人话的说明，不参与校验 */
export const PREF_GROUPS = {
  /** 外观与语言 */
  appearance: ['starburst.theme', 'starburst.accent', 'sb_locale', 'starburst.care'],
  /** 助手：模型配置（含密钥）、深度思考、长期记忆、技能、权限 */
  assistant: [
    'sb_ai_models',
    'sb_ai_active',
    'sb_ai_reasoning_v1',
    'sb_assistant_memories',
    'sb_assistant_skills_v1',
    'sb_assistant_permission_v1',
  ],
  /** 记录时的习惯：图片存法、天气地点、悬浮球 */
  records: ['sb_image_quality', 'sb_weather_place', 'starburst.ball', 'starburst.ball.pos'],
  /** 更新通道 */
  update: ['sb_update_channel', 'sb_update_source'],
} as const

/** 白名单全集，顺序稳定（导出文件的键序稳定，diff 好看） */
export const PREF_KEYS: string[] = Object.values(PREF_GROUPS).flat()

/** 单个值的长度上限。技能说明最长也就几十 KB，1M 字符是「明显不对」的线 */
const MAX_VALUE_LENGTH = 1_000_000

/** 键 → 原始字符串。缺的键不出现（不是空串），导入时才能区分「没有」和「清空」 */
export type PrefSnapshot = Record<string, string>

function storage(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage
  } catch {
    // 隐私模式 / 无痕窗口访问 localStorage 会抛错，当作没有存储
    return null
  }
}

/** 导出：把白名单里当前有值的键原样抄一份 */
export function exportPrefs(): PrefSnapshot {
  const store = storage()
  if (!store) return {}
  const snapshot: PrefSnapshot = {}
  for (const key of PREF_KEYS) {
    const value = store.getItem(key)
    if (value !== null) snapshot[key] = value
  }
  return snapshot
}

/** 一份快照里有几项：备份分区上显示的条数 */
export function prefsCount(snapshot: PrefSnapshot | undefined): number {
  return Object.keys(snapshot ?? {}).length
}

/**
 * 读回一份快照：只留白名单键、只留字符串、超长的丢掉。
 *
 * 不在这里校验每一项的 JSON 形状——那是各模块自己 `load*` 的事，
 * 备份层多校验一遍只会两处打架。坏值写进去，下次读的时候会被各模块的
 * normalize 修掉或忽略，最坏结果是「这项回到默认」，不会让应用起不来。
 */
export function readPrefs(raw: unknown): PrefSnapshot {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {}
  const source = raw as Record<string, unknown>
  const snapshot: PrefSnapshot = {}
  for (const key of PREF_KEYS) {
    const value = source[key]
    if (typeof value !== 'string') continue
    if (value.length > MAX_VALUE_LENGTH) continue
    snapshot[key] = value
  }
  return snapshot
}

/**
 * 写回本机。
 *
 * - `merge`：文件里有哪几项就覆盖哪几项，文件里没有的键保持本机原样
 * - `replace`：先把白名单里的键整体清掉，再写文件里的——快照恢复要的是「和备份时一样」
 *
 * 返回实际写入的项数，报告里要报数。
 */
export function applyPrefs(snapshot: PrefSnapshot, mode: 'merge' | 'replace'): number {
  const store = storage()
  if (!store) return 0
  const entries = Object.entries(readPrefs(snapshot))
  try {
    if (mode === 'replace') {
      for (const key of PREF_KEYS) store.removeItem(key)
    }
    for (const [key, value] of entries) store.setItem(key, value)
  } catch {
    // 配额满了：能写进去几项算几项，别让整个导入流程失败
    return entries.filter(([key]) => store.getItem(key) !== null).length
  }
  return entries.length
}

/**
 * 这份快照里有没有明文密钥（AI 模型的 apiKey）。
 *
 * 导出确认框据此加一句「文件里有密钥」，导入时不必提示。
 * 解析失败就当没有——宁可少提示一句，也不要对着一份坏数据吓用户。
 */
export function prefsContainSecrets(snapshot: PrefSnapshot | undefined): boolean {
  const raw = snapshot?.sb_ai_models
  if (!raw) return false
  try {
    const list = JSON.parse(raw) as unknown
    if (!Array.isArray(list)) return false
    return list.some((item) => {
      if (!item || typeof item !== 'object') return false
      const key = (item as Record<string, unknown>).apiKey
      return typeof key === 'string' && key.trim() !== ''
    })
  } catch {
    return false
  }
}
