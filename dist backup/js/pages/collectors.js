// Collectors Page JavaScript
import { dbService, realtime, utils } from '../../config/supabase_config.js';

// Global variables
let allCollectors = [];
let filteredCollectors = [];
let currentEditCollectorId = null;
let availableDrivers = [];

// Initialize the page
document.addEventListener('DOMContentLoaded', function () {
    console.log('Collectors page loaded');
    initializeCollectorsPage();
});

// Initialize collectors page
function initializeCollectorsPage() {
    // Load collectors (trucks)
    loadCollectorsFromFirebase();

    // Load available collector accounts for driver dropdown
    loadAvailableDrivers();

    // Set up event listeners
    setupEventListeners();

    // Subscribe to user changes to keep the driver dropdown up-to-date
    if (realtime && realtime.subscribeToUsers) {
        realtime.subscribeToUsers(() => {
            console.log('Users updated, refreshing available drivers dropdown');
            loadAvailableDrivers();
        });
    }
}

// Helper: get a clean display name for a driver (no full email address)
function getDriverDisplayName(user) {
    if (!user) return '';
    if (user.fullName) return user.fullName;
    if (user.name) return user.name;
    if (user.email) {
        const atIndex = user.email.indexOf('@');
        return atIndex > 0 ? user.email.slice(0, atIndex) : user.email;
    }
    return user.id || '';
}

function openViewCollectorModal() {
    const modal = document.getElementById('viewCollectorModal');
    if (modal) modal.classList.add('show');
}

function closeViewCollectorModal() {
    const modal = document.getElementById('viewCollectorModal');
    if (modal) modal.classList.remove('show');
}

function openEditCollectorModal() {
    const modal = document.getElementById('editCollectorModal');
    if (modal) modal.classList.add('show');
}

function closeEditCollectorModal() {
    const modal = document.getElementById('editCollectorModal');
    if (modal) {
        modal.classList.remove('show');
        currentEditCollectorId = null;
    }
}

// Set up event listeners
function setupEventListeners() {
    // Search functionality
    const searchInput = document.getElementById('collectorSearch');
    if (searchInput) {
        searchInput.addEventListener('input', debounce(handleSearch, 300));
    }

    // Filter functionality
    const statusFilter = document.getElementById('statusFilter');
    const vehicleTypeFilter = document.getElementById('vehicleTypeFilter');

    if (statusFilter) {
        statusFilter.addEventListener('change', handleFilter);
    }

    if (vehicleTypeFilter) {
        vehicleTypeFilter.addEventListener('change', handleFilter);
    }

    // Add collector form
    const addCollectorForm = document.getElementById('addCollectorForm');
    if (addCollectorForm) {
        addCollectorForm.addEventListener('submit', handleAddCollector);
    }
    const editCollectorForm = document.getElementById('editCollectorForm');
    if (editCollectorForm) {
        editCollectorForm.addEventListener('submit', handleEditCollector);
    }

    // Phone formatting
    const phoneField = document.getElementById('phone');
    if (phoneField) {
        phoneField.addEventListener('input', function (e) {
            formatPhoneNumber(e.target);
        });
    }
}

// Load collectors from Firebase
async function loadCollectorsFromFirebase() {
    try {
        console.log('Loading collectors from Firebase...');

        if (dbService && dbService.getCollectors) {
            const { data: collectors, error } = await dbService.getCollectors();

            if (error) {
                throw error;
            }

            allCollectors = collectors || [];
            filteredCollectors = [...allCollectors];

            console.log(`Loaded ${allCollectors.length} collectors`);
        } else {
            // No database service available
            console.warn('Database service not available');
            allCollectors = [];
            filteredCollectors = [];
        }

        // Update UI
        renderCollectorsGrid();

        // Set up real-time listener
        if (realtime && realtime.subscribeToCollectors) {
            realtime.subscribeToCollectors((collectors) => {
                allCollectors = collectors || [];
                filteredCollectors = [...allCollectors];
                renderCollectorsGrid();
            });
        }

    } catch (error) {
        console.error('Error loading collectors:', error);
        showNotification('Failed to load collectors', 'error');

        // Show empty state on error
        allCollectors = [];
        filteredCollectors = [];
        renderCollectorsGrid();
    }
}

