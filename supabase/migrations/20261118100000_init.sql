-- CDM Food: meal planner for every country.
-- Catalogue foods are shared and read-only for users; each person's own foods, plan and settings are private
-- to them (row-level security). Writes that need checks (AI, payments, country menus) go through edge functions.

-- ---------- countries ----------
CREATE TABLE public.countries (
  code text PRIMARY KEY CHECK (code ~ '^[A-Z]{2}$'),
  name text NOT NULL,
  region text NOT NULL,
  currency text,
  menu_status text NOT NULL DEFAULT 'empty' CHECK (menu_status IN ('empty', 'generating', 'ready')),
  menu_source text CHECK (menu_source IN ('cdm', 'ai')),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.countries ENABLE ROW LEVEL SECURITY;
CREATE POLICY countries_read ON public.countries FOR SELECT TO anon, authenticated USING (true);
REVOKE INSERT, UPDATE, DELETE ON public.countries FROM anon, authenticated;

-- ---------- foods ----------
-- Nutrition is per serving and approximate. owner_id is null for catalogue foods, or the person who added a private food.
CREATE TABLE public.foods (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  country_code text REFERENCES public.countries (code),
  name text NOT NULL CHECK (length(name) BETWEEN 1 AND 120),
  local_name text CHECK (length(local_name) <= 120),
  description text CHECK (length(description) <= 400),
  meals text[] NOT NULL DEFAULT '{lunch,dinner}' CHECK (meals <@ ARRAY['breakfast', 'lunch', 'dinner', 'snack']::text[] AND cardinality(meals) > 0),
  serving text CHECK (length(serving) <= 60),
  kcal integer CHECK (kcal BETWEEN 0 AND 3000),
  protein_g numeric(6, 1) CHECK (protein_g BETWEEN 0 AND 300),
  carbs_g numeric(6, 1) CHECK (carbs_g BETWEEN 0 AND 500),
  fat_g numeric(6, 1) CHECK (fat_g BETWEEN 0 AND 300),
  fibre_g numeric(6, 1) CHECK (fibre_g BETWEEN 0 AND 100),
  tags text[] NOT NULL DEFAULT '{}' CHECK (cardinality(tags) <= 20),
  ingredients text[] NOT NULL DEFAULT '{}' CHECK (cardinality(ingredients) <= 25),
  cost_level smallint CHECK (cost_level BETWEEN 1 AND 3),
  prep_minutes smallint CHECK (prep_minutes BETWEEN 0 AND 1440),
  source text NOT NULL DEFAULT 'cdm' CHECK (source IN ('cdm', 'ai', 'user')),
  owner_id uuid REFERENCES auth.users (id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((source = 'user') = (owner_id IS NOT NULL))
);
CREATE INDEX foods_country ON public.foods (country_code) WHERE owner_id IS NULL;
CREATE INDEX foods_owner ON public.foods (owner_id) WHERE owner_id IS NOT NULL;
CREATE UNIQUE INDEX foods_catalogue_name ON public.foods (country_code, lower(name)) WHERE owner_id IS NULL;
ALTER TABLE public.foods ENABLE ROW LEVEL SECURITY;
CREATE POLICY foods_read ON public.foods FOR SELECT TO anon, authenticated
  USING (owner_id IS NULL OR owner_id = (SELECT auth.uid()));
CREATE POLICY foods_insert_own ON public.foods FOR INSERT TO authenticated
  WITH CHECK (owner_id = (SELECT auth.uid()) AND source = 'user');
CREATE POLICY foods_update_own ON public.foods FOR UPDATE TO authenticated
  USING (owner_id = (SELECT auth.uid())) WITH CHECK (owner_id = (SELECT auth.uid()) AND source = 'user');
CREATE POLICY foods_delete_own ON public.foods FOR DELETE TO authenticated USING (owner_id = (SELECT auth.uid()));
REVOKE ALL ON public.foods FROM anon;
GRANT SELECT ON public.foods TO anon;

-- a person may keep up to 500 foods of their own
CREATE OR REPLACE FUNCTION public.foods_limit() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.owner_id IS NOT NULL AND (SELECT count(*) FROM foods WHERE owner_id = NEW.owner_id) >= 500 THEN
    RAISE EXCEPTION 'You can keep up to 500 foods of your own.';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER foods_limit BEFORE INSERT ON public.foods FOR EACH ROW EXECUTE FUNCTION public.foods_limit();

-- ---------- profiles ----------
CREATE TABLE public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users (id) ON DELETE CASCADE,
  display_name text CHECK (length(display_name) <= 80),
  country_code text REFERENCES public.countries (code),
  household integer NOT NULL DEFAULT 1 CHECK (household BETWEEN 1 AND 20),
  diet text NOT NULL DEFAULT 'none' CHECK (diet IN ('none', 'vegetarian', 'vegan', 'pescatarian', 'halal', 'no_pork')),
  allergies text[] NOT NULL DEFAULT '{}' CHECK (allergies <@ ARRAY['nuts', 'dairy', 'gluten', 'egg', 'fish', 'shellfish', 'soy', 'sesame']::text[]),
  goals text[] NOT NULL DEFAULT '{}' CHECK (goals <@ ARRAY['lose_weight', 'gain_weight', 'muscle', 'diabetes', 'blood_pressure', 'cholesterol', 'pregnancy', 'heart', 'kidney', 'budget']::text[]),
  daily_kcal integer CHECK (daily_kcal BETWEEN 800 AND 5000),
  meals text[] NOT NULL DEFAULT '{breakfast,lunch,dinner}' CHECK (meals <@ ARRAY['breakfast', 'lunch', 'dinner', 'snack']::text[] AND cardinality(meals) > 0),
  notes text CHECK (length(notes) <= 500),
  premium_until timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY profiles_own_read ON public.profiles FOR SELECT TO authenticated USING (id = (SELECT auth.uid()));
CREATE POLICY profiles_own_insert ON public.profiles FOR INSERT TO authenticated WITH CHECK (id = (SELECT auth.uid()));
CREATE POLICY profiles_own_update ON public.profiles FOR UPDATE TO authenticated USING (id = (SELECT auth.uid())) WITH CHECK (id = (SELECT auth.uid()));
-- people can change their settings but never their own premium date
REVOKE ALL ON public.profiles FROM anon, authenticated;
GRANT SELECT ON public.profiles TO authenticated;
GRANT INSERT (id, display_name, country_code, household, diet, allergies, goals, daily_kcal, meals, notes) ON public.profiles TO authenticated;
GRANT UPDATE (display_name, country_code, household, diet, allergies, goals, daily_kcal, meals, notes, updated_at) ON public.profiles TO authenticated;

-- a profile row for every new account
CREATE OR REPLACE FUNCTION public.handle_new_user() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO profiles (id, display_name) VALUES (NEW.id, left(coalesce(NEW.raw_user_meta_data ->> 'name', ''), 80)) ON CONFLICT DO NOTHING;
  RETURN NEW;
END $$;
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ---------- plan ----------
CREATE TABLE public.plan_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users (id) ON DELETE CASCADE,
  day date NOT NULL,
  meal text NOT NULL CHECK (meal IN ('breakfast', 'lunch', 'dinner', 'snack')),
  food_id uuid NOT NULL REFERENCES public.foods (id) ON DELETE CASCADE,
  servings numeric(4, 2) NOT NULL DEFAULT 1 CHECK (servings > 0 AND servings <= 20),
  position smallint NOT NULL DEFAULT 0 CHECK (position BETWEEN 0 AND 9),
  locked boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX plan_items_user_day ON public.plan_items (user_id, day);
ALTER TABLE public.plan_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY plan_own ON public.plan_items FOR ALL TO authenticated
  USING (user_id = (SELECT auth.uid())) WITH CHECK (user_id = (SELECT auth.uid()));
REVOKE ALL ON public.plan_items FROM anon;

-- at most 10 foods in one meal and a sensible date range
CREATE OR REPLACE FUNCTION public.plan_items_check() RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.day < current_date - 400 OR NEW.day > current_date + 400 THEN RAISE EXCEPTION 'That date is too far away.'; END IF;
  IF NOT EXISTS (SELECT 1 FROM foods f WHERE f.id = NEW.food_id AND (f.owner_id IS NULL OR f.owner_id = NEW.user_id)) THEN
    RAISE EXCEPTION 'That food is not available.';
  END IF;
  IF TG_OP = 'INSERT' AND (SELECT count(*) FROM plan_items WHERE user_id = NEW.user_id AND day = NEW.day AND meal = NEW.meal) >= 10 THEN
    RAISE EXCEPTION 'A meal can hold up to 10 foods.';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER plan_items_check BEFORE INSERT OR UPDATE ON public.plan_items FOR EACH ROW EXECUTE FUNCTION public.plan_items_check();

-- ---------- AI usage and payments (written only by the edge functions) ----------
CREATE TABLE public.ai_usage (
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  day date NOT NULL DEFAULT current_date,
  questions integer NOT NULL DEFAULT 0,
  input_tokens bigint NOT NULL DEFAULT 0,
  output_tokens bigint NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, day)
);
ALTER TABLE public.ai_usage ENABLE ROW LEVEL SECURITY;
CREATE POLICY ai_usage_own ON public.ai_usage FOR SELECT TO authenticated USING (user_id = (SELECT auth.uid()));
REVOKE INSERT, UPDATE, DELETE ON public.ai_usage FROM anon, authenticated;

CREATE TABLE public.payments (
  reference text PRIMARY KEY CHECK (length(reference) <= 100),
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  period text NOT NULL CHECK (period IN ('monthly', 'yearly')),
  amount numeric(12, 2) NOT NULL,
  currency text NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'paid', 'failed')),
  created_at timestamptz NOT NULL DEFAULT now(),
  paid_at timestamptz
);
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;
CREATE POLICY payments_own ON public.payments FOR SELECT TO authenticated USING (user_id = (SELECT auth.uid()));
REVOKE INSERT, UPDATE, DELETE ON public.payments FROM anon, authenticated;

