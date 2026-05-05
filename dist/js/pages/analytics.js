/* Build: 1.0.0 - 2026-05-05T13:37:32.854Z */
// Analytics page functionality
import { dbService, realtime, utils } from '../../config/supabase_config.js';

console.log('📊 Analytics page loaded');

// Chart instances
let volumeChart = null;
let routeChart = null;
let wasteTypeChart = null;
let coverageChart = null;
let fillLevelTrendChart = null;
let currentDateRange = 30;
let currentVolumeChartType = 'line';

// Analytics data storage
let analyticsData = {
    collections: [],
    feedback: [],
    routes: [],
    sensors: [],
    plans: []
};
window.analyticsData = analyticsData;

// Map layer groups for better performance
let markersLayer = null;
let heatmapLayer = null;
let sensorMap = null;
let sensorSubscription = null;

// Throttling for UI updates
let updateTimer = null;
let currentRenamePlanId = null;

// Initialize analytics page
document.addEventListener('DOMContentLoaded', function () {
    console.log('📊 Initializing analytics page...');
    initializePage();
});

// Cleanup subscriptions on page unload
window.addEventListener('beforeunload', () => {
    if (sensorSubscription) {
        sensorSubscription.unsubscribe();
    }
});

async function initializePage() {
    showLoadingState();
    await loadInitialData();
    initializeCharts();
    initializeMap();
    initializeFillLevelChart();
    updateUI();
    updateStatsCards(); // Ensure stats are updated on load
    loadPlanHistory(); // Load historical waste plans
    setupRealtimeSubscription();
    requestNotificationPermission();
}

// Request browser notification permission
async function requestNotificationPermission() {
    if ('Notification' in window) {
        if (Notification.permission === 'default') {
            await Notification.requestPermission();
        } else if (Notification.permission === 'granted') {
            console.log('✅ Browser notifications already enabled');
        } else {
            console.warn('⚠️ Browser notifications blocked by user');
        }
    }
}

function showLoadingState() {
    const valueElements = ['efficiencyValue', 'responseTimeValue', 'wasteVolumeValue', 'satisfactionValue'];
    valueElements.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
    });
}

async function loadInitialData() {
    try {
        console.log('📥 Fetching analytics data from Supabase...');

        // Fetch data in parallel
        const [schedulesRes, feedbackRes, routesRes, sensorsRes] = await Promise.all([
            dbService.getCollectionSchedules(),
            dbService.getResidentFeedback(null, 200),
            dbService.getRoutes ? dbService.getRoutes() : { data: [] },
            dbService.getBins ? dbService.getBins() : { data: [] }
        ]);

        analyticsData.collections = schedulesRes.data || [];
        analyticsData.feedback = feedbackRes.data || [];
        analyticsData.sensors = sensorsRes.data || [];
        analyticsData.routes = routesRes.data || [];

        console.log('✅ Data loaded:', {
            collections: analyticsData.collections.length,
            feedback: analyticsData.feedback.length,
            sensors: analyticsData.sensors.length,
            routes: analyticsData.routes.length
        });
    } catch (error) {
        console.error('❌ Error loading analytics data:', error);
    }
}

function updateUI() {
    // Throttle updates to 500ms to prevent flickering during rapid sensor bursts
    if (updateTimer) clearTimeout(updateTimer);
    updateTimer = setTimeout(() => {
        updateMap();
        updateStatsCards(); // Keep stats in sync with real-time updates
    }, 500);
}

// Navigation helper for stats redirection
window.navigateToBinsWithFilter = function (filterType) {
    console.log('🚀 Redirecting to Bins Dashboard with filter:', filterType);

    // Pass filter via sessionStorage to the bins page script
    sessionStorage.setItem('sensorFilter', filterType);

    // Use the parent dashboard's navigation if available
    if (window.parent && typeof window.parent.navigateToPage === 'function') {
        window.parent.navigateToPage('bins');
    } else {
        // Fallback for standalone testing
        window.location.href = 'bins.html';
    }
};

