// Dashboard JavaScript
// Simplified version without Firebase dependencies
import { supabase, TABLES, authService, dbService, realtime, utils } from '../config/supabase_config.js';
import { setupActivityRefresh } from './utils/activity_display.js';

// Global variables
let currentPage = 'dashboard';
let adminProfile = null;
let currentBins = []; // Global store for telemetry details
let statsUnsubscribe = null;
let activitiesUnsubscribe = null;
let notificationsUnsubscribe = null;
let currentSelectedBin = null;
let notifiedBins = new Set(); // Track bins already notified to avoid spam

// Initialize the dashboard
document.addEventListener('DOMContentLoaded', function () {
    console.log('Dashboard loaded');
    initializeDashboard();
});

// Global guard: only admin/superadmin with a valid session
// may access the admin dashboard.
function enforceAdminAccessGuard() {
    console.log('%c--- ADMIN ACCESS GUARD ---', 'background: #004400; color: #ffffff; padding: 5px; font-weight: bold;');
    try {
        const rawUserData = localStorage.getItem('userData');
        let adminLoggedIn = localStorage.getItem('adminLoggedIn');

        console.log('STEP 1: Checking LocalStorage');
        console.log('   - adminLoggedIn flag:', adminLoggedIn);
        console.log('   - userData exists:', !!rawUserData);

        if (!rawUserData) {
            console.error('STEP 2: userData is missing!');
            if (adminLoggedIn !== 'true') {
                console.log('STEP 3: No session, redirecting to login...');
                window.location.href = 'login.html';
                return false;
            }
        }

        const parsed = rawUserData ? JSON.parse(rawUserData) : null;
        const role = (parsed?.role || parsed?.user_role || '').toLowerCase().trim();
        const email = (parsed?.email || '').toLowerCase().trim();
        const hasLocalSession = adminLoggedIn === 'true';

        console.log('STEP 4: Parsed Identity', {
            email,
            role,
            hasLocalSession,
            uid: parsed?.uid || parsed?.id || 'none'
        });

        const isAllowedRole = role === 'admin' || role === 'superadmin';

        if (!hasLocalSession || !isAllowedRole) {
            console.warn('%cGUARD: Access Denied!', 'color: #ff0000; font-weight: bold;');
            console.log('   Reason:', !hasLocalSession ? 'No Local Session' : `Unauthorized Role (${role})`);

            // Clear invalid session data
            localStorage.removeItem('adminLoggedIn');
            localStorage.removeItem('userData');

            if (!window.location.pathname.includes('login.html')) {
                console.log('   Redirecting to login.html immediately...');
                window.location.href = 'login.html';
            }
            return false;
        }

        console.log('%cGUARD: Access Granted!', 'color: #00ff00; font-weight: bold;');
        return true;
    } catch (error) {
        console.error('GUARD ERROR (Exception):', error);
        window.location.href = 'login.html';
        return false;
    }
}

// Initialize dashboard
async function initializeDashboard() {
    // Enforce global admin/superadmin restriction
    if (!enforceAdminAccessGuard()) {
        console.log('Admin access denied, exiting initializeDashboard.');
        return;
    }

    console.log('Admin access confirmed, continuing dashboard setup...');
    await loadAdminProfile();
    initializeNavigationHandlers();
    initializeRealtimeDashboard();
    loadDashboardData();
    refreshSystemStatus(); // Load initial status
    initializeNotifications(); // Load notifications
    initializeSidebarNotifications(); // Load sidebar dots

    // Refresh system status every 60 seconds
    setInterval(refreshSystemStatus, 60000);

    // Initialize recent activity display
    setupActivityRefresh();
}

// Initialize navigation handlers for sidebar menu
function initializeNavigationHandlers() {
    // Set up sidebar menu navigation
    const menuItems = document.querySelectorAll('.sidebar-menu .menu-item');

    if (menuItems) {
        menuItems.forEach(item => {
            item.addEventListener('click', function () {
                const page = this.dataset.page;
                if (page) {
                    navigateToPage(page);
                }
            });
        });
    }

    // Set up mobile sidebar toggles
    const sidebarToggle = document.getElementById('sidebarToggle');
    const sidebarClose = document.getElementById('sidebarClose');
    const sidebarOverlay = document.getElementById('sidebarOverlay');
    const sidebar = document.getElementById('sidebar');

    if (sidebarToggle) {
        sidebarToggle.addEventListener('click', () => {
            sidebar?.classList.add('show');
            sidebarOverlay?.classList.add('show');
        });
    }

    if (sidebarClose) {
        sidebarClose.addEventListener('click', () => {
            sidebar?.classList.remove('show');
            sidebarOverlay?.classList.remove('show');
        });
    }

    if (sidebarOverlay) {
        sidebarOverlay.addEventListener('click', () => {
            sidebar?.classList.remove('show');
            sidebarOverlay?.classList.remove('show');
        });
    }

    // User menu dropdown
    const userMenuButton = document.getElementById('userMenuButton');
    const userMenuDropdown = document.getElementById('userMenuDropdown');
    const userLogoutBtn = document.getElementById('userLogoutBtn');

    if (userMenuButton && userMenuDropdown) {
        userMenuButton.addEventListener('click', (e) => {
            e.stopPropagation();
            userMenuDropdown.classList.toggle('show');
        });

        // Close dropdown when clicking outside
        document.addEventListener('click', () => {
            userMenuDropdown.classList.remove('show');
        });
    }

    if (userLogoutBtn) {
        userLogoutBtn.addEventListener('click', logout);
    }

    // Notification dropdown toggle
    const notificationBtn = document.getElementById('notificationBtn');
    const notificationDropdown = document.getElementById('notificationDropdown');
    if (notificationBtn && notificationDropdown) {
        notificationBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            notificationDropdown.classList.toggle('show');
            // Close user menu if open
            if (userMenuDropdown) userMenuDropdown.classList.remove('show');
        });
    }


    const markAllReadBtn = document.getElementById('markAllRead');
    if (markAllReadBtn) {
        markAllReadBtn.addEventListener('click', markAllNotificationsAsRead);
    }

    const viewAllNotificationsLink = document.getElementById('viewAllNotifications');
    if (viewAllNotificationsLink) {
        viewAllNotificationsLink.addEventListener('click', (e) => {
            e.preventDefault();
            navigateToPage('notifications');
            closeNotificationDropdown();
        });
    }

    // Close menus on outside click
    document.addEventListener('click', (e) => {
        // User menu exists?
        const userMenuDropdown = document.getElementById('userMenuDropdown');
        if (userMenuDropdown && userMenuDropdown.classList.contains('show')) {
            if (!e.target.closest('#userMenuButton') && !e.target.closest('#userMenuDropdown')) {
                userMenuDropdown.classList.remove('show');
            }
        }

        handleNotificationOutsideClick(e);
    });

    console.log('✅ Navigation and Notification handlers initialized');
}

