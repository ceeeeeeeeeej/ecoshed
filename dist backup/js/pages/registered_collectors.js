// Registered Users Page JavaScript
import { dbService, realtime, utils, authService } from '../../config/supabase_config.js';

let collectorPage = 1;
let collectorPerPage = 10;
let totalCollectors = 0;
let allCollectors = [];
let filteredCollectors = [];

// Initialize the page
document.addEventListener('DOMContentLoaded', () => {
    initializeCollectorPage();
});

function initializeCollectorPage() {
    loadCollectorsFromFirebase();
    setupCollectorEventListeners();
    initializeCollectorTable();
}

function setupCollectorEventListeners() {
    const searchInput = document.getElementById('collectorSearch');
    if (searchInput) {
        searchInput.addEventListener('input', debounce(handleCollectorSearch, 300));
    }

    const assignmentFilter = document.getElementById('assignmentFilter');
    if (assignmentFilter) {
        assignmentFilter.addEventListener('change', handleCollectorFilter);
    }

    const statusFilter = document.getElementById('statusFilter');
    if (statusFilter) {
        statusFilter.addEventListener('change', handleCollectorFilter);
    }

    const addCollectorForm = document.getElementById('addCollectorForm');
    if (addCollectorForm) {
        addCollectorForm.addEventListener('submit', handleAddCollector);
    }

    const phoneField = document.getElementById('collectorPhone');
    if (phoneField) {
        phoneField.addEventListener('input', e => formatPhoneNumber(e.target));
    }
}

async function loadCollectorsFromFirebase() {
    try {
        if (dbService && dbService.getCollectors) {
            const { data: collectors, error } = await dbService.getCollectors();
            if (error) throw error;
            allCollectors = collectors || [];
        } else {
            console.warn('Database service not available');
            allCollectors = [];
        }

        filteredCollectors = [...allCollectors];
        totalCollectors = allCollectors.length;

        updateCollectorCount();
        renderCollectorTable();
        updateCollectorPagination();

        if (realtime && realtime.subscribeToCollectors) {
            realtime.subscribeToCollectors((collectors) => {
                allCollectors = collectors || [];
                filteredCollectors = [...allCollectors];
                totalCollectors = allCollectors.length;
                updateCollectorCount();
                renderCollectorTable();
                updateCollectorPagination();
            });
        }
    } catch (error) {
        console.error('Error loading users:', error);
        showNotification('Failed to load users', 'error');
        allCollectors = [];
        filteredCollectors = [];
        totalCollectors = 0;
        updateCollectorCount();
        renderCollectorTable();
        updateCollectorPagination();
    }
}



function handleCollectorSearch(e) {
    const searchTerm = e.target.value.toLowerCase().trim();
    if (!searchTerm) {
        filteredCollectors = [...allCollectors];
    } else {
        filteredCollectors = allCollectors.filter(collector =>
            collector.name.toLowerCase().includes(searchTerm) ||
            collector.email.toLowerCase().includes(searchTerm) ||
            collector.id.toLowerCase().includes(searchTerm)
        );
    }
    collectorPage = 1;
    totalCollectors = filteredCollectors.length;
    updateCollectorCount();
    renderCollectorTable();
    updateCollectorPagination();
}

function handleCollectorFilter() {
    const assignment = document.getElementById('assignmentFilter').value;
    const status = document.getElementById('statusFilter').value;

    filteredCollectors = allCollectors.filter(collector => {
        const assignmentMatch = !assignment || collector.assignment === assignment;
        const statusMatch = !status || collector.status === status;
        return assignmentMatch && statusMatch;
    });

    collectorPage = 1;
    totalCollectors = filteredCollectors.length;
    updateCollectorCount();
    renderCollectorTable();
    updateCollectorPagination();
}

function resetCollectorFilters() {
    const searchInput = document.getElementById('collectorSearch');
    if (searchInput) searchInput.value = '';
    document.getElementById('assignmentFilter').value = '';
    document.getElementById('statusFilter').value = '';
    filteredCollectors = [...allCollectors];
    collectorPage = 1;
    totalCollectors = filteredCollectors.length;
    updateCollectorCount();
    renderCollectorTable();
    updateCollectorPagination();
}

function updateCollectorCount() {
    const countEl = document.getElementById('collectorCount');
    if (countEl) {
        countEl.textContent = `${totalCollectors.toLocaleString()} collectors`;
    }
}

