/**
 * 全局搜索：日记、随记、收支和健康记录一次搜出来。
 *
 * 关键词进 URL（`?q=`），点标签就是 `?q=%23标签`，所以搜过的页面能直接分享 / 收藏。
 * 输入停一下（300ms）才真去查：每敲一个字就整库扫一遍会卡。
 * 收支的分类库里只存 id，翻译在这里做——`categoryIdsFor` 把关键词换成分类 id 再交给存储层。
 */
import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { Link, useSearchParams } from 'react-router'
import type { SearchResults } from '@/core/db/store'
import { useLiveQuery } from '@/core/db/live'
import { emptySearchResults } from '@/core/search/match'
import { formatDate, formatMonthDay } from '@/core/utils/dateKey'
import { useI18n } from '@/shared/i18n/context'
import EmptyState from '@/shared/ui/EmptyState'
import TagEditor from '@/shared/ui/TagEditor'
import { Icon } from '@/shared/ui/icons'
import { searchRecords } from '@/features/diary/diaryRepo'
import { stripImageTokens } from '@/features/diary/imageTokens'
import { categoryIdsFor, categoryKey } from '@/features/finance/financeCategories'
import type { MessageKey } from '@/shared/i18n/messages/zh'

/** 卡片列表的统一外壳 */
const LIST =
  'm-0 flex list-none flex-col divide-y divide-line overflow-hidden rounded-2xl border border-line bg-surface p-0'

/** 卡片里的日期行 */
const META = 'text-[11px] text-muted'

/** 正文摘要：去掉图片标记、压掉换行，太长截断 */
function snippet(content: string) {
  const text = stripImageTokens(content).trim().replace(/\s+/g, ' ')
  return text.length > 140 ? text.slice(0, 140) + '…' : text
}

/** 一组里每条结果的统一形状：谁都能套进同一个渲染分支 */
interface Hit {
  key: string
  to: string
  meta?: string
  title?: string
  detail?: string
  trailing?: ReactNode
}

interface Section {
  key: string
  title: string
  hits: Hit[]
}

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

