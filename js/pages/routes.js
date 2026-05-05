// Routes Page JavaScript
import { dbService, realtime, utils } from '../../config/supabase_config.js';

// Global variables
const AREA_MAP = {
    'victoria': 'Victoria',
    'dayo-an': 'Dayo-An'
};

let allRoutes = [];
let filteredRoutes = [];
let availableCollectors = [];

function formatArea(areaKey) {
    if (!areaKey) return 'Unassigned';
    const normalizedKey = areaKey.toLowerCase();
    if (AREA_MAP[normalizedKey]) {
        return AREA_MAP[normalizedKey];
    }
    return normalizedKey
        .split('-')
        .map(part => part.charAt(0).toUpperCase() + part.slice(1))
        .join(' ');
}

// Initialize the page
document.addEventListener('DOMContentLoaded', function () {
    console.log('Routes page loaded');
    initializeRoutesPage();
});

// Initialize routes page
function initializeRoutesPage() {
    // Load routes from Firebase
    loadRoutesFromFirebase();

    // Set up event listeners
    setupEventListeners();

    // Update stats
    updateRouteStats();

    // Load available collectors for route assignment
    loadAvailableCollectorsForRoutes();

    // Keep collector list in sync in realtime
    if (realtime && realtime.subscribeToCollectors) {
        realtime.subscribeToCollectors((collectors) => {
            if (Array.isArray(collectors)) {
                applyCollectorsToDropdown(collectors);
            }
        });
    }
}

function openViewRouteModal() {
    const modal = document.getElementById('viewRouteModal');
    if (modal) {
        modal.classList.add('show');
    }
}

function closeViewRouteModal() {
    const modal = document.getElementById('viewRouteModal');
    if (modal) {
        modal.classList.remove('show');
    }
}

function openEditRouteModal() {
    const modal = document.getElementById('editRouteModal');
    if (modal) {
        modal.classList.add('show');
    }
}

function closeEditRouteModal() {
    const modal = document.getElementById('editRouteModal');
    if (modal) {
        modal.classList.remove('show');
        currentEditRouteId = null;
    }
}

// Load available collectors from Firestore and populate the dropdown
async function loadAvailableCollectorsForRoutes() {
    try {
        if (dbService && dbService.getCollectors) {
            const { data, error } = await dbService.getCollectors();
            if (error) throw error;
            const collectors = data || [];
            applyCollectorsToDropdown(collectors);
        }
    } catch (error) {
        console.error('Error loading collectors for routes:', error);
    }
}

// Apply a list of collectors to the Assigned Collector select field,
// showing only those with status === 'available' and labeling with
// collector ID + driver name when present.
function applyCollectorsToDropdown(collectors) {
    const addSelect = document.getElementById('collector');
    const editSelect = document.getElementById('editCollector');

    // Only allow collectors that are available AND have a linked collector account (driverUserId)
    availableCollectors = (collectors || []).filter(c => {
        const status = (c.status || '').toLowerCase();
        const hasDriver = !!c.driverUserId;
        return status === 'available' && hasDriver;
    });

    const selects = [addSelect, editSelect].filter(Boolean);
    if (selects.length === 0) return;

    selects.forEach((selectEl) => {
        // Reset options
        selectEl.innerHTML = '';

        const placeholder = document.createElement('option');
        placeholder.value = '';
        placeholder.textContent = 'Select Collector';
        selectEl.appendChild(placeholder);

        if (availableCollectors.length === 0) {
            const emptyOpt = document.createElement('option');
            emptyOpt.value = '';
            emptyOpt.textContent = 'No available collectors';
            emptyOpt.disabled = true;
            selectEl.appendChild(emptyOpt);
            return;
        }

        availableCollectors.forEach((collector) => {
            const option = document.createElement('option');
            const idLabel = collector.collectorId || collector.id || '';
            const driverLabel = collector.driverName || collector.name || 'Unnamed Driver';

            // Use a friendly label for the route's collector field
            option.value = `${idLabel ? idLabel + ' - ' : ''}${driverLabel}`;
            option.textContent = option.value;
            selectEl.appendChild(option);
        });
    });
}

