-- ============================================================================
-- APCD OEM Empanelment Portal - Database Seed Data
-- National Productivity Council (NPC) / CPCB
-- Run this against the PostgreSQL database to populate initial data
-- ============================================================================

-- ========================================
-- 1. APCD Types (7 categories, 21 subtypes)
-- ========================================
INSERT INTO apcd_types (id, category, sub_type, sort_order, is_active, created_at)
VALUES
  -- ESP
  (gen_random_uuid(), 'ESP', 'Dry ESP (Plate/Tube Type)', 1, true, NOW()),
  (gen_random_uuid(), 'ESP', 'Wet ESP', 2, true, NOW()),
  -- Bag Filter / Baghouse Systems
  (gen_random_uuid(), 'BAG_FILTER', 'Pulse Jet Baghouse', 3, true, NOW()),
  (gen_random_uuid(), 'BAG_FILTER', 'Reverse Air Baghouse', 4, true, NOW()),
  (gen_random_uuid(), 'BAG_FILTER', 'Mechanical Shaker Baghouse', 5, true, NOW()),
  -- Cyclones
  (gen_random_uuid(), 'CYCLONE', 'Single Cyclone', 6, true, NOW()),
  (gen_random_uuid(), 'CYCLONE', 'Twin Cyclone', 7, true, NOW()),
  (gen_random_uuid(), 'CYCLONE', 'Multi Cyclone / Multi-Clone', 8, true, NOW()),
  (gen_random_uuid(), 'CYCLONE', 'High-Efficiency Cyclone', 9, true, NOW()),
  -- Wet Scrubber
  (gen_random_uuid(), 'WET_SCRUBBER', 'Venturi Scrubber', 10, true, NOW()),
  (gen_random_uuid(), 'WET_SCRUBBER', 'Spray Tower / Spray Scrubber', 11, true, NOW()),
  (gen_random_uuid(), 'WET_SCRUBBER', 'Packed Bed Scrubber', 12, true, NOW()),
  (gen_random_uuid(), 'WET_SCRUBBER', 'Submerged Scrubber', 13, true, NOW()),
  (gen_random_uuid(), 'WET_SCRUBBER', 'Multi-Stage Wet Scrubber', 14, true, NOW()),
  -- Dry Scrubber
  (gen_random_uuid(), 'DRY_SCRUBBER', 'Dry Sorbent Injection', 15, true, NOW()),
  (gen_random_uuid(), 'DRY_SCRUBBER', 'Semi-Dry Scrubber', 16, true, NOW()),
  -- Hybrid / Other
  (gen_random_uuid(), 'HYBRID_OTHER', 'Hybrid ESP-Baghouse', 17, true, NOW()),
  (gen_random_uuid(), 'HYBRID_OTHER', 'Hybrid Wet-Dry Scrubbers', 18, true, NOW()),
  (gen_random_uuid(), 'HYBRID_OTHER', 'Electrostatic Gravel Bed', 19, true, NOW()),
  (gen_random_uuid(), 'HYBRID_OTHER', 'New Advance/Patented/Hybrid Technologies', 20, true, NOW()),
  -- Fume Extraction
  (gen_random_uuid(), 'FUME_EXTRACTION', 'Industrial Fume/Dust Extraction System', 21, true, NOW())
ON CONFLICT (category, sub_type) DO NOTHING;

-- ========================================
-- 2. Fee Configurations
-- ========================================
INSERT INTO fee_configurations (id, payment_type, base_amount, gst_rate, discount_percent, description, is_active, updated_at)
VALUES
  (gen_random_uuid(), 'APPLICATION_FEE', 25000, 18, 15, 'Application Processing Fee - one-time, non-refundable', true, NOW()),
  (gen_random_uuid(), 'EMPANELMENT_FEE', 65000, 18, 15, 'Empanelment Fee - per APCD model type', true, NOW()),
  (gen_random_uuid(), 'FIELD_VERIFICATION', 57000, 18, 15, 'Field Verification Fee - payable when field verification is required', true, NOW()),
  (gen_random_uuid(), 'EMISSION_TESTING', 0, 18, 15, 'Emission Testing Fee - charged on actuals', true, NOW()),
  (gen_random_uuid(), 'ANNUAL_RENEWAL', 35000, 18, 15, 'Annual Renewal Fee - payable 60 days before expiry', true, NOW()),
  (gen_random_uuid(), 'SURVEILLANCE_VISIT', 0, 18, 15, 'Surveillance Visit - charges on actuals as required', true, NOW())
ON CONFLICT (payment_type) DO NOTHING;

-- ========================================
-- 3. Admin User (admin@npcindia.gov.in / Admin@APCD2025!)
-- ========================================
INSERT INTO users (id, email, password_hash, role, is_active, is_verified, first_name, last_name, created_at, updated_at)
VALUES
  (gen_random_uuid(), 'admin@npcindia.gov.in', '$2a$12$e.NF.vt53MT2rtVWXB8ZTOSG.W3oiLF5d78vtIxW/W.sa0UUd52bS', 'SUPER_ADMIN', true, true, 'System', 'Administrator', NOW(), NOW())
ON CONFLICT (email) DO NOTHING;

-- ========================================
-- 4. Test Officer (officer@npcindia.gov.in / Officer@APCD2025!)
-- ========================================
INSERT INTO users (id, email, password_hash, role, is_active, is_verified, first_name, last_name, created_at, updated_at)
VALUES
  (gen_random_uuid(), 'officer@npcindia.gov.in', '$2b$12$E8FBDTfNAT2Fb.lJDOejs.BVhAJ9xC0pH4hhwpVj7mzwBT1IQmxwq', 'OFFICER', true, true, 'Test', 'Officer', NOW(), NOW())
ON CONFLICT (email) DO NOTHING;

-- Done
SELECT 'Seed completed: ' ||
  (SELECT COUNT(*) FROM apcd_types) || ' APCD types, ' ||
  (SELECT COUNT(*) FROM fee_configurations) || ' fee configs, ' ||
  (SELECT COUNT(*) FROM users WHERE role IN ('SUPER_ADMIN', 'OFFICER')) || ' admin/officer users';
