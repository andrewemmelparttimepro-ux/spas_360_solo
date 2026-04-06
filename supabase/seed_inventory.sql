-- SPAS 360 Inventory Seed File
-- Comprehensive inventory data for Minot and Bismarck locations
-- Generated: 2026-04-06
-- Includes: Hot Tubs, Swim Spas, Saunas, Cold Plunges, and Covers

INSERT INTO inventory_items (id, org_id, location_id, sku, product, brand, category, model, color_finish, status, sale_price, customer_id, notes, created_at, updated_at) VALUES
-- =========================================================================
-- BISMARCK INVENTORY - BULLFROG SPAS HOT TUBS
-- =========================================================================
(uuid_generate_v4(), '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000011', '101035886', 'Nova 7L', 'Bullfrog Spas', 'Hot Tub', 'Nova 7L', 'Brown/Platinum', 'In Stock', NULL, NULL, '85x85, Cover included', NOW(), NOW()),
(uuid_generate_v4(), '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000011', '101037359', 'Nova 7L', 'Bullfrog Spas', 'Hot Tub', 'Nova 7L', 'Brown/Platinum', 'In Stock', NULL, NULL, '85x85, Cover included', NOW(), NOW()),
(uuid_generate_v4(), '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000011', '101003635', 'Alica', 'Bullfrog Spas', 'Hot Tub', 'Alica', 'Slate/Platinum', 'Sold', NULL, NULL, 'Customer: JIM & BEA KAISER, Delivery: TBD, 80x70, Cover included', NOW(), NOW()),
(uuid_generate_v4(), '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000011', '101028607', 'Prado', 'Bullfrog Spas', 'Hot Tub', 'Prado', 'Slate/Platinum', 'In Stock', NULL, NULL, '80x80, Cover included', NOW(), NOW()),
(uuid_generate_v4(), '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000011', '100962655', 'Peyton', 'Bullfrog Spas', 'Hot Tub', 'Peyton (2024)', 'Graphite/Platinum', 'Sold', NULL, NULL, 'Customer: Byron Hansen, Delivery: April 10th, 85x85, Cover included', NOW(), NOW()),
(uuid_generate_v4(), '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000011', '101037315', 'Edison', 'Bullfrog Spas', 'Hot Tub', 'Edison', 'Midnight/Graphite', 'In Stock', NULL, NULL, '85x85, Cover included', NOW(), NOW()),
(uuid_generate_v4(), '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000011', '101012834', 'Peyton', 'Bullfrog Spas', 'Hot Tub', 'Peyton', 'Slate/Platinum', 'In Stock', NULL, NULL, '85x85, Cover included', NOW(), NOW()),
(uuid_generate_v4(), '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000011', '101004683', 'Mckinley', 'Bullfrog Spas', 'Hot Tub', 'Mckinley', 'Slate/Platinum', 'Sold', NULL, NULL, 'Customer: John Cook (Minot), Delivery: 10-Apr, 90x90, Cover included', NOW(), NOW()),
(uuid_generate_v4(), '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000011', '101016444', 'Mckinley', 'Bullfrog Spas', 'Hot Tub', 'Mckinley', 'Graphite/Midnight', 'In Stock', NULL, NULL, '90x90, Cover included', NOW(), NOW()),
(uuid_generate_v4(), '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000011', '101026858', 'Ramona', 'Bullfrog Spas', 'Hot Tub', 'Ramona', 'Slate/Platinum', 'In Stock', NULL, NULL, '90x90, Cover included', NOW(), NOW()),
(uuid_generate_v4(), '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000011', '101021984', 'Bristol', 'Bullfrog Spas', 'Hot Tub', 'Bristol', 'Modern Hardwood/Platinum', 'In Stock', NULL, NULL, '85x85, Cover included', NOW(), NOW()),
(uuid_generate_v4(), '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000011', '101037771', 'Hamilton', 'Bullfrog Spas', 'Hot Tub', 'Hamilton', 'Vintage Oak/Midnight', 'On Order', NULL, NULL, '90x90, Cover included, On Hand: No', NOW(), NOW()),
(uuid_generate_v4(), '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000011', '101022570', 'Hamilton', 'Bullfrog Spas', 'Hot Tub', 'Hamilton', 'Brushed Grey/Platinum', 'In Stock', NULL, NULL, '90x90, Cover included', NOW(), NOW()),
(uuid_generate_v4(), '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000011', '101034617', 'Hamilton', 'Bullfrog Spas', 'Hot Tub', 'Hamilton', 'Vintage Oak/Midnight', 'Sold', NULL, NULL, 'Customer: JEREMY ZENTNER, Delivery: TBD, 90x90, Cover included', NOW(), NOW()),
(uuid_generate_v4(), '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000011', '101022223', 'Chelsee', 'Bullfrog Spas', 'Hot Tub', 'Chelsee', 'Brushed Grey/Platinum', 'In Stock', NULL, NULL, '90x90, Cover included', NOW(), NOW()),
(uuid_generate_v4(), '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000011', '101035573', 'Chelsee', 'Bullfrog Spas', 'Hot Tub', 'Chelsee', 'Vintage Oak/Midnight', 'In Stock', NULL, NULL, '90x90, Cover included', NOW(), NOW()),
(uuid_generate_v4(), '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000011', '101021615', 'Chelsee', 'Bullfrog Spas', 'Hot Tub', 'Chelsee', 'Modern Hardwood/Platinum', 'Sold', NULL, NULL, 'Customer: BOBBIE & FRED KRUEGER, Delivery: April 7th, 90x90, Cover included', NOW(), NOW()),
(uuid_generate_v4(), '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000011', '101023699', 'Vistamar', 'Bullfrog Spas', 'Hot Tub', 'Vistamar', 'Flint Grey/Platinum', 'In Stock', NULL, NULL, '85x85, Cover included', NOW(), NOW()),
(uuid_generate_v4(), '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000011', '101022176', 'Altamar', 'Bullfrog Spas', 'Hot Tub', 'Altamar', 'Ironwood/Midnight', 'In Stock', NULL, NULL, '85x85, Cover included', NOW(), NOW()),
(uuid_generate_v4(), '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000011', '100981040', 'Cameo', 'Bullfrog Spas', 'Hot Tub', 'Cameo', 'Flint Grey/Platinum', 'In Stock', NULL, NULL, '90x90, Cover included', NOW(), NOW()),
(uuid_generate_v4(), '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000011', '101028776', 'Cameo', 'Bullfrog Spas', 'Hot Tub', 'Cameo', 'Ironwood/Midnight', 'Sold', NULL, NULL, 'Customer: RANDY KOCH, Delivery: TBD, 90x90, Cover included', NOW(), NOW()),
(uuid_generate_v4(), '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000011', '101031599', 'Cameo', 'Bullfrog Spas', 'Hot Tub', 'Cameo', 'Ironwood/Midnight', 'In Stock', NULL, NULL, '90x90, Cover included', NOW(), NOW()),
(uuid_generate_v4(), '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000011', '101015271', 'Optima', 'Bullfrog Spas', 'Hot Tub', 'Optima', 'Ironwood/Platinum', 'In Stock', NULL, NULL, '90x90, Cover included', NOW(), NOW()),
(uuid_generate_v4(), '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000011', '101028550', 'Optima', 'Bullfrog Spas', 'Hot Tub', 'Optima', 'Ironwood/Midnight', 'In Stock', NULL, NULL, '90x90, Cover included', NOW(), NOW()),
(uuid_generate_v4(), '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000011', '101029168', 'Optima', 'Bullfrog Spas', 'Hot Tub', 'Optima', 'Windy Oak/Tavertine', 'In Stock', NULL, NULL, '90x90, Cover included', NOW(), NOW()),
(uuid_generate_v4(), '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000011', '101026929', 'Aspen', 'Bullfrog Spas', 'Hot Tub', 'Aspen', 'Ironwood/Platinum', 'Sold', NULL, NULL, 'Customer: JEROME & BELINDA DAHLIN, Delivery: TBD, 103x90, Cover included', NOW(), NOW()),