// Initialize realtime subscriptions for stats, activities, routes, and notifications
function initializeRealtimeDashboard() {
    try {
        // Realtime stats (drives top cards and system status summary)
        if (realtime && realtime.subscribeToStats) {
            statsUnsubscribe = realtime.subscribeToStats((liveStats) => {
                if (!liveStats) return;

                const mappedStats = {
                    totalUsers: liveStats.totalUsers ?? 0,
                    adminUsers: liveStats.adminUsers ?? 0,
                    municipalUsers: 0, // Placeholder
                    activeCollectorsDetail: 0,
                    activeCollectors: 0,
                    onRouteCollectors: 0, // Placeholder
                    availableCollectors: 0, // Fallback
                    wasteCollected: '0 level',
                    iotSensors: liveStats.iotUsers ?? 0,
                    serviceAreas: Array.isArray(liveStats.serviceAreas) ? liveStats.serviceAreas.length : 0,
                    residentUsers: liveStats.residentUsers ?? 0,
                    victoriaResidents: liveStats.victoriaResidents ?? 0,
                    dayoanResidents: liveStats.dayoanResidents ?? 0
                };
                console.log('Realtime Stats Update (Mapped):', mappedStats);

                updateStatsDisplay(mappedStats);

                // Derive a simple, live system status summary from stats
                const systemStatus = [
                    {
                        name: 'User Directory',
                        status: 'online',
                        response: `${mappedStats.totalUsers} users`
                    },
                    {
                        name: 'Service Areas',
                        status: mappedStats.serviceAreas > 0 ? 'online' : 'warning',
                        response: `${mappedStats.serviceAreas} areas`
                    }
                ];
                updateSystemStatusDisplay(systemStatus);
            });
        }



        // Realtime recent activity from user_activities
        if (realtime && realtime.subscribeToActivities) {
            activitiesUnsubscribe = realtime.subscribeToActivities((activities) => {
                if (!Array.isArray(activities) || activities.length === 0) {
                    return;
                }

                const mappedActivities = activities
                    .slice(0, 5)
                    .map((activity) => ({
                        icon: activity.icon || 'fa-clipboard-list',
                        text: activity.message || activity.text || 'Activity recorded',
                        time: utils && utils.getRelativeTime
                            ? utils.getRelativeTime(activity.createdAt || activity.timestamp || new Date())
                            : 'Just now'
                    }));

                updateActivitiesDisplay(mappedActivities);
            }, 10);
        }

        // Realtime live route monitoring from waste_routes
        // Routes feature removed


        // Realtime notifications badge (header bell) from community + resident feedback
        if (realtime && (realtime.subscribeToCommunityNotifications || realtime.subscribeToResidentFeedback)) {
            const badgeElement = document.querySelector('.notification-badge');
            let communityItems = [];
            let feedbackItems = [];
            let genericItems = [];
            const dropdownContainer = document.getElementById('dropdownNotificationList'); // adjust if different

            const renderDropdown = () => {
                if (!dropdownContainer) return;

                const all = [...feedbackItems]; // only feedback for now

                if (all.length === 0) {
                    dropdownContainer.innerHTML = `
            <div class="empty-notifications">
                <i class="fas fa-bell-slash"></i>
                <p>No new notifications</p>
            </div>
        `;
                    return;
                }

                dropdownContainer.innerHTML = all
                    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
                    .map(item => `
            <div class="notification-item">
                <strong>New Resident Feedback</strong>
                <p>${item.feedback_text || 'New feedback submitted'}</p>
                <small>${new Date(item.created_at).toLocaleString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true, month: 'short', day: 'numeric' })}</small>
            </div>
        `)
                    .join('');
            };

            const updateBadge = () => {
                if (!badgeElement) return;
                const all = [...communityItems, ...feedbackItems, ...genericItems];
                const unreadCount = all.filter(item => !item.read).length;

                if (unreadCount > 0) {
                    badgeElement.textContent = unreadCount > 99 ? '99+' : String(unreadCount);
                    badgeElement.style.display = 'inline-block';
                } else {
                    badgeElement.textContent = '0';
                    badgeElement.style.display = 'none';
                }
            };

            const triggerToast = (payload, source) => {
                if (payload.eventType === 'INSERT') {
                    const record = payload.new;

                    // Filter by user_id if present in the record (generic notifications)
                    if (record.user_id) {
                        const currentUser = authService.getCurrentUser();
                        if (!currentUser || record.user_id !== currentUser.id) {
                            return; // Ignore notifications for other users
                        }
                    }

                    const title = record.title || record.category || (source === 'Feedback' ? 'New Feedback' : 'New Notification');
                    const message = record.message || record.feedback_text || record.content || 'You have a new update';

                    if (typeof showNotification === 'function') {
                        showNotification(`${source}: ${title}`, 'info');
                    }
                }
            };

            if (realtime.subscribeToCommunityNotifications) {
                realtime.subscribeToCommunityNotifications((items, payload) => {
                    communityItems = Array.isArray(items) ? items : [];
                    updateBadge();
                    renderDropdown();
                    if (payload) triggerToast(payload, 'Announcements');
                });
            }

            if (realtime.subscribeToResidentFeedback) {
                realtime.subscribeToResidentFeedback((items, payload) => {
                    feedbackItems = Array.isArray(items) ? items : [];
                    updateBadge();
                    renderDropdown();
                    if (payload) triggerToast(payload, 'Feedback');

                    // Update dashboard stats
                    const unreadFeedback = feedbackItems.filter(f => !f.read || (f.status || 'new').toLowerCase() === 'new').length;
                    updateStatsDisplay({ feedbackCount: unreadFeedback });
                    
                    // Recalculate total notifications (New Updates)
                    refreshTotalNotifications();
                });
            }

            if (realtime.subscribeToSpecialCollections) {
                realtime.subscribeToSpecialCollections((items, payload) => {
                    const activeSpecials = items.filter(s => 
                        !['completed', 'cancelled'].includes((s.status || '').toLowerCase())
                    ).length;
                    updateStatsDisplay({ specialCount: activeSpecials });
                    refreshTotalNotifications();
                    if (payload) triggerToast(payload, 'Special Collections');
                });
            }

            if (realtime.subscribeToNotifications) {
                realtime.subscribeToNotifications((items, payload) => {
                    genericItems = Array.isArray(items) ? items : [];
                    updateBadge();
                    renderDropdown();
                    if (payload) triggerToast(payload, 'System');

                    // Update dashboard count for bin alerts (specialCount now handled above)
                    const unreadAlerts = genericItems.filter(n => n.type === 'bin_alert' && !n.read).length;
                    updateStatsDisplay({ 
                        collectorCount: unreadAlerts
                    });
                    
                    refreshTotalNotifications();
                });
            }

            // Realtime bin monitoring
            if (realtime.subscribeToBins) {
                // Initial fetch to populate UI immediately
                if (dbService && dbService.getBins) {
                    dbService.getBins().then(({ data }) => {
                        if (data) {
                            currentBins = data; // Store globally
                            updateBinMonitoringDisplay(data);

                            // Calculate initial stats
                            const bins = data;
                            if (bins && Array.isArray(bins)) {
                                const now = new Date();
                                const totalSensors = bins.length;
                                const offlineCount = bins.filter(b => {
                                    if (b.status === 'inactive') return true;
                                    if (!b.updated_at) return true;
                                    const lastUpdate = new Date(b.updated_at);
                                    const diffMinutes = (now - lastUpdate) / 1000 / 60;
                                    return diffMinutes > 2; // Consider offline if no update in 2 minutes
                                }).length;
                                const onlineCount = totalSensors - offlineCount;

                                updateStatsDisplay({
                                    iotSensors: totalSensors,
                                    onlineSensors: onlineCount,
                                    offlineSensors: offlineCount
                                });
                            }
                        }
                    });
                }

                realtime.subscribeToBins((bins, payload) => {
                    currentBins = bins; // Store globally
                    updateBinMonitoringDisplay(bins);

                    // Show notification for new sensor detection
                    if (payload && payload.eventType === 'INSERT') {
                        const newBinId = payload.new?.bin_id || 'Unknown';
                        triggerToast(`New Sensor Detected: ${newBinId}`, 'System');
                    }

                    // Calculate sensor network stats
                    if (bins && Array.isArray(bins)) {
                        const totalSensors = bins.length;
                        // Consider offline if updated_at is older than 2 minutes or status is inactive
                        const now = new Date();
                        const offlineCount = bins.filter(b => {
                            if (b.status === 'inactive') return true;
                            if (!b.updated_at) return true;
                            const lastUpdate = new Date(b.updated_at);
                            const diffMinutes = (now - lastUpdate) / 1000 / 60;
                            return diffMinutes > 2; // Consider offline if no update in 2 minutes
                        }).length;
                        const onlineCount = totalSensors - offlineCount;

                        // Update the stat card if functions exist
                        updateStatsDisplay({
                            iotSensors: totalSensors,
                            onlineSensors: onlineCount,
                            offlineSensors: offlineCount
                        });
                    }
                });
            }
        }
    } catch (error) {
        console.error('Error initializing realtime dashboard:', error);
    }
}

