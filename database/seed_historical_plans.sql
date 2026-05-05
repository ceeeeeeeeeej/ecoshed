-- EcoSched Historical Waste Diversion Targets
-- Data Source: Table 8.2 Diversion and disposal targets for each year, 10-year planning period, 2018-2027

-- 1. Create a helper function outside the DO block
CREATE OR REPLACE FUNCTION public.tmp_build_waste_data(
    total_bio NUMERIC, 
    total_recyc NUMERIC, 
    total_resid NUMERIC,
    res_pct NUMERIC,
    com_pct NUMERIC,
    ins_pct NUMERIC,
    ind_pct NUMERIC
) RETURNS JSONB AS $$
BEGIN
    RETURN jsonb_build_object(
        'residential', jsonb_build_object('biodegradable', ROUND(total_bio * res_pct, 2), 'recyclable', ROUND(total_recyc * res_pct, 2), 'residual', ROUND(total_resid * res_pct, 2), 'special', 0),
        'commercial', jsonb_build_object('biodegradable', ROUND(total_bio * com_pct, 2), 'recyclable', ROUND(total_recyc * com_pct, 2), 'residual', ROUND(total_resid * com_pct, 2), 'special', 0),
        'industrial', jsonb_build_object('biodegradable', ROUND(total_bio * ind_pct, 2), 'recyclable', ROUND(total_recyc * ind_pct, 2), 'residual', ROUND(total_resid * ind_pct, 2), 'special', 0),
        'institutional', jsonb_build_object('biodegradable', ROUND(total_bio * ins_pct, 2), 'recyclable', ROUND(total_recyc * ins_pct, 2), 'residual', ROUND(total_resid * ins_pct, 2), 'special', 0)
    );
END;
$$ LANGUAGE plpgsql;

DO $$
DECLARE
    -- Ratios for sector distribution (Planning Assumption)
    res_p NUMERIC := 0.60;
    com_p NUMERIC := 0.20;
    ins_p NUMERIC := 0.10;
    ind_p NUMERIC := 0.10;