-- =========================================================================
-- BISMARCK INVENTORY - MASTER SPAS HOT TUBS & SWIM SPAS
-- =========================================================================
(uuid_generate_v4(), '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000011', '2601282', 'Balance 9', 'Master Spas', 'Hot Tub', 'Balance 9', 'Graphite/Sterling Silver', 'In Stock', NULL, NULL, '108x94, Cover included', NOW(), NOW()),
(uuid_generate_v4(), '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000011', 'Order 210322', 'Twilight 7.2', 'Master Spas', 'Hot Tub', 'Twilight 7.2', 'Midnight/Sterling Silver', 'On Order', NULL, NULL, '84x84, Cover included, On Hand: No', NOW(), NOW()),
(uuid_generate_v4(), '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000011', '2510839', 'Twilight 8.2', 'Master Spas', 'Hot Tub', 'Twilight 8.2', 'Graphite/Sterling Silver', 'Sold', NULL, NULL, 'Customer: PAUL SANDERSON, Delivery: TBD, 94x94, Cover included', NOW(), NOW()),
(uuid_generate_v4(), '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000011', 'Order# W338863', 'Twilight 8.2', 'Master Spas', 'Hot Tub', 'Twilight 8.2', 'Midnight/Sterling Silver', 'On Order', NULL, NULL, 'Customer: MATT & LINDSAY LEER, Delivery: TBD, 94x94, Cover included, On Hand: No', NOW(), NOW()),
(uuid_generate_v4(), '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000011', 'Order # W338867', 'Twilight 8.2', 'Master Spas', 'Hot Tub', 'Twilight 8.2', 'Midnight/Storm Cloud', 'On Order', NULL, NULL, '94x94, Cover included, On Hand: No', NOW(), NOW()),
(uuid_generate_v4(), '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000011', '2518270', 'Twilight 8.25', 'Master Spas', 'Hot Tub', 'Twilight 8.25', 'Graphite/Sterling Silver', 'In Stock', NULL, NULL, '94x94, Cover included', NOW(), NOW()),
(uuid_generate_v4(), '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000011', 'Order # W338865', 'Twilight 8.25', 'Master Spas', 'Hot Tub', 'Twilight 8.25', 'Midnight/Midnight Canyon', 'On Order', NULL, NULL, '94x94, Cover included, On Hand: No', NOW(), NOW()),
(uuid_generate_v4(), '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000011', 'Order # W338866', 'Twilight 8.25', 'Master Spas', 'Hot Tub', 'Twilight 8.25', 'Midnight/Storm Cloud', 'On Order', NULL, NULL, '94x94, Cover included, On Hand: No', NOW(), NOW()),
(uuid_generate_v4(), '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000011', 'Order 210322', 'Twilight 8.25', 'Master Spas', 'Hot Tub', 'Twilight 8.25', 'Midnight/Storm Cloud', 'On Order', NULL, NULL, 'Minot location preference, 94x94, Cover included, On Hand: No', NOW(), NOW()),
(uuid_generate_v4(), '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000011', '2600924', 'MP LSX 900', 'Master Spas', 'Swim Spa', 'MP LSX 900', 'Graphite/Platinum', 'Sold', NULL, NULL, 'Customer: DUSTIN GOEHRING, Delivery: TBD, 108x94, Cover included', NOW(), NOW()),
(uuid_generate_v4(), '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000011', 'Order 210322', 'MP LSX 900', 'Master Spas', 'Swim Spa', 'MP LSX 900', 'Graphite/Platinum', 'On Order', NULL, NULL, '108x94, Cover included, On Hand: No', NOW(), NOW()),
(uuid_generate_v4(), '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000011', 'Order 210322', 'MP LSX 900', 'Master Spas', 'Swim Spa', 'MP LSX 900', 'Midnight/Storm Cloud', 'On Order', NULL, NULL, 'Minot location preference, 108x94, Cover included, On Hand: No', NOW(), NOW()),
(uuid_generate_v4(), '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000011', 'H250812', 'Trainer 15D', 'Master Spas', 'Swim Spa', 'Trainer 15D', 'Graphite/Sterling Silver', 'Sold', NULL, NULL, 'Customer: Albert "Butch" Perrin (Minot), Delivery: TBD, 180x94, Cover included', NOW(), NOW()),
(uuid_generate_v4(), '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000011', 'H251230', 'Therapool Deep', 'Master Spas', 'Swim Spa', 'Therapool Deep', 'Graphite/Sterling Silver', 'Sold', NULL, NULL, 'Customer: PAUL KAMDHANI, Delivery: TBD, 132x94, Cover included', NOW(), NOW()),

