-- Tradify App Seed Data
-- Generated: 2026-01-24
-- This file seeds the local Supabase database with test data

-- ============================================
-- AUTH USERS (must be created first)
-- These are test users for local development
-- Password for all: "password123"
-- ============================================

-- Create auth users directly in auth.users table
-- The password hash is for "password123" using bcrypt
INSERT INTO auth.users (
  id,
  instance_id,
  aud,
  role,
  email,
  encrypted_password,
  email_confirmed_at,
  created_at,
  updated_at,
  confirmation_token,
  recovery_token,
  email_change_token_new,
  email_change
) VALUES
-- Client: Ronan Ling
(
  'f58b331c-c523-4ec3-aa1c-1e0d1300cb56',
  '00000000-0000-0000-0000-000000000000',
  'authenticated',
  'authenticated',
  'seally2@ninja.dev',
  '$2a$10$PznXkMAL3kJTLT0s6J7Lb.ZxzKLMjOJzGNoK9eXqkJpLLqKPqBnLe',
  NOW(),
  '2025-08-19 10:54:00.88077+00',
  NOW(),
  '',
  '',
  '',
  ''
),
-- Trade: Ninja Trades
(
  '3daa9bcd-feb0-4a2e-8d09-cd5c2db1f63f',
  '00000000-0000-0000-0000-000000000000',
  'authenticated',
  'authenticated',
  'seally@ninja.dev',
  '$2a$10$PznXkMAL3kJTLT0s6J7Lb.ZxzKLMjOJzGNoK9eXqkJpLLqKPqBnLe',
  NOW(),
  '2025-08-19 08:45:43.021274+00',
  NOW(),
  '',
  '',
  '',
  ''
),
-- Trade: Ronan Ling (test trade account)
(
  'ac295f71-2868-4794-8c01-13d9b0e87788',
  '00000000-0000-0000-0000-000000000000',
  'authenticated',
  'authenticated',
  'ronan@test.settled.com',
  '$2a$10$PznXkMAL3kJTLT0s6J7Lb.ZxzKLMjOJzGNoK9eXqkJpLLqKPqBnLe',
  NOW(),
  '2026-01-09 10:44:22.746162+00',
  NOW(),
  '',
  '',
  '',
  ''
)
ON CONFLICT (id) DO NOTHING;

-- Create identities for email login
INSERT INTO auth.identities (
  id,
  user_id,
  identity_data,
  provider,
  provider_id,
  created_at,
  updated_at,
  last_sign_in_at
) VALUES
(
  'f58b331c-c523-4ec3-aa1c-1e0d1300cb56',
  'f58b331c-c523-4ec3-aa1c-1e0d1300cb56',
  '{"sub": "f58b331c-c523-4ec3-aa1c-1e0d1300cb56", "email": "seally2@ninja.dev"}',
  'email',
  'f58b331c-c523-4ec3-aa1c-1e0d1300cb56',
  '2025-08-19 10:54:00.88077+00',
  NOW(),
  NOW()
),
(
  '3daa9bcd-feb0-4a2e-8d09-cd5c2db1f63f',
  '3daa9bcd-feb0-4a2e-8d09-cd5c2db1f63f',
  '{"sub": "3daa9bcd-feb0-4a2e-8d09-cd5c2db1f63f", "email": "seally@ninja.dev"}',
  'email',
  '3daa9bcd-feb0-4a2e-8d09-cd5c2db1f63f',
  '2025-08-19 08:45:43.021274+00',
  NOW(),
  NOW()
),
(
  'ac295f71-2868-4794-8c01-13d9b0e87788',
  'ac295f71-2868-4794-8c01-13d9b0e87788',
  '{"sub": "ac295f71-2868-4794-8c01-13d9b0e87788", "email": "ronan@test.settled.com"}',
  'email',
  'ac295f71-2868-4794-8c01-13d9b0e87788',
  '2026-01-09 10:44:22.746162+00',
  NOW(),
  NOW()
)
ON CONFLICT (id) DO NOTHING;

