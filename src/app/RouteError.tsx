/**
 * 路由级错误兜底：页面渲染或懒加载失败时，至少给出可读提示和刷新入口，
 * 而不是一片空白。数据都在本机，刷新不会丢记录。
 */
import { isRouteErrorResponse, useRouteError } from 'react-router'
import { useI18n } from '@/shared/i18n/context'

export default function RouteError() {
  const error = useRouteError()
  const { t } = useI18n()

  const detail = isRouteErrorResponse(error)
    ? `${error.status} ${error.statusText}`
    : error instanceof Error
      ? error.message
      : ''

  return (
    <div className="mx-auto w-full max-w-md p-6">
      <h1 className="text-lg font-medium">{t('error.title')}</h1>
      <p className="mt-2 text-sm text-muted">{t('error.hint')}</p>
      {detail && (
        <pre className="mt-3 whitespace-pre-wrap break-all rounded-lg border border-line bg-surface-2 p-3 text-xs text-muted">
          {detail}
        </pre>
      )}
      <button
        type="button"
        onClick={() => window.location.reload()}
        className="mt-4 rounded-lg border border-brand px-3 py-1.5 text-sm text-brand transition-colors"
      >
        {t('error.reload')}
      </button>
    </div>
  )
}