// Set up event listeners
function setupEventListeners() {
    // Sidebar navigation
    const menuItems = document.querySelectorAll('.menu-item');
    menuItems.forEach(item => {
        item.addEventListener('click', function () {
            const page = this.dataset.page;
            navigateToPage(page);
        });
    });

    // Sidebar toggle for mobile
    const sidebarToggle = document.querySelector('.sidebar-toggle');
    if (sidebarToggle) {
        sidebarToggle.addEventListener('click', toggleSidebar);
    }

    // Sidebar overlay click to close
    const sidebarOverlay = document.querySelector('.sidebar-overlay');
    if (sidebarOverlay) {
        sidebarOverlay.addEventListener('click', closeSidebar);
    }

    // Sidebar close button
    const sidebarClose = document.querySelector('.sidebar-close');
    if (sidebarClose) {
        sidebarClose.addEventListener('click', closeSidebar);
    }

    // Close menus on outside click
    document.addEventListener('click', (e) => {
        handleUserMenuOutsideClick(e);
    });

    // User menu
    const userBtn = document.getElementById('userMenuButton');
    if (userBtn) {
        userBtn.addEventListener('click', toggleUserMenu);
    }

    const manageProfileBtn = document.getElementById('manageProfileBtn');
    if (manageProfileBtn) {
        manageProfileBtn.addEventListener('click', () => {
            navigateToPage('settings');
            closeUserMenu();
        });
    }

    const userLogoutBtn = document.getElementById('userLogoutBtn');
    if (userLogoutBtn) {
        userLogoutBtn.addEventListener('click', () => {
            closeUserMenu();
            logout();
        });
    }

    document.addEventListener('click', handleUserMenuOutsideClick);
}
async function loadAllNotifications() {
    try {
        const { data, error } = await supabase
            .from('resident_feedback')
            .select('*')
            .order('created_at', { ascending: false });

        if (error) {
            console.error(error);
            return;
        }

        feedbackItems = data || [];
        renderDropdown();

    } catch (err) {
        console.error('Error loading notifications:', err);
    }
}

async function loadAdminProfile() {
    // First, try to read profile from localStorage
    adminProfile = getStoredAdminProfile();

    // If we only have the placeholder profile, try to enrich it from Firebase
    const isPlaceholder = !adminProfile || adminProfile.fullName === 'Admin User';
    if (isPlaceholder) {
        try {
            if (authService && authService.getCurrentUser && dbService && dbService.getUserById) {
                const currentUser = authService.getCurrentUser();
                if (currentUser && currentUser.id) {
                    const { data, error } = await dbService.getUserById(currentUser.id);
                    if (!error && data) {
                        const fullName = data.fullName || `${data.firstName || ''} ${data.lastName || ''}`.trim() ||
                            currentUser.displayName || currentUser.email || 'Admin User';

                        const loginTimestamp = new Date().toISOString();
                        const profileToStore = {
                            uid: currentUser.id,
                            email: data.email || currentUser.email,
                            fullName,
                            role: data.role || 'admin',
                            serviceArea: data.serviceArea || data.organization || 'Head Office',
                            phone: data.phone || '',
                            organization: data.organization || 'EcoSched Admin',
                            lastLoginAt: data.lastLoginAt || loginTimestamp,
                            loginTime: loginTimestamp
                        };

                        // Persist so subsequent loads are instant
                        localStorage.setItem('userData', JSON.stringify(profileToStore));

                        adminProfile = {
                            id: currentUser.id,
                            fullName: profileToStore.fullName,
                            role: profileToStore.role,
                            email: profileToStore.email,
                            serviceArea: profileToStore.serviceArea,
                            lastLoginAt: profileToStore.lastLoginAt
                        };
                    }
                }
            }
        } catch (error) {
            console.warn('Failed to load admin profile from Firebase, using fallback:', error);
        }
    }

    updateUserInterface(adminProfile || getStoredAdminProfile());
}

function getStoredAdminProfile() {
    try {
        const rawData = localStorage.getItem('userData');
        if (rawData) {
            const parsed = JSON.parse(rawData);
            const id = parsed.uid || parsed.id || parsed.userId || null;
            return {
                id: id ? String(id).toLowerCase() : null,
                fullName: parsed.fullName || parsed.name || parsed.displayName || parsed.email || 'Admin User',
                role: parsed.role || 'System Administrator',
                email: parsed.email || 'admin@ecosched.com',
                serviceArea: parsed.serviceArea || 'Head Office',
                lastLoginAt: parsed.lastLoginAt || parsed.loginTime || new Date().toISOString()
            };
        }
    } catch (error) {
        console.warn('Failed to parse stored admin data:', error);
    }

    return {
        fullName: 'Admin User',
        role: 'System Administrator',
        email: 'admin@ecosched.com',
        serviceArea: 'Head Office',
        lastLoginAt: new Date().toISOString()
    };
}

