/**
 * 「助手还在干活」的那一行。
 *
 * 用的是本地计时：每秒刷一次，人就知道它在动，而不是卡住了。
 * 有当前工具名时一并显示，用户能看见它在翻哪块记录。
 */
import { useEffect, useState } from 'react'
import { useI18n } from '@/shared/i18n/context'

export default function AssistantWorking({
  startedAt,
  stepName,
}: {
  /** 这条消息是什么时候开始的（毫秒时间戳） */
  startedAt: number
  /** 正在执行的工具名，没有就只显示计时 */
  stepName?: string
}) {
  const { t } = useI18n()
  const [now, setNow] = useState(startedAt)

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(timer)
  }, [])

  const seconds = Math.max(0, Math.floor((now - startedAt) / 1000))

  return (
    <span className="flex min-w-0 items-center gap-1.5">
      <span className="relative flex h-1.5 w-1.5 shrink-0" aria-hidden="true">
        <span className="absolute inline-flex h-full w-full rounded-full bg-brand opacity-60 motion-safe:animate-ping" />
        <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-brand" />
      </span>
      <span className="truncate">
        {stepName ? t('assistant.workingStep', { name: stepName }) : t('assistant.working', { s: seconds })}
      </span>
      {stepName && (
        <span className="shrink-0 font-mono text-[10px]">
          {t('assistant.working', { s: seconds })}
        </span>
      )}
    </span>
  )
}
