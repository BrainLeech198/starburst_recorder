import { Link } from 'react-router'

const ENTRIES = [
  { to: '/diary', icon: '📖', label: '日记', desc: '随手记下今天' },
  { to: '/health', icon: '💪', label: '健康', desc: '睡眠 · 心情 · 体重' },
  { to: '/finance', icon: '💰', label: '经济', desc: '每一笔收支' },
  { to: '/assistant', icon: '✨', label: '助手', desc: '问它，或让它写报告' },
  { to: '/calendar', icon: '📅', label: '日历', desc: '待设计' },
  { to: '/me', icon: '👤', label: '我的', desc: '账户与设置' },
]

function Starburst() {
  return (
    <svg width="96" height="96" viewBox="0 0 88 88" aria-hidden="true">
      <circle cx="44" cy="44" r="34" fill="var(--color-brand)" fillOpacity="0.12" />
      <path
        d="M44 5 L52.5 35.5 L83 44 L52.5 52.5 L44 83 L35.5 52.5 L5 44 L35.5 35.5 Z"
        fill="var(--color-brand)"
      />
    </svg>
  )
}

export default function HomePage() {
  return (
    <div className="mx-auto flex min-h-[calc(100dvh-4rem)] w-full max-w-md flex-col items-center justify-center px-6 md:min-h-dvh">
      <Starburst />
      <h1 className="mt-7 text-2xl font-medium tracking-wide">星芒记录者</h1>
      <p className="mt-2 text-sm text-muted">把零散的日子，攒成看得见的自己</p>

      <div className="mt-10 grid w-full grid-cols-2 gap-3">
        {ENTRIES.map((entry) => (
          <Link
            key={entry.to}
            to={entry.to}
            className="flex items-center gap-3 rounded-xl border border-line bg-surface p-4 transition-colors hover:border-brand"
          >
            <span aria-hidden="true" className="text-lg leading-none">
              {entry.icon}
            </span>
            <div className="min-w-0">
              <div className="text-base font-medium">{entry.label}</div>
              <div className="mt-1 text-xs text-muted">{entry.desc}</div>
            </div>
          </Link>
        ))}
      </div>
    </div>
  )
}