function updateStatsCards() {
    // 1. Collection Efficiency
    const completed = analyticsData.collections.filter(s => s.status === 'completed').length;
    const total = analyticsData.collections.length;
    const efficiency = total > 0 ? (completed / total * 100).toFixed(1) : 0;

    const effVal = document.getElementById('efficiencyValue');
    if (effVal) effVal.textContent = completed === total ? 'All Collected' : 'In Progress';
    const effChange = document.getElementById('efficiencyChange');
    if (effChange) effChange.textContent = `${total} total collections tracked`;

    // 2. Average Response Time (calculated from actual completion times)
    let avgTime = 0;
    const completedSchedules = analyticsData.collections.filter(s =>
        s.status === 'completed' && s.scheduledDate && s.completedDate
    );

    if (completedSchedules.length > 0) {
        const totalMinutes = completedSchedules.reduce((acc, schedule) => {
            const scheduled = new Date(schedule.scheduledDate);
            const completed = new Date(schedule.completedDate);
            const diffMinutes = Math.abs(completed - scheduled) / (1000 * 60);
            return acc + diffMinutes;
        }, 0);
        avgTime = Math.round(totalMinutes / completedSchedules.length);
    }

    const respVal = document.getElementById('responseTimeValue');
    if (respVal) respVal.textContent = completedSchedules.length > 0 ? `${avgTime} min` : 'N/A';
    const respChange = document.getElementById('responseTimeChange');
    if (respChange) respChange.textContent = `${completedSchedules.length} completed schedules`;

    // 3. Waste Collected (Average Sensor Fill Level)
    const activeSensors = analyticsData.sensors.filter(s => s.status === 'active');
    const avgFillLevel = activeSensors.length > 0
        ? Math.round(activeSensors.reduce((sum, s) => sum + (s.fill_level || 0), 0) / activeSensors.length)
        : 0;

    const wasteVal = document.getElementById('wasteVolumeValue');
    if (wasteVal) wasteVal.textContent = avgFillLevel >= 75 ? 'Full' : 'Normal';
    const wasteChange = document.getElementById('wasteVolumeChange');
    if (wasteChange) wasteChange.textContent = activeSensors.length > 0
        ? `From ${activeSensors.length} active sensors`
        : 'No sensors available';

    // 4. Customer Satisfaction
    const ratings = analyticsData.feedback
        .filter(f => f.rating !== undefined)
        .map(f => f.rating);
    const avgRating = ratings.length > 0
        ? (ratings.reduce((a, b) => a + b, 0) / ratings.length).toFixed(1)
        : '0.0';

    const satVal = document.getElementById('satisfactionValue');
    if (satVal) satVal.textContent = `${avgRating}/5`;
    const satChange = document.getElementById('satisfactionChange');
    if (satChange) satChange.textContent = `From ${analyticsData.feedback.length} feedback items`;
}

// Generate data based on real records
function getVolumeData(days) {
    const labels = [];
    const volumeData = [];
    const today = new Date();

    for (let i = days - 1; i >= 0; i--) {
        const date = new Date(today);
        date.setDate(date.getDate() - i);
        const dateStr = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
        labels.push(dateStr);

        // Count collections for this day
        const dayCollections = analyticsData.collections.filter(s => {
            const sDate = new Date(s.scheduledDate);
            return sDate.toDateString() === date.toDateString();
        }).length;

        volumeData.push(dayCollections);
    }

    return { labels, volumeData };
}