function updateUserInterface(profile) {
    const sidebarName = document.getElementById('sidebarUserName');
    const sidebarRole = document.getElementById('sidebarUserRole');
    const sidebarEmail = document.getElementById('sidebarUserEmail');
    const headerName = document.getElementById('userMenuName');
    const headerRole = document.getElementById('userMenuRole');
    const dropdownName = document.getElementById('userDropdownName');
    const dropdownEmail = document.getElementById('userDropdownEmail');
    const dropdownRole = document.getElementById('userDropdownRole');
    const dropdownServiceArea = document.getElementById('userDropdownServiceArea');
    const dropdownLastLogin = document.getElementById('userDropdownLastLogin');
    const avatarLarge = document.getElementById('userMenuAvatarLarge');

    const displayName = profile.fullName || 'Admin User';
    const roleLabel = formatRoleLabel(profile.role);
    const formattedLastLogin = formatLastLogin(profile.lastLoginAt);

    if (sidebarName) sidebarName.textContent = displayName;
    if (sidebarRole) sidebarRole.textContent = roleLabel;
    if (sidebarEmail) sidebarEmail.textContent = profile.email || 'admin@ecosched.com';

    if (headerName) headerName.textContent = displayName;
    if (headerRole) headerRole.textContent = roleLabel;

    if (dropdownName) dropdownName.textContent = displayName;
    if (dropdownEmail) dropdownEmail.textContent = profile.email || 'admin@ecosched.com';
    if (dropdownRole) dropdownRole.textContent = roleLabel;
    if (dropdownServiceArea) dropdownServiceArea.textContent = profile.serviceArea || 'Head Office';
    if (dropdownLastLogin) dropdownLastLogin.textContent = formattedLastLogin;

    if (avatarLarge) {
        const initials = getInitials(displayName);
        avatarLarge.textContent = initials;
    }
}

function formatRoleLabel(role) {
    if (!role) return 'System Administrator';
    return role
        .toString()
        .replace(/[_\-]/g, ' ')
        .replace(/\b\w/g, char => char.toUpperCase());
}

function formatLastLogin(value) {
    if (!value) return 'Unavailable';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
        return value;
    }

    return date.toLocaleString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        hour12: true
    });
}

function getInitials(name) {
    if (!name) return 'AU';
    const parts = name.trim().split(' ');
    if (parts.length === 1) {
        return parts[0].charAt(0).toUpperCase();
    }
    return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
}

// Navigate to page
function navigateToPage(page) {
    console.log('Navigating to page:', page);

    // Update active menu item
    const menuItems = document.querySelectorAll('.menu-item');
    menuItems.forEach(item => {
        item.classList.remove('active');
        if (item.dataset.page === page) {
            item.classList.add('active');
        }
    });

    // Update page title
    const pageTitle = document.querySelector('.page-title');
    if (pageTitle) {
        const titles = {
            'dashboard': 'Dashboard',
            'users': 'User Management',

            'bins': 'Sensor Monitoring',
            'bin-locations': 'Bin Locations Map',
            'routes': 'Route Management',
            'schedules': 'Schedule Management',
            'special-collections': 'Special Collections',
            'analytics': 'Analytics & Reports',
            'notifications': 'Notification Center',
            'feedback': 'Resident Feedback',
            'settings': 'System Settings'
        };
        pageTitle.textContent = titles[page] || 'Dashboard';
    }

    // Show/hide content based on page
    const dashboardPage = document.getElementById('dashboard-page');
    const pageContent = document.getElementById('page-content');
    const pageFrame = document.getElementById('pageFrame');

    if (page === 'dashboard') {
        // Show dashboard content
        if (dashboardPage) {
            dashboardPage.style.display = 'block';
        }
        if (pageContent) {
            pageContent.style.display = 'none';
        }
    } else {
        // Hide dashboard content and show iframe
        if (dashboardPage) {
            dashboardPage.style.display = 'none';
        }
        if (pageContent) {
            pageContent.style.display = 'block';
        }

        // Load the specific page in iframe
        const pageUrls = {
            'users': 'users.html',

            'bins': 'bins.html',
            'bin-locations': 'bin-locations.html',
            'schedules': 'schedules.html',
            'special-collections': 'special-collections.html',
            'analytics': 'analytics.html',
            'feedback': 'feedback.html',
            'notifications': 'notifications.html',
            'settings': 'settings.html'
        };

        if (pageUrls[page] && pageFrame) {
            pageFrame.src = pageUrls[page];
            pageFrame.style.display = 'block';
        }
    }

    currentPage = page;
}

// Load dashboard data
async function loadDashboardData() {
    try {
        console.log('Loading dashboard data...');

        // Base stats structure
        let stats = {
            totalUsers: 0,
            adminUsers: 0,
            supervisorUsers: 0,
            collectorUsers: 0,
            activeCollectors: 0,
            activeCollectorsDetail: 0,
            wasteCollected: '0 level',
            serviceAreas: 0,
            onlineSensors: 0,
            offlineSensors: 0,
            totalNotifications: 0,
            feedbackCount: 0,
            specialCount: 0,
            collectorCount: 0
        };

        // Try to load real stats from Firestore
        try {
            if (dbService && dbService.getSystemStats) {
                const { data, error } = await dbService.getSystemStats();
                if (error) throw error;
                if (data) {
                    stats.totalUsers = data.totalUsers ?? 0;
                    stats.adminUsers = data.adminUsers ?? 0;
                    stats.totalCollectorsBreakdown = data.totalCollectors ?? 0;
                    stats.collectorUsers = data.totalCollectors ?? 0;
                    stats.activeCollectors = data.activeCollectors ?? 0;
                    stats.activeCollectorsDetail = data.activeCollectors ?? 0;
                    stats.iotSensors = data.iotUsers ?? stats.iotSensors;
                    stats.serviceAreas = Array.isArray(data.serviceAreas) ? data.serviceAreas.length : stats.serviceAreas;
                    stats.residentUsers = data.residentUsers ?? 0;
                    stats.onlineSensors = data.onlineSensors ?? 0;
                    stats.offlineSensors = data.offlineSensors ?? 0;
                }
            }
        } catch (statsError) {
            console.warn('Failed to load live stats from getSystemStats:', statsError);
        }

        // Fetch Notification Stats separately
        // Fetch Notification Stats + actual Feedback/Special
        try {
            let actualFeedbackCount = 0;
            if (dbService && dbService.getResidentFeedback) {
                const { data: feedbackData } = await dbService.getResidentFeedback(100);
                if (feedbackData) {
                    actualFeedbackCount = feedbackData.filter(f => !f.read || (f.status || 'new').toLowerCase() === 'new').length;
                }
            }

            let actualSpecialCount = 0;
            if (dbService && dbService.getSpecialCollections) {
                const { data: specialData } = await dbService.getSpecialCollections();
                if (specialData) {
                    actualSpecialCount = specialData.filter(s => 
                        !['completed', 'cancelled'].includes((s.status || '').toLowerCase())
                    ).length;
                }
            }

            if (dbService && dbService.getNotifications) {
                const { data: notifications } = await dbService.getNotifications(100, adminProfile?.id);
                if (notifications) {
                    stats.feedbackCount = actualFeedbackCount; // Use actual feedback table
                    stats.specialCount = actualSpecialCount; // Use actual special table
                    stats.collectorCount = notifications.filter(n => n.type === 'bin_alert' && !n.read).length;
                    
                    // Total Notifications = Feedback + Special + Alerts
                    stats.totalNotifications = stats.feedbackCount + stats.specialCount + stats.collectorCount;
                    
                    // Correct Today's count logic
                    const todayStr = new Date().toDateString();
                    stats.todayNotifs = notifications.filter(n => {
                        if (!n.createdAt) return false;
                        let ts = n.createdAt;
                        if (typeof ts === 'string' && !ts.includes('Z') && !ts.includes('+')) {
                            ts += 'Z';
                        }
                        return new Date(ts).toDateString() === todayStr;
                    }).length;
                }
                // Refresh badge count for accuracy
                await updateBadge();
            }
        } catch (notiError) {
            console.error('Error fetching dashboard notification stats:', notiError);
        }

        updateStatsDisplay(stats);

        // Activities will be loaded via real-time subscription in initializeRealtimeDashboard()
        // Show empty state initially
        updateActivitiesDisplay([]);

        // System status will come from real-time monitoring
        // Routes and alerts will come from database queries
        // Empty states shown until data loads

    } catch (error) {
        console.error('Error loading dashboard data:', error);
        showNotification('Failed to load dashboard data', 'error');
    }
}

