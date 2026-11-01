/**
 * 助手技能包。
 *
 * 技能只改「怎么想、按什么步骤做」，不会给模型多任何数据权限；
 * 内置技能随应用发布，官网技能是可下载的 JSON，存在本机、可随时移除。
 * 技能说明会拼进系统提示，或由模型通过 load_skill 按需读取。
 */
export interface AssistantSkill {
  id: string
  name: string
  description: string
  version: string
  author: string
  category: string
  instructions: string
  homepage?: string
  /** 内置技能不能移除，只能停用 */
  builtin: boolean
  enabled: boolean
}

export interface SkillCatalogEntry {
  id: string
  name: string
  description: string
  version: string
  author: string
  category: string
  url: string
}

const KEY = 'sb_assistant_skills_v1'
const MAX_SKILLS = 30
const MAX_INSTRUCTIONS = 12000

export const SKILLS_SITE_URL = 'https://brainleech198.github.io/starburst_recorder/skills.html'
const CATALOG_URL = 'https://brainleech198.github.io/starburst_recorder/skills/index.json'

/** 内置技能：开箱可用，停用后不再出现在提示里 */
export const BUILTIN_SKILLS: AssistantSkill[] = [
  {
    id: 'brainstorm',
    name: '头脑风暴',
    description: '先发散再收敛，把模糊的想法拆成能马上试的方向。',
    version: '1.0.0',
    author: '星芒',
    category: '思考',
    builtin: true,
    enabled: true,
    instructions: `你是头脑风暴主持人。步骤：
1. 用一句话复述目标和限制；关键信息缺失时先用 ask_user 问一个选择题。
2. 发散：给 8–12 个方向，短句，不评判，可以荒诞。
3. 收敛：按「价值 × 可行性」粗排，挑 3 个最值得试的，各写第一步。
4. 最后问用户想深挖哪一个，不要一次写成长文。`,
  },
  {
    id: 'weekly-review',
    name: '周复盘',
    description: '按最近七天记录，梳理发生了什么、卡在哪、下周做什么。',
    version: '1.0.0',
    author: '星芒',
    category: '复盘',
    builtin: true,
    enabled: true,
    instructions: `做一次最近 7 天的复盘。先用 query_day / search_diary / search_stamps / intake_stats / sleep_stats / finance_stats 查数据，再按「发生了什么、做得好的、卡住的、重复出现的模式、下周 3 件事」组织。每个结论都引用日期；没有数据就直说没有，不编。最后只给 3 条下周行动，越具体越好。`,
  },
  {
    id: 'sleep-coach',
    name: '睡眠教练',
    description: '看最近两周作息，找模式，给温和可执行的调整。',
    version: '1.0.0',
    author: '星芒',
    category: '健康',
    builtin: true,
    enabled: true,
    instructions: `你是睡眠教练。先查最近 14 天 sleep_stats 和当晚记录，描述作息、时长、质量与夜醒的模式；再给 2–3 条温和、可执行的小调整。不做医疗诊断，不承诺疗效；持续失眠或明显影响生活时建议就医。`,
  },
  {
    id: 'spending-review',
    name: '收支复盘',
    description: '按最近三十天收支找大项、异常和可以调整的地方。',
    version: '1.0.0',
    author: '星芒',
    category: '财务',
    builtin: true,
    enabled: true,
    instructions: `做一次最近 30 天的收支复盘。先查 finance_stats，按项目归并大项，指出最大支出、变化明显的项目和可能的异常；金额必须来自记录。最后给 2–3 条不指责、可执行的调整建议。`,
  },
  {
    id: 'diary-polish',
    name: '日记润色',
    description: '保留事实和原意，把一段流水账改得更顺。',
    version: '1.0.0',
    author: '星芒',
    category: '写作',
    builtin: true,
    enabled: true,
    instructions: `润色用户给的日记或随记：保留事实、时间、人物和原意，不添加没发生的事；先给润色版，再用一句话说明改了什么。用户没要求就保持原长度，不改成华丽的作文。`,
  },
]

interface SkillStore {
  installed: AssistantSkill[]
  enabled: Record<string, boolean>
}

function storage(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage
  } catch {
    return null
  }
}

function validId(id: string) {
  return /^[a-z0-9][a-z0-9-_]{1,40}$/.test(id)
}

function text(value: unknown, fallback = '') {
  return typeof value === 'string' ? value.trim() : fallback
}

/** 官网下载或从文件导入的技能都先过这一层，坏包直接拒绝 */
export function normalizeSkill(raw: unknown): AssistantSkill | null {
  if (!raw || typeof raw !== 'object') return null
  const item = raw as Record<string, unknown>
  const id = text(item.id)
  const name = text(item.name)
  const description = text(item.description)
  const instructions = text(item.instructions)
  if (!validId(id) || name === '' || description === '' || instructions === '') return null
  const homepage = text(item.homepage)
  return {
    id,
    name: name.slice(0, 60),
    description: description.slice(0, 240),
    version: text(item.version, '1.0.0').slice(0, 20),
    author: text(item.author, '未署名').slice(0, 60),
    category: text(item.category, '通用').slice(0, 30),
    instructions: instructions.slice(0, MAX_INSTRUCTIONS),
    ...(homepage.startsWith('https://') ? { homepage } : {}),
    builtin: false,
    enabled: true,
  }
}

