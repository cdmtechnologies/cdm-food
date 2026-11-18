-- Body measurements, a weight log, ticking meals as eaten / skipped / something else, and app languages.

-- ---------- body measurements and language on the profile ----------
ALTER TABLE public.profiles
  ADD COLUMN sex text CHECK (sex IN ('female', 'male')),
  ADD COLUMN birth_year smallint CHECK (birth_year BETWEEN 1900 AND 2100),
  ADD COLUMN height_cm numeric(5, 1) CHECK (height_cm BETWEEN 50 AND 260),
  ADD COLUMN weight_kg numeric(5, 1) CHECK (weight_kg BETWEEN 20 AND 400),
  ADD COLUMN target_weight_kg numeric(5, 1) CHECK (target_weight_kg BETWEEN 20 AND 400),
  ADD COLUMN activity text CHECK (activity IN ('sedentary', 'light', 'moderate', 'active', 'very_active')),
  ADD COLUMN units text NOT NULL DEFAULT 'metric' CHECK (units IN ('metric', 'imperial')),
  ADD COLUMN language text NOT NULL DEFAULT 'en' CHECK (language ~ '^[a-z]{2,3}(-[A-Za-z]{2,4})?$');

GRANT INSERT (sex, birth_year, height_cm, weight_kg, target_weight_kg, activity, units, language) ON public.profiles TO authenticated;
GRANT UPDATE (sex, birth_year, height_cm, weight_kg, target_weight_kg, activity, units, language) ON public.profiles TO authenticated;

-- ---------- weight log ----------
CREATE TABLE public.weights (
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users (id) ON DELETE CASCADE,
  day date NOT NULL,
  kg numeric(5, 1) NOT NULL CHECK (kg BETWEEN 20 AND 400),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, day),
  CHECK (day BETWEEN date '2020-01-01' AND date '2100-01-01')
);
ALTER TABLE public.weights ENABLE ROW LEVEL SECURITY;
CREATE POLICY weights_own ON public.weights FOR ALL TO authenticated
  USING (user_id = (SELECT auth.uid())) WITH CHECK (user_id = (SELECT auth.uid()));
REVOKE ALL ON public.weights FROM anon;

-- no weigh-ins in the future
CREATE OR REPLACE FUNCTION public.weights_check() RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.day > current_date + 1 THEN RAISE EXCEPTION 'That date is in the future.'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER weights_check BEFORE INSERT OR UPDATE ON public.weights FOR EACH ROW EXECUTE FUNCTION public.weights_check();

-- the newest weigh-in becomes the profile's current weight
CREATE OR REPLACE FUNCTION public.weights_sync() RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
DECLARE v_user uuid := coalesce(NEW.user_id, OLD.user_id);
BEGIN
  UPDATE profiles p SET weight_kg = w.kg, updated_at = now()
    FROM (SELECT kg FROM weights WHERE user_id = v_user ORDER BY day DESC LIMIT 1) w
   WHERE p.id = v_user;
  RETURN NULL;
END $$;
CREATE TRIGGER weights_after AFTER INSERT OR UPDATE OR DELETE ON public.weights FOR EACH ROW EXECUTE FUNCTION public.weights_sync();
REVOKE ALL ON FUNCTION public.weights_check() FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION public.weights_sync() FROM public, anon, authenticated;

-- ---------- what was really eaten ----------
ALTER TABLE public.plan_items
  ADD COLUMN status text NOT NULL DEFAULT 'planned' CHECK (status IN ('planned', 'eaten', 'skipped', 'swapped')),
  ADD COLUMN ate_food_id uuid REFERENCES public.foods (id) ON DELETE SET NULL,
  ADD COLUMN ate_servings numeric(4, 2) CHECK (ate_servings > 0 AND ate_servings <= 20),
  ADD COLUMN ate_note text CHECK (length(ate_note) <= 200),
  ADD COLUMN ate_kcal integer CHECK (ate_kcal BETWEEN 0 AND 5000),
  ADD COLUMN status_at timestamptz,
  ADD CONSTRAINT plan_items_swap_has_detail CHECK (status <> 'swapped' OR ate_food_id IS NOT NULL OR length(trim(ate_note)) > 0);
