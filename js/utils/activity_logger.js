// Activity Logger - Centralized activity tracking for admin actions
// Usage: import { logActivity } from './activity_logger.js';
// Then call: logActivity('user_added', 'Added new admin user: John Doe', 'medium', { userId: '123' });

console.log('📝 Activity Logger module loaded');

// Activity types and their default priorities
const ACTIVITY_TYPES = {
    user_added: { icon: 'fa-user-plus', priority: 'medium' },
    user_updated: { icon: 'fa-user-edit', priority: 'low' },
    user_deleted: { icon: 'fa-user-times', priority: 'high' },
    collector_added: { icon: 'fa-truck', priority: 'medium' },
    collector_updated: { icon: 'fa-truck', priority: 'low' },
    collector_deleted: { icon: 'fa-truck-loading', priority: 'high' },
    schedule_created: { icon: 'fa-calendar-plus', priority: 'medium' },
    schedule_updated: { icon: 'fa-calendar-alt', priority: 'low' },
    schedule_deleted: { icon: 'fa-calendar-times', priority: 'medium' },
    feedback_received: { icon: 'fa-comment', priority: 'low' },
    settings_updated: { icon: 'fa-cog', priority: 'low' },
    sensor_alert: { icon: 'fa-exclamation-triangle', priority: 'urgent' },
    sensor_updated: { icon: 'fa-microchip', priority: 'low' },
    system_action: { icon: 'fa-server', priority: 'medium' }
};

/**
 * Log an admin activity
 * @param {string} type - Activity type (e.g., 'user_added', 'collector_added')
 * @param {string} message - Human-readable message describing the action
 * @param {string} priority - Priority level: 'urgent', 'high', 'medium', 'low'
 * @param {object} metadata - Additional data about the activity
 */
export function logActivity(type, message, priority = null, metadata = {}) {
    const activityInfo = ACTIVITY_TYPES[type] || { icon: 'fa-info-circle', priority: 'low' };
    const finalPriority = priority || activityInfo.priority;

    const activity = {
        id: `activity-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        type: type,
        category: getCategoryFromType(type),
        message: message,
        priority: finalPriority,
        icon: activityInfo.icon,
        timestamp: new Date().toISOString(),
        metadata: metadata,
        read: false
    };

    // Store in localStorage for Recent Activity
    storeRecentActivity(activity);

    // Store in notifications if high priority or urgent
    if (finalPriority === 'urgent' || finalPriority === 'high') {
        storeAsNotification(activity);
    }

    console.log('📝 Activity logged:', activity);
    return activity;
}

/**
 * Get category from activity type
 */
function getCategoryFromType(type) {
    if (type.includes('user')) return 'user';
    if (type.includes('collector')) return 'collector';
    if (type.includes('schedule')) return 'schedule';
    if (type.includes('sensor')) return 'iot';
    if (type.includes('feedback')) return 'feedback';
    if (type.includes('settings')) return 'system';
    return 'system';
}

/**
 * Store activity in Recent Activity list
 */
function storeRecentActivity(activity) {
    const stored = localStorage.getItem('ecosched_recent_activity');
    const activities = stored ? JSON.parse(stored) : [];

    activities.unshift(activity);

    // Keep only last 50 activities
    const trimmed = activities.slice(0, 50);
    localStorage.setItem('ecosched_recent_activity', JSON.stringify(trimmed));
}

/**
 * Store activity as notification if high priority
 */
function storeAsNotification(activity) {
    const stored = localStorage.getItem('ecosched_notifications');
    const notifications = stored ? JSON.parse(stored) : [];

    const notification = {
        id: activity.id,
        type: activity.category,
        priority: activity.priority,
        title: getNotificationTitle(activity.type, activity.priority),
        message: activity.message,
        timestamp: activity.timestamp,
        read: false,
        metadata: activity.metadata
    };

    notifications.unshift(notification);

    // Keep only last 100 notifications
    const trimmed = notifications.slice(0, 100);
    localStorage.setItem('ecosched_notifications', JSON.stringify(trimmed));
}

/**
 * Get notification title based on activity type and priority
 */
function getNotificationTitle(type, priority) {
    if (priority === 'urgent') return '🚨 Urgent Action';
    if (priority === 'high') return '⚠️ Important Update';

    switch (type) {
        case 'user_added': return '👤 New User Added';
        case 'user_deleted': return '🗑️ User Removed';
        case 'collector_added': return '🚚 New Collector Added';
        case 'collector_deleted': return '🗑️ Collector Removed';
        case 'schedule_deleted': return '📅 Schedule Deleted';
        default: return 'ℹ️ System Update';
    }
}

/**
 * Get recent activities
 * @param {number} limit - Maximum number of activities to return
 * @returns {Array} Array of recent activities
 */
export function getRecentActivities(limit = 10) {
    const stored = localStorage.getItem('ecosched_recent_activity');
    const activities = stored ? JSON.parse(stored) : [];
    return activities.slice(0, limit);
}

/**
 * Clear old activities (older than specified days)
 * @param {number} days - Number of days to keep
 */
export function clearOldActivities(days = 7) {
    const stored = localStorage.getItem('ecosched_recent_activity');
    if (!stored) return;

    const activities = JSON.parse(stored);
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - days);

    const filtered = activities.filter(activity => {
        return new Date(activity.timestamp) > cutoffDate;
    });

    localStorage.setItem('ecosched_recent_activity', JSON.stringify(filtered));
    console.log(`🗑️ Cleared ${activities.length - filtered.length} old activities`);
}

// Auto-cleanup on load (remove activities older than 7 days)
clearOldActivities(7);
