-- SQL Script to setup Collector Trucks table
-- This script aligns the registered_collectors table with the Admin Dashboard requirements

-- 1. Create registered_collectors table if it doesn't exist, or modify it
CREATE TABLE IF NOT EXISTS public.registered_collectors (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES public.users(id) ON DELETE SET NULL, -- Link to the user account
    collector_id TEXT NOT NULL UNIQUE, -- User-assigned ID (e.g., COL-001)
    driver_name TEXT NOT NULL, -- Cached driver name for display
    vehicle_id TEXT NOT NULL, -- Vehicle ID/Tag
    vehicle_type TEXT NOT NULL, -- e.g., 'truck', 'van', 'compactor'
    license_plate TEXT NOT NULL,
    phone TEXT,
    status TEXT DEFAULT 'available', -- 'available', 'on-route', 'maintenance', 'active'
    current_route TEXT,
    progress INTEGER DEFAULT 0,
    eta TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 2. Enable RLS
ALTER TABLE public.registered_collectors ENABLE ROW LEVEL SECURITY;

-- 3. Create RLS Policies
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE tablename = 'registered_collectors' AND policyname = 'Allow authenticated users to read collectors'
    ) THEN
        CREATE POLICY "Allow authenticated users to read collectors"
            ON public.registered_collectors FOR SELECT
            TO authenticated
            USING (true);
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE tablename = 'registered_collectors' AND policyname = 'Allow admins to manage collectors'
    ) THEN
        CREATE POLICY "Allow admins to manage collectors"
            ON public.registered_collectors FOR ALL
            TO authenticated
            USING (
                EXISTS (
                    SELECT 1 FROM public.users
                    WHERE users.id = auth.uid() 
                    AND (users.role = 'admin' OR users.role = 'superadmin' OR users.role = 'supervisor')
                )
            );
    END IF;
END $$;

-- 4. Create updated_at trigger
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ language 'plpgsql';

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_trigger WHERE tgname = 'update_registered_collectors_updated_at'
    ) THEN
        CREATE TRIGGER update_registered_collectors_updated_at
            BEFORE UPDATE ON public.registered_collectors
            FOR EACH ROW
            EXECUTE FUNCTION update_updated_at_column();
    END IF;
END $$;

-- 5. Add comment for clarity
COMMENT ON TABLE public.registered_collectors IS 'Stores information about waste collection vehicles and their assigned drivers.';
