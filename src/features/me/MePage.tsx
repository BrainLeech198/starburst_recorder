/**
 * 「我的」：账户占位 + 两个入口——设置（应用级）与助手（星芒助手自己的那一套）。
 *
 * 两个入口的说明写清"里面有什么"，不然"设置 / 助手"这种抽象名字点进去才知道，
 * 白白多一次跳转。
 */
import SettingRow from '../../shared/ui/SettingRow'

export default function MePage() {
  return (
    <div className="mx-auto w-full max-w-md p-4">
      <h1 className="text-lg font-medium">我的</h1>

      <div className="mt-5 flex items-center gap-4 rounded-2xl border border-line bg-surface p-4">
        <div className="flex h-14 w-14 items-center justify-center rounded-full border border-line bg-surface-2 text-xs text-muted">
          头像
        </div>
        <div>
          <div className="text-base font-medium">本地账户</div>
          <div className="mt-1 text-xs text-muted">数据只存在这台设备，不上传</div>
        </div>
      </div>

      <div className="mt-4 space-y-3">
        <SettingRow to="/me/settings" emoji="⚙️" title="设置" hint="主题、数据与备份" />
        <SettingRow to="/me/agent" emoji="✨" title="助手" hint="悬浮球、AI 模型" />
      </div>

      <p className="mt-4 text-xs text-muted">以后这里会有账号与同步（现在只做本地）。</p>
    </div>
  )
}
