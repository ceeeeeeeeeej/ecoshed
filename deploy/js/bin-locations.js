import { supabase } from '../../config/supabase_config.js';

let map;
let markers = {};
let allBins = [];
let pendingChanges = {}; // stores bin id -> new coordinates

document.addEventListener('DOMContentLoaded', async () => {
    initMap();
    await loadBins();
    setupEventListeners();
});

function initMap() {
    map = L.map('locationMap').setView([9.0336, 126.2094], 14); // Default center Tago area

    // Google Maps Satellite layer for highly accurate visual matching
    L.tileLayer('https://mt1.google.com/vt/lyrs=s&x={x}&y={y}&z={z}', {
        maxZoom: 20,
        attribution: 'Map data &copy; <a href="https://www.google.com/maps">Google Maps</a>'
    }).addTo(map);

    // Add a street map overlay with opacity to see roads
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        opacity: 0.4
    }).addTo(map);
}

async function loadBins() {
    try {
        const { data, error } = await supabase
            .from('bins')
            .select('*')
            .order('updated_at', { ascending: false });

        if (error) throw error;
        
        allBins = data || [];
        applyFilters(); // Apply initial filter state
    } catch (err) {
        console.error('Error loading bins:', err);
        document.getElementById('binListContainer').innerHTML = `
            <div style="text-align: center; color: var(--danger); padding: 40px 0;">
                <i class="fas fa-exclamation-circle fa-2x"></i>
                <p style="margin-top: 12px;">Failed to load bins.</p>
            </div>
        `;
    }
}

function renderBinList(bins) {
    const container = document.getElementById('binListContainer');
    if (!bins || bins.length === 0) {
        container.innerHTML = `
            <div style="text-align: center; color: var(--text-muted); padding: 40px 0;">
                <p>No bins found for this selection.</p>
            </div>
        `;
        return;
    }

    container.innerHTML = bins.map(bin => {
        const binId = bin.bin_id || bin.id;
        // Check for pending changes first, then standard lat, gps fallback
        const currentCoord = pendingChanges[binId] || { 
            lat: bin.location_lat || bin.gps_lat, 
            lng: bin.location_lng || bin.gps_lng 
        };
        const hasCoords = (currentCoord.lat && currentCoord.lat != 0);

        // Calculate if online (updated within 2 mins and not inactive)
        const now = new Date();
        const lastUpdate = bin.updated_at ? new Date(bin.updated_at) : null;
        const diffMinutes = lastUpdate ? (now - lastUpdate) / 1000 / 60 : 999;
        const isOnline = diffMinutes <= 2 && bin.status !== 'inactive';
        
        const statusIndicator = isOnline 
            ? `<span style="color: #10b981; font-size: 11px; font-weight: 600;"><i class="fas fa-circle" style="font-size: 8px; vertical-align: middle; margin-right: 4px;"></i>Online</span>`
            : `<span style="color: #9ca3af; font-size: 11px; font-weight: 600;"><i class="fas fa-circle" style="font-size: 8px; vertical-align: middle; margin-right: 4px;"></i>Offline</span>`;

        return `
            <div class="bin-item" data-id="${binId}" id="bin-list-item-${binId}">
                <div class="bin-meta">
                    <div>
                        <span class="bin-id">${binId}</span>
                        <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 4px;">
                            ${statusIndicator}
                        </div>
                        <div style="margin-top: 8px;" onclick="event.stopPropagation()">
                            <input type="text" class="bin-address-input" 
                                style="width: 100%; padding: 6px 10px; border: 1px solid var(--border); border-radius: 6px; font-size: 12px; box-sizing: border-box;" 
                                data-id="${binId}" 
                                placeholder="Enter bin location..." 
                                value="${bin.address || bin.location || ''}">
                        </div>
                    </div>
                </div>
                ${hasCoords 
                    ? `<div class="coords-badge"><i class="fas fa-check-circle" style="color: var(--primary);"></i> Location Set</div>`
                    : `<div class="coords-badge missing"><i class="fas fa-exclamation-circle"></i> Needs Location</div>`
                }
            </div>
        `;
    }).join('');

    // Attach click events to jump map to bin marker
    document.querySelectorAll('.bin-item').forEach(item => {
        item.addEventListener('click', () => {
            const id = item.dataset.id;
            
            // Highlight in list
            document.querySelectorAll('.bin-item').forEach(el => el.classList.remove('active'));
            item.classList.add('active');

            // Find marker and center
            const marker = markers[id];
            if (marker) {
                map.setView(marker.getLatLng(), 18, { animate: true });
                marker.openPopup();
            } else {
                // Bin has no coord - spawn one in the center of the map
                const center = map.getCenter();
                const binRecord = allBins.find(b => (b.bin_id === id) || (b.id === id));
                if (binRecord) {
                    const newMarker = L.marker([center.lat, center.lng], {
                        icon: getBinIcon(binRecord.bin_status),
                        draggable: true
                    }).addTo(map);
                    
                    const statusHtml = '<span style="color: #9ca3af; font-weight: bold;">● Pending Save</span>';
                    newMarker.bindPopup(`<strong>${id}</strong><br>Location: ${binRecord.location || binRecord.address || binRecord.zone || 'None'}<br>Status: ${statusHtml}<br><span style="font-size: 12px; color: #666;">Drag pin to move</span>`);
                    
                    newMarker.on('dragend', function(event) {
                        const position = newMarker.getLatLng();
                        handlePositionUpdate(id, position.lat, position.lng);
                    });
                    
                    markers[id] = newMarker;
                    handlePositionUpdate(id, center.lat, center.lng); // Mark as changed immediately
                    map.setView(center, 18, { animate: true });
                    newMarker.openPopup();
                }
            }
        });
    });

    // Attach input events for the address textboxes
    document.querySelectorAll('.bin-address-input').forEach(input => {
        input.addEventListener('change', (e) => {
            const id = e.target.dataset.id;
            handleAddressUpdate(id, e.target.value);
        });
    });
}

