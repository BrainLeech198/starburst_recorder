/**
 * 数字输入的统一解析。
 *
 * 用户习惯连着单位一起打（「150g」「72 kg」「30岁」），以前直接 Number() 会得到 NaN，
 * 表单就会报「要填 0 或正数」，看起来像被拦住了。这里把常见单位尾巴去掉再转数字。
 * 空串当 0（调用方自己决定 0 算不算没填），认不出来或者负数返回 null。
 */
const UNIT_SUFFIX = /(kcal|千卡|大卡|kg|公斤|g|克|ml|毫升|cm|厘米|岁)\s*$/i

export function parseAmount(text: string): number | null {
  const raw = text.trim()
  if (raw === '') return 0
  const cleaned = raw.replace(/\s+/g, '').replace(/,/g, '').replace(UNIT_SUFFIX, '')
  if (cleaned === '') return null
  const value = Number(cleaned)
  return Number.isFinite(value) && value >= 0 ? value : null
}
