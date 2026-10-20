/**
 * 「数据与备份」页：导出全部、从备份恢复、看到数据落在哪儿。
 *
 * 单独开一页而不是塞进设置页：这三件事都是全局的数据管理，不属于任何单个功能模块，
 * 以后要加「清空数据」「导入旧笔记」也有地方放。
 */
import { useEffect, useRef, useState } from 'react'
import type { ChangeEvent } from 'react'
import { Link } from 'react-router'
import { useLiveQuery } from 'dexie-react-hooks'
import { useToast } from '../../app/providers/ToastProvider'
import ConfirmDialog from '../../shared/ui/ConfirmDialog'
import SettingCard, { SettingBadge, SettingGroup } from '../../shared/ui/SettingCard'
import { OUTLINE_BUTTON, SOLID_BUTTON } from '../../shared/ui/buttonStyles'
import { desktopBridge } from '../../core/desktop'
import type { DesktopBridge } from '../../core/desktop'
import { buildBackup, readBackup } from '../diary/diaryBackup'
import type { BackupPayload } from '../diary/diaryBackup'
import { downloadExport } from '../diary/diaryExport'
import { everyDay, everyEntry, everyStamp, importBackup, totals } from '../diary/diaryRepo'
import type { ImportStats } from '../diary/diaryRepo'

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
  const [path, setPath] = useState('')
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    if (!bridge) return
    void bridge.dataPath().then((value) => setPath(value ?? ''))
  }, [bridge])

  if (!bridge) return null
  // 收成一个非 undefined 的常量：闭包里 TS 不认上面那句 if 的判断
  const shell = bridge

  return (
    <SettingCard
      title="数据在哪"
      description="你的日记实际就落在这个目录里。想备份或搬家，用上面的「导出全部数据」更稳；这里只是让你能亲眼看到它在哪。"
      badge={<SettingBadge>桌面程序</SettingBadge>}
    >
      <SettingGroup label="落盘位置">
        <p className="font-mono text-xs break-all text-fg">{path || '读取中…'}</p>
        <button
          type="button"
          onClick={() => {
            void shell.openDataFolder().then((ok) => setFailed(!ok))
          }}
          className={`${OUTLINE_BUTTON} mt-2`}
        >
          打开数据文件夹
        </button>
        {failed && (
          <p className="mt-2 text-xs text-danger">
            没打开成功，可能被系统拦住了。可以照上面的路径自己找过去。
          </p>
        )}
      </SettingGroup>

      <SettingGroup label="换机器怎么办">
        <p className="text-xs text-muted">
          这台机器上「导出全部数据」，到新机器上再「从备份恢复」——日记、随记、天气，连回收站里删掉的都会一起搬过去。
        </p>
      </SettingGroup>
    </SettingCard>
  )
}

export default function DataPage() {
  const { showToast } = useToast()
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
    downloadExport(buildBackup({ entries, stamps, days }))
    showToast({
      message: `已导出全部：${entries.length} 条日记、${stamps.length} 笔随记、${days.length} 天天气（回收站里的也在内）`,
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
    <div className="mx-auto w-full max-w-md p-4">
      <div className="flex items-center justify-between gap-2">
        <h1 className="text-lg font-medium">数据与备份</h1>
        <Link to="/settings" className={SOLID_BUTTON}>
          ← 返回设置
        </Link>
      </div>

      <div className="mt-6 space-y-4">
        <SettingCard
          title="备份"
          description="把全部内容导成一份 JSON：日记、随记、天气，连回收站里删掉的都在内。"
          badge={
            <SettingBadge>
              日记 {counts?.entries ?? 0} · 随记 {counts?.stamps ?? 0}
            </SettingBadge>
          }
        >
          <SettingGroup label="导出">
            <button type="button" onClick={() => void handleExportAll()} className={OUTLINE_BUTTON}>
              导出全部数据
            </button>
            <p className="mt-2 text-xs text-muted">
              文件会直接下载下来。收好它——这就是你的备份，也是换机器时唯一要带的东西。
            </p>
          </SettingGroup>
        </SettingCard>

        <SettingCard
          title="从备份恢复"
          description="选一份之前导出的备份，把里面的内容并进来。"
          badge={<SettingBadge>合并 · 备份优先</SettingBadge>}
        >
          <SettingGroup label="选择备份文件">
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
              {busy ? '正在导入…' : '选择备份文件…'}
            </button>
            <p className="mt-2 text-xs text-muted">
              选完先给你看一份清单，你确认了才会真写进去。同一条记录以备份为准，其它内容不动。
            </p>

            {error !== '' && (
              <p className="mt-2 rounded-lg border border-danger px-3 py-2 text-xs text-danger">
                {error}
              </p>
            )}

            {report && (
              <div className="mt-2 rounded-lg border border-line bg-surface-2 px-3 py-2 text-xs">
                <div className="text-fg">导入完成</div>
                <ul className="mt-1 space-y-0.5 text-muted">
                  <li>
                    日记：新增 {added(report.stats.entries)} 条 · 覆盖{' '}
                    {report.stats.entries.overwritten} 条
                  </li>
                  <li>
                    随记：新增 {added(report.stats.stamps)} 笔 · 覆盖{' '}
                    {report.stats.stamps.overwritten} 笔
                  </li>
                  <li>
                    天气：新增 {added(report.stats.days)} 天 · 覆盖 {report.stats.days.overwritten}{' '}
                    天
                  </li>
                  {report.skipped > 0 && (
                    <li className="text-danger">有 {report.skipped} 条格式不对，已经跳过</li>
                  )}
                </ul>
              </div>
            )}
          </SettingGroup>
        </SettingCard>

        <DataFolderCard />
      </div>

      {pending && (
        <ConfirmDialog
          title="把这份备份并进来？"
          description={`「${pending.name}」里有 ${pending.payload.entries.length} 条日记、${
            pending.payload.stamps.length
          } 笔随记、${pending.payload.days.length} 天天气。同一条记录以备份为准（会被备份盖掉），其它内容不动。${
            pending.skipped > 0 ? `另有 ${pending.skipped} 条格式不对，会跳过。` : ''
          }`}
          confirmLabel="导入"
          tone="brand"
          onConfirm={() => void handleConfirmImport()}
          onCancel={() => setPending(null)}
        />
      )}
    </div>
  )
}
