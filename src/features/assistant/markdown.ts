/**
 * 助手回答用的轻量 Markdown 解析。
 *
 * 只认常见的几种块（标题、列表、代码块、引用、表格、分隔线）与行内样式；
 * 不用 innerHTML，渲染时全部走 React 节点，链接只放行 http(s) 与 mailto。
 */

export type MarkdownBlock =
  | { type: 'heading'; level: 1 | 2 | 3; text: string }
  | { type: 'paragraph'; text: string }
  | { type: 'code'; lang: string; code: string }
  | { type: 'list'; ordered: boolean; items: string[] }
  | { type: 'quote'; text: string }
  | { type: 'divider' }
  | { type: 'table'; header: string[]; rows: string[][] }

export type InlineToken =
  | { type: 'text'; text: string }
  | { type: 'code'; text: string }
  | { type: 'strong'; text: string }
  | { type: 'em'; text: string }
  | { type: 'del'; text: string }
  | { type: 'link'; text: string; href?: string }

const SAFE_URL = /^(https?:\/\/|mailto:)/i

/** 只放行明确安全的协议；其他（javascript:、data:）只保留文字 */
export function safeHref(raw: string): string | undefined {
  const value = raw.trim()
  return SAFE_URL.test(value) ? value : undefined
}

const INLINE =
  /(`[^`]+`)|(\*\*[^*]+\*\*)|(~~[^~]+~~)|(\*[^*\n]+\*)|(_[^_\n]+_)|(\[[^\]]+\]\([^)\s]+\))/g

export function parseInline(text: string): InlineToken[] {
  const tokens: InlineToken[] = []
  let last = 0
  for (const match of text.matchAll(INLINE)) {
    const index = match.index ?? 0
    if (index > last) tokens.push({ type: 'text', text: text.slice(last, index) })
    const raw = match[0]
    if (raw.startsWith('`')) {
      tokens.push({ type: 'code', text: raw.slice(1, -1) })
    } else if (raw.startsWith('**')) {
      tokens.push({ type: 'strong', text: raw.slice(2, -2) })
    } else if (raw.startsWith('~~')) {
      tokens.push({ type: 'del', text: raw.slice(2, -2) })
    } else if (raw.startsWith('[')) {
      const close = raw.lastIndexOf('](')
      const label = raw.slice(1, close)
      const href = safeHref(raw.slice(close + 2, -1))
      tokens.push({ type: 'link', text: label, ...(href ? { href } : {}) })
    } else if (raw.startsWith('_')) {
      tokens.push({ type: 'em', text: raw.slice(1, -1) })
    } else {
      tokens.push({ type: 'em', text: raw.slice(1, -1) })
    }
    last = index + raw.length
  }
  if (last < text.length) tokens.push({ type: 'text', text: text.slice(last) })
  return tokens
}

function isDivider(line: string) {
  return /^\s*(-{3,}|\*{3,}|_{3,})\s*$/.test(line)
}

function splitRow(line: string): string[] {
  let body = line.trim()
  if (body.startsWith('|')) body = body.slice(1)
  if (body.endsWith('|')) body = body.slice(0, -1)
  return body.split('|').map((cell) => cell.trim())
}

function isTableSeparator(line: string) {
  return /^\s*\|?[\s:|-]+\|[\s:|-]*$/.test(line) && line.includes('-')
}

export function parseMarkdown(source: string): MarkdownBlock[] {
  const lines = source.replace(/\r\n?/g, '\n').split('\n')
  const blocks: MarkdownBlock[] = []
  let paragraph: string[] = []

  function flushParagraph() {
    if (paragraph.length === 0) return
    blocks.push({ type: 'paragraph', text: paragraph.join('\n') })
    paragraph = []
  }

  for (let index = 0; index < lines.length; index++) {
    const line = lines[index]

    if (line.trim() === '') {
      flushParagraph()
      continue
    }

    const fence = /^\s*```([^\s`]*)\s*$/.exec(line)
    if (fence) {
      flushParagraph()
      const lang = fence[1] ?? ''
      const code: string[] = []
      index++
      while (index < lines.length && !/^\s*```\s*$/.test(lines[index])) {
        code.push(lines[index])
        index++
      }
      blocks.push({ type: 'code', lang, code: code.join('\n') })
      continue
    }

    const heading = /^(#{1,3})\s+(.+)$/.exec(line)
    if (heading) {
      flushParagraph()
      blocks.push({
        type: 'heading',
        level: heading[1].length as 1 | 2 | 3,
        text: heading[2].trim(),
      })
      continue
    }

    if (isDivider(line)) {
      flushParagraph()
      blocks.push({ type: 'divider' })
      continue
    }

    if (/^\s*>\s?/.test(line)) {
      flushParagraph()
      const quote: string[] = []
      while (index < lines.length && /^\s*>\s?/.test(lines[index])) {
        quote.push(lines[index].replace(/^\s*>\s?/, ''))
        index++
      }
      index--
      blocks.push({ type: 'quote', text: quote.join('\n') })
      continue
    }

    const list = /^\s*([-*+]|\d+\.)\s+(.+)$/.exec(line)
    if (list) {
      flushParagraph()
      const ordered = /\d+\./.test(list[1])
      const items: string[] = []
      while (index < lines.length) {
        const item = /^\s*([-*+]|\d+\.)\s+(.+)$/.exec(lines[index])
        if (!item || /\d+\./.test(item[1]) !== ordered) break
        items.push(item[2])
        index++
      }
      index--
      blocks.push({ type: 'list', ordered, items })
      continue
    }

    if (line.includes('|') && index + 1 < lines.length && isTableSeparator(lines[index + 1])) {
      flushParagraph()
      const header = splitRow(line)
      const rows: string[][] = []
      index += 2
      while (index < lines.length && lines[index].includes('|') && lines[index].trim() !== '') {
        rows.push(splitRow(lines[index]))
        index++
      }
      index--
      blocks.push({ type: 'table', header, rows })
      continue
    }

    paragraph.push(line)
  }

  flushParagraph()
  return blocks
}
