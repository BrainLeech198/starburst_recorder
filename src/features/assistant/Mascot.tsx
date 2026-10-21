import type { MascotShape } from '@/app/providers/BallProvider'

// 四角星：4 个外顶点 + 4 个内顶点
const STAR4 = 'M44 5 L52.5 35.5 L83 44 L52.5 52.5 L44 83 L35.5 52.5 L5 44 L35.5 35.5 Z'

// 八角星：8 个外顶点 + 8 个内顶点，交替连接
const STAR8 =
  'M44 5 L50.1 29.2 L71.6 16.4 L58.8 37.9 L83 44 L58.8 50.1 L71.6 71.6 L50.1 58.8 ' +
  'L44 83 L37.9 58.8 L16.4 71.6 L29.2 50.1 L5 44 L29.2 37.9 L16.4 16.4 L37.9 29.2 Z'

export function Mascot({
  shape,
  color,
  size,
  className,
}: {
  shape: MascotShape
  color: string
  size: number
  className?: string
}) {
  return (
    <svg width={size} height={size} viewBox="0 0 88 88" className={className} aria-hidden="true">
      <circle cx="44" cy="44" r="33" fill={color} fillOpacity="0.14" />
      {shape === 'star4' && <path d={STAR4} fill={color} />}
      {shape === 'star8' && <path d={STAR8} fill={color} />}
      {shape === 'dot' && <circle cx="44" cy="44" r="25" fill={color} />}
      {shape === 'ring' && (
        <circle cx="44" cy="44" r="24" fill="none" stroke={color} strokeWidth="9" />
      )}
    </svg>
  )
}
