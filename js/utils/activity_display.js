// Helper function to load and display recent activities in dashboard
import { getRecentActivities } from './activity_logger.js';

export function loadRecentActivities() {
    const activities = getRecentActivities(5); // Get last 5 activities
    const activityList = document.getElementById('activityList');

    if (!activityList) return;

    if (activities.length === 0) {
        activityList.innerHTML = `
            <div class="empty-state" style="text-align: center; padding: 40px 20px; color: #9ca3af;">
                <i class="fas fa-history" style="font-size: 24px; margin-bottom: 16px; opacity: 0.5;"></i>
                <p style="margin: 0; font-size: 14px;">No recent activity</p>
            </div>
        `;
        return;
    }

    activityList.innerHTML = activities.map(activity => `
        <div class="activity-item">
            <div class="activity-icon ${activity.priority}">
                <i class="${activity.icon}"></i>
            </div>
            <div class="activity-content">
                <p class="activity-message">${activity.message}</p>
                <span class="activity-time">${formatActivityTime(activity.timestamp)}</span>
            </div>
        </div>
    `).join('');
}

// Format activity timestamp
function formatActivityTime(timestamp) {
    const now = new Date();
    const time = new Date(timestamp);
    const diff = now - time;

    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);

    if (minutes < 1) return 'Just now';
    if (minutes < 60) return `${minutes}m ago`;
    if (hours < 24) return `${hours}h ago`;
    if (days < 7) return `${days}d ago`;
    return time.toLocaleDateString();
}

// Add this to your existing code to refresh activities periodically
// Call this function in your initializeDashboard or similar initialization function
export function setupActivityRefresh() {
    loadRecentActivities(); // Load initially

    // Refresh every 30 seconds
    setInterval(loadRecentActivities, 30000);
}

// Functions are now exported as ES module members
