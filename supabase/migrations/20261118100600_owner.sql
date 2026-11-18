-- Owner's dashboard: who may open it, settings CDM can change without a release, an audit log, and the
-- figures and actions behind it. Every function here is for the service role only: the cdm-control edge function
-- checks who is calling (the owner with two-step sign-in, or CDM Partners with the shared control key) first.

-- ---------- who is staff ----------
CREATE TABLE public.staff (
  email text PRIMARY KEY CHECK (email = lower(email) AND email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  role text NOT NULL DEFAULT 'owner' CHECK (role IN ('owner')),
  added_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.staff ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.staff FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.staff TO service_role;
INSERT INTO public.staff (email) VALUES ('cdmtech26@gmail.com') ON CONFLICT DO NOTHING;

-- ---------- settings the owner can change ----------
ALTER TABLE public.settings
  ADD COLUMN IF NOT EXISTS ai_enabled boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS owner_two_step boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS ai_cost_in_per_m numeric(8, 3) NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS ai_cost_out_per_m numeric(8, 3) NOT NULL DEFAULT 5,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE public.settings
  ADD CONSTRAINT settings_sane CHECK (
    price_monthly_ngn BETWEEN 100 AND 1000000 AND price_yearly_ngn BETWEEN 100 AND 10000000
    AND price_monthly_usd BETWEEN 0.5 AND 1000 AND price_yearly_usd BETWEEN 0.5 AND 10000
    AND free_ai_daily BETWEEN 0 AND 100 AND premium_ai_daily BETWEEN 0 AND 500 AND premium_recipes_daily BETWEEN 0 AND 500);

-- ---------- audit log ----------
CREATE TABLE public.admin_log (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  at timestamptz NOT NULL DEFAULT now(),
  actor text NOT NULL CHECK (length(actor) <= 120),
  action text NOT NULL CHECK (length(action) <= 60),
  target text CHECK (length(target) <= 200),
  detail jsonb NOT NULL DEFAULT '{}'
);
ALTER TABLE public.admin_log ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.admin_log FROM anon, authenticated;
GRANT SELECT, INSERT ON public.admin_log TO service_role;

-- AI usage now also counts recipe tokens and translations
ALTER TABLE public.ai_usage ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

CREATE OR REPLACE FUNCTION public.food_lagos_today() RETURNS timestamptz LANGUAGE sql STABLE AS $$
  SELECT (now() AT TIME ZONE 'Africa/Lagos')::date::timestamp AT TIME ZONE 'Africa/Lagos'
$$;

-- ---------- one person, as CDM Partners' Control Centre shows them ----------
CREATE OR REPLACE FUNCTION public.food_control_detail(p_id uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v jsonb;
BEGIN
  SELECT jsonb_build_object(
    'id', p.id, 'name', coalesce(nullif(p.display_name, ''), split_part(u.email, '@', 1)), 'email', u.email,
    'created_at', p.created_at, 'country', p.country_code, 'language', p.language,
    'access', CASE WHEN p.premium_until > now() THEN 'active' WHEN p.premium_until IS NOT NULL THEN 'expired' ELSE 'free' END,
    'plan', CASE WHEN p.premium_until > now() THEN 'Premium' ELSE 'Free' END,
    'billing_period', (SELECT y.period FROM payments y WHERE y.user_id = p.id AND y.status = 'paid' ORDER BY y.paid_at DESC LIMIT 1),
    'period_end', p.premium_until,
    'paid_kobo', coalesce((SELECT sum(y.amount * 100)::bigint FROM payments y WHERE y.user_id = p.id AND y.status = 'paid' AND y.currency = 'NGN'), 0),
    'paid_usd', coalesce((SELECT sum(y.amount) FROM payments y WHERE y.user_id = p.id AND y.status = 'paid' AND y.currency = 'USD'), 0),
    'last_seen', u.last_sign_in_at,
    'ai_questions_7d', coalesce((SELECT sum(a.questions) FROM ai_usage a WHERE a.user_id = p.id AND a.day > current_date - 7), 0),
    'own_foods', (SELECT count(*) FROM foods f WHERE f.owner_id = p.id),
    'meals_planned_30d', (SELECT count(*) FROM plan_items i WHERE i.user_id = p.id AND i.day > current_date - 30),
    'payments', coalesce((SELECT jsonb_agg(jsonb_build_object('reference', y.reference, 'amount_kobo', CASE WHEN y.currency = 'NGN' THEN (y.amount * 100)::bigint END,
                 'amount', y.amount, 'currency', y.currency, 'status', CASE WHEN y.status = 'paid' THEN 'success' ELSE y.status END,
                 'plan', 'Premium', 'period', y.period, 'paid_at', coalesce(y.paid_at, y.created_at)) ORDER BY y.created_at DESC)
                 FROM (SELECT * FROM payments WHERE user_id = p.id ORDER BY created_at DESC LIMIT 20) y), '[]'::jsonb))
    INTO v
    FROM profiles p JOIN auth.users u ON u.id = p.id
   WHERE p.id = p_id;
  IF v IS NULL THEN RAISE EXCEPTION 'Customer not found'; END IF;
  RETURN v;
END $$;

CREATE OR REPLACE FUNCTION public.food_control_search(p_q text) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT coalesce(jsonb_agg(x ORDER BY x ->> 'name'), '[]'::jsonb) FROM (
    SELECT jsonb_build_object('id', p.id, 'name', coalesce(nullif(p.display_name, ''), split_part(u.email, '@', 1)), 'email', u.email,
             'access', CASE WHEN p.premium_until > now() THEN 'active' WHEN p.premium_until IS NOT NULL THEN 'expired' ELSE 'free' END,
             'period_end', p.premium_until, 'created_at', p.created_at) x
      FROM profiles p JOIN auth.users u ON u.id = p.id
     WHERE length(trim(coalesce(p_q, ''))) >= 2
       AND (u.email ILIKE '%' || replace(replace(trim(p_q), '%', ''), '_', '\_') || '%'
            OR p.display_name ILIKE '%' || replace(replace(trim(p_q), '%', ''), '_', '\_') || '%'
            OR p.id::text = trim(p_q))
     ORDER BY p.created_at DESC LIMIT 25) q
$$;

-- Adds days of Premium (from today, or from the current end if still Premium). Recorded in the audit log.
CREATE OR REPLACE FUNCTION public.food_control_extend(p_id uuid, p_days integer, p_note text, p_actor text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_until timestamptz;
BEGIN
  IF p_days IS NULL OR p_days < 1 OR p_days > 3660 THEN RAISE EXCEPTION 'Choose between 1 and 3660 days'; END IF;
  UPDATE profiles SET premium_until = greatest(coalesce(premium_until, now()), now()) + make_interval(days => p_days), updated_at = now()
   WHERE id = p_id RETURNING premium_until INTO v_until;
  IF NOT FOUND THEN RAISE EXCEPTION 'Customer not found'; END IF;
  INSERT INTO admin_log (actor, action, target, detail)
  VALUES (left(coalesce(p_actor, 'unknown'), 120), 'premium_extend', p_id::text, jsonb_build_object('days', p_days, 'until', v_until, 'note', left(p_note, 500)));
  RETURN food_control_detail(p_id);
END $$;

-- Ends Premium now.
CREATE OR REPLACE FUNCTION public.food_control_pause(p_id uuid, p_note text, p_actor text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE profiles SET premium_until = least(coalesce(premium_until, now()), now()), updated_at = now() WHERE id = p_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Customer not found'; END IF;
  INSERT INTO admin_log (actor, action, target, detail)
  VALUES (left(coalesce(p_actor, 'unknown'), 120), 'premium_pause', p_id::text, jsonb_build_object('note', left(p_note, 500)));
  RETURN food_control_detail(p_id);
END $$;

-- ---------- the dashboard's figures ----------
CREATE OR REPLACE FUNCTION public.food_owner_overview() RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_today timestamptz := food_lagos_today();
  v_month timestamptz := date_trunc('month', now() AT TIME ZONE 'Africa/Lagos') AT TIME ZONE 'Africa/Lagos';
  s settings;
  v_strings integer := (SELECT max(n) FROM (SELECT count(*) n FROM ui_strings GROUP BY lang) z);
BEGIN
  SELECT * INTO s FROM settings;
  RETURN jsonb_build_object(
    'generated_at', now(),
    'users', jsonb_build_object(
      'total', (SELECT count(*) FROM profiles),
      'today', (SELECT count(*) FROM profiles WHERE created_at >= v_today),
      'week', (SELECT count(*) FROM profiles WHERE created_at >= now() - interval '7 days'),
      'month', (SELECT count(*) FROM profiles WHERE created_at >= v_month),
      'active_7d', (SELECT count(DISTINCT x) FROM (
          SELECT user_id x FROM plan_items WHERE created_at >= now() - interval '7 days' OR status_at >= now() - interval '7 days'
          UNION SELECT user_id FROM ai_usage WHERE day > current_date - 7
          UNION SELECT user_id FROM weights WHERE created_at >= now() - interval '7 days') a),
      'premium', (SELECT count(*) FROM profiles WHERE premium_until > now()),
      'onboarded', (SELECT count(*) FROM profiles WHERE country_code IS NOT NULL),
      'with_body', (SELECT count(*) FROM profiles WHERE weight_kg IS NOT NULL)),
    'money', jsonb_build_object(
      'today_ngn', (SELECT coalesce(sum(amount), 0) FROM payments WHERE status = 'paid' AND currency = 'NGN' AND paid_at >= v_today),
      'month_ngn', (SELECT coalesce(sum(amount), 0) FROM payments WHERE status = 'paid' AND currency = 'NGN' AND paid_at >= v_month),
      'month_usd', (SELECT coalesce(sum(amount), 0) FROM payments WHERE status = 'paid' AND currency = 'USD' AND paid_at >= v_month),
      'total_ngn', (SELECT coalesce(sum(amount), 0) FROM payments WHERE status = 'paid' AND currency = 'NGN'),
      'total_usd', (SELECT coalesce(sum(amount), 0) FROM payments WHERE status = 'paid' AND currency = 'USD'),
      'paying_ever', (SELECT count(DISTINCT user_id) FROM payments WHERE status = 'paid'),
      'pending', (SELECT count(*) FROM payments WHERE status = 'pending' AND created_at >= now() - interval '2 days')),
    'ai', jsonb_build_object(
      'enabled', s.ai_enabled,
      'questions_today', (SELECT coalesce(sum(questions), 0) FROM ai_usage WHERE day = current_date),
      'recipes_today', (SELECT coalesce(sum(recipes), 0) FROM ai_usage WHERE day = current_date),
      'questions_7d', (SELECT coalesce(sum(questions), 0) FROM ai_usage WHERE day > current_date - 7),
      'recipes_7d', (SELECT coalesce(sum(recipes), 0) FROM ai_usage WHERE day > current_date - 7),
      'tokens_in_7d', (SELECT coalesce(sum(input_tokens), 0) FROM ai_usage WHERE day > current_date - 7),
      'tokens_out_7d', (SELECT coalesce(sum(output_tokens), 0) FROM ai_usage WHERE day > current_date - 7),
      'cost_7d_usd', round((SELECT coalesce(sum(input_tokens), 0) * s.ai_cost_in_per_m / 1e6 + coalesce(sum(output_tokens), 0) * s.ai_cost_out_per_m / 1e6
                            FROM ai_usage WHERE day > current_date - 7)::numeric, 2),
      'cost_month_usd', round((SELECT coalesce(sum(input_tokens), 0) * s.ai_cost_in_per_m / 1e6 + coalesce(sum(output_tokens), 0) * s.ai_cost_out_per_m / 1e6
                            FROM ai_usage WHERE day >= (v_month AT TIME ZONE 'Africa/Lagos')::date)::numeric, 2),
      'recipes_cached', (SELECT count(*) FROM recipes),
      'heaviest_7d', coalesce((SELECT jsonb_agg(h) FROM (
          SELECT jsonb_build_object('id', a.user_id, 'name', coalesce(nullif(p.display_name, ''), split_part(u.email, '@', 1)), 'email', u.email,
                   'questions', sum(a.questions), 'recipes', sum(a.recipes), 'tokens', sum(a.input_tokens + a.output_tokens),
                   'premium', coalesce(p.premium_until > now(), false)) h
            FROM ai_usage a JOIN profiles p ON p.id = a.user_id JOIN auth.users u ON u.id = a.user_id
           WHERE a.day > current_date - 7
           GROUP BY a.user_id, p.display_name, u.email, p.premium_until
           ORDER BY sum(a.input_tokens + a.output_tokens) DESC LIMIT 8) t), '[]'::jsonb)),
    'daily', coalesce((SELECT jsonb_agg(jsonb_build_object('day', d::date,
          'signups', (SELECT count(*) FROM profiles WHERE (created_at AT TIME ZONE 'Africa/Lagos')::date = d::date),
          'questions', (SELECT coalesce(sum(questions), 0) FROM ai_usage WHERE day = d::date),
          'ngn', (SELECT coalesce(sum(amount), 0) FROM payments WHERE status = 'paid' AND currency = 'NGN' AND (paid_at AT TIME ZONE 'Africa/Lagos')::date = d::date)) ORDER BY d)
        FROM generate_series(current_date - 29, current_date, interval '1 day') d), '[]'::jsonb),
    'countries', jsonb_build_object(
      'with_menu', (SELECT count(*) FROM country_menus WHERE foods > 0),
      'ai_menus', (SELECT count(*) FROM countries WHERE menu_source = 'ai'),
      'top', coalesce((SELECT jsonb_agg(c) FROM (SELECT jsonb_build_object('code', p.country_code, 'name', k.name, 'users', count(*),
                 'foods', (SELECT count(*) FROM foods f WHERE f.country_code = p.country_code AND f.owner_id IS NULL)) c
               FROM profiles p JOIN countries k ON k.code = p.country_code GROUP BY p.country_code, k.name ORDER BY count(*) DESC LIMIT 10) t), '[]'::jsonb)),
    'languages', coalesce((SELECT jsonb_agg(l ORDER BY l ->> 'users' DESC) FROM (
        SELECT jsonb_build_object('lang', x.lang, 'users', x.users, 'strings', coalesce(st.n, 0), 'of', v_strings) l
          FROM (SELECT language lang, count(*) users FROM profiles GROUP BY language) x
          LEFT JOIN (SELECT lang, count(*) n FROM ui_strings GROUP BY lang) st ON st.lang = x.lang) t), '[]'::jsonb),
    'recent_signups', coalesce((SELECT jsonb_agg(r) FROM (SELECT jsonb_build_object('id', p.id, 'name', coalesce(nullif(p.display_name, ''), split_part(u.email, '@', 1)),
          'email', u.email, 'country', p.country_code, 'at', p.created_at) r FROM profiles p JOIN auth.users u ON u.id = p.id ORDER BY p.created_at DESC LIMIT 10) t), '[]'::jsonb),
    'recent_payments', coalesce((SELECT jsonb_agg(r) FROM (SELECT jsonb_build_object('reference', y.reference, 'user_id', y.user_id, 'email', u.email, 'amount', y.amount,
          'currency', y.currency, 'period', y.period, 'status', y.status, 'at', coalesce(y.paid_at, y.created_at)) r
          FROM payments y LEFT JOIN auth.users u ON u.id = y.user_id ORDER BY y.created_at DESC LIMIT 15) t), '[]'::jsonb),
    'settings', to_jsonb(s) - 'id');
END $$;

-- Foods people add most often (by name), the AI-made country menus, and catalogue size: for reviewing content.
CREATE OR REPLACE FUNCTION public.food_owner_content() RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT jsonb_build_object(
    'catalogue', (SELECT count(*) FROM foods WHERE owner_id IS NULL),
    'user_foods', (SELECT count(*) FROM foods WHERE owner_id IS NOT NULL),
    'popular_user_foods', coalesce((SELECT jsonb_agg(x) FROM (
        SELECT jsonb_build_object('name', min(f.name), 'country', min(f.country_code), 'people', count(DISTINCT f.owner_id),
                 'example_id', (array_agg(f.id ORDER BY f.created_at))[1],
                 'in_catalogue', EXISTS (SELECT 1 FROM foods c WHERE c.owner_id IS NULL AND lower(c.name) = lower(min(f.name)))) x
          FROM foods f WHERE f.owner_id IS NOT NULL
         GROUP BY lower(f.name) ORDER BY count(DISTINCT f.owner_id) DESC, min(f.name) LIMIT 30) t), '[]'::jsonb),
    'ai_menus', coalesce((SELECT jsonb_agg(x ORDER BY x ->> 'updated_at' DESC) FROM (
        SELECT jsonb_build_object('code', c.code, 'name', c.name, 'status', c.menu_status, 'updated_at', c.updated_at,
                 'foods', (SELECT count(*) FROM foods f WHERE f.country_code = c.code AND f.owner_id IS NULL)) x
          FROM countries c WHERE c.menu_source = 'ai') t), '[]'::jsonb))
$$;

-- Copies a person's own food into the shared catalogue (their copy stays theirs).
CREATE OR REPLACE FUNCTION public.food_owner_promote(p_food uuid, p_actor text) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE f foods; v_id uuid;
BEGIN
  SELECT * INTO f FROM foods WHERE id = p_food AND owner_id IS NOT NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'Food not found'; END IF;
  IF f.country_code IS NULL THEN RAISE EXCEPTION 'Set a country on this food first'; END IF;
  IF EXISTS (SELECT 1 FROM foods WHERE owner_id IS NULL AND country_code = f.country_code AND lower(name) = lower(f.name)) THEN
    RAISE EXCEPTION 'That dish is already in the catalogue';
  END IF;
  INSERT INTO foods (country_code, name, local_name, description, meals, serving, kcal, protein_g, carbs_g, fat_g, fibre_g, tags, ingredients, cost_level, prep_minutes, source)
  VALUES (f.country_code, f.name, f.local_name, f.description, f.meals, f.serving, f.kcal, f.protein_g, f.carbs_g, f.fat_g, f.fibre_g, f.tags, f.ingredients, f.cost_level, f.prep_minutes, 'cdm')
  RETURNING id INTO v_id;
  INSERT INTO admin_log (actor, action, target, detail) VALUES (left(p_actor, 120), 'food_promote', v_id::text, jsonb_build_object('name', f.name, 'country', f.country_code));
  RETURN v_id;
END $$;

-- Changes the settings CDM can change without a release. Only the listed keys; recorded in the audit log.
CREATE OR REPLACE FUNCTION public.food_owner_settings(p_patch jsonb, p_actor text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE before jsonb; after jsonb; k text;
BEGIN
  FOR k IN SELECT jsonb_object_keys(p_patch) LOOP
    IF k NOT IN ('price_monthly_ngn', 'price_yearly_ngn', 'price_monthly_usd', 'price_yearly_usd', 'free_ai_daily', 'premium_ai_daily',
                 'premium_recipes_daily', 'ai_enabled', 'owner_two_step', 'ai_cost_in_per_m', 'ai_cost_out_per_m') THEN
      RAISE EXCEPTION 'Unknown setting %', k;
    END IF;
  END LOOP;
  SELECT to_jsonb(s) - 'id' INTO before FROM settings s;
  UPDATE settings SET
    price_monthly_ngn = coalesce((p_patch ->> 'price_monthly_ngn')::integer, price_monthly_ngn),
    price_yearly_ngn = coalesce((p_patch ->> 'price_yearly_ngn')::integer, price_yearly_ngn),
    price_monthly_usd = coalesce((p_patch ->> 'price_monthly_usd')::numeric, price_monthly_usd),
    price_yearly_usd = coalesce((p_patch ->> 'price_yearly_usd')::numeric, price_yearly_usd),
    free_ai_daily = coalesce((p_patch ->> 'free_ai_daily')::integer, free_ai_daily),
    premium_ai_daily = coalesce((p_patch ->> 'premium_ai_daily')::integer, premium_ai_daily),
    premium_recipes_daily = coalesce((p_patch ->> 'premium_recipes_daily')::integer, premium_recipes_daily),
    ai_enabled = coalesce((p_patch ->> 'ai_enabled')::boolean, ai_enabled),
    owner_two_step = coalesce((p_patch ->> 'owner_two_step')::boolean, owner_two_step),
    ai_cost_in_per_m = coalesce((p_patch ->> 'ai_cost_in_per_m')::numeric, ai_cost_in_per_m),
    ai_cost_out_per_m = coalesce((p_patch ->> 'ai_cost_out_per_m')::numeric, ai_cost_out_per_m),
    updated_at = now();
  SELECT to_jsonb(s) - 'id' INTO after FROM settings s;
  INSERT INTO admin_log (actor, action, target, detail) VALUES (left(p_actor, 120), 'settings', 'settings',
    jsonb_build_object('before', (SELECT jsonb_object_agg(key, value) FROM jsonb_each(before) WHERE before -> key IS DISTINCT FROM after -> key),
                       'after', (SELECT jsonb_object_agg(key, value) FROM jsonb_each(after) WHERE before -> key IS DISTINCT FROM after -> key)));
  RETURN after;
END $$;

CREATE OR REPLACE FUNCTION public.food_owner_payments(p_q text, p_limit integer) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT coalesce(jsonb_agg(x), '[]'::jsonb) FROM (
    SELECT jsonb_build_object('reference', y.reference, 'user_id', y.user_id, 'email', u.email, 'amount', y.amount, 'currency', y.currency,
             'period', y.period, 'status', y.status, 'created_at', y.created_at, 'paid_at', y.paid_at) x
      FROM payments y LEFT JOIN auth.users u ON u.id = y.user_id
     WHERE coalesce(trim(p_q), '') = '' OR y.reference ILIKE '%' || trim(p_q) || '%' OR u.email ILIKE '%' || trim(p_q) || '%'
     ORDER BY y.created_at DESC LIMIT least(greatest(coalesce(p_limit, 50), 1), 200)) t
$$;

CREATE OR REPLACE FUNCTION public.food_owner_log(p_limit integer) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT coalesce(jsonb_agg(to_jsonb(l) ORDER BY l.at DESC), '[]'::jsonb)
    FROM (SELECT * FROM admin_log ORDER BY at DESC LIMIT least(greatest(coalesce(p_limit, 100), 1), 500)) l
$$;

DO $$
DECLARE f text;
BEGIN
  FOREACH f IN ARRAY ARRAY['food_control_detail(uuid)', 'food_control_search(text)', 'food_control_extend(uuid, integer, text, text)',
    'food_control_pause(uuid, text, text)', 'food_owner_overview()', 'food_owner_content()', 'food_owner_promote(uuid, text)',
    'food_owner_settings(jsonb, text)', 'food_owner_payments(text, integer)', 'food_owner_log(integer)', 'food_lagos_today()'] LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION public.%s FROM public, anon, authenticated', f);
    EXECUTE format('GRANT EXECUTE ON FUNCTION public.%s TO service_role', f);
  END LOOP;
END $$;

-- the public only needs prices, limits and whether AI is on (not cost figures or security switches)
REVOKE SELECT ON public.settings FROM anon, authenticated;
GRANT SELECT (price_monthly_ngn, price_yearly_ngn, price_monthly_usd, price_yearly_usd, free_ai_daily, premium_ai_daily, premium_recipes_daily, ai_enabled)
  ON public.settings TO anon, authenticated;