// Update stats display
function updateStatsDisplay(stats) {
    const statElements = {
        'totalUsers': document.getElementById('totalUsers'),
        'adminUsers': document.getElementById('adminUsers'),
        'totalCollectorsBreakdown': document.getElementById('totalCollectorsBreakdown'),
        'collectorUsers': document.getElementById('collectorUsers'),
        'activeCollectorsDetail': document.getElementById('activeCollectorsDetail'),
        'activeCollectors': document.getElementById('activeCollectors'),
        'onRouteCollectors': document.getElementById('onRouteCollectors'),
        'availableCollectors': document.getElementById('availableCollectors'),
        'wasteCollected': document.getElementById('wasteCollected'),
        'iotSensors': document.getElementById('iotSensors'),
        'serviceAreas': document.getElementById('serviceAreas'),
        'highFillSensors': document.getElementById('highFillSensors'),
        'offlineSensors': document.getElementById('offlineSensors'),
        'onlineSensors': document.getElementById('onlineSensors'),
        'totalNotifications': document.getElementById('totalNotifications'),
        'feedbackCount': document.getElementById('feedbackCount'),
        'specialCount': document.getElementById('specialCount'),
        'collectorCount': document.getElementById('collectorCount'),
        'todayNotifs': document.getElementById('todayCount') // Correct ID for dashboard widget
    };

    Object.keys(statElements).forEach(key => {
        if (statElements[key] && stats[key] !== undefined) {
            statElements[key].textContent = stats[key];
        }
    });
}

// Recalculate and update the total "New Updates" count (sum of all notification sub-types)
function refreshTotalNotifications() {
    const feedbackEl = document.getElementById('feedbackCount');
    const specialEl = document.getElementById('specialCount');
    const collectorEl = document.getElementById('collectorCount');
    const totalEl = document.getElementById('totalNotifications');
    
    if (!totalEl) return;
    
    const feedback = parseInt(feedbackEl?.textContent || '0');
    const special = parseInt(specialEl?.textContent || '0');
    const collector = parseInt(collectorEl?.textContent || '0');
    
    totalEl.textContent = feedback + special + collector;
}

// Update activities display
function updateActivitiesDisplay(activities) {
    const activityList = document.getElementById('activityList');
    if (!activityList) return;

    activityList.innerHTML = '';

    if (!activities || activities.length === 0) {
        // Show empty state
        activityList.innerHTML = `
            <div class="empty-state" style="text-align: center; padding: 40px 20px; color: #9ca3af;">
                <i class="fas fa-inbox" style="font-size: 48px; margin-bottom: 16px; opacity: 0.5;"></i>
                <p style="margin: 0; font-size: 14px;">No recent activities</p>
                <p style="margin: 8px 0 0; font-size: 12px;">Activities will appear here in real-time</p>
            </div>
        `;
        return;
    }

    activities.forEach(activity => {
        const activityItem = document.createElement('div');
        activityItem.className = 'activity-item';
        activityItem.innerHTML = `
            <div class="activity-icon">
                <i class="fas ${activity.icon}"></i>
            </div>
            <div class="activity-content">
                <p>${activity.text}</p>
                <span class="activity-time">${activity.time}</span>
            </div>
        `;
        activityList.appendChild(activityItem);
    });
}

// Refresh system status with actual connectivity checks
async function refreshSystemStatus() {
    console.log('🔄 Refreshing system status...');
    const statusList = document.getElementById('systemStatusList');
    if (!statusList) return;

    const services = [
        { name: 'Database Service', type: 'db' },
        { name: 'Authentication', type: 'auth' },
        { name: 'Realtime Engine', type: 'realtime' },
        { name: 'IoT Sensor Network', type: 'sensors' }
    ];

    const statusItems = [];

    for (const service of services) {
        const startTime = performance.now();
        let status = 'online';
        let response = '0ms';

        try {
            if (service.type === 'db') {
                // Simple health check query
                const { error } = await supabase.from(TABLES.USERS).select('id').limit(1);
                if (error) throw error;
            } else if (service.type === 'auth') {
                const { error } = await supabase.auth.getSession();
                if (error) throw error;
            } else if (service.type === 'realtime') {
                // Check if supabase client has an active channel
                if (!supabase.channel('health-check')) status = 'warning';
            } else if (service.type === 'sensors') {
                // Check last heartbeat from any bin
                const { data, error } = await supabase
                    .from(TABLES.BINS || 'bins')
                    .select('updated_at')
                    .order('updated_at', { ascending: false })
                    .limit(1)
                    .single();

                if (error && error.code !== 'PGRST116') throw error; // Ignore "no rows" error

                if (data) {
                    const lastUpdate = new Date(data.updated_at);
                    const now = new Date();
                    const diffMinutes = (now - lastUpdate) / 1000 / 60;

                    if (diffMinutes > 60) {
                        status = 'offline';
                        response = '> 1h ago';
                    } else if (diffMinutes > 5) {
                        status = 'warning';
                        response = `${Math.floor(diffMinutes)}m ago`;
                    } else {
                        status = 'online';
                        response = 'Active';
                    }
                } else {
                    status = 'offline';
                    response = 'No Data';
                }

                // Skip default response time calculation for sensors
                statusItems.push({
                    name: service.name,
                    status: status,
                    response: response
                });
                continue;
            }

            const endTime = performance.now();
            response = `${Math.round(endTime - startTime)}ms`;
        } catch (error) {
            console.error(`Status check failed for ${service.name}:`, error?.message || JSON.stringify(error));
            status = 'offline';
            response = 'Error';
        }

        statusItems.push({
            name: service.name,
            status: status,
            response: response
        });
    }

    updateSystemStatusDisplay(statusItems);
    showNotification('System status refreshed', 'success');
}

