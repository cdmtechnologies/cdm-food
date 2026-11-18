import { describe, expect, it } from 'vitest'
import { speechChunks, speechText, typedLength } from './aiVoice'

describe('typedLength', () => {
  it('starts empty and ends with the whole reply', () => {
    expect(typedLength(100, 0)).toBe(0)
    expect(typedLength(100, 60000)).toBe(100)
    expect(typedLength(0, 500)).toBe(0)
  })
  it('grows over time', () => {
    const a = typedLength(500, 1000)
    const b = typedLength(500, 2000)
    expect(a).toBeGreaterThan(0)
    expect(b).toBeGreaterThan(a)
  })
  it('never takes more than about 6 seconds, however long the reply', () => {
    expect(typedLength(20000, 6000)).toBe(20000)
  })
  it('lets very short replies show for a moment', () => {
    expect(typedLength(5, 300)).toBeLessThan(5)
    expect(typedLength(5, 700)).toBe(5)
  })
})

describe('speechText', () => {
  it('removes Markdown symbols and links', () => {
    expect(speechText('## Total\n**Sales** are up. See https://cdm24.netlify.app/x')).toBe('Total. Sales are up. See the link')
  })
  it('reads money amounts as words', () => {
    expect(speechText('You sold ₦12,500 today and $40 online')).toBe('You sold 12,500 naira today and 40 dollars online')
  })
  it('drops list bullets and pauses between lines', () => {
    expect(speechText('- Panadol\n- Vitamin C')).toBe('Panadol. Vitamin C')
  })
  it('reads menu paths naturally', () => {
    expect(speechText('Open Fees > Fee report.')).toBe('Open Fees, then Fee report.')
  })
})

describe('speechChunks', () => {
  it('keeps a short reply in one piece', () => {
    expect(speechChunks('Hello there. How are you?')).toEqual(['Hello there. How are you?'])
  })
  it('splits long replies into pieces no longer than the limit', () => {
    const long = Array.from({ length: 30 }, (_, i) => `Sentence number ${i} is here.`).join(' ')
    const parts = speechChunks(long, 120)
    expect(parts.length).toBeGreaterThan(3)
    expect(parts.every((p) => p.length <= 120)).toBe(true)
    expect(parts.join(' ').replace(/\s+/g, ' ')).toBe(long)
  })
  it('splits one very long sentence on spaces', () => {
    const words = Array.from({ length: 100 }, () => 'word').join(' ')
    const parts = speechChunks(words, 50)
    expect(parts.every((p) => p.length <= 50)).toBe(true)
    expect(parts.join(' ')).toBe(words)
  })
  it('returns nothing for empty text', () => {
    expect(speechChunks('  ')).toEqual([])
  })
})
