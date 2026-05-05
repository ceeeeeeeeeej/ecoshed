/* Build: 1.0.0 - 2026-05-05T13:37:32.854Z */
// Bins Page JavaScript
import { dbService, realtime, utils, supabase } from '../../config/supabase_config.js';

// Global variables
let allBins = [];
let filteredBins = [];
let sensorMap = null;
let markersLayer = null;
let telemetryTimestampEl = null;
let currentFilter = 'all';
let uiUpdateTimeout = null;

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

        // Check for incoming filter from other pages (e.g. Analytics)
        const pendingFilter = sessionStorage.getItem('sensorFilter');
        if (pendingFilter) {
            console.log('🔗 Applying inherited filter:', pendingFilter);
            sessionStorage.removeItem('sensorFilter');
            setFilter(pendingFilter);
        }
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
                if (index !== -1) allBins[index] = payload.new;
            } else if (payload.eventType === 'INSERT') {
                allBins.push(payload.new);
            } else if (payload.eventType === 'DELETE') {
                allBins = allBins.filter(b => b.id !== payload.old.id);
            }

            // Throttle UI updates
            if (uiUpdateTimeout) clearTimeout(uiUpdateTimeout);
            uiUpdateTimeout = setTimeout(() => {
                renderDashboard();
                refreshTelemetryTimestamp('Live update');
            }, 500);
        })
        .subscribe();
}

function renderDashboard() {
    updateStats();
    applyFilter();
    renderBinList();
    updateMapMarkers();
    updateMapStats();
}

function applyFilter() {
    if (currentFilter === 'active') {
        const now = new Date();
        filteredBins = allBins.filter(bin => {
            const lastUpdate = bin.updated_at ? new Date(bin.updated_at) : null;
            const diffMinutes = lastUpdate ? (now - lastUpdate) / 1000 / 60 : 999;
            return diffMinutes <= 2 && bin.status !== 'inactive';
        });
    } else if (currentFilter === 'critical') {
        const threshold = 75;
        const lowBatteryThreshold = 20;
        filteredBins = allBins.filter(bin =>
            (bin.bin_status || '').toLowerCase() === 'full' ||
            (bin.fill_level || 0) >= threshold ||
            (bin.battery_level !== undefined && bin.battery_level <= lowBatteryThreshold) ||
            (bin.battery !== undefined && bin.battery <= lowBatteryThreshold)
        );
    } else {
        filteredBins = [...allBins];
    }
}

window.setFilter = function(filterType) {
    console.log('🎯 Setting sensor filter:', filterType);

    // Toggle filter
    if (currentFilter === filterType) {
        currentFilter = 'all';
    } else {
        currentFilter = filterType;
    }

    // Update UI active states
    document.querySelectorAll('.stat-card').forEach(card => {
        card.classList.remove('active');
        const cardType = card.getAttribute('data-filter');
        if (cardType === currentFilter) {
            card.classList.add('active');
        }
    });

    renderDashboard();
};

function updateStats() {
    const activeBinsEl = document.getElementById('activeBins');
    const fullBinAlertsEl = document.getElementById('fullBinAlerts');

    if (activeBinsEl) activeBinsEl.textContent = allBins.length;

    const criticalThreshold = 75;
    const lowBatteryThreshold = 20;
    const criticalBinsCount = allBins.filter(bin =>
        (bin.bin_status || '').toLowerCase() === 'full' ||
        (bin.fill_level || 0) >= criticalThreshold ||
        (bin.battery_level !== undefined && bin.battery_level <= lowBatteryThreshold) ||
        (bin.battery !== undefined && bin.battery <= lowBatteryThreshold)
    ).length;

    if (fullBinAlertsEl) fullBinAlertsEl.textContent = criticalBinsCount;

    // Trigger specific Battery Alerts (<= 10%)
    const dyingSensors = allBins.filter(s => {
        const batt = s.battery_level !== undefined ? s.battery_level : (s.battery !== undefined ? s.battery : 100);
        return batt <= 10;
    });
    if (dyingSensors.length > 0 && typeof showBatteryAlert === 'function') {
        showBatteryAlert(dyingSensors);
    }

    // Trigger Full Bin Notifications to Collectors
    allBins.forEach(bin => {
        const isFull = (bin.bin_status || '').toLowerCase() === 'full' || (bin.fill_level || 0) >= criticalThreshold;
        if (isFull && typeof notifyCollectorsOfCriticalBin === 'function') {
            notifyCollectorsOfCriticalBin(bin);
        }
    });
}