// Update system status display
function updateSystemStatusDisplay(statusItems) {
    const statusList = document.getElementById('systemStatusList');
    if (!statusList) return;

    statusList.innerHTML = statusItems.map(item => `
        <div class="status-item">
            <div class="status-indicator ${item.status}"></div>
            <span>${item.name}</span>
            <span class="status-value">${item.status.charAt(0).toUpperCase() + item.status.slice(1)}</span>
            <span class="status-response">${item.response}</span>
        </div>
    `).join('');
}

// Update route monitoring display
function updateRouteMonitoringDisplay(routes) {
    const routeMonitoring = document.querySelector('.route-monitoring');
    if (!routeMonitoring) return;

    routeMonitoring.innerHTML = '';

    routes.forEach(route => {
        const routeItem = document.createElement('div');
        routeItem.className = 'route-item';

        const statusIcon = route.progress === 100 ? 'fa-check-circle' : 'fa-truck';
        const statusText = route.progress === 100 ? 'Finished' : route.eta;

        routeItem.innerHTML = `
            <div class="route-info">
                <div class="route-name">${route.name}</div>
                <div class="route-progress">
                    <div class="progress-bar">
                        <div class="progress-fill" style="width: ${route.progress}%"></div>
                    </div>
                    <span class="progress-text">${route.progress}% Complete</span>
                </div>
            </div>
            <div class="route-status">
                <div class="collector-info">
                    <i class="fas ${statusIcon}"></i>
                    <span>${route.collector}</span>
                </div>
                <div class="eta">ETA: ${statusText}</div>
            </div>
        `;
        routeMonitoring.appendChild(routeItem);
    });
}

// Update sensor alerts display
function updateSensorAlertsDisplay(alerts) {
    const sensorAlerts = document.getElementById('sensorAlerts');
    if (!sensorAlerts) return;

    sensorAlerts.innerHTML = '';

    alerts.forEach(alert => {
        const alertItem = document.createElement('div');
        alertItem.className = `alert-item ${alert.type}`;
        alertItem.innerHTML = `
            <div class="alert-icon">
                <i class="fas ${alert.icon}"></i>
            </div>
            <div class="alert-content">
                <div class="alert-title">${alert.title}</div>
                <div class="alert-location">${alert.location}</div>
                <div class="alert-time">${alert.time}</div>
            </div>
            <div class="alert-action">
                <button class="btn-small">Schedule</button>
            </div>
        `;
        sensorAlerts.appendChild(alertItem);
    });
}

// Toggle sidebar for mobile
function toggleSidebar() {
    const sidebar = document.querySelector('.sidebar');
    const overlay = document.querySelector('.sidebar-overlay');

    if (sidebar) {
        sidebar.classList.toggle('open');

        if (overlay) {
            overlay.classList.toggle('show');
        }
    }
}

// Close sidebar when clicking overlay
function closeSidebar() {
    const sidebar = document.querySelector('.sidebar');
    const overlay = document.querySelector('.sidebar-overlay');

    if (sidebar) {
        sidebar.classList.remove('open');
    }

    if (overlay) {
        overlay.classList.remove('show');
    }
}

// Handle search
function handleSearch(e) {
    const searchTerm = e.target.value.toLowerCase().trim();
    console.log('Searching for:', searchTerm);

    // For now, implement client-side filtering on the main dashboard only
    if (currentPage !== 'dashboard') {
        return;
    }

    applyDashboardSearchFilter(searchTerm);
}

// Notification Logic
async function initializeNotifications() {
    console.log('🔔 Initializing notifications...');

    // Subscribe to real-time updates
    if (realtime && realtime.subscribeToNotifications && !notificationsUnsubscribe) {
        notificationsUnsubscribe = realtime.subscribeToNotifications(async (items) => {
            console.log('🔔 Notification update received:', items);
            updateNotificationUI(items);
            updateSidebarDots(items);
            // Also update the badge count directly from DB for accuracy
            await updateBadge();
        }, adminProfile?.id);
    }
    
    // Initial badge update
    await updateBadge();
}

// Expose updateBadge globally for iframes
window.updateBadge = async function() {
    try {
        const adminId = adminProfile?.id || getStoredAdminProfile()?.id;
        if (!adminId) {
            console.warn('⚠️ No admin ID available for badge update');
            return;
        }

        if (dbService && dbService.getNotificationCounts) {
            const { unread } = await dbService.getNotificationCounts(adminId);
            const badge = document.getElementById('notificationBadge');
            if (badge) {
                badge.textContent = unread;
                badge.style.display = unread > 0 ? 'block' : 'none';
            }
        }
    } catch (error) {
        console.error('Error updating badge:', error);
    }
};

const updateBadge = window.updateBadge;

async function initializeSidebarNotifications() {
    console.log('📊 Initializing sidebar notifications...');
    try {
        if (dbService && dbService.getNotifications) {
            const { data, error } = await dbService.getNotifications(100, adminProfile?.id);
            if (!error && data) {
                updateSidebarDots(data);
            }
        }
    } catch (error) {
        console.error('Error initializing sidebar dots:', error);
    }
}

function updateSidebarDots(notifications) {
    if (!notifications) return;

    const unreadNotifications = notifications.filter(n => !n.read);
    
    // Select sidebar menu items
    const menuItems = {
        'users': document.querySelector('.menu-item[data-page="users"]'),
        'special-collections': document.querySelector('.menu-item[data-page="special-collections"]'),
        'feedback': document.querySelector('.menu-item[data-page="feedback"]'),
        'notifications': document.querySelector('.menu-item[data-page="notifications"]')
    };

    // Reset all dots
    Object.values(menuItems).forEach(item => {
        if (item) {
            item.classList.remove('has-notification');
            let dot = item.querySelector('.notification-dot');
            if (!dot) {
                dot = document.createElement('span');
                dot.className = 'notification-dot';
                item.appendChild(dot);
            }
        }
    });

    // Apply dots based on unread notification types
    unreadNotifications.forEach(noti => {
        const type = noti.type;
        if (type === 'new_user' && menuItems['users']) {
            menuItems['users'].classList.add('has-notification');
        } else if (type === 'special_collection' && menuItems['special-collections']) {
            menuItems['special-collections'].classList.add('has-notification');
        } else if (type === 'feedback' && menuItems['feedback']) {
            menuItems['feedback'].classList.add('has-notification');
        } else if (type === 'bin_alert' || type === 'alert') {
            // General notifications for bin alerts
            if (menuItems['notifications']) {
                menuItems['notifications'].classList.add('has-notification');
            }
        }
    });

    // General notifications dot (if any unread exists at all)
    if (unreadNotifications.length > 0 && menuItems['notifications']) {
        menuItems['notifications'].classList.add('has-notification');
    }
}


