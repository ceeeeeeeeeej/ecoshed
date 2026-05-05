import { authService, dbService, realtime, utils } from '../../config/supabase_config.js';
import { logActivity } from '../utils/activity_logger.js';

console.log('--- USERS.JS SCRIPT LOADED ---');

// Global variables
let currentPage = 1;
let itemsPerPage = 8;
let totalUsers = 0;
let allUsers = [];
let filteredUsers = [];
let currentEditUserId = null;

// Initialize the page
function startInitialization() {
    console.log('--- USERS.JS INITIALIZING ---');
    initializeUsersPage();
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', startInitialization);
} else {
    startInitialization();
}

// Initialize users page
function initializeUsersPage() {
    // Load users from Firebase
    loadUsersFromFirebase();

    // Set up event listeners
    setupEventListeners();

    // Initialize table
    initializeTable();
}

function initializePhilippinesPhoneField(input) {
    if (!input) return;
    if (!input.value) {
        input.value = '+63';
    }
    input.addEventListener('focus', () => {
        if (!input.value.startsWith('+63')) {
            input.value = '+63';
        }
    });
    input.addEventListener('input', () => {
        input.value = normalizePhilippinesPhone(input.value);
    });
}

function normalizePhilippinesPhone(value) {
    if (!value) return '+63';
    let digits = value.replace(/[^0-9]/g, '');
    if (digits.startsWith('63')) {
        digits = digits.substring(2);
    } else if (digits.startsWith('0')) {
        digits = digits.substring(1);
    }
    digits = digits.substring(0, 10);
    return '+63' + digits;
}

function openViewUserModal() {
    const modal = document.getElementById('viewUserModal');
    if (modal) modal.classList.add('show');
}

function closeViewUserModal() {
    const modal = document.getElementById('viewUserModal');
    if (modal) modal.classList.remove('show');
}

function openEditUserModal() {
    const modal = document.getElementById('editUserModal');
    if (modal) modal.classList.add('show');
}

function closeEditUserModal() {
    const modal = document.getElementById('editUserModal');
    if (modal) {
        modal.classList.remove('show');
        currentEditUserId = null;
    }
}

async function approveUser(userId) {
    const user = allUsers.find(u => u.id === userId);
    if (!user) return;
    if (!confirm(`Approve account for ${user.firstName} ${user.lastName}?`)) {
        return;
    }
    try {
        if (dbService && dbService.updateUser) {
            const { data, error } = await dbService.updateUser(userId, {
                status: 'active',
                adminApprovalRequired: false
            });
            if (error) {
                console.error('Approval error details:', error);
                throw error;
            }
            console.log('User approved in database:', data);
        }
        allUsers = allUsers.map(u =>
            u.id === userId ? { ...u, status: 'active', adminApprovalRequired: false } : u
        );
        filteredUsers = [...allUsers];
        showNotification('User approved successfully', 'success');
        renderUsersTable();
        updatePagination();
        updateUserCount();
    } catch (error) {
        console.error('Error approving user:', error);
        showNotification(`Failed to approve user: ${error.message || 'Unknown error'}`, 'error');
    }
}

async function rejectUser(userId) {
    const user = allUsers.find(u => u.id === userId);
    if (!user) return;

    if (!confirm(`Reject and hide account for ${user.firstName} ${user.lastName}?\n\nThis will soft delete the account from the admin list.`)) {
        return;
    }

    try {
        if (dbService && dbService.deleteUser) {
            const { error } = await dbService.deleteUser(userId);
            if (error) {
                console.error('Rejection error details:', error);
                throw error;
            }
            console.log('User account rejected and soft deleted:', userId);
        }

        // Remove from local arrays
        allUsers = allUsers.filter(u => u.id !== userId);
        filteredUsers = filteredUsers.filter(u => u.id !== userId);
        totalUsers = allUsers.length;

        showNotification('Account rejected and hidden successfully', 'success');
        renderUsersTable();
        updatePagination();
        updateUserCount();
    } catch (error) {
        console.error('Error rejecting user:', error);
        showNotification(`Failed to reject account: ${error.message || 'Unknown error'}`, 'error');
    }
}

