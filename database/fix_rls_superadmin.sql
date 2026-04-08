-- Fix RLS policies to include superadmin role

-- Special Collections
DROP POLICY IF EXISTS "Admin manage special_collections" ON special_collections;
DROP POLICY IF EXISTS "Admin/Superadmin manage special_collections" ON special_collections;
CREATE POLICY "Admin/Superadmin manage special_collections" ON special_collections FOR ALL USING (
    EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role IN ('admin', 'superadmin'))
);

-- Area Schedules
DROP POLICY IF EXISTS "Admin manage area_schedules" ON area_schedules;
DROP POLICY IF EXISTS "Admin/Superadmin manage area_schedules" ON area_schedules;
CREATE POLICY "Admin/Superadmin manage area_schedules" ON area_schedules FOR ALL USING (
    EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role IN ('admin', 'superadmin'))
);

-- Users
DROP POLICY IF EXISTS "Admin view all users" ON users;
DROP POLICY IF EXISTS "Admin/Superadmin view all users" ON users;
CREATE POLICY "Admin/Superadmin view all users" ON users FOR SELECT USING (
    EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role IN ('admin', 'superadmin'))
);

-- Collection Schedules
DROP POLICY IF EXISTS "Admin/Collector manage collection_schedules" ON collection_schedules;
DROP POLICY IF EXISTS "Admin/Superadmin/Collector manage collection_schedules" ON collection_schedules;
CREATE POLICY "Admin/Superadmin/Collector manage collection_schedules" ON collection_schedules FOR ALL USING (
    EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role IN ('admin', 'superadmin', 'collector'))
);
