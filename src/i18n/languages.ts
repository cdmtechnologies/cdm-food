// The languages CDM Food speaks, and the main languages of each country (the first one is the default there).
// Shared with the food-i18n, food-ai and food-recipe edge functions (copied next to them).

export type Lang = { code: string; name: string; native: string; rtl?: boolean }

export const LANGS: Lang[] = [
  { code: 'en', name: 'English', native: 'English' },
  { code: 'fr', name: 'French', native: 'Français' },
  { code: 'es', name: 'Spanish', native: 'Español' },
  { code: 'pt', name: 'Portuguese', native: 'Português' },
  { code: 'ar', name: 'Arabic', native: 'العربية', rtl: true },
  { code: 'zh-Hans', name: 'Chinese (Simplified)', native: '简体中文' },
  { code: 'zh-Hant', name: 'Chinese (Traditional)', native: '繁體中文' },
  { code: 'hi', name: 'Hindi', native: 'हिन्दी' },
  { code: 'bn', name: 'Bengali', native: 'বাংলা' },
  { code: 'ur', name: 'Urdu', native: 'اردو', rtl: true },
  { code: 'ru', name: 'Russian', native: 'Русский' },
  { code: 'de', name: 'German', native: 'Deutsch' },
  { code: 'it', name: 'Italian', native: 'Italiano' },
  { code: 'nl', name: 'Dutch', native: 'Nederlands' },
  { code: 'tr', name: 'Turkish', native: 'Türkçe' },
  { code: 'fa', name: 'Persian', native: 'فارسی', rtl: true },
  { code: 'ps', name: 'Pashto', native: 'پښتو', rtl: true },
  { code: 'he', name: 'Hebrew', native: 'עברית', rtl: true },
  { code: 'ja', name: 'Japanese', native: '日本語' },
  { code: 'ko', name: 'Korean', native: '한국어' },
  { code: 'id', name: 'Indonesian', native: 'Bahasa Indonesia' },
  { code: 'ms', name: 'Malay', native: 'Bahasa Melayu' },
  { code: 'vi', name: 'Vietnamese', native: 'Tiếng Việt' },
  { code: 'th', name: 'Thai', native: 'ไทย' },
  { code: 'fil', name: 'Filipino', native: 'Filipino' },
  { code: 'sw', name: 'Swahili', native: 'Kiswahili' },
  { code: 'ha', name: 'Hausa', native: 'Hausa' },
  { code: 'yo', name: 'Yoruba', native: 'Yorùbá' },
  { code: 'ig', name: 'Igbo', native: 'Igbo' },
  { code: 'pcm', name: 'Nigerian Pidgin', native: 'Naijá' },
  { code: 'am', name: 'Amharic', native: 'አማርኛ' },
  { code: 'om', name: 'Oromo', native: 'Afaan Oromoo' },
  { code: 'ti', name: 'Tigrinya', native: 'ትግርኛ' },
  { code: 'so', name: 'Somali', native: 'Soomaali' },
  { code: 'zu', name: 'Zulu', native: 'isiZulu' },
  { code: 'xh', name: 'Xhosa', native: 'isiXhosa' },
  { code: 'af', name: 'Afrikaans', native: 'Afrikaans' },
  { code: 'st', name: 'Sesotho', native: 'Sesotho' },
  { code: 'tn', name: 'Setswana', native: 'Setswana' },
  { code: 'sn', name: 'Shona', native: 'chiShona' },
  { code: 'ny', name: 'Chichewa', native: 'Chichewa' },
  { code: 'rw', name: 'Kinyarwanda', native: 'Ikinyarwanda' },
  { code: 'rn', name: 'Kirundi', native: 'Ikirundi' },
  { code: 'lg', name: 'Luganda', native: 'Luganda' },
  { code: 'ak', name: 'Twi (Akan)', native: 'Twi' },
  { code: 'wo', name: 'Wolof', native: 'Wolof' },
  { code: 'bm', name: 'Bambara', native: 'Bamanankan' },
  { code: 'ln', name: 'Lingala', native: 'Lingála' },
  { code: 'sg', name: 'Sango', native: 'Sängö' },
  { code: 'mg', name: 'Malagasy', native: 'Malagasy' },
  { code: 'pl', name: 'Polish', native: 'Polski' },
  { code: 'uk', name: 'Ukrainian', native: 'Українська' },
  { code: 'ro', name: 'Romanian', native: 'Română' },
  { code: 'el', name: 'Greek', native: 'Ελληνικά' },
  { code: 'cs', name: 'Czech', native: 'Čeština' },
  { code: 'sk', name: 'Slovak', native: 'Slovenčina' },
  { code: 'hu', name: 'Hungarian', native: 'Magyar' },
  { code: 'sv', name: 'Swedish', native: 'Svenska' },
  { code: 'nb', name: 'Norwegian', native: 'Norsk' },
  { code: 'da', name: 'Danish', native: 'Dansk' },
  { code: 'fi', name: 'Finnish', native: 'Suomi' },
  { code: 'is', name: 'Icelandic', native: 'Íslenska' },
  { code: 'fo', name: 'Faroese', native: 'Føroyskt' },
  { code: 'kl', name: 'Greenlandic', native: 'Kalaallisut' },
  { code: 'et', name: 'Estonian', native: 'Eesti' },
  { code: 'lv', name: 'Latvian', native: 'Latviešu' },
  { code: 'lt', name: 'Lithuanian', native: 'Lietuvių' },
  { code: 'bg', name: 'Bulgarian', native: 'Български' },
  { code: 'sr', name: 'Serbian', native: 'Српски' },
  { code: 'hr', name: 'Croatian', native: 'Hrvatski' },
  { code: 'bs', name: 'Bosnian', native: 'Bosanski' },
  { code: 'sl', name: 'Slovenian', native: 'Slovenščina' },
  { code: 'mk', name: 'Macedonian', native: 'Македонски' },
  { code: 'sq', name: 'Albanian', native: 'Shqip' },
  { code: 'mt', name: 'Maltese', native: 'Malti' },
  { code: 'lb', name: 'Luxembourgish', native: 'Lëtzebuergesch' },
  { code: 'ca', name: 'Catalan', native: 'Català' },
  { code: 'be', name: 'Belarusian', native: 'Беларуская' },
  { code: 'ka', name: 'Georgian', native: 'ქართული' },
  { code: 'hy', name: 'Armenian', native: 'Հայերեն' },
  { code: 'az', name: 'Azerbaijani', native: 'Azərbaycan' },
  { code: 'kk', name: 'Kazakh', native: 'Қазақ' },
  { code: 'uz', name: 'Uzbek', native: 'Oʻzbek' },
  { code: 'ky', name: 'Kyrgyz', native: 'Кыргызча' },
  { code: 'tg', name: 'Tajik', native: 'Тоҷикӣ' },
  { code: 'tk', name: 'Turkmen', native: 'Türkmen' },
  { code: 'mn', name: 'Mongolian', native: 'Монгол' },
  { code: 'ne', name: 'Nepali', native: 'नेपाली' },
  { code: 'si', name: 'Sinhala', native: 'සිංහල' },
  { code: 'ta', name: 'Tamil', native: 'தமிழ்' },
  { code: 'dz', name: 'Dzongkha', native: 'རྫོང་ཁ' },
  { code: 'dv', name: 'Dhivehi', native: 'ދިވެހި', rtl: true },
  { code: 'my', name: 'Burmese', native: 'မြန်မာ' },
  { code: 'km', name: 'Khmer', native: 'ខ្មែរ' },
  { code: 'lo', name: 'Lao', native: 'ລາວ' },
  { code: 'tet', name: 'Tetum', native: 'Tetun' },
  { code: 'ht', name: 'Haitian Creole', native: 'Kreyòl ayisyen' },
  { code: 'gn', name: 'Guarani', native: 'Avañeʼẽ' },
  { code: 'sm', name: 'Samoan', native: 'Gagana Samoa' },
  { code: 'to', name: 'Tongan', native: 'Lea faka-Tonga' },
  { code: 'bi', name: 'Bislama', native: 'Bislama' },
  { code: 'mi', name: 'Māori', native: 'Te reo Māori' },
]
export const LANG_BY_CODE = new Map(LANGS.map((l) => [l.code, l]))
export const isLang = (code: unknown): code is string => typeof code === 'string' && LANG_BY_CODE.has(code)