function renderCollectorTable() {
    const tbody = document.getElementById('collectorTableBody');
    if (!tbody) return;

    const startIndex = (collectorPage - 1) * collectorPerPage;
    const endIndex = startIndex + collectorPerPage;
    const pageCollectors = filteredCollectors.slice(startIndex, endIndex);

    tbody.innerHTML = '';

    if (pageCollectors.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="7" class="text-center">
                    <div class="empty-state">
                        <i class="fas fa-id-card" style="font-size: 3rem; color: #d1d5db; margin-bottom: 1rem;"></i>
                        <p>No users found</p>
                        <p style="color: #6b7280; font-size: 0.875rem;">Try adjusting your search or filters</p>
                    </div>
                </td>
            </tr>
        `;
        return;
    }

    pageCollectors.forEach(collector => {
        const row = document.createElement('tr');
        row.innerHTML = `
            <td>
                <input type="checkbox" class="collector-checkbox" data-collector-id="${collector.id}">
            </td>
            <td>
                <div class="user-cell">
                    <div class="user-avatar-small"><i class="fas fa-user"></i></div>
                    <div class="user-details">
                        <div class="user-name">${collector.name}</div>
                        <div class="user-email">${collector.email}</div>
                    </div>
                </div>
            </td>
            <td>
                <span class="role-badge">${formatAssignment(collector.assignment)}</span>
            </td>
            <td>
                <span class="status-badge status-${collector.status}">${collector.status}</span>
            </td>
            <td>${formatRelativeTime(collector.lastPing)}</td>
            <td>${collector.phone || 'N/A'}</td>
            <td>
                <div class="action-buttons">
                    <button class="action-icon action-view" onclick="viewCollector('${collector.id}')" title="View">
                        <i class="fas fa-eye"></i>
                    </button>
                    <button class="action-icon action-edit" onclick="editCollector('${collector.id}')" title="Edit">
                        <i class="fas fa-edit"></i>
                    </button>
                    <button class="action-icon action-delete" onclick="deleteCollector('${collector.id}')" title="Delete">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>
            </td>
        `;
        tbody.appendChild(row);
    });

    updateCollectorPaginationInfo();
}

function formatAssignment(area) {
    const map = {
        'victoria': 'Victoria Barangay',
        'dayo-an': 'Dayo-An Barangay',
        'coastal': 'Coastal Route'
    };
    return map[area] || 'Unassigned';
}

function updateCollectorPaginationInfo() {
    document.getElementById('showingStart').textContent = (collectorPage - 1) * collectorPerPage + 1;
    document.getElementById('showingEnd').textContent = Math.min(collectorPage * collectorPerPage, totalCollectors);
    document.getElementById('totalCollectors').textContent = totalCollectors.toLocaleString();
}

function updateCollectorPagination() {
    const totalPages = Math.ceil(totalCollectors / collectorPerPage);
    const pageNumbers = document.getElementById('pageNumbers');
    const prevBtn = document.getElementById('prevPage');
    const nextBtn = document.getElementById('nextPage');

    if (!pageNumbers || !prevBtn || !nextBtn) return;

    prevBtn.disabled = collectorPage === 1;
    nextBtn.disabled = collectorPage === totalPages || totalPages === 0;

    pageNumbers.innerHTML = '';
    const maxVisiblePages = 5;
    let startPage = Math.max(1, collectorPage - Math.floor(maxVisiblePages / 2));
    let endPage = Math.min(totalPages, startPage + maxVisiblePages - 1);

    if (endPage - startPage + 1 < maxVisiblePages) {
        startPage = Math.max(1, endPage - maxVisiblePages + 1);
    }

    for (let i = startPage; i <= endPage; i++) {
        const pageBtn = document.createElement('button');
        pageBtn.className = `page-number ${i === collectorPage ? 'active' : ''}`;
        pageBtn.textContent = i;
        pageBtn.onclick = () => goToCollectorPage(i);
        pageNumbers.appendChild(pageBtn);
    }
}

function changeCollectorPage(direction) {
    const totalPages = Math.ceil(totalCollectors / collectorPerPage);
    const newPage = collectorPage + direction;
    if (newPage >= 1 && newPage <= totalPages) {
        collectorPage = newPage;
        renderCollectorTable();
        updateCollectorPagination();
    }
}

function goToCollectorPage(page) {
    const totalPages = Math.ceil(totalCollectors / collectorPerPage);
    if (page >= 1 && page <= totalPages) {
        collectorPage = page;
        renderCollectorTable();
        updateCollectorPagination();
    }
}

function initializeCollectorTable() {
    const selectAllCheckbox = document.querySelector('.select-all');
    if (selectAllCheckbox) {
        selectAllCheckbox.addEventListener('change', function () {
            const checkboxes = document.querySelectorAll('.collector-checkbox');
            checkboxes.forEach(cb => cb.checked = this.checked);
        });
    }
}

function toggleCollectorSelectAll(checkbox) {
    const checkboxes = document.querySelectorAll('.collector-checkbox');
    checkboxes.forEach(cb => cb.checked = checkbox.checked);
}

function selectAllCollectors() {
    const selectAllCheckbox = document.querySelector('.select-all');
    if (selectAllCheckbox) {
        selectAllCheckbox.checked = true;
        selectAllCheckbox.dispatchEvent(new Event('change'));
    }
}

function bulkCollectorAction(action) {
    const selected = document.querySelectorAll('.collector-checkbox:checked');
    const ids = Array.from(selected).map(cb => cb.dataset.collectorId);

    if (ids.length === 0) {
        showNotification('Please select users first', 'warning');
        return;
    }

    const actionText = { 'activate': 'activate', 'deactivate': 'deactivate', 'delete': 'delete' }[action];
    if (confirm(`Are you sure you want to ${actionText} ${ids.length} user(s)?`)) {
        console.log(`Bulk ${action}:`, ids);
        showNotification(`${ids.length} user(s) ${actionText}d successfully`, 'success');
        loadCollectorsFromFirebase();
    }
}

function openAddCollectorModal() {
    const modal = document.getElementById('addCollectorModal');
    if (modal) modal.classList.add('show');
}

function closeAddCollectorModal() {
    const modal = document.getElementById('addCollectorModal');
    if (modal) {
        modal.classList.remove('show');
        const form = modal.querySelector('.modal-form');
        if (form) form.reset();
    }
}

async function handleAddCollector(e) {
    e.preventDefault();
    const formData = new FormData(e.target);
    const collectorData = {
        name: formData.get('collectorName'),
        email: formData.get('collectorEmail'),
        phone: formData.get('collectorPhone'),
        assignment: formData.get('assignment'),
        vehicleId: formData.get('vehicleId'),
        deviceId: formData.get('deviceId'),
        status: 'active',
        lastPing: new Date()
    };

    if (!collectorData.name || !collectorData.email || !collectorData.assignment) {
        showNotification('Please fill in all required fields', 'error');
        return;
    }

    try {
        const generatedPassword = generateCollectorPassword();

        let authUid = null;
        if (authService && authService.createAuthUser) {
            const { uid, error: authError } = await authService.createAuthUser(
                collectorData.email,
                generatedPassword
            );
            if (authError) throw authError;
            authUid = uid;
        }

        const finalCollectorData = {
            ...collectorData,
            uid: authUid
        };

        if (dbService && dbService.createCollector) {
            const { data, error } = await dbService.createCollector(finalCollectorData);
            if (error) throw error;
        } else {
            const newCollector = {
                id: `collector_${Date.now()}`,
                ...finalCollectorData
            };
            allCollectors.unshift(newCollector);
            filteredCollectors = [...allCollectors];
            totalCollectors = allCollectors.length;
        }

        showNotification(
            `User registered successfully! Temporary password: ${generatedPassword}`,
            'success'
        );
        closeAddCollectorModal();
        renderCollectorTable();
        updateCollectorPagination();
        updateCollectorCount();
    } catch (error) {
        console.error('Error adding collector:', error);
        showNotification('Failed to register user', 'error');
    }
}

function generateCollectorPassword(length = 10) {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
    let result = '';
    for (let i = 0; i < length; i++) {
        result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
}

function viewCollector(id) {
    const collector = allCollectors.find(c => c.id === id);
    if (collector) {
        showNotification(`Viewing user: ${collector.name}`, 'info');
    }
}

function editCollector(id) {
    const collector = allCollectors.find(c => c.id === id);
    if (collector) {
        showNotification(`Editing user: ${collector.name}`, 'info');
    }
}

async function deleteCollector(id) {
    const collector = allCollectors.find(c => c.id === id);
    if (!collector) return;

    if (confirm(`Are you sure you want to delete ${collector.name}?`)) {
        try {
            if (dbService && dbService.deleteCollector) {
                const { error } = await dbService.deleteCollector(id);
                if (error) throw error;
            } else {
                allCollectors = allCollectors.filter(c => c.id !== id);
                filteredCollectors = [...allCollectors];
                totalCollectors = allCollectors.length;
            }

            showNotification('User deleted successfully', 'success');
            renderCollectorTable();
            updateCollectorPagination();
            updateCollectorCount();
        } catch (error) {
            console.error('Error deleting user:', error);
            showNotification('Failed to delete user', 'error');
        }
    }
}

function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        clearTimeout(timeout);
        timeout = setTimeout(() => func(...args), wait);
    };
}

function formatRelativeTime(date) {
    if (!date) return 'Never';
    const now = new Date();
    const diff = now - new Date(date);
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);
    if (minutes < 1) return 'Just now';
    if (minutes < 60) return `${minutes}m ago`;
    if (hours < 24) return `${hours}h ago`;
    if (days < 7) return `${days}d ago`;
    return new Date(date).toLocaleDateString();
}

function showNotification(message, type = 'info') {
    utils?.showNotification?.(message, type);
    if (!utils || !utils.showNotification) {
        alert(`${type.toUpperCase()}: ${message}`);
    }
}

window.openAddCollectorModal = openAddCollectorModal;
window.closeAddCollectorModal = closeAddCollectorModal;
window.resetCollectorFilters = resetCollectorFilters;
window.selectAllCollectors = selectAllCollectors;
window.bulkCollectorAction = bulkCollectorAction;
window.toggleCollectorSelectAll = toggleCollectorSelectAll;
window.changeCollectorPage = changeCollectorPage;
window.goToCollectorPage = goToCollectorPage;
window.viewCollector = viewCollector;
window.editCollector = editCollector;
window.deleteCollector = deleteCollector;
