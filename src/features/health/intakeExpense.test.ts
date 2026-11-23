import { describe, expect, it } from 'vitest'
import { parseIntakeExpenseAmount } from './intakeExpense'

describe('parseIntakeExpenseAmount', () => {
  it('uses the entered total amount directly, independent of intake servings', () => {
    expect(parseIntakeExpenseAmount('18')).toBe(18)
  })

  it('accepts comma-separated amounts and rounds to cents', () => {
    expect(parseIntakeExpenseAmount('1,234.567')).toBe(1234.57)
  })

  it('omits blank, invalid, and non-positive amounts', () => {
    expect(parseIntakeExpenseAmount('')).toBeNull()
    expect(parseIntakeExpenseAmount('   ')).toBeNull()
    expect(parseIntakeExpenseAmount('abc')).toBeNull()
    expect(parseIntakeExpenseAmount('0')).toBeNull()
    expect(parseIntakeExpenseAmount('-2')).toBeNull()
    expect(parseIntakeExpenseAmount('0.001')).toBeNull()
  })
})
