-- ============================================================================
-- HARDENING COMPANION — pre-pilot data carry-forward
-- ----------------------------------------------------------------------------
-- A schema-only baseline reproduces objects, NOT migration-seeded data. These
-- deterministic, idempotent rows are the pre-pilot data dependencies required
-- by the pilot (00066 binds category links to the first ACTIVE category) and
-- by the storefront/checkout (categories, delivery zones/fees) and runtime
-- settings (app_settings).
--
-- Content is transcribed VERBATIM from the migrations that author it:
--   categories/delivery_zones/delivery_fees -> 00050_categories_delivery.sql
--   app_settings (17 keys)                  -> 00059_settings_control_center.sql
--   app_settings (3 keys)                   -> 00060_telemetry_settings.sql
--   app_settings (13 keys)                  -> 00063_admin_control_center_pass1.sql
--
-- No secrets. No production/user data. Public, static configuration only.
-- Idempotent: every insert is ON CONFLICT DO NOTHING (keeps admin overrides).
--
-- Order of application (Option A): baseline -> storage-policies -> THIS ->
-- 00065 -> 00066 -> 00067.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Categories (00050) — 5 root + 12 child slugs
-- ---------------------------------------------------------------------------
INSERT INTO public.categories (slug, name, name_ar, description, description_ar, icon, parent_id, sort_order, is_active, display_mode, theme, delivery_available, is_featured) VALUES
  ('phones',       'Phones',       'الهواتف',   'Exchangeable phones available today — new, used and refurbished.',       'أجهزة قابلة للمبادلة متوفرة اليوم — جديدة ومستعملة ومجددة.',       '📱', NULL, 10, TRUE, 'phones',    'technology', FALSE, TRUE),
  ('fresh-market', 'Fresh Market', 'السوق الطازج', 'Fresh produce and market goods delivered to your door.',              'منتجات طازجة وأغراض سوق تُوصَّل حتى باب منزلك.',                  '🥬', NULL, 20, TRUE, 'storefront','fresh',      TRUE,  TRUE),
  ('groceries',    'Groceries',    'البقالة',      'Daily groceries and pantry staples, conveniently delivered.',          'أغراض البقالة اليومية والمواد الأساسية مع توصيل مريح.',            '🛒', NULL, 30, TRUE, 'storefront','minimal',    TRUE,  FALSE),
  ('desserts',     'Desserts',     'الحلويات',     'Sweet treats and desserts, made fresh.',                               'حلويات ومُعدّات طازجة.',                                        '🍰', NULL, 40, TRUE, 'storefront','warm',       TRUE,  FALSE),
  ('games',        'Games',        'الألعاب',      'FOCUS games and challenges that train your mind.',                     'ألعاب وتحديات FOCUS لتدريب ذهنك.',                               '🎮', NULL, 50, TRUE, 'games',     'playful',    FALSE, FALSE)
ON CONFLICT (slug) DO NOTHING;