function getBinIcon(binStatus) {
    const isFull = (binStatus || '').toLowerCase() === 'full';
    const color = isFull ? '#ef4444' : '#10b981';
    
    return L.divIcon({
        className: 'custom-bin-marker',
        html: `
            <div style="background: ${color}; width: 32px; height: 32px; border-radius: 50%; border: 3px solid white; box-shadow: 0 2px 5px rgba(0,0,0,0.3); display: flex; align-items: center; justify-content: center; color: white;">
                <i class="fas fa-trash-alt" style="font-size: 14px;"></i>
            </div>
            <div style="position: absolute; bottom: -12px; left: 50%; transform: translateX(-50%); width: 0; height: 0; border-left: 8px solid transparent; border-right: 8px solid transparent; border-top: 12px solid ${color};"></div>
        `,
        iconSize: [32, 44],
        iconAnchor: [16, 44],
        popupAnchor: [0, -44]
    });
}

function renderMapMarkers(bins) {
    // Clear existing markers
    Object.values(markers).forEach(m => map.removeLayer(m));
    markers = {};

    let bounds = [];

    bins.forEach(bin => {
        const binId = bin.bin_id || bin.id;

        const now = new Date();
        const lastUpdate = bin.updated_at ? new Date(bin.updated_at) : null;
        const diffMinutes = lastUpdate ? (now - lastUpdate) / 1000 / 60 : 999;
        const isOnline = diffMinutes <= 2 && bin.status !== 'inactive';

        const currentCoord = pendingChanges[binId] || { 
            lat: bin.location_lat || bin.gps_lat, 
            lng: bin.location_lng || bin.gps_lng 
        };
        
        if (currentCoord.lat && currentCoord.lng && parseFloat(currentCoord.lat) !== 0) {
            const lat = parseFloat(currentCoord.lat);
            const lng = parseFloat(currentCoord.lng);
            
            const marker = L.marker([lat, lng], {
                icon: getBinIcon(bin.bin_status),
                draggable: true // Allow admin to manually drag pins whenever necessary
            }).addTo(map);

            const statusHtml = isOnline 
                ? '<span style="color: #10b981; font-weight: bold;">● Online</span>' 
                : '<span style="color: #9ca3af; font-weight: bold;">● Offline</span>';

            marker.bindPopup(`<strong>${binId}</strong><br>Location: ${bin.location || bin.address || bin.zone || 'None'}<br>Status: ${statusHtml}<br><span style="font-size: 12px; color: #666;">Drag pin to move</span>`);
            
            // Handle marker drag completion
            marker.on('dragend', function(event) {
                const position = marker.getLatLng();
                handlePositionUpdate(binId, position.lat, position.lng);
            });

            markers[binId] = marker;
            bounds.push([lat, lng]);
        }
    });

    // Fit map to markers if there are any and no pending changes
    if (bounds.length > 0 && Object.keys(pendingChanges).length === 0) {
        map.fitBounds(bounds, { padding: [50, 50] });
    }
}

function handlePositionUpdate(binId, lat, lng) {
    if (!pendingChanges[binId]) {
        const bin = allBins.find(b => (b.bin_id === binId) || (b.id === binId));
        pendingChanges[binId] = { 
            lat: lat, lng: lng, 
            address: bin ? (bin.address || bin.location || '') : ''
        };
    } else {
        pendingChanges[binId].lat = lat;
        pendingChanges[binId].lng = lng;
    }
    
    markAsModified(binId, 'Location Edited');
}

function handleAddressUpdate(binId, address) {
    if (!pendingChanges[binId]) {
        const bin = allBins.find(b => (b.bin_id === binId) || (b.id === binId));
        pendingChanges[binId] = { 
            lat: bin ? (bin.location_lat || bin.gps_lat) : null,
            lng: bin ? (bin.location_lng || bin.gps_lng) : null,
            address: address
        };
    } else {
        pendingChanges[binId].address = address;
    }

    markAsModified(binId, 'Address Edited');
}

