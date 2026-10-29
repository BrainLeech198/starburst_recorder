/**
 * 长辈关怀模式的纯逻辑：档位定义、localStorage 读写、把状态挂到 <html> 上。
 *
 * 样式怎么生效见 index.css 的「长辈关怀」段：Tailwind 尺寸全是 rem，
 * 改根字号就能整套界面等比放大，所以这里只负责挂属性，不碰任何页面代码。
 */
import type { MessageKey } from '@/shared/i18n/messages/zh'

export type FontScaleId = 'standard' | 'large' | 'xlarge' | 'xxlarge'

/** 字号档位用语义名而不是拖百分比：长辈不需要理解 130%，只需要「大 / 特大 / 超大」 */
export const FONT_SCALES: { id: FontScaleId; labelKey: MessageKey; percent: number }[] = [
  { id: 'standard', labelKey: 'care.scale.standard', percent: 100 },
  { id: 'large', labelKey: 'care.scale.large', percent: 115 },
  { id: 'xlarge', labelKey: 'care.scale.xlarge', percent: 130 },
  { id: 'xxlarge', labelKey: 'care.scale.xxlarge', percent: 150 },
]

export interface CareState {
  /** 字号档位；只在总开关开着时生效，关掉后界面回到标准大小 */
  fontScale: FontScaleId
  /** 总开关：开着才启用字号放大和下面四个关怀功能 */
  care: boolean
  tapTargets: boolean
  contrast: boolean
  reduceMotion: boolean
  /** 危险操作二次确认 */
  guard: boolean
}

export const CARE_KEY = 'starburst.care'

/** 四个关怀功能默认全开：打开总开关就是「关怀全家桶」，细项再按需关 */
export const DEFAULT_CARE: CareState = {
  fontScale: 'standard',
  care: false,
  tapTargets: true,
  contrast: true,
  reduceMotion: true,
  guard: true,
}

/** 存过什么就用什么；缺字段用默认，认不出的值（旧版本、手改过）退回默认 */
export function parseCareState(raw: string | null): CareState {
  if (!raw) return { ...DEFAULT_CARE }
  try {
    const parsed = JSON.parse(raw) as Partial<CareState>
    return {
      fontScale: FONT_SCALES.some((item) => item.id === parsed.fontScale)
        ? (parsed.fontScale as FontScaleId)
        : DEFAULT_CARE.fontScale,
      care: parsed.care === true,
      tapTargets: parsed.tapTargets !== false,
      contrast: parsed.contrast !== false,
      reduceMotion: parsed.reduceMotion !== false,
      guard: parsed.guard !== false,
    }
  } catch {
    return { ...DEFAULT_CARE }
  }
}

/** 关怀功能的生效口径：总开关开着 + 各自的子开关开着；字号永远生效 */
export function careFeatureOn(state: CareState, feature: 'tapTargets' | 'contrast' | 'reduceMotion' | 'guard') {
  return state.care && state[feature]
}

/**
 * 把状态挂到 <html> 的 data-* 上，具体样式由 index.css 认这些属性。
 * 字号也跟着总开关走：关掉长辈关怀就回到标准大小，不会留下一个「关不掉的大字」。
 * 存下来的档位不丢，重新打开总开关时恢复。
 */
export function applyCareState(state: CareState): void {
  const root = document.documentElement
  root.dataset.fontScale = state.care ? state.fontScale : 'standard'
  root.dataset.careTap = careFeatureOn(state, 'tapTargets') ? 'on' : 'off'
  root.dataset.careContrast = careFeatureOn(state, 'contrast') ? 'on' : 'off'
  root.dataset.careMotion = careFeatureOn(state, 'reduceMotion') ? 'on' : 'off'
}