// Initialize all Chart.js charts
function initializeCharts() {
    const { labels, volumeData } = getVolumeData(currentDateRange);

    // Volume Chart
    const volumeCtx = document.getElementById('volumeChart');
    if (volumeCtx) {
        volumeChart = new Chart(volumeCtx, {
            type: currentVolumeChartType,
            data: {
                labels: labels,
                datasets: [{
                    label: 'Collection Volume',
                    data: volumeData,
                    borderColor: 'rgb(16, 185, 129)',
                    backgroundColor: currentVolumeChartType === 'bar'
                        ? 'rgba(16, 185, 129, 0.5)'
                        : 'rgba(16, 185, 129, 0.1)',
                    borderWidth: 2,
                    fill: currentVolumeChartType === 'line',
                    tension: 0.4
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    y: {
                        beginAtZero: true,
                        ticks: { stepSize: 1 }
                    }
                }
            }
        });
    }

    // Route Performance Chart (Bar)
    const routeCtx = document.getElementById('routeChart');
    if (routeCtx) {
        // Count schedules per route
        const routeCounts = {};
        analyticsData.collections.forEach(schedule => {
            if (schedule.routeId) {
                routeCounts[schedule.routeId] = (routeCounts[schedule.routeId] || 0) + 1;
            }
        });

        // Get top 6 routes with most schedules
        const sortedRoutes = analyticsData.routes
            .map(r => ({
                id: r.id,
                name: r.name || r.id,
                count: routeCounts[r.id] || 0
            }))
            .sort((a, b) => b.count - a.count)
            .slice(0, 6);

        const routeLabels = sortedRoutes.map(r => r.name);
        const routeData = sortedRoutes.map(r => r.count);

        routeChart = new Chart(routeCtx, {
            type: 'bar',
            data: {
                labels: routeLabels.length > 0 ? routeLabels : ['No Routes'],
                datasets: [{
                    label: 'Schedules',
                    data: routeData.length > 0 ? routeData : [0],
                    backgroundColor: 'rgba(59, 130, 246, 0.8)',
                    borderWidth: 1
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { display: false } },
                scales: { y: { beginAtZero: true, ticks: { stepSize: 1 } } }
            }
        });
    }

    // Waste Type Distribution (Doughnut)
    const wasteTypeCtx = document.getElementById('wasteTypeChart');
    if (wasteTypeCtx) {
        const wasteTypes = {};
        analyticsData.collections.forEach(s => {
            const type = s.wasteType || 'General';
            wasteTypes[type] = (wasteTypes[type] || 0) + 1;
        });

        const labels = Object.keys(wasteTypes);
        const data = Object.values(wasteTypes);

        wasteTypeChart = new Chart(wasteTypeCtx, {
            type: 'doughnut',
            data: {
                labels: labels.length > 0 ? labels : ['No Data'],
                datasets: [{
                    data: data.length > 0 ? data : [1],
                    backgroundColor: [
                        'rgba(16, 185, 129, 0.8)',
                        'rgba(59, 130, 246, 0.8)',
                        'rgba(251, 146, 60, 0.8)',
                        'rgba(139, 92, 246, 0.8)',
                        'rgba(236, 72, 153, 0.8)',
                        'rgba(156, 163, 175, 0.8)'
                    ],
                    borderWidth: 2,
                    borderColor: '#ffffff'
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { position: 'bottom' } }
            }
        });
    }

}

// Initialize Leaflet map for sensors
function initializeMap() {
    const mapElement = document.getElementById('sensorMap');
    if (!mapElement) return;

    const tagoCenter = [9.0545, 126.4168];
    sensorMap = L.map('sensorMap').setView(tagoCenter, 13);

    L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
        attribution: 'Esri Satellite',
        maxZoom: 19
    }).addTo(sensorMap);

    // Initialize Layer Groups
    markersLayer = L.layerGroup().addTo(sensorMap);
    heatmapLayer = L.layerGroup().addTo(sensorMap);

    updateMap();
}

function createSensorMarker(sensor) {
    if (!sensor.location_lat || !sensor.location_lng) return null;

    let markerColor = '#10b981'; // Green
    if (sensor.fill_level >= 75) markerColor = '#ef4444'; // Red
    else if (sensor.fill_level >= 60) markerColor = '#f59e0b'; // Orange
    else if (sensor.fill_level >= 40) markerColor = '#fbbf24'; // Yellow

    const icon = L.divIcon({
        className: 'custom-marker',
        html: `<div style="
            background-color: ${markerColor};
            width: 30px;
            height: 30px;
            border-radius: 50%;
            border: 3px solid white;
            box-shadow: 0 2px 5px rgba(0,0,0,0.3);
            display: flex;
            align-items: center;
            justify-content: center;
            color: white;
            font-weight: bold;
            font-size: 11px;
        ">${sensor.fill_level >= 75 ? 'Full' : 'Normal'}</div>`,
        iconSize: [30, 30],
        iconAnchor: [15, 15]
    });

    const marker = L.marker([sensor.location_lat, sensor.location_lng], { icon });
    const lastEmptied = sensor.last_emptied ? new Date(sensor.last_emptied).toLocaleDateString() : 'Never';

    marker.bindPopup(`
        <div style="font-family: 'Inter', sans-serif; min-width: 200px; padding: 5px;">
            <div style="font-weight: 800; font-size: 14px; margin-bottom: 8px; color: #111827;">
                <i class="fas fa-dumpster"></i> ${sensor.bin_id}
            </div>
            <div style="font-size: 12px; line-height: 1.5; color: #4b5563;">
                <p style="margin: 4px 0;"><strong>Barangay:</strong> ${sensor.zone || 'N/A'}</p>
                <p style="margin: 4px 0;"><strong>Status:</strong> <span style="color: ${markerColor}; font-weight: bold;">${sensor.fill_level >= 75 ? 'Full' : 'Normal'}</span></p>
                <p style="margin: 4px 0;"><strong>Status:</strong> ${sensor.status || 'Active'}</p>
                <p style="margin: 4px 0; font-size: 10px; color: #9ca3af;">Last Update: ${new Date(sensor.updated_at).toLocaleTimeString()}</p>
            </div>
        </div>
    `);

    return marker;
}

// Update map with new sensor data using efficient Layer Groups
function updateMap() {
    if (!sensorMap || !markersLayer) return;

    // 1. Efficiently clear layers
    markersLayer.clearLayers();
    heatmapLayer.clearLayers();

    // 2. Add markers
    analyticsData.sensors.forEach(sensor => {
        const marker = createSensorMarker(sensor);
        if (marker) markersLayer.addLayer(marker);
    });

    // 3. Add heatmap
    const heatmapData = analyticsData.sensors
        .filter(s => s.location_lat && s.location_lng && (s.status === 'active' || !s.status))
        .map(sensor => [sensor.location_lat, sensor.location_lng, sensor.fill_level / 100]);

    if (heatmapData.length > 0) {
        const heat = L.heatLayer(heatmapData, {
            radius: 35,
            blur: 25,
            maxZoom: 17,
            max: 1.0,
            gradient: { 0.0: 'green', 0.4: 'yellow', 0.6: 'orange', 0.8: 'red' }
        });
        heatmapLayer.addLayer(heat);
    }
}

// Show alert notification for critical bins
function showCriticalBinAlert(criticalBins) {
    // Only show alert once per session for the same bins
    const alertKey = `alert_${criticalBins.map(b => b.bin_id).sort().join('_')}`;
    if (sessionStorage.getItem(alertKey)) return;

    // Accurate list including Barangay/Zone
    const binList = criticalBins.map(b => `${b.bin_id} [${b.zone || 'Unknown Barangay'}] (Full)`).join(', ');
    const urgentBins = criticalBins.filter(b => b.fill_level >= 90);

    // Determine urgency level
    const isUrgent = urgentBins.length > 0;
    const title = isUrgent ? '🚨 URGENT: Bins Full!' : '⚠️ Critical Bins Detected';

    // Explicitly mention barangays in the summary message
    const affectedBarangays = Array.from(new Set(criticalBins.map(b => b.zone || 'Unknown')));
    const message = isUrgent
        ? `${urgentBins.length} bin(s) are at 90%+ in ${affectedBarangays.join(', ')}. IMMEDIATE collection required!`
        : `Critical bins detected in ${affectedBarangays.join(', ')}: ${binList}`;

    // Store notification for notifications page
    storeNotification(title, message, isUrgent ? 'urgent' : 'high', criticalBins);

    // Console log
    console.warn(`${title}: ${message}`);

    // Mark as alerted
    sessionStorage.setItem(alertKey, 'true');
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

    storeNotification(title, message, 'high', lowBatterySensors, 'battery');
    sessionStorage.setItem(alertKey, 'true');
}

// Show in-page alert banner
function showInPageAlert(title, message, isUrgent) {
    // Remove existing alert if present
    const existingAlert = document.getElementById('critical-bins-alert');
    if (existingAlert) existingAlert.remove();

    // Create alert banner
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
            <button onclick="this.parentElement.parentElement.remove()"
                style="background: none; border: none; color: white; font-size: 20px; cursor: pointer; padding: 0; opacity: 0.8; transition: opacity 0.2s;"
                onmouseover="this.style.opacity='1'"
                onmouseout="this.style.opacity='0.8'">×</button>
        </div>
    `;

    // Add CSS animation
    const style = document.createElement('style');
    style.textContent = `
        @keyframes slideIn {
            from { transform: translateX(100%); opacity: 0; }
            to { transform: translateX(0); opacity: 1; }
        }
    `;
    document.head.appendChild(style);

    document.body.appendChild(alert);

    // Auto-remove after 15 seconds (30s for urgent)
    setTimeout(() => {
        if (alert.parentElement) {
            alert.style.animation = 'slideIn 0.3s ease-out reverse';
            setTimeout(() => alert.remove(), 300);
        }
    }, isUrgent ? 30000 : 15000);
}

// Store notification to localStorage and Broadcast to ALL Admins & Collectors
async function storeNotification(title, message, priority, targetItems, alertType = 'iot') {
    const stored = localStorage.getItem('ecosched_notifications');
    const notifications = stored ? JSON.parse(stored) : [];

    const notification = {
        id: `alert-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        type: alertType,
        priority: priority,
        title: title,
        message: message,
        timestamp: new Date().toISOString(),
        read: false,
        bins: targetItems.map(b => ({
            bin_id: b.bin_id,
            fill_level: b.fill_level,
            zone: b.zone
        }))
    };

    notifications.unshift(notification);
    const trimmed = notifications.slice(0, 100);
    localStorage.setItem('ecosched_notifications', JSON.stringify(trimmed));

    try {
        console.log('📡 Broadcasting critical bin notification to all relevant personnel...');

        // Targeted Push to ALL Collectors
        const { data: users } = await window.__supabaseClient
            .from('users')
            .select('id, role')
            .eq('role', 'collector');

        if (users && users.length > 0) {
            console.log(`📣 Notifying ${users.length} collectors...`);
            for (const collector of users) {
                await dbService.createNotification({
                    title: `TRUCK ALERT: ${title}`,
                    message: `Action Required: ${message}`,
                    user_id: collector.id,
                    type: 'bin_alert',
                    priority: 'high'
                });
            }
        }

        console.log('✅ Global broadcast completed.');
    } catch (error) {
        console.error('❌ Failed to broadcast notification:', error);
    }
}