-- ============================================
-- SERVICE CATEGORIES
-- ============================================
INSERT INTO service_categories (id, name, icon, display_order, is_active, created_at) VALUES ('c88b205e-1273-4f5d-89d7-10b0675c6963', 'Bathroom', 'mci:shower', 3, true, '2025-12-23 11:09:16.779843+00') ON CONFLICT (id) DO NOTHING;
INSERT INTO service_categories (id, name, icon, display_order, is_active, created_at) VALUES ('c26716a3-1e42-409d-a15e-da264b4c9095', 'Cleaning', 'sparkles-outline', 5, true, '2025-12-23 11:09:16.779843+00') ON CONFLICT (id) DO NOTHING;
INSERT INTO service_categories (id, name, icon, display_order, is_active, created_at) VALUES ('95af3cb6-696f-420f-b124-42111eb0ca9e', 'Electrical', 'flash-outline', 2, true, '2025-12-23 11:09:16.779843+00') ON CONFLICT (id) DO NOTHING;
INSERT INTO service_categories (id, name, icon, display_order, is_active, created_at) VALUES ('4ead32f6-a2e3-482c-88b9-3397861c26ba', 'Handyman', 'hammer-outline', 6, true, '2025-12-23 11:09:16.779843+00') ON CONFLICT (id) DO NOTHING;
INSERT INTO service_categories (id, name, icon, display_order, is_active, created_at) VALUES ('402c2f47-0886-496d-a6c1-0621729375d3', 'Kitchen', 'mci:stove', 4, true, '2025-12-23 11:09:16.779843+00') ON CONFLICT (id) DO NOTHING;
INSERT INTO service_categories (id, name, icon, display_order, is_active, created_at) VALUES ('7f62d9db-ab5c-4d22-ba94-13f1de90d24f', 'Plumbing', 'water-outline', 1, true, '2025-12-23 11:09:16.779843+00') ON CONFLICT (id) DO NOTHING;

-- ============================================
-- SERVICE TYPES
-- ============================================
-- Plumbing
INSERT INTO service_types (id, category_id, name, icon, display_order, is_active, created_at) VALUES ('6902cab8-fb6a-4b52-84c3-93417923e902', '7f62d9db-ab5c-4d22-ba94-13f1de90d24f', 'Leak or drip', '💧', 1, true, '2025-12-23 11:09:16.779843+00') ON CONFLICT (id) DO NOTHING;
INSERT INTO service_types (id, category_id, name, icon, display_order, is_active, created_at) VALUES ('6be9c638-219c-4c40-8a83-9c0c34bdc974', '7f62d9db-ab5c-4d22-ba94-13f1de90d24f', 'Blocked drain', '🪠', 2, true, '2025-12-23 11:09:16.779843+00') ON CONFLICT (id) DO NOTHING;
INSERT INTO service_types (id, category_id, name, icon, display_order, is_active, created_at) VALUES ('1fe6db54-0151-4ad7-bea5-9612eaece13c', '7f62d9db-ab5c-4d22-ba94-13f1de90d24f', 'Toilet problem', '🚽', 3, true, '2025-12-23 11:09:16.779843+00') ON CONFLICT (id) DO NOTHING;
INSERT INTO service_types (id, category_id, name, icon, display_order, is_active, created_at) VALUES ('9a1c5de3-7569-4094-b30e-e94a53349feb', '7f62d9db-ab5c-4d22-ba94-13f1de90d24f', 'Boiler / heating', '🔥', 4, true, '2025-12-23 11:09:16.779843+00') ON CONFLICT (id) DO NOTHING;
INSERT INTO service_types (id, category_id, name, icon, display_order, is_active, created_at) VALUES ('90a30505-5c67-4414-afa2-23d066d1c2b6', '7f62d9db-ab5c-4d22-ba94-13f1de90d24f', 'New installation', '🔧', 5, true, '2025-12-23 11:09:16.779843+00') ON CONFLICT (id) DO NOTHING;
INSERT INTO service_types (id, category_id, name, icon, display_order, is_active, created_at) VALUES ('3a69e103-ea69-46b3-9561-3fc09d1bc648', '7f62d9db-ab5c-4d22-ba94-13f1de90d24f', 'Something else', '❓', 99, true, '2025-12-23 11:09:16.779843+00') ON CONFLICT (id) DO NOTHING;

