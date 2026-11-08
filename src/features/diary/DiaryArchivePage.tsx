/**
 * 全部记录：日记与随记混在一起，按日期倒序。
 *
 * 2026-11-02 改（用户提的「全部列表」）：
 *   - 加筛子：全部 / 日记 / 随记，各自带条数。原来只有一锅粥，找随记得翻着数
 *   - 筛子与页码进 URL（`?kind=stamp&page=2`），于是从这儿点开一条、返回回来还在原来的筛子
 *     和页上——配合 shared/ui/backNav.ts 的真栈返回，才算真的「回原处」
 *   - 页头右上角放回收站入口：删掉的东西原来只能从日记首页绕进去
 *   - 日期改用本地化写法（11月2日），不再直接甩 `2026-11-02`
 *   - 只有一页时不摆翻页条：两个按钮都点不动，白占一行
 *
 * 筛子与页码怎么判（脏 URL、越界页码）全在 `archiveQuery.ts`，那边有单测；
 * 这里只负责取数与渲染，别再往页面里塞第二套判据。
 *
 * 点开一条的落点：日记进编辑页（`/diary/:code`），随记回日记页并切到那一天。
 * 两者都带 `state.fromArchive`，日记页据此在日期栏左侧亮出「返回全部记录」。
 */
import { useMemo } from 'react'
import { Link, useSearchParams } from 'react-router'
import { useLiveQuery } from '@/core/db/live'
import { useI18n } from '@/shared/i18n/context'
import PageHeader from '@/shared/ui/PageHeader'
import Page from '@/shared/ui/Page'
import Tab from '@/shared/ui/Tab'
import EmptyState from '@/shared/ui/EmptyState'
import { Icon } from '@/shared/ui/icons'
import { SOLID_SMALL_BUTTON } from '@/shared/ui/buttonStyles'
import { formatDate } from '@/core/utils/dateKey'
import { briefEntries, briefStamps } from './diaryRepo'
import { stripImageTokens } from './imageTokens'
import {
  ARCHIVE_KINDS,
  clampPage,
  kindFrom,
  pageCount,
  pageFrom,
  queryOf,
  slicePage,
} from './archiveQuery'
import type { ArchiveKind } from './archiveQuery'

