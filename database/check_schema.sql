-- Check columns in registered_collectors
SELECT column_name,
    data_type
FROM information_schema.columns
WHERE table_name = 'registered_collectors';
-- Also check if pgcrypto is enabled
SELECT *
FROM pg_extension
WHERE extname = 'pgcrypto';