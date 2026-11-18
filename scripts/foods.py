"""Checks scripts/foods.txt and writes supabase/migrations/..._foods.sql.  Run: python3 scripts/foods.py"""
from pathlib import Path

TAGS = set('meat poultry fish shellfish pork dairy egg nuts gluten soy sesame alcohol '
           'high_protein high_fibre low_carb low_gi whole_grain light fried sugary high_salt spicy'.split())
MEALS = {'B': 'breakfast', 'L': 'lunch', 'D': 'dinner', 'S': 'snack'}
root = Path(__file__).resolve().parent.parent
rows, problems = [], []
for n, line in enumerate((root / 'scripts/foods.txt').read_text().splitlines(), 1):
    if not line.strip() or line.startswith('#'):
        continue
    f = line.split('|')
    if len(f) != 14:
        problems.append(f'line {n}: {len(f)} fields'); continue
    cc, name, meals, serving, kcal, p, c, fat, fib, tags, ingr, cost, mins, desc = f
    tags = tags.split()
    bad = [t for t in tags if t not in TAGS]
    if bad: problems.append(f'line {n} {name}: unknown tags {bad}')
    if any(m not in MEALS for m in meals): problems.append(f'line {n} {name}: bad meals {meals}')
    kcal, p, c, fat, fib = int(kcal), float(p), float(c), float(fat), float(fib)
    est = 4 * p + 4 * c + 9 * fat
    if abs(est - kcal) / kcal > 0.22: problems.append(f'line {n} {name}: kcal {kcal} vs macros {est:.0f}')
    rows.append(dict(cc=cc, name=name, meals=[MEALS[m] for m in meals], serving=serving, kcal=kcal, p=p, c=c, fat=fat, fib=fib,
                     tags=tags, ingr=[i.strip() for i in ingr.split(',') if i.strip()], cost=int(cost), mins=int(mins), desc=desc))

names = [(r['cc'], r['name'].lower()) for r in rows]
dupes = {x for x in names if names.count(x) > 1}
if dupes: problems.append(f'duplicates: {dupes}')
for pr in problems: print('CHECK', pr)

q = lambda s: "'" + s.replace("'", "''") + "'"
arr = lambda xs: "ARRAY[" + ', '.join(q(x) for x in xs) + "]::text[]" if xs else "'{}'::text[]"
vals = [f"  ({q(r['cc'])}, {q(r['name'])}, {q(r['desc'])}, {arr(r['meals'])}, {q(r['serving'])}, {r['kcal']}, {r['p']}, {r['c']}, {r['fat']}, {r['fib']}, "
        f"{arr(r['tags'])}, {arr(r['ingr'])}, {r['cost']}, {r['mins']}, 'cdm')" for r in rows]
countries = sorted({r['cc'] for r in rows})
sql = ['-- CDM Food starter menus (from scripts/foods.txt). Nutrition is approximate, per typical serving.',
       'INSERT INTO public.foods (country_code, name, description, meals, serving, kcal, protein_g, carbs_g, fat_g, fibre_g, tags, ingredients, cost_level, prep_minutes, source) VALUES',
       ',\n'.join(vals),
       'ON CONFLICT DO NOTHING;',
       f"UPDATE public.countries SET menu_status = 'ready', menu_source = 'cdm', updated_at = now() WHERE code IN ({', '.join(q(c) for c in countries)});"]
(root / 'supabase/migrations/20261118100200_foods.sql').write_text('\n'.join(sql) + '\n')
print(len(rows), 'foods in', len(countries), 'countries:', ' '.join(f'{c}:{sum(1 for r in rows if r["cc"] == c)}' for c in countries))
