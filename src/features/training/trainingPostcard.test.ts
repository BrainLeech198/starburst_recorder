import { describe, expect, it } from 'vitest'
import type { HealthTraining } from '@/core/db/schema'
import { trainingPostcardFacts } from './trainingPostcard'

const t = (key: string) => key

function training(overrides: Partial<HealthTraining> = {}): HealthTraining {
  return {
    id: 'session-1',
    code: '123abcd',
    dateKey: '2026-11-19',
    time: '18:30',
    kind: 'strength',
    title: '力量训练',
    exercises: [
      {
        id: 'exercise-1',
        name: '深蹲',
        kind: 'strength',
        muscle: 'legs',
        sets: [{ reps: 8, weightKg: 40, durationSec: null, restSec: null, rpe: null }],
        durationMin: null,
        distanceKm: null,
        note: '',
      },
    ],
    durationMin: 45,
    feeling: 4,
    note: 'private note',
    createdAt: 1,
    updatedAt: 1,
    deletedAt: null,
    ...overrides,
  }
}

describe('trainingPostcardFacts', () => {
  it('summarizes duration, workload and exercises without exposing the private note', () => {
    const facts = trainingPostcardFacts(training(), t)
    expect(facts.map(({ id }) => id)).toEqual(['kind', 'duration', 'volume', 'sets', 'exercises', 'feeling'])
    expect(facts.find(({ id }) => id === 'volume')?.value).toBe('320 kg')
    expect(facts.find(({ id }) => id === 'exercises')?.value).toBe('深蹲')
    expect(JSON.stringify(facts)).not.toContain('private note')
  })

  it('omits workload rows when the session has no measured sets', () => {
    const facts = trainingPostcardFacts(training({ exercises: [], durationMin: 20, feeling: null }), t)
    expect(facts.map(({ id }) => id)).toEqual(['kind', 'duration'])
  })
})
