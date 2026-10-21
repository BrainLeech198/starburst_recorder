/**
 * 「数据与备份」页：导出全部、从备份恢复、看到数据落在哪儿。
 *
 * 单独开一页而不是塞进设置页：这三件事都是全局的数据管理，不属于任何单个功能模块，
 * 以后要加「清空数据」「导入旧笔记」也有地方放。
 */
import { useEffect, useRef, useState } from 'react'
import type { ChangeEvent } from 'react'
import { useLiveQuery } from '@/core/db/live'
import { useToast } from '@/app/providers/ToastProvider'
import { useI18n } from '@/shared/i18n/context'
import ConfirmDialog from '@/shared/ui/ConfirmDialog'
import SettingCard, { SettingBadge, SettingGroup } from '@/shared/ui/SettingCard'
import PageShell from '@/shared/ui/PageShell'
import { OUTLINE_BUTTON } from '@/shared/ui/buttonStyles'
import { desktopBridge } from '@/platform/desktop'
import type { DesktopBridge } from '@/platform/desktop'
import { db } from '@/core/db/db'
import { buildBackup, readBackup } from '@/features/diary/diaryBackup'
import type { BackupPayload } from '@/features/diary/diaryBackup'
import { describeSave, saveTextFile } from '@/platform/saveFile'
import { everyDay, everyEntry, everyStamp, importBackup, totals } from '@/features/diary/diaryRepo'
import type { ImportStats } from '@/features/diary/diaryRepo'

/** 选好但还没确认的一份备份 */
interface Pending {
  name: string
  payload: BackupPayload
  skipped: number
}

/** 导入之后要给用户看的账 */
interface Report {
  stats: ImportStats
  skipped: number
}

/** 「数据在哪」：只有桌面程序里有这一块 */
function DataFolderCard() {
  // 桌面壳的预加载脚本会注入它，浏览器里是 undefined
  const bridge: DesktopBridge | undefined = desktopBridge()
  const { t } = useI18n()
  const [folder, setFolder] = useState('')
  const [dbFile, setDbFile] = useState('')
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    if (!bridge) return
    void bridge.dataPath().then((value) => setFolder(value ?? ''))
    void bridge.db.path().then((value) => setDbFile(value ?? ''))
  }, [bridge])

  if (!bridge) return null
  // 收成一个非 undefined 的常量：闭包里 TS 不认上面那句 if 的判断
  const shell = bridge

  return (
    <SettingCard
      title={t('data.folderTitle')}
      description={t('data.folderDesc')}
      badge={<SettingBadge>{t('data.desktop')}</SettingBadge>}
    >
      <SettingGroup label={t('data.folderGroup')}>
        <p className="text-xs text-muted">{t('data.dataDir')}</p>
        <p className="font-mono text-xs break-all text-fg">{folder || t('data.reading')}</p>
        <p className="mt-2 text-xs text-muted">{t('data.dbFile')}</p>
        <p className="font-mono text-xs break-all text-fg">{dbFile || t('data.reading')}</p>
        <button
          type="button"
          onClick={() => {
            void shell.openDataFolder().then((ok) => setFailed(!ok))
          }}
          className={`${OUTLINE_BUTTON} mt-2`}
        >
          {t('data.openFolder')}
        </button>
        {failed && <p className="mt-2 text-xs text-danger">{t('data.openFolderFailed')}</p>}
      </SettingGroup>

      <SettingGroup label={t('data.moveGroup')}>
        <p className="text-xs text-muted">{t('data.moveHint')}</p>
      </SettingGroup>
    </SettingCard>
  )
}

/** 旧版 IndexedDB 数据搬过来说过「已搬」的标记：搬完就别再天天提示 */
const LEGACY_FLAG = 'sb_legacy_migrated'

/**
 * 「旧版数据」：桌面从 IndexedDB 换到 SQLite 之后，老数据还在 Chromium 的
 * IndexedDB 里，界面上已经读不到它了。这里给一条手动搬过来的路——
 * 不自动迁移：用户没点确认就一个字也不写。
 */