// Set up event listeners
function setupEventListeners() {
    // Filter functionality
    const roleFilter = document.getElementById('roleFilter');
    const statusFilter = document.getElementById('statusFilter');

    if (roleFilter) {
        roleFilter.addEventListener('change', handleFilter);
    }
    if (statusFilter) {
        statusFilter.addEventListener('change', handleFilter);
    }


    // Add user form
    const addUserForm = document.getElementById('addUserForm');
    if (addUserForm) {
        addUserForm.addEventListener('submit', handleAddUser);
    }
    const editUserForm = document.getElementById('editUserForm');
    if (editUserForm) {
        editUserForm.addEventListener('submit', handleEditUser);
    }

    // Role selection behavior removed as per request (Barangay/Purok not needed for Admin/Collector registration)

    // Phone formatting
    const phoneField = document.getElementById('phone');
    if (phoneField) {
        initializePhilippinesPhoneField(phoneField);
    }
    const editPhoneField = document.getElementById('editPhone');
    if (editPhoneField) {
        initializePhilippinesPhoneField(editPhoneField);
    }
}

// Load users from Firebase
async function loadUsersFromFirebase() {
    try {
        console.log('Loading users from Firebase...');

        if (dbService && dbService.getUsers) {
            const { data: users, error } = await dbService.getUsers();

            if (error) {
                throw error;
            }

            allUsers = users || [];
            filteredUsers = [...allUsers];
            totalUsers = allUsers.length;

            console.log(`Loaded ${totalUsers} users`);
        } else {
            // Fallback mock data
            console.warn('Database service not available, using mock data');
            allUsers = generateMockUsers();
            filteredUsers = [...allUsers];
            totalUsers = allUsers.length;
        }

        // Update UI
        updateUserCount();
        renderUsersTable();
        updatePagination();

        // Set up real-time listener
        if (realtime && realtime.subscribeToUsers) {
            realtime.subscribeToUsers((users) => {
                console.log('📡 Real-time update: received', users.length, 'users');
                allUsers = users || [];
                handleFilter(); // Use handleFilter to maintain current filter state
            });

        }

    } catch (error) {
        console.error('Error loading users:', error);

        // Handle specific error types
        let errorMessage = 'Failed to load users';
        if (error.code === 'permission-denied' || error.code === 'insufficient-permissions') {
            errorMessage = 'Missing or insufficient permissions to view users';
        } else if (error.code === 'unauthenticated') {
            errorMessage = 'Please log in to view users';
        } else if (error.code === 'unavailable') {
            errorMessage = 'Service is currently unavailable. Please try again later';
        }

        showNotification(errorMessage, 'error');

        // Show mock data on error
        allUsers = generateMockUsers();
        filteredUsers = [...allUsers];
        totalUsers = allUsers.length;
        updateUserCount();
        renderUsersTable();
        updatePagination();
    }
}

// Generate mock users for demo
function generateMockUsers() {
    const roles = ['admin', 'collector'];
    const statuses = ['active', 'inactive', 'pending_approval'];
    const firstNames = ['John', 'Jane', 'Mike', 'Sarah', 'David', 'Lisa', 'Chris', 'Amy', 'Tom', 'Emma'];
    const lastNames = ['Smith', 'Johnson', 'Williams', 'Brown', 'Jones', 'Garcia', 'Miller', 'Davis', 'Rodriguez', 'Martinez'];

    return Array.from({ length: 50 }, (_, i) => ({
        id: `user_${i + 1}`,
        firstName: firstNames[Math.floor(Math.random() * firstNames.length)],
        lastName: lastNames[Math.floor(Math.random() * lastNames.length)],
        email: `user${i + 1}@gmail.com`,
        phone: `+1 (555) ${Math.floor(Math.random() * 900) + 100}-${Math.floor(Math.random() * 9000) + 1000}`,
        role: roles[Math.floor(Math.random() * roles.length)],
        status: statuses[Math.floor(Math.random() * statuses.length)],
        location: `City ${i + 1}, State`,
        createdAt: new Date(Date.now() - Math.random() * 30 * 24 * 60 * 60 * 1000),
        lastActive: new Date(Date.now() - Math.random() * 7 * 24 * 60 * 60 * 1000)
    }));
}