-- =========================================================================
-- BISMARCK INVENTORY - JACUZZI HOT TUBS
-- =========================================================================
(uuid_generate_v4(), '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000011', 'BISMARCK-TOKYO-001', 'Tokyo', 'Jacuzzi', 'Hot Tub', 'Tokyo', 'Platinum', 'In Transit', NULL, NULL, 'Ordered 3/25, 88x88, Cover included, On Hand: No', NOW(), NOW()),
(uuid_generate_v4(), '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000011', 'BISMARCK-TOKYO-002', 'Tokyo', 'Jacuzzi', 'Hot Tub', 'Tokyo', 'Midnight', 'In Transit', NULL, NULL, 'Customer: Torgerson, Ordered 3/25, 88x88, Cover included, On Hand: No', NOW(), NOW()),
(uuid_generate_v4(), '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000011', 'JL109J048 0115 H12551', 'Tokyo', 'Jacuzzi', 'Hot Tub', 'Tokyo', 'Grey/Platinum', 'Sold', NULL, NULL, 'Customer: CAMMIE ENDERS, Delivery: TBD, 88x88, Cover included', NOW(), NOW()),
(uuid_generate_v4(), '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000011', 'JL100J032 0109 H12467', 'Ozlo', 'Jacuzzi', 'Hot Tub', 'Ozlo', 'Grey/Odyssey', 'In Stock', NULL, NULL, '90x90, Cover included', NOW(), NOW()),
(uuid_generate_v4(), '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000011', 'Jl326 028 3H14986', 'Maximus', 'Jacuzzi', 'Hot Tub', 'Maximus', 'Grey/Platinum', 'In Stock', NULL, NULL, '102x87, Cover included', NOW(), NOW()),

-- =========================================================================
-- BISMARCK INVENTORY - ECO SPA HOT TUBS
-- =========================================================================
(uuid_generate_v4(), '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000011', '#01092624370E3SRFG', 'Eco E3', 'Eco Spa', 'Hot Tub', 'Eco Spa E3', 'Sandstone', 'In Stock', NULL, NULL, '77x60, Cover included', NOW(), NOW()),
(uuid_generate_v4(), '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000011', '#01092624374E4GRFG', 'Eco E4', 'Eco Spa', 'Hot Tub', 'Eco Spa E4', 'Greystone', 'In Stock', NULL, NULL, '77x60, Cover included', NOW(), NOW()),
(uuid_generate_v4(), '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000011', '02242624690E3GRFG', 'Eco Spa E3', 'Eco Spa', 'Hot Tub', 'Eco Spa E3', 'Blue/Blackstone', 'Sold', NULL, NULL, 'Customer: Cahill (Bismarck), Delivery: April 9th, 77x60, Cover included', NOW(), NOW()),
(uuid_generate_v4(), '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000011', '02242624691E3GRFG', 'Eco Spa E3', 'Eco Spa', 'Hot Tub', 'Eco Spa E3', 'Blue/Blackstone', 'In Stock', NULL, NULL, '77x60, Cover included', NOW(), NOW()),
(uuid_generate_v4(), '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000011', '02242624695E4GRFG', 'Eco Spa E4', 'Eco Spa', 'Hot Tub', 'Eco Spa E4', 'Blue/Blackstone', 'Sold', NULL, NULL, 'Customer: Pauline Roseberg, Delivery: TBD, 77x60, Cover included', NOW(), NOW()),

-- =========================================================================
-- BISMARCK INVENTORY - COLD PLUNGE
-- =========================================================================
(uuid_generate_v4(), '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000011', 'T240930', 'Chilly Goat', 'Master Spas', 'Cold Plunge', 'Chilly Goat', '', 'In Stock', NULL, NULL, '', NOW(), NOW()),

-- =========================================================================
-- BISMARCK INVENTORY - SAUNAS
-- =========================================================================
(uuid_generate_v4(), '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000011', 'BISMARCK-VISSCHER-001', 'Visscher Sauna', 'Visscher', 'Sauna', 'Visscher Sauna', '', 'In Transit', NULL, NULL, 'Customer: Paul Kamdani, Ordered 3/24, On Hand: No', NOW(), NOW()),
(uuid_generate_v4(), '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000011', 'BISMARCK-VISSCHER-002', 'Visscher Sauna', 'Visscher', 'Sauna', 'Visscher Sauna', '', 'In Stock', NULL, NULL, 'Floor Model', NOW(), NOW()),
(uuid_generate_v4(), '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000011', 'BISMARCK-HEKLA100-001', 'Hekla 100', 'Harvia', 'Sauna', 'Hekla 100', '', 'In Stock', NULL, NULL, 'Floor Model', NOW(), NOW()),
(uuid_generate_v4(), '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000011', 'BISMARCK-HEKLA130-001', 'Hekla 130', 'Harvia', 'Sauna', 'Hekla 130', '', 'In Stock', NULL, NULL, 'Floor Model', NOW(), NOW()),
(uuid_generate_v4(), '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000011', 'BISMARCK-HEKLA160-001', 'Hekla 160', 'Harvia', 'Sauna', 'Hekla 160', '', 'In Stock', NULL, NULL, 'Floor Model', NOW(), NOW()),
(uuid_generate_v4(), '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000011', 'BISMARCK-HEKLA130-002', 'Hekla 130', 'Harvia', 'Sauna', 'Hekla 130', '', 'Sold', NULL, NULL, 'Customer: Todd Neurohr (Bismarck), Delivery: 13-Apr', NOW(), NOW()),
(uuid_generate_v4(), '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000011', 'BISMARCK-HEKLA130-003', 'Hekla 130', 'Harvia', 'Sauna', 'Hekla 130', '', 'Sold', NULL, NULL, 'Customer: Russ Nelson (Bismarck), Delivery: TBD', NOW(), NOW()),
(uuid_generate_v4(), '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000011', 'BISMARCK-HEKLA100-002', 'Hekla 100', 'Harvia', 'Sauna', 'Hekla 100', '', 'Sold', NULL, NULL, 'Customer: Derrik Jellesed (Bismarck), Delivery: 9-Apr', NOW(), NOW()),
(uuid_generate_v4(), '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000011', 'BISMARCK-GDI-COP-001', 'GDI Copenhagen', 'GDI', 'Sauna', 'GDI Copenhagen', '', 'In Stock', NULL, NULL, 'Floor Model', NOW(), NOW()),
(uuid_generate_v4(), '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000011', 'BISMARCK-GDI-SUN-001', 'GDI Sundsval', 'GDI', 'Sauna', 'GDI Sundsval', '', 'Sold', NULL, NULL, 'Customer: Travis Berger, Delivery: 31-Mar', NOW(), NOW()),
(uuid_generate_v4(), '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000011', 'BISMARCK-GDI-PRO6-1P', 'GDI Pro 6', 'GDI', 'Sauna', 'GDI Pro 6 (1 Person)', '', 'In Stock', NULL, NULL, 'Floor Model', NOW(), NOW()),
(uuid_generate_v4(), '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000011', 'BISMARCK-GDI-PRO6-2P', 'GDI Pro 6', 'GDI', 'Sauna', 'GDI Pro 6 (2 Person)', '', 'In Stock', NULL, NULL, 'Floor Model', NOW(), NOW()),
(uuid_generate_v4(), '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000011', 'BISMARCK-GDI-PRO6-3P', 'GDI Pro 6', 'GDI', 'Sauna', 'GDI Pro 6 (3 Person)', '', 'Sold', NULL, NULL, 'Customer: Drew Knutson, Delivery: TBD', NOW(), NOW()),