// Load available collector user accounts for the Driver dropdown
async function loadAvailableDrivers() {
    try {
        if (!(dbService && dbService.getUsers && dbService.getCollectors)) {
            return;
        }

        const [{ data: users, error: usersError }, { data: trucks, error: trucksError }] = await Promise.all([
            dbService.getUsers(),
            dbService.getCollectors()
        ]);

        if (usersError) throw usersError;
        if (trucksError) throw trucksError;

        const truckList = trucks || [];
        const userList = users || [];

        console.log(`Analyzing ${userList.length} users and ${truckList.length} truck assignments`);

        // Collect userIds that already have a truck assigned
        // Note: In supabase_config.js, dbService.getCollectors maps user_id to userId
        const usersWithTrucks = new Set(
            truckList
                .map(t => t.userId)
                .filter(Boolean)
        );

        // Candidates: registered users with collector role and no truck yet
        availableDrivers = userList.filter(u => {
            const role = (u.role || '').toLowerCase();
            const status = (u.status || '').toLowerCase();
            const isCollector = role === 'collector';
            const isActiveOrPending = status !== 'inactive';
            const hasNoTruck = !usersWithTrucks.has(u.id);

            return isCollector && isActiveOrPending && hasNoTruck;
        });

        console.log(`Found ${availableDrivers.length} available collector accounts`);

        const driverSelect = document.getElementById('driverName');
        if (!driverSelect) return;

        driverSelect.innerHTML = '';

        const placeholder = document.createElement('option');
        placeholder.value = '';
        placeholder.textContent = 'Select Collector Account';
        driverSelect.appendChild(placeholder);

        if (availableDrivers.length === 0) {
            const emptyOpt = document.createElement('option');
            emptyOpt.value = '';
            emptyOpt.textContent = 'No available collector accounts';
            emptyOpt.disabled = true;
            driverSelect.appendChild(emptyOpt);
            return;
        }

        availableDrivers.forEach(user => {
            const opt = document.createElement('option');
            const label = getDriverDisplayName(user);
            opt.value = user.id;
            // Include email in parenthesis if available to help identify unique users
            opt.textContent = user.email ? `${label} (${user.email})` : label;
            driverSelect.appendChild(opt);
        });
    } catch (error) {
        console.error('Error loading available driver accounts:', error);
    }
}



// Handle search
function handleSearch(e) {
    const searchTerm = e.target.value.toLowerCase().trim();

    if (searchTerm === '') {
        filteredCollectors = [...allCollectors];
    } else {
        filteredCollectors = allCollectors.filter(collector =>
            collector.driverName.toLowerCase().includes(searchTerm) ||
            collector.collectorId.toLowerCase().includes(searchTerm) ||
            collector.vehicleId.toLowerCase().includes(searchTerm)
        );
    }

    renderCollectorsGrid();
}

// Handle filter
function handleFilter() {
    const statusFilter = document.getElementById('statusFilter').value;
    const vehicleTypeFilter = document.getElementById('vehicleTypeFilter').value;

    filteredCollectors = allCollectors.filter(collector => {
        const statusMatch = !statusFilter || collector.status === statusFilter;
        const vehicleTypeMatch = !vehicleTypeFilter || collector.vehicleType === vehicleTypeFilter;
        return statusMatch && vehicleTypeMatch;
    });

    renderCollectorsGrid();
}

// Reset filters
function resetFilters() {
    document.getElementById('collectorSearch').value = '';
    document.getElementById('statusFilter').value = '';
    document.getElementById('vehicleTypeFilter').value = '';

    filteredCollectors = [...allCollectors];
    renderCollectorsGrid();
}