// Handle search
function handleSearch(e) {
    const searchTerm = e.target.value.toLowerCase().trim();

    if (!searchTerm) {
        filteredUsers = [...allUsers];
    } else {
        filteredUsers = allUsers.filter(user => matchesUserSearch(user, searchTerm));
    }

    currentPage = 1;
    totalUsers = filteredUsers.length;
    updateUserCount();
    renderUsersTable();
    updatePagination();
}

function matchesUserSearch(user, searchTerm) {
    const firstName = (user.firstName || '').toLowerCase();
    const lastName = (user.lastName || '').toLowerCase();
    const fullName = (user.fullName || `${firstName} ${lastName}`).trim();
    const email = (user.email || '').toLowerCase();
    const phone = (user.phone || '').toLowerCase();
    const role = (user.role || '').toLowerCase();
    const location = (user.location || '').toLowerCase();
    const status = (user.status || '').toLowerCase();
    const id = (user.id || '').toLowerCase();

    return [
        firstName,
        lastName,
        fullName,
        email,
        phone,
        role,
        location,
        status,
        id
    ].some(field => field.includes(searchTerm));
}

/**
 * Handle filtering of users table based on role and status select boxes.
 */
function handleFilter() {
    console.log('Filtering users...');
    const roleFilterEl = document.getElementById('roleFilter');
    const statusFilterEl = document.getElementById('statusFilter');
    
    const roleVal = roleFilterEl ? roleFilterEl.value.toLowerCase() : '';
    const statusVal = statusFilterEl ? statusFilterEl.value.toLowerCase() : '';

    filteredUsers = allUsers.filter(user => {
        const roleMatch = !roleVal || (user.role || '').toLowerCase() === roleVal;
        const statusMatch = !statusVal || (user.status || '').toLowerCase() === statusVal;
        return roleMatch && statusMatch;
    });

    currentPage = 1;
    totalUsers = filteredUsers.length;
    updateUserCount();
    renderUsersTable();
    updatePagination();
}

// Reset filters
function resetFilters() {
    const roleFilter = document.getElementById('roleFilter');
    const statusFilter = document.getElementById('statusFilter');
    if (roleFilter) roleFilter.value = '';
    if (statusFilter) statusFilter.value = '';

    filteredUsers = [...allUsers];

    currentPage = 1;
    totalUsers = filteredUsers.length;
    updateUserCount();
    renderUsersTable();
    updatePagination();
}

// Update user count
function updateUserCount() {
    const userCountElement = document.getElementById('userCount');
    if (userCountElement) {
        userCountElement.textContent = `${totalUsers.toLocaleString()} users`;
    }
}