-- =========================================================================
-- BISMARCK INVENTORY - ITEMS NEEDING TO BE ORDERED
-- =========================================================================
(uuid_generate_v4(), '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000011', 'BISMARCK-HEKLA100-ORDER', 'Hekla 100', 'Harvia', 'Sauna', 'Hekla 100', '', 'On Order', NULL, NULL, 'Customer: Melissa Heaton, Qty: 1, On Hand: No', NOW(), NOW()),
(uuid_generate_v4(), '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000011', 'BISMARCK-TRAINER15D-ORDER', 'Trainer 15D', 'Master Spas', 'Swim Spa', 'Trainer 15D', '', 'On Order', NULL, NULL, 'Customer: Monty Winterroth, Qty: 1, Note: Not Ready until next year, On Hand: No', NOW(), NOW()),
(uuid_generate_v4(), '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000011', 'BISMARCK-HEKLA130-ORDER', 'Hekla 130', 'Harvia', 'Sauna', 'Hekla 130', '', 'On Order', NULL, NULL, 'Customer: Karen Winn, Qty: 1, On Hand: No', NOW(), NOW()),

-- =========================================================================
-- MINOT INVENTORY - BULLFROG SPAS HOT TUBS
-- =========================================================================
(uuid_generate_v4(), '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000010', '101039194', 'Nova 7L', 'Bullfrog Spas', 'Hot Tub', 'Nova 7L', 'Grey/Platinum', 'In Stock', NULL, NULL, '85x85, Cover included', NOW(), NOW()),
(uuid_generate_v4(), '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000010', '101039055', 'Nova 7L', 'Bullfrog Spas', 'Hot Tub', 'Nova 7L', 'Grey/Platinum', 'In Stock', NULL, NULL, '85x85, Cover included', NOW(), NOW()),
(uuid_generate_v4(), '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000010', '101028428', 'NovaL', 'Bullfrog Spas', 'Hot Tub', 'NovaL', 'Grey/Platinum', 'Sold', NULL, NULL, 'Customer: Roger Tollefson, 85x85, Cover included', NOW(), NOW()),
(uuid_generate_v4(), '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000010', '101010592', 'Alica', 'Bullfrog Spas', 'Hot Tub', 'Alica', 'Slate/Platinum', 'In Stock', NULL, NULL, '80x70, Cover included', NOW(), NOW()),
(uuid_generate_v4(), '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000010', '101026321', 'Prado', 'Bullfrog Spas', 'Hot Tub', 'Prado', 'Graphite/Midnight', 'In Stock', NULL, NULL, '80x80, Cover included', NOW(), NOW()),
(uuid_generate_v4(), '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000010', '101028729', 'Prado', 'Bullfrog Spas', 'Hot Tub', 'Prado', 'Platinum/Graphite', 'In Stock', NULL, NULL, '80x80, Cover included', NOW(), NOW()),
(uuid_generate_v4(), '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000010', '101012169', 'Peyton', 'Bullfrog Spas', 'Hot Tub', 'Peyton', 'Slate/Platinum', 'In Stock', NULL, NULL, '85x85, Cover included', NOW(), NOW()),
(uuid_generate_v4(), '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000010', '101028401', 'Peyton', 'Bullfrog Spas', 'Hot Tub', 'Peyton', 'Midnight/Graphite', 'In Stock', NULL, NULL, '85x85, Cover included', NOW(), NOW()),
(uuid_generate_v4(), '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000010', '101028331', 'Peyton', 'Bullfrog Spas', 'Hot Tub', 'Peyton', 'Platinum/Graphite', 'In Stock', NULL, NULL, '85x85, Cover included', NOW(), NOW()),
(uuid_generate_v4(), '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000010', '100996465', 'Peyton', 'Bullfrog Spas', 'Hot Tub', 'Peyton', 'Platinum/Graphite', 'In Stock', NULL, NULL, '85x85, Cover included', NOW(), NOW()),
(uuid_generate_v4(), '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000010', '101029107', 'Edison', 'Bullfrog Spas', 'Hot Tub', 'Edison', 'Midnight/Graphite', 'In Stock', NULL, NULL, '85x85, Cover included', NOW(), NOW()),
(uuid_generate_v4(), '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000010', '101037308', 'Edison', 'Bullfrog Spas', 'Hot Tub', 'Edison', 'Platinum/Graphite', 'In Stock', NULL, NULL, '85x85, Cover included', NOW(), NOW()),
(uuid_generate_v4(), '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000010', '100992381', 'Mckinley', 'Bullfrog Spas', 'Hot Tub', 'Mckinley', 'Platinum/Graphite', 'Sold', NULL, NULL, 'Customer: Everson, 89x89, Cover included', NOW(), NOW()),
(uuid_generate_v4(), '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000010', '101039486', 'Mckinley', 'Bullfrog Spas', 'Hot Tub', 'Mckinley', 'Midnight/Graphite', 'In Stock', NULL, NULL, '89x89, Cover included', NOW(), NOW()),
(uuid_generate_v4(), '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000010', '101027101', 'Dover', 'Bullfrog Spas', 'Hot Tub', 'Dover', 'Platinum/Vintage Oak', 'In Stock', NULL, NULL, '69x82, Cover included', NOW(), NOW()),
(uuid_generate_v4(), '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000010', '101021542', 'Hamilton', 'Bullfrog Spas', 'Hot Tub', 'Hamilton', 'Platinum/Vintage Oak', 'In Stock', NULL, NULL, '89x89, Cover included, Location: Deck', NOW(), NOW()),
(uuid_generate_v4(), '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000010', '101023171', 'Hamilton', 'Bullfrog Spas', 'Hot Tub', 'Hamilton', 'Monaco/Modern Hardwood', 'In Stock', NULL, NULL, '89x89, Cover included, Location: Shop', NOW(), NOW()),
(uuid_generate_v4(), '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000010', '101037187', 'Hamilton', 'Bullfrog Spas', 'Hot Tub', 'Hamilton', 'Modern Hardwood/Platinum', 'Sold', NULL, NULL, 'Customer: Evan Johnson, 90x90, Cover included', NOW(), NOW()),
(uuid_generate_v4(), '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000010', '101023179', 'Hamilton', 'Bullfrog Spas', 'Hot Tub', 'Hamilton', 'Monaco/Modern Hardwood', 'Sold', NULL, NULL, 'Customer: Scott Myers, 89x89, Cover included', NOW(), NOW()),
(uuid_generate_v4(), '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000010', '101023170', 'Chelsee', 'Bullfrog Spas', 'Hot Tub', 'Chelsee', 'Midnight/Vintage Oak', 'Sold', NULL, NULL, 'Customer: Sheila & Scott Ressler (Bismarck), 89x89, Cover included', NOW(), NOW()),
(uuid_generate_v4(), '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000010', '101039768', 'Chelsee', 'Bullfrog Spas', 'Hot Tub', 'Chelsee', 'MorningMist/Vintage Oak', 'In Stock', NULL, NULL, '89x89, Cover included', NOW(), NOW()),
(uuid_generate_v4(), '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000010', '101039767', 'Chelsee', 'Bullfrog Spas', 'Hot Tub', 'Chelsee', 'MorningMist/Vintage Oak', 'In Stock', NULL, NULL, '89x89, Cover included', NOW(), NOW()),
(uuid_generate_v4(), '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000010', '101036670', 'Chelsee', 'Bullfrog Spas', 'Hot Tub', 'Chelsee', 'MorningMist/Vintage Oak', 'Sold', NULL, NULL, 'Customer: Matt Larson, 89x89, Cover included', NOW(), NOW()),
(uuid_generate_v4(), '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000010', '101037176', 'Chelsee', 'Bullfrog Spas', 'Hot Tub', 'Chelsee', 'Platinum/Vintage Oak', 'Sold', NULL, NULL, 'Customer: Lucie Deschamp, 89x89, Cover included', NOW(), NOW()),
(uuid_generate_v4(), '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000010', '100982346', 'Cameo', 'Bullfrog Spas', 'Hot Tub', 'Cameo', 'Platinum/Ironwood', 'In Stock', NULL, NULL, '89x89, Cover included', NOW(), NOW()),
(uuid_generate_v4(), '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000010', '100992995', 'Optima', 'Bullfrog Spas', 'Hot Tub', 'Optima', 'Platinum/Windy Oak', 'In Stock', NULL, NULL, '89x89, Cover included', NOW(), NOW()),
(uuid_generate_v4(), '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000010', '101039302', 'Aspen', 'Bullfrog Spas', 'Hot Tub', 'Aspen', 'MorningMist/Ironwood', 'In Stock', NULL, NULL, '103x90, Cover included', NOW(), NOW()),