-- Electrical
INSERT INTO service_types (id, category_id, name, icon, display_order, is_active, created_at) VALUES ('d8501489-092e-475a-9e51-373d8022d408', '95af3cb6-696f-420f-b124-42111eb0ca9e', 'Socket or switch issue', '🔌', 1, true, '2025-12-23 11:09:16.779843+00') ON CONFLICT (id) DO NOTHING;
INSERT INTO service_types (id, category_id, name, icon, display_order, is_active, created_at) VALUES ('811b8bb3-3bb8-4459-94dd-5417962fe8b1', '95af3cb6-696f-420f-b124-42111eb0ca9e', 'Lighting problem', '💡', 2, true, '2025-12-23 11:09:16.779843+00') ON CONFLICT (id) DO NOTHING;
INSERT INTO service_types (id, category_id, name, icon, display_order, is_active, created_at) VALUES ('278a50dd-4421-473a-9e08-d5028bd53470', '95af3cb6-696f-420f-b124-42111eb0ca9e', 'Fuse box / consumer unit', '⚡', 3, true, '2025-12-23 11:09:16.779843+00') ON CONFLICT (id) DO NOTHING;
INSERT INTO service_types (id, category_id, name, icon, display_order, is_active, created_at) VALUES ('caa74f10-a21c-4682-b19a-34b63ddb5307', '95af3cb6-696f-420f-b124-42111eb0ca9e', 'Rewiring', '🔗', 4, true, '2025-12-23 11:09:16.779843+00') ON CONFLICT (id) DO NOTHING;
INSERT INTO service_types (id, category_id, name, icon, display_order, is_active, created_at) VALUES ('db37fb53-6e88-4a22-86d2-c1ea19cc413b', '95af3cb6-696f-420f-b124-42111eb0ca9e', 'New installation', '🔧', 5, true, '2025-12-23 11:09:16.779843+00') ON CONFLICT (id) DO NOTHING;
INSERT INTO service_types (id, category_id, name, icon, display_order, is_active, created_at) VALUES ('f72d6be2-4b1a-4096-a53e-5fcd21620394', '95af3cb6-696f-420f-b124-42111eb0ca9e', 'Something else', '❓', 99, true, '2025-12-23 11:09:16.779843+00') ON CONFLICT (id) DO NOTHING;

-- Bathroom
INSERT INTO service_types (id, category_id, name, icon, display_order, is_active, created_at) VALUES ('84541d25-3e7d-4aa1-a102-11918ff37a22', 'c88b205e-1273-4f5d-89d7-10b0675c6963', 'Full bathroom refit', '🛁', 1, true, '2025-12-23 11:09:16.779843+00') ON CONFLICT (id) DO NOTHING;
INSERT INTO service_types (id, category_id, name, icon, display_order, is_active, created_at) VALUES ('36c0bb8c-bde0-4f85-bb7a-af927f19cf9b', 'c88b205e-1273-4f5d-89d7-10b0675c6963', 'Shower installation', '🚿', 2, true, '2025-12-23 11:09:16.779843+00') ON CONFLICT (id) DO NOTHING;
INSERT INTO service_types (id, category_id, name, icon, display_order, is_active, created_at) VALUES ('b4668085-df30-47de-8332-da0af1dd6df0', 'c88b205e-1273-4f5d-89d7-10b0675c6963', 'Bath installation', '🛀', 3, true, '2025-12-23 11:09:16.779843+00') ON CONFLICT (id) DO NOTHING;
INSERT INTO service_types (id, category_id, name, icon, display_order, is_active, created_at) VALUES ('daa128cf-17bf-46ba-990a-770c31e6d6af', 'c88b205e-1273-4f5d-89d7-10b0675c6963', 'Tiling', '🔲', 4, true, '2025-12-23 11:09:16.779843+00') ON CONFLICT (id) DO NOTHING;
INSERT INTO service_types (id, category_id, name, icon, display_order, is_active, created_at) VALUES ('07ba5e67-6eca-4d88-8b0a-ec9c3e828339', 'c88b205e-1273-4f5d-89d7-10b0675c6963', 'Plumbing work', '🚰', 5, true, '2025-12-23 11:09:16.779843+00') ON CONFLICT (id) DO NOTHING;
INSERT INTO service_types (id, category_id, name, icon, display_order, is_active, created_at) VALUES ('3c83ee89-7527-4594-bcef-f7f1fc646812', 'c88b205e-1273-4f5d-89d7-10b0675c6963', 'Something else', '❓', 99, true, '2025-12-23 11:09:16.779843+00') ON CONFLICT (id) DO NOTHING;

