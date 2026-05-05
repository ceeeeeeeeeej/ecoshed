-- ============================================================
-- CLEANUP: Remove all Resident User accounts (formerly Guest Residents)
-- Deletes from both auth.users AND public.users
-- ============================================================

-- 1. Delete from auth.users (Resident User OR Guest Resident)
DELETE FROM auth.users
WHERE (raw_user_meta_data->>'first_name' = 'Resident' AND raw_user_meta_data->>'last_name' = 'User')
   OR (raw_user_meta_data->>'first_name' = 'Guest' AND raw_user_meta_data->>'last_name' = 'Resident');

-- 2. Delete from public.users (Resident User OR Guest Resident)
DELETE FROM public.users
WHERE (
    (first_name = 'Resident' AND last_name  = 'User') OR
    (first_name = 'Guest' AND last_name  = 'Resident')
  )
  AND purok IN ('Bayabas','Sandiya','Pinya','Mambago','Acacia','Ipil-ipil');

-- 3. Verify they are gone
SELECT COUNT(*) AS remaining_resident_users
FROM public.users
WHERE (first_name = 'Resident' AND last_name = 'User')
   OR (first_name = 'Guest' AND last_name = 'Resident');
