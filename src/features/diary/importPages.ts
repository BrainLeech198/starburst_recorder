import type { Transcript } from '@/features/ai/aiVision'

/** 一次最多选多少张：再多就是逐张等识别，失败率也跟着涨 */
export const MAX_IMPORT_IMAGES = 9

/** 一批图识别完的合并结果 */
export interface ImportSummary {
  /** 按页序拼好的正文；没认出的页留了占位 */
  content: string
  /** 这一批里出现过的日期（按页序去重）；整批都没认出来就是空数组 */
  dateKeys: string[]
  /** 第一个非空天气；同一天不该出现两套天气 */
  weather: string
  done: number
  failed: number
}

/**
 * 把逐张识别的结果按页序合成一篇。
 *
 * 失败页留占位（文案由调用方按当前语言给），宁可正文里有个显眼的标记，
 * 也不能让这一页悄悄消失——用户看不出少了什么，就以为存全了。
 * 续页通常不重复写抬头日期，所以日期缺省时跟随上一张已知日期。
 */
export function mergePages(
  pages: (Transcript | null)[],
  placeholder: (pageNumber: number) => string,
): ImportSummary {
  const chunks: string[] = []
  const dateKeys: string[] = []
  let weather = ''
  let lastDate = ''
  let done = 0
  let failed = 0

  pages.forEach((page, index) => {
    if (!page) {
      failed += 1
      chunks.push(placeholder(index + 1))
      return
    }
    done += 1
    const body = page.content.trim()
    if (body !== '') chunks.push(body)
    if (page.dateKey !== '') lastDate = page.dateKey
    if (lastDate !== '' && !dateKeys.includes(lastDate)) dateKeys.push(lastDate)
    if (weather === '' && page.weather !== '') weather = page.weather
  })

  return {
    content: chunks.join('\n\n'),
    dateKeys,
    weather,
    done,
    failed,
  }
}
