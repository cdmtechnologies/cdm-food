import { describe, expect, it } from 'vitest'
import {
  dailyTarget, fillWeek, isVegan, isVegetarian, mealTargets, score, shoppingList, totals, unsuitable, weekDays, weekStart,
  type Food, type Profile,
} from './planner'

const food = (id: string, over: Partial<Food> = {}): Food => ({
  id, country_code: 'NG', name: id, meals: ['lunch', 'dinner'], kcal: 600, protein_g: 20, carbs_g: 80, fat_g: 20, fibre_g: 5,
  tags: [], ingredients: [], cost_level: 2, ...over,
})
const me: Profile = { diet: 'none', allergies: [], goals: [], daily_kcal: null, meals: ['breakfast', 'lunch', 'dinner'], household: 1 }

describe('diet and allergies', () => {
  it('keeps meat and fish away from vegetarians and vegans', () => {
    expect(unsuitable(food('a', { tags: ['poultry'] }), { ...me, diet: 'vegetarian' })).toMatch(/vegetarian/i)
    expect(unsuitable(food('b', { tags: ['dairy'] }), { ...me, diet: 'vegetarian' })).toBe('')
    expect(unsuitable(food('c', { tags: ['dairy'] }), { ...me, diet: 'vegan' })).toMatch(/vegan/i)
    expect(unsuitable(food('d', { tags: ['fish'] }), { ...me, diet: 'pescatarian' })).toBe('')
  })
  it('keeps pork and alcohol away from halal plans', () => {
    expect(unsuitable(food('p', { tags: ['pork'] }), { ...me, diet: 'halal' })).toMatch(/halal/i)
    expect(unsuitable(food('w', { tags: ['alcohol'] }), { ...me, diet: 'halal' })).toMatch(/halal/i)
    expect(unsuitable(food('n', { tags: ['pork'] }), { ...me, diet: 'no_pork' })).toBeTruthy()
  })
  it('respects allergies', () => {
    expect(unsuitable(food('s', { tags: ['nuts'] }), { ...me, allergies: ['nuts'] })).toBe('Contains nuts')
    expect(unsuitable(food('t', { tags: ['nuts'] }), me)).toBe('')
  })
  it('works out vegetarian and vegan foods from their tags', () => {
    expect(isVegetarian(food('x', { tags: ['dairy'] }))).toBe(true)
    expect(isVegan(food('x', { tags: ['dairy'] }))).toBe(false)
    expect(isVegan(food('y', { tags: ['high_fibre'] }))).toBe(true)
  })
})

describe('targets and scores', () => {
  it('uses the person\'s own calorie target, or one for their goals', () => {
    expect(dailyTarget({ daily_kcal: 1900, goals: ['lose_weight'] })).toBe(1900)
    expect(dailyTarget({ daily_kcal: null, goals: ['lose_weight'] })).toBe(1700)
    expect(dailyTarget({ daily_kcal: null, goals: [] })).toBe(2000)
  })
  it('shares the day across the chosen meals', () => {
    const t = mealTargets(['breakfast', 'lunch', 'dinner'], 2000)
    expect(t.breakfast + t.lunch + t.dinner).toBeGreaterThan(1990)
    expect(t.snack).toBe(0)
    expect(t.lunch).toBeGreaterThan(t.breakfast)
  })
  it('favours slow-release foods for blood sugar and avoids sweet ones', () => {
    const p = { goals: ['diabetes' as const] }
    expect(score(food('a', { tags: ['low_gi', 'high_fibre'] }), p, 600)).toBeGreaterThan(score(food('b', { tags: ['sugary'] }), p, 600))
  })
  it('avoids salty food for blood pressure', () => {
    const p = { goals: ['blood_pressure' as const] }
    expect(score(food('a'), p, 600)).toBeGreaterThan(score(food('b', { tags: ['high_salt'] }), p, 600))
  })
  it('prefers foods close to the meal\'s calories', () => {
    expect(score(food('a', { kcal: 600 }), { goals: [] }, 600)).toBeGreaterThan(score(food('b', { kcal: 1200 }), { goals: [] }, 600))
  })
})

describe('fill my week', () => {
  const foods = [
    ...Array.from({ length: 6 }, (_, i) => food('b' + i, { meals: ['breakfast'], kcal: 450 })),
    ...Array.from({ length: 8 }, (_, i) => food('m' + i, { kcal: 650 })),
    food('pork', { tags: ['pork'], kcal: 650 }),
  ]
  const days = weekDays(new Date(2026, 10, 23))
  it('fills every meal of every day', () => {
    const out = fillWeek(days, me.meals, foods, me, [], 7)
    expect(out.length).toBe(21)
    expect(out.filter((i) => i.meal === 'breakfast').every((i) => i.food_id.startsWith('b'))).toBe(true)
  })
  it('never breaks the diet', () => {
    const out = fillWeek(days, me.meals, foods, { ...me, diet: 'halal' }, [], 3)
    expect(out.some((i) => i.food_id === 'pork')).toBe(false)
  })
  it('keeps meals that are already planned', () => {
    const existing = [{ day: days[0], meal: 'lunch' as const, food_id: 'm1', servings: 1, position: 0, locked: true }]
    const out = fillWeek(days, me.meals, foods, me, existing, 3)
    expect(out.length).toBe(20)
    expect(out.some((i) => i.day === days[0] && i.meal === 'lunch')).toBe(false)
  })
  it('does not repeat a food on the same day', () => {
    const out = fillWeek(days, me.meals, foods, me, [], 11)
    for (const d of days) {
      const ids = out.filter((i) => i.day === d).map((i) => i.food_id)
      expect(new Set(ids).size).toBe(ids.length)
    }
  })
  it('gives the same week for the same seed', () => {
    expect(fillWeek(days, me.meals, foods, me, [], 5)).toEqual(fillWeek(days, me.meals, foods, me, [], 5))
  })
})

describe('totals and shopping', () => {
  const foods = new Map([
    ['a', food('a', { kcal: 500, protein_g: 20, ingredients: ['rice', 'tomato'] })],
    ['b', food('b', { kcal: 300, protein_g: 10, ingredients: ['beans', 'Tomato'] })],
    ['c', food('c', { kcal: null })],
  ])
  const items = [
    { day: '2026-11-23', meal: 'lunch' as const, food_id: 'a', servings: 1, position: 0, locked: false },
    { day: '2026-11-23', meal: 'dinner' as const, food_id: 'b', servings: 2, position: 0, locked: false },
    { day: '2026-11-23', meal: 'snack' as const, food_id: 'c', servings: 1, position: 0, locked: false },
  ]
  it('adds up calories and protein by servings', () => {
    const t = totals(items, foods)
    expect(t.kcal).toBe(1100)
    expect(t.protein_g).toBe(40)
    expect(t.unknown).toBe(1)
  })
  it('lists each ingredient once for the household', () => {
    const list = shoppingList(items, foods, 3)
    const tomato = list.find((x) => x.item.toLowerCase() === 'tomato')
    expect(tomato?.portions).toBe(9)
    expect(tomato?.meals).toBe(2)
    expect(tomato?.dishes).toEqual(['a', 'b'])
    expect(list.length).toBe(3)
  })
})

describe('weeks', () => {
  it('starts weeks on Monday', () => {
    const d = weekStart(new Date(2026, 10, 25)) // Wednesday 25 Nov 2026
    expect(d.getDay()).toBe(1)
    expect(d.getDate()).toBe(23)
    expect(weekDays(d)[6]).toBe('2026-11-29')
  })
})
