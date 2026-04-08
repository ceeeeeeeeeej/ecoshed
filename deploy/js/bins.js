// Bins Page JavaScript
import { dbService, realtime, utils, supabase } from '../../config/supabase_config.js';

// Global variables
let allBins = [];
let sensorMap = null;
let sensorMarkers = [];
let telemetryTimestampEl = null;

// Initialize the page
// Initialize the page. Because it is loaded in an iframe, DOMContentLoaded might have already fired.
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () {
        console.log('Bins page loaded via DOMContentLoaded');
        initializeBinsPage();
    });
} else {
    console.log('Bins page loaded immediately');
    initializeBinsPage();
}

async function initializeBinsPage() {
    try {
        telemetryTimestampEl = document.getElementById('telemetryTimestamp');

        // Load bins from Supabase
        await loadBins();

        // Initialize Map
        initializeSensorMap();

        // Set up Real-time listener
        setupRealtimeListener();

        // Set up UI Event listeners
        setupEventListeners();
    } catch (err) {
        console.error("FATAL ERROR in initializeBinsPage:", err);
        const sensorListEl = document.getElementById('sensorList');
        if (sensorListEl) {
            sensorListEl.innerHTML = `
                <div style="text-align:center; padding: 40px; color: #ef4444;">
                    <i class="fas fa-exclamation-triangle" style="font-size: 24px; margin-bottom: 10px;"></i>
                    <p style="font-weight: bold;">Fatal Initialization Error:</p>
                    <p style="font-family: monospace; font-size: 12px; text-align: left; background: #fee2e2; padding: 10px; border-radius: 4px; overflow-x: auto;">${err.message || err.toString()}<br>${err.stack || ''}</p>
                </div>
            `;
        }
    }
}

async function loadBins() {
    try {
        const { data, error } = await supabase
            .from('bins')
            .select('*');

        if (error) throw error;
        allBins = data || [];
        renderDashboard();
    } catch (error) {
        console.error('Error loading bins:', error);
        showNotification('Failed to load bin data: ' + error.message, 'error');
        const sensorListEl = document.getElementById('sensorList');
        if (sensorListEl) {
            sensorListEl.innerHTML = `
                <div style="text-align:center; padding: 40px; color: #ef4444;">
                    <i class="fas fa-exclamation-triangle" style="font-size: 24px; margin-bottom: 10px;"></i>
                    <p style="font-weight: bold;">Error loading data:</p>
                    <p style="font-family: monospace; font-size: 12px; text-align: left; background: #fee2e2; padding: 10px; border-radius: 4px; overflow-x: auto;">${error.message || error.toString()}</p>
                </div>
            `;
        }
    }
}

function setupRealtimeListener() {
    supabase
        .channel('bins-channel')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'bins' }, (payload) => {
            console.log('Bin change received:', payload);
            if (payload.eventType === 'UPDATE') {
                const index = allBins.findIndex(b => b.id === payload.new.id);
                if (index !== -1) {
                    allBins[index] = payload.new;
                }
            } else if (payload.eventType === 'INSERT') {
                allBins.push(payload.new);
            } else if (payload.eventType === 'DELETE') {
                allBins = allBins.filter(b => b.id !== payload.old.id);
            }
            renderDashboard();
            refreshTelemetryTimestamp('Live update');
        })
        .subscribe();
}

function renderDashboard() {
    updateStats();
    renderBinList();
    updateMapMarkers();
    updateMapStats();
}

function updateStats() {
    const activeBinsEl = document.getElementById('activeBins');
    const fullBinAlertsEl = document.getElementById('fullBinAlerts');

    if (activeBinsEl) activeBinsEl.textContent = allBins.length;

    const criticalBins = allBins.filter(b => b.bin_status === 'full').length;
    if (fullBinAlertsEl) fullBinAlertsEl.textContent = criticalBins;
}

