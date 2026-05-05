import { supabase, dbService, realtime, utils } from '../../config/supabase_config.js';

console.log('🗑️ Bins dashboard module loading...');

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
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}

async function init() {
    console.log('🗑️ Bins dashboard initializing...');
    telemetryTimestampEl = document.getElementById('telemetryTimestamp');
    
    setupEventListeners();
    await loadInitialData();
    initializeSensorMap();
    setupRealtimeListener();
}

async function loadInitialData() {
    try {
        console.log('📥 Loading initial bin data...');
        const { data, error } = await dbService.getBins();
        
        if (error) throw error;
        
        allBins = data || [];
        renderDashboard();
        refreshTelemetryTimestamp('Initial load');
    } catch (error) {
        console.error('❌ Error loading bins:', error);
        utils.showNotification('Failed to load bin data', 'error');
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

function setupEventListeners() {
    // Search input
    const searchInput = document.getElementById('binSearch');
    if (searchInput) {
        searchInput.addEventListener('input', (e) => {
            applyFilters(e.target.value);
        });
    }

    // Filter buttons
    const filterButtons = document.querySelectorAll('.filter-btn');
    filterButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            filterButtons.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            currentFilter = btn.dataset.filter;
            applyFilters(document.getElementById('binSearch')?.value);
        });
    });

    // Check for filters from other pages (like analytics)
    const pendingFilter = sessionStorage.getItem('sensorFilter');
    if (pendingFilter) {
        sessionStorage.removeItem('sensorFilter');
        currentFilter = pendingFilter;
        
        // Update active class on filter buttons
        filterButtons.forEach(btn => {
            if (btn.dataset.filter === pendingFilter) {
                btn.classList.add('active');
            } else {
                btn.classList.remove('active');
            }
        });
    }

    // Add bin button
    const addBinBtn = document.getElementById('addBinBtn');
    if (addBinBtn) {
        addBinBtn.addEventListener('click', () => {
            utils.showNotification('Bin registration feature coming soon', 'info');
        });
    }
}

function applyFilters(searchQuery = '') {
    const query = searchQuery.toLowerCase().trim();
    
    filteredBins = allBins.filter(bin => {
        // Apply status/fill level filter
        let statusMatch = true;
        if (currentFilter === 'active') {
            statusMatch = bin.status === 'active';
        } else if (currentFilter === 'critical') {
            statusMatch = (bin.fill_level || 0) >= 80 || (bin.bin_status || '').toLowerCase() === 'full';
        }

        // Apply search query
        const idMatch = (bin.bin_id || '').toLowerCase().includes(query);
        const zoneMatch = (bin.zone || '').toLowerCase().includes(query);
        const addressMatch = (bin.address || '').toLowerCase().includes(query);
        
        return statusMatch && (idMatch || zoneMatch || addressMatch);
    });

    renderBinsList();
    updateStats();
    updateMapMarkers();
}

function renderDashboard() {
    applyFilters(document.getElementById('binSearch')?.value);
}

function updateStats() {
    const totalBinsEl = document.getElementById('totalBins');
    const criticalBinsEl = document.getElementById('criticalBins');
    const averageFillEl = document.getElementById('averageFill');

    if (totalBinsEl) totalBinsEl.textContent = allBins.length;
    
    if (criticalBinsEl) {
        const criticalCount = allBins.filter(b => (b.fill_level || 0) >= 80 || (b.bin_status || '').toLowerCase() === 'full').length;
        criticalBinsEl.textContent = criticalCount;
    }
    
    if (averageFillEl) {
        const avg = allBins.length > 0 
            ? Math.round(allBins.reduce((sum, b) => sum + (b.fill_level || 0), 0) / allBins.length) 
            : 0;
        averageFillEl.textContent = `${avg}%`;
    }
}