// Helper: find a collector object based on the label used in the dropdown
function findCollectorByLabel(label) {
    if (!label || !Array.isArray(availableCollectors)) return null;
    return availableCollectors.find((collector) => {
        const idLabel = collector.collectorId || collector.id || '';
        const driverLabel = collector.driverName || collector.name || 'Unnamed Driver';
        const optionLabel = `${idLabel ? idLabel + ' - ' : ''}${driverLabel}`;
        return optionLabel === label;
    });
}

// When a route is assigned to a collector, mark that collector as on-route
async function markCollectorAsAssigned(collectorLabel) {
    const collector = findCollectorByLabel(collectorLabel);
    if (!collector || !(dbService && dbService.updateCollector)) return;

    try {
        await dbService.updateCollector(collector.id, { status: 'on-route' });
    } catch (error) {
        console.error('Error updating collector status to on-route:', error);
    }
}

// Set up event listeners
function setupEventListeners() {
    // Search functionality
    const searchInput = document.getElementById('routeSearch');
    if (searchInput) {
        searchInput.addEventListener('input', debounce(handleSearch, 300));
    }

    // Filter functionality
    const statusFilter = document.getElementById('statusFilter');
    const areaFilter = document.getElementById('areaFilter');

    if (statusFilter) {
        statusFilter.addEventListener('change', handleFilter);
    }

    if (areaFilter) {
        areaFilter.addEventListener('change', handleFilter);
    }

    // Add route form
    const addRouteForm = document.getElementById('addRouteForm');
    if (addRouteForm) {
        addRouteForm.addEventListener('submit', handleAddRoute);
    }

    const editRouteForm = document.getElementById('editRouteForm');
    if (editRouteForm) {
        editRouteForm.addEventListener('submit', handleEditRoute);
    }
}

// Load routes from Firebase
async function loadRoutesFromFirebase() {
    try {
        console.log('Loading routes from Firebase...');

        if (dbService && dbService.getRoutes) {
            const { data: routes, error } = await dbService.getRoutes();

            if (error) {
                throw error;
            }

            allRoutes = routes || [];
            filteredRoutes = [...allRoutes];

            console.log(`Loaded ${allRoutes.length} routes`);
        } else {
            // Fallback mock data
            console.warn('Database service not available, using mock data');
            allRoutes = generateMockRoutes();
            filteredRoutes = [...allRoutes];
        }

        // Update UI
        renderRoutesTable();
        updateRouteStats();

        // Set up real-time listener
        if (realtime && realtime.subscribeToWasteRoutes) {
            realtime.subscribeToWasteRoutes((routes) => {
                allRoutes = routes || [];
                filteredRoutes = [...allRoutes];
                renderRoutesTable();
                updateRouteStats();
            });
        }

    } catch (error) {
        console.error('Error loading routes:', error);
        showNotification('Failed to load routes', 'error');

        // Show mock data on error
        allRoutes = generateMockRoutes();
        filteredRoutes = [...allRoutes];
        renderRoutesTable();
        updateRouteStats();
    }
}

// Generate mock routes for demo
function generateMockRoutes() {
    const statuses = ['scheduled', 'in-progress', 'completed', 'delayed'];
    const areas = Object.keys(AREA_MAP);
    const collectors = ['Collector #01', 'Collector #02', 'Collector #03', 'Collector #04', 'Collector #05'];

    return Array.from({ length: 20 }, (_, i) => {
        const areaKey = areas[i % areas.length];
        const areaLabel = AREA_MAP[areaKey];
        return {
            id: `route_${i + 1}`,
            name: `${areaLabel} Route ${String.fromCharCode(65 + i)}`,
            area: areaKey,
            status: statuses[Math.floor(Math.random() * statuses.length)],
            collector: collectors[Math.floor(Math.random() * collectors.length)],
            progress: Math.floor(Math.random() * 100),
            eta: i % 4 === 0 ? '45 min' : i % 4 === 1 ? '2.5 hours' : i % 4 === 2 ? 'Completed' : 'Delayed',
            startTime: formatTimeLabel(`${8 + Math.floor(Math.random() * 8)}:${String(Math.floor(Math.random() * 60)).padStart(2, '0')}`),
            estimatedDuration: Math.floor(Math.random() * 6) + 2,
            createdAt: new Date(Date.now() - Math.random() * 7 * 24 * 60 * 60 * 1000)
        };
    });
}