// Render users table
function renderUsersTable() {
    const tbody = document.getElementById('usersTableBody');
    if (!tbody) return;

    const startIndex = (currentPage - 1) * itemsPerPage;
    const endIndex = startIndex + itemsPerPage;
    const pageUsers = filteredUsers.slice(startIndex, endIndex);

    tbody.innerHTML = '';

    if (pageUsers.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="7" class="text-center">
                    <div class="empty-state">
                        <i class="fas fa-users" style="font-size: 3rem; color: #d1d5db; margin-bottom: 1rem;"></i>
                        <p>No users found</p>
                        <p style="color: #6b7280; font-size: 0.875rem;">Try adjusting your search or filters</p>
                    </div>
                </td>
            </tr>
        `;
        return;
    }

    pageUsers.forEach(user => {
        const row = createUserRow(user);
        tbody.appendChild(row);
    });

    // Update pagination info
    updatePaginationInfo();
}

// Create user row
function createUserRow(user) {

    const row = document.createElement('tr');
    row.innerHTML = `
        <td>
            <input type="checkbox" class="user-checkbox" data-user-id="${user.id}">
        </td>
        <td>
            <div class="user-cell">
                <div class="user-avatar-small">
                    <i class="fas fa-user"></i>
                </div>
                <div class="user-details">
                    <div class="user-name">${user.fullName || (user.firstName ? `${user.firstName} ${user.lastName}` : 'Unknown User')}</div>
                    <div class="user-email">${user.email}</div>
                </div>

            </div>
        </td>
        <td>
            <span class="role-badge ${user.role}">${user.role}</span>
        </td>
        <td>${user.purok || '—'}</td>
        <td>${user.phone || '—'}</td>
        <td>
            <div class="action-buttons">
                <button class="action-icon action-view" onclick="viewUser('${user.id}')" title="View Details">
                    <i class="fas fa-eye"></i>
                </button>
                ${['pending_approval', 'pending_verification'].includes((user.status || '').toLowerCase()) ? `
                <button class="action-icon action-approve" onclick="approveUser('${user.id}')" title="Approve Account">
                    <i class="fas fa-check"></i>
                </button>
                <button class="action-icon action-reject" onclick="rejectUser('${user.id}')" title="Reject Account">
                    <i class="fas fa-times"></i>
                </button>` : ''}
                <button class="action-icon action-delete" onclick="deleteUser('${user.id}')" title="Remove User">
                    <i class="fas fa-trash-alt"></i>
                </button>
            </div>
        </td>
    `;
    return row;
}

function formatStatus(status) {
    if (!status) return 'Unknown';
    const value = status.toString();
    if (value.toLowerCase() === 'pending_approval') {
        return 'Pending Approval';
    }
    return value.charAt(0).toUpperCase() + value.slice(1);
}

// Format relative time
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

    return new Intl.DateTimeFormat('en-US').format(new Date(date));
}

// Update pagination info
function updatePaginationInfo() {
    const startIndex = (currentPage - 1) * itemsPerPage + 1;
    const endIndex = Math.min(currentPage * itemsPerPage, totalUsers);

    document.getElementById('showingStart').textContent = startIndex;
    document.getElementById('showingEnd').textContent = endIndex;
    document.getElementById('totalUsers').textContent = totalUsers.toLocaleString();
}

// Update pagination
function updatePagination() {
    const totalPages = Math.ceil(totalUsers / itemsPerPage);
    const pageNumbers = document.getElementById('pageNumbers');
    const prevBtn = document.getElementById('prevPage');
    const nextBtn = document.getElementById('nextPage');

    if (!pageNumbers || !prevBtn || !nextBtn) return;

    // Update prev/next buttons
    prevBtn.disabled = currentPage === 1;
    nextBtn.disabled = currentPage === totalPages;

    // Generate page numbers
    pageNumbers.innerHTML = '';

    const maxVisiblePages = 5;
    let startPage = Math.max(1, currentPage - Math.floor(maxVisiblePages / 2));
    let endPage = Math.min(totalPages, startPage + maxVisiblePages - 1);

    if (endPage - startPage + 1 < maxVisiblePages) {
        startPage = Math.max(1, endPage - maxVisiblePages + 1);
    }

    for (let i = startPage; i <= endPage; i++) {
        const pageBtn = document.createElement('button');
        pageBtn.className = `page-number ${i === currentPage ? 'active' : ''}`;
        pageBtn.textContent = i;
        pageBtn.onclick = () => goToPage(i);
        pageNumbers.appendChild(pageBtn);
    }
}

// Change page
function goToPage(page) {
    const totalPages = Math.ceil(totalUsers / itemsPerPage);

    if (page >= 1 && page <= totalPages) {
        currentPage = page;
        renderUsersTable();
        updatePagination();
    }
}

function changePage(direction) {
    const totalPages = Math.ceil(totalUsers / itemsPerPage);
    const newPage = currentPage + direction;

    if (newPage >= 1 && newPage <= totalPages) {
        currentPage = newPage;
        renderUsersTable();
        updatePagination();
    }
}

// Initialize table functionality
function initializeTable() {
    // Select all checkbox
    const selectAllCheckbox = document.querySelector('.select-all');
    if (selectAllCheckbox) {
        selectAllCheckbox.addEventListener('change', function () {
            const checkboxes = document.querySelectorAll('.user-checkbox');
            checkboxes.forEach(checkbox => {
                checkbox.checked = this.checked;
            });
        });
    }
}

// Toggle select all
function toggleSelectAll(checkbox) {
    const checkboxes = document.querySelectorAll('.user-checkbox');
    checkboxes.forEach(cb => {
        cb.checked = checkbox.checked;
    });
}

// Select all users
function selectAllUsers() {
    const selectAllCheckbox = document.querySelector('.select-all');
    if (selectAllCheckbox) {
        selectAllCheckbox.checked = true;
        selectAllCheckbox.dispatchEvent(new Event('change'));
    }
}

function clearUserSelections() {
    const selectAllCheckbox = document.querySelector('.select-all');
    if (selectAllCheckbox) {
        selectAllCheckbox.checked = false;
    }
    const checkboxes = document.querySelectorAll('.user-checkbox');
    checkboxes.forEach(cb => cb.checked = false);
}

// Bulk actions
async function bulkAction(action) {
    const selectedCheckboxes = document.querySelectorAll('.user-checkbox:checked');
    const selectedUserIds = Array.from(selectedCheckboxes).map(cb => cb.dataset.userId);

    if (selectedUserIds.length === 0) {
        showNotification('Please select users first', 'warning');
        return;
    }

    const actionText = {
        'activate': 'activate',
        'deactivate': 'deactivate',
        'delete': 'hide',
        'approve': 'approve'
    }[action];

    if (!actionText) {
        showNotification('Unsupported action selected', 'error');
        return;
    }

    if (action === 'approve') {
        const pendingUserIds = selectedUserIds.filter(id => {
            const user = allUsers.find(u => u.id === id);
            return (user?.status || '').toLowerCase() === 'pending_approval';
        });

        if (pendingUserIds.length === 0) {
            showNotification('Select at least one pending approval account', 'warning');
            return;
        }

        if (!confirm(`Approve ${pendingUserIds.length} pending account(s)?`)) {
            return;
        }

        try {
            if (dbService && dbService.updateUser) {
                for (const userId of pendingUserIds) {
                    const { error } = await dbService.updateUser(userId, {
                        status: 'active',
                        adminApprovalRequired: false
                    });
                    if (error) {
                        throw error;
                    }
                }
            }

            allUsers = allUsers.map(user =>
                pendingUserIds.includes(user.id)
                    ? { ...user, status: 'active', adminApprovalRequired: false }
                    : user
            );
            filteredUsers = [...allUsers];
            showNotification(`${pendingUserIds.length} pending account(s) approved`, 'success');
            renderUsersTable();
            updatePagination();
            updateUserCount();
        } catch (error) {
            console.error('Error approving users:', error);
            showNotification('Failed to approve selected accounts', 'error');
        }
        return;
    }

    if (!confirm(`Are you sure you want to ${actionText} ${selectedUserIds.length} user(s)?`)) {
        return;
    }

    try {
        if (action === 'delete') {
            if (dbService && dbService.deleteUser) {
                for (const userId of selectedUserIds) {
                    const { error } = await dbService.deleteUser(userId);
                    if (error) throw error;
                }
            }
            allUsers = allUsers.filter(user => !selectedUserIds.includes(user.id));
            filteredUsers = [...allUsers];
            totalUsers = allUsers.length;
            showNotification(`${selectedUserIds.length} user(s) hidden successfully`, 'success');
        } else {
            const targetStatus = action === 'activate' ? 'active' : 'inactive';
            if (dbService && dbService.updateUser) {
                for (const userId of selectedUserIds) {
                    const { error } = await dbService.updateUser(userId, { status: targetStatus });
                    if (error) throw error;
                }
            }
            allUsers = allUsers.map(user =>
                selectedUserIds.includes(user.id)
                    ? { ...user, status: targetStatus }
                    : user
            );
            filteredUsers = [...allUsers];
            showNotification(`${selectedUserIds.length} user(s) ${actionText}d successfully`, 'success');
        }

        clearUserSelections();
        renderUsersTable();
        updatePagination();
        updateUserCount();
    } catch (error) {
        console.error(`Error performing bulk ${action}:`, error);
        showNotification(`Failed to ${actionText} selected users`, 'error');
    }
}

// Modal functions
function openAddUserModal() {
    const modal = document.getElementById('addUserModal');
    if (modal) {
        modal.classList.add('show');
    }
}

function closeAddUserModal() {
    const modal = document.getElementById('addUserModal');
    if (modal) {
        modal.classList.remove('show');
        // Reset form
        const form = modal.querySelector('.modal-form');
        if (form) {
            form.reset();
        }
    }
}


// Handle add user form submission
async function handleAddUser(e) {
    e.preventDefault();

    const formData = new FormData(e.target);
    const role = formData.get('role');
    const password = formData.get('password');
    const confirmPassword = formData.get('confirmPassword');

    const userData = {
        firstName: formData.get('firstName'),
        lastName: formData.get('lastName'),
        email: formData.get('email'),
        phone: normalizePhilippinesPhone(formData.get('phone')),
        role: role,
        location: 'All',
        purok: 'All',
        password: password,
        status: 'active'
    };

    // Validate form
    if (!userData.firstName || !userData.lastName || !userData.email || !userData.role) {
        showNotification('Please fill in all required fields', 'error');
        return;
    }

    if (!password || password.length < 6) {
        showNotification('Password must be at least 6 characters', 'error');
        return;
    }

    if (password !== confirmPassword) {
        showNotification('Passwords do not match', 'error');
        return;
    }

    // Validate phone number if provided
    if (userData.phone && !validatePhoneNumber(userData.phone)) {
        showNotification('Please enter a valid phone number (e.g., +639XXXXXXXXX)', 'error');
        return;
    }

    // Check for duplicate email
    const emailExists = allUsers.some(user =>
        user.email && user.email.toLowerCase() === userData.email.toLowerCase()
    );

    if (emailExists) {
        showNotification('A user with this email address already exists', 'error');
        return;
    }

    let remoteError = null;
    let createdUid = null;
    try {
        if (!authService || !authService.createAuthUser) {
            throw new Error('authService unavailable');
        }

        const { uid, error: authError } = await authService.createAuthUser(userData.email, userData.password, {
            role: userData.role,
            firstName: userData.firstName,
            lastName: userData.lastName,
            status: userData.status,
            fullName: `${userData.firstName} ${userData.lastName}`.trim()
        });
        if (authError || !uid) {
            throw authError || new Error('Failed to create authentication record');
        }

        createdUid = uid;

        if (!dbService || !dbService.createUser) {
            throw new Error('createUser unavailable');
        }

        const profilePayload = {
            id: uid,
            firstName: userData.firstName,
            lastName: userData.lastName,
            email: userData.email,
            phone: userData.phone,
            role: userData.role,
            location: userData.location,
            purok: userData.purok,
            status: userData.status,
            lastActive: new Date().toISOString()
        };

        const { error: profileError } = await dbService.createUser(profilePayload);
        if (profileError) {
            throw profileError;
        }

        // 🚛 SYNC: If role is collector, automatically register in collectors table
        // This allows them to log in to the mobile app immediately (Required by AuthService)
        if (userData.role === 'collector') {
            try {
                console.log('Syncing collector to registered_collectors table...');
                const collectorPayload = {
                    userId: uid,
                    collectorId: `COL-${Math.floor(1000 + Math.random() * 9000)}`, // Generate a random ID
                    driverName: `${userData.firstName} ${userData.lastName}`.trim(),
                    vehicleId: 'PENDING',
                    vehicleType: 'truck',
                    licensePlate: 'PENDING',
                    phone: userData.phone || '',
                    status: 'available'
                };

                if (dbService && dbService.createCollector) {
                    await dbService.createCollector(collectorPayload);
                    console.log('✅ Collector registered successfully for mobile access');
                }
            } catch (syncError) {
                console.warn('Non-blocking sync error:', syncError);
                // We keep this silent/warning as the primary user record IS created
            }
        }

        // Log activity
        logActivity(
            userData.role === 'collector' ? 'collector_added' : 'user_added',
            `Added new ${userData.role}: ${userData.firstName} ${userData.lastName} (${userData.email})`,
            'medium',
            { userId: uid, role: userData.role, email: userData.email }
        );

        showNotification(`${userData.role === 'collector' ? 'Collector' : 'User'} account created successfully!`, 'success');
    } catch (error) {
        console.error('Error creating collector account:', error);
        remoteError = error;
        showNotification(utils?.getErrorMessage?.(error) || 'Failed to register user. Please try again.', 'error');
    }

    // Close modal - real-time subscription will update the list automatically
    if (!remoteError) {
        closeAddUserModal();
    }
}

// User actions
function viewUser(userId) {
    const user = allUsers.find(u => u.id === userId);
    if (!user) return;
    document.getElementById('viewFullName').textContent = `${user.firstName} ${user.lastName}`;
    document.getElementById('viewEmail').textContent = user.email || '—';
    document.getElementById('viewPhone').textContent = user.phone || '—';
    document.getElementById('viewRole').textContent = user.role || '—';
    document.getElementById('viewLocation').textContent = user.location || '—';
    document.getElementById('viewPurok').textContent = user.purok || '—';
    openViewUserModal();
}

function editUser(userId) {
    const user = allUsers.find(u => u.id === userId);
    if (!user) return;
    currentEditUserId = userId;
    document.getElementById('editFirstName').value = user.firstName || '';
    document.getElementById('editLastName').value = user.lastName || '';
    document.getElementById('editEmail').value = user.email || '';
    document.getElementById('editPhone').value = user.phone || '';
    document.getElementById('editRole').value = user.role || 'collector';
    document.getElementById('editLocation').value = user.location || '';
    document.getElementById('editPurok').value = user.purok || '';
    openEditUserModal();
}

async function handleEditUser(e) {
    e.preventDefault();
    if (!currentEditUserId) {
        showNotification('No collector selected for editing', 'error');
        return;
    }
    const formData = new FormData(e.target);
    const updates = {
        firstName: formData.get('editFirstName'),
        lastName: formData.get('editLastName'),
        email: formData.get('editEmail'),
        phone: normalizePhilippinesPhone(formData.get('editPhone')),
        role: formData.get('editRole'),
        location: formData.get('editLocation'),
        purok: formData.get('editPurok')
    };

    // Check for duplicate email (excluding current user)
    const emailExists = allUsers.some(user =>
        user.id !== currentEditUserId &&
        user.email &&
        user.email.toLowerCase() === updates.email.toLowerCase()
    );

    if (emailExists) {
        showNotification('Another user with this email address already exists', 'error');
        return;
    }

    try {
        if (dbService && dbService.updateUser) {
            const { data, error } = await dbService.updateUser(currentEditUserId, updates);
            if (error) {
                console.error('Update user error details:', error);
                throw error;
            }
            console.log('User updated in database:', data);

            // 🚛 SYNC: If role is collector, ensure they are in the registered_collectors table
            if (updates.role === 'collector') {
                try {
                    console.log('Syncing updated collector to registered_collectors...');
                    const collectorPayload = {
                        userId: currentEditUserId,
                        collectorId: `COL-${Math.floor(1000 + Math.random() * 9000)}`,
                        driverName: `${updates.firstName} ${updates.lastName}`.trim(),
                        vehicleId: 'PENDING',
                        vehicleType: 'truck',
                        licensePlate: 'PENDING',
                        phone: updates.phone || '',
                        status: 'available'
                    };

                    if (dbService && dbService.createCollector) {
                        await dbService.createCollector(collectorPayload);
                        console.log('✅ Collector registration synced for mobile access');
                    }
                } catch (syncError) {
                    console.warn('Non-blocking sync error during edit:', syncError);
                }
            }
        }
        allUsers = allUsers.map(user => user.id === currentEditUserId ? { ...user, ...updates } : user);
        filteredUsers = [...allUsers];
        showNotification('Collector updated successfully', 'success');
        closeEditUserModal();
        renderUsersTable();
        updatePagination();
        updateUserCount();
    } catch (error) {
        console.error('Error updating user:', error);
        showNotification(`Failed to update collector: ${error.message || 'Unknown error'}`, 'error');
    }
}

async function updateUserStatus(userId, newStatus) {
    const user = allUsers.find(u => u.id === userId);
    if (!user) return;

    const normalizedStatus = (newStatus || '').toLowerCase();
    const actionText = normalizedStatus === 'active' ? 'activate' : 'deactivate';

    if (!normalizedStatus) {
        showNotification('Invalid status selected', 'error');
        return;
    }

    if (!confirm(`Are you sure you want to ${actionText} ${user.firstName} ${user.lastName}?`)) {
        return;
    }

    try {
        if (dbService && dbService.updateUser) {
            const { data, error } = await dbService.updateUser(userId, { status: normalizedStatus });
            if (error) {
                console.error('Update status error details:', error);
                throw error;
            }
            console.log('User status updated in database:', data);
        }

        allUsers = allUsers.map(u => u.id === userId ? { ...u, status: normalizedStatus } : u);
        filteredUsers = [...allUsers];

        showNotification(`User ${actionText}d successfully`, 'success');
        renderUsersTable();
        updatePagination();
        updateUserCount();
    } catch (error) {
        console.error('Error updating user status:', error);
        showNotification(`Failed to ${actionText} user: ${error.message || 'Unknown error'}`, 'error');
    }
}

async function deleteUser(userId) {
    const user = allUsers.find(u => u.id === userId);
    if (!user) return;

    if (confirm(`Are you sure you want to hide ${user.firstName} ${user.lastName}?\n\nThis performs a soft delete and removes the user from the admin list.`)) {
        try {
            if (dbService && dbService.deleteUser) {
                const { error } = await dbService.deleteUser(userId);

                if (error) {
                    throw error;
                }
            }
            allUsers = allUsers.filter(u => u.id !== userId);
            filteredUsers = [...allUsers];
            totalUsers = allUsers.length;

            showNotification('User hidden successfully!', 'success');

            // Refresh the table
            renderUsersTable();
            updatePagination();
            updateUserCount();

        } catch (error) {
            console.error('Error deleting user:', error);
            showNotification('Failed to hide user', 'error');
        }
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

    const normalizedPhilippines = phone.replace(/[\s()-]/g, '');
    const isPhilippines = /^\+?63\d{10}$/.test(normalizedPhilippines) || /^09\d{9}$/.test(normalizedPhilippines);

    return isPhilippines ||
        patterns.some(pattern => pattern.test(phone)) ||
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
    
    .text-center {
        text-align: center;
    }
    
    .empty-state {
        padding: 2rem;
        color: #6b7280;
    }
`;
document.head.appendChild(notificationStyles);

// Export functions for global access
window.openAddUserModal = openAddUserModal;
window.closeAddUserModal = closeAddUserModal;
window.openViewUserModal = openViewUserModal;
window.closeViewUserModal = closeViewUserModal;
window.openEditUserModal = openEditUserModal;
window.closeEditUserModal = closeEditUserModal;
window.viewUser = viewUser;
window.editUser = editUser;
window.deleteUser = deleteUser;
window.resetFilters = resetFilters;
window.selectAllUsers = selectAllUsers;
window.bulkAction = bulkAction;
window.toggleSelectAll = toggleSelectAll;
window.changePage = changePage;
window.goToPage = goToPage;
window.approveUser = approveUser;
window.rejectUser = rejectUser;
window.updateUserStatus = updateUserStatus;
window.handleSearch = handleSearch;
window.handleFilter = handleFilter;

// Password visibility toggle
window.togglePasswordVisibility = function (inputId) {
    const input = document.getElementById(inputId);
    const icon = input.nextElementSibling;
    if (input.type === 'password') {
        input.type = 'text';
        icon.classList.remove('fa-eye');
        icon.classList.add('fa-eye-slash');
    } else {
        input.type = 'password';
        icon.classList.remove('fa-eye-slash');
        icon.classList.add('fa-eye');
    }
};