export default function DiaryArchivePage() {
  const { t } = useI18n()
  const [params, setParams] = useSearchParams()
  // 筛子与页码的判据都在 archiveQuery.ts：URL 是用户能改的，脏数据在那儿兜
  const kind = kindFrom(params.get('kind'))
  const page = pageFrom(params.get('page'))

  const entries = useLiveQuery(briefEntries, [])
  const stamps = useLiveQuery(briefStamps, [])

  const records = useMemo(() => {
    if (!entries || !stamps) return undefined
    return [
      ...entries
        .filter((entry) => entry.deletedAt === null)
        .map((entry) => ({
          id: `diary:${entry.id}`,
          dateKey: entry.dateKey,
          time: '',
          kind: 'diary' as const,
          label:
            stripImageTokens(entry.content).trim() ||
            (entry.imageCount > 0 ? t('diary.imageOnly') : t('diary.emptyContent')),
          href: `/diary/${entry.code}`,
        })),
      ...stamps
        .filter((stamp) => stamp.deletedAt === null)
        .map((stamp) => ({
          id: `stamp:${stamp.id}`,
          dateKey: stamp.dateKey,
          time: stamp.time,
          kind: 'stamp' as const,
          label:
            stamp.content.trim() ||
            (stamp.imageCount > 0 ? t('diary.imageOnly') : t('diary.emptyContent')),
          href: `/diary?date=${stamp.dateKey}&mode=stamp`,
        })),
    ].sort(
      (a, b) =>
        b.dateKey.localeCompare(a.dateKey) ||
        b.time.localeCompare(a.time) ||
        b.id.localeCompare(a.id),
    )
  }, [entries, stamps, t])

  const counts = useMemo(
    () => ({
      all: records?.length ?? 0,
      diary: records?.filter((record) => record.kind === 'diary').length ?? 0,
      stamp: records?.filter((record) => record.kind === 'stamp').length ?? 0,
    }),
    [records],
  )

  const filtered = useMemo(
    () => (records ?? []).filter((record) => kind === 'all' || record.kind === kind),
    [records, kind],
  )
  const totalPages = pageCount(filtered.length)
  // 筛子换了之后页码可能越界（原来第 5 页，切到只有 1 页的筛子）
  const safePage = clampPage(page, filtered.length)
  const visible = slicePage(filtered, safePage)

  /** 换筛子：回到第一页，用 replace 免得在历史里堆一串筛选状态 */
  function pickKind(next: ArchiveKind) {
    setParams(queryOf(next, 0), { replace: true })
  }

  function goPage(next: number) {
    setParams(queryOf(kind, next), { replace: true })
  }

  // 顺序与可选值以 archiveQuery 的 ARCHIVE_KINDS 为准，别在这儿另排一份
  const TAB_LABELS: Record<ArchiveKind, string> = {
    all: t('diary.filterAll'),
    diary: t('diary.tabDiary'),
    stamp: t('diary.tabStamp'),
  }
  const tabs = ARCHIVE_KINDS.map((key) => ({ key, label: TAB_LABELS[key] }))

  return (
    <Page>
      <PageHeader
        title={t('diary.allRecords')}
        backTo="/diary"
        backLabel={t('diary.tabDiary')}
        actions={
          <Link to="/diary/trash" className={SOLID_SMALL_BUTTON}>
            <Icon name="trash" className="mr-1 h-3.5 w-3.5 shrink-0" />
            {t('diary.trash')}
          </Link>
        }
      />

      {/* 筛子：日记 / 随记混排时最常用的两个切面，条数直接挂在标签后面 */}
      <nav role="tablist" className="mt-3 flex flex-wrap items-center gap-1">
        {tabs.map((tab) => (
          <Tab key={tab.key} active={kind === tab.key} onClick={() => pickKind(tab.key)}>
            {tab.label}
            <span className="ml-1 text-[11px] tabular-nums opacity-70">{counts[tab.key]}</span>
          </Tab>
        ))}
      </nav>

      {records === undefined ? (
        <p className="mt-6 text-center text-sm text-muted">{t('diary.reading')}</p>
      ) : filtered.length === 0 ? (
        <div className="mt-4">
          <EmptyState icon="🗂️" text={t('diary.noAllRecords')} />
        </div>
      ) : (
        <>
          <p className="mt-2 text-xs tabular-nums text-muted">
            {/* 只有一页时不提页码：下面没有翻页条，说「第 1/1 页」只会让人找 */}
            {totalPages > 1
              ? t('diary.archiveCount', {
                  count: filtered.length,
                  page: safePage + 1,
                  pages: totalPages,
                })
              : t('diary.archiveTotal', { count: filtered.length })}
          </p>
          <ul className="mt-3 list-none space-y-2 p-0">
            {visible.map((record) => (
              <li key={record.id}>
                <Link
                  to={record.href}
                  state={{ fromArchive: true }}
                  className="block rounded-xl border border-line bg-surface p-3 transition-colors hover:bg-surface-2"
                >
                  <span className="flex items-center justify-between gap-2 text-[11px] text-muted">
                    <span
                      className={`shrink-0 rounded px-1.5 py-0.5 leading-none ${
                        record.kind === 'diary'
                          ? 'bg-brand/15 text-brand'
                          : 'bg-warning/15 text-warning'
                      }`}
                    >
                      {record.kind === 'diary' ? t('diary.tabDiary') : t('diary.tabStamp')}
                    </span>
                    <span className="shrink-0 tabular-nums">
                      {formatDate(record.dateKey, t)}
                      {record.time ? ` ${record.time}` : ''}
                    </span>
                  </span>
                  <span className="mt-1.5 block line-clamp-2 text-sm text-fg">{record.label}</span>
                </Link>
              </li>
            ))}
          </ul>
          {/* 只有一页时不摆翻页条：两个按钮都点不动，白占一行 */}
          {totalPages > 1 && (
            <nav className="mt-4 flex items-center justify-between" aria-label={t('diary.pagination')}>
              <button
                type="button"
                disabled={safePage === 0}
                onClick={() => goPage(safePage - 1)}
                className="rounded-lg border border-line px-3 py-2 text-sm disabled:opacity-40"
              >
                {t('diary.previousPage')}
              </button>
              <span className="text-xs tabular-nums text-muted">
                {t('diary.pageOf', { page: safePage + 1, pages: totalPages })}
              </span>
              <button
                type="button"
                disabled={safePage + 1 >= totalPages}
                onClick={() => goPage(safePage + 1)}
                className="rounded-lg border border-line px-3 py-2 text-sm disabled:opacity-40"
              >
                {t('diary.nextPage')}
              </button>
            </nav>
          )}
        </>
      )}
    </Page>
  )
}
