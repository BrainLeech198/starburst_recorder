/**
 * 全局搜索：日记、随记、收支、睡眠一次搜出来。
 *
 * 关键词进 URL（`?q=`），点标签就是 `?q=%23标签`，所以搜过的页面能直接分享 / 收藏。
 * 输入停一下（300ms）才真去查：每敲一个字就整库扫一遍会卡。
 */
import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router'
import type { SearchResults } from '@/core/db/store'
import { useLiveQuery } from '@/core/db/live'
import { formatDate, formatMonthDay } from '@/core/utils/dateKey'
import { useI18n } from '@/shared/i18n/context'
import EmptyState from '@/shared/ui/EmptyState'
import TagEditor from '@/shared/ui/TagEditor'
import { Icon } from '@/shared/ui/icons'
import { searchRecords } from '@/features/diary/diaryRepo'
import { stripImageTokens } from '@/features/diary/imageTokens'
import { categoryKey } from '@/features/finance/financeCategories'

/** 一组的标题：名称 + 条数，没有内容就整组不出现 */
function Group({ title, count }: { title: string; count: number }) {
  return (
    <h2 className="mb-2 mt-6 flex items-center gap-2 text-xs font-medium text-muted">
      <span>{title}</span>
      <span className="rounded-full bg-surface px-1.5 py-0.5 text-[11px] leading-none text-muted">
        {count}
      </span>
    </h2>
  )
}

/** 卡片列表的统一外壳 */
const LIST = 'm-0 flex list-none flex-col divide-y divide-line overflow-hidden rounded-2xl border border-line bg-surface p-0'

/** 卡片里的日期行 */
const META = 'text-[11px] text-muted'

/** 正文摘要：去掉图片标记、压掉换行，太长截断 */
function snippet(content: string) {
  const text = stripImageTokens(content).trim().replace(/\s+/g, ' ')
  return text.length > 140 ? text.slice(0, 140) + '…' : text
}