function renderBinList() {
    const sensorListEl = document.getElementById('sensorList');
    if (!sensorListEl) return;

    sensorListEl.innerHTML = '';

    if (filteredBins.length === 0) {
        sensorListEl.innerHTML = `
            <div style="text-align:center; padding: 40px; color: #9ca3af;">
                <i class="fas fa-search" style="font-size: 24px; margin-bottom: 10px; opacity: 0.5;"></i>
                <p>No sensors match the current filter</p>
                <button class="btn-sync" onclick="setFilter('all')" style="margin-top: 10px;">View All Bins</button>
            </div>
        `;
        return;
    }

    filteredBins.sort((a, b) => b.fill_level - a.fill_level).forEach(bin => {
        const criticalThreshold = 75;
        const warningThreshold = 50;
        const lowBatteryThreshold = 20;

        // Battery calculation
        const batteryPerc = bin.battery_level !== undefined ? bin.battery_level : (bin.battery !== undefined ? bin.battery : 100);
        const batteryClass = batteryPerc <= lowBatteryThreshold ? 'battery-low' : batteryPerc <= 50 ? 'battery-mid' : 'battery-full';
        const batteryIcon = batteryPerc <= lowBatteryThreshold ? 'fa-battery-empty' : batteryPerc <= 50 ? 'fa-battery-half' : 'fa-battery-full';

        const isFull = (bin.bin_status || '').toLowerCase() === 'full' || (bin.fill_level || 0) >= criticalThreshold;
        const isLowBattery = batteryPerc <= lowBatteryThreshold;

        const severity = (isFull || isLowBattery) ? 'status-critical' : bin.fill_level >= warningThreshold ? 'status-warning' : 'status-safe';
        const fillPill = isFull ? 'Full' : (bin.fill_level >= warningThreshold ? 'Warning' : 'Normal');
        const barColor = isFull ? '#dc2626' : (bin.fill_level >= warningThreshold ? '#f59e0b' : '#10b981');

        const item = document.createElement('div');
        item.className = 'sensor-item';
        item.innerHTML = `
            <div class="sensor-header-row">
                <div class="sensor-id-tag">${bin.bin_id}</div>
                <div class="battery-indicator ${batteryClass}">
                    <i class="fas ${batteryIcon}"></i> ${batteryPerc}%
                </div>
            </div>
            <div class="sensor-meta">
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
                    <i class="fas ${isLowBattery ? 'fa-battery-quarter' : 'fa-signal'}"></i>
                    ${isLowBattery ? 'Low Battery' : fillPill}
                </span>
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

    markersLayer = L.layerGroup().addTo(sensorMap);
    updateMapMarkers();
}

function updateMapMarkers() {
    if (!sensorMap || !markersLayer) return;
    markersLayer.clearLayers();

    const markers = [];
    allBins.forEach(bin => {
        if (bin.location_lat && bin.location_lng) {
            const isFull = (bin.bin_status || '').toLowerCase() === 'full' || (bin.fill_level || 0) >= 75;
            const markerColor = isFull ? '#ef4444' : '#10b981';
            const marker = L.circleMarker([bin.location_lat, bin.location_lng], {
                radius: 10,
                color: markerColor,
                fillColor: markerColor,
                fillOpacity: 0.8
            });

            marker.bindPopup(`
                <strong>${bin.bin_id}</strong><br>
                ${bin.address || 'No Address'}<br>
                Status: ${isFull ? 'Full' : 'Normal'}
            `);
            markersLayer.addLayer(marker);
            markers.push(marker);
        }
    });

    if (markers.length > 0) {
        const group = new L.featureGroup(markers);
        sensorMap.fitBounds(group.getBounds().pad(0.1));
    }
}

function updateMapStats() {
    const mapAvgFillEl = document.getElementById('mapAvgFill');
    if (mapAvgFillEl && allBins.length > 0) {
        const avg = Math.round(allBins.reduce((sum, b) => sum + b.fill_level, 0) / allBins.length);
        mapAvgFillEl.textContent = avg >= 75 ? 'Critical' : 'Normal';
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

// Show specific alert for low battery (<= 10%)
function showBatteryAlert(lowBatterySensors) {
    const alertKey = `batt_alert_${lowBatterySensors.map(b => b.bin_id).sort().join('_')}`;
    if (sessionStorage.getItem(alertKey)) return;

    const binList = lowBatterySensors.map(b => {
        const batt = b.battery_level !== undefined ? b.battery_level : (b.battery !== undefined ? b.battery : 0);
        return `${b.bin_id} (${batt}%)`;
    }).join(', ');

    const title = '🔋 Low Battery Alert';
    const message = `The following sensors are at critical battery levels (<= 10%): ${binList}. Please schedule a battery replacement immediately.`;

    if ('Notification' in window && Notification.permission === 'granted') {
        new Notification(title, {
            body: message,
            icon: '/Admin_Dashboard/assets/logo.png',
            tag: 'battery-alert',
            requireInteraction: true
        });
    }

    if (typeof showInPageAlert === 'function') {
        showInPageAlert(title, message, true);
    }

    sessionStorage.setItem(alertKey, 'true');
}

function showInPageAlert(title, message, isUrgent) {
    const existingAlert = document.getElementById('critical-bins-alert');
    if (existingAlert) existingAlert.remove();

    const alert = document.createElement('div');
    alert.id = 'critical-bins-alert';
    alert.style.cssText = `
        position: fixed;
        top: 80px;
        right: 20px;
        max-width: 400px;
        background: ${isUrgent ? 'linear-gradient(135deg, #DC2626, #991B1B)' : 'linear-gradient(135deg, #F59E0B, #D97706)'};
        color: white;
        padding: 16px 20px;
        border-radius: 12px;
        box-shadow: 0 10px 40px rgba(0,0,0,0.3);
        z-index: 10000;
        font-family: 'Inter', sans-serif;
        animation: slideIn 0.3s ease-out;
    `;

    alert.innerHTML = `
        <div style="display: flex; align-items: start; gap: 12px;">
            <div style="font-size: 24px;">${isUrgent ? '🚨' : '⚠️'}</div>
            <div style="flex: 1;">
                <h4 style="margin: 0 0 8px 0; font-size: 16px; font-weight: 600;">${title}</h4>
                <p style="margin: 0; font-size: 14px; line-height: 1.5; opacity: 0.95;">${message}</p>
            </div>
            <button onclick="this.parentElement.parentElement.remove()" style="background: none; border: none; color: white; font-size: 20px; cursor: pointer; padding: 0;">×</button>
        </div>
    `;

    const style = document.createElement('style');
    style.textContent = `@keyframes slideIn { from { transform: translateX(100%); opacity: 0; } to { transform: translateX(0); opacity: 1; } }`;
    document.head.appendChild(style);
    document.body.appendChild(alert);

    setTimeout(() => { if (alert.parentElement) alert.remove(); }, 15000);
}
// Critical Bin Notification System
async function notifyCollectorsOfCriticalBin(bin) {
    try {
        const binId = bin.bin_id || bin.id;
        const fillLevel = bin.fill_level || 0;
        const area = (bin.address || '').toLowerCase();

        // Anti-Spam: Don't notify again for the same bin in this session for 30 mins
        const cooldownKey = `notif_cooldown_${binId}`;
        const lastNotified = sessionStorage.getItem(cooldownKey);
        if (lastNotified && (Date.now() - parseInt(lastNotified)) < 30 * 60 * 1000) {
            return;
        }

        console.log(`🚨 [CRITICAL BIN] ${binId} at ${fillLevel}% - Sending alerts...`);

        // Fetch operational collectors
        const { data: users, error } = await supabase
            .from('users')
            .select('id, role, barangay, status')
            .in('role', ['collector', 'driver']);

        if (error) throw error;

        // Determine target area
        // Support hyphens and variations (e.g., Dayo-an vs Dayoan)
        const normalize = (s) => (s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
        const targetAreas = ['victoria', 'dayoan', 'dayaon'];
        const normalizedBinArea = normalize(bin.address);
        const binArea = targetAreas.find(a => normalizedBinArea.includes(a)) || 'all';

        const collectorsToNotify = users.filter(u => {
            const userArea = (u.barangay || '').toLowerCase();
            const normalizedUserArea = normalize(userArea);

            // REMOVED: status check. We want to store notifications for ALL collectors
            // even if they are currently offline, so they see them when they log in.

            if (userArea === 'all' || normalizedUserArea === 'all') return true;

            // Match if normalized areas overlap
            if (binArea !== 'all' && (normalizedUserArea.includes(binArea) || binArea.includes(normalizedUserArea))) return true;

            // Fallback: If bin is critical and collector handles "Dayoan" variations
            if (normalizedBinArea.includes(normalizedUserArea) || normalizedUserArea.includes(normalizedBinArea)) return true;

            return false;
        });

        // SAFETY FALLBACK: If no specific collectors matched, notify all collectors in the system
        const finalCollectors = collectorsToNotify.length > 0 ? collectorsToNotify : users;

        console.log(`📣 Notifying ${finalCollectors.length} collectors for bin ${binId}`);

        const notificationTitle = `🚨 CRITICAL BIN ALERT | BANTAY BIYAHID!`;
        const notificationMsg = `Bin ${binId} in ${bin.address || 'Unknown'} is ${fillLevel}% full. Please schedule a pickup. \n\n Ang basura sa ${binId} (${bin.address || 'Unknown'}) kay ${fillLevel}% na nga puno. Palihog og pickup.`;

        try {
            for (const collector of finalCollectors) {
                const { error: insertError } = await supabase.from('user_notifications').insert({
                    user_id: collector.id,
                    title: notificationTitle,
                    message: notificationMsg,
                    type: 'bin_alert',
                    barangay: bin.address || 'targeted',
                    created_at: new Date().toISOString()
                });

                if (insertError) {
                    console.error(`❌ Failed to insert notification for collector ${collector.id}:`, insertError);
                } else {
                    console.log(`✅ Stored notification for collector: ${collector.id}`);
                }
            }
            console.log('🏁 Finished processing all notifications.');
        } catch (err) {
            console.error('❌ Critical error in notification loop:', err);
        }

        sessionStorage.setItem(cooldownKey, Date.now().toString());
        showNotification(`Alert sent to ${collectorsToNotify.length} collectors for bin ${binId}`, 'success');

    } catch (err) {
        console.error('Failed to notify collectors of critical bin:', err);
    }
}