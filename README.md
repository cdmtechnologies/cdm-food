# CDM Food

A meal planner for every country, by CDM Technologies.

- Pick a country and its dishes load (starter menus for 25 countries; any other country's menu is prepared by AI the first time it is opened, then shared).
- "Fill my week" plans breakfast, lunch, dinner and snacks to suit the person's diet, allergies, health goals and calorie target.
- Ask AI (with the CDM robot) changes the plan on request, adds foods that are missing and answers food questions.
- People can add their own foods, with AI-estimated nutrition.
- Premium (Paystack, ₦ or $): recipes with step-by-step cooking mode and short cooking videos, full shopping list and more Ask AI questions each day.
  Recipes are written once per dish by AI (`food-recipe` function) and kept for everyone. Videos need the optional
  `YOUTUBE_API_KEY` secret (YouTube Data API v3, free quota); without it the app links to a YouTube search instead.

Nutrition figures are approximate. CDM Food gives general healthy-eating guidance, not medical advice.

## Stack
React + TypeScript + Tailwind (Vite), Supabase (Postgres with row-level security, Auth, Edge Functions), Netlify.

## Set up
1. Supabase: run the files in `supabase/migrations` in order; deploy `food-ai`, `food-catalog` and `food-recipe` (Verify JWT on), `food-i18n` (Verify JWT off) and `food-pay` (Verify JWT off).
   Secrets: `ANTHROPIC_API_KEY`, `PAYSTACK_SECRET_KEY`, optional `YOUTUBE_API_KEY`. Auth > URL configuration: set the Site URL to the live address.
2. Netlify: build from this repo; set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`.
3. Prices and daily Ask AI limits are in the `settings` table.

## Data
- `scripts/countries.py` writes the country list; `scripts/foods.txt` holds the starter menus and `scripts/foods.py` checks them and writes the seed.
- Tests: `npm test` (planner rules, voice helpers).

## Languages
- Every piece of text is written in English inside `t('...')` (or marked `/*i18n*/ '...'` in lists). `src/i18n/strings.json` holds them all.
- After changing text run `node scripts/i18n-extract.mjs && sh scripts/sync-shared.sh` and commit both.
- 100+ languages; each country's main languages are listed first (`src/i18n/languages.ts`). Arabic, Urdu, Persian, Pashto, Hebrew and Dhivehi switch the layout to right-to-left.
- The first person to choose a language triggers `food-i18n`, which translates the app once with AI into `ui_strings`; everyone after that loads it straight from the table. Ask AI and recipes answer in the chosen language.

## Progress
- Body details (sex, year of birth, height, weight, target weight, activity; kg/cm or lb/ft) give BMI, a healthy-weight range and a daily calorie target (Mifflin-St Jeor; at most 500 kcal under maintenance, never below 1,200/1,500, no cuts for under-18s or targets below a healthy weight).
- Weigh-ins are kept in `weights`; the newest becomes the profile's weight.
- Each meal can be ticked as eaten, skipped or "had something else" (another food, or a note with calories). Ticked meals stay when a week is filled or cleared, and the day shows what was really eaten.
