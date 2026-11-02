import { useMemo, useState } from 'react'
import { Link } from 'react-router'
import { useLiveQuery } from '@/core/db/live'
import { useI18n } from '@/shared/i18n/context'
import PageHeader from '@/shared/ui/PageHeader'
import Page from '@/shared/ui/Page'
import { everyEntry, everyStamp } from './diaryRepo'
import { stripImageTokens } from './imageTokens'

const PAGE_SIZE = 20

export default function DiaryArchivePage() {
  const { t } = useI18n()
  const [page, setPage] = useState(0)
  const entries = useLiveQuery(everyEntry, [])
  const stamps = useLiveQuery(everyStamp, [])
  const records = useMemo(() => {
    if (!entries || !stamps) return undefined
    return [
      ...entries.filter((entry) => entry.deletedAt === null).map((entry) => ({
        id: `diary:${entry.id}`,
        dateKey: entry.dateKey,
        time: '',
        kind: 'diary' as const,
        label: stripImageTokens(entry.content).trim() || (entry.images.length ? t('diary.imageOnly') : t('diary.emptyContent')),
        href: `/diary/${entry.code}`,
      })),
      ...stamps.filter((stamp) => stamp.deletedAt === null).map((stamp) => ({
        id: `stamp:${stamp.id}`,
        dateKey: stamp.dateKey,
        time: stamp.time,
        kind: 'stamp' as const,
        label: stamp.content.trim() || (stamp.images.length ? t('diary.imageOnly') : t('diary.emptyContent')),
        href: `/diary?date=${stamp.dateKey}&mode=stamp`,
      })),
    ].sort((a, b) => b.dateKey.localeCompare(a.dateKey) || b.time.localeCompare(a.time) || b.id.localeCompare(a.id))
  }, [entries, stamps, t])

  const totalPages = records ? Math.max(1, Math.ceil(records.length / PAGE_SIZE)) : 1
  const visible = records?.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE)

  return (
    <Page>
      <PageHeader title={t('diary.allRecords')} backTo="/diary" />
      {records === undefined ? (
        <p className="mt-6 text-center text-sm text-muted">{t('diary.reading')}</p>
      ) : records.length === 0 ? (
        <p className="mt-6 text-center text-sm text-muted">{t('diary.noAllRecords')}</p>
      ) : (
        <>
          <p className="mt-2 text-xs text-muted">{t('diary.archiveCount', { count: records.length, page: page + 1, pages: totalPages })}</p>
          <ul className="mt-3 space-y-2">
            {visible?.map((record) => (
              <li key={record.id}>
                <Link to={record.href} className="block rounded-xl border border-line bg-surface p-3 transition-colors hover:bg-surface-2">
                  <span className="flex items-center justify-between gap-2 text-xs text-muted">
                    <span>{record.kind === 'diary' ? t('diary.tabDiary') : t('diary.tabStamp')}</span>
                    <span>{record.dateKey}{record.time ? ` · ${record.time}` : ''}</span>
                  </span>
                  <span className="mt-1 block line-clamp-2 text-sm text-fg">{record.label}</span>
                </Link>
              </li>
            ))}
          </ul>
          <nav className="mt-4 flex items-center justify-between" aria-label={t('diary.pagination')}>
            <button type="button" disabled={page === 0} onClick={() => setPage((current) => Math.max(0, current - 1))} className="rounded-lg border border-line px-3 py-2 text-sm disabled:opacity-40">{t('diary.previousPage')}</button>
            <span className="text-xs text-muted">{t('diary.pageOf', { page: page + 1, pages: totalPages })}</span>
            <button type="button" disabled={page + 1 >= totalPages} onClick={() => setPage((current) => Math.min(totalPages - 1, current + 1))} className="rounded-lg border border-line px-3 py-2 text-sm disabled:opacity-40">{t('diary.nextPage')}</button>
          </nav>
        </>
      )}
    </Page>
  )
}