INSERT INTO public.categories (slug, name, name_ar, description, description_ar, icon, parent_id, sort_order, is_active, display_mode, theme, delivery_available, is_featured) VALUES
  ('smartphones',      'Smartphones',      'الهواتف الذكية',      'Latest smartphones at FOCUS prices.',       'أحدث الهواتف الذكية بأسعار FOCUS.',        '📱', (SELECT id FROM public.categories WHERE slug = 'phones'),       10, TRUE, 'phones', 'technology', FALSE, FALSE),
  ('accessories',      'Accessories',      'الإكسسوارات',         'Cases, chargers and more.',                  'أغطية وشواحن وغيرها.',                       '🎧', (SELECT id FROM public.categories WHERE slug = 'phones'),       20, TRUE, 'storefront', 'technology', FALSE, FALSE),
  ('vegetables',       'Vegetables',       'الخضروات',            'Farm-fresh seasonal vegetables.',            'خضروات موسمية طازجة من المزرعة.',           '🥦', (SELECT id FROM public.categories WHERE slug = 'fresh-market'), 10, TRUE, 'storefront', 'fresh', TRUE, FALSE),
  ('fruits',           'Fruits',           'الفواكه',             'Sweet, ripe fruit selection.',               'اختيار فواكه ناضجة وحلوة.',                  '🍎', (SELECT id FROM public.categories WHERE slug = 'fresh-market'), 20, TRUE, 'storefront', 'fresh', TRUE, FALSE),
  ('meat-poultry',     'Meat & Poultry',   'اللحوم والدواجن',      'Quality cuts and whole poultry.',            'قطع لحم ودواجن بجودة عالية.',                '🍗', (SELECT id FROM public.categories WHERE slug = 'fresh-market'), 30, TRUE, 'storefront', 'premium', TRUE, FALSE),
  ('bakery',           'Bakery',           'المخبوزات',           'Fresh bread and pastries.',                  'خبز طازج ومخبوزات.',                         '🥖', (SELECT id FROM public.categories WHERE slug = 'groceries'),    10, TRUE, 'storefront', 'warm', TRUE, FALSE),
  ('dairy-eggs',       'Dairy & Eggs',     'الألبان والبيض',       'Dairy and eggs for breakfast essentials.',   'ألبان وبيض لوجبة الفطور.',                   '🥛', (SELECT id FROM public.categories WHERE slug = 'groceries'),    20, TRUE, 'storefront', 'minimal', TRUE, FALSE),
  ('pantry-staples',   'Pantry Staples',   'المواد الأساسية',      'Rice, oil, flour and everyday staples.',     'أرز وزيت ودقيق ومواد أساسية يومية.',        '🍚', (SELECT id FROM public.categories WHERE slug = 'groceries'),    30, TRUE, 'storefront', 'minimal', TRUE, FALSE),
  ('cakes',            'Cakes',            'الكيك',               'Cakes for every occasion.',                  'كيك لكل المناسبات.',                         '🎂', (SELECT id FROM public.categories WHERE slug = 'desserts'),     10, TRUE, 'storefront', 'warm', TRUE, FALSE),
  ('ice-cream',        'Ice Cream',        'الآيس كريم',          'Cold, creamy desserts.',                     'حلويات باردة كريمية.',                       '🍨', (SELECT id FROM public.categories WHERE slug = 'desserts'),     20, TRUE, 'storefront', 'playful', TRUE, FALSE),
  ('brain-games',      'Brain Games',      'ألعاب الذكاء',         'Reaction and focus challenges.',             'تحديات سرعة رد الفعل والتركيز.',            '🧠', (SELECT id FROM public.categories WHERE slug = 'games'),        10, TRUE, 'games', 'technology', FALSE, FALSE),
  ('tic-tac-toe',      'Tic-Tac-Toe',      'إكس-أو',               'Play your favorite board game solo or live.', 'العب لعبتك المفضلة منفرداً أو مباشرة.',      '⭕', (SELECT id FROM public.categories WHERE slug = 'games'),        20, TRUE, 'games', 'playful', FALSE, FALSE)
ON CONFLICT (slug) DO NOTHING;

-- ---------------------------------------------------------------------------
-- Delivery zones & fees (00050)
-- ---------------------------------------------------------------------------
INSERT INTO public.delivery_zones (name, name_ar, is_active) VALUES
  ('City Center',   'وسط المدينة', TRUE),
  ('Suburbs',       'الضواحي',     TRUE),
  ('Outskirts',     'الأطراف',     TRUE)
ON CONFLICT (name) DO NOTHING;

INSERT INTO public.delivery_fees (zone_id, min_amount, max_amount, fee, delivery_minutes_min, delivery_minutes_max)
SELECT z.id, 0, NULL, 350.00, 30, 45 FROM public.delivery_zones z
WHERE NOT EXISTS (SELECT 1 FROM public.delivery_fees f WHERE f.zone_id = z.id);

