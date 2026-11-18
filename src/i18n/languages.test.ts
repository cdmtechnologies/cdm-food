import { describe, expect, it } from 'vitest'
import COUNTRIES from '../lib/countries.json'
import { countryLangs, fromBrowser, isLang, langLabel, LANGS } from './languages'

describe('languages', () => {
  it('gives every country a known language, its main one first', () => {
    for (const [code] of COUNTRIES as [string][]) for (const l of countryLangs(code)) expect(isLang(l)).toBe(true)
    expect(countryLangs('NG')).toEqual(['en', 'ha', 'yo', 'ig', 'pcm'])
    expect(countryLangs('FR')[0]).toBe('fr')
    expect(countryLangs('SA')[0]).toBe('ar')
    expect(countryLangs('CN')[0]).toBe('zh-Hans')
    expect(countryLangs(null)).toEqual(['en'])
  })
  it('has no duplicate languages and marks right-to-left ones', () => {
    expect(new Set(LANGS.map((l) => l.code)).size).toBe(LANGS.length)
    expect(LANGS.find((l) => l.code === 'ar')?.rtl).toBe(true)
    expect(LANGS.find((l) => l.code === 'fr')?.rtl).toBe(undefined)
  })
  it('matches browser settings', () => {
    expect(fromBrowser(['fr-CA', 'en'])).toBe('fr')
    expect(fromBrowser(['zh-TW'])).toBe('zh-Hant')
    expect(fromBrowser(['zh-CN'])).toBe('zh-Hans')
    expect(fromBrowser(['nn-NO'])).toBe('nb')
    expect(fromBrowser(['xx'])).toBe('en')
  })
  it('names languages for the AI', () => {
    expect(langLabel('sw')).toBe('Swahili (Kiswahili)')
    expect(langLabel('en')).toBe('English')
  })
})
