#!/bin/sh
# Copies the shared code into the edge functions (Deno needs ".ts" on imports). Run after changing src/lib or src/i18n.
set -e
cd "$(dirname "$0")/.."
F=supabase/functions
for f in planner body; do sed "s#from './body'#from './body.ts'#" src/lib/$f.ts > $F/food-ai/$f.ts; done
cp src/lib/recipe.ts $F/food-recipe/recipe.ts
for d in food-ai food-recipe food-i18n; do cp src/i18n/languages.ts $F/$d/languages.ts; done
cp src/i18n/strings.json $F/food-i18n/strings.json
echo "shared code copied"