-- ---------------------------------------------------------------------------
-- app_settings — 00059 (17 keys)
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_defaults  jsonb := jsonb_build_object(
    'game.rounds'                     , jsonb_build_object('value', 7   , 'category', 'game', 'type', 'integer'),
    'game.min_delay_ms'               , jsonb_build_object('value', 750 , 'category', 'game', 'type', 'integer'),
    'game.max_delay_ms'               , jsonb_build_object('value', 2890, 'category', 'game', 'type', 'integer'),
    'game.min_position_distance_pct'  , jsonb_build_object('value', 25  , 'category', 'game', 'type', 'percent'),
    'offers.default_discount_percent' , jsonb_build_object('value', 5   , 'category', 'offers', 'type', 'percent'),
    'offers.default_max_usage'        , jsonb_build_object('value', 50  , 'category', 'offers', 'type', 'integer'),
    'offers.return_discount_percent'  , jsonb_build_object('value', 5   , 'category', 'offers', 'type', 'percent'),
    'offers.whatsapp_discount_percent', jsonb_build_object('value', 8   , 'category', 'offers', 'type', 'percent'),
    'offers.whatsapp_max_usage'       , jsonb_build_object('value', 30  , 'category', 'offers', 'type', 'integer'),
    'inventory.overstock_multiplier'  , jsonb_build_object('value', 3   , 'category', 'inventory', 'type', 'integer'),
    'rules.inventory_low_threshold'   , jsonb_build_object('value', 5   , 'category', 'rules', 'type', 'integer'),
    'rules.device_visitors_threshold' , jsonb_build_object('value', 30  , 'category', 'rules', 'type', 'integer'),
    'rules.trade_conversion_threshold', jsonb_build_object('value', 10  , 'category', 'rules', 'type', 'integer'),
    'rules.visitor_count_threshold'   , jsonb_build_object('value', 90  , 'category', 'rules', 'type', 'integer'),
    'rules.default_threshold'         , jsonb_build_object('value', 3   , 'category', 'rules', 'type', 'integer'),
    'rules.needs_discount_visit_count', jsonb_build_object('value', 3   , 'category', 'rules', 'type', 'integer'),
    'cache.max_entries'               , jsonb_build_object('value', 500 , 'category', 'cache', 'type', 'integer')
  );
  v_key   text;
  v_meta  jsonb;
BEGIN
  FOR v_key, v_meta IN SELECT key, value FROM jsonb_each(v_defaults) LOOP
    INSERT INTO public.app_settings (key, value, category, type, updated_at)
    VALUES (
      v_key,
      jsonb_build_object('value', (v_meta->>'value')::numeric),
      v_meta->>'category',
      v_meta->>'type',
      now()
    )
    ON CONFLICT (key) DO NOTHING;   -- preserve any existing admin override
  END LOOP;
END;
$$;

-- ---------------------------------------------------------------------------
-- app_settings — 00060 (3 keys: telemetry.*)
-- ---------------------------------------------------------------------------
INSERT INTO public.app_settings (key, value, category, type, updated_at)
VALUES
  ('telemetry.max_batch',  jsonb_build_object('value', 10  ), 'telemetry', 'integer', now()),
  ('telemetry.flush_ms',   jsonb_build_object('value', 5000), 'telemetry', 'integer', now()),
  ('telemetry.max_buffer', jsonb_build_object('value', 50  ), 'telemetry', 'integer', now())
ON CONFLICT (key) DO NOTHING;