// Handle search
function handleSearch(e) {
    const searchTerm = e.target.value.toLowerCase().trim();

    if (searchTerm === '') {
        filteredRoutes = [...allRoutes];
    } else {
        filteredRoutes = allRoutes.filter(route =>
            route.name.toLowerCase().includes(searchTerm) ||
            route.area.toLowerCase().includes(searchTerm) ||
            route.collector.toLowerCase().includes(searchTerm)
        );
    }

    renderRoutesTable();
}

// Handle filter
function handleFilter() {
    const statusFilter = document.getElementById('statusFilter').value;
    const areaFilter = document.getElementById('areaFilter').value;

    filteredRoutes = allRoutes.filter(route => {
        const statusMatch = !statusFilter || route.status === statusFilter;
        const areaMatch = !areaFilter || route.area === areaFilter;
        return statusMatch && areaMatch;
    });

    renderRoutesTable();
}

// Reset filters
function resetFilters() {
    document.getElementById('routeSearch').value = '';
    document.getElementById('statusFilter').value = '';
    document.getElementById('areaFilter').value = '';

    filteredRoutes = [...allRoutes];
    renderRoutesTable();
}

// Update route stats
function updateRouteStats() {
    const totalRoutes = allRoutes.length;
    const completedRoutes = allRoutes.filter(r => r.status === 'completed').length;
    const inProgressRoutes = allRoutes.filter(r => r.status === 'in-progress').length;
    const delayedRoutes = allRoutes.filter(r => r.status === 'delayed').length;

    document.getElementById('totalRoutes').textContent = totalRoutes;
    document.getElementById('completedRoutes').textContent = completedRoutes;
    document.getElementById('inProgressRoutes').textContent = inProgressRoutes;
    document.getElementById('delayedRoutes').textContent = delayedRoutes;

    // Update route count in table header
    const routeCountElement = document.getElementById('routeCount');
    if (routeCountElement) {
        routeCountElement.textContent = `${filteredRoutes.length} routes`;
    }
}