function applyDashboardSearchFilter(term) {
    const normalized = (term || '').toLowerCase().trim();

    // Elements to filter: top stat cards, dashboard cards, and recent activities
    const statCards = document.querySelectorAll('.stats-grid .stat-card');
    const dashboardCards = document.querySelectorAll('.dashboard-grid .dashboard-card');
    const activityItems = document.querySelectorAll('#activityList .activity-item');

    const shouldClear = normalized.length < 3;

    const matches = (el) => {
        if (!el) return false;
        const text = el.textContent || '';
        return text.toLowerCase().includes(normalized);
    };

    // Helper to show/hide a node
    const setVisible = (el, visible) => {
        if (!el) return;
        el.style.display = visible ? '' : 'none';
    };

    // If search term too short, reset everything
    if (shouldClear) {
        statCards.forEach((card) => setVisible(card, true));
        dashboardCards.forEach((card) => setVisible(card, true));
        activityItems.forEach((item) => setVisible(item, true));
        return;
    }

    statCards.forEach((card) => setVisible(card, matches(card)));
    dashboardCards.forEach((card) => setVisible(card, matches(card)));
    activityItems.forEach((item) => setVisible(item, matches(item)));
}

// Toggle user menu
function toggleUserMenu(event) {
    if (event) {
        event.stopPropagation();
    }

    const dropdown = document.getElementById('userMenuDropdown');
    if (dropdown) {
        dropdown.classList.toggle('show');
    }
}

function closeUserMenu() {
    const dropdown = document.getElementById('userMenuDropdown');
    if (dropdown) {
        dropdown.classList.remove('show');
    }
}

function handleUserMenuOutsideClick(event) {
    const menu = document.getElementById('userMenu');
    if (!menu) return;

    if (!menu.contains(event.target)) {
        closeUserMenu();
    }
}

// "View All" button on Recent Activity card
function loadMoreActivities() {
    // Navigate to the Analytics & Reports page where more detailed
    // activity and performance views can be added.
    navigateToPage('analytics');
}


// "View Map" button on Live Route Monitoring card
function openRouteMap() {
    // Jump directly to the Routes Management page to see the full
    // route list and details.
    navigateToPage('routes');
}

