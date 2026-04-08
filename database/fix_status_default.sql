-- FIX: Change database default from 'active' to 'pending_approval'
-- This ensures new accounts require approval by default

-- Change the default value for the status column
ALTER TABLE users 
ALTER COLUMN status SET DEFAULT 'pending_approval';

-- Verify the change
SELECT 
    column_name,
    column_default,
    is_nullable,
    data_type
FROM information_schema.columns
WHERE table_name = 'users' 
AND column_name = 'status';

-- This should now show: column_default: 'pending_approval'::text