CREATE INDEX plan_items_ate_food ON public.plan_items (ate_food_id) WHERE ate_food_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.plan_items_check() RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.day < current_date - 400 OR NEW.day > current_date + 400 THEN RAISE EXCEPTION 'That date is too far away.'; END IF;
  IF NOT EXISTS (SELECT 1 FROM foods f WHERE f.id = NEW.food_id AND (f.owner_id IS NULL OR f.owner_id = NEW.user_id)) THEN
    RAISE EXCEPTION 'That food is not available.';
  END IF;
  IF NEW.ate_food_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM foods f WHERE f.id = NEW.ate_food_id AND (f.owner_id IS NULL OR f.owner_id = NEW.user_id)) THEN
    RAISE EXCEPTION 'That food is not available.';
  END IF;
  IF NEW.status <> 'planned' AND NEW.day > current_date + 1 THEN RAISE EXCEPTION 'You can only tick meals for today or earlier.'; END IF;
  IF NEW.status = 'planned' THEN NEW.ate_food_id := NULL; NEW.ate_servings := NULL; NEW.ate_note := NULL; NEW.ate_kcal := NULL; NEW.status_at := NULL;
  ELSIF TG_OP = 'INSERT' OR NEW.status IS DISTINCT FROM OLD.status OR NEW.ate_food_id IS DISTINCT FROM OLD.ate_food_id THEN NEW.status_at := now();
  END IF;
  IF NEW.status <> 'swapped' THEN NEW.ate_food_id := NULL; NEW.ate_servings := NULL; NEW.ate_kcal := NULL; END IF;
  IF TG_OP = 'INSERT' AND (SELECT count(*) FROM plan_items WHERE user_id = NEW.user_id AND day = NEW.day AND meal = NEW.meal) >= 10 THEN
    RAISE EXCEPTION 'A meal can hold up to 10 foods.';
  END IF;
  RETURN NEW;
END $$;

-- ---------- app languages ----------
-- Translations of the app's English text, made once per language by the food-i18n function. Everyone can read them.
CREATE TABLE public.ui_strings (
  lang text NOT NULL CHECK (lang ~ '^[a-z]{2,3}(-[A-Za-z]{2,4})?$'),
  key text NOT NULL CHECK (length(key) <= 600),
  text text NOT NULL CHECK (length(text) <= 1200),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (lang, key)
);
ALTER TABLE public.ui_strings ENABLE ROW LEVEL SECURITY;
CREATE POLICY ui_strings_read ON public.ui_strings FOR SELECT TO anon, authenticated USING (true);
REVOKE INSERT, UPDATE, DELETE ON public.ui_strings FROM anon, authenticated;

-- so only one request translates a language at a time
CREATE TABLE public.ui_langs (
  lang text PRIMARY KEY,
  status text NOT NULL DEFAULT 'idle' CHECK (status IN ('idle', 'working')),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.ui_langs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.ui_langs FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public.claim_ui_lang(p_lang text) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO ui_langs (lang) VALUES (p_lang) ON CONFLICT DO NOTHING;
  UPDATE ui_langs SET status = 'working', updated_at = now()
   WHERE lang = p_lang AND (status = 'idle' OR updated_at < now() - interval '3 minutes');
  RETURN FOUND;
END $$;
CREATE OR REPLACE FUNCTION public.release_ui_lang(p_lang text) RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  UPDATE ui_langs SET status = 'idle', updated_at = now() WHERE lang = p_lang;
$$;
REVOKE ALL ON FUNCTION public.claim_ui_lang(text) FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION public.release_ui_lang(text) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_ui_lang(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.release_ui_lang(text) TO service_role;