-- Cleaning
INSERT INTO service_types (id, category_id, name, icon, display_order, is_active, created_at) VALUES ('0d353b24-98e8-4c13-a185-48eaf179747b', 'c26716a3-1e42-409d-a15e-da264b4c9095', 'Deep clean', '🧹', 1, true, '2025-12-23 11:09:16.779843+00') ON CONFLICT (id) DO NOTHING;
INSERT INTO service_types (id, category_id, name, icon, display_order, is_active, created_at) VALUES ('ea49b06a-559d-4c34-9bf4-d43cf2a4c332', 'c26716a3-1e42-409d-a15e-da264b4c9095', 'End of tenancy', '🏠', 2, true, '2025-12-23 11:09:16.779843+00') ON CONFLICT (id) DO NOTHING;
INSERT INTO service_types (id, category_id, name, icon, display_order, is_active, created_at) VALUES ('d50bda0e-8395-49c0-8f93-638fa7bcc82c', 'c26716a3-1e42-409d-a15e-da264b4c9095', 'Carpet cleaning', '🧽', 3, true, '2025-12-23 11:09:16.779843+00') ON CONFLICT (id) DO NOTHING;
INSERT INTO service_types (id, category_id, name, icon, display_order, is_active, created_at) VALUES ('b32a0a8e-397e-4474-90cd-4955a7e1780a', 'c26716a3-1e42-409d-a15e-da264b4c9095', 'Window cleaning', '🪟', 4, true, '2025-12-23 11:09:16.779843+00') ON CONFLICT (id) DO NOTHING;
INSERT INTO service_types (id, category_id, name, icon, display_order, is_active, created_at) VALUES ('bc19e988-bef5-41e1-bba5-90d9c5c99bce', 'c26716a3-1e42-409d-a15e-da264b4c9095', 'Regular cleaning', '🧴', 5, true, '2025-12-23 11:09:16.779843+00') ON CONFLICT (id) DO NOTHING;
INSERT INTO service_types (id, category_id, name, icon, display_order, is_active, created_at) VALUES ('ea0e678b-6d82-4127-bdbf-ec9a50aba609', 'c26716a3-1e42-409d-a15e-da264b4c9095', 'Something else', '❓', 99, true, '2025-12-23 11:09:16.779843+00') ON CONFLICT (id) DO NOTHING;

-- Handyman
INSERT INTO service_types (id, category_id, name, icon, display_order, is_active, created_at) VALUES ('0b6b59d5-21a7-4a05-9c77-ae2762aebf21', '4ead32f6-a2e3-482c-88b9-3397861c26ba', 'Furniture assembly', '🪑', 1, true, '2025-12-23 11:09:16.779843+00') ON CONFLICT (id) DO NOTHING;
INSERT INTO service_types (id, category_id, name, icon, display_order, is_active, created_at) VALUES ('c95ceebc-9d9c-4abe-888f-8cc1ffa09c1c', '4ead32f6-a2e3-482c-88b9-3397861c26ba', 'Painting / decorating', '🎨', 2, true, '2025-12-23 11:09:16.779843+00') ON CONFLICT (id) DO NOTHING;
INSERT INTO service_types (id, category_id, name, icon, display_order, is_active, created_at) VALUES ('375a0613-0696-4eda-b4d1-51bb6713a4e3', '4ead32f6-a2e3-482c-88b9-3397861c26ba', 'Shelving / mounting', '📚', 3, true, '2025-12-23 11:09:16.779843+00') ON CONFLICT (id) DO NOTHING;
INSERT INTO service_types (id, category_id, name, icon, display_order, is_active, created_at) VALUES ('da139829-c03c-4a24-b582-7ba11d8038ec', '4ead32f6-a2e3-482c-88b9-3397861c26ba', 'Door / window repair', '🚪', 4, true, '2025-12-23 11:09:16.779843+00') ON CONFLICT (id) DO NOTHING;
INSERT INTO service_types (id, category_id, name, icon, display_order, is_active, created_at) VALUES ('5dbbe027-e487-47ba-a5dd-8918a7534dbf', '4ead32f6-a2e3-482c-88b9-3397861c26ba', 'General repairs', '🔨', 5, true, '2025-12-23 11:09:16.779843+00') ON CONFLICT (id) DO NOTHING;
INSERT INTO service_types (id, category_id, name, icon, display_order, is_active, created_at) VALUES ('7211f47c-acca-4bac-a188-05cfead01b65', '4ead32f6-a2e3-482c-88b9-3397861c26ba', 'Something else', '❓', 99, true, '2025-12-23 11:09:16.779843+00') ON CONFLICT (id) DO NOTHING;

