-- Debug: Check User Status in Database
-- Run this in Supabase SQL Editor to see what's actually stored

SELECT 
    email,
    role,
    status,
    first_name,
    last_name,
    created_at
FROM users
ORDER BY created_at DESC
LIMIT 10;

-- Specifically check the test account you just created
-- Replace 'test@example.com' with the actual email
SELECT 
    email,
    role,
    status,
    first_name,
    last_name
FROM users
WHERE email = 'your-test-email@example.com';  -- REPLACE WITH YOUR TEST EMAIL

-- Check if there are any NULL statuses (which would bypass the check)
SELECT 
    email,
    role,
    status,
    CASE 
        WHEN status IS NULL THEN 'NULL (PROBLEM!)'
        WHEN status = '' THEN 'EMPTY STRING (PROBLEM!)'
        ELSE status
    END as status_debug
FROM users
WHERE status IS NULL OR status = '' OR status != 'active';
