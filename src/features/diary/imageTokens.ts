/**
 * 日记正文里的图片标记：`[[img:ULID]]`。
 *
 * 正文仍然是纯文本——存库、备份、搜索、AI 都不用改形状；只有渲染和插入时
 * 才把标记翻译成图片。编辑态看到的是一串标记，阅读态看到的是真图。
 *
 * 纯函数集中在这里，Node 单测能直接 import（不碰 IndexedDB、不碰 canvas）。
 */

/** 标记的识别式：id 是 ULID（0-9A-Z），留出 _ - 以防以后换 id 生成方式 */
const TOKEN = /\[\[img:([0-9A-Za-z_-]+)\]\]/g

/** 正文切成「文字段」与「图片段」，渲染时按顺序摆 */
export type ContentPart = { type: 'text'; value: string } | { type: 'image'; id: string }

export function imageToken(id: string): string {
  return `[[img:${id}]]`
}

/**
 * 插入图片标记：每个 id 单独占一行，前后缺换行就补上。
 * 图片按块渲染，单独一行读起来最自然，也不会把一句话劈成两半。
 */
export function insertImageTokens(
  text: string,
  caret: number,
  ids: string[],
): { text: string; caret: number } {
  if (ids.length === 0) return { text, caret }
  const at = Math.min(Math.max(caret, 0), text.length)
  const block = ids.map(imageToken).join('\n')
  const lead = at > 0 && text[at - 1] !== '\n' ? '\n' : ''
  const tail = at < text.length && text[at] !== '\n' ? '\n' : ''
  const insertion = `${lead}${block}${tail}`
  return {
    text: text.slice(0, at) + insertion + text.slice(at),
    caret: at + insertion.length,
  }
}

/** 按顺序切开正文；空文字段丢掉，免得渲染出一堆空节点 */
export function splitImageTokens(text: string): ContentPart[] {
  const parts: ContentPart[] = []
  let last = 0
  TOKEN.lastIndex = 0
  let match: RegExpExecArray | null
  while ((match = TOKEN.exec(text)) !== null) {
    if (match.index > last) parts.push({ type: 'text', value: text.slice(last, match.index) })
    parts.push({ type: 'image', id: match[1] })
    last = match.index + match[0].length
  }
  if (last < text.length) parts.push({ type: 'text', value: text.slice(last) })
  return parts
}

/** 正文里引用到的图片 id：渲染时认这些，剩下的算「没插进正文」 */
export function usedImageIds(text: string): string[] {
  const ids = new Set<string>()
  TOKEN.lastIndex = 0
  let match: RegExpExecArray | null
  while ((match = TOKEN.exec(text)) !== null) ids.add(match[1])
  return [...ids]
}

/**
 * 去掉标记后的纯文字：导出、AI 润色、列表预览都只该看见字。
 * 顺手收拾标记留下的空行，别在导出文件里留下三五行的空白。
 */
export function stripImageTokens(text: string): string {
  return text
    .replace(TOKEN, '')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}