function renderBinList() {
    const sensorListEl = document.getElementById('sensorList');
    if (!sensorListEl) return;

    sensorListEl.innerHTML = '';

    allBins.sort((a, b) => b.fill_level - a.fill_level).forEach(bin => {
        const isFull = (bin.bin_status || '').toLowerCase() === 'full';
        const severity = isFull ? 'status-critical' : 'status-safe';
        const fillPill = isFull ? 'Full' : 'Normal';
        const barColor = isFull ? '#dc2626' : '#10b981';

        const item = document.createElement('div');
        item.className = 'sensor-item';
        item.innerHTML = `
            <div class="sensor-meta">
                <span class="id">${bin.bin_id}</span>
                <span class="location">${bin.address || 'Unknown Location'}</span>
                ${(() => {
                const now = new Date();
                const lastUpdate = bin.updated_at ? new Date(bin.updated_at) : null;
                const diffMinutes = lastUpdate ? (now - lastUpdate) / 1000 / 60 : 999;
                const isOnline = diffMinutes <= 2 && bin.status !== 'inactive';

                return isOnline
                    ? `<span class="sensor-status online"><i class="fas fa-signal"></i> Online</span>`
                    : `<span class="sensor-status offline" style="color: #ef4444; background: #fee2e2;"><i class="fas fa-ban"></i> Offline</span>`;
            })()}
                <span class="status-pill ${severity}">
                    <i class="fas fa-signal"></i> ${fillPill}
                </span>
            </div>
            <div class="sensor-level">
                <span class="level-value">${bin.fill_level}%</span>
                <div class="level-bar">
                    <div class="level-fill" style="width:${bin.fill_level}%; background:${barColor};"></div>
                </div>
            </div>
        `;
        sensorListEl.appendChild(item);
    });
}

function initializeSensorMap() {
    const mapEl = document.getElementById('sensorMap');
    if (!mapEl) return;

    sensorMap = L.map('sensorMap').setView([9.0104, 126.148], 14);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; OpenStreetMap contributors'
    }).addTo(sensorMap);

    updateMapMarkers();
}

function updateMapMarkers() {
    if (!sensorMap) return;

    sensorMarkers.forEach(m => m.remove());
    sensorMarkers = [];

    allBins.forEach(bin => {
        if (bin.location_lat && bin.location_lng) {
            const isFull = (bin.bin_status || '').toLowerCase() === 'full';
            const markerColor = isFull ? '#ef4444' : '#10b981';
            const marker = L.circleMarker([bin.location_lat, bin.location_lng], {
                radius: 10,
                color: markerColor,
                fillColor: markerColor,
                fillOpacity: 0.8
            }).addTo(sensorMap);

            marker.bindPopup(`
                <strong>${bin.bin_id}</strong><br>
                ${bin.address || 'No Address'}<br>
                Fill Level: ${bin.fill_level}%
            `);
            sensorMarkers.push(marker);
        }
    });

    if (allBins.length > 0 && sensorMarkers.length > 0) {
        const group = new L.featureGroup(sensorMarkers);
        sensorMap.fitBounds(group.getBounds().pad(0.1));
    }
}

function updateMapStats() {
    const mapAvgFillEl = document.getElementById('mapAvgFill');
    if (mapAvgFillEl && allBins.length > 0) {
        const avg = Math.round(allBins.reduce((sum, b) => sum + b.fill_level, 0) / allBins.length);
        mapAvgFillEl.textContent = `${avg}%`;
    }
}

function refreshTelemetryTimestamp(prefix = 'Updated') {
    if (!telemetryTimestampEl) return;
    const stamp = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    telemetryTimestampEl.textContent = `${prefix} ${stamp}`;
}

function setupEventListeners() {
    const syncBtn = document.getElementById('syncSensorsBtn');
    if (syncBtn) {
        syncBtn.addEventListener('click', () => {
            loadBins();
            refreshTelemetryTimestamp('Manual sync');
        });
    }
}

function showNotification(message, type = 'info') {
    // Basic toast or alert logic (could be integrated with a global notify system)
    console.log(`[${type.toUpperCase()}] ${message}`);
}