-- =========================================================================
-- MINOT INVENTORY - JACUZZI Èot TUBS
-- =========================================================================
(uuid_generate_v4(), '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000010', 'R251140', 'Ocho Rios', 'Jacuzzi', 'Hot Tub', 'Ocho Rios', 'Pebble Beach/Graphite', 'In Stock', NULL, NULL, '86x72, Cover included', NOW(), NOW()),

-- =========================================================================
-- MINOT INVENTORY - MASTER SPAS HOT TUBS & SWIM SPAS
-- =========================================================================
(uuid_generate_v4(), '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000010', '2511728', 'Clarity Balance 9', 'Master Spas', 'Hot Tub', 'Clarity Balance 9', 'Sterling Silver/Marble', 'In Stock', NULL, NULL, '108x94, Cover included', NOW(), NOW()),
(uuid_generate_v4(), '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000010', 'Order 210090', 'TS 67.25', 'Master Spas', 'Hot Tub', 'Twilight 67.25', 'Walnut/Midnight', 'In Transit', NULL, NULL, 'Customer: Darren Seifert, Cover included, On Hand: No', NOW(), NOW()),
(uuid_generate_v4(), '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000010', 'Order 210090', 'TS 8.25', 'Master Spas', 'Hot Tub', 'Twilight 8.25', 'Midnight/Stormcloud', 'On Order', NULL, NULL, '94x94, Cover included, On Hand: No', NOW(), NOW()),
(uuid_generate_v4(), '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000010', '2514716', 'Twilight 240', 'Master Spas', 'Hot Tub', 'Twilight 240', 'Sterling Silver/Marble', 'In Stock', NULL, NULL, '78x78, Cover included', NOW(), NOW()),
(uuid_generate_v4(), '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000010', '2515918', 'Twilight 7.25', 'Master Spas', 'Hot Tub', 'Twilight 7.25', 'Sterling Silver/Marble', 'In Stock', NULL, NULL, '84x84, Cover included', NOW(), NOW()),
(uuid_generate_v4(), '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000010', '2603161', 'MPL 900', 'Master Spas', 'Hot Tub', 'MPL 900', 'Midnight/Midnight Canyon', 'In Stock', NULL, NULL, '94x94, Cover included', NOW(), NOW()),
(uuid_generate_v4(), '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000010', '2602788', 'MPL 850', 'Master Spas', 'Hot Tub', 'MPL 850', 'Midnight/Midnight Canyon', 'In Stock', NULL, NULL, '94x94, Cover included', NOW(), NOW()),
(uuid_generate_v4(), '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000010', '2603108', 'Twilight 8.25', 'Master Spas', 'Hot Tub', 'Twilight 8.25', 'Midnight/Midnight Canyon', 'In Stock', NULL, NULL, '94x94, Cover included', NOW(), NOW()),
(uuid_generate_v4(), '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000010', '2603109', 'Twilight 8.25', 'Master Spas', 'Hot Tub', 'Twilight 8.25', 'Sterling Silver/Midnight', 'In Stock', NULL, NULL, '94x94, Cover included', NOW(), NOW()),
(uuid_generate_v4(), '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000010', '2514338', 'Twilight 8.2', 'Master Spas', 'Hot Tub', 'Twilight 8.2', 'Sterling Silver/Marble', 'In Stock', NULL, NULL, '94x94, Cover included', NOW(), NOW()),
(uuid_generate_v4(), '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000010', 'H252153', 'H2X Trainer 21 D', 'Master Spas', 'Swim Spa', 'H2X Trainer 21 D', 'Sterling Silver/Marble', 'Sold', NULL, NULL, 'Customer: Sean Harrington (Bismarck), 257x94, Cover included', NOW(), NOW()),
(uuid_generate_v4(), '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000010', 'Order #339744', 'H2x T15D', 'Master Spas', 'Swim Spa', 'H2X T15D T/C', 'Sterling/Dark Walnut', 'In Transit', NULL, NULL, 'Customer: Shannon Osborn, Cover included, On Hand: No', NOW(), NOW()),
(uuid_generate_v4(), '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000010', 'H252173', 'Therapool 11 D', 'Master Spas', 'Swim Spa', 'Therapool 11 D', 'Sterling Silver/Marble', 'In Stock', NULL, NULL, '132x94, Cover included', NOW(), NOW()),

