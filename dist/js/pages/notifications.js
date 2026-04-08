/* Build: 1.0.0 - 2026-03-17T12:48:30.516Z */
// Notifications page functionality
import { dbService, realtime } from '../../config/supabase_config.js';

console.log('🔔 Notifications page loaded');

// Notifications storage
let notifications = [];
let filteredNotifications = [];
let sensorSubscription = null;

// Initialize page
document.addEventListener('DOMContentLoaded', function () {
    console.log('🔔 Initializing notifications page...');
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
        dbService.getGenericNotifications(100),
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
        source: 'personal'
    }));

    // Map community notifications
    const communityMapped = (communityNotifs || []).map(n => ({
        ...n,
        timestamp: n.createdAt,
        type: 'system',
        priority: 'medium',
        source: 'community'
    }));

    // Sort and store
    notifications = [...personalMapped, ...communityMapped]
        .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
        .slice(0, 100);

    renderNotifications();
}

// Setup real-time subscription
function setupRealtimeSubscription() {
    if (!realtime || !realtime.subscribeToGenericNotifications) {
        console.warn('⚠️ Realtime notification subscription not available');
        return;
    }

    try {
        sensorSubscription = realtime.subscribeToGenericNotifications(async (data, payload) => {
            console.log('🔔 Notification change detected');
            loadNotifications(); // Simplified reload
        });

        console.log('📡 Notification subscription active');
    } catch (error) {
        console.error('❌ Failed to setup subscription:', error);
    }
}

// Render notifications list
function renderNotifications() {
    updateStats();
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
        const timeStr = formatNotificationTime(notif.timestamp);
        const priorityClass = notif.priority || 'low';
        const readClass = notif.read ? 'read' : 'unread';

        return `
            <div class="notification-item ${readClass} priority-${priorityClass}" data-id="${notif.id}" onclick="handleNotificationClick(event, '${notif.id}', ${notif.read})">
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
    const { error } = await dbService.updateNotification(id, { read: true });

    if (error) {
        console.error('❌ Failed:', error);
        return;
    }

    const notif = notifications.find(n => n.id === id);
    if (notif) {
        notif.read = true;
        renderNotifications();
    }
};

// Handle clicking on the entire notification item
window.handleNotificationClick = function (event, id, isRead) {
    // Don't trigger if a button was clicked
    if (event.target.closest('button')) {
        return;
    }

    if (!isRead) {
        markAsRead(id);
    }
};

// Mark all as read
window.markAllRead = async function () {
    console.log('🔄 Marking all as read...');
    const unreadIds = notifications.filter(n => !n.read).map(n => n.id);

    for (const id of unreadIds) {
        await dbService.updateNotification(id, { read: true });
    }

    notifications.forEach(n => n.read = true);
    renderNotifications();
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
function updateStats() {
    const total = notifications.length;
    const unread = notifications.filter(n => !n.read).length;
    const today = notifications.filter(n => {
        const notifDate = new Date(n.timestamp);
        const todayDate = new Date();
        return notifDate.toDateString() === todayDate.toDateString();
    }).length;

    const elTotal = document.getElementById('totalCount');
    const elUnread = document.getElementById('unreadCount');
    const elToday = document.getElementById('todayCount');
    
    if (elTotal) elTotal.textContent = total;
    if (elUnread) elUnread.textContent = unread;
    if (elToday) elToday.textContent = today;
}

// Cleanup: remove local saving logic since we use DB now
function saveNotifications() {
    // No longer needed
}

// Helper: Format notification time (Descriptive)
function formatNotificationTime(timestamp) {
    if (!timestamp) return 'Unknown time';
    const date = new Date(timestamp);
    
    // Format: Month DD, YYYY, HH:MM AM/PM
    return date.toLocaleString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
        hour12: true
    });
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