-- Kitchen
INSERT INTO service_types (id, category_id, name, icon, display_order, is_active, created_at) VALUES ('0626bea4-0571-46f2-84fc-c9eba2f46534', '402c2f47-0886-496d-a6c1-0621729375d3', 'Full kitchen refit', '🍳', 1, true, '2025-12-23 11:09:16.779843+00') ON CONFLICT (id) DO NOTHING;
INSERT INTO service_types (id, category_id, name, icon, display_order, is_active, created_at) VALUES ('36253930-340f-48b2-a7a6-db5faf9f9047', '402c2f47-0886-496d-a6c1-0621729375d3', 'Appliance installation', '🧺', 2, true, '2025-12-23 11:09:16.779843+00') ON CONFLICT (id) DO NOTHING;
INSERT INTO service_types (id, category_id, name, icon, display_order, is_active, created_at) VALUES ('075bb8f8-76c6-47f4-95e0-868b7f52664d', '402c2f47-0886-496d-a6c1-0621729375d3', 'Worktop replacement', '🪵', 3, true, '2025-12-23 11:09:16.779843+00') ON CONFLICT (id) DO NOTHING;
INSERT INTO service_types (id, category_id, name, icon, display_order, is_active, created_at) VALUES ('14d516f7-2031-4bd3-85de-fb0a4841bf1a', '402c2f47-0886-496d-a6c1-0621729375d3', 'Cabinet fitting', '🪚', 4, true, '2025-12-23 11:09:16.779843+00') ON CONFLICT (id) DO NOTHING;
INSERT INTO service_types (id, category_id, name, icon, display_order, is_active, created_at) VALUES ('ce4dada2-3bd2-491a-b609-28a97ff6e544', '402c2f47-0886-496d-a6c1-0621729375d3', 'Tiling / splashback', '🧱', 5, true, '2025-12-23 11:09:16.779843+00') ON CONFLICT (id) DO NOTHING;
INSERT INTO service_types (id, category_id, name, icon, display_order, is_active, created_at) VALUES ('ac982698-a0ac-4948-90f9-3a21df8a8d55', '402c2f47-0886-496d-a6c1-0621729375d3', 'Something else', '❓', 99, true, '2025-12-23 11:09:16.779843+00') ON CONFLICT (id) DO NOTHING;

-- ============================================
-- PROPERTY TYPES
-- ============================================
INSERT INTO property_types (id, name, display_order, is_active) VALUES ('4075db6c-cb0c-45a2-82ef-816709ae2d66', 'House', 1, true) ON CONFLICT (id) DO NOTHING;
INSERT INTO property_types (id, name, display_order, is_active) VALUES ('bce64511-18ca-42ed-a68d-b70822fc57ab', 'Flat / Apartment', 2, true) ON CONFLICT (id) DO NOTHING;
INSERT INTO property_types (id, name, display_order, is_active) VALUES ('45d49f0f-d634-40c3-b455-88eeff292cbb', 'Bungalow', 3, true) ON CONFLICT (id) DO NOTHING;
INSERT INTO property_types (id, name, display_order, is_active) VALUES ('7d63f015-d9f3-4173-a311-157ef9003937', 'Terraced house', 4, true) ON CONFLICT (id) DO NOTHING;
INSERT INTO property_types (id, name, display_order, is_active) VALUES ('6026ba29-e77e-4df3-b014-54f610bdbeba', 'Commercial property', 5, true) ON CONFLICT (id) DO NOTHING;
INSERT INTO property_types (id, name, display_order, is_active) VALUES ('8fac7630-2e3f-4ebd-b64b-9312edbecdad', 'Other', 6, true) ON CONFLICT (id) DO NOTHING;