-- =========================================================================
-- MINOT INVENTORY - JACUZZI ADDITIONAL HOT TUBS
-- =========================================================================
(uuid_generate_v4(), '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000010', 'JL180J1370191H13397', 'Oslo', 'Jacuzzi', 'Hot Tub', 'Oslo', 'Midnight Canyon/Graphite', 'In Stock', NULL, NULL, '90x90, Cover included', NOW(), NOW()),
(uuid_generate_v4(), '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000010', 'MINOT-OSLO-002', 'Oslo', 'Jacuzzi', 'Hot Tub', 'Oslo', 'Sterling Silver/Graphite', 'In Transit', NULL, NULL, 'Customer: Kreutzbender, Ordered 3/25, Cover included, On Hand: No', NOW(), NOW()),
(uuid_generate_v4(), '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000010', 'MINOT-OSLO-003', 'Oslo', 'Jacuzzi', 'Hot Tub', 'Oslo', 'Odyssey/Graphite', 'In Transit', NULL, NULL, 'Ordered 3/25, On Hand: No', NOW(), NOW()),
(uuid_generate_v4(), '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000010', 'GE735J0900054H11044', 'Tokyo', 'Jacuzzi', 'Hot Tub', 'Tokyo', 'Odyssey/Graphite', 'In Stock', NULL, NULL, '88x88, Cover included', NOW(), NOW()),
(uuid_generate_v4(), '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000010', 'JL3260283H14989', 'Maximus', 'Jacuzzi', 'Hot Tub', 'Maximus', 'Sterling Silver/Graphite', 'In Stock', NULL, NULL, '102x87, Cover included', NOW(), NOW()),

-- =========================================================================
-- MINOT INVENTORY - ECO SPA HOT TUBS
-- =========================================================================
(uuid_generate_v4(), '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000010', '01092624372E3HRFG', 'Eco Spa E3', 'Eco Spa', 'Hot Tub', 'Eco Spa E3', 'Harvest', 'In Stock', NULL, NULL, '77x60, Cover included', NOW(), NOW()),
(uuid_generate_v4(), '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000010', '02242624692E3GRFG', 'Eco Spa E3', 'Eco Spa', 'Hot Tub', 'Eco Spa E3', 'Blue/Blackstone', 'In Stock', NULL, NULL, '77x60, Cover included', NOW(), NOW()),
(uuid_generate_v4(), '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000010', '02242624694E3GRFG', 'Eco Spa E3', 'Eco Spa', 'Hot Tub', 'Eco Spa E3', 'Blue/Blackstone', 'In Stock', NULL, NULL, '77x60, Cover included, Location: Outside Stella', NOW(), NOW()),
(uuid_generate_v4(), '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000010', '02242624697E4GRFG', 'Eco Spa E4', 'Eco Spa', 'Hot Tub', 'Eco Spa E4', 'Blue/Blackstone', 'In Stock', NULL, NULL, '77x60, Cover included', NOW(), NOW()),
(uuid_generate_v4(), '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000010', '02242624696E4GRFG', 'Eco Spa E4', 'Eco Spa', 'Hot Tub', 'Eco Spa E4', 'Blue/Blackstone', 'In Stock', NULL, NULL, '77x60, Cover included', NOW(), NOW()),

-- =========================================================================
-- MINOT INVENTORY - GDI SAUNAS
-- =========================================================================
(uuid_generate_v4(), '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000010', 'MINOT-GDI-PRO6-3P-001', 'Pro 6', 'GDI', 'Sauna', 'GDI Pro 6 (3 Person)', '', 'Sold', NULL, NULL, 'Customer: Sky Dancer, Arrived 4/1', NOW(), NOW()),
(uuid_generate_v4(), '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000010', 'MINOT-GDI-PRO6-3P-002', 'Pro 6', 'GDI', 'Sauna', 'GDI Pro 6 (3 Person)', '', 'Sold', NULL, NULL, 'Customer: Sky Dancer, Arrived 4/1', NOW(), NOW()),
(uuid_generate_v4(), '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000010', 'MINOT-GDI-AVILA-001', 'GDI Avila', 'GDI', 'Sauna', 'GDI Avila', '', 'In Transit', NULL, NULL, 'On Hand: No', NOW(), NOW()),