// Logout function
function logout() {
    if (confirm('Are you sure you want to logout?')) {
        // Clear localStorage
        localStorage.removeItem('adminLoggedIn');
        localStorage.removeItem('userData');

        // Redirect to login page
        window.location.href = 'index.html';
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
    
    .page-content {
        height: calc(100vh - 80px);
        overflow: hidden;
    }
`;
document.head.appendChild(notificationStyles);

/**
 * Triggers a push notification to collectors in the bin's barangay
 * when a bin is detected as full (>= 60%).
 */
async function triggerBinFullNotification(bin) {
    const rawAddress = bin.address || '';
    // Extract "Victoria" from "Barangay Victoria"
    const barangay = rawAddress.replace(/Barangay\s+/i, '').trim();

    if (!barangay || barangay.toLowerCase() === 'no location' || barangay === '') {
        console.warn(`⚠️ [Bin Alert] Skipping notification for ${bin.bin_id}: No valid barangay address.`);
        return;
    }

    console.log(`🚀 [Bin Alert] Finding collectors in ${barangay} for bin ${bin.bin_id}`);

    try {
        const SUPABASE_URL = 'https://bfqktqtsjchbmopafgzf.supabase.co';
        const SUPABASE_ANON_KEY = 'sb_publishable_ucEKoeLHhbxBVtzDABvVIg_eKIhIQ31';

        // 1. Resolve collectors for this barangay locally in the dashboard
        const { data: collectors, error: userError } = await supabase
            .from(TABLES.USERS)
            .select('id')
            .eq('barangay', barangay)
            .eq('role', 'collector');

        if (userError || !collectors || collectors.length === 0) {
            console.warn(`⚠️ [Bin Alert] No collectors found in database for barangay: ${barangay}`);
            if (userError) console.error('Database error:', userError);
            return;
        }

        console.log(`📍 [Bin Alert] Found ${collectors.length} collector(s) to notify.`);

        for (const collector of collectors) {
            // 2. Create persistent record in user_notifications (for the app's alert list)
            supabase.from(TABLES.NOTIFICATIONS).insert({
                user_id: collector.id,
                barangay: barangay,
                title: '🚨 Bin Full Alert',
                message: `In ${barangay}, bin ${bin.bin_id} is full! Please collect waste to prevent overflow.`,
                type: 'alert',
                is_read: false,
                created_at: new Date().toISOString()
            }).then(({ error }) => {
                if (error) console.error(`❌ [Bin Alert] DB insert failed for ${collector.id}:`, error);
                else console.log(`✅ [Bin Alert] DB record created for ${collector.id}`);
            });

            // 3. Send Push via Edge Function using resident_id (compatibility mode)
            fetch(`${SUPABASE_URL}/functions/v1/send-push`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
                },
                body: JSON.stringify({
                    resident_id: collector.id, // Mandatory key for the Edge Function lookup
                    title: '🚨 Bin Full Alert',
                    body: `In ${barangay}, bin ${bin.bin_id} is full! Please collect waste to prevent overflow.`,
                }),
            }).then(async (res) => {
                const resData = await res.json();
                console.log(`📲 [Bin Alert] Push sent to ${collector.id}:`, resData);
            }).catch(e => console.error(`💥 [Bin Alert] Push failed for ${collector.id}:`, e));
        }

        if (typeof showNotification === 'function') {
            showNotification(`Notifying ${collectors.length} collectors in ${barangay} about ${bin.bin_id}`, 'info');
        }
    } catch (err) {
        console.error(`💥 [Bin Alert] Critical error in notification flow:`, err);
    }
}

function updateBinMonitoringDisplay(bins) {
    const binList = document.getElementById('liveBinList');
    if (!binList) return;

    if (!bins || bins.length === 0) {
        binList.innerHTML = `
            <div class="empty-state" style="text-align:center;padding:20px;color:#9ca3af;">
                <i class="fas fa-trash" style="font-size:20px;margin-bottom:8px;"></i>
                <p style="margin:0;font-size:13px;">No active sensors found.</p>
            </div>`;
        return;
    }

    // ✅ STEP 1 — Calculate sensorStatus ONCE
    const now = Date.now();

    bins.forEach(bin => {
        let sensorStatus = "offline";

        if (bin.updated_at) {
            const diffSeconds =
                (now - new Date(bin.updated_at).getTime()) / 1000;
            
            // Allow up to 120 seconds of delay between heartbeats
            if (diffSeconds <= 120) {
                sensorStatus = "online";
            }
        }

        bin.sensorStatus = sensorStatus;

        // --- BIN FULL NOTIFICATION LOGIC ---
        const binKey = bin.bin_id || bin.id;

        // Trigger notification if bin is online and marked as full by firmware
        if (sensorStatus === "online" && bin.bin_status === "full") {
            if (!notifiedBins.has(binKey)) {
                notifiedBins.add(binKey);
                triggerBinFullNotification(bin);
            }
        } else if (bin.bin_status === "normal") {
            // Reset tracking once the bin level is normal
            if (notifiedBins.has(binKey)) {
                console.log(`♻️ [Bin Alert] Resetting notification flag for ${binKey}`);
                notifiedBins.delete(binKey);
            }
        }
        // ------------------------------------
    });

    // ✅ STEP 2 — Sort AFTER calculating status
    bins.sort((a, b) => {

        const getPriority = (bin) => {
            if (bin.sensorStatus === "offline") return 3;
            if (bin.bin_status === "full") return 1;
            return 2;
        };

        return getPriority(a) - getPriority(b);
    });

    // ✅ STEP 3 — Render
    binList.innerHTML = bins.map(bin => {

        const level = bin.fill_level ?? 0;
        const sensorStatus = bin.sensorStatus;

        // 🔘 Grey when offline
        let statusText;
        let statusBg;
        let statusColor;

        if (sensorStatus === "offline") {
            statusText = "Normal";
            statusBg = "#e5e7eb";
            statusColor = "#6b7280";
        } else {
            const isFull = (bin.bin_status || '').toLowerCase() === 'full';
            
            statusText = isFull ? "Full" : "Normal";
            statusBg = isFull ? "#fee2e2" : "#d1fae5";
            statusColor = isFull ? "#991b1b" : "#065f46";
        }

        const onlineIndicator =
            sensorStatus === "online"
                ? `<span style="color:#10b981;font-size:12px;font-weight:600;">
                        ● Online
                   </span>`
                : `<span style="color:#9ca3af;font-size:12px;font-weight:600;">
                        ● Offline
                   </span>`;

        return `
            <div class="bin-item">
                <div class="bin-header">
                    <div class="bin-id">
                        <i class="fas fa-trash-alt" style="color:#4b5563;"></i>
                        <span>${bin.bin_id}</span>
                    </div>
                    ${onlineIndicator}
                </div>

                <div class="bin-location">
                    <i class="fas fa-map-marker-alt" style="font-size:10px;margin-right:4px;"></i>
                    ${bin.address || 'No location'}
                </div>

                <div style="margin-top:10px;">
                    <span style="
                        display:inline-block;
                        padding:6px 14px;
                        border-radius:20px;
                        font-size:12px;
                        font-weight:600;
                        background:${statusBg};
                        color:${statusColor};
                    ">
                        ${statusText}
                    </span>
                </div>
            </div>
        `;
    }).join('');
}
function openBinModal(bin) {

    document.getElementById('tel-distance').textContent =
        `${bin.distance || 0} cm`;

    document.getElementById('tel-fill').textContent =
        `${bin.fill_level || 0} %`;

    document.getElementById('tel-gps-status').textContent =
        bin.gps_status || 'Searching...';

    document.getElementById('tel-gps-sentences').textContent =
        bin.gps_sentences || 0;

    document.getElementById('tel-gps-processed').textContent =
        bin.gps_processed || 0;

    const errorContainer = document.getElementById('tel-gps-error-container');
    const errorText = document.getElementById('tel-gps-error');

    if (bin.gps_error) {
        errorContainer.style.display = 'block';
        errorText.textContent = bin.gps_error;
    } else {
        errorContainer.style.display = 'none';
    }

    document.getElementById('tel-updated').textContent =
        bin.updated_at
            ? new Date(bin.updated_at).toLocaleString()
            : 'Never';

    modal.classList.add('show');
}

supabase
    .channel('bins-changes')
    .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'bins' },
        (payload) => {
            loadBins();
        }
    )
    .subscribe();
function closeTelemetryModal() {
    modal.classList.remove('show');
}
async function loadBins() {
    const { data, error } = await supabase
        .from("bins")
        .select("*");

    if (!error) {
        updateBinMonitoringDisplay(data);
    } else {
        console.error(error);
    }
}
// Dropdown and Notification Helpers
function closeNotificationDropdown() {
    const dropdown = document.getElementById('notificationDropdown');
    if (dropdown) {
        dropdown.classList.remove('show');
    }
}

function handleNotificationOutsideClick(e) {
    const dropdown = document.getElementById('notificationDropdown');
    const button = document.getElementById('notificationBtn');
    if (dropdown && dropdown.classList.contains('show')) {
        if (!dropdown.contains(e.target) && !button.contains(e.target)) {
            closeNotificationDropdown();
        }
    }
}

async function markAllNotificationsAsRead() {
    try {
        const adminId = adminProfile?.id || getStoredAdminProfile()?.id;
        if (!adminId) return;

        const { error } = await supabase
            .from(TABLES.NOTIFICATIONS)
            .update({ is_read: true })
            .eq('user_id', adminId)
            .eq('is_read', false);

        if (error) throw error;
        
        // Refresh UI
        if (typeof updateBadge === 'function') await updateBadge();
        showNotification('All notifications marked as read', 'success');
    } catch (error) {
        console.error('Error marking all as read:', error);
        showNotification('Failed to mark notifications as read', 'error');
    }
}

function updateNotificationUI(notifications) {
    const list = document.getElementById('dropdownNotificationList');
    if (!list) return;

    if (!notifications || notifications.length === 0) {
        list.innerHTML = '<div class="empty-notifications"><p>No new notifications</p></div>';
        return;
    }

    list.innerHTML = notifications
        .slice(0, 5)
        .map(n => `
            <div class="notification-item ${n.read ? '' : 'unread'}">
                <div class="notification-icon">
                    <i class="fas fa-${getNotificationIcon(n.type)}"></i>
                </div>
                <div class="notification-details">
                    <p class="notification-title">${n.title}</p>
                    <p class="notification-msg">${n.message}</p>
                    <span class="notification-time">${utils ? utils.getRelativeTime(n.createdAt) : 'Just now'}</span>
                </div>
            </div>
        `).join('');
}

/**
 * Refresh the total notification count (All Updates)
 * Calculates the sum of feedback, special collections, and bin alerts
 */

// Export functions for global access
window.navigateToPage = navigateToPage;
window.logout = logout;
window.toggleSidebar = toggleSidebar;
window.loadMoreActivities = loadMoreActivities;
window.refreshSystemStatus = refreshSystemStatus;
window.openRouteMap = openRouteMap;
window.closeTelemetryModal = closeTelemetryModal;
setInterval(() => {
    loadBins();
}, 2000);            // run once when page loads