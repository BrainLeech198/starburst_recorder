/** Parse the optional actual expense for one intake entry, rounded to cents. */
export function parseIntakeExpenseAmount(value: string): number | null {
  const text = value.trim()
  if (text === '') return null

  const amount = Number(text.replace(/,/g, ''))
  if (!Number.isFinite(amount) || amount <= 0) return null

  const rounded = Math.round(amount * 100) / 100
  return rounded > 0 ? rounded : null
}