// Render collectors grid
function renderCollectorsGrid() {
    const grid = document.getElementById('collectorsGrid');
    if (!grid) return;

    grid.innerHTML = '';

    if (filteredCollectors.length === 0) {
        grid.innerHTML = `
            <div class="empty-state">
                <i class="fas fa-truck" style="font-size: 3rem; color: #d1d5db; margin-bottom: 1rem;"></i>
                <p>No collectors found</p>
                <p style="color: #6b7280; font-size: 0.875rem;">Try adjusting your search or filters</p>
            </div>
        `;
        return;
    }

    filteredCollectors.forEach(collector => {
        const card = createCollectorCard(collector);
        grid.appendChild(card);
    });
}

// Create collector card
function createCollectorCard(collector) {
    const card = document.createElement('div');
    card.className = 'collector-card';

    const statusIcon = collector.status === 'on-route' ? 'fa-truck' :
        collector.status === 'available' ? 'fa-check-circle' :
            collector.status === 'maintenance' ? 'fa-wrench' : 'fa-user';

    const progressBar = collector.status === 'on-route' ? `
        <div class="progress-bar">
            <div class="progress-fill" style="width: ${collector.progress}%"></div>
        </div>
        <span class="progress-text">${collector.progress}% Complete</span>
    ` : '';

    card.innerHTML = `
        <div class="collector-header">
            <div class="collector-avatar">
                <i class="fas ${statusIcon}"></i>
            </div>
            <div class="collector-info">
                <h4>${collector.collectorId}</h4>
                <p>${collector.driverName}</p>
            </div>
            <div class="collector-status">
                <span class="status-badge ${collector.status}">${collector.status.replace('-', ' ')}</span>
            </div>
        </div>
        <div class="collector-details">
            <div class="detail-row">
                <span class="detail-label">Vehicle:</span>
                <span class="detail-value">${collector.vehicleId}</span>
            </div>
            <div class="detail-row">
                <span class="detail-label">Type:</span>
                <span class="detail-value">${collector.vehicleType}</span>
            </div>
            <div class="detail-row">
                <span class="detail-label">License:</span>
                <span class="detail-value">${collector.licensePlate}</span>
            </div>
            ${collector.status === 'on-route' ? `
                <div class="detail-row">
                    <span class="detail-label">Current Route:</span>
                    <span class="detail-value">${collector.currentRoute}</span>
                </div>
                <div class="detail-row">
                    <span class="detail-label">Progress:</span>
                    <span class="detail-value">${collector.progress}%</span>
                </div>
                ${progressBar}
            ` : ''}
        </div>
        <div class="collector-actions">
            <button class="btn-small" onclick="viewCollectorDetails('${collector.id}')">View</button>
            <button class="btn-small" onclick="editCollector('${collector.id}')">Edit</button>
            <button class="btn-small btn-danger" onclick="deleteCollectorTruck('${collector.id}')">Delete</button>
        </div>
    `;

    return card;
}

// Modal functions
function openAddCollectorModal() {
    const modal = document.getElementById('addCollectorModal');
    if (modal) {
        modal.classList.add('show');
    }
}

function closeAddCollectorModal() {
    const modal = document.getElementById('addCollectorModal');
    if (modal) {
        modal.classList.remove('show');
        // Reset form
        const form = modal.querySelector('.modal-form');
        if (form) {
            form.reset();
        }
    }
}

