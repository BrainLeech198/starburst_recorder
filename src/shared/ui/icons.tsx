/**
 * 全站统一的内联图标。
 *
 * 不引图标库：应用要离线跑在 Electron / Capacitor 里，多一个依赖就多一份包体；
 * 这里的路径全部是 24×24 的描边图形，颜色跟文字走（currentColor），
 * 因此按钮换主题色时图标自动跟着变。
 *
 * 用法：放进按钮里当第一个子元素即可，默认带 6px 右边距和 16px 尺寸，
 * 按钮本身的 inline-flex + items-center 会把图标和文字对齐。
 * 只给「需要靠图标区分含义」的按钮加；取消、关闭这类退一步的动作不加，
 * 否则一屏里全是图标，反而更难扫。
 */
import type { ReactElement } from 'react'

export type IconName =
  | 'plus'
  | 'import'
  | 'export'
  | 'trash'
  | 'edit'
  | 'close'
  | 'check'
  | 'back'
  | 'settings'
  | 'search'
  | 'sparkles'
  | 'chart'
  | 'image'
  | 'camera'
  | 'calendar'
  | 'clock'
  | 'refresh'
  | 'copy'
  | 'eye'
  | 'database'
  | 'bell'
  | 'filter'
  | 'send'
  | 'stop'
  | 'history'
  | 'moon'
  | 'wallet'
  | 'book'
  | 'heart'
  | 'utensils'
  | 'bed'
  | 'dumbbell'
  | 'arrow-right'
  | 'alert'
  | 'info'
  | 'list'
  | 'folder'
  | 'scale'
  | 'download'
  | 'upload'
  | 'share'
  | 'scan'

const PATHS: Record<IconName, ReactElement> = {
  plus: <path d="M12 5v14M5 12h14" />,
  import: <path d="M12 3v12M7 10l5 5 5-5M4 21h16" />,
  export: <path d="M12 21V9M7 14l5-5 5 5M4 3h16" />,
  share: (
    <>
      <path d="M12 3v12" />
      <path d="M8 7l4-4 4 4" />
      <path d="M5 13v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6" />
    </>
  ),
  scan: (
    <>
      <path d="M4 8V5a1 1 0 0 1 1-1h3M16 4h3a1 1 0 0 1 1 1v3M20 16v3a1 1 0 0 1-1 1h-3M8 20H5a1 1 0 0 1-1-1v-3" />
      <path d="M4 12h16" />
    </>
  ),
  trash: <path d="M3 6h18M8 6V4h8v2M6 6l1 15h10l1-15M10 10v7M14 10v7" />,
  edit: <path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z" />,
  close: <path d="M6 6l12 12M18 6L6 18" />,
  check: <path d="M4 12l5 5L20 7" />,
  back: <path d="M19 12H5M12 19l-7-7 7-7" />,
  settings: (
    <>
      <path d="M4 6h10M18 6h2M4 12h4M12 12h8M4 18h10M18 18h2" />
      <circle cx="16" cy="6" r="2" />
      <circle cx="10" cy="12" r="2" />
      <circle cx="16" cy="18" r="2" />
    </>
  ),
  search: (
    <>
      <circle cx="11" cy="11" r="7" />
      <path d="M21 21l-4.3-4.3" />
    </>
  ),
  sparkles: (
    <>
      <path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z" />
      <path d="M19 15l.9 2.1L22 18l-2.1.9L19 21l-.9-2.1L16 18l2.1-.9z" />
    </>
  ),
  chart: <path d="M4 20V10M10 20V4M16 20v-7M22 20H2" />,
  image: (
    <>
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <circle cx="8.5" cy="8.5" r="1.5" />
      <path d="M21 15l-5-5L5 21" />
    </>
  ),
  camera: (
    <>
      <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
      <circle cx="12" cy="13" r="4" />
    </>
  ),
  calendar: (
    <>
      <rect x="3" y="4" width="18" height="18" rx="2" />
      <path d="M16 2v4M8 2v4M3 10h18" />
    </>
  ),
  clock: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </>
  ),
  refresh: <path d="M21 12a9 9 0 1 1-2.64-6.36L21 3v6h-6" />,
  copy: (
    <>
      <rect x="9" y="9" width="13" height="13" rx="2" />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </>
  ),
  eye: (
    <>
      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z" />
      <circle cx="12" cy="12" r="3" />
    </>
  ),
  database: (
    <>
      <ellipse cx="12" cy="5" rx="9" ry="3" />
      <path d="M3 5v14c0 1.7 4 3 9 3s9-1.3 9-3V5M3 12c0 1.7 4 3 9 3s9-1.3 9-3" />
    </>
  ),
  bell: <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9M13.7 21a2 2 0 0 1-3.4 0" />,
  filter: <path d="M22 3H2l8 9.5V19l4 2v-8.5z" />,
  send: <path d="M22 2L11 13M22 2l-7 20-4-9-9-4z" />,
  stop: <rect x="6" y="6" width="12" height="12" rx="1" />,
  history: <path d="M3 3v5h5M3.05 13a9 9 0 1 0 2.13-9.36L3 8M12 7v5l3 2" />,
  moon: <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />,
  wallet: (
    <>
      <path d="M3 7a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
      <path d="M3 9h18" />
      <circle cx="16" cy="14" r="1" />
    </>
  ),
  book: <path d="M4 4a2 2 0 0 1 2-2h13v18H6a2 2 0 0 1-2-2zM8 2v18" />,
  heart: <path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.6l-1-1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 0 0 0-7.8z" />,
  utensils: <path d="M3 2v7a3 3 0 0 0 6 0V2M6 2v20M18 2v20M18 2a5 5 0 0 1 5 5v6h-5" />,
  bed: <path d="M2 4v16M2 9h18a2 2 0 0 1 2 2v9M2 18h20M6 9v-2a1 1 0 0 1 1-1h3a1 1 0 0 1 1 1v2" />,
  dumbbell: <path d="M4 8v8M8 6v12M16 6v12M20 8v8M8 12h8" />,
  'arrow-right': <path d="M5 12h14M12 5l7 7-7 7" />,
  alert: <path d="M12 3L2 21h20zM12 9v5M12 17h.01" />,
  info: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 11v5M12 8h.01" />
    </>
  ),
  list: <path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" />,
  folder: <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />,
  scale: (
    <>
      <rect x="4" y="3" width="16" height="18" rx="2" />
      <path d="M12 7a1.5 1.5 0 0 1 1.5 1.5L12 12l-1.5-3.5A1.5 1.5 0 0 1 12 7z" />
      <path d="M8 17h8" />
    </>
  ),
  download: <path d="M12 3v12M7 10l5 5 5-5M4 21h16" />,
  upload: <path d="M12 21V9M7 14l5-5 5 5M4 3h16" />,
}

export function Icon({
  name,
  className = 'mr-1.5 h-4 w-4 shrink-0',
}: {
  name: IconName
  /** 覆盖默认的尺寸与边距；纯图标按钮传 'h-4 w-4' 去掉右边距 */
  className?: string
}) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      className={className}
    >
      {PATHS[name]}
    </svg>
  )
}