// Initialize fill level trend chart
function initializeFillLevelChart() {
    const chartCanvas = document.getElementById('fillLevelTrendChart');
    if (!chartCanvas) return;

    // Generate mock historical data (in real scenario, fetch from database)
    const labels = [];
    const datasets = [];

    // Get last 7 days
    const today = new Date();
    for (let i = 6; i >= 0; i--) {
        const date = new Date(today);
        date.setDate(date.getDate() - i);
        labels.push(date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }));
    }

    // Create dataset for each sensor
    analyticsData.sensors.slice(0, 3).forEach((sensor, index) => {
        const colors = ['rgb(16, 185, 129)', 'rgb(59, 130, 246)', 'rgb(251, 146, 60)'];
        const data = [];

        // Use current fill level as placeholder for history (until historical tracking is implemented)
        for (let i = 0; i < 7; i++) {
            data.push(sensor.fill_level || 0);
        }

        datasets.push({
            label: sensor.bin_id || `Bin ${index + 1}`,
            data: data,
            borderColor: colors[index % colors.length],
            backgroundColor: `${colors[index % colors.length].replace('rgb', 'rgba').replace(')', ', 0.1)')}`,
            tension: 0.4,
            fill: true
        });
    });

    fillLevelTrendChart = new Chart(chartCanvas, {
        type: 'line',
        data: { labels, datasets },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: true, position: 'top' },
                tooltip: {
                    callbacks: {
                        label: (context) => `${context.dataset.label}: ${Math.round(context.parsed.y)}%`
                    }
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    max: 100,
                    ticks: { callback: (value) => `${value}%` }
                }
            }
        }
    });

    console.log('📈 Fill level trend chart initialized');
}

