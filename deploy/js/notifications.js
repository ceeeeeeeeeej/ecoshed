// Notifications page functionality
import { dbService, realtime, utils } from '../../config/supabase_config.js';

console.log('🔔 Notifications page loaded');

// Notifications storage
let notifications = [];
let filteredNotifications = [];
let sensorSubscription = null;
let currentAdminId = null;
let pendingRead = new Set(); // Track IDs currently being marked as read

// Get current user ID from localStorage
function getCurrentAdminId() {
    try {
        const rawData = localStorage.getItem('userData');
        if (rawData) {
            const parsed = JSON.parse(rawData);
            // Support multiple possible key names for maximum robustness
            const id = parsed.uid || parsed.id || parsed.userId || null;
            return id ? String(id).toLowerCase() : null;
        }
    } catch (e) {
        console.error('Error parsing user data:', e);
    }
    return null;
}

// Initialize page
document.addEventListener('DOMContentLoaded', function () {
    console.log('🔔 Initializing notifications page...');
    currentAdminId = getCurrentAdminId();
    loadNotifications();
    setupRealtimeSubscription();
});

// Cleanup subscriptions on page unload
window.addEventListener('beforeunload', () => {
    if (sensorSubscription) {
        sensorSubscription.unsubscribe();
    }
});

// Load notifications from Supabase
async function loadNotifications() {
    console.log('🔄 Loading notifications...');

    const [personalReq, communityReq] = await Promise.all([
        dbService.getNotifications(100, currentAdminId),
        dbService.getCommunityNotifications(50)
    ]);

    const { data: dbNotifications, error: dbError } = personalReq;
    const { data: communityNotifs, error: commError } = communityReq;

    if (dbError) console.error('❌ Error fetching notifications:', dbError);
    if (commError) console.error('❌ Error fetching announcements:', commError);

    // Map personal notifications
    const personalMapped = (dbNotifications || []).map(n => ({
        ...n,
        timestamp: n.createdAt || n.timestamp,
        priority: n.priority || 'low',
        source: 'personal',
        read: pendingRead.has(n.id) ? true : n.read
    }));

    // Map community notifications
    const communityMapped = (communityNotifs || []).map(n => ({
        ...n,
        timestamp: n.createdAt,
        type: 'system',
        priority: 'medium',
        source: 'community',
        read: true // Community announcements are default read for admins
    }));

    // Sort and store
    notifications = [...personalMapped, ...communityMapped]
        .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
        .slice(0, 100);

    await renderNotifications();
}

// Setup real-time subscription
function setupRealtimeSubscription() {
    if (!realtime || !realtime.subscribeToNotifications) {
        console.warn('⚠️ Realtime notification subscription not available');
        return;
    }

    try {
        sensorSubscription = realtime.subscribeToNotifications(async (data, payload) => {
            console.log('🔔 Notification change detected');
            loadNotifications(); // Simplified reload
        }, currentAdminId);

        console.log('📡 Notification subscription active');
    } catch (error) {
        console.error('❌ Failed to setup subscription:', error);
    }
}

