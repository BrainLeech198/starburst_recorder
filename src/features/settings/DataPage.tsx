/**
 * 「数据与备份」页：导出、从备份恢复、看到数据落在哪儿。
 *
 * 单独开一页而不是塞进设置页：这三件事都是全局的数据管理，不属于任何单个功能模块，
 * 以后要加「清空数据」「导入旧笔记」也有地方放。
 *
 * 备份从 v2 起分块：导出时先勾选要带走的块（日记 / 健康 / 经济），
 * 导入时也先问要合并哪些块——只写勾选的块，没勾的一个字都不动。
 */
import ErrorNote from '@/shared/ui/ErrorNote'
import { useEffect, useRef, useState } from 'react'
import type { ChangeEvent } from 'react'
import { useLiveQuery } from '@/core/db/live'
import { useToast } from '@/app/providers/ToastProvider'
import { useI18n } from '@/shared/i18n/context'
import type { I18nValue } from '@/shared/i18n/context'
import ConfirmDialog from '@/shared/ui/ConfirmDialog'
import Modal from '@/shared/ui/Modal'
import SettingCard, { SettingBadge, SettingGroup } from '@/shared/ui/SettingCard'
import PageShell from '@/shared/ui/PageShell'
import { OUTLINE_BUTTON, SOLID_BUTTON, SOLID_DANGER, SOLID_WARN } from '@/shared/ui/buttonStyles'
import { desktopBridge } from '@/platform/desktop'
import type { DesktopBridge } from '@/platform/desktop'
import { db } from '@/core/db/db'
import {
  ALL_SECTIONS,
  buildBackup,
  onlySections,
  readBackup,
  sectionSize,
  sectionsOf,
} from '@/features/diary/diaryBackup'
import type { BackupPayload, BackupSection } from '@/features/diary/diaryBackup'
import { describeSave, saveTextFile } from '@/platform/saveFile'
import {
  clearDiaryData,
  clearFinanceData,
  clearHealthData,
  exportAllData,
  importBackup,
  importSections,
  replaceSections,
  totals,
  trashDiaryData,
  trashFinanceData,
  trashHealthData,
} from '@/features/diary/diaryRepo'
import type { BackupData, BackupSections, ImportStats, SectionCount } from '@/features/diary/diaryRepo'
import ConflictDialog from '@/features/diary/ConflictDialog'
import {
  duplicateFoodNames,
  findConflicts,
  findHealthConflicts,
  pickHealth,
  pickIncoming,
} from '@/features/diary/diaryMerge'
import type { HealthPart, MergeConflict } from '@/features/diary/diaryMerge'

/** 导入方式：融合只补/更新，替换则先把选中的块清空再恢复 */
type ImportMode = 'merge' | 'replace'

/** 选好但还没确认的一份备份 */
interface Pending {
  name: string
  payload: BackupPayload
  skipped: number
  mode: ImportMode
  /** 文件里实际有内容的块 */
  present: BackupSection[]
  /** 用户勾选要导入的块 */
  selected: Set<BackupSection>
  /** 和本地对不上的日记条目，非空时先让用户逐条抉择 */
  conflicts: MergeConflict[]
  /** 用户选了「保留本地」的冲突项，导入时从备份里剔掉 */
  keepLocal: Set<string>
  /** 健康块这次要导入的内容；冲突由用户在弹窗里逐条选，导入时再按选择剔除 */
  health: HealthPart | null
  /** 同名不同 id 的食物：会各留一条，确认页提示一下 */
  duplicates: string[]
  stage: 'range' | 'conflict' | 'confirm'
}

