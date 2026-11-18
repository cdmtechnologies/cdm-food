import { describe, expect, it } from 'vitest'
import { cleanRecipe, cleanVideos, embedUrl, formatQty, minutesLabel, parseYouTube, scaleQty, videoQuery, youtubeSearchUrl } from './recipe'

describe('cleanRecipe', () => {
  const good = {
    serves: 4, total_minutes: 50,
    ingredients: [{ item: 'Rice', qty: 500, unit: 'g' }, { item: 'Tomatoes', qty: 4, unit: 'medium', note: 'blended' }, { item: '<b>Salt</b>', qty: 'some', unit: 'spoonfuls' }],
    steps: [{ text: 'Wash the rice.', minutes: 5 }, { text: 'Fry the tomato base.', minutes: 20 }, 'Add rice and simmer.'],
    tips: ['Use a heavy pot', 7],
  }
  it('keeps a good recipe and cleans odd values', () => {
    const r = cleanRecipe(good)!
    expect(r.serves).toBe(4)
    expect(r.ingredients).toHaveLength(3)
    expect(r.ingredients[2]).toEqual({ item: 'b Salt /b', qty: null, unit: '', note: '' })
    expect(r.steps[2]).toEqual({ text: 'Add rice and simmer.', minutes: null })
    expect(r.tips).toEqual(['Use a heavy pot'])
    expect(r.total_minutes).toBe(50)
  })
  it('works out total time from the steps when missing', () => {
    expect(cleanRecipe({ ...good, total_minutes: undefined })!.total_minutes).toBe(25)
  })
  it('rejects recipes without ingredients or with fewer than two steps', () => {
    expect(cleanRecipe({ ...good, ingredients: [] })).toBeNull()
    expect(cleanRecipe({ ...good, steps: ['Cook it'] })).toBeNull()
    expect(cleanRecipe('nonsense')).toBeNull()
  })
  it('falls back to 4 servings when the number is odd', () => {
    expect(cleanRecipe({ ...good, serves: 99 })!.serves).toBe(4)
  })
})

describe('scaling', () => {
  it('scales amounts for the household and rounds them', () => {
    expect(scaleQty(500, 4, 6)).toBe(750)
    expect(scaleQty(3, 4, 6)).toBe(4.5)
    expect(scaleQty(1, 4, 1)).toBe(0.25)
    expect(scaleQty(null, 4, 2)).toBeNull()
  })
  it('shows fractions people can measure', () => {
    expect(formatQty(1.5, 'cup')).toBe('1½ cup')
    expect(formatQty(0.25, 'tsp')).toBe('¼ tsp')
    expect(formatQty(750, 'g')).toBe('750 g')
    expect(formatQty(null, '')).toBe('')
  })
  it('labels times', () => {
    expect(minutesLabel(40)).toBe('40 min')
    expect(minutesLabel(135)).toBe('2 h 15 min')
    expect(minutesLabel(120)).toBe('2 h')
    expect(minutesLabel(null)).toBe('')
  })
})

describe('videos', () => {
  it('builds a clean search', () => {
    expect(videoQuery('Jollof rice (party style)!', 'Nigeria')).toBe('how to cook Jollof rice Nigeria')
    expect(youtubeSearchUrl('a b')).toContain('search_query=a%20b')
  })
  it('keeps only real, non-live videos', () => {
    const raw = { items: [
      { id: { videoId: 'abcdefghijk' }, snippet: { title: 'Easy &amp; quick', channelTitle: 'Chef', liveBroadcastContent: 'none' } },
      { id: { videoId: 'abcdefghijk' }, snippet: { title: 'dup' } },
      { id: { videoId: 'bad id' }, snippet: { title: 'x' } },
      { id: { videoId: 'LIVEvideo01' }, snippet: { title: 'live', liveBroadcastContent: 'live' } },
      { id: { videoId: 'zyxwvutsrqp' }, snippet: { title: '<script>' } },
    ] }
    const v = parseYouTube(raw)
    expect(v.map((x) => x.id)).toEqual(['abcdefghijk', 'zyxwvutsrqp'])
    expect(v[0].title).toBe('Easy & quick')
    expect(v[1].title).not.toContain('<')
    expect(parseYouTube(null)).toEqual([])
  })
  it('only embeds valid ids', () => {
    expect(embedUrl('abcdefghijk')).toContain('/embed/abcdefghijk?')
    expect(embedUrl('../../evil')).toContain('/embed/?')
    expect(cleanVideos([{ id: 'abcdefghijk', title: 't', channel: 'c' }, { id: 'x' }])).toHaveLength(1)
  })
})