// Render notifications list
async function renderNotifications(skipStatUpdate = false) {
    if (!skipStatUpdate) {
        await updateStats();
    }
    const container = document.getElementById('notificationsList');

    if (notifications.length === 0) {
        container.innerHTML = `
            <div style="text-align: center; padding: 60px 20px; color: #9CA3AF;">
                <i class="fas fa-bell-slash" style="font-size: 48px; margin-bottom: 16px; opacity: 0.5;"></i>
                <p style="font-size: 18px; margin: 0;">No notifications found</p>
            </div>
        `;
        return;
    }

    container.innerHTML = notifications.map(notif => {
        const timeStr = utils.getRelativeTime(notif.timestamp);
        const priorityClass = notif.priority || 'low';
        const readClass = notif.read ? 'read' : 'unread';

        // Get icon and class based on type
        let icon = '<i class="fas fa-bell"></i>';
        let iconClass = 'system';
        
        if (notif.type === 'feedback') {
            icon = '<i class="fas fa-comment-alt"></i>';
            iconClass = 'user';
        } else if (notif.type === 'special_collection' || notif.type === 'pickup_request') {
            icon = '<i class="fas fa-truck-loading"></i>';
            iconClass = 'collector';
        } else if (notif.type === 'bin_alert' || notif.type === 'alert') {
            icon = '<i class="fas fa-exclamation-triangle"></i>';
            iconClass = 'iot';
        } else if (notif.type === 'new_user') {
            icon = '<i class="fas fa-user-plus"></i>';
            iconClass = 'user';
        }

        return `
            <div class="notification-item ${readClass} priority-${priorityClass}" data-id="${notif.id}" onclick="handleNotificationClick(event, '${notif.id}', ${notif.read}, '${notif.type}')">
                <div class="notification-icon ${iconClass}">
                    ${icon}
                </div>
                <div class="notification-content">
                    <div class="notification-header">
                        <h4 class="notification-title">${notif.title}</h4>
                        <span class="notification-time">${timeStr}</span>
                    </div>
                    <p class="notification-message">${notif.message}</p>
                </div>
            </div>
        `;
    }).join('');
}

// Mark notification as read
window.markAsRead = async function (id) {
    console.log('🔄 Marking as read:', id);
    if (pendingRead.has(id)) return;
    
    // OPTIMISTIC UPDATE: Update local state immediately
    const notif = notifications.find(n => n.id === id);
    if (notif && !notif.read) {
        pendingRead.add(id); // Lock this ID as read
        notif.read = true;
        
        // Update counts LOCALLY
        const elUnread = document.getElementById('unreadCount');
        if (elUnread) {
            const currentCount = parseInt(elUnread.textContent) || 0;
            elUnread.textContent = Math.max(0, currentCount - 1);
        }
        
        // Re-render list
        await renderNotifications(true); 
        
        // Update database
        const { error } = await dbService.updateNotification(id, { read: true });
        
        // Delay clearing from pendingRead to ensure realtime events have passed
        setTimeout(() => {
            pendingRead.delete(id);
        }, 3000);

        if (error) {
            console.error('❌ Failed to update DB:', error);
            pendingRead.delete(id); // Immediate revert on error
        }
        
        // Notify parent dashboard to update its badge
        if (window.parent && typeof window.parent.updateBadge === 'function') {
            await window.parent.updateBadge();
        }
    }
};

// Handle clicking on the entire notification item
window.handleNotificationClick = async function (event, id, isRead, type) {
    console.log('👆 Notification clicked:', { id, isRead, type });
    
    // Don't trigger if a button was clicked
    if (event.target.closest('button')) {
        return;
    }

    if (!isRead) {
        await markAsRead(id); 
        // Small 100ms delay to ensure the fetch request is fully "finalized" 
        // by the browser network stack before we destroy the iframe via navigation
        await new Promise(resolve => setTimeout(resolve, 100));
    }

    // Navigation logic based on type
    if (window.parent && typeof window.parent.navigateToPage === 'function') {
        if (type === 'special_collection') {
            window.parent.navigateToPage('special-collections');
        } else if (type === 'feedback') {
            window.parent.navigateToPage('feedback');
        } else if (type === 'new_user') {
            window.parent.navigateToPage('users');
        } else if (type === 'alert') {
            window.parent.navigateToPage('dashboard');
        }
    }
};

window.markAllRead = async function () {
    console.log('🔄 Marking all as read...');
    const { data: dbNotifications } = await dbService.getNotifications(100, currentAdminId);
    const unreadIds = (dbNotifications || []).filter(n => !n.read).map(n => n.id);

    for (const id of unreadIds) {
        await dbService.updateNotification(id, { read: true });
    }

    notifications.forEach(n => n.read = true);
    await renderNotifications();
    
    // Notify parent dashboard to update its badge
    if (window.parent && typeof window.parent.updateBadge === 'function') {
        await window.parent.updateBadge();
    }
};

