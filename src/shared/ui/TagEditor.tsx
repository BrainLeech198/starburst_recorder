/**
 * 标签条：只读时是一排小 chip，可编辑时后面多一个输入框。
 *
 * 规则与存储层保持一套（`normalize.ts` 的 `cleanTags`）：去空白、去重、每个 ≤20 字、最多 12 个。
 * 只读的 chip 若给了 `onTagClick`，点一下就走「按这个标签筛选」，搜索页的标签行也复用它。
 */
import { useState } from 'react'
import { useI18n } from '@/shared/i18n/context'
import { cleanTags, MAX_TAGS } from '@/core/db/normalize'

const CHIP =
  'inline-flex max-w-full items-center gap-1 rounded-full border border-line bg-surface px-2 py-0.5 text-[11px] leading-5 text-muted'

export default function TagEditor({
  tags,
  onChange,
  onTagClick,
  className = '',
}: {
  tags: string[]
  /** 传了就可编辑；不传就是只读展示 */
  onChange?: (tags: string[]) => void
  /** 只读时点 chip 的动作，比如跳到按该标签筛选 */
  onTagClick?: (tag: string) => void
  className?: string
}) {
  const { t } = useI18n()
  const [draft, setDraft] = useState('')
  const editable = typeof onChange === 'function'
  const full = tags.length >= MAX_TAGS

  /** 把输入框里的内容并进来；空输入或重复标签就当没发生 */
  function commit() {
    if (!onChange || draft.trim() === '') return
    const next = cleanTags([...tags, draft])
    setDraft('')
    if (next.length !== tags.length) onChange(next)
  }

  function remove(tag: string) {
    onChange?.(tags.filter((item) => item !== tag))
  }

  return (
    <div className={`flex flex-col gap-1.5 ${className}`}>
      {editable && (
        <input
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onBlur={commit}
          onKeyDown={(event) => {
            // 回车或逗号都算「加一个」；空框里按退格删掉最后一个，符合常见输入习惯
            if (event.key === 'Enter' || event.key === ',') {
              event.preventDefault()
              commit()
            } else if (event.key === 'Backspace' && draft === '' && tags.length > 0) {
              event.preventDefault()
              remove(tags[tags.length - 1])
            }
          }}
          disabled={full}
          placeholder={full ? t('tag.limit', { max: MAX_TAGS }) : t('tag.addPlaceholder')}
          className="w-full rounded-lg border border-line bg-surface px-2 py-1 text-xs text-fg outline-none transition-colors placeholder:text-muted focus:border-brand disabled:opacity-50"
        />
      )}
      {tags.length > 0 && (
        <ul className="m-0 flex list-none flex-wrap gap-1 p-0">
          {tags.map((tag) => (
            <li key={tag} className={CHIP}>
              {editable || !onTagClick ? (
                <span className="truncate">{tag}</span>
              ) : (
                <button
                  type="button"
                  onClick={() => onTagClick(tag)}
                  className="truncate transition-colors hover:text-brand"
                >
                  {tag}
                </button>
              )}
              {editable && (
                <button
                  type="button"
                  aria-label={t('tag.remove', { name: tag })}
                  onClick={() => remove(tag)}
                  className="shrink-0 text-muted transition-colors hover:text-danger"
                >
                  ×
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      {editable && tags.length === 0 && <span className="text-[11px] text-muted">{t('tag.none')}</span>}
    </div>
  )
}
