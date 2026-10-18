import { Link } from 'react-router'

export default function MePage() {
  return (
    <div className="mx-auto w-full max-w-md p-4">
      <h1 className="text-lg font-medium">我的</h1>

      <div className="mt-5 flex items-center gap-4 rounded-xl border border-line bg-surface p-4">
        <div className="flex h-14 w-14 items-center justify-center rounded-full border border-line bg-surface-2 text-xs text-muted">
          头像
        </div>
        <div>
          <div className="text-base font-medium">本地账户</div>
          <div className="mt-1 text-xs text-muted">数据只存在这台设备，不上传</div>
        </div>
      </div>

      <Link
        to="/settings"
        className="mt-4 flex items-center justify-between rounded-xl border border-line bg-surface px-4 py-3 transition-colors hover:border-brand"
      >
        <span className="text-sm">设置</span>
        <span className="text-muted">›</span>
      </Link>

      <p className="mt-4 text-xs text-muted">以后这里会有账号与同步（现在只做本地）。</p>
    </div>
  )
}