function readStore(): SkillStore {
  const store = storage()
  if (!store) return { installed: [], enabled: {} }
  try {
    const raw = store.getItem(KEY)
    if (!raw) return { installed: [], enabled: {} }
    const parsed = JSON.parse(raw) as Record<string, unknown>
    const installed = Array.isArray(parsed.installed)
      ? parsed.installed
          .map(normalizeSkill)
          .filter((skill): skill is AssistantSkill => skill !== null)
          .slice(0, MAX_SKILLS)
      : []
    const enabled: Record<string, boolean> = {}
    if (parsed.enabled && typeof parsed.enabled === 'object') {
      for (const [id, value] of Object.entries(parsed.enabled as Record<string, unknown>)) {
        if (validId(id) && typeof value === 'boolean') enabled[id] = value
      }
    }
    return { installed, enabled }
  } catch {
    return { installed: [], enabled: {} }
  }
}

function writeStore(store: SkillStore) {
  const target = storage()
  if (!target) return
  try {
    target.setItem(KEY, JSON.stringify(store))
  } catch {
    // 配额满或隐私模式：这次装不上，不拦着用户继续用
  }
}

export function isBuiltinSkill(id: string) {
  return BUILTIN_SKILLS.some((skill) => skill.id === id)
}

/** 内置 + 已安装，enabled 由本机开关覆盖 */
export function loadSkills(): AssistantSkill[] {
  const store = readStore()
  return [
    ...BUILTIN_SKILLS.map((skill) => ({
      ...skill,
      enabled: store.enabled[skill.id] !== false,
    })),
    ...store.installed.map((skill) => ({
      ...skill,
      builtin: false,
      enabled: store.enabled[skill.id] !== false,
    })),
  ]
}

export function enabledSkills(skills: AssistantSkill[] = loadSkills()) {
  return skills.filter((skill) => skill.enabled)
}

export type InstallResult = 'installed' | 'updated' | 'builtin' | 'full'

export function installSkill(skill: AssistantSkill): InstallResult {
  if (isBuiltinSkill(skill.id)) return 'builtin'
  const store = readStore()
  const existing = store.installed.findIndex((item) => item.id === skill.id)
  if (existing >= 0) {
    store.installed[existing] = { ...skill, builtin: false, enabled: true }
  } else {
    if (store.installed.length >= MAX_SKILLS) return 'full'
    store.installed.push({ ...skill, builtin: false, enabled: true })
  }
  store.enabled[skill.id] = true
  writeStore(store)
  return existing >= 0 ? 'updated' : 'installed'
}

export function removeSkill(id: string) {
  if (isBuiltinSkill(id)) return
  const store = readStore()
  store.installed = store.installed.filter((skill) => skill.id !== id)
  delete store.enabled[id]
  writeStore(store)
}

export function setSkillEnabled(id: string, enabled: boolean) {
  const store = readStore()
  store.enabled[id] = enabled
  writeStore(store)
}

/** 提示里只放摘要，完整说明由 load_skill 按需读取，省 token */
export function skillPromptLines(skills: AssistantSkill[] = enabledSkills()) {
  return skills.map((skill) => `- ${skill.id}：${skill.name} —— ${skill.description}`)
}

export function findSkill(id: string, skills: AssistantSkill[] = loadSkills()) {
  return skills.find((skill) => skill.id === id && skill.enabled) ?? null
}

function resolveUrl(url: string) {
  try {
    return new URL(url, CATALOG_URL).toString()
  } catch {
    return ''
  }
}

/** 官网技能目录；拿不到就返回 null，页面自己说一句「检查网络」 */
export async function fetchSkillCatalog(): Promise<SkillCatalogEntry[] | null> {
  try {
    const response = await fetch(CATALOG_URL, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(8000),
    })
    if (!response.ok) return null
    const body = (await response.json()) as { skills?: unknown }
    if (!Array.isArray(body.skills)) return null
    return body.skills
      .map((raw): SkillCatalogEntry | null => {
        if (!raw || typeof raw !== 'object') return null
        const item = raw as Record<string, unknown>
        const id = text(item.id)
        const name = text(item.name)
        const description = text(item.description)
        const url = resolveUrl(text(item.url))
        if (!validId(id) || name === '' || description === '' || url === '') return null
        return {
          id,
          name,
          description,
          version: text(item.version, '1.0.0'),
          author: text(item.author, '未署名'),
          category: text(item.category, '通用'),
          url,
        }
      })
      .filter((entry): entry is SkillCatalogEntry => entry !== null)
  } catch {
    return null
  }
}

/** 下载一个技能文件并校验；内容坏了就当失败 */
export async function downloadSkill(entry: SkillCatalogEntry): Promise<AssistantSkill | null> {
  try {
    const response = await fetch(entry.url, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(10000),
    })
    if (!response.ok) return null
    return normalizeSkill(await response.json())
  } catch {
    return null
  }
}