-- ============================================
-- TIMING OPTIONS
-- ============================================
INSERT INTO timing_options (id, name, description, display_order, is_emergency, is_active) VALUES ('05425f66-ec75-4b54-9416-1f669e0f780c', 'I''m flexible', 'No rush, get quotes at your convenience', 1, false, true) ON CONFLICT (id) DO NOTHING;
INSERT INTO timing_options (id, name, description, display_order, is_emergency, is_active) VALUES ('657f93c5-7869-4728-b7da-6345710811a0', 'Within a week', 'Would like work done soon', 2, false, true) ON CONFLICT (id) DO NOTHING;
INSERT INTO timing_options (id, name, description, display_order, is_emergency, is_active) VALUES ('87fc3728-8990-4c3e-95e8-6e7f47fe6425', 'Within 48 hours', 'Urgent but not emergency', 3, false, true) ON CONFLICT (id) DO NOTHING;
INSERT INTO timing_options (id, name, description, display_order, is_emergency, is_active) VALUES ('298d9406-a1ea-4897-919f-82b0a9ecbebe', 'Emergency (today)', 'Need someone as soon as possible', 4, true, true) ON CONFLICT (id) DO NOTHING;

-- ============================================
-- TEST PROFILES
-- ============================================

-- Client: Ronan Ling (seally2@ninja.dev)
INSERT INTO profiles (id, role, full_name, email, phone, service_radius_km, service_type_ids, created_at)
VALUES ('f58b331c-c523-4ec3-aa1c-1e0d1300cb56', 'client', 'Ronan Ling', 'seally2@ninja.dev', '07716298156', 25.00, '{}', '2025-08-19 10:54:00.88077+00')
ON CONFLICT (id) DO NOTHING;

-- Trade: Ninja Trades (seally@ninja.dev) - Leeds based
INSERT INTO profiles (id, role, full_name, email, business_name, trade_title, bio, phone, base_postcode, base_lat, base_lon, service_radius_km, town_city, service_type_ids, created_at)
VALUES ('3daa9bcd-feb0-4a2e-8d09-cd5c2db1f63f', 'trades', 'Ninja Trades', 'seally@ninja.dev', 'Ninja Trades', 'Plumber & Electrician', 'Fast and friendly. We handle bathrooms, leaks, and more.', '+447700900123', 'LS1 2AB', 53.799700, -1.549200, 50.00, 'Leeds', '{}', '2025-08-19 08:45:43.021274+00')
ON CONFLICT (id) DO NOTHING;

-- Trade: Ronan Ling (ronan@test.settled.com) - West Lothian based
INSERT INTO profiles (id, role, full_name, email, business_name, bio, phone, base_postcode, base_lat, base_lon, service_radius_km, town_city, service_type_ids, created_at)
VALUES ('ac295f71-2868-4794-8c01-13d9b0e87788', 'trades', 'Ronan Ling', 'ronan@test.settled.com', 'Settled by Settled', 'I am the greatest of all time. I provide Chrome Hearts locks as a free gift. Hire me if you''re not cheap and prefer quality.', '7700900000', 'EH48 3NN', 55.899370, -3.644790, 40.00, 'West Lothian', '{}', '2026-01-09 10:44:22.746162+00')
ON CONFLICT (id) DO NOTHING;

-- ============================================
-- SAMPLE QUOTE REQUEST (Direct Request)
-- ============================================
INSERT INTO quote_requests (id, requester_id, status, suggested_title, postcode, is_direct, created_at)
VALUES ('d6754603-a62f-46d3-803f-4b7a0b634d7f', 'f58b331c-c523-4ec3-aa1c-1e0d1300cb56', 'claimed', 'Kitchen - Full kitchen refit', 'EH48 3NN', true, '2026-01-14 15:00:41.072154+00')
ON CONFLICT (id) DO NOTHING;

-- ============================================
-- SAMPLE REQUEST TARGET (Direct Request)
-- ============================================
INSERT INTO request_targets (id, request_id, trade_id, invited_by, state, created_at, outside_service_area, distance_miles, extended_match)
VALUES ('e9aed400-dbd6-461a-87fd-6e66f2378c73', 'd6754603-a62f-46d3-803f-4b7a0b634d7f', 'ac295f71-2868-4794-8c01-13d9b0e87788', 'client', 'client_accepted', '2026-01-14 15:00:41.633974+00', false, NULL, false)
ON CONFLICT (id) DO NOTHING;

-- ============================================
-- DONE!
-- ============================================
SELECT 'Seed data loaded successfully!' as status;