// ── Plan History (Recent Reports) ──────────────────────────────────

async function loadPlanHistory() {
    const grid = document.getElementById('reportsGrid');
    if (!grid) return;

    try {
        const { data: plans, error } = await dbService.getWasteManagementPlans();
        if (error) throw error;

        // Store in analyticsData and sort by date descending (newest first)
        analyticsData.plans = (plans || []).sort((a, b) => new Date(b.generated_at) - new Date(a.generated_at));

        renderPlanHistory(analyticsData.plans);
    } catch (err) {
        console.error('❌ Error loading plan history:', err);
        grid.innerHTML = `<div class="error-msg">Failed to load history: ${err.message}</div>`;
    }
}

function renderPlanHistory(plans) {
    const grid = document.getElementById('reportsGrid');
    if (!grid) return;

    if (plans.length === 0) {
        grid.innerHTML = `
            <div class="empty-state" style="grid-column: 1/-1; text-align: center; padding: 3rem; color: #9CA3AF;">
                <i class="fas fa-file-alt" style="font-size: 3rem; margin-bottom: 1rem; opacity: 0.5;"></i>
                <p style="font-size: 1.1rem; margin: 0;">No plans available yet</p>
                <p style="font-size: 0.9rem; margin-top: 0.5rem;">Generate your first plan to see it here</p>
            </div>`;
        return;
    }

    grid.innerHTML = plans.map((plan, index) => {
        const date = new Date(plan.generated_at);
        const dateStr = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
        const timeStr = date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
        const grandTotal = parseFloat(plan.grand_total_kg || 0).toLocaleString();

        return `
            <div class="report-card">
                <div class="report-card-header">
                    <div class="report-badge">
                       <i class="fas fa-check-circle"></i> Saved Plan
                    </div>
                    <div class="report-actions">
                        <button class="action-icon-btn edit" onclick="openRenameModal('${plan.id}', '${plan.plan_name}')" title="Rename Plan">
                            <i class="fas fa-edit"></i>
                        </button>
                        <button class="action-icon-btn delete" onclick="deleteHistoricalPlan('${plan.id}')" title="Delete Plan">
                            <i class="fas fa-trash"></i>
                        </button>
                    </div>
                </div>
                <div class="report-date">${dateStr} · ${timeStr}</div>
                <h4>${plan.plan_name}</h4>
                <div class="report-stat">
                    <i class="fas fa-weight-hanging"></i>
                    <span>Total Volume: <strong>${grandTotal} kg</strong></span>
                </div>
                <div class="report-footer">
                    <button class="btn-view-plan" onclick="applyHistoricalPlanByIndex(${index})">
                        <i class="fas fa-eye"></i> View Plan
                    </button>
                </div>
            </div>`;
    }).join('');
}