function markAsModified(binId, label) {
    // Enable save button
    const saveBtn = document.getElementById('saveLocationsBtn');
    saveBtn.style.opacity = '1';
    saveBtn.style.pointerEvents = 'auto';
    
    // Update list UI to show modification state if necessary
    const binItem = document.getElementById(`bin-list-item-${binId}`);
    if (binItem) {
        let badge = binItem.querySelector('.coords-badge');
        if (!badge) {
            badge = document.createElement('div');
            badge.className = 'coords-badge';
            binItem.appendChild(badge);
        }
        badge.className = 'coords-badge modified';
        badge.style.borderColor = 'var(--warning)';
        badge.style.color = 'var(--warning)';
        badge.innerHTML = `<i class="fas fa-edit"></i> ${label}`;
    }
}

function applyFilters() {
    const zone = document.getElementById('zoneFilter').value.toLowerCase();
    const searchQuery = document.getElementById('binSearchInput').value.toLowerCase().trim();
    
    let filteredPins = allBins;
    
    if (zone !== 'all') {
        filteredPins = filteredPins.filter(b => {
            const z = (b.zone || '').toLowerCase();
            const addr = (b.location || b.address || '').toLowerCase();
            const id = (b.bin_id || b.id || '').toLowerCase();
            return z.includes(zone) || addr.includes(zone) || id.includes(zone);
        });
    }
    
    if (searchQuery) {
        filteredPins = filteredPins.filter(b => {
            const id = (b.bin_id || b.id || '').toLowerCase();
            const z = (b.zone || '').toLowerCase();
            const address = (b.location || b.address || '').toLowerCase();
            return id.includes(searchQuery) || z.includes(searchQuery) || address.includes(searchQuery);
        });
    }

    renderBinList(filteredPins);
    renderMapMarkers(filteredPins);
}

function setupEventListeners() {
    // Search input
    document.getElementById('binSearchInput').addEventListener('input', applyFilters);

    // Zone filter
    document.getElementById('zoneFilter').addEventListener('change', applyFilters);

    // Save Button
        document.getElementById('saveLocationsBtn').addEventListener('click', async () => {
        const idsToUpdate = Object.keys(pendingChanges);
        if (idsToUpdate.length === 0) return;
        
        const saveBtn = document.getElementById('saveLocationsBtn');
        const originalText = saveBtn.innerHTML;
        saveBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Saving...';
        saveBtn.style.pointerEvents = 'none';

        const currentFilterZone = document.getElementById('zoneFilter').value.toLowerCase();

        try {
            // Processing updates securely
            for (const id of idsToUpdate) {
                const pos = pendingChanges[id];
                const binRecord = allBins.find(b => (b.bin_id === id) || (b.id === id));
                if (!binRecord) continue;

                // Build update payload
                const payload = { 
                    updated_at: new Date().toISOString()
                };

                // Tag with zone if we are in a specific zone view
                if (currentFilterZone !== 'all') {
                    payload.zone = currentFilterZone;
                } else if (!binRecord.zone) {
                    // Try to guess from address if missing
                    const addr = (pos.address || binRecord.address || '').toLowerCase();
                    if (addr.includes('victoria')) payload.zone = 'victoria';
                    else if (addr.includes('dayo-an') || addr.includes('dayo-ay')) payload.zone = 'dayo-an';
                    else if (addr.includes('mahayag')) payload.zone = 'mahayag';
                }
                
                if (pos.lat !== undefined && pos.lat !== null) {
                    payload.location_lat = pos.lat;
                    payload.gps_lat = pos.lat;
                }
                if (pos.lng !== undefined && pos.lng !== null) {
                    payload.location_lng = pos.lng;
                    payload.gps_lng = pos.lng;
                }
                if (pos.address !== undefined) {
                    payload.address = pos.address;
                }

                await supabase
                    .from('bins')
                    .update(payload)
                    .eq(binRecord.bin_id ? 'bin_id' : 'id', id);
            }
            
            alert('Bin locations successfully updated!');
            pendingChanges = {}; // Clear
            
            // Reset UI
            saveBtn.innerHTML = '<i class="fas fa-check"></i> Saved';
            setTimeout(() => {
                saveBtn.innerHTML = '<i class="fas fa-save" style="margin-right: 6px;"></i> Save Changes';
                saveBtn.style.opacity = '0.5';
            }, 2000);
            
            await loadBins(); // Reload
            
        } catch (error) {
            console.error('Save error:', error);
            alert('Failed to save locations. Please try again.');
            saveBtn.innerHTML = originalText;
            saveBtn.style.pointerEvents = 'auto';
        }
    });
}