// Handle add collector form submission
async function handleAddCollector(e) {
    e.preventDefault();

    const formData = new FormData(e.target);
    const driverUserId = formData.get('driverName');
    const driverUser = availableDrivers.find(u => u.id === driverUserId);

    const collectorData = {
        collectorId: formData.get('collectorId'),
        driverUserId,
        driverName: getDriverDisplayName(driverUser),
        vehicleType: formData.get('vehicleType'),
        vehicleId: formData.get('vehicleId'),
        phone: formData.get('phone'),
        licensePlate: formData.get('licensePlate'),
        status: 'available'
    };

    // Validate form
    if (!collectorData.collectorId || !collectorData.driverUserId || !collectorData.vehicleType || !collectorData.vehicleId || !collectorData.licensePlate) {
        showNotification('Please fill in all required fields', 'error');
        return;
    }

    // Validate phone number if provided
    if (collectorData.phone && !validatePhoneNumber(collectorData.phone)) {
        showNotification('Please enter a valid phone number (e.g., (555) 123-4567)', 'error');
        return;
    }

    try {
        // Add collector to Firebase
        if (dbService && dbService.createCollector) {
            const { data, error } = await dbService.createCollector(collectorData);

            if (error) {
                throw error;
            }

            // Immediately update local state for real-time feel
            if (data) {
                allCollectors.unshift(data);
                filteredCollectors = [...allCollectors];
            }
        } else {
            // Mock collector creation
            const newCollector = {
                id: `collector_${Date.now()}`,
                ...collectorData,
                createdAt: new Date()
            };
            allCollectors.unshift(newCollector);
            filteredCollectors = [...allCollectors];
        }

        // Show success message
        showNotification('Collector added successfully!', 'success');

        // Close modal
        closeAddCollectorModal();

        // Refresh the grid
        renderCollectorsGrid();

        // Refresh available driver accounts (remove the one just assigned)
        loadAvailableDrivers();

    } catch (error) {
        console.error('Error adding collector:', error);
        showNotification('Failed to add collector. Please try again.', 'error');
    }
}

// Collector actions
function viewCollectorDetails(collectorId) {
    const collector = allCollectors.find(c => c.id === collectorId);
    if (collector) {
        document.getElementById('viewCollectorId').textContent = collector.collectorId || collector.id;
        document.getElementById('viewDriverName').textContent = collector.driverName || '—';
        document.getElementById('viewStatus').textContent = collector.status || '—';
        document.getElementById('viewVehicleType').textContent = collector.vehicleType || '—';
        document.getElementById('viewVehicleId').textContent = collector.vehicleId || '—';
        document.getElementById('viewPhone').textContent = collector.phone || '—';
        document.getElementById('viewLicense').textContent = collector.licensePlate || '—';
        document.getElementById('viewRoute').textContent = collector.currentRoute || '—';
        const progressText = collector.status === 'on-route'
            ? `${collector.progress || 0}% • ETA ${collector.eta || '—'}`
            : '—';
        document.getElementById('viewProgress').textContent = progressText;
        openViewCollectorModal();
    }
}

function editCollector(collectorId) {
    const collector = allCollectors.find(c => c.id === collectorId);
    if (collector) {
        currentEditCollectorId = collectorId;
        document.getElementById('editCollectorId').value = collector.collectorId || '';
        document.getElementById('editDriverName').value = collector.driverName || '';
        document.getElementById('editVehicleType').value = collector.vehicleType || 'truck';
        document.getElementById('editVehicleId').value = collector.vehicleId || '';
        document.getElementById('editPhone').value = collector.phone || '';
        document.getElementById('editLicense').value = collector.licensePlate || '';
        document.getElementById('editStatus').value = collector.status || 'available';
        document.getElementById('editRoute').value = collector.currentRoute || '';
        document.getElementById('editProgress').value = collector.progress ?? '';
        document.getElementById('editEta').value = collector.eta || '';
        openEditCollectorModal();
    }
}

async function deleteCollectorTruck(collectorId) {
    const collector = allCollectors.find(c => c.id === collectorId);
    if (!collector) return;

    if (!confirm(`Are you sure you want to delete collector truck "${collector.collectorId || collector.driverName || collectorId}"?`)) {
        return;
    }

    try {
        if (dbService && dbService.deleteCollector) {
            const { error } = await dbService.deleteCollector(collectorId);
            if (error) throw error;
        }

        allCollectors = allCollectors.filter(c => c.id !== collectorId);
        filteredCollectors = [...allCollectors];
        renderCollectorsGrid();
        showNotification('Collector truck deleted successfully', 'success');

        // Refresh available drivers: freed driver can now get a new truck
        loadAvailableDrivers();
    } catch (error) {
        console.error('Error deleting collector truck:', error);
        showNotification('Failed to delete collector truck', 'error');
    }
}

