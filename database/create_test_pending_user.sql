-- Quick Test: Create a Pending User for Testing Approval System
-- Run this in your Supabase SQL Editor to create a test pending user

-- First, create a test user in auth.users (this simulates a signup)
-- Note: You'll need to replace 'YOUR_TEST_EMAIL' and set a password hash

-- Option 1: Manually update an existing user to pending status
UPDATE users 
SET status = 'pending_approval'
WHERE email = 'test@example.com';  -- Replace with an actual email from your users table

-- Option 2: Insert a completely new test pending user
-- (You'll need to create the auth user first via the Supabase dashboard or registration page)

-- To see all pending users:
SELECT 
    email, 
    first_name, 
    last_name, 
    full_name,
    role,
    status,
    created_at
FROM users
WHERE status = 'pending_approval'
ORDER BY created_at DESC;

-- To manually approve a pending user (if needed):
UPDATE users 
SET status = 'active'
WHERE email = 'test@example.com';  -- Replace with the email

-- To manually reset a user back to pending (for testing):
UPDATE users 
SET status = 'pending_approval'
WHERE email = 'test@example.com';  -- Replace with the email
