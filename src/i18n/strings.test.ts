import { describe, expect, it } from 'vitest'
import STRINGS from './strings.json'

describe('app text', () => {
  it('is a sorted list without duplicates', () => {
    expect(new Set(STRINGS).size).toBe(STRINGS.length)
    expect([...STRINGS].sort()).toEqual(STRINGS)
  })
  it('uses simple {name} placeholders only', () => {
    for (const s of STRINGS) expect(s.replace(/\{\w+\}/g, '')).not.toMatch(/[{}]/)
  })
})