-- prices CDM can change without a new release
CREATE TABLE public.settings (
  id boolean PRIMARY KEY DEFAULT true CHECK (id),
  price_monthly_ngn integer NOT NULL DEFAULT 2000,
  price_yearly_ngn integer NOT NULL DEFAULT 20000,
  price_monthly_usd numeric(8, 2) NOT NULL DEFAULT 3,
  price_yearly_usd numeric(8, 2) NOT NULL DEFAULT 30,
  free_ai_daily integer NOT NULL DEFAULT 3,
  premium_ai_daily integer NOT NULL DEFAULT 40
);
INSERT INTO public.settings DEFAULT VALUES;
ALTER TABLE public.settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY settings_read ON public.settings FOR SELECT TO anon, authenticated USING (true);
REVOKE INSERT, UPDATE, DELETE ON public.settings FROM anon, authenticated;

-- One AI question if the person is under today's limit (premium people get more). Service role only.
CREATE OR REPLACE FUNCTION public.ai_take_question(p_user uuid)
RETURNS TABLE (allowed boolean, used_today integer, daily_limit integer, premium boolean)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_used integer; v_premium boolean; v_limit integer;
BEGIN
  SELECT coalesce(p.premium_until > now(), false) INTO v_premium FROM profiles p WHERE p.id = p_user;
  v_premium := coalesce(v_premium, false);
  SELECT CASE WHEN v_premium THEN s.premium_ai_daily ELSE s.free_ai_daily END INTO v_limit FROM settings s;
  INSERT INTO ai_usage (user_id, day) VALUES (p_user, current_date) ON CONFLICT DO NOTHING;
  SELECT u.questions INTO v_used FROM ai_usage u WHERE u.user_id = p_user AND u.day = current_date FOR UPDATE;
  IF v_used >= v_limit THEN RETURN QUERY SELECT false, v_used, v_limit, v_premium; RETURN; END IF;
  UPDATE ai_usage SET questions = questions + 1 WHERE user_id = p_user AND day = current_date;
  RETURN QUERY SELECT true, v_used + 1, v_limit, v_premium;
