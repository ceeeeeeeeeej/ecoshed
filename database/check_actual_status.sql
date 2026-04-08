-- Check what status is ACTUALLY being saved in the database
-- Run this RIGHT AFTER creating a new test account

-- 1. Check the newest accounts
SELECT 
    email,
    role,
    status,
    created_at
FROM users
ORDER BY created_at DESC
LIMIT 5;

-- 2. Check specifically for the account you just created
-- Replace with the actual email
SELECT 
    email,
    role,
    status,
    created_at
FROM users
WHERE email = 'asdasdaweq2eq2@gmail.com';  -- REPLACE WITH YOUR TEST EMAIL

-- 3. Check if there's a database trigger changing the status
-- Look for any triggers on the users table
SELECT 
    trigger_name,
    event_manipulation,
    action_statement
FROM information_schema.triggers
WHERE event_object_table = 'users';

-- 4. Check the table's default value for status column
SELECT 
    column_name,
    column_default,
    is_nullable,
    data_type
FROM information_schema.columns
WHERE table_name = 'users' 
AND column_name = 'status';
