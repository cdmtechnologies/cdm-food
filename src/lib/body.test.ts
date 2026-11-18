import { describe, expect, it } from 'vitest'
import { bmi, bmiBand, bodyIssue, bodyProblem, bodyTarget, cmToFtIn, ftInToCm, healthyRange, kgToLb, lbToKg, progress, weeksToTarget, type Body } from './body'
import { dailyTarget, eatenTotals, type Food, type PlanItem } from './planner'

const now = new Date(2026, 10, 18)
const ada: Body = { sex: 'female', birth_year: 1988, height_cm: 165, weight_kg: 82, target_weight_kg: 70, activity: 'light' }

describe('body figures', () => {
  it('works out BMI and the healthy range', () => {
    expect(bmi(165, 82)).toBe(30.1)
    expect(bmiBand(30.1)).toBe('obese')
    expect(bmiBand(22)).toBe('healthy')
    expect(healthyRange(165)).toEqual([50.4, 67.8])
    expect(bmi(null, 80)).toBeNull()
  })
  it('sets a gentle deficit to lose weight, never below the floor', () => {
    const t = bodyTarget(ada, now)!
    expect(t.direction).toBe('lose')
    expect(t.maintenance).toBe(2060)
    expect(t.kcal).toBe(1650)
    expect(t.kgPerWeek).toBeGreaterThan(0.3)
    expect(t.kgPerWeek).toBeLessThan(0.6)
    const small = bodyTarget({ ...ada, height_cm: 150, weight_kg: 60, target_weight_kg: 50, activity: 'sedentary', birth_year: 1950 }, now)!
    expect(small.kcal).toBeGreaterThan(1199)
  })
  it('adds calories to gain and keeps them to maintain', () => {
    expect(bodyTarget({ ...ada, weight_kg: 50, target_weight_kg: 56 }, now)!.direction).toBe('gain')
    expect(bodyTarget({ ...ada, target_weight_kg: null }, now)!.direction).toBe('keep')
  })
  it('does not cut calories for under-18s or for targets below a healthy weight', () => {
    expect(bodyTarget({ ...ada, birth_year: 2011 }, now)!.direction).toBe('keep')
    expect(bodyTarget({ ...ada, target_weight_kg: 45 }, now)!.direction).toBe('keep')
    expect(bodyProblem({ height_cm: 165, target_weight_kg: 45 })).toContain('50.4')
    expect(bodyIssue({ height_cm: 165, target_weight_kg: 45 })!.vars).toEqual({ kg: 50.4 })
  })
  it('needs the basics before it can estimate', () => {
    expect(bodyTarget({ ...ada, sex: null }, now)).toBeNull()
  })
  it('checks typed numbers', () => {
    expect(bodyProblem({ birth_year: 2020 }, now)).toMatch(/year of birth/)
    expect(bodyProblem({ height_cm: 30 })).toMatch(/Height/)
    expect(bodyProblem({ weight_kg: 80, height_cm: 170, birth_year: 1990 }, now)).toBe('')
  })
  it('uses body figures for the daily target unless the person set their own', () => {
    expect(dailyTarget({ daily_kcal: null, goals: [], ...ada })).toBe(1650)
    expect(dailyTarget({ daily_kcal: 1900, goals: [], ...ada })).toBe(1900)
  })
  it('measures progress and time to target', () => {
    expect(progress(86, 82, 70)).toBe(25)
    expect(progress(86, 90, 70)).toBe(0)
    expect(weeksToTarget(ada, bodyTarget(ada, now))).toBeGreaterThan(20)
  })
  it('converts units', () => {
    expect(lbToKg(176)).toBe(79.8)
    expect(kgToLb(80)).toBe(176.4)
    expect(ftInToCm(5, 7)).toBe(170)
    expect(cmToFtIn(170)).toEqual([5, 7])
  })
})

describe('what was eaten', () => {
  const f = (id: string, kcal: number): Food => ({ id, country_code: 'NG', name: id, meals: ['lunch'], kcal, protein_g: 10, carbs_g: 10, fat_g: 10, fibre_g: 1, tags: [], ingredients: [] })
  const foods = new Map([['a', f('a', 500)], ['b', f('b', 300)], ['c', f('c', 800)]])
  const base = { day: '2026-11-18', position: 0, locked: false, servings: 1 }
  it('counts eaten meals, the other food or typed calories for swaps, and nothing for skipped or unticked', () => {
    const items: PlanItem[] = [
      { ...base, meal: 'breakfast', food_id: 'a', status: 'eaten' },
      { ...base, meal: 'lunch', food_id: 'b', status: 'swapped', ate_food_id: 'c', ate_servings: 1 },
      { ...base, meal: 'dinner', food_id: 'a', status: 'swapped', ate_note: 'Suya', ate_kcal: 450 },
      { ...base, meal: 'snack', food_id: 'b', status: 'skipped' },
      { ...base, meal: 'snack', food_id: 'a', servings: 2 },
    ]
    const e = eatenTotals(items, foods)
    expect(e.kcal).toBe(500 + 800 + 450)
    expect(e.logged).toBe(4)
    expect(e.followed).toBe(1)
    expect(e.planned).toBe(5)
  })
})