// Render routes table
function renderRoutesTable() {
    const tbody = document.getElementById('routesTableBody');
    if (!tbody) return;

    tbody.innerHTML = '';

    if (filteredRoutes.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="7" class="text-center">
                    <div class="empty-state">
                        <i class="fas fa-route" style="font-size: 3rem; color: #d1d5db; margin-bottom: 1rem;"></i>
                        <p>No routes found</p>
                        <p style="color: #6b7280; font-size: 0.875rem;">Try adjusting your search or filters</p>
                    </div>
                </td>
            </tr>
        `;
        return;
    }

    filteredRoutes.forEach(route => {
        const row = createRouteRow(route);
        tbody.appendChild(row);
    });
}

// Create route row
function createRouteRow(route) {
    const row = document.createElement('tr');

    const progressBar = route.status === 'in-progress' ? `
        <div class="progress-container">
            <div class="progress-bar">
                <div class="progress-fill" style="width: ${route.progress}%"></div>
            </div>
            <span class="progress-text">${route.progress}%</span>
        </div>
    ` : route.status === 'completed' ? '100%' : '0%';

    row.innerHTML = `
        <td>
            <div class="route-info">
                <div class="route-name">${route.name}</div>
                <div class="route-time">${route.startTime} - ${route.estimatedDuration}h</div>
            </div>
        </td>
        <td>
            <span class="area-badge ${route.area}">${formatArea(route.area)}</span>
        </td>
        <td>
            <span class="status-badge ${route.status}">${route.status.replace('-', ' ')}</span>
        </td>
        <td>${route.collector}</td>
        <td>${progressBar}</td>
        <td>${route.eta}</td>
        <td>
            <div class="action-buttons">
                <button class="action-icon action-view" onclick="viewRoute('${route.id}')" title="View">
                    <i class="fas fa-eye"></i>
                </button>
                <button class="action-icon action-edit" onclick="editRoute('${route.id}')" title="Edit">
                    <i class="fas fa-edit"></i>
                </button>
                <button class="action-icon action-delete" onclick="deleteRoute('${route.id}')" title="Delete">
                    <i class="fas fa-trash"></i>
                </button>
            </div>
        </td>
    `;
    return row;
}

// Modal functions
let currentEditRouteId = null;
function openAddRouteModal() {
    const modal = document.getElementById('addRouteModal');
    if (modal) {
        modal.classList.add('show');
    }
}

function closeAddRouteModal() {
    const modal = document.getElementById('addRouteModal');
    if (modal) {
        modal.classList.remove('show');
        // Reset form
        const form = modal.querySelector('.modal-form');
        if (form) {
            form.reset();
        }
    }
}

// Handle add route form submission
async function handleAddRoute(e) {
    e.preventDefault();

    const formData = new FormData(e.target);
    const routeData = {
        name: formData.get('routeName'),
        area: formData.get('area'),
        collector: formData.get('collector'),
        startTime: formData.get('startTime'),
        estimatedDuration: parseInt(formData.get('estimatedDuration')),
        description: formData.get('description'),
        status: 'scheduled',
        progress: 0
    };

    // Validate form
    if (!routeData.name || !routeData.area || !routeData.collector || !routeData.startTime || !routeData.estimatedDuration) {
        showNotification('Please fill in all required fields', 'error');
        return;
    }

    const assignedCollector = findCollectorByLabel(routeData.collector);
    if (assignedCollector) {
        routeData.assignedCollectorId = assignedCollector.id;
        routeData.assignedCollectorUserId = assignedCollector.driverUserId || assignedCollector.uid || null;
    }

    try {
        // Add route to Firebase
        if (dbService && dbService.createRoute) {
            const { data, error } = await dbService.createRoute(routeData);

            if (error) {
                throw error;
            }

            // Merge freshly created route into local state without requiring a refresh
            if (data) {
                const normalizedRoute = {
                    id: data.id || `route_${Date.now()}`,
                    ...routeData,
                    eta: `${routeData.estimatedDuration} hours`,
                    createdAt: new Date()
                };
                allRoutes.unshift(normalizedRoute);
                filteredRoutes = [...allRoutes];
            }
        } else {
            // Mock route creation
            const newRoute = {
                id: `route_${Date.now()}`,
                ...routeData,
                eta: `${routeData.estimatedDuration} hours`,
                createdAt: new Date()
            };
            allRoutes.unshift(newRoute);
            filteredRoutes = [...allRoutes];
        }

        // Mark assigned collector as on-route (no longer available)
        if (routeData.collector) {
            markCollectorAsAssigned(routeData.collector);
        }

        // Show success message
        showNotification('Route created successfully!', 'success');

        // Close modal
        closeAddRouteModal();

        // Refresh the table
        renderRoutesTable();
        updateRouteStats();

    } catch (error) {
        console.error('Error creating route:', error);
        showNotification('Failed to create route. Please try again.', 'error');
    }
}

// Route actions
function viewRoute(routeId) {
    const route = allRoutes.find(r => r.id === routeId);
    if (route) {
        document.getElementById('viewRouteName').textContent = route.name || '—';
        document.getElementById('viewArea').textContent = formatArea(route.area) || '—';
        document.getElementById('viewStatus').textContent = (route.status || '—').replace('-', ' ');
        document.getElementById('viewCollector').textContent = route.collector || 'Unassigned';
        document.getElementById('viewEta').textContent = route.eta || `${route.estimatedDuration || 0} hours`;
        document.getElementById('viewStartTime').textContent = route.startTime || '—';
        document.getElementById('viewEstimatedDuration').textContent = route.estimatedDuration || '—';
        document.getElementById('viewDescription').textContent = route.description || '—';
        openViewRouteModal();
    }
}

function editRoute(routeId) {
    const route = allRoutes.find(r => r.id === routeId);
    if (route) {
        currentEditRouteId = routeId;
        document.getElementById('editRouteName').value = route.name || '';
        document.getElementById('editArea').value = route.area || '';
        document.getElementById('editStartTime').value = route.startTime || '';
        document.getElementById('editEstimatedDuration').value = route.estimatedDuration || '';
        document.getElementById('editDescription').value = route.description || '';

        // Try to select the existing collector label if present
        const editCollectorSelect = document.getElementById('editCollector');
        if (editCollectorSelect) {
            editCollectorSelect.value = route.collector || '';
        }

        openEditRouteModal();
    }
}

async function handleEditRoute(e) {
    e.preventDefault();
    if (!currentEditRouteId) {
        showNotification('No route selected for editing', 'error');
        return;
    }

    const formData = new FormData(e.target);
    const updates = {
        name: formData.get('editRouteName'),
        area: formData.get('editArea'),
        collector: formData.get('editCollector'),
        startTime: formData.get('editStartTime'),
        estimatedDuration: parseInt(formData.get('editEstimatedDuration')),
        description: formData.get('editDescription')
    };

    const assignedCollector = findCollectorByLabel(updates.collector);
    if (assignedCollector) {
        updates.assignedCollectorId = assignedCollector.id;
        updates.assignedCollectorUserId = assignedCollector.driverUserId || assignedCollector.uid || null;
    }

    if (!updates.name || !updates.area || !updates.collector || !updates.startTime || !updates.estimatedDuration) {
        showNotification('Please fill in all required fields', 'error');
        return;
    }

    try {
        if (dbService && dbService.updateRoute) {
            const { error } = await dbService.updateRoute(currentEditRouteId, updates);
            if (error) throw error;
        }

        allRoutes = allRoutes.map(route =>
            route.id === currentEditRouteId
                ? { ...route, ...updates, eta: `${updates.estimatedDuration} hours` }
                : route
        );
        filteredRoutes = [...allRoutes];

        // Mark assigned collector as on-route (no longer available)
        if (updates.collector) {
            markCollectorAsAssigned(updates.collector);
        }

        showNotification('Route updated successfully!', 'success');
        closeEditRouteModal();
        renderRoutesTable();
        updateRouteStats();
    } catch (error) {
        console.error('Error updating route:', error);
        showNotification('Failed to update route. Please try again.', 'error');
    }
}

async function deleteRoute(routeId) {
    const route = allRoutes.find(r => r.id === routeId);
    if (!route) return;

    if (confirm(`Are you sure you want to delete route "${route.name}"?`)) {
        try {
            if (dbService && dbService.deleteRoute) {
                const { error } = await dbService.deleteRoute(routeId);

                if (error) {
                    throw error;
                }
            } else {
                // Mock deletion
                allRoutes = allRoutes.filter(r => r.id !== routeId);
                filteredRoutes = [...allRoutes];
            }

            showNotification('Route deleted successfully!', 'success');

            // Refresh the table
            renderRoutesTable();
            updateRouteStats();

        } catch (error) {
            console.error('Error deleting route:', error);
            showNotification('Failed to delete route', 'error');
        }
    }
}

// Bulk actions
function optimizeAllRoutes() {
    showNotification('Route optimization started...', 'info');
    // Implement route optimization logic
    setTimeout(() => {
        showNotification('Routes optimized successfully!', 'success');
    }, 2000);
}

function exportRoutes() {
    showNotification('Exporting routes...', 'info');
    // Implement route export logic
    setTimeout(() => {
        showNotification('Routes exported successfully!', 'success');
    }, 1500);
}

// Utility functions
function formatTimeLabel(timeStr) {
    if (!timeStr) return '—';
    if (timeStr.includes('AM') || timeStr.includes('PM')) return timeStr;
    
    try {
        const parts = timeStr.split(':');
        const hour = parseInt(parts[0], 10);
        const minute = parseInt(parts[1], 10);
        
        if (isNaN(hour) || isNaN(minute)) return timeStr;
        
        const ampm = hour >= 12 ? 'PM' : 'AM';
        const h12 = hour % 12 || 12;
        return `${h12.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')} ${ampm}`;
    } catch (e) {
        return timeStr;
    }
}

function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

// Notification system
function showNotification(message, type = 'info') {
    // Remove existing notifications
    const existingNotifications = document.querySelectorAll('.notification');
    existingNotifications.forEach(notification => notification.remove());

    // Create notification element
    const notification = document.createElement('div');
    notification.className = `notification notification-${type}`;
    notification.innerHTML = `
        <div class="notification-content">
            <i class="fas fa-${getNotificationIcon(type)}"></i>
            <span>${message}</span>
        </div>
    `;

    // Add styles
    notification.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        background: ${getNotificationColor(type)};
        color: white;
        padding: 12px 16px;
        border-radius: 8px;
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
        z-index: 3000;
        animation: slideIn 0.3s ease;
    `;

    document.body.appendChild(notification);

    // Auto remove after 3 seconds
    setTimeout(() => {
        notification.style.animation = 'slideOut 0.3s ease';
        setTimeout(() => {
            if (notification.parentNode) {
                notification.parentNode.removeChild(notification);
            }
        }, 300);
    }, 3000);
}

// Get notification icon
function getNotificationIcon(type) {
    const icons = {
        'success': 'check-circle',
        'error': 'exclamation-circle',
        'warning': 'exclamation-triangle',
        'info': 'info-circle'
    };
    return icons[type] || 'info-circle';
}

// Get notification color
function getNotificationColor(type) {
    const colors = {
        'success': '#10b981',
        'error': '#ef4444',
        'warning': '#f59e0b',
        'info': '#3b82f6'
    };
    return colors[type] || '#3b82f6';
}

// Add CSS animations and styles
const notificationStyles = document.createElement('style');
notificationStyles.textContent = `
    @keyframes slideIn {
        from {
            transform: translateX(100%);
            opacity: 0;
        }
        to {
            transform: translateX(0);
            opacity: 1;
        }
    }
    
    @keyframes slideOut {
        from {
            transform: translateX(0);
            opacity: 1;
        }
        to {
            transform: translateX(100%);
            opacity: 0;
        }
    }
    
    .notification-content {
        display: flex;
        align-items: center;
        gap: 8px;
    }
    
    .text-center {
        text-align: center;
    }
    
    .empty-state {
        padding: 2rem;
        color: #6b7280;
    }
    
    .route-info {
        display: flex;
        flex-direction: column;
    }
    
    .route-name {
        font-weight: 500;
        color: #1f2937;
        margin-bottom: 0.25rem;
    }
    
    .route-time {
        font-size: 0.875rem;
        color: #6b7280;
    }
    
    .area-badge {
        padding: 0.25rem 0.75rem;
        border-radius: 20px;
        font-size: 0.75rem;
        font-weight: 500;
        text-transform: capitalize;
    }
    
    .area-badge.downtown {
        background: #dbeafe;
        color: #1e40af;
    }
    
    .area-badge.residential {
        background: #d1fae5;
        color: #065f46;
    }
    
    .area-badge.commercial {
        background: #fef3c7;
        color: #92400e;
    }
`;
document.head.appendChild(notificationStyles);

// Export functions for global access
window.openAddRouteModal = openAddRouteModal;
window.closeAddRouteModal = closeAddRouteModal;
window.openEditRouteModal = openEditRouteModal;
window.closeEditRouteModal = closeEditRouteModal;
window.viewRoute = viewRoute;
window.editRoute = editRoute;
window.deleteRoute = deleteRoute;
window.resetFilters = resetFilters;
window.optimizeAllRoutes = optimizeAllRoutes;
window.exportRoutes = exportRoutes;
