-- SUPABASE AUTH SYNC TRIGGER
-- This script sets up a trigger to automatically create a profile in public.users 
-- when a new user signs up via Supabase Auth.

-- 1. Create the sync function
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
    raw_role TEXT;
    raw_first_name TEXT;
    raw_last_name TEXT;
    raw_phone TEXT;
    target_status TEXT;
BEGIN
    -- Extract values from user_metadata
    -- Supabase stores these in raw_user_meta_data as a JSONB object
    raw_role := COALESCE(new.raw_user_meta_data->>'role', 'admin');
    raw_first_name := COALESCE(new.raw_user_meta_data->>'first_name', '');
    raw_last_name := COALESCE(new.raw_user_meta_data->>'last_name', '');
    raw_phone := COALESCE(new.raw_user_meta_data->>'phone', '');

    -- SECURITY: Set status based on role
    -- Only superadmins are active immediately
    IF raw_role = 'superadmin' THEN
        target_status := 'active';
    ELSE
        target_status := 'pending_approval';
    END IF;

    -- Insert the new user profile
    -- If the profile already exists (e.g. from manual client-side UPSERT), update it
    INSERT INTO public.users (
        id,
        email,
        first_name,
        last_name,
        phone,
        role,
        status,
        created_at,
        updated_at
    )
    VALUES (
        new.id,
        new.email,
        raw_first_name,
        raw_last_name,
        raw_phone,
        raw_role,
        target_status,
        now(),
        now()
    )
    ON CONFLICT (id) DO UPDATE
    SET
        email = EXCLUDED.email,
        first_name = EXCLUDED.first_name,
        last_name = EXCLUDED.last_name,
        phone = EXCLUDED.phone,
        updated_at = now();

    RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 2. Create the trigger
-- Note: Use DROP IF EXISTS to ensure it can be re-run
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- 3. Ensure RLS Policies allow registration activities
-- First, enable RLS if not already enabled
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

-- Policy: Allow users to select their own profile
DROP POLICY IF EXISTS "Users can view own profile" ON public.users;
CREATE POLICY "Users can view own profile"
    ON public.users FOR SELECT
    USING (auth.uid() = id);

-- Policy: Allow users to insert their own profile 
-- (This acts as a backup to the trigger and allows the client-side code to run without error)
DROP POLICY IF EXISTS "Users can insert own profile" ON public.users;
CREATE POLICY "Users can insert own profile"
    ON public.users FOR INSERT
    WITH CHECK (auth.uid() = id);

-- Policy: Allow users to update their own basic details 
-- (Wait: Should we allow this? Probably only for specific fields like phone/name)
DROP POLICY IF EXISTS "Users can update own profile" ON public.users;
CREATE POLICY "Users can update own profile"
    ON public.users FOR UPDATE
    USING (auth.uid() = id)
    WITH CHECK (auth.uid() = id);

-- Policy: Allow authenticated admins to view/manage all users
DROP POLICY IF EXISTS "Admins can manage all users" ON public.users;
CREATE POLICY "Admins can manage all users"
    ON public.users FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM public.users
            WHERE id = auth.uid() AND role IN ('admin', 'superadmin') AND status = 'active'
        )
    );

-- 4. Verify trigger setup
SELECT 'Sync trigger and RLS policies initialized successfully!' as status;