function LegacyCard() {
  const bridge = desktopBridge()
  const { showToast } = useToast()
  const { t } = useI18n()
  const [legacy, setLegacy] = useState<{ entries: number; stamps: number; days: number } | null>(
    null,
  )
  const [migrated, setMigrated] = useState(() => localStorage.getItem(LEGACY_FLAG) === '1')
  const [confirming, setConfirming] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!bridge) return
    void Promise.all([db.diaryEntries.count(), db.diaryStamps.count(), db.diaryDays.count()])
      .then(([entries, stamps, days]) => setLegacy({ entries, stamps, days }))
      .catch(() => setLegacy(null))
  }, [bridge])

  // 浏览器里没桥、老数据是当前正在用的数据，都不该出现这张卡
  if (!bridge || !legacy || migrated) return null
  // 老库本来就是空的：没什么可搬的
  if (legacy.entries + legacy.stamps + legacy.days === 0) return null

  async function handleMigrate() {
    setConfirming(false)
    setBusy(true)
    setError('')
    try {
      const [entries, stamps, days] = await Promise.all([
        db.diaryEntries.toArray(),
        db.diaryStamps.toArray(),
        db.diaryDays.toArray(),
      ])
      const stats = await importBackup({ entries, stamps, days })
      localStorage.setItem(LEGACY_FLAG, '1')
      setMigrated(true)
      showToast({
        message: t('data.migrateDone', {
          entries: stats.entries.total,
          stamps: stats.stamps.total,
          days: stats.days.total,
        }),
      })
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught))
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <SettingCard
        title={t('data.legacyTitle')}
        description={t('data.legacyDesc')}
        badge={<SettingBadge tone="bad">{t('data.legacyBadge')}</SettingBadge>}
      >
        <SettingGroup label={t('data.legacyGroup')}>
          <p className="text-xs text-fg">
            {t('data.legacyCount', {
              entries: legacy.entries,
              stamps: legacy.stamps,
              days: legacy.days,
            })}
          </p>
          <button
            type="button"
            disabled={busy}
            onClick={() => setConfirming(true)}
            className={`${OUTLINE_BUTTON} mt-2`}
          >
            {busy ? t('data.migrating') : t('data.migrate')}
          </button>
          <p className="mt-2 text-xs text-muted">{t('data.migrateHint')}</p>
          {error !== '' && (
            <p className="mt-2 rounded-lg border border-danger px-3 py-2 text-xs text-danger">
              {error}
            </p>
          )}
        </SettingGroup>
      </SettingCard>

      {confirming && (
        <ConfirmDialog
          title={t('data.migrateConfirmTitle')}
          description={t('data.migrateConfirmBody', {
            entries: legacy.entries,
            stamps: legacy.stamps,
            days: legacy.days,
          })}
          confirmLabel={t('data.migrateConfirm')}
          tone="brand"
          onConfirm={() => void handleMigrate()}
          onCancel={() => setConfirming(false)}
        />
      )}
    </>
  )
}

