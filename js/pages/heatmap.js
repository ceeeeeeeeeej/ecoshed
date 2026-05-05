/**
 * WasteHeatmap — Dynamic Waste Analytics Heatmap
 * ================================================
 * Renders a sector × waste-type heatmap where ALL colors are
 * assigned purely by relative position between the min and max
 * values in the dataset. No values are ever hardcoded.
 *
 * Public API:
 *   WasteHeatmap.render(data, containerId?)   — first render
 *   WasteHeatmap.update(data)                 — live update / re-render
 *   WasteHeatmap.setView(mode)                — 'volume' | 'percentage'
 *   WasteHeatmap.loadFromCollections(records) — derive data from Supabase records
 */

const WasteHeatmap = (() => {

    // ── Configuration ──────────────────────────────────────────────
    const SECTORS = [
        { key: 'residential',   label: 'Residential',   icon: '🏠' },
        { key: 'commercial',    label: 'Commercial',     icon: '🏪' },
        { key: 'industrial',    label: 'Industrial',     icon: '🏭' },
        { key: 'institutional', label: 'Institutional',  icon: '🏫' }
    ];

    const WASTE_TYPES = [
        { key: 'biodegradable', label: 'Biodegradable', unit: 'kg' },
        { key: 'recyclable',    label: 'Recyclable',    unit: 'kg' },
        { key: 'residual',      label: 'Residual',      unit: 'kg' },
        { key: 'special',       label: 'Special',       unit: 'kg' }
    ];

    /**
     * Keyword maps: these only classify existing records from Supabase
     * into category buckets — they do NOT produce any values.
     */
    const WASTE_KEYWORDS = {
        biodegradable:  ['bio', 'organic', 'food', 'garden', 'plant'],
        recyclable:     ['recycl', 'plastic', 'metal', 'paper', 'glass', 'tin', 'card'],
        special:        ['special', 'hazard', 'chemical', 'electronic', 'e-waste', 'toxic'],
        residual:       [] // fallback
    };

    const SECTOR_KEYWORDS = {
        commercial:    ['commerc', 'market', 'mall', 'shop', 'store', 'business'],
        industrial:    ['industr', 'factory', 'manufact', 'warehouse', 'plant'],
        institutional: ['school', 'hospit', 'clinic', 'offic', 'gov', 'univers', 'church']
        // residential is the default fallback
    };

    // ── State ───────────────────────────────────────────────────────
    let _currentData = null;   // { sector: { wasteType: number } }
    let _viewMode    = 'volume'; // 'volume' | 'percentage'
    let _containerId = 'heatmapRoot';

    // ── Color Engine ────────────────────────────────────────────────
    /**
     * Maps a normalised value t ∈ [0, 1] to an HSL color on the
     * green → yellow → orange → red gradient.
     *
     * t=0  →  green  (#22c55e  hue≈142)
     * t=0.5 → yellow (#eab308  hue≈48)
     * t=1   →  red   (#ef4444  hue≈0)
     */
    function interpolateColor(t) {
        // Clamp
        t = Math.max(0, Math.min(1, t));
        // HSL hue: 140 (green) → 48 (yellow) → 0 (red)
        const hue = Math.round(140 - t * 140);
        const sat = Math.round(70 + t * 20);   // 70%→90%
        const lgt = Math.round(42 - t * 10);   // 42%→32%
        return `hsl(${hue},${sat}%,${lgt}%)`;
    }

    /** Lighter version for gradient stop */
    function interpolateColorLight(t) {
        t = Math.max(0, Math.min(1, t));
        const hue = Math.round(140 - t * 140);
        const sat = Math.round(60 + t * 20);
        const lgt = Math.round(55 - t * 10);
        return `hsl(${hue},${sat}%,${lgt}%)`;
    }

    /** Gets a human-readable intensity label for a t value */
    function intensityLabel(t) {
        if (t >= 0.75) return 'HIGH';
        if (t >= 0.50) return 'MOD-HIGH';
        if (t >= 0.25) return 'MEDIUM';
        return 'LOW';
    }

    // ── Data Utilities ──────────────────────────────────────────────
    /**
     * Flattens a data matrix into all cell values, returning { min, max }.
     * Returns { min:0, max:0 } when the matrix is empty.
     */
    function computeRange(data) {
        const values = [];
        for (const s of SECTORS) {
            for (const w of WASTE_TYPES) {
                const v = data?.[s.key]?.[w.key];
                if (typeof v === 'number' && isFinite(v)) values.push(v);
            }
        }
        if (values.length === 0) return { min: 0, max: 0 };
        return { min: Math.min(...values), max: Math.max(...values) };
    }

    /** Normalises a value v into [0,1] given { min, max }. */
    function normalise(v, range) {
        if (range.max === range.min) return 0;
        return (v - range.min) / (range.max - range.min);
    }

    /** Total waste across all cells. */
    function totalWaste(data) {
        let total = 0;
        for (const s of SECTORS) for (const w of WASTE_TYPES) total += data?.[s.key]?.[w.key] || 0;
        return total;
    }

    // ── Grid Renderer ───────────────────────────────────────────────
    function buildGrid(data) {
        const range = computeRange(data);
        const grand = totalWaste(data);

        const grid = document.createElement('div');
        grid.className = 'hm-grid';
        grid.style.gridTemplateColumns = `160px repeat(${WASTE_TYPES.length}, 1fr)`;

        // ── Corner ──
        const corner = document.createElement('div');
        corner.className = 'hm-th hm-corner';
        corner.innerHTML = `<i class="fas fa-layer-group"></i><span>Sector / Type</span>`;
        grid.appendChild(corner);

        // ── Column Headers ──
        for (const wt of WASTE_TYPES) {
            const th = document.createElement('div');
            th.className = 'hm-th hm-col-head';
            th.innerHTML = `<i class="fas ${wasteIcon(wt.key)}"></i><span>${wt.label}</span>`;
            grid.appendChild(th);
        }

        // ── Data Rows ──
        for (let si = 0; si < SECTORS.length; si++) {
            const sector = SECTORS[si];

            // Row header
            const rh = document.createElement('div');
            rh.className = 'hm-th hm-row-head';
            rh.innerHTML = `<span class="hm-sec-icon">${sector.icon}</span><span>${sector.label}</span>`;
            grid.appendChild(rh);

            let rowTotal = 0;
            for (let wi = 0; wi < WASTE_TYPES.length; wi++) {
                const wt = WASTE_TYPES[wi];
                const raw = data?.[sector.key]?.[wt.key] || 0;
                rowTotal += raw;
                const t   = normalise(raw, range);
                const pct = grand > 0 ? ((raw / grand) * 100).toFixed(1) : '0.0';

                const bg0 = interpolateColor(t);
                const bg1 = interpolateColorLight(t);

                const displayVal = _viewMode === 'percentage'
                    ? `${pct}%`
                    : raw > 0 ? raw.toLocaleString() : '—';
                const subVal = _viewMode === 'percentage'
                    ? `${raw > 0 ? raw.toLocaleString() : '—'} kg`
                    : `${pct}% of total`;

                const cell = document.createElement('div');
                cell.className = 'hm-cell';
                cell.style.background = `linear-gradient(135deg, ${bg0}, ${bg1})`;
                cell.title = `${sector.label} · ${wt.label}: ${raw.toLocaleString()} kg (${pct}%)`;
                cell.dataset.value = raw;
                cell.dataset.t = t.toFixed(3);

                cell.innerHTML = `
                    <div class="hm-val">${displayVal}</div>
                    <div class="hm-unit">${_viewMode === 'percentage' ? 'of total' : 'kg'}</div>
                    <div class="hm-sub">${subVal}</div>
                    <span class="hm-badge">${intensityLabel(t)}</span>
                `;

                // Staggered fade-in
                const delay = (si * WASTE_TYPES.length + wi) * 45;
                cell.style.opacity = '0';
                cell.style.transform = 'scale(0.88)';
                setTimeout(() => {
                    cell.style.opacity = '1';
                    cell.style.transform = 'scale(1)';
                }, delay + 80);

            grid.appendChild(cell);
        }
    }

    // ── TOTALS FOOTER ROW (below Institutional) ──────────────────
    // Row label
    const ftCorner = document.createElement('div');
        ftCorner.className = 'hm-th hm-row-head hm-footer-row-head';
        const grandDisp = _viewMode === 'percentage' ? '100%' : grand.toLocaleString();
        ftCorner.innerHTML = `
            <div style="display:flex; flex-direction:column; align-items:flex-start;">
                <span style="font-size:0.7rem; opacity:0.8; font-weight:400; text-transform:none;">Grand Total: ${grandDisp} ${_viewMode === 'percentage' ? '' : 'kg'}</span>
                <div style="display:flex; align-items:center;">
                    <i class="fas fa-equals" style="margin-right:6px; font-size:0.85em; color:#10b981;"></i>
                    <span>TOTAL (KG)</span>
                </div>
            </div>`;
        grid.appendChild(ftCorner);

        // One column-total cell per waste type
        for (const wt of WASTE_TYPES) {
            const colTotal = SECTORS.reduce((sum, s) => sum + (data?.[s.key]?.[wt.key] || 0), 0);
            const colPct   = grand > 0 ? ((colTotal / grand) * 100).toFixed(1) : '0.0';
            const colDisp  = _viewMode === 'percentage'
                ? `${colPct}%`
                : colTotal > 0 ? colTotal.toLocaleString() : '—';
            const colSub   = _viewMode === 'percentage'
                ? colTotal.toLocaleString() + ' kg'
                : colPct + '% of total';

            const ftCell = document.createElement('div');
            ftCell.className = 'hm-cell hm-footer-cell';
            ftCell.title = `${wt.label} total: ${colTotal.toLocaleString()} kg (${colPct}%)`;
            ftCell.innerHTML = `
                <div class="hm-val" style="font-size:1.05em;">${colDisp}</div>
                <div class="hm-unit">${_viewMode === 'percentage' ? 'of total' : 'kg'}</div>
                <div class="hm-sub">${colSub}</div>
            `;
            grid.appendChild(ftCell);
        }

        return { grid, range, grand };
    }

    function wasteIcon(key) {
        const icons = {
            biodegradable: 'fa-leaf',
            recyclable:    'fa-recycle',
            residual:      'fa-trash',
            special:       'fa-radiation'
        };
        return icons[key] || 'fa-box';
    }

    // ── Legend ──────────────────────────────────────────────────────
    function buildLegend(range) {
        const leg = document.createElement('div');
        leg.className = 'hm-legend';

        // Gradient bar (CSS gradient)
        leg.innerHTML = `
            <span class="hm-leg-label">Low</span>
            <div class="hm-leg-bar">
                <div class="hm-leg-fill"></div>
            </div>
            <span class="hm-leg-label">High</span>
            <div class="hm-leg-badges">
                <span class="hm-badge-pill hm-t0">Low</span>
                <span class="hm-badge-pill hm-t1">Medium</span>
                <span class="hm-badge-pill hm-t2">Mod-High</span>
                <span class="hm-badge-pill hm-t3">High</span>
            </div>
            <div class="hm-range-note">
                Range: <strong>${range.min.toLocaleString()}</strong> – <strong>${range.max.toLocaleString()}</strong> kg
            </div>
        `;
        return leg;
    }

    // ── Summary Cards ───────────────────────────────────────────────
    function buildSummary(data, grand) {
        // Highest/lowest sector by total
        let maxSector = { label: '', val: -Infinity };
        let minSector = { label: '', val: Infinity };
        for (const s of SECTORS) {
            const st = WASTE_TYPES.reduce((sum, w) => sum + (data?.[s.key]?.[w.key] || 0), 0);
            if (st > maxSector.val) maxSector = { label: s.label, val: st };
            if (st < minSector.val) minSector = { label: s.label, val: st };
        }
        // Dominant waste type
        let maxWt = { label: '', val: -Infinity };
        for (const w of WASTE_TYPES) {
            const tot = SECTORS.reduce((sum, s) => sum + (data?.[s.key]?.[w.key] || 0), 0);
            if (tot > maxWt.val) maxWt = { label: w.label, val: tot };
        }

        const row = document.createElement('div');
        row.className = 'hm-summary';
        row.innerHTML = `
            <div class="hm-stat">
                <i class="fas fa-arrow-up" style="color:#ef4444"></i>
                <div><div class="hm-sv">${maxSector.label}</div><div class="hm-sl">Highest Generator</div></div>
            </div>
            <div class="hm-stat">
                <i class="fas fa-arrow-down" style="color:#22c55e"></i>
                <div><div class="hm-sv">${minSector.label}</div><div class="hm-sl">Lowest Generator</div></div>
            </div>
            <div class="hm-stat">
                <i class="fas fa-trophy" style="color:#f97316"></i>
                <div><div class="hm-sv">${maxWt.label}</div><div class="hm-sl">Dominant Waste Type</div></div>
            </div>
            <div class="hm-stat">
                <i class="fas fa-weight-hanging" style="color:#3b82f6"></i>
                <div><div class="hm-sv">${grand.toLocaleString()} kg</div><div class="hm-sl">Total Waste Volume</div></div>
            </div>
        `;
        return row;
    }

    // ── Full Render ─────────────────────────────────────────────────
    function render(data, containerId) {
        if (containerId) _containerId = containerId;
        _currentData = deepClone(data);

        const root = document.getElementById(_containerId);
        if (!root) { console.warn('[WasteHeatmap] container not found:', _containerId); return; }

        root.innerHTML = '';

        if (!hasAnyData(data)) {
            root.innerHTML = `
                <div class="hm-empty">
                    <i class="fas fa-inbox"></i>
                    <p>No waste data available. Enter values in the form above and click <strong>Apply</strong>.</p>
                </div>`;
            return;
        }

        const { grid, range, grand } = buildGrid(data);
        const legend  = buildLegend(range);
        const summary = buildSummary(data, grand);

        const wrapper = document.createElement('div');
        wrapper.className = 'hm-wrapper';
        wrapper.appendChild(legend);

        const gridWrap = document.createElement('div');
        gridWrap.className = 'hm-scroll';
        gridWrap.appendChild(grid);
        wrapper.appendChild(gridWrap);
        wrapper.appendChild(summary);

        root.appendChild(wrapper);
    }

    // ── Input form ──────────────────────────────────────────────────
    /**
     * Renders the data-entry form into `formContainerId`.
     * Totals appear as a footer row below Institutional.
     */
    function renderForm(formContainerId) {
        const fc = document.getElementById(formContainerId);
        if (!fc) return;

        fc.innerHTML = '';

        const form = document.createElement('form');
        form.className = 'hm-form';
        form.id = 'heatmapDataForm';
        form.setAttribute('autocomplete', 'off');

        // Header row — no right-side Total column; totals live in the footer row
        const headerRow = document.createElement('div');
        headerRow.className = 'hm-form-row hm-form-header';
        headerRow.style.gridTemplateColumns = `170px repeat(${WASTE_TYPES.length}, 1fr)`;
        headerRow.innerHTML = `<div class="hm-form-cell hm-form-rowlabel"></div>` +
            WASTE_TYPES.map(w => `
                <div class="hm-form-cell">
                    <i class="fas ${wasteIcon(w.key)}"></i>
                    ${w.label.toUpperCase()} <em>(KG)</em>
                </div>`).join('');
        form.appendChild(headerRow);

        // One row per sector (no right-side total cell)
        for (const sector of SECTORS) {
            const row = document.createElement('div');
            row.className = 'hm-form-row';
            row.style.gridTemplateColumns = `170px repeat(${WASTE_TYPES.length}, 1fr)`;
            row.innerHTML = `
                <div class="hm-form-cell hm-form-rowlabel">
                    <span style="font-size: 1.1rem; margin-right: 0.6rem;">${sector.icon}</span>
                    <span>${sector.label}</span>
                </div>`;

            for (const wt of WASTE_TYPES) {
                const cell = document.createElement('div');
                cell.className = 'hm-form-cell';
                const input = document.createElement('input');
                input.type = 'number';
                input.min  = '0';
                input.step = '0.1';
                input.placeholder = '0';
                input.className = 'hm-input';
                input.id  = `hm_${sector.key}_${wt.key}`;
                input.name = `${sector.key}__${wt.key}`;

                // Pre-fill if data exists
                const existing = _currentData?.[sector.key]?.[wt.key];
                if (typeof existing === 'number') input.value = existing;

                // Recompute footer totals on every change
                input.addEventListener('change', () => { collectAndUpdate(); updateFormTotals(); });

                cell.appendChild(input);
                row.appendChild(cell);
            }

            form.appendChild(row);
        }

        // ── TOTALS FOOTER ROW (below Institutional) ───────────────────
        const footerRow = document.createElement('div');
        footerRow.className = 'hm-form-row hm-form-footer';
        footerRow.style.gridTemplateColumns = `170px repeat(${WASTE_TYPES.length}, 1fr)`;

        // Footer label cell
        const footerLabel = document.createElement('div');
        footerLabel.id = 'heatmap_footer_label';
        footerLabel.className = 'hm-form-cell hm-form-rowlabel hm-footer-label';
        footerLabel.innerHTML = `
            <div style="display:flex; flex-direction:column; align-items:flex-start;">
                <span id="hm_form_grand_total" style="font-size:0.75rem; opacity:0.8; font-weight:400; text-transform:none; margin-bottom:2px;">Grand Total: 0.00 kg</span>
                <div style="display:flex; align-items:center;">
                    <i class="fas fa-equals" style="margin-right:6px; color:#059669;"></i>
                    <span style="font-weight:700; color:#065f46;">TOTAL (KG)</span>
                </div>
            </div>`;
        footerRow.appendChild(footerLabel);

        // One column-total display per waste type
        for (const wt of WASTE_TYPES) {
            const cell = document.createElement('div');
            cell.className = 'hm-form-cell';
            const display = document.createElement('div');
            display.id = `hm_col_total_${wt.key}`;
            display.style.cssText = 'font-weight:700; color:#059669; font-size:0.95rem; padding:6px 8px; background:#ecfdf5; border-radius:6px; text-align:center; width:100%;';
            display.textContent = '0.00';
            cell.appendChild(display);
            footerRow.appendChild(cell);
        }

        form.appendChild(footerRow);
        fc.appendChild(form);

        // Populate totals for any pre-filled data
        updateFormTotals();
    }

    /** Recomputes column totals and grand total in the footer row. */
    function updateFormTotals() {
        let grandTotal = 0;
        for (const wt of WASTE_TYPES) {
            let colTotal = 0;
            for (const sector of SECTORS) {
                const el = document.getElementById(`hm_${sector.key}_${wt.key}`);
                colTotal += el ? (parseFloat(el.value) || 0) : 0;
            }
            grandTotal += colTotal;
            const display = document.getElementById(`hm_col_total_${wt.key}`);
            if (display) display.textContent = colTotal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
        }
        
        // Update grand total in the label
        const grandEl = document.getElementById('hm_form_grand_total');
        if (grandEl) {
            grandEl.textContent = `Grand Total: ${grandTotal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} kg`;
        }
    }

    /** @deprecated kept for backward compat; delegates to updateFormTotals() */
    function updateFormRowTotal(sectorKey) { updateFormTotals(); }

    function collectAndUpdate() {
        const data = collectFormData();
        if (hasAnyData(data)) render(data);
    }

    function _applyForm() {
        const data = collectFormData();
        render(data);
        saveToLocalStorage(data);
        saveToDatabase(data);
    }

    function _clearForm() {
        document.querySelectorAll('.hm-input').forEach(el => { el.value = ''; });
        _currentData = null;
        updateFormTotals();
        clearLocalStorage();

        const root = document.getElementById(_containerId);
        if (root) root.innerHTML = `
            <div class="hm-empty">
                <i class="fas fa-inbox"></i>
                <p>No waste data available. Enter values in the form above and click <strong>Apply</strong>.</p>
            </div>`;
    }

    // ── LocalStorage Persistence ─────────────────────────────────────
    const LS_KEY = 'ecosched_heatmap_v1';

    function saveToLocalStorage(data) {
        try {
            localStorage.setItem(LS_KEY, JSON.stringify(data));
            console.log('[WasteHeatmap] ✅ Plan saved to localStorage.');
        } catch(e) {
            console.warn('[WasteHeatmap] Could not write to localStorage:', e);
        }
    }

    function loadFromLocalStorage() {
        try {
            const raw = localStorage.getItem(LS_KEY);
            return raw ? JSON.parse(raw) : null;
        } catch(e) {
            return null;
        }
    }

    function clearLocalStorage() {
        try { localStorage.removeItem(LS_KEY); } catch(e) {}
    }

    // ── Database Persistence ─────────────────────────────────────────
    /**
     * Saves the current heatmap data to the `waste_management_plans` table in Supabase.
     * Uses the global `supabase` client exposed by supabase_config.js.
     */
    async function saveToDatabase(data) {
        try {
            // Compute sector row totals
            const sectorTotals = {};
            for (const s of SECTORS) {
                sectorTotals[s.key] = WASTE_TYPES.reduce((sum, w) => sum + (data?.[s.key]?.[w.key] || 0), 0);
            }
            // Compute waste-type column totals
            const typeTotals = {};
            for (const w of WASTE_TYPES) {
                typeTotals[w.key] = SECTORS.reduce((sum, s) => sum + (data?.[s.key]?.[w.key] || 0), 0);
            }
            const grandTotal = totalWaste(data);

            const record = {
                plan_name: 'Ten Year Solid Waste Management Plan',
                generated_at: new Date().toISOString(),
                waste_data: data,
                sector_totals: sectorTotals,
                type_totals: typeTotals,
                grand_total_kg: grandTotal
            };

            // Use window.supabase exposed by supabase_config.js (set via module)
            const client = window.__supabaseClient;
            if (!client) {
                console.warn('[WasteHeatmap] Supabase client not available on window.__supabaseClient. Skipping DB save.');
                return;
            }

            const { data: saved, error } = await client
                .from('waste_management_plans')
                .insert(record)
                .select()
                .single();

            if (error) {
                console.error('[WasteHeatmap] ❌ Failed to save plan to DB:', error.message);
            } else {
                console.log('[WasteHeatmap] ✅ Plan saved to DB (id:', saved?.id, ')');
                // Trigger history refresh if the callback exists (provided by analytics.js)
                if (typeof window.refreshPlanHistory === 'function') {
                    window.refreshPlanHistory();
                }
            }
        } catch (err) {
            console.error('[WasteHeatmap] ❌ Unexpected error saving to DB:', err);
        }
    }

    function collectFormData() {
        const data = {};
        for (const s of SECTORS) {
            data[s.key] = {};
            for (const w of WASTE_TYPES) {
                const el = document.getElementById(`hm_${s.key}_${w.key}`);
                data[s.key][w.key] = el ? (parseFloat(el.value) || 0) : 0;
            }
        }
        return data;
    }

    // ── Load from Supabase collection records ───────────────────────
    /**
     * Classifies Supabase collection records into sector×type buckets
     * using only keyword matching. Each matched record contributes
     * ONE count to its cell — the heatmap shows frequency, not weight.
     * No numeric values are assumed.
     *
     * @param {Array} records - analyticsData.collections from analytics.js
     */
    function loadFromCollections(records) {
        if (!Array.isArray(records) || records.length === 0) return null;

        // Initialize with zeroes — these are NOT base data, they're counters
        const counts = {};
        for (const s of SECTORS) {
            counts[s.key] = {};
            for (const w of WASTE_TYPES) counts[s.key][w.key] = 0;
        }

        for (const rec of records) {
            const typeStr = (rec.wasteType || rec.name || rec.description || '').toLowerCase();
            const zoneStr = (rec.area || rec.serviceArea || rec.zone || '').toLowerCase();

            // Classify waste type
            let wasteKey = 'residual'; // fallback
            for (const [k, kws] of Object.entries(WASTE_KEYWORDS)) {
                if (k === 'residual') continue;
                if (kws.some(kw => typeStr.includes(kw))) { wasteKey = k; break; }
            }

            // Classify sector
            let sectorKey = 'residential'; // fallback
            for (const [k, kws] of Object.entries(SECTOR_KEYWORDS)) {
                if (kws.some(kw => zoneStr.includes(kw))) { sectorKey = k; break; }
            }

            counts[sectorKey][wasteKey]++;
        }

        return counts;
    }

    // ── View Toggle ─────────────────────────────────────────────────
    function setView(mode) {
        _viewMode = mode === 'percentage' ? 'percentage' : 'volume';
        if (_currentData) render(_currentData);
    }

    // ── Helpers ─────────────────────────────────────────────────────
    function hasAnyData(data) {
        if (!data) return false;
        for (const s of SECTORS)
            for (const w of WASTE_TYPES)
                if ((data?.[s.key]?.[w.key] || 0) > 0) return true;
        return false;
    }

    function deepClone(obj) {
        return JSON.parse(JSON.stringify(obj || {}));
    }

    // ── Expose ───────────────────────────────────────────────────────
    return {
        render,
        update:              (data) => render(data),
        setView,
        renderForm,
        loadFromCollections,
        loadFromLocalStorage,
        _applyForm,
        _clearForm,
        get currentData()  { return _currentData; },
        get SECTORS()      { return SECTORS; },
        get WASTE_TYPES()  { return WASTE_TYPES; }
    };

})();

// Make globally accessible (used by onclick attributes in HTML)
window.WasteHeatmap = WasteHeatmap;
