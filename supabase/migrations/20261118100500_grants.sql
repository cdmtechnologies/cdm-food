-- Newer Supabase projects do not give the API roles any table rights by default, so every right is granted here.
-- Row-level security still decides which rows each person can see or change.

GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO service_role;

GRANT SELECT ON public.countries, public.foods, public.settings, public.ui_strings, public.country_menus TO anon;

GRANT SELECT ON public.countries, public.foods, public.settings, public.ui_strings, public.country_menus,
                public.payments, public.ai_usage, public.plan_items, public.weights TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.foods, public.plan_items, public.weights TO authenticated;
-- profiles: SELECT plus column-level INSERT/UPDATE rights are granted where the columns are created

-- nobody outside the server needs these
REVOKE TRUNCATE, TRIGGER, REFERENCES ON ALL TABLES IN SCHEMA public FROM anon, authenticated;
