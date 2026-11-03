/**
 * 助手回答的 Markdown 渲染：块级结构由 markdown.ts 解析，这里只负责变成 React 节点。
 * 不用 dangerouslySetInnerHTML，模型返回的任何 HTML 都按普通文字显示。
 */
import { useMemo, useState } from 'react'
import { useI18n } from '@/shared/i18n/context'
import { copyTextToClipboard } from '@/platform/clipboard'
import { parseInline, parseMarkdown, type InlineToken } from './markdown'

function Inline({ tokens }: { tokens: InlineToken[] }) {
  return (
    <>
      {tokens.map((token, index) => {
        if (token.type === 'code') {
          return (
            <code
              key={index}
              className="rounded bg-surface-2 px-1 py-0.5 font-mono text-[0.85em] text-fg"
            >
              {token.text}
            </code>
          )
        }
        if (token.type === 'strong') {
          return (
            <strong key={index} className="font-semibold text-fg">
              {token.text}
            </strong>
          )
        }
        if (token.type === 'em') return <em key={index}>{token.text}</em>
        if (token.type === 'del') return <del key={index}>{token.text}</del>
        if (token.type === 'link') {
          return token.href ? (
            <a
              key={index}
              href={token.href}
              target="_blank"
              rel="noreferrer noopener"
              className="break-all text-brand underline-offset-2 hover:underline"
            >
              {token.text}
            </a>
          ) : (
            <span key={index}>{token.text}</span>
          )
        }
        return <span key={index}>{token.text}</span>
      })}
    </>
  )
}

function CodeBlock({ lang, code }: { lang: string; code: string }) {
  const { t } = useI18n()
  const [copied, setCopied] = useState(false)

  async function copy() {
    try {
      const ok = await copyTextToClipboard(code)
      setCopied(ok)
      if (ok) window.setTimeout(() => setCopied(false), 1500)
    } catch {
      setCopied(false)
    }
  }

  return (
    <div className="overflow-hidden rounded-xl border border-line bg-surface-2">
      <div className="flex items-center gap-2 border-b border-line px-3 py-1.5 text-[10px] text-muted">
        <span className="min-w-0 flex-1 truncate font-mono">{lang || 'text'}</span>
        <button
          type="button"
          onClick={() => void copy()}
          className="inline-flex min-h-9 shrink-0 items-center px-1 text-muted transition-colors hover:text-brand md:min-h-0"
        >
          {copied ? t('assistant.copied') : t('assistant.copy')}
        </button>
      </div>
      <pre className="m-0 overflow-x-auto p-3 text-[12px] leading-relaxed">
        <code className="font-mono">{code}</code>
      </pre>
    </div>
  )
}

export default function AssistantMarkdown({ text }: { text: string }) {
  const blocks = useMemo(() => parseMarkdown(text), [text])

  return (
    <div className="space-y-2 break-words text-sm leading-relaxed">
      {blocks.map((block, index) => {
        if (block.type === 'heading') {
          const className =
            block.level === 1
              ? 'm-0 text-base font-semibold text-fg'
              : block.level === 2
                ? 'm-0 text-[15px] font-semibold text-fg'
                : 'm-0 text-sm font-medium text-fg'
          return (
            <p key={index} className={className}>
              <Inline tokens={parseInline(block.text)} />
            </p>
          )
        }
        if (block.type === 'paragraph') {
          return (
            <p key={index} className="m-0 whitespace-pre-wrap">
              <Inline tokens={parseInline(block.text)} />
            </p>
          )
        }
        if (block.type === 'code') {
          return <CodeBlock key={index} lang={block.lang} code={block.code} />
        }
        if (block.type === 'quote') {
          return (
            <blockquote
              key={index}
              className="m-0 border-l-2 border-brand/40 pl-3 text-muted"
            >
              <p className="m-0 whitespace-pre-wrap">
                <Inline tokens={parseInline(block.text)} />
              </p>
            </blockquote>
          )
        }
        if (block.type === 'divider') {
          return <hr key={index} className="my-3 border-0 border-t border-line" />
        }
        if (block.type === 'list') {
          const items = block.items.map((item, at) => (
            <li key={at} className="marker:text-brand">
              <Inline tokens={parseInline(item)} />
            </li>
          ))
          return block.ordered ? (
            <ol key={index} className="my-1 list-decimal space-y-1 pl-5">
              {items}
            </ol>
          ) : (
            <ul key={index} className="my-1 list-disc space-y-1 pl-5">
              {items}
            </ul>
          )
        }
        return (
          <div key={index} className="overflow-x-auto">
            <table className="w-full border-collapse text-[12px]">
              <thead>
                <tr>
                  {block.header.map((cell, at) => (
                    <th
                      key={at}
                      className="border border-line bg-surface-2 px-2 py-1 text-left font-medium"
                    >
                      <Inline tokens={parseInline(cell)} />
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {block.rows.map((row, at) => (
                  <tr key={at}>
                    {row.map((cell, cellAt) => (
                      <td key={cellAt} className="border border-line px-2 py-1 align-top">
                        <Inline tokens={parseInline(cell)} />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      })}
    </div>
  )
}