// Delete notification
window.deleteNotification = async function (id) {
    console.log('🔄 Deleting notification:', id);
    const { success, error } = await dbService.deleteNotification(id);

    if (!success) {
        console.error('❌ Failed to delete notification:', error);
        return;
    }

    notifications = notifications.filter(n => n.id !== id);
    renderNotifications();
};

// Update statistics
async function updateStats() {
    try {
        const adminId = getCurrentAdminId();
        if (!adminId) return; // Don't fetch if no admin context
        
        // Get true unread counts from DB for accurate reporting
        const { unread: trueUnread } = await dbService.getNotificationCounts(adminId);
        
        const total = notifications.length; // Total loaded in list
        const unread = trueUnread;

        const now = new Date();
        const todayStr = now.toDateString();
        
        const todayCount = notifications.filter(n => {
            if (!n.timestamp) return false;
            let ts = n.timestamp;
            if (typeof ts === 'string' && !ts.includes('Z') && !ts.includes('+')) {
                ts += 'Z';
            }
            return new Date(ts).toDateString() === todayStr;
        }).length;

        const elTotal = document.getElementById('totalCount');
        const elUnread = document.getElementById('unreadCount');
        const elToday = document.getElementById('todayCount');
        
        if (elTotal) elTotal.textContent = total;
        if (elUnread) elUnread.textContent = unread;
        if (elToday) elToday.textContent = todayCount;
    } catch (error) {
        console.error('Error updating notification stats:', error);
    }
}

// Cleanup: remove local saving logic since we use DB now
function saveNotifications() {
    // No longer needed
}


// Helper: Get priority icon
function getPriorityIcon(priority) {
    switch (priority) {
        case 'urgent': return '<i class="fas fa-exclamation-circle"></i>';
        case 'high': return '<i class="fas fa-exclamation-triangle"></i>';
        case 'medium': return '<i class="fas fa-info-circle"></i>';
        default: return '<i class="fas fa-bell"></i>';
    }
}

// Modal functions (if needed)
// Utility: Open/Close Modals
window.openSettingsModal = function () {
    const savedSettings = JSON.parse(localStorage.getItem('notificationSettings')) || {};
    // Load state (simplified for demo)
    document.getElementById('settingsModal').style.display = 'flex';
};

window.closeSettingsModal = function () {
    document.getElementById('settingsModal').style.display = 'none';
};

window.saveSettings = function () {
    // Simply save a flag for now
    localStorage.setItem('notificationSettings', JSON.stringify({ updated: new Date() }));
    closeSettingsModal();
    showToast('Settings saved successfully', 'success');
};

// Send Notification Logic
window.openSendModal = function () {
    document.getElementById('sendModal').style.display = 'flex';
};

window.closeSendModal = function () {
    document.getElementById('sendModal').style.display = 'none';
};

window.sendNotification = async function () {
    const title = document.getElementById('sendTitle').value;
    const message = document.getElementById('sendMessage').value;
    const target = document.getElementById('sendTarget').value;

    if (!title || !message) {
        alert('Please fill in title and message');
        return;
    }

    const { error } = await dbService.createAnnouncement({
        title,
        message,
        targetAudience: target
    });

    if (error) {
        console.error('Failed to send:', error);
        alert('Failed to send notification');
    } else {
        closeSendModal();
        // Reset form
        document.getElementById('sendTitle').value = '';
        document.getElementById('sendMessage').value = '';
        loadNotifications(); // Reload to show new announcement if applicable
        alert('Notification sent successfully!');
    }
};

// Helper to show simplified toast (if not existing in main.js)
function showToast(msg, type = 'info') {
    // Placeholder if main toast logic isn't accessible, or implement simple alert
    console.log(`[TOAST] ${type}: ${msg}`);
}

