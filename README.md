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
1. Supabase: run the files in `supabase/migrations` in order; deploy `food-ai`, `food-catalog` and `food-recipe` (Verify JWT on) and `food-pay` (Verify JWT off).
   Secrets: `ANTHROPIC_API_KEY`, `PAYSTACK_SECRET_KEY`, optional `YOUTUBE_API_KEY`. Auth > URL configuration: set the Site URL to the live address.
2. Netlify: build from this repo; set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`.
3. Prices and daily Ask AI limits are in the `settings` table.

## Data
- `scripts/countries.py` writes the country list; `scripts/foods.txt` holds the starter menus and `scripts/foods.py` checks them and writes the seed.
- Tests: `npm test` (planner rules, voice helpers).
