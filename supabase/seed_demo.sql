-- ============================================================
-- SPAS 360 — Demo Data Seed
-- Run AFTER a user has signed up as matt@spas360.com
-- ============================================================

-- Step 1: Promote matt to owner_manager
UPDATE profiles 
SET role = 'owner_manager', first_name = 'Matt', last_name = 'Schultz'
WHERE email = 'matt@spas360.com';

-- Get the user's ID for FK references
DO $$
DECLARE
  matt_id UUID;
  org UUID := '00000000-0000-0000-0000-000000000001';
  loc_minot UUID := '00000000-0000-0000-0000-000000000010';
  loc_bis UUID := '00000000-0000-0000-0000-000000000011';
  c1 UUID; c2 UUID; c3 UUID; c4 UUID; c5 UUID; c6 UUID; c7 UUID; c8 UUID;
  d1 UUID; d2 UUID; d3 UUID; d4 UUID; d5 UUID;
  j1 UUID; j2 UUID; j3 UUID; j4 UUID;
BEGIN
  SELECT id INTO matt_id FROM profiles WHERE email = 'matt@spas360.com';
  IF matt_id IS NULL THEN
    RAISE NOTICE 'matt@spas360.com not found — sign up first, then re-run';
    RETURN;
  END IF;

  -- ═══ CONTACTS ═══
  INSERT INTO contacts (id, org_id, location_id, first_name, last_name, phone, email, lead_source, customer_type, assigned_to) VALUES
    (uuid_generate_v4(), org, loc_minot, 'Tom', 'Henderson', '701-555-1001', 'tom.henderson@gmail.com', 'Walk-in', 'Prospect', matt_id),
    (uuid_generate_v4(), org, loc_minot, 'Sarah', 'Chen', '701-555-1002', 'sarah.chen@hotmail.com', 'Website', 'Customer', matt_id),
    (uuid_generate_v4(), org, loc_minot, 'Mike', 'Johnson', '701-555-1003', 'mike.j@outlook.com', 'Referral', 'Customer', matt_id),
    (uuid_generate_v4(), org, loc_bis, 'Lisa', 'Hall', '701-555-1004', 'lisa.hall@yahoo.com', 'Ad', 'Prospect', matt_id),
    (uuid_generate_v4(), org, loc_bis, 'Dave', 'Peterson', '701-555-1005', 'dave.p@gmail.com', 'Walk-in', 'Customer', matt_id),
    (uuid_generate_v4(), org, loc_bis, 'Carol', 'Anderson', '701-555-1006', 'carol.a@gmail.com', 'Phone', 'Lead', matt_id),
    (uuid_generate_v4(), org, loc_minot, 'Jim', 'Martinez', '701-555-1007', 'jim.m@gmail.com', 'Event', 'Lead', matt_id),
    (uuid_generate_v4(), org, loc_minot, 'Emily', 'Rogers', '701-555-1008', 'emily.r@gmail.com', 'Website', 'Lead', matt_id)
  RETURNING id INTO c1;

  -- Re-fetch IDs
  SELECT id INTO c1 FROM contacts WHERE phone = '701-555-1001' AND org_id = org;
  SELECT id INTO c2 FROM contacts WHERE phone = '701-555-1002' AND org_id = org;
  SELECT id INTO c3 FROM contacts WHERE phone = '701-555-1003' AND org_id = org;
  SELECT id INTO c4 FROM contacts WHERE phone = '701-555-1004' AND org_id = org;
  SELECT id INTO c5 FROM contacts WHERE phone = '701-555-1005' AND org_id = org;
  SELECT id INTO c6 FROM contacts WHERE phone = '701-555-1006' AND org_id = org;
  SELECT id INTO c7 FROM contacts WHERE phone = '701-555-1007' AND org_id = org;
  SELECT id INTO c8 FROM contacts WHERE phone = '701-555-1008' AND org_id = org;

  -- ═══ DEALS ═══
  INSERT INTO deals (id, org_id, contact_id, stage_id, title, amount, priority, assigned_to, product_interest, lead_source, location_id, position) VALUES
    (uuid_generate_v4(), org, c1, '00000000-0000-0000-0000-000000000104', 'Tom Henderson — Bullfrog A7L', 12400, 'High', matt_id, ARRAY['Bullfrog A7L', 'Cover Lifter'], 'Walk-in', loc_minot, 0),
    (uuid_generate_v4(), org, c4, '00000000-0000-0000-0000-000000000103', 'Lisa Hall — Swim Spa TidalFit', 18900, 'High', matt_id, ARRAY['TidalFit EP-15', 'Steps'], 'Ad', loc_bis, 0),
    (uuid_generate_v4(), org, c6, '00000000-0000-0000-0000-000000000100', 'Carol Anderson — Hot Tub Inquiry', 8500, 'Medium', matt_id, ARRAY['Jacuzzi J-335'], 'Phone', loc_bis, 0),
    (uuid_generate_v4(), org, c7, '00000000-0000-0000-0000-000000000105', 'Jim Martinez — Caldera Utopia', 14200, 'Medium', matt_id, ARRAY['Caldera Utopia Cantabria'], 'Event', loc_minot, 0),
    (uuid_generate_v4(), org, c8, '00000000-0000-0000-0000-000000000107', 'Emily Rogers — Jacuzzi J-485', 16800, 'High', matt_id, ARRAY['Jacuzzi J-485', 'LED Package', 'Cover'], 'Website', loc_minot, 0);

  SELECT id INTO d1 FROM deals WHERE contact_id = c1 AND org_id = org;
  SELECT id INTO d2 FROM deals WHERE contact_id = c4 AND org_id = org;
  SELECT id INTO d3 FROM deals WHERE contact_id = c6 AND org_id = org;
  SELECT id INTO d4 FROM deals WHERE contact_id = c7 AND org_id = org;
  SELECT id INTO d5 FROM deals WHERE contact_id = c8 AND org_id = org;

  -- ═══ PROPERTIES ═══
  INSERT INTO properties (contact_id, address, property_type) VALUES
    (c2, '456 Pine St, Minot, ND 58701', 'Residential'),
    (c3, '789 Oak Ave, Minot, ND 58701', 'Residential'),
    (c5, '321 Elm Dr, Bismarck, ND 58501', 'Residential');

  -- ═══ JOBS ═══
  INSERT INTO jobs (id, org_id, contact_id, location_id, title, job_type, status, description, scheduled_at, priority, created_by) VALUES
    (uuid_generate_v4(), org, c2, loc_minot, 'Pump Noise Diagnosis — J-335', 'Repair', 'Parts on Order', 'Customer reports loud humming from circulation pump. Possible bearing failure.', NOW() + INTERVAL '2 days', 'High', matt_id),
    (uuid_generate_v4(), org, c3, loc_minot, 'Hot Tub Delivery — Johnson', 'Delivery', 'Delivery', 'Bullfrog A6L delivery to 789 Oak Ave. Crane may be required.', NOW() + INTERVAL '5 days', 'Medium', matt_id),
    (uuid_generate_v4(), org, c5, loc_bis, 'Annual Maintenance — Peterson', 'Maintenance', 'In Progress', 'Annual drain, clean, filter replacement, water chemistry test.', NOW() + INTERVAL '1 day', 'Low', matt_id),
    (uuid_generate_v4(), org, c2, loc_minot, 'Heater Element Replacement', 'Warranty', 'Warranty', 'Heater stopped working under warranty. Jacuzzi approved replacement.', NULL, 'High', matt_id);

  SELECT id INTO j1 FROM jobs WHERE title LIKE 'Pump Noise%' AND org_id = org;
  SELECT id INTO j2 FROM jobs WHERE title LIKE 'Hot Tub Delivery%' AND org_id = org;

  -- ═══ PARTS ═══
  INSERT INTO parts (job_id, part_number, description, manufacturer, status, order_date, expected_arrival, supplier, cost) VALUES
    (j1, 'JAC-CP335-R', 'Circulation Pump Assembly', 'Jacuzzi', 'Ordered', CURRENT_DATE - 3, CURRENT_DATE + 4, 'SpaFlex Parts', 289.00),
    (j1, 'JAC-GASK-335', 'Pump Gasket Kit', 'Jacuzzi', 'Shipped', CURRENT_DATE - 5, CURRENT_DATE + 1, 'SpaFlex Parts', 24.50);

  -- ═══ INVENTORY ═══
  INSERT INTO inventory_items (org_id, location_id, sku, product, brand, category, model, color_finish, status, cost, msrp, sale_price) VALUES
    (org, loc_minot, 'BF-A7L-SS', 'Bullfrog A7L', 'Bullfrog', 'Hot Tub', 'A7L', 'Sterling Silver', 'In Stock', 7200, 12995, 11499),
    (org, loc_minot, 'BF-A6L-MG', 'Bullfrog A6L', 'Bullfrog', 'Hot Tub', 'A6L', 'Midnight Grey', 'In Stock', 6100, 10995, 9899),
    (org, loc_minot, 'JAC-J485-PL', 'Jacuzzi J-485', 'Jacuzzi', 'Hot Tub', 'J-485', 'Platinum', 'In Stock', 8500, 16995, 15499),
    (org, loc_bis, 'JAC-J335-CB', 'Jacuzzi J-335', 'Jacuzzi', 'Hot Tub', 'J-335', 'Cobalt Blue', 'In Stock', 4800, 9495, 8499),
    (org, loc_bis, 'TF-EP15-WH', 'TidalFit EP-15', 'TidalFit', 'Swim Spa', 'EP-15', 'White Pearl', 'In Stock', 10200, 19995, 18499),
    (org, loc_minot, 'CAL-CANT-SB', 'Caldera Utopia Cantabria', 'Caldera', 'Hot Tub', 'Cantabria', 'Sahara Bronze', 'Sold', 7800, 14495, 13299),
    (org, loc_bis, 'HS-ARIA-TB', 'Hot Spring Aria', 'Hot Spring', 'Hot Tub', 'Aria', 'Tuscan Brown', 'On Order', 5900, 11495, NULL),
    (org, loc_minot, 'ACC-CVR-UNI', 'Universal Spa Cover', 'CoverMate', 'Accessory', 'CM-3000', 'Grey', 'In Stock', 180, 449, 399),
    (org, loc_minot, 'ACC-STP-3', '3-Step Spa Steps', 'Leisure Concepts', 'Accessory', 'SmartStep 3', 'Coastal Grey', 'In Stock', 85, 199, 179),
    (org, loc_bis, 'CHM-KIT-STR', 'Spa Chemical Starter Kit', 'SpaGuard', 'Chemical', 'Starter Kit', NULL, 'In Stock', 32, 89, 79);

  -- ═══ NOTES ═══
  INSERT INTO notes (contact_id, deal_id, body, created_by) VALUES
    (c1, d1, 'Tom visited the showroom Saturday. Very interested in the A7L — specifically mentioned back pain relief. Wife was with him, seemed supportive. Follow up Wednesday.', matt_id),
    (c4, d2, 'Lisa called about the TidalFit. She has a large deck that can support it. Wants to do laps for exercise. Scheduled showroom visit for next week.', matt_id),
    (c8, d5, 'Emily found us online, filled out the quote form. Already did research on J-485. Ready to buy, just comparing 2 dealers. Price is the deciding factor.', matt_id),
    (c2, NULL, 'Sarah called about pump noise — getting worse. Scheduled repair for Thursday. Check if still under warranty.', matt_id);

  -- ═══ TASKS ═══
  INSERT INTO tasks (org_id, assigned_to, contact_id, deal_id, title, due_at, priority, status, created_by) VALUES
    (org, matt_id, c1, d1, 'Follow up with Tom Henderson — A7L interest', NOW() + INTERVAL '1 day', 'High', 'Pending', matt_id),
    (org, matt_id, c8, d5, 'Send Emily Rogers competing price quote', NOW() + INTERVAL '2 days', 'High', 'Pending', matt_id),
    (org, matt_id, c4, d2, 'Confirm Lisa Hall showroom visit', NOW() + INTERVAL '3 days', 'Medium', 'Pending', matt_id),
    (org, matt_id, c6, d3, 'First contact call — Carol Anderson', NOW(), 'Medium', 'Overdue', matt_id),
    (org, matt_id, NULL, NULL, 'Reorder SpaGuard chemical kits — running low', NOW() + INTERVAL '5 days', 'Low', 'Pending', matt_id);

  RAISE NOTICE 'Demo data seeded: 8 contacts, 5 deals, 4 jobs, 10 inventory items, 4 notes, 5 tasks';
END $$;