/** 导入之后要给用户看的账 */
interface Report {
  stats: ImportStats
  skipped: number
  mode: ImportMode
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
        {failed && <ErrorNote>{t('data.openFolderFailed')}</ErrorNote>}
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
      const [entries, stamps, days, presets] = await Promise.all([
        db.diaryEntries.toArray(),
        db.diaryStamps.toArray(),
        db.diaryDays.toArray(),
        db.diaryPresets.toArray(),
      ])
      const stats = await importBackup({ entries, stamps, days, presets })
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

/** 一块数据的勾选项：左边方框，右边名字 + 数量 */
function SectionPicker({
  title,
  description,
  payload,
  selected,
  onToggle,
  onCancel,
  onConfirm,
  confirmLabel,
  hint,
}: {
  title: string
  description: string
  payload: BackupPayload
  selected: Set<BackupSection>
  onToggle: (section: BackupSection) => void
  onCancel: () => void
  onConfirm: () => void
  confirmLabel: string
  hint?: string
}) {
  const { t } = useI18n()
  const rows: { section: BackupSection; label: string; detail: string }[] = [
    {
      section: 'diary',
      label: t('data.sectionDiary'),
      detail: t('data.sectionDiaryDetail', {
        entries: payload.entries.length,
        stamps: payload.stamps.length,
        days: payload.days.length,
        presets: payload.presets.length,
      }),
    },
    {
      section: 'health',
      label: t('data.sectionHealth'),
      detail: t('data.sectionHealthDetail', {
        foods: payload.foods.length,
        meals: payload.meals.length,
        intakes: payload.intakes.length,
        profile: payload.profile ? t('data.sectionProfileYes') : t('data.sectionProfileNo'),
      }),
    },
    {
      section: 'finance',
      label: t('data.sectionFinance'),
      detail: t('data.sectionFinanceDetail', { count: payload.finance.length }),
    },
  ]

  return (
    <Modal
      size="sm"
      label={title}
      onClose={onCancel}
    >
      <p className="m-0 text-sm text-fg">{title}</p>
      <p className="m-0 mt-1 text-xs text-muted">{description}</p>

      <div className="mt-3 space-y-2">
        {rows.map((row) => {
          const empty = sectionSize(payload, row.section) === 0
          const checked = selected.has(row.section)
          return (
            <button
              key={row.section}
              type="button"
              role="checkbox"
              aria-checked={checked && !empty}
              disabled={empty}
              onClick={() => onToggle(row.section)}
              className={`flex w-full items-start gap-2 rounded-lg border p-2 text-left transition-colors ${
                empty
                  ? 'cursor-not-allowed border-line opacity-45'
                  : checked
                    ? 'border-brand bg-brand/10'
                    : 'border-line hover:border-brand/60'
              }`}
            >
              <span
                className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded border text-[10px] leading-none ${
                  checked && !empty ? 'border-brand bg-brand text-on-brand' : 'border-muted'
                }`}
              >
                {checked && !empty ? '✓' : ''}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm text-fg">{row.label}</span>
                <span className="block text-xs leading-snug text-muted">
                  {empty ? t('data.sectionEmpty') : row.detail}
                </span>
              </span>
            </button>
          )
        })}
      </div>

      {hint && <p className="m-0 mt-2 text-xs text-danger">{hint}</p>}

      <div className="mt-3 flex gap-2">
        <button type="button" onClick={onCancel} className={`${OUTLINE_BUTTON} flex-1`}>
          {t('common.cancel')}
        </button>
        <button
          type="button"
          disabled={selected.size === 0}
          onClick={onConfirm}
          className={`${SOLID_BUTTON} flex-1`}
        >
          {confirmLabel}
        </button>
      </div>
    </Modal>
  )
}

/** 备份里各块分别有多少东西，确认框里一句话说清 */
function describePayload(
  payload: BackupPayload,
  selected: Set<BackupSection>,
  t: I18nValue['t'],
) {
  const parts: string[] = []
  if (selected.has('diary')) {
    parts.push(
      t('data.sectionDiaryDetail', {
        entries: payload.entries.length,
        stamps: payload.stamps.length,
        days: payload.days.length,
        presets: payload.presets.length,
      }),
    )
  }
  if (selected.has('health')) {
    parts.push(
      t('data.sectionHealthDetail', {
        foods: payload.foods.length,
        meals: payload.meals.length,
        intakes: payload.intakes.length,
        profile: payload.profile ? t('data.sectionProfileYes') : t('data.sectionProfileNo'),
      }),
    )
  }
  if (selected.has('finance')) {
    parts.push(t('data.sectionFinanceDetail', { count: payload.finance.length }))
  }
  return parts.join('；')
}

export default function DataPage() {
  const { showToast } = useToast()
  const { t } = useI18n()
  const fileRef = useRef<HTMLInputElement>(null)
  /** 点的是「融合」还是「替换」；文件选择框是同一个，用 ref 带过去 */
  const pickModeRef = useRef<ImportMode>('merge')
  const counts = useLiveQuery(() => totals(), [])
  const [exportData, setExportData] = useState<BackupData | null>(null)
  const [exportSelected, setExportSelected] = useState<Set<BackupSection>>(new Set(ALL_SECTIONS))
  const [pending, setPending] = useState<Pending | null>(null)
  const [report, setReport] = useState<Report | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  /** 正在确认清空哪一块；safe 为 true 表示只放进回收站 */
  const [clearing, setClearing] = useState<{ section: BackupSection; safe: boolean } | null>(null)

  const CLEAR_LABEL: Record<BackupSection, string> = {
    diary: t('data.clearDiary'),
    health: t('data.clearHealth'),
    finance: t('data.clearFinance'),
  }
  const SAFE_CLEAR_LABEL: Record<BackupSection, string> = {
    diary: t('data.safeClearDiary'),
    health: t('data.safeClearHealth'),
    finance: t('data.safeClearFinance'),
  }
  const MODULE_LABEL: Record<BackupSection, string> = {
    diary: t('data.moduleDiary'),
    health: t('data.moduleHealth'),
    finance: t('data.moduleFinance'),
  }

  function asPayload(data: BackupData): BackupPayload {
    return data
  }

  function toggleIn(set: Set<BackupSection>, section: BackupSection) {
    const next = new Set(set)
    if (next.has(section)) next.delete(section)
    else next.add(section)
    return next
  }

  async function handleExportStart() {
    setError('')
    setReport(null)
    setBusy(true)
    try {
      const data = await exportAllData()
      setExportData(data)
      setExportSelected(new Set(sectionsOf(asPayload(data))))
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught))
    } finally {
      setBusy(false)
    }
  }

  async function handleExportConfirm() {
    if (!exportData || exportSelected.size === 0) return
    const sections = ALL_SECTIONS.filter((section) => exportSelected.has(section))
    const file = buildBackup(asPayload(exportData), '备份', sections)
    setExportData(null)
    // 安卓上这一步会把文件交给系统分享面板，用户不点保存就什么都没留下，
    // 所以提示条要按实际结果说话（见 describeSave）
    const outcome = await saveTextFile(file)
    showToast({
      message: describeSave(
        outcome,
        t('data.savedSections', { detail: describePayload(asPayload(exportData), exportSelected, t) }),
        t,
      ),
    })
  }

  /** 一键清空某一块：先弹确认；safe 只软删进回收站，否则物理删除 */
  async function handleClearConfirm() {
    if (!clearing) return
    const { section, safe } = clearing
    setClearing(null)
    setBusy(true)
    setError('')
    setReport(null)
    try {
      if (safe) {
        if (section === 'diary') await trashDiaryData()
        else if (section === 'health') await trashHealthData()
        else await trashFinanceData()
      } else if (section === 'diary') await clearDiaryData()
      else if (section === 'health') await clearHealthData()
      else await clearFinanceData()
      showToast({
        message: t(safe ? 'data.safeClearDone' : 'data.clearDone', {
          module: MODULE_LABEL[section],
        }),
      })
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught))
    } finally {
      setBusy(false)
    }
  }

  /** 选完文件先读一遍、校验一遍，再让用户勾选要导哪几块——不确认就一个字都不写进数据库 */
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

    setPending({
      name: file.name,
      payload: result.payload,
      skipped: result.skipped,
      mode: pickModeRef.current,
      present: result.sections,
      selected: new Set(result.sections),
      conflicts: [],
      keepLocal: new Set(),
      health: null,
      duplicates: [],
      stage: 'range',
    })
  }

  /** 勾选完要先把勾选的块和本地比一遍，冲突在这一步逐条列出来；替换模式直接进确认 */
  async function handleRangeConfirm() {
    if (!pending || pending.selected.size === 0) return
    const target = pending
    const selected = target.selected

    // 替换等于快照恢复：选中的块整体重来，不需要逐条比冲突
    if (target.mode === 'replace') {
      setPending({ ...target, conflicts: [], health: null, duplicates: [], stage: 'confirm' })
      return
    }

    setBusy(true)
    setError('')
    try {
      const local = await exportAllData()
      const scoped = onlySections(target.payload, ALL_SECTIONS.filter((s) => selected.has(s)))
      const localPayload = asPayload(local)
      const localHealth: HealthPart = {
        profile: local.profile,
        foods: local.foods,
        meals: local.meals,
        intakes: local.intakes,
      }

      const conflicts: MergeConflict[] = []
      if (selected.has('diary')) conflicts.push(...findConflicts(scoped, localPayload))

      let health: HealthPart | null = null
      if (selected.has('health')) {
        health = {
          profile: scoped.profile,
          foods: scoped.foods,
          meals: scoped.meals,
          intakes: scoped.intakes,
        }
        conflicts.push(...findHealthConflicts(health, localHealth))
      }

      setPending({
        ...target,
        conflicts,
        health,
        duplicates: health ? duplicateFoodNames(health, localHealth) : [],
        stage: conflicts.length > 0 ? 'conflict' : 'confirm',
      })
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught))
    } finally {
      setBusy(false)
    }
  }

  async function handleConfirmImport() {
    if (!pending) return
    const target = pending
    setPending(null)
    setBusy(true)
    setError('')
    try {
      const sections: BackupSections = {}
      if (target.mode === 'replace') {
        // 替换模式整块重来：备份里有什么就写什么，不剔除任何一条
        if (target.selected.has('diary')) {
          sections.diary = {
            entries: target.payload.entries,
            stamps: target.payload.stamps,
            days: target.payload.days,
            presets: target.payload.presets,
          }
        }
        if (target.selected.has('health')) {
          sections.health = {
            profile: target.payload.profile,
            foods: target.payload.foods,
            meals: target.payload.meals,
            intakes: target.payload.intakes,
          }
        }
        if (target.selected.has('finance')) {
          sections.finance = { entries: target.payload.finance }
        }
      } else {
        if (target.selected.has('diary')) {
          const incoming = pickIncoming(target.payload, target.keepLocal)
          sections.diary = {
            entries: incoming.entries,
            stamps: incoming.stamps,
            days: incoming.days,
            presets: incoming.presets,
          }
        }
        if (target.selected.has('health') && target.health) {
          sections.health = pickHealth(target.health, target.keepLocal)
        }
        if (target.selected.has('finance')) {
          sections.finance = { entries: onlySections(target.payload, ['finance']).finance }
        }
      }

      // 导入会覆盖一部分内容，先把即将被覆盖的块原样存一份快照，出事还能滚回来。
      // 对应的块本地本来就是空的，就没什么可保护的，跳过。
      const local = await exportAllData()
      const snapshot = onlySections(
        local,
        ALL_SECTIONS.filter((section) => target.selected.has(section)),
      )
      const hasLocal = ALL_SECTIONS.some((section) => sectionSize(snapshot, section) > 0)
      if (hasLocal) {
        const outcome = await saveTextFile(buildBackup(snapshot, '导入前快照', [...target.selected]))
        // 快照没存下来就别导了：用户选了「要备份」，这个前提没满足
        if (outcome.kind === 'canceled') {
          setError(t('data.snapshotCanceled'))
          return
        }
      }

      const stats =
        target.mode === 'replace'
          ? await replaceSections(sections)
          : await importSections(sections)
      setReport({ stats, skipped: target.skipped, mode: target.mode })
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught))
    } finally {
      setBusy(false)
    }
  }

  const added = (part: SectionCount) => part.total - part.overwritten

  const reportSections = (() => {
    if (!report) return [] as { key: string; text: string }[]
    const rows: { key: string; text: string }[] = []
    const stats = report.stats
    if (stats.entries.total + stats.stamps.total + stats.days.total + stats.presets.total > 0) {
      rows.push(
        { key: 'entries', text: t('data.importEntries', { added: added(stats.entries), overwritten: stats.entries.overwritten }) },
        { key: 'stamps', text: t('data.importStamps', { added: added(stats.stamps), overwritten: stats.stamps.overwritten }) },
        { key: 'days', text: t('data.importDays', { added: added(stats.days), overwritten: stats.days.overwritten }) },
        { key: 'presets', text: t('data.importPresets', { added: added(stats.presets), overwritten: stats.presets.overwritten }) },
      )
    }
    if (stats.profile.total > 0) {
      rows.push({
        key: 'profile',
        text:
          report.mode === 'replace'
            ? t('data.replaceProfile')
            : t('data.importProfile', { overwritten: stats.profile.overwritten }),
      })
    }
    if (stats.foods.total + stats.meals.total + stats.intakes.total > 0) {
      rows.push(
        { key: 'foods', text: t('data.importFoods', { added: added(stats.foods), overwritten: stats.foods.overwritten }) },
        { key: 'meals', text: t('data.importMeals', { added: added(stats.meals), overwritten: stats.meals.overwritten }) },
        { key: 'intakes', text: t('data.importIntakes', { added: added(stats.intakes), overwritten: stats.intakes.overwritten }) },
      )
    }
    if (stats.finance.total > 0) {
      rows.push({
        key: 'finance',
        text: t('data.importFinance', { added: added(stats.finance), overwritten: stats.finance.overwritten }),
      })
    }
    return rows
  })()

  const confirmDescription = pending
    ? pending.mode === 'replace'
      ? `${t('data.replaceConfirmDesc', {
          name: pending.name,
          detail: describePayload(pending.payload, pending.selected, t),
        })}${pending.skipped > 0 ? t('data.confirmImportSkip', { count: pending.skipped }) : ''}`
      : `${t('data.confirmImportSelected', {
          name: pending.name,
          detail: describePayload(pending.payload, pending.selected, t),
        })}${pending.skipped > 0 ? t('data.confirmImportSkip', { count: pending.skipped }) : ''}${
          pending.keepLocal.size > 0
            ? t('data.confirmKeepLocal', { count: pending.keepLocal.size })
            : ''
        }${
          pending.duplicates.length > 0
            ? t('data.duplicateFoods', {
                count: pending.duplicates.length,
                names: pending.duplicates.slice(0, 5).join('、'),
              })
            : ''
        }`
    : ''

  return (
    <PageShell title={t('data.title')} description={t('data.description')}>
      <SettingCard title={t('data.statsTitle')} description={t('data.statsDesc')}>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
          {[
            { key: 'entries', label: t('data.statEntries'), value: counts?.entries ?? 0 },
            { key: 'stamps', label: t('data.statStamps'), value: counts?.stamps ?? 0 },
            { key: 'foods', label: t('data.statFoods'), value: counts?.foods ?? 0 },
            { key: 'meals', label: t('data.statMeals'), value: counts?.meals ?? 0 },
            { key: 'intakes', label: t('data.statIntakes'), value: counts?.intakes ?? 0 },
          ].map((stat) => (
            <div
              key={stat.key}
              className="rounded-xl border border-line bg-surface-2 px-3 py-2 text-center"
            >
              <p className="m-0 text-lg font-medium tabular-nums text-fg">{stat.value}</p>
              <p className="m-0 mt-0.5 text-[11px] text-muted">{stat.label}</p>
            </div>
          ))}
        </div>
      </SettingCard>

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
          <button
            type="button"
            disabled={busy}
            onClick={() => void handleExportStart()}
            className={OUTLINE_BUTTON}
          >
            {busy ? t('data.reading') : t('data.export')}
          </button>
          <p className="mt-2 text-xs text-muted">{t('data.exportHint')}</p>
        </SettingGroup>
      </SettingCard>

      <SettingCard
        title={t('data.restoreTitle')}
        description={t('data.restoreDesc')}
        badge={<SettingBadge>{t('data.restoreBadge')}</SettingBadge>}
      >
        <SettingGroup label={t('data.pickGroup')}>
          <input
            ref={fileRef}
            type="file"
            accept=".json,application/json"
            onChange={(event) => void handlePick(event)}
            className="hidden"
          />
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={() => {
                pickModeRef.current = 'merge'
                fileRef.current?.click()
              }}
              className={OUTLINE_BUTTON}
            >
              {t('data.importMerge')}
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => {
                pickModeRef.current = 'replace'
                fileRef.current?.click()
              }}
              className={SOLID_DANGER}
            >
              {t('data.importReplace')}
            </button>
          </div>
          <p className="mt-2 text-xs text-muted">{t('data.pickHint')}</p>

          {error !== '' && (
            <p className="mt-2 rounded-lg border border-danger px-3 py-2 text-xs text-danger">
              {error}
            </p>
          )}

          {report && (
            <div className="mt-2 rounded-lg border border-line bg-surface-2 px-3 py-2 text-xs">
              <div className="text-fg">
                {t(report.mode === 'replace' ? 'data.replaceDone' : 'data.importDone')}
              </div>
              <ul className="mt-1 space-y-0.5 text-muted">
                {reportSections.map((row) => (
                  <li key={row.key}>{row.text}</li>
                ))}
                {report.skipped > 0 && (
                  <li className="text-danger">{t('data.importSkipped', { count: report.skipped })}</li>
                )}
              </ul>
            </div>
          )}
        </SettingGroup>
      </SettingCard>

      <SettingCard
        title={t('data.clearTitle')}
        description={t('data.clearDesc')}
        badge={<SettingBadge tone="bad">{t('data.clearBadge')}</SettingBadge>}
      >
        <SettingGroup label={t('data.clearSafeGroup')}>
          <div className="flex flex-wrap gap-2">
            {(['diary', 'health', 'finance'] as BackupSection[]).map((section) => (
              <button
                key={section}
                type="button"
                disabled={busy}
                onClick={() => setClearing({ section, safe: true })}
                className={`${SOLID_WARN} disabled:opacity-40`}
              >
                {SAFE_CLEAR_LABEL[section]}
              </button>
            ))}
          </div>
          <p className="mt-2 text-xs text-muted">{t('data.clearSafeHint')}</p>
        </SettingGroup>

        <SettingGroup label={t('data.clearGroup')}>
          <div className="flex flex-wrap gap-2">
            {(['diary', 'health', 'finance'] as BackupSection[]).map((section) => (
              <button
                key={section}
                type="button"
                disabled={busy}
                onClick={() => setClearing({ section, safe: false })}
                className={`${SOLID_DANGER} disabled:opacity-40`}
              >
                {CLEAR_LABEL[section]}
              </button>
            ))}
          </div>
          <p className="mt-2 text-xs text-muted">{t('data.clearHint')}</p>
        </SettingGroup>
      </SettingCard>

      <DataFolderCard />
      <LegacyCard />

      {clearing && (
        <ConfirmDialog
          tone={clearing.safe ? 'warn' : 'danger'}
          title={t(clearing.safe ? 'data.safeClearConfirmTitle' : 'data.clearConfirmTitle', {
            module: MODULE_LABEL[clearing.section],
          })}
          description={t(clearing.safe ? 'data.safeClearConfirmBody' : 'data.clearConfirmBody')}
          confirmLabel={t(clearing.safe ? 'data.safeClearConfirm' : 'data.clearConfirm')}
          onConfirm={() => void handleClearConfirm()}
          onCancel={() => setClearing(null)}
        />
      )}

      {exportData && (
        <SectionPicker
          title={t('data.exportRangeTitle')}
          description={t('data.exportRangeDesc')}
          payload={exportData}
          selected={exportSelected}
          onToggle={(section) => setExportSelected(toggleIn(exportSelected, section))}
          onCancel={() => setExportData(null)}
          onConfirm={() => void handleExportConfirm()}
          confirmLabel={t('data.exportRangeConfirm')}
        />
      )}

      {pending && pending.stage === 'range' && (
        <SectionPicker
          title={t('data.importRangeTitle')}
          description={t(
            pending.mode === 'replace' ? 'data.replaceRangeDesc' : 'data.importRangeDesc',
          )}
          payload={pending.payload}
          selected={pending.selected}
          onToggle={(section) => setPending({ ...pending, selected: toggleIn(pending.selected, section) })}
          onCancel={() => setPending(null)}
          onConfirm={() => void handleRangeConfirm()}
          confirmLabel={t('data.importRangeConfirm')}
          hint={pending.selected.size === 0 ? t('data.nothingSelected') : undefined}
        />
      )}

      {pending && pending.stage === 'conflict' && (
        <ConflictDialog
          conflicts={pending.conflicts}
          onCancel={() => setPending(null)}
          onDone={(keepLocal) => setPending({ ...pending, keepLocal, stage: 'confirm' })}
        />
      )}

      {pending && pending.stage === 'confirm' && (
        <ConfirmDialog
          title={t(
            pending.mode === 'replace' ? 'data.replaceConfirmTitle' : 'data.confirmImportTitle',
          )}
          description={confirmDescription}
          confirmLabel={t(pending.mode === 'replace' ? 'data.replaceConfirm' : 'data.import')}
          tone={pending.mode === 'replace' ? 'danger' : 'brand'}
          onConfirm={() => void handleConfirmImport()}
          onCancel={() => setPending(null)}
        />
      )}
    </PageShell>
  )
}