export default function DataPage() {
  const { showToast } = useToast()
  const { t } = useI18n()
  const fileRef = useRef<HTMLInputElement>(null)
  const counts = useLiveQuery(() => totals(), [])
  const [pending, setPending] = useState<Pending | null>(null)
  const [report, setReport] = useState<Report | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function handleExportAll() {
    setError('')
    setReport(null)
    const [entries, stamps, days] = await Promise.all([everyEntry(), everyStamp(), everyDay()])
    const file = buildBackup({ entries, stamps, days })
    // 安卓上这一步会把文件交给系统分享面板，用户不点保存就什么都没留下，
    // 所以提示条要按实际结果说话（见 describeSave）
    const outcome = await saveTextFile(file)
    showToast({
      message: describeSave(
        outcome,
        t('data.savedAll', {
          entries: entries.length,
          stamps: stamps.length,
          days: days.length,
        }),
        t,
      ),
    })
  }

  /** 选完文件先读一遍、校验一遍，再让用户确认——不确认就一个字都不写进数据库 */
  async function handlePick(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    // 把 value 清掉，这样同一个文件再选一次也会触发
    event.target.value = ''
    if (!file) return
    setError('')
    setReport(null)
    const result = readBackup(await file.text())
    if (!result.ok) {
      setError(result.error)
      return
    }
    setPending({ name: file.name, payload: result.payload, skipped: result.skipped })
  }

  async function handleConfirmImport() {
    if (!pending) return
    const target = pending
    setPending(null)
    setBusy(true)
    const stats = await importBackup(target.payload)
    setBusy(false)
    setReport({ stats, skipped: target.skipped })
  }

  const added = (part: { total: number; overwritten: number }) => part.total - part.overwritten

  return (
    <PageShell title={t('data.title')} description={t('data.description')}>
      <SettingCard
        title={t('data.backupTitle')}
        description={t('data.backupDesc')}
        badge={
          <SettingBadge>
            {t('settings.dataCount', { entries: counts?.entries ?? 0, stamps: counts?.stamps ?? 0 })}
          </SettingBadge>
        }
      >
        <SettingGroup label={t('data.exportGroup')}>
          <button type="button" onClick={() => void handleExportAll()} className={OUTLINE_BUTTON}>
            {t('data.export')}
          </button>
          <p className="mt-2 text-xs text-muted">{t('data.exportHint')}</p>
        </SettingGroup>
      </SettingCard>

      <SettingCard
        title={t('data.restoreTitle')}
        description={t('data.restoreDesc')}
        badge={<SettingBadge>{t('data.mergeBadge')}</SettingBadge>}
      >
        <SettingGroup label={t('data.pickGroup')}>
          <input
            ref={fileRef}
            type="file"
            accept=".json,application/json"
            onChange={(event) => void handlePick(event)}
            className="hidden"
          />
          <button
            type="button"
            disabled={busy}
            onClick={() => fileRef.current?.click()}
            className={OUTLINE_BUTTON}
          >
            {busy ? t('data.importing') : t('data.pickFile')}
          </button>
          <p className="mt-2 text-xs text-muted">{t('data.pickHint')}</p>

          {error !== '' && (
            <p className="mt-2 rounded-lg border border-danger px-3 py-2 text-xs text-danger">
              {error}
            </p>
          )}

          {report && (
            <div className="mt-2 rounded-lg border border-line bg-surface-2 px-3 py-2 text-xs">
              <div className="text-fg">{t('data.importDone')}</div>
              <ul className="mt-1 space-y-0.5 text-muted">
                <li>
                  {t('data.importEntries', {
                    added: added(report.stats.entries),
                    overwritten: report.stats.entries.overwritten,
                  })}
                </li>
                <li>
                  {t('data.importStamps', {
                    added: added(report.stats.stamps),
                    overwritten: report.stats.stamps.overwritten,
                  })}
                </li>
                <li>
                  {t('data.importDays', {
                    added: added(report.stats.days),
                    overwritten: report.stats.days.overwritten,
                  })}
                </li>
                {report.skipped > 0 && (
                  <li className="text-danger">{t('data.importSkipped', { count: report.skipped })}</li>
                )}
              </ul>
            </div>
          )}
        </SettingGroup>
      </SettingCard>

      <DataFolderCard />
      <LegacyCard />

      {pending && (
        <ConfirmDialog
          title={t('data.confirmImportTitle')}
          description={`${t('data.confirmImportBody', {
            name: pending.name,
            entries: pending.payload.entries.length,
            stamps: pending.payload.stamps.length,
            days: pending.payload.days.length,
          })}${
            pending.skipped > 0 ? t('data.confirmImportSkip', { count: pending.skipped }) : ''
          }`}
          confirmLabel={t('data.import')}
          tone="brand"
          onConfirm={() => void handleConfirmImport()}
          onCancel={() => setPending(null)}
        />
      )}
    </PageShell>
  )
}