export default function SearchPage() {
  const { t, locale } = useI18n()
  const [params, setParams] = useSearchParams()
  // 关键词以地址栏为准：从别处带 q 进来、点标签跳进来，都自然跟上
  const keyword = params.get('q') ?? ''
  // 只有正在敲字时才有草稿；写进地址栏就交还给地址栏，避免两处状态各说各话
  const [draft, setDraft] = useState<string | null>(null)
  const text = draft ?? keyword

  // 输入停顿后才把关键词写进地址栏
  useEffect(() => {
    if (draft === null || draft === keyword) return
    const timer = window.setTimeout(() => {
      setParams(draft === '' ? {} : { q: draft }, { replace: true })
      setDraft(null)
    }, 300)
    return () => window.clearTimeout(timer)
  }, [draft, keyword, setParams])

  function apply(next: string) {
    setDraft(null)
    setParams(next === '' ? {} : { q: next }, { replace: true })
  }

  // 分类译名只有界面层拿得到，翻译成 id 再传下去
  const results = useLiveQuery(
    () => searchRecords(keyword, categoryIdsFor(keyword)),
    [keyword],
  )

  /** 点标签 = 只看这个标签 */
  function pickTag(tag: string) {
    apply('#' + tag)
  }

  function clear() {
    apply('')
  }

  const rows: SearchResults = results ?? emptySearchResults()

  function money(value: number) {
    return `${t('finance.currency')}${new Intl.NumberFormat(locale, {
      maximumFractionDigits: 2,
    }).format(value)}`
  }

  const sections: Section[] = []
  function add(key: string, title: MessageKey, hits: Hit[]) {
    if (hits.length > 0) sections.push({ key, title: t(title), hits })
  }

  add(
    'entries',
    'search.groupDiary',
    rows.entries.map((entry) => ({
      key: entry.id,
      to: `/diary/${entry.code}`,
      meta: `${formatDate(entry.dateKey, t)} · ${entry.code}`,
      title: snippet(entry.content) || t('diary.imageOnly'),
    })),
  )

  add(
    'stamps',
    'search.groupStamp',
    rows.stamps.map((stamp) => ({
      key: stamp.id,
      to: `/diary?date=${stamp.dateKey}`,
      meta: `${formatDate(stamp.dateKey, t)} · ${stamp.time}`,
      title: snippet(stamp.content) || t('diary.imageOnly'),
    })),
  )

  add(
    'finance',
    'search.groupFinance',
    rows.finance.map((item) => ({
      key: item.id,
      to: `/finance?month=${item.dateKey.slice(0, 7)}`,
      meta: `${formatMonthDay(item.dateKey, t)} · ${t(categoryKey(item.category))}`,
      title: item.name || t('finance.uncategorized'),
      detail: item.note ? snippet(item.note) : undefined,
      trailing: (
        <span
          className={`shrink-0 text-sm ${item.kind === 'income' ? 'text-success' : 'text-fg'}`}
        >
          {item.kind === 'income' ? '+' : '-'}
          {money(item.amount)}
        </span>
      ),
    })),
  )

  add(
    'sleeps',
    'search.groupSleep',
    rows.sleeps.map((item) => ({
      key: item.id,
      to: `/health/sleeps?date=${item.dateKey}`,
      meta: `${formatDate(item.dateKey, t)} · ${item.bedtime}–${item.wakeTime}`,
      title: item.note ? snippet(item.note) : undefined,
    })),
  )

  add(
    'intakes',
    'search.groupIntake',
    rows.intakes.map((item) => ({
      key: item.id,
      to: `/health/intakes?date=${item.dateKey}`,
      meta: `${formatMonthDay(item.dateKey, t)} · ${item.time}`,
      title: item.name,
      trailing: <span className="shrink-0 text-xs text-muted">{item.kcal} kcal</span>,
    })),
  )

  add(
    'trainings',
    'search.groupTraining',
    rows.trainings.map((item) => ({
      key: item.id,
      to: `/health/training?date=${item.dateKey}`,
      meta: `${formatDate(item.dateKey, t)} · ${item.time}`,
      title: item.title || item.exercises.map((exercise) => exercise.name).join(' / '),
      detail: item.note ? snippet(item.note) : undefined,
    })),
  )

  add(
    'schedules',
    'search.groupSchedule',
    rows.schedules.map((item) => ({
      key: item.id,
      to: `/schedule?date=${item.dateKey}`,
      meta: `${formatDate(item.dateKey, t)}${item.time ? ` · ${item.time}` : ''}`,
      title: item.title,
      detail: item.note ? snippet(item.note) : undefined,
    })),
  )

  add(
    'foods',
    'search.groupFood',
    rows.foods.map((item) => ({
      key: item.id,
      to: '/health/foods',
      meta: `${item.code} · ${item.kcal} kcal/100g`,
      title: item.name,
    })),
  )

  add(
    'meals',
    'search.groupMeal',
    rows.meals.map((item) => ({
      key: item.id,
      to: '/health/foods',
      title: item.name,
    })),
  )

  add(
    'presets',
    'search.groupPreset',
    rows.presets.map((item) => ({
      key: item.id,
      to: '/diary/presets',
      meta: item.code,
      title: item.name,
    })),
  )

  const total = sections.reduce((sum, section) => sum + section.hits.length, 0)

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
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key !== 'Enter') return
            event.preventDefault()
            apply(text)
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
        sections.map((section) => (
          <section key={section.key}>
            <Group title={section.title} count={section.hits.length} />
            <ul className={LIST}>
              {section.hits.map((hit) => (
                <li key={hit.key}>
                  <Link
                    to={hit.to}
                    className="flex items-center justify-between gap-3 px-3 py-2 transition-colors hover:bg-brand/5"
                  >
                    <div className="min-w-0">
                      {hit.meta && <div className={META}>{hit.meta}</div>}
                      {hit.title && (
                        <div className="mt-0.5 line-clamp-2 text-sm text-fg">{hit.title}</div>
                      )}
                      {hit.detail && (
                        <div className="mt-0.5 truncate text-xs text-muted">{hit.detail}</div>
                      )}
                    </div>
                    {hit.trailing}
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ))
      )}
    </div>
  )
}
