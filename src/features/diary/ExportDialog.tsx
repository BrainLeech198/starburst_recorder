import type { ExportFormat } from './diaryExport'

const OPTIONS: { id: ExportFormat; label: string; hint: string }[] = [
  { id: 'markdown', label: 'Markdown', hint: '一天一节，能直接给 AI 读' },
  { id: 'text', label: '纯文本 .txt', hint: '干净好读，不带任何标记' },
  { id: 'json', label: 'JSON', hint: '保留全部字段，用来做完整备份' },
]

export default function ExportDialog({
  count,
  unit,
  onPick,
  onCancel,
}: {
  count: number
  unit: string
  onPick: (format: ExportFormat) => void
  onCancel: () => void
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={onCancel}
    >
      <div
        className="w-full max-w-xs rounded-2xl border border-line bg-surface p-4"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="text-sm font-medium">
          导出选中的 {count} {unit}
        </div>
        <p className="mt-2 text-xs text-muted">选一种格式，文件会直接下载下来。</p>

        <div className="mt-3 flex flex-col gap-2">
          {OPTIONS.map((option) => (
            <button
              key={option.id}
              type="button"
              onClick={() => onPick(option.id)}
              className="rounded-lg border border-line px-3 py-2 text-left transition-colors hover:border-brand"
            >
              <span className="block text-sm text-fg">{option.label}</span>
              <span className="mt-0.5 block text-xs text-muted">{option.hint}</span>
            </button>
          ))}
        </div>

        <div className="mt-4 flex justify-end">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-lg border border-line px-3 py-1.5 text-sm text-muted transition-colors hover:text-fg"
          >
            取消
          </button>
        </div>
      </div>
    </div>
  )
}