async function handleEditCollector(e) {
    e.preventDefault();
    if (!currentEditCollectorId) {
        showNotification('No collector selected for editing', 'error');
        return;
    }
    const formData = new FormData(e.target);
    const updates = {
        collectorId: formData.get('editCollectorId'),
        driverName: formData.get('editDriverName'),
        vehicleType: formData.get('editVehicleType'),
        vehicleId: formData.get('editVehicleId'),
        phone: formData.get('editPhone'),
        licensePlate: formData.get('editLicense'),
        status: formData.get('editStatus'),
        currentRoute: formData.get('editRoute'),
        progress: formData.get('editProgress') ? Number(formData.get('editProgress')) : null,
        eta: formData.get('editEta')
    };
    try {
        if (dbService && dbService.updateCollector) {
            const { data, error } = await dbService.updateCollector(currentEditCollectorId, updates);
            if (error) throw error;

            // Sync local state if data is returned
            if (data) {
                allCollectors = allCollectors.map(c => c.id === currentEditCollectorId ? data : c);
            } else {
                allCollectors = allCollectors.map(c => c.id === currentEditCollectorId ? { ...c, ...updates } : c);
            }
        } else {
            allCollectors = allCollectors.map(c => c.id === currentEditCollectorId ? { ...c, ...updates } : c);
        }
        filteredCollectors = [...allCollectors];
        showNotification('Collector updated successfully', 'success');
        closeEditCollectorModal();
        renderCollectorsGrid();
    } catch (error) {
        console.error('Error updating collector:', error);
        showNotification('Failed to update collector', 'error');
    }
}

// Utility functions
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

// Validate phone number
function validatePhoneNumber(phone) {
    if (!phone) return false;

    const cleaned = phone.replace(/[^\d+]/g, '');
    const patterns = [
        /^\+1\d{10}$/,
        /^\+[1-9]\d{1,14}$/,
        /^1\d{10}$/,
        /^\d{10}$/,
        /^\d{3}-\d{3}-\d{4}$/,
        /^\(\d{3}\)\s?\d{3}-\d{4}$/,
        /^\d{3}\.\d{3}\.\d{4}$/
    ];

    return patterns.some(pattern => pattern.test(phone)) ||
        (cleaned.length >= 10 && cleaned.length <= 15 && /^\+?[1-9]\d+$/.test(cleaned));
}

// Format phone number
function formatPhoneNumber(input) {
    let value = input.value.replace(/\D/g, '');

    if (value.length === 0) return;

    if (value.length <= 3) {
        input.value = value;
    } else if (value.length <= 6) {
        input.value = `(${value.slice(0, 3)}) ${value.slice(3)}`;
    } else if (value.length <= 10) {
        input.value = `(${value.slice(0, 3)}) ${value.slice(3, 6)}-${value.slice(6)}`;
    } else if (value.length === 11 && value[0] === '1') {
        input.value = `+1 (${value.slice(1, 4)}) ${value.slice(4, 7)}-${value.slice(7)}`;
    } else {
        input.value = `+${value}`;
    }
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

// Add CSS animations
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
    
    .empty-state {
        grid-column: 1 / -1;
        text-align: center;
        padding: 3rem;
        color: #6b7280;
    }
`;
document.head.appendChild(notificationStyles);

// Export functions for global access
window.openAddCollectorModal = openAddCollectorModal;
window.closeAddCollectorModal = closeAddCollectorModal;
window.openViewCollectorModal = openViewCollectorModal;
window.closeViewCollectorModal = closeViewCollectorModal;
window.openEditCollectorModal = openEditCollectorModal;
window.closeEditCollectorModal = closeEditCollectorModal;
window.viewCollectorDetails = viewCollectorDetails;
window.editCollector = editCollector;
window.resetFilters = resetFilters;
window.deleteCollectorTruck = deleteCollectorTruck;