export default function SearchPage() {
  const { t, locale } = useI18n()
  const [params, setParams] = useSearchParams()
  // 关键词以地址栏为准：从别处带 q 进来、点标签跳进来，都自然跟上
  const keyword = params.get('q') ?? ''
  const [text, setText] = useState(keyword)

  // 输入停顿后才把关键词写进地址栏
  useEffect(() => {
    if (text === keyword) return
    const timer = window.setTimeout(() => {
      setParams(text === '' ? {} : { q: text }, { replace: true })
    }, 300)
    return () => window.clearTimeout(timer)
  }, [text, keyword, setParams])

  const results = useLiveQuery(() => searchRecords(keyword), [keyword])

  /** 点标签 = 只看这个标签 */
  function pickTag(tag: string) {
    const next = '#' + tag
    setText(next)
    setParams({ q: next }, { replace: true })
  }

  function clear() {
    setText('')
    setParams({}, { replace: true })
  }

  const rows: SearchResults = results ?? {
    entries: [],
    stamps: [],
    finance: [],
    sleeps: [],
    tags: [],
  }
  const total = rows.entries.length + rows.stamps.length + rows.finance.length + rows.sleeps.length

  function money(value: number) {
    return `${t('finance.currency')}${new Intl.NumberFormat(locale, {
      maximumFractionDigits: 2,
    }).format(value)}`
  }

  return (
    <div className="w-full p-4">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="m-0 flex items-center gap-1.5 text-lg font-medium text-fg">
          <Icon name="search" className="h-4 w-4 shrink-0" />
          {t('search.title')}
        </h1>
      </header>

      {/* 搜索框：回车 / 停顿后自动搜，右侧一键清空 */}
      <div className="mt-3 flex items-center gap-2 rounded-xl border border-line bg-surface px-3 py-2">
        <Icon name="search" className="h-4 w-4 shrink-0 text-muted" />
        <input
          value={text}
          onChange={(event) => setText(event.target.value)}
          onKeyDown={(event) => {
            if (event.key !== 'Enter') return
            event.preventDefault()
            setParams(text === '' ? {} : { q: text }, { replace: true })
          }}
          placeholder={t('search.placeholder')}
          className="min-w-0 flex-1 bg-transparent text-sm text-fg outline-none placeholder:text-muted"
        />
        {text !== '' && (
          <button
            type="button"
            onClick={clear}
            aria-label={t('tag.remove', { name: text })}
            className="shrink-0 text-muted transition-colors hover:text-fg"
          >
            <Icon name="close" className="h-4 w-4 shrink-0" />
          </button>
        )}
      </div>

      {/* 标签行：库里用到的标签按出现次数排，点一下就按它筛 */}
      {rows.tags.length > 0 && (
        <section className="mt-3">
          <div className="mb-1 text-[11px] text-muted">{t('tag.title')}</div>
          <TagEditor tags={rows.tags} onTagClick={pickTag} />
        </section>
      )}

      {keyword.trim() === '' ? (
        <div className="mt-6">
          <EmptyState icon="🔍" text={t('search.hint')} />
        </div>
      ) : total === 0 ? (
        <div className="mt-6">
          <EmptyState icon="🔍" text={t('search.empty')} />
        </div>
      ) : (
        <>
          {rows.entries.length > 0 && (
            <>
              <Group title={t('search.groupDiary')} count={rows.entries.length} />
              <ul className={LIST}>
                {rows.entries.map((entry) => (
                  <li key={entry.id}>
                    <Link
                      to={`/diary/${entry.code}`}
                      className="block px-3 py-2 transition-colors hover:bg-brand/5"
                    >
                      <div className={META}>
                        {formatDate(entry.dateKey, t)} · {entry.code}
                      </div>
                      <div className="mt-0.5 line-clamp-2 text-sm text-fg">
                        {snippet(entry.content) || t('diary.imageOnly')}
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            </>
          )}

          {rows.stamps.length > 0 && (
            <>
              <Group title={t('search.groupStamp')} count={rows.stamps.length} />
              <ul className={LIST}>
                {rows.stamps.map((stamp) => (
                  <li key={stamp.id}>
                    <Link
                      to={`/diary?date=${stamp.dateKey}`}
                      className="block px-3 py-2 transition-colors hover:bg-brand/5"
                    >
                      <div className={META}>
                        {formatDate(stamp.dateKey, t)} · {stamp.time}
                      </div>
                      <div className="mt-0.5 line-clamp-2 text-sm text-fg">
                        {snippet(stamp.content) || t('diary.imageOnly')}
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            </>
          )}

          {rows.finance.length > 0 && (
            <>
              <Group title={t('search.groupFinance')} count={rows.finance.length} />
              <ul className={LIST}>
                {rows.finance.map((item) => (
                  <li key={item.id}>
                    <Link
                      to={`/finance?month=${item.dateKey.slice(0, 7)}`}
                      className="flex items-center justify-between gap-3 px-3 py-2 transition-colors hover:bg-brand/5"
                    >
                      <div className="min-w-0">
                        <div className={META}>
                          {formatMonthDay(item.dateKey, t)} · {t(categoryKey(item.category))}
                        </div>
                        <div className="mt-0.5 truncate text-sm text-fg">
                          {item.name || t('finance.uncategorized')}
                          {item.note ? <span className="text-muted"> · {snippet(item.note)}</span> : null}
                        </div>
                      </div>
                      <span
                        className={`shrink-0 text-sm ${
                          item.kind === 'income' ? 'text-success' : 'text-fg'
                        }`}
                      >
                        {item.kind === 'income' ? '+' : '-'}
                        {money(item.amount)}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </>
          )}

          {rows.sleeps.length > 0 && (
            <>
              <Group title={t('search.groupSleep')} count={rows.sleeps.length} />
              <ul className={LIST}>
                {rows.sleeps.map((item) => (
                  <li key={item.id}>
                    <Link
                      to={`/health/sleeps?date=${item.dateKey}`}
                      className="block px-3 py-2 transition-colors hover:bg-brand/5"
                    >
                      <div className={META}>
                        {formatDate(item.dateKey, t)} · {item.bedtime}–{item.wakeTime}
                      </div>
                      {item.note && (
                        <div className="mt-0.5 line-clamp-2 text-sm text-fg">{snippet(item.note)}</div>
                      )}
                    </Link>
                  </li>
                ))}
              </ul>
            </>
          )}
        </>
      )}
    </div>
  )
}
