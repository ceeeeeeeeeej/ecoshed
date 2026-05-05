-- ============================================================
-- SEED: 204 Resident Users — Phone-only auth (no email at all)
-- Login identifier: phone number only (e.g. +639171088201)
-- Password: GuestUser123!
-- Last sign-in: randomized between yesterday and today
-- Puroks: 34 per purok x 6 = 204 total
-- Run this in Supabase SQL Editor
-- ============================================================

DO $$
DECLARE
  new_uid      UUID;
  i            INT;
  purok_name   TEXT;
  phone_num    TEXT;
  last_sign_in TIMESTAMPTZ;
  prefixes     TEXT[] := ARRAY[
    '917','918','919','920','921','922',
    '926','927','928','929','930','935',
    '939','947','948','949','950','961',
    '966','977','995','998','999'
  ];
BEGIN
  FOR i IN 1..204 LOOP

    new_uid := gen_random_uuid();

    -- Determine purok
    purok_name := CASE
      WHEN i <=  34 THEN 'Bayabas'
      WHEN i <=  68 THEN 'Sandiya'
      WHEN i <= 102 THEN 'Pinya'
      WHEN i <= 136 THEN 'Mambago'
      WHEN i <= 170 THEN 'Acacia'
      ELSE               'Ipil-ipil'
    END;

    -- Generate unique PH phone number: +639XXXXXXXXX
    phone_num := '+63'
      || prefixes[((i - 1) % 23) + 1]
      || LPAD(((i * 1234567 + 7654321) % 9000000 + 1000000)::TEXT, 7, '0');

    -- Random last_sign_in between yesterday 00:00 and right now
    last_sign_in := (NOW() - INTERVAL '1 day') + (random() * INTERVAL '1 day');

    -- Wrap both inserts — skip silently if phone already exists
    BEGIN

      -- 1. Insert into auth.users using PHONE ONLY — no email field
      INSERT INTO auth.users (
        instance_id,
        id,
        aud,
        role,
        phone,
        encrypted_password,
        phone_confirmed_at,
        last_sign_in_at,       -- randomized between yesterday and today
        raw_app_meta_data,
        raw_user_meta_data,
        created_at,
        updated_at,
        confirmation_token,
        email_change,
        email_change_token_new,
        recovery_token
      ) VALUES (
        '00000000-0000-0000-0000-000000000000',
        new_uid,
        'authenticated',
        'authenticated',
        phone_num,
        crypt('GuestUser123!', gen_salt('bf')),
        NOW(),
        last_sign_in,          -- e.g. yesterday 14:32 or today 09:17
        '{"provider":"phone","providers":["phone"]}',
        jsonb_build_object(
          'role',       'resident',
          'first_name', 'Resident',
          'last_name',  'User',
          'phone',      phone_num
        ),
        NOW(),
        NOW(),
        '', '', '', ''
      );

      -- 2. Upsert into public.users — phone only, no email
      INSERT INTO public.users (
        id, first_name, last_name, full_name,
        phone, role, location, purok, status, created_at, updated_at
      ) VALUES (
        new_uid,
        'Resident',
        'User',
        'Resident User',
        phone_num,
        'resident',
        purok_name,
        purok_name,
        'active',
        NOW(),
        NOW()
      )
      ON CONFLICT (id) DO UPDATE SET
        first_name = 'Resident',
        last_name  = 'User',
        full_name  = 'Resident User',
        phone      = EXCLUDED.phone,
        location   = EXCLUDED.location,
        purok      = EXCLUDED.purok,
        status     = 'active',
        updated_at = NOW();

    EXCEPTION WHEN unique_violation THEN
      -- Phone already exists — skip silently
      NULL;
    END;

  END LOOP;

  RAISE NOTICE 'Done! 204 resident user accounts created with phone-only auth.';
END;
$$;

-- ============================================================
-- Verify results
-- ============================================================
SELECT
    purok,
    COUNT(*) AS residents
FROM public.users
WHERE role = 'resident'
  AND purok IN ('Bayabas','Sandiya','Pinya','Mambago','Acacia','Ipil-ipil')
  AND first_name = 'Resident'
GROUP BY purok
ORDER BY purok;