END $$;

CREATE OR REPLACE FUNCTION public.ai_add_tokens(p_user uuid, p_in integer, p_out integer)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  UPDATE ai_usage SET input_tokens = input_tokens + greatest(p_in, 0), output_tokens = output_tokens + greatest(p_out, 0)
   WHERE user_id = p_user AND day = current_date;
$$;

-- A paid payment adds a month or a year of premium (from today, or from the current end if still premium). Service role only.
CREATE OR REPLACE FUNCTION public.apply_payment(p_reference text, p_amount numeric, p_currency text)
RETURNS timestamptz LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v payments; v_until timestamptz;
BEGIN
  SELECT * INTO v FROM payments WHERE reference = p_reference FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Unknown payment'; END IF;
  IF v.status = 'paid' THEN SELECT premium_until INTO v_until FROM profiles WHERE id = v.user_id; RETURN v_until; END IF;
  IF upper(p_currency) <> upper(v.currency) OR p_amount < v.amount THEN RAISE EXCEPTION 'Amount does not match'; END IF;
  UPDATE payments SET status = 'paid', paid_at = now() WHERE reference = p_reference;
  UPDATE profiles SET premium_until = greatest(coalesce(premium_until, now()), now()) + CASE WHEN v.period = 'yearly' THEN interval '1 year' ELSE interval '1 month' END
   WHERE id = v.user_id RETURNING premium_until INTO v_until;
  RETURN v_until;
END $$;

-- Marks a country's menu as being made (or topped up) by AI, so only one request does it at a time.
-- Only countries with fewer than 12 catalogue foods. Service role only.
CREATE OR REPLACE FUNCTION public.claim_country_menu(p_code text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE countries SET menu_status = 'generating', updated_at = now()
   WHERE code = p_code
     AND (menu_status <> 'generating' OR updated_at < now() - interval '3 minutes')
     AND (SELECT count(*) FROM foods f WHERE f.country_code = p_code AND f.owner_id IS NULL) < 12;
  RETURN FOUND;
END $$;

REVOKE ALL ON FUNCTION public.ai_take_question(uuid) FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION public.ai_add_tokens(uuid, integer, integer) FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION public.apply_payment(text, numeric, text) FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION public.claim_country_menu(text) FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION public.handle_new_user() FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION public.foods_limit() FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ai_take_question(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.ai_add_tokens(uuid, integer, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.apply_payment(text, numeric, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.claim_country_menu(text) TO service_role;

-- how many catalogue foods each country has (for the country picker)
CREATE OR REPLACE VIEW public.country_menus WITH (security_invoker = true) AS
  SELECT c.code, c.name, c.region, c.currency, c.menu_status, c.menu_source,
         (SELECT count(*) FROM foods f WHERE f.country_code = c.code AND f.owner_id IS NULL)::integer AS foods
    FROM countries c;
GRANT SELECT ON public.country_menus TO anon, authenticated;