-- ---------------------------------------------------------------------------
-- app_settings — 00063 (13 keys: A-class defaults)
-- ---------------------------------------------------------------------------
INSERT INTO public.app_settings (key, value, category, type, updated_at)
VALUES
  ('commerce.currencies',       jsonb_build_object('value', jsonb_build_array('USD','DA','SAR','EUR','TRY')), 'general',      'enum',     now()),
  ('comm.whatsapp_phone',       jsonb_build_object('value', '+213556254007'),                                  'marketplace',  'text',     now()),
  ('comm.whatsapp_guard_timeout_ms',   jsonb_build_object('value', 1500),                                     'marketplace',  'integer',  now()),
  ('comm.whatsapp_min_digits',        jsonb_build_object('value', 8),                                         'marketplace',  'integer',  now()),
  ('comm.whatsapp_max_digits',        jsonb_build_object('value', 15),                                        'marketplace',  'integer',  now()),
  ('comm.whatsapp_message_max_length', jsonb_build_object('value', 1000),                                     'marketplace',  'integer',  now()),
  ('comm.double_exit_window_ms',      jsonb_build_object('value', 3000),                                      'marketplace',  'integer',  now()),
  ('marketplace.listing_page_limit',  jsonb_build_object('value', 48),                                        'marketplace',  'integer',  now()),
  ('marketplace.similar_phones_limit', jsonb_build_object('value', 8),                                        'marketplace',  'integer',  now()),
  ('ads.carousel_autoplay_ms',        jsonb_build_object('value', 2000),                                      'ads',          'integer',  now()),
  ('ads.carousel_swipe_threshold_px', jsonb_build_object('value', 50),                                        'ads',          'integer',  now()),
  ('experience.results_auto_advance_ms', jsonb_build_object('value', 3000),                                   'experience',   'integer',  now()),
  ('experience.gallery_autoplay_ms',  jsonb_build_object('value', 3000),                                      'experience',   'integer',  now())
ON CONFLICT (key) DO NOTHING;

-- ---------------------------------------------------------------------------
-- Post-check — every expected seed present (idempotent; tolerates any future
-- additional rows while requiring the full dependency set).
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_expected_cat      text[] := ARRAY[
    'phones','fresh-market','groceries','desserts','games',
    'smartphones','accessories','vegetables','fruits','meat-poultry',
    'bakery','dairy-eggs','pantry-staples','cakes','ice-cream',
    'brain-games','tic-tac-toe'];
  v_expected_zone     text[] := ARRAY['City Center','Suburbs','Outskirts'];
  v_expected_settings text[] := ARRAY[
    'game.rounds','game.min_delay_ms','game.max_delay_ms','game.min_position_distance_pct',
    'offers.default_discount_percent','offers.default_max_usage','offers.return_discount_percent',
    'offers.whatsapp_discount_percent','offers.whatsapp_max_usage','inventory.overstock_multiplier',
    'rules.inventory_low_threshold','rules.device_visitors_threshold','rules.trade_conversion_threshold',
    'rules.visitor_count_threshold','rules.default_threshold','rules.needs_discount_visit_count',
    'cache.max_entries',
    'telemetry.max_batch','telemetry.flush_ms','telemetry.max_buffer',
    'commerce.currencies','comm.whatsapp_phone','comm.whatsapp_guard_timeout_ms',
    'comm.whatsapp_min_digits','comm.whatsapp_max_digits','comm.whatsapp_message_max_length',
    'comm.double_exit_window_ms','marketplace.listing_page_limit','marketplace.similar_phones_limit',
    'ads.carousel_autoplay_ms','ads.carousel_swipe_threshold_px',
    'experience.results_auto_advance_ms','experience.gallery_autoplay_ms'];
BEGIN
  IF (SELECT COUNT(*) FROM unnest(v_expected_cat) e WHERE NOT EXISTS (SELECT 1 FROM public.categories c WHERE c.slug = e)) <> 0 THEN
    RAISE EXCEPTION 'carry-forward: missing category slug(s)';
  END IF;
  IF (SELECT COUNT(*) FROM unnest(v_expected_zone) e WHERE NOT EXISTS (SELECT 1 FROM public.delivery_zones z WHERE z.name = e)) <> 0 THEN
    RAISE EXCEPTION 'carry-forward: missing delivery zone(s)';
  END IF;
  IF (SELECT COUNT(*) FROM unnest(v_expected_settings) e WHERE NOT EXISTS (SELECT 1 FROM public.app_settings a WHERE a.key = e)) <> 0 THEN
    RAISE EXCEPTION 'carry-forward: missing app_settings key(s)';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.delivery_fees f JOIN public.delivery_zones z ON z.id = f.zone_id WHERE z.name = 'City Center' AND f.fee = 350.00) THEN
    RAISE EXCEPTION 'carry-forward: delivery fee missing';
  END IF;
END;
$$;