// Main languages by country (first = default). Countries not listed use English.
const C: Record<string, string> = {
  AF: 'fa ps', AL: 'sq', DZ: 'ar fr', AD: 'ca es fr', AO: 'pt', AR: 'es', AM: 'hy ru', AW: 'nl es', AT: 'de', AZ: 'az ru',
  BH: 'ar', BD: 'bn', BY: 'ru be', BE: 'nl fr de', BJ: 'fr yo', BT: 'dz', BO: 'es', BA: 'bs hr sr', BW: 'en tn', BR: 'pt',
  BN: 'ms', BG: 'bg', BF: 'fr', BI: 'rn fr', KH: 'km', CM: 'fr en', CA: 'en fr', CV: 'pt', BQ: 'nl', CF: 'fr sg', TD: 'fr ar',
  CL: 'es', CN: 'zh-Hans', CO: 'es', KM: 'fr ar', CG: 'fr ln', CD: 'fr ln sw', CR: 'es', HR: 'hr', CU: 'es', CW: 'nl', CY: 'el tr',
  CZ: 'cs', CI: 'fr', DK: 'da', DJ: 'fr ar so', DO: 'es', EC: 'es', EG: 'ar', SV: 'es', GQ: 'es fr', ER: 'ti ar', EE: 'et',
  SZ: 'en', ET: 'am om', FO: 'fo da', FI: 'fi sv', FR: 'fr', GF: 'fr', PF: 'fr', GA: 'fr', GM: 'en', GE: 'ka', DE: 'de',
  GH: 'en ak', GR: 'el', GL: 'kl da', GP: 'fr', GT: 'es', GN: 'fr', GW: 'pt', HT: 'ht fr', HN: 'es', HK: 'zh-Hant en',
  HU: 'hu', IS: 'is', IN: 'hi en bn ta', ID: 'id', IR: 'fa', IQ: 'ar', IL: 'he ar', IT: 'it', JP: 'ja', JO: 'ar', KZ: 'kk ru',
  KE: 'sw en', XK: 'sq sr', KW: 'ar', KG: 'ky ru', LA: 'lo', LV: 'lv', LB: 'ar fr', LS: 'st en', LR: 'en', LY: 'ar', LI: 'de',
  LT: 'lt', LU: 'lb fr de', MO: 'zh-Hant pt', MG: 'mg fr', MW: 'en ny', MY: 'ms en', MV: 'dv', ML: 'fr bm', MT: 'mt en',
  MQ: 'fr', MR: 'ar fr', MU: 'en fr', YT: 'fr', MX: 'es', MD: 'ro ru', MC: 'fr', MN: 'mn', ME: 'sr', MA: 'ar fr', MZ: 'pt',
  MM: 'my', NA: 'en af', NP: 'ne', NL: 'nl', NC: 'fr', NZ: 'en mi', NI: 'es', NE: 'fr ha', NG: 'en ha yo ig pcm', KP: 'ko',
  MK: 'mk sq', NO: 'nb', OM: 'ar', PK: 'ur en', PS: 'ar', PA: 'es', PY: 'es gn', PE: 'es', PH: 'fil en', PL: 'pl', PT: 'pt',
  PR: 'es en', QA: 'ar', RO: 'ro', RU: 'ru', RW: 'rw en fr', RE: 'fr', WS: 'sm en', SM: 'it', SA: 'ar', SN: 'fr wo', RS: 'sr',
  SC: 'en fr', SL: 'en', SG: 'en zh-Hans ms ta', SX: 'nl en', SK: 'sk', SI: 'sl', SO: 'so ar', ZA: 'en zu xh af st', KR: 'ko',
  SS: 'en', ES: 'es ca', LK: 'si ta', BL: 'fr', MF: 'fr', PM: 'fr', SD: 'ar en', SR: 'nl', SJ: 'nb', SE: 'sv', CH: 'de fr it',
  SY: 'ar', ST: 'pt', TW: 'zh-Hant', TJ: 'tg ru', TZ: 'sw en', TH: 'th', TL: 'tet pt', TG: 'fr', TO: 'to en', TN: 'ar fr',
  TM: 'tk ru', TR: 'tr', UG: 'en sw lg', UA: 'uk', AE: 'ar en', UY: 'es', UZ: 'uz ru', VU: 'bi en fr', VA: 'it', VE: 'es',
  VN: 'vi', WF: 'fr', EH: 'ar es', YE: 'ar', ZM: 'en', ZW: 'en sn', AX: 'sv',
}
/** The main languages of a country, default first. */
export const countryLangs = (code: string | null | undefined): string[] => (code && C[code] ? C[code].split(' ').filter(isLang) : ['en'])

/** Best language for a browser setting such as "fr-CA" or "zh-TW". */
export function fromBrowser(tags: readonly string[]): string {
  for (const raw of tags) {
    const tag = raw.toLowerCase()
    if (tag.startsWith('zh')) return /tw|hk|mo|hant/.test(tag) ? 'zh-Hant' : 'zh-Hans'
    if (tag.startsWith('no') || tag.startsWith('nn')) return 'nb'
    if (tag.startsWith('tl')) return 'fil'
    const base = tag.split('-')[0]
    if (isLang(base)) return base
  }
  return 'en'
}

/** "Swahili (Kiswahili)" for the AI's instructions. */
export const langLabel = (code: string) => { const l = LANG_BY_CODE.get(code) ?? LANGS[0]; return l.native === l.name ? l.name : `${l.name} (${l.native})` }