function renderBinsList() {
    const binGrid = document.getElementById('binGrid');
    if (!binGrid) return;

    if (filteredBins.length === 0) {
        binGrid.innerHTML = `
            <div class="col-span-full py-12 text-center text-gray-500">
                <i class="fas fa-search fa-3x mb-4 opacity-20"></i>
                <p>No bins match your current filters.</p>
            </div>
        `;
        return;
    }

    binGrid.innerHTML = filteredBins.map(bin => {
        const fillLevel = bin.fill_level || 0;
        const isCritical = fillLevel >= 80 || (bin.bin_status || '').toLowerCase() === 'full';
        const batteryLevel = bin.battery_level !== undefined ? bin.battery_level : (bin.battery !== undefined ? bin.battery : 100);
        
        // Progress bar color
        let colorClass = 'bg-green-500';
        if (fillLevel >= 80) colorClass = 'bg-red-500';
        else if (fillLevel >= 60) colorClass = 'bg-orange-500';
        else if (fillLevel >= 40) colorClass = 'bg-yellow-500';

        // Online status
        const now = new Date();
        const lastUpdate = bin.updated_at ? new Date(bin.updated_at) : null;
        const diffMinutes = lastUpdate ? (now - lastUpdate) / 1000 / 60 : 999;
        const isOnline = diffMinutes <= 2 && bin.status !== 'inactive';

        return `
            <div class="bin-card ${isCritical ? 'critical' : ''} bg-white p-5 rounded-xl border border-gray-100 shadow-sm transition-all duration-300 hover:shadow-md">
                <div class="flex justify-between items-start mb-4">
                    <div>
                        <h3 class="font-bold text-gray-900 text-lg">${bin.bin_id || 'Unnamed Bin'}</h3>
                        <p class="text-xs text-gray-500"><i class="fas fa-map-marker-alt mr-1"></i> ${bin.zone || 'N/A'}</p>
                    </div>
                    <div class="flex flex-col items-end">
                        <span class="status-badge ${isOnline ? 'online' : 'offline'} mb-2">
                            ${isOnline ? 'Online' : 'Offline'}
                        </span>
                        <div class="flex items-center text-xs ${batteryLevel < 20 ? 'text-red-500 font-bold' : 'text-gray-400'}">
                            <i class="fas fa-battery-${batteryLevel < 20 ? 'quarter' : 'full'} mr-1"></i>
                            ${batteryLevel}%
                        </div>
                    </div>
                </div>

                <div class="mb-5">
                    <div class="flex justify-between text-sm mb-2">
                        <span class="text-gray-600 font-medium">Fill Level</span>
                        <span class="font-bold ${isCritical ? 'text-red-600' : 'text-gray-900'}">${fillLevel}%</span>
                    </div>
                    <div class="w-full bg-gray-100 rounded-full h-2.5 overflow-hidden">
                        <div class="${colorClass} h-full transition-all duration-1000" style="width: ${fillLevel}%"></div>
                    </div>
                </div>

                <div class="grid grid-cols-2 gap-3 mb-4">
                    <div class="bg-gray-50 p-2 rounded-lg text-center">
                        <p class="text-[10px] text-gray-400 uppercase font-bold tracking-wider">Last Sync</p>
                        <p class="text-xs text-gray-700 font-semibold">${lastUpdate ? lastUpdate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Never'}</p>
                    </div>
                    <div class="bg-gray-50 p-2 rounded-lg text-center">
                        <p class="text-[10px] text-gray-400 uppercase font-bold tracking-wider">Waste Type</p>
                        <p class="text-xs text-gray-700 font-semibold">${bin.waste_type || 'General'}</p>
                    </div>
                </div>

                <div class="flex gap-2">
                    <button onclick="viewBinDetails('${bin.id}')" class="flex-1 py-2 px-3 bg-indigo-50 text-indigo-600 rounded-lg text-xs font-bold hover:bg-indigo-100 transition-colors">
                        <i class="fas fa-chart-line mr-1"></i> Details
                    </button>
                    <button onclick="centerOnMap('${bin.id}')" class="py-2 px-3 bg-gray-50 text-gray-600 rounded-lg text-xs font-bold hover:bg-gray-100 transition-colors">
                        <i class="fas fa-location-arrow"></i>
                    </button>
                </div>
            </div>
        `;
    }).join('');
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
            const isFull = (bin.bin_status || '').toLowerCase() === 'full' || (bin.fill_level || 0) >= 80;
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
                Fill Level: ${bin.fill_level}%
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

function refreshTelemetryTimestamp(source = 'System') {
    if (telemetryTimestampEl) {
        const now = new Date();
        telemetryTimestampEl.textContent = `Last update: ${now.toLocaleTimeString()} (${source})`;
    }
}

// Global scope functions for buttons
window.viewBinDetails = function(id) {
    const bin = allBins.find(b => b.id === id);
    if (bin) {
        utils.showNotification(`Viewing details for ${bin.bin_id}`, 'info');
        // Implementation for details modal or navigation
    }
};

window.centerOnMap = function(id) {
    const bin = allBins.find(b => b.id === id);
    if (bin && bin.location_lat && bin.location_lng && sensorMap) {
        sensorMap.setView([bin.location_lat, bin.location_lng], 18, { animate: true });
        
        // Find and open popup
        markersLayer.eachLayer(layer => {
            if (layer.getPopup().getContent().includes(bin.bin_id)) {
                layer.openPopup();
            }
        });

        // Scroll map into view if on mobile
        document.getElementById('sensorMap').scrollIntoView({ behavior: 'smooth' });
    } else {
        utils.showNotification('No GPS data for this bin', 'warning');
    }
};

window.applyFilters = applyFilters;
