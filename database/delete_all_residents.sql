-- ============================================================
-- CLEANUP: Remove ALL Resident accounts
-- Deletes from both auth.users AND public.users
-- ============================================================

-- 1. Delete from auth.users (cascades or removes login ability)
-- We find the residents by looking them up in public.users first
DELETE FROM auth.users
WHERE id IN (
    SELECT id 
    FROM public.users 
    WHERE role = 'resident'
);

-- 2. Delete from public.users (profile records)
DELETE FROM public.users
WHERE role = 'resident';

-- 3. Verify they are gone
SELECT COUNT(*) AS remaining_residents
FROM public.users
WHERE role = 'resident';