window.applyHistoricalPlanByIndex = function (index) {
    try {
        const plan = analyticsData.plans[index];
        if (!plan) throw new Error('Report data not found in cache. Please refresh.');

        console.log('📄 Applying historical plan:', plan.plan_name);

        if (window.WasteHeatmap) {
            window.WasteHeatmap.render(plan.waste_data);
            utils.showNotification('Historical plan applied successfully!', 'success');

            const heatmapSection = document.getElementById('hmResultSection');
            if (heatmapSection) {
                heatmapSection.style.display = 'block';
                heatmapSection.scrollIntoView({ behavior: 'smooth' });
            }
        }
    } catch (err) {
        console.error('❌ Error applying historical plan:', err);
        utils.showNotification(err.message, 'error');
    }
};

window.applyHistoricalPlan = async function (planId) {
    // Redirect to index-based search if needed
    const index = analyticsData.plans.findIndex(p => String(p.id) === String(planId));
    if (index !== -1) {
        window.applyHistoricalPlanByIndex(index);
    } else {
        utils.showNotification('Plan not found. Try refreshing the page.', 'error');
    }
};

window.refreshPlanHistory = function () {
    loadPlanHistory();
};

window.deleteHistoricalPlan = async function (planId) {
    if (!confirm('Are you sure you want to delete this saved plan?')) return;

    try {
        const { error } = await dbService.deleteWasteManagementPlan(planId);
        if (error) throw error;

        utils.showNotification('Plan deleted successfully!', 'success');
        loadPlanHistory();
    } catch (err) {
        console.error('❌ Error deleting historical plan:', err);
        utils.showNotification('Failed to delete plan: ' + err.message, 'error');
    }
};

// Callback for heatmap.js to refresh the history list
window.refreshPlanHistory = function () {
    loadPlanHistory();
};

