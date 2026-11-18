-- Recipes and cooking videos (Premium).
-- A recipe is made once per food and language by AI and then shared by everyone who can see that food. Recipes for a person's own
-- foods stay private to them because the edge function only reads foods through that person's login.
-- Nobody reads this table directly: the food-recipe edge function checks Premium and then reads it with the service role.

CREATE TABLE public.recipes (
  food_id uuid NOT NULL REFERENCES public.foods (id) ON DELETE CASCADE,
  lang text NOT NULL DEFAULT 'en' CHECK (lang ~ '^[a-z]{2,3}(-[A-Za-z]{2,4})?$'),
  serves smallint NOT NULL CHECK (serves BETWEEN 1 AND 12),
  ingredients jsonb NOT NULL CHECK (jsonb_typeof(ingredients) = 'array' AND jsonb_array_length(ingredients) BETWEEN 1 AND 30),
  steps jsonb NOT NULL CHECK (jsonb_typeof(steps) = 'array' AND jsonb_array_length(steps) BETWEEN 1 AND 20),
  tips text[] NOT NULL DEFAULT '{}' CHECK (cardinality(tips) <= 6),
  total_minutes smallint CHECK (total_minutes BETWEEN 1 AND 1440),
  videos jsonb NOT NULL DEFAULT '[]' CHECK (jsonb_typeof(videos) = 'array' AND jsonb_array_length(videos) <= 6),
  videos_at timestamptz,
  source text NOT NULL DEFAULT 'ai' CHECK (source IN ('ai', 'cdm')),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (food_id, lang)
);
ALTER TABLE public.recipes ENABLE ROW LEVEL SECURITY;
-- no policies: only the service role (inside food-recipe) can read or write
REVOKE ALL ON public.recipes FROM anon, authenticated;

-- Premium-only daily recipe limit, so a single account cannot run up AI costs. Cached recipes do not count.
ALTER TABLE public.settings ADD COLUMN IF NOT EXISTS premium_recipes_daily integer NOT NULL DEFAULT 30;
ALTER TABLE public.ai_usage ADD COLUMN IF NOT EXISTS recipes integer NOT NULL DEFAULT 0;

-- One new recipe for a Premium person who is under today's limit. Service role only.
CREATE OR REPLACE FUNCTION public.recipe_take(p_user uuid)
RETURNS TABLE (allowed boolean, premium boolean)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_premium boolean; v_limit integer; v_used integer;
BEGIN
  SELECT coalesce(p.premium_until > now(), false) INTO v_premium FROM profiles p WHERE p.id = p_user;
  IF NOT coalesce(v_premium, false) THEN RETURN QUERY SELECT false, false; RETURN; END IF;
  SELECT s.premium_recipes_daily INTO v_limit FROM settings s;
  INSERT INTO ai_usage (user_id, day) VALUES (p_user, current_date) ON CONFLICT DO NOTHING;
  SELECT u.recipes INTO v_used FROM ai_usage u WHERE u.user_id = p_user AND u.day = current_date FOR UPDATE;
  IF v_used >= v_limit THEN RETURN QUERY SELECT false, true; RETURN; END IF;
  UPDATE ai_usage SET recipes = recipes + 1 WHERE user_id = p_user AND day = current_date;
  RETURN QUERY SELECT true, true;
END $$;
REVOKE ALL ON FUNCTION public.recipe_take(uuid) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.recipe_take(uuid) TO service_role;