BEGIN
    -- 2015 Plan
    INSERT INTO public.waste_management_plans (plan_name, generated_at, waste_data, sector_totals, type_totals, grand_total_kg)
    VALUES (
        '2015 Diversion Target (Table 8.2)', 
        '2015-01-01T00:00:00Z',
        public.tmp_build_waste_data(5011.39, 417.62, 5011.39, res_p, com_p, ins_p, ind_p),
        jsonb_build_object('residential', 6264.24, 'commercial', 2088.08, 'industrial', 1044.04, 'institutional', 1044.04),
        jsonb_build_object('biodegradable', 5011.39, 'recyclable', 417.62, 'residual', 5011.39, 'special', 0),
        10440.39
    );

    -- 2016 Plan
    INSERT INTO public.waste_management_plans (plan_name, generated_at, waste_data, sector_totals, type_totals, grand_total_kg)
    VALUES (
        '2016 Diversion Target (Table 8.2)', 
        '2016-01-01T00:00:00Z',
        public.tmp_build_waste_data(5104.61, 425.38, 5104.61, res_p, com_p, ins_p, ind_p),
        jsonb_build_object('residential', 6380.77, 'commercial', 2126.92, 'industrial', 1063.46, 'institutional', 1063.46),
        jsonb_build_object('biodegradable', 5104.61, 'recyclable', 425.38, 'residual', 5104.61, 'special', 0),
        10634.61
    );

    -- 2017 Plan
    INSERT INTO public.waste_management_plans (plan_name, generated_at, waste_data, sector_totals, type_totals, grand_total_kg)
    VALUES (
        '2017 Diversion Target (Table 8.2)', 
        '2017-01-01T00:00:00Z',
        public.tmp_build_waste_data(5197.84, 433.15, 5197.84, res_p, com_p, ins_p, ind_p),
        jsonb_build_object('residential', 6497.30, 'commercial', 2165.77, 'industrial', 1082.88, 'institutional', 1082.88),
        jsonb_build_object('biodegradable', 5197.84, 'recyclable', 433.15, 'residual', 5197.84, 'special', 0),
        10828.83
    );

    -- 2018 Plan
    INSERT INTO public.waste_management_plans (plan_name, generated_at, waste_data, sector_totals, type_totals, grand_total_kg)
    VALUES (
        '2018 Diversion Target (Table 8.2)', 
        '2018-01-01T00:00:00Z',
        public.tmp_build_waste_data(5291.06, 881.84, 4850.15, res_p, com_p, ins_p, ind_p),
        jsonb_build_object('residential', 6613.83, 'commercial', 2204.61, 'industrial', 1102.31, 'institutional', 1102.31),
        jsonb_build_object('biodegradable', 5291.06, 'recyclable', 881.84, 'residual', 4850.15, 'special', 0),
        11023.05
    );

    -- 2019 Plan
    INSERT INTO public.waste_management_plans (plan_name, generated_at, waste_data, sector_totals, type_totals, grand_total_kg)
    VALUES (
        '2019 Diversion Target (Table 8.2)', 
        '2019-01-01T00:00:00Z',
        public.tmp_build_waste_data(5384.29, 897.38, 4935.60, res_p, com_p, ins_p, ind_p),
        jsonb_build_object('residential', 6730.36, 'commercial', 2243.45, 'industrial', 1121.73, 'institutional', 1121.73),
        jsonb_build_object('biodegradable', 5384.29, 'recyclable', 897.38, 'residual', 4935.60, 'special', 0),
        11217.27
    );

    -- 2020 Plan
    INSERT INTO public.waste_management_plans (plan_name, generated_at, waste_data, sector_totals, type_totals, grand_total_kg)
    VALUES (
        '2020 Diversion Target (Table 8.2)', 
        '2020-01-01T00:00:00Z',
        public.tmp_build_waste_data(5477.52, 1141.15, 4792.83, res_p, com_p, ins_p, ind_p),
        jsonb_build_object('residential', 6846.89, 'commercial', 2282.30, 'industrial', 1141.15, 'institutional', 1141.15),
        jsonb_build_object('biodegradable', 5477.52, 'recyclable', 1141.15, 'residual', 4792.83, 'special', 0),
        11411.50
    );

    -- 2021 Plan
    INSERT INTO public.waste_management_plans (plan_name, generated_at, waste_data, sector_totals, type_totals, grand_total_kg)
    VALUES (
        '2021 Diversion Target (Table 8.2)', 
        '2021-01-01T00:00:00Z',
        public.tmp_build_waste_data(5570.60, 1392.65, 4642.16, res_p, com_p, ins_p, ind_p),
        jsonb_build_object('residential', 6963.25, 'commercial', 2321.08, 'industrial', 1160.54, 'institutional', 1160.54),
        jsonb_build_object('biodegradable', 5570.60, 'recyclable', 1392.65, 'residual', 4642.16, 'special', 0),
        11605.41
    );

    -- 2022 Plan
    INSERT INTO public.waste_management_plans (plan_name, generated_at, waste_data, sector_totals, type_totals, grand_total_kg)
    VALUES (
        '2022 Diversion Target (Table 8.2)', 
        '2022-01-01T00:00:00Z',
        public.tmp_build_waste_data(5663.82, 2359.93, 3775.88, res_p, com_p, ins_p, ind_p),
        jsonb_build_object('residential', 7079.78, 'commercial', 2359.93, 'industrial', 1179.96, 'institutional', 1179.96),
        jsonb_build_object('biodegradable', 5663.82, 'recyclable', 2359.93, 'residual', 3775.88, 'special', 0),
        11799.63
    );

    -- 2023 Plan
    INSERT INTO public.waste_management_plans (plan_name, generated_at, waste_data, sector_totals, type_totals, grand_total_kg)
    VALUES (
        '2023 Diversion Target (Table 8.2)', 
        '2023-01-01T00:00:00Z',
        public.tmp_build_waste_data(5757.05, 3358.28, 2878.52, res_p, com_p, ins_p, ind_p),
        jsonb_build_object('residential', 7196.31, 'commercial', 2398.77, 'industrial', 1199.39, 'institutional', 1199.39),
        jsonb_build_object('biodegradable', 5757.05, 'recyclable', 3358.28, 'residual', 2878.52, 'special', 0),
        11993.85
    );

    -- 2024 Plan
    INSERT INTO public.waste_management_plans (plan_name, generated_at, waste_data, sector_totals, type_totals, grand_total_kg)
    VALUES (
        '2024 Diversion Target (Table 8.2)', 
        '2024-01-01T00:00:00Z',
        public.tmp_build_waste_data(5850.27, 4387.71, 1950.09, res_p, com_p, ins_p, ind_p),
        jsonb_build_object('residential', 7312.84, 'commercial', 2437.61, 'industrial', 1218.81, 'institutional', 1218.81),
        jsonb_build_object('biodegradable', 5850.27, 'recyclable', 4387.71, 'residual', 1950.09, 'special', 0),
        12188.07
    );

END $$;

-- 3. Cleanup the helper function
DROP FUNCTION public.tmp_build_waste_data(NUMERIC, NUMERIC, NUMERIC, NUMERIC, NUMERIC, NUMERIC, NUMERIC);

-- Drop the temporary function if you actually created it (not possible in DO block for standard functions, 
-- but I used a PL/pgSQL variable-like approach above).
