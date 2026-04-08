-- SQL Script to Fix Null Names and Add Location Column
-- Run this in your Supabase SQL Editor

-- 1. Add location column if it doesn't exist
ALTER TABLE users 
ADD COLUMN IF NOT EXISTS location TEXT;

-- 2. Update existing users with null location to have a default value
UPDATE users 
SET location = 'Victoria' 
WHERE location IS NULL;

-- 3. Fix null or empty names by extracting from email
-- This updates first_name and last_name based on email address
UPDATE users 
SET 
    first_name = COALESCE(NULLIF(first_name, ''), split_part(split_part(email, '@', 1), '.', 1)),
    last_name = COALESCE(NULLIF(last_name, ''), split_part(split_part(email, '@', 1), '.', 2))
WHERE first_name IS NULL 
   OR last_name IS NULL 
   OR first_name = '' 
   OR last_name = '';

-- 4. Update full_name based on first_name and last_name
UPDATE users
SET full_name = TRIM(CONCAT(first_name, ' ', last_name))
WHERE full_name IS NULL 
   OR full_name = ''
   OR full_name != TRIM(CONCAT(first_name, ' ', last_name));

-- 5. For any users still with empty names, set to "Unknown User"
UPDATE users
SET 
    first_name = COALESCE(NULLIF(first_name, ''), 'Unknown'),
    last_name = COALESCE(NULLIF(last_name, ''), 'User'),
    full_name = COALESCE(NULLIF(full_name, ''), 'Unknown User')
WHERE first_name IS NULL 
   OR last_name IS NULL 
   OR first_name = '' 
   OR last_name = '';

-- 6. Verify the changes
SELECT 
    email, 
    first_name, 
    last_name, 
    full_name,
    location,
    role,
    status
FROM users
ORDER BY created_at DESC;
