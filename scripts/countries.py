"""Writes supabase/migrations/..._countries.sql and src/lib/countries.json: every country with its region and currency.
Run: python3 scripts/countries.py  (needs the babel package for names and currencies)."""
import json
from pathlib import Path
from babel import Locale
from babel.numbers import get_territory_currencies

REGIONS = {
    'West Africa': 'BJ BF CV CI GM GH GN GW LR ML MR NE NG SN SL TG SH',
    'Central Africa': 'AO CM CF TD CG CD GQ GA ST',
    'East Africa': 'BI KM DJ ER ET KE MG MW MU YT MZ RE RW SC SO SS TZ UG ZM ZW SD',
    'Southern Africa': 'BW LS NA ZA SZ',
    'North Africa': 'DZ EG LY MA TN EH',
    'Middle East': 'BH IR IQ IL JO KW LB OM PS QA SA SY TR AE YE CY',
    'South Asia': 'AF BD BT IN MV NP PK LK',
    'East Asia': 'CN HK MO JP KP KR MN TW',
    'Southeast Asia': 'BN KH ID LA MY MM PH SG TH TL VN',
    'Central Asia': 'KZ KG TJ TM UZ AM AZ GE',
    'Europe': 'AL AD AT BY BE BA BG HR CZ DK EE FO FI FR DE GI GR GG HU IS IE IM IT JE LV LI LT LU MT MD MC ME NL MK NO PL PT RO RU SM RS SK SI ES SJ SE CH UA GB VA AX XK',
    'North America': 'US CA GL PM BM',
    'Latin America & Caribbean': 'AI AG AR AW BS BB BZ BO BQ BR VG KY CL CO CR CU CW DM DO EC SV FK GF GD GP GT GY HT HN JM MQ MX MS NI PA PY PE PR BL KN LC MF VC SX SR TT TC VI UY VE',
    'Oceania': 'AS AU CK FJ PF GU KI MH FM NR NC NZ NU NF MP PW PG PN WS SB TK TO TV VU WF CX CC',
}
SKIP = {'EU', 'EZ', 'UN', 'QO', 'XA', 'XB', 'ZZ', 'AQ', 'BV', 'HM', 'TF', 'UM', 'IO', 'GS', 'CP', 'DG', 'EA', 'IC', 'TA', 'AC', 'CQ'}
NAMES = {'CI': "Côte d'Ivoire", 'CD': 'DR Congo', 'CG': 'Congo', 'MM': 'Myanmar', 'HK': 'Hong Kong', 'MO': 'Macau',
         'PS': 'Palestine', 'KP': 'North Korea', 'KR': 'South Korea', 'US': 'United States', 'GB': 'United Kingdom'}

region_of = {c: r for r, codes in REGIONS.items() for c in codes.split()}
terr = Locale('en').territories
rows = []
for code, name in sorted(terr.items(), key=lambda x: x[1]):
    if len(code) != 2 or not code.isalpha() or code in SKIP:
        continue
    cur = get_territory_currencies(code)
    rows.append({'code': code, 'name': NAMES.get(code, name.replace('’', "'")), 'region': region_of.get(code, 'Other'), 'currency': cur[0] if cur else None})

root = Path(__file__).resolve().parent.parent
q = lambda s: 'NULL' if s is None else "'" + s.replace("'", "''") + "'"
sql = ['-- Every country, with its region and currency (from scripts/countries.py).',
       'INSERT INTO public.countries (code, name, region, currency) VALUES']
sql.append(',\n'.join(f"  ({q(r['code'])}, {q(r['name'])}, {q(r['region'])}, {q(r['currency'])})" for r in rows))
sql[-1] += '\nON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name, region = EXCLUDED.region, currency = EXCLUDED.currency;'
(root / 'supabase/migrations/20261118100100_countries.sql').write_text('\n'.join(sql) + '\n')
(root / 'src/lib/countries.json').write_text(json.dumps([[r['code'], r['name'], r['region']] for r in rows], ensure_ascii=False, separators=(',', ':')))
other = [r['code'] for r in rows if r['region'] == 'Other']
print(len(rows), 'countries;', 'no region:', other)