-- =========================================================================
-- MINOT INVENTORY - FINNLEO SAUNAS
-- =========================================================================
(uuid_generate_v4(), '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000010', 'MINOT-HM46-ORDER-001', 'HM46', 'Finnleo', 'Sauna', 'HM46', '', 'On Order', NULL, NULL, 'Customer: Sky Dancer, Ordered 3/30/2026, On Hand: No', NOW(), NOW()),
(uuid_generate_v4(), '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000010', 'MINOT-HM46-ORDER-002', 'HM46', 'Finnleo', 'Sauna', 'HM46', '', 'On Order', NULL, NULL, 'Customer: Sky Dancer, Ordered 3/30/2026, On Hand: No', NOW(), NOW()),
(uuid_generate_v4(), '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000010', 'MINOT-HM46-ORDER-003', 'HM46', 'Finnleo', 'Sauna', 'HM46', '', 'On Order', NULL, NULL, 'Customer: Sky Dancer, Ordered 3/30/2026, On Hand: No', NOW(), NOW()),
(uuid_generate_v4(), '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000010', 'MINOT-IS565-001', 'IS565', 'Finnleo', 'Sauna', 'IS565', '', 'Sold', NULL, NULL, 'Customer: Bisstock (Bismarck)', NOW(), NOW()),
(uuid_generate_v4(), '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000010', 'MINOT-IS440-001', 'IS440', 'Finnleo', 'Sauna', 'IS440', '', 'Sold', NULL, NULL, 'Customer: Jarski', NOW(), NOW()),
(uuid_generate_v4(), '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000010', 'MINOT-IS440-002', 'IS440', 'Finnleo', 'Sauna', 'IS440', '', 'Sold', NULL, NULL, 'Customer: Rist', NOW(), NOW()),
(uuid_generate_v4(), '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000010', 'Order 133714', '11x14 Sequoia', 'Almost Heaven', 'Sauna', '11x14 Sequoia', '', 'In Transit', NULL, NULL, 'Customer: Tom Ator, Ordered 3/16/26, On Hand: No', NOW(), NOW()),
(uuid_generate_v4(), '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000010', 'Order 133683', 'Visscher Sauna', 'Visscher', 'Sauna', 'Visscher Sauna', '', 'In Transit', NULL, NULL, 'Customer: Curt Saari, On Hand: No', NOW(), NOW()),
(uuid_generate_v4(), '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000010', 'INV 169319', 'Hekla 130', 'Harvia', 'Sauna', 'Hekla 130', '', 'Sold', NULL, NULL, 'Customer: Rod Hiatt', NOW(), NOW()),
(uuid_generate_v4(), '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000010', 'MINOT-HEKLA160-001', 'Hekla 160', 'Harvia', 'Sauna', 'Hekla 160', '', 'In Stock', NULL, NULL, '', NOW(), NOW()),
(uuid_generate_v4(), '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000010', 'MINOT-HM44-001', 'HM44', 'Finnleo', 'Sauna', 'HM44', '', 'Sold', NULL, NULL, 'Customer: Travis Whittmayer', NOW(), NOW()),
(uuid_generate_v4(), '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000010', 'MINOT-HM44-002', 'HM44', 'Finnleo', 'Sauna', 'HM44', '', 'In Stock', NULL, NULL, '', NOW(), NOW()),
(uuid_generate_v4(), '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000010', 'MINOT-HM44-003', 'HM44', 'Finnleo', 'Sauna', 'HM44', '', 'In Stock', NULL, NULL, '', NOW(), NOW()),
(uuid_generate_v4(), '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000010', 'MINOT-HM44-004', 'HM44', 'Finnleo', 'Sauna', 'HM44', '', 'In Stock', NULL, NULL, '', NOW(), NOW()),
(uuid_generate_v4(), '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000010', 'MINOT-HM46-001', 'HM46', 'Finnleo', 'Sauna', 'HM46', '', 'In Stock', NULL, NULL, '', NOW(), NOW()),
(uuid_generate_v4(), '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000010', 'MINOT-GDI-8330-001', '8330-01 GDI', 'GDI', 'Sauna', '8330-01 GDI', '', 'In Transit', NULL, NULL, 'Customer: Matt Debowey, Ordered 2/21/2026, On Hand: No', NOW(), NOW()),
(uuid_generate_v4(), '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000010', 'MINOT-IS440-003', 'IS440', 'Finnleo', 'Sauna', 'IS440', '', 'Sold', NULL, NULL, 'Customer: Jen Schell, Delivery: 1-Apr', NOW(), NOW()),
(uuid_generate_v4(), '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000010', 'MINOT-HM46-002', 'HM46', 'Finnleo', 'Sauna', 'HM46', '', 'Sold', NULL, NULL, 'Customer: Allen Poitra', NOW(), NOW()),
(uuid_generate_v4(), '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000010', 'MINOT-S820-001', 'S820', 'Finnleo', 'Sauna', 'S820', '', 'In Stock', NULL, NULL, '', NOW(), NOW()),
(uuid_generate_v4(), '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000010', 'MINOT-S830-001', 'S830', 'Finnleo', 'Sauna', 'S830', '', 'Sold', NULL, NULL, 'Customer: Sarah Karhoff', NOW(), NOW()),
(uuid_generate_v4(), '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000010', 'MINOT-S870-001', 'S870', 'Finnleo', 'Sauna', 'S870', '', 'In Stock', NULL, NULL, '', NOW(), NOW()),
(uuid_generate_v4(), '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000010', 'MINOT-VISSCHER-FM', 'Visscher Sauna', 'Visscher', 'Sauna', 'Visscher Sauna', '', 'In Stock', NULL, NULL, 'Floor Model', NOW(), NOW()),
(uuid_generate_v4(), '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000010', 'MINOT-HEKLA130-FM', 'Hekla 130', 'Harvia', 'Sauna', 'Hekla 130', '', 'In Stock', NULL, NULL, 'Floor Model', NOW(), NOW()),
(uuid_generate_v4(), '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000010', 'MINOT-S820-FM', 'S820', 'Finnleo', 'Sauna', 'S820', '', 'In Stock', NULL, NULL, 'Floor Model', NOW(), NOW()),
(uuid_generate_v4(), '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000010', 'MINOT-S830-FM', 'S830', 'Finnleo', 'Sauna', 'S830', '', 'In Stock', NULL, NULL, 'Floor Model', NOW(), NOW()),
(uuid_generate_v4(), '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000010', 'MINOT-S870-FM', 'S870', 'Finnleo', 'Sauna', 'S870', '', 'In Stock', NULL, NULL, 'Floor Model', NOW(), NOW()),
(uuid_generate_v4(), '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000010', 'MINOT-HM44-FM', 'HM44', 'Finnleo', 'Sauna', 'HM44', '', 'In Stock', NULL, NULL, 'Floor Model', NOW(), NOW()),
(uuid_generate_v4(), '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000010', 'MINOT-HM46-FM', 'HM46', 'Finnleo', 'Sauna', 'HM46', '', 'In Stock', NULL, NULL, 'Floor Model', NOW(), NOW()),
(uuid_generate_v4(), '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000010', 'MINOT-IS440-FM', 'IS440', 'Finnleo', 'Sauna', 'IS440', '', 'In Stock', NULL, NULL, 'Floor Model', NOW(), NOW()),
(uuid_generate_v4(), '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000010', 'MINOT-IS565-FM', 'IS565', 'Finnleo', 'Sauna', 'IS565', '', 'In Stock', NULL, NULL, 'Floor Model', NOW(), NOW()),
(uuid_generate_v4(), '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000010', 'MINOT-NORTHSTAR46-FM', 'NorthStar 46', 'Finnleo', 'Sauna', 'NorthStar 46', '', 'In Stock', NULL, NULL, 'Floor Model', NOW(), NOW()),
(uuid_generate_v4(), '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000010', 'MINOT-TREND-FM', 'Trend Sauna', 'Trend', 'Sauna', 'Trend Sauna', '', 'In Stock', NULL, NULL, 'Floor Model', NOW(), NOW()),
(uuid_generate_v4(), '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000010', 'MINOT-TREND-EVERSON', 'Trend Sauna', 'Trend', 'Sauna', 'Trend Sauna', '', 'Sold', NULL, NULL, 'Customer: Everson (Warehouse)', NOW(), NOW()),
(uuid_generate_v4(), '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000010', 'MINOT-TREND-002', 'Trend Sauna', 'Trend', 'Sauna', 'Trend Sauna', '', 'In Stock', NULL, NULL, '', NOW(), NOW()),
(uuid_generate_v4(), '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000010', 'MINOT-GDI-PRO6-2P-FM', 'Pro 6', 'GDI', 'Sauna', 'GDI Pro 6 (2 Person)', '', 'In Stock', NULL, NULL, 'Floor Model', NOW(), NOW()),
(uuid_generate_v4(), '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000010', 'MINOT-GDI-PRO6-NATALIE-FM', 'Pro 6 Natalie', 'GDI', 'Sauna', 'Pro 6 (Natalie)', '', 'In Stock', NULL, NULL, 'Floor Model', NOW(), NOW()),
(uuid_generate_v4(), '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000010', 'MINOT-BARREL-SAUNA-FM', 'Barrel Sauna', 'GDI', 'Sauna', 'Barrel Sauna', '', 'In Stock', NULL, NULL, 'Floor Model', NOW(), NOW()),