// Rename Plan Modal Handlers
window.openRenameModal = function(id, currentName) {
    currentRenamePlanId = id;
    const modal = document.getElementById('renamePlanModal');
    const input = document.getElementById('newPlanName');
    if (input) input.value = currentName;
    if (modal) modal.classList.add('show');
};

window.closeRenameModal = function() {
    const modal = document.getElementById('renamePlanModal');
    if (modal) modal.classList.remove('show');
    currentRenamePlanId = null;
};

window.submitRenamePlan = async function() {
    if (!currentRenamePlanId) return;

    const input = document.getElementById('newPlanName');
    const newName = input ? input.value.trim() : '';

    if (!newName) {
        utils.showNotification('Please enter a valid plan name', 'error');
        return;
    }

    try {
        const { error } = await dbService.updateWasteManagementPlan(currentRenamePlanId, {
            plan_name: newName
        });

        if (error) throw error;

        utils.showNotification('Plan renamed successfully!', 'success');
        window.closeRenameModal();
        loadPlanHistory();
    } catch (err) {
        console.error('❌ Error renaming plan:', err);
        utils.showNotification('Failed to rename plan: ' + err.message, 'error');
    }
};

// Export functions to global scope
function updateCharts() {
    const { labels, volumeData } = getVolumeData(currentDateRange);

    if (volumeChart) {
        volumeChart.data.labels = labels;
        volumeChart.data.datasets[0].data = volumeData;
        volumeChart.update();
    }
}

// Update date range and refresh charts
function updateDateRange() {
    const select = document.getElementById('dateRange');
    if (select) {
        currentDateRange = parseInt(select.value);
        updateCharts();
        console.log(`📅 Date range updated to ${currentDateRange} days`);
    }
}

// Toggle chart type (line/bar) for volume chart
function toggleChartType(chartId, type) {
    if (chartId === 'volume' && volumeChart) {
        currentVolumeChartType = type;
        volumeChart.config.type = type;
        volumeChart.data.datasets[0].backgroundColor = type === 'bar'
            ? 'rgba(16, 185, 129, 0.5)'
            : 'rgba(16, 185, 129, 0.1)';
        volumeChart.data.datasets[0].fill = type === 'line';
        volumeChart.update();
        console.log(`📊 Chart type changed to ${type}`);
    }
}

// Generate comprehensive report
function generateReport(event) {
    console.log('📄 Generating comprehensive report...');
    const button = event.target.closest('button');
    const originalText = button.innerHTML;
    button.disabled = true;
    button.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Generating...';

    setTimeout(() => {
        const timestamp = new Date().toISOString();
        const dateStr = timestamp.split('T')[0];

        const reportData = {
            reportTitle: "EcoSched Analytics Performance Report",
            generatedAt: timestamp,
            dateRange: `${currentDateRange} days`,
            summary: {
                totalCollections: analyticsData.collections.length,
                completedCollections: analyticsData.collections.filter(c => c.status === 'completed').length,
                totalFeedback: analyticsData.feedback.length,
                averageRating: (analyticsData.feedback.reduce((sum, f) => sum + (f.rating || 0), 0) / analyticsData.feedback.length || 0).toFixed(2),
                activeSensors: analyticsData.sensors.filter(s => s.status === 'active').length,
                criticalBins: analyticsData.sensors.filter(s =>
                    (s.bin_status || '').toLowerCase() === 'full' || (s.fill_level || 0) >= 75
                ).length
            },
            sensorData: analyticsData.sensors.map(s => ({
                bin_id: s.bin_id,
                location: s.address,
                fill_level: `${s.fill_level}%`,
                status: s.status,
                last_update: s.updated_at
            })),
            feedbackData: analyticsData.feedback.map(f => ({
                user: f.userName,
                rating: f.rating,
                comment: f.comment,
                date: f.createdAt
            }))
        };

        // Download as JSON
        const jsonBlob = new Blob([JSON.stringify(reportData, null, 2)], { type: 'application/json' });
        downloadBlob(jsonBlob, `ecosched-report-${dateStr}.json`);

        // Also offer CSV for sensor data specifically as it's most requested for spreadsheets
        const csvContent = generateSensorCSV(analyticsData.sensors);
        const csvBlob = new Blob([csvContent], { type: 'text/csv' });
        downloadBlob(csvBlob, `sensor-data-${dateStr}.csv`);

        // Generate PDF Report
        generatePDFReport(reportData, dateStr);

        button.disabled = false;
        button.innerHTML = originalText;
        utils.showNotification('Analytics reports (PDF, JSON, CSV) generated successfully!', 'success');
    }, 1000);
}

