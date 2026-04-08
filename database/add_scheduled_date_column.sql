-- Comprehensive migration for collection_schedules table
ALTER TABLE collection_schedules 
ADD COLUMN IF NOT EXISTS scheduled_date TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS is_rescheduled BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS original_date TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS rescheduled_reason TEXT,
ADD COLUMN IF NOT EXISTS name TEXT;

-- Populate name from description for existing rows if name is missing
UPDATE collection_schedules SET name = description WHERE name IS NULL AND description IS NOT NULL;
UPDATE collection_schedules SET name = 'Waste Collection' WHERE name IS NULL;

-- Backfill legacy data using created_at for scheduled_date
UPDATE collection_schedules SET scheduled_date = created_at WHERE scheduled_date IS NULL;