-- =========================================================================
-- MINOT INVENTORY - COVANA COVERS
-- =========================================================================
(uuid_generate_v4(), '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000010', '1105350', 'Covana', 'Covana', 'Cover', 'Covana', 'Oasis Mocha/Darling', 'In Transit', NULL, NULL, 'Customer: Scott Myers, Shipping April 30th, On Hand: No', NOW(), NOW()),
(uuid_generate_v4(), '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000010', 'MINOT-COVANA-001', 'Covana', 'Covana', 'Cover', 'Covana', 'Midnight XL', 'In Transit', NULL, NULL, 'Shipping April 30th, On Hand: No', NOW(), NOW()),
(uuid_generate_v4(), '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000010', 'MINOT-COVANA-002', 'Covana', 'Covana', 'Cover', 'Covana', 'Midnight XL', 'In Transit', NULL, NULL, 'Shipping April 30th, On Hand: No', NOW(), NOW()),
(uuid_generate_v4(), '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000010', 'MINOT-COVANA-003', 'Covana', 'Covana', 'Cover', 'Covana', 'Midnight XL', 'In Transit', NULL, NULL, 'Shipping April 30th, On Hand: No', NOW(), NOW()),
(uuid_generate_v4(), '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000010', 'MINOT-COVANA-004', 'Covana', 'Covana', 'Cover', 'Covana', 'Midnight XL', 'In Transit', NULL, NULL, 'Shipping April 30th, On Hand: No', NOW(), NOW()),

-- =========================================================================
-- MINOT INVENTORY - ITEMS NEEDING TO BE ORDERED
-- =========================================================================
(uuid_generate_v4(), '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000010', 'MINOT-IS565-ORDER', 'Finnleo IS565', 'Finnleo', 'Sauna', 'IS565', '', 'On Order', NULL, NULL, 'Customer: Albert "Butch" Perrin, When Ready', NOW(), NOW()),
(uuid_generate_v4(), '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000010', 'MINOT-HEKLA130-ORDER-001', 'Hekla 130 v3', 'Harvia', 'Sauna', 'Hekla 130', '', 'On Order', NULL, NULL, 'Customer: The Pitt (Williston), ASAP', NOW(), NOW()),
(uuid_generate_v4(), '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000010', 'MINOT-HEKLA130-ORDER-002', 'Hekla 130 v3', 'Harvia', 'Sauna', 'Hekla 130', '', 'On Order', NULL, NULL, 'Customer: Kasey Knox, ASAP', NOW(), NOW()),
(uuid_generate_v4(), '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000010', 'MINOT-HEKLA130-ORDER-003', 'Hekla 130 v3', 'Harvia', 'Sauna', 'Hekla 130', '', 'On Order', NULL, NULL, 'Customer: Virginia Vassen (Williston), ASAP', NOW(), NOW()),
(uuid_generate_v4(), '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000010', 'MINOT-IS440-ORDER', 'Finnleo IS440', 'Finnleo', 'Sauna', 'IS440', '', 'On Order', NULL, NULL, 'Customer: Robert Klebe', NOW(), NOW()),

-- =========================================================================
-- USED INVENTORY - MINOT LOCATION
-- =========================================================================
(uuid_generate_v4(), '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000010', 'USED-RHYTHM-001', 'HotSprings Rhythm', 'Hot Spring', 'Hot Tub', 'Rhythm', '', 'In Stock', 6995.00, NULL, 'USED - Previous Owner: Unknown', NOW(), NOW()),
(uuid_generate_v4(), '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000010', 'USED-JETSETTER-001', 'HotSprings Jetsetter', 'Hot Spring', 'Hot Tub', 'Jetsetter', '', 'In Stock', 3995.00, NULL, 'USED - Previous Owner: Unknown', NOW(), NOW()),
(uuid_generate_v4(), '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000010', 'USED-GRANDEE-001', 'HotSprings Grandee', 'Hot Spring', 'Hot Tub', 'Grandee', '', 'In Stock', 9995.00, NULL, 'USED - Previous Owner: Polsfut', NOW(), NOW()),

-- =========================================================================
-- USED INVENTORY - BISMARCK LOCATION
-- =========================================================================
(uuid_generate_v4(), '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000011', 'USED-TRAINER15D-001', '2022 Trainer 15 D', 'Master Spas', 'Swim Spa', 'Trainer 15 D', '', 'In Stock', 18999.00, NULL, 'USED - Previous Owner: Byron Hansen', NOW(), NOW()),
(uuid_generate_v4(), '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000011', 'USED-MAXXUS-001', '2021 Sundance Maxxus', 'Sundance', 'Hot Tub', 'Sundance Maxxus', '', 'In Stock', 13999.00, NULL, 'USED - Previous Owner: Goehring', NOW(), NOW()),
(uuid_generate_v4(), '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000011', '100713304', '2019 Sundance Altamar', 'Sundance', 'Hot Tub', 'Sundance Altamar', '', 'In Stock', NULL, NULL, 'USED - Previous Owner: Beckler, Price TBD', NOW(), NOW()),
(uuid_generate_v4(), '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000011', '100498474', '2014 Sundance Optima', 'Sundance', 'Hot Tub', 'Sundance Optima', '', 'In Stock', NULL, NULL, 'USED - Previous Owner: Brucker, Price TBD', NOW(), NOW()),

-- =========================================================================
-- USED INVENTORY - MINOT LOCATION (ADDITIONAL)
-- =========================================================================
(uuid_generate_v4(), '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000010', 'USED-CLARITY7-001', '2018 Clarity 7', 'Sundance', 'Hot Tub', 'Clarity 7', '', 'In Stock', 6995.00, NULL, 'USED - Previous Owner: Marsha Hollen', NOW(), NOW());