// Generate PDF Report using jsPDF
function generatePDFReport(reportData, dateStr) {
    if (!window.jspdf) {
        console.error('jsPDF library not found');
        return;
    }

    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.width;

    // Header
    doc.setFontSize(22);
    doc.setTextColor(40, 167, 69); // Green color
    doc.text('EcoSched', 14, 20);

    doc.setFontSize(16);
    doc.setTextColor(33, 37, 41);
    doc.text('Analytics Performance Report', 14, 30);

    doc.setFontSize(10);
    doc.setTextColor(108, 117, 125);
    doc.text(`Generated: ${reportData.generatedAt.split('T')[0]}`, 14, 38);
    doc.text(`Period: Last ${reportData.dateRange}`, 14, 43);

    // Summary Section
    doc.setFontSize(14);
    doc.setTextColor(33, 37, 41);
    doc.text('Executive Summary', 14, 55);

    const summaryData = [
        ['Total Collections', reportData.summary.totalCollections],
        ['Completed Collections', reportData.summary.completedCollections],
        ['Active Sensors', reportData.summary.activeSensors],
        ['Critical Bins (>=75%)', reportData.summary.criticalBins],
        ['Resident Feedback', reportData.summary.totalFeedback],
        ['Average Rating', `${reportData.summary.averageRating} / 5.0`]
    ];

    doc.autoTable({
        startY: 60,
        head: [['Metric', 'Value']],
        body: summaryData,
        theme: 'striped',
        headStyles: { fillColor: [40, 167, 69] },
        styles: { fontSize: 10 }
    });

    // Sensor Status Section
    let finalY = doc.lastAutoTable.finalY + 15;
    doc.setFontSize(14);
    doc.text('Sensor Status Report', 14, finalY);

    const sensorRows = reportData.sensorData.map(s => [
        s.bin_id,
        s.location,
        s.fill_level,
        s.status
    ]);

    doc.autoTable({
        startY: finalY + 5,
        head: [['Bin ID', 'Location', 'Fill Level', 'Status']],
        body: sensorRows,
        theme: 'grid',
        headStyles: { fillColor: [52, 58, 64] },
        styles: { fontSize: 9 }
    });

    // Footer
    const pageCount = doc.internal.getNumberOfPages();
    for (let i = 1; i <= pageCount; i++) {
        doc.setPage(i);
        doc.setFontSize(8);
        doc.setTextColor(150);
        doc.text(`Page ${i} of ${pageCount}`, pageWidth - 20, doc.internal.pageSize.height - 10, { align: 'right' });
        doc.text('EcoSched Admin System', 14, doc.internal.pageSize.height - 10);
    }

    // Save the PDF
    doc.save(`ecosched-report-${dateStr}.pdf`);
}

function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

function generateSensorCSV(sensors) {
    const headers = ['Bin ID', 'Address', 'Zone', 'Fill Level (%)', 'Status', 'Last Emptied'];
    const rows = sensors.map(s => [
        s.bin_id,
        `"${s.address}"`,
        s.zone,
        s.fill_level,
        s.status,
        s.last_emptied || 'N/A'
    ]);

    return [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
}

// Setup real-time subscription for sensor updates
function setupRealtimeSubscription() {
    console.log('📡 Setting up real-time analytics subscription...');

    if (sensorSubscription) {
        sensorSubscription.unsubscribe();
    }

    // Subscribe to bins table changes
    sensorSubscription = realtime.subscribeToBins((data) => {
        console.log('🔔 Real-time update: Sensor data refreshed');
        analyticsData.sensors = data;
        updateUI(); // Trigger throttled UI update
    });
}

// Export functions to global scope
window.generateReport = generateReport;
window.updateDateRange = updateDateRange;
window.toggleChartType = toggleChartType;
window.setupRealtimeSubscription = setupRealtimeSubscription;
window.updateCharts = updateCharts;