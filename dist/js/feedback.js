/* Build: 1.0.0 - 2026-05-05T13:37:32.854Z */
// Resident Feedback Page JavaScript
import { dbService, realtime, utils } from '../../config/supabase_config.js';

let allFeedback = [];
let filteredFeedback = [];

// Initialize page
document.addEventListener('DOMContentLoaded', function () {
    console.log('Resident Feedback page loaded');
    initializeFeedbackPage();
});

function initializeFeedbackPage() {
    loadFeedbackFromFirebase();
    setupEventListeners();
    setupRealtimeFeedback();
}

async function loadFeedbackFromFirebase() {
    const tbody = document.getElementById('feedbackTableBody');
    if (tbody) {
        tbody.innerHTML = `
            <tr>
                <td colspan="6">
                    <div class="loading-state">
                        <i class="fas fa-circle-notch fa-spin"></i>
                        <p>Loading feedback...</p>
                    </div>
                </td>
            </tr>
        `;
    }

    try {
        if (dbService && dbService.getResidentFeedback) {
            const { data, error } = await dbService.getResidentFeedback(100);
            if (error) throw error;
            allFeedback = Array.isArray(data) ? data : [];
            filteredFeedback = [...allFeedback];
        } else {
            allFeedback = [];
            filteredFeedback = [];
        }
        applyFilters();
    } catch (error) {
        console.error('Error loading resident feedback:', error);
        showNotification('Failed to load feedback', 'error');
        allFeedback = [];
        filteredFeedback = [];
        renderFeedbackTable();
        updateFeedbackStats();
    }
}

function setupRealtimeFeedback() {
    if (realtime && realtime.subscribeToResidentFeedback) {
        realtime.subscribeToResidentFeedback((items) => {
            allFeedback = Array.isArray(items) ? items : [];
            applyFilters();
        });
    }
}

function setupEventListeners() {
    // Add filter listeners here if search is implemented
}

function applyFilters() {
    let list = [...allFeedback];
    // Future: implement search/category filtering
    filteredFeedback = list;
    renderFeedbackTable();
    updateFeedbackStats();
}

function renderFeedbackTable() {
    const tbody = document.getElementById('feedbackTableBody');
    if (!tbody) return;

    tbody.innerHTML = '';

    if (!filteredFeedback.length) {
        tbody.innerHTML = `
            <tr>
                <td colspan="6">
                    <div class="empty-state">
                        <i class="fas fa-comments"></i>
                        <p>No resident feedback found</p>
                    </div>
                </td>
            </tr>
        `;
        return;
    }

    filteredFeedback.forEach((item, index) => {
        const row = document.createElement('tr');
        row.style.animationDelay = `${index * 0.05}s`;

        const status = (item.status || 'new').toString().toLowerCase();
        const priority = normalizePriority(item.priority);
        const createdAtLabel = formatTimestamp(item.createdAt || item.created_at || item.timestamp);
        const residentName = item.isAnonymous ? 'Anonymous' : (item.residentName || 'Resident');
        const locationLabel = item.barangay || item.purok
            ? `${item.purok ? item.purok + ', ' : ''}${item.barangay}`
            : tryUnpackLocation(item.message || item.feedback_text || '');

        row.innerHTML = `
            <td>
                <div class="feedback-main">
                    <div class="feedback-title">
                        ${status === 'new' ? '<span class="new-dot"></span>' : ''}
                        ${escapeHtml(item.category || 'Resident Feedback')}
                    </div>
                    <div class="feedback-message">${escapeHtml(item.feedback_text || item.message || '')}</div>
                    <div class="feedback-meta-line">Source: Public App</div>
                </div>
            </td>
            <td>
                <div class="feedback-resident">
                    <div class="resident-name">${escapeHtml(residentName)}</div>
                    <div class="resident-location"><i class="fas fa-map-marker-alt" style="font-size: 0.75rem; margin-right: 4px; opacity: 0.6;"></i> ${escapeHtml(locationLabel)}</div>
                </div>
            </td>
            <td>
                <span class="priority-badge ${priority}">${priority}</span>
            </td>
            <td>
                <span class="status-badge status-${status}">
                    <i class="fas ${status === 'resolved' ? 'fa-check-circle' : status === 'in_progress' ? 'fa-hourglass-half' : 'fa-certificate'}"></i>
                    ${formatStatus(status)}
                </span>
            </td>
            <td>
                <div style="font-size: 0.85rem; color: #64748b;">${escapeHtml(createdAtLabel)}</div>
            </td>
            <td>
                <div class="action-buttons">
                    <button class="action-icon action-mark-resolved" onclick="toggleFeedbackResolved('${item.id}')" title="Mark as Ready (Resolved)">
                        <i class="fas ${status === 'resolved' ? 'fa-undo' : 'fa-check'}"></i>
                    </button>
                    <button class="action-icon" onclick="toggleFeedbackRead('${item.id}')" title="Mark read/unread">
                        <i class="fas ${item.read ? 'fa-envelope-open' : 'fa-envelope'}"></i>
                    </button>
                    <button class="action-icon action-delete" onclick="deleteFeedback('${item.id}')" title="Delete">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>
            </td>
        `;

        tbody.appendChild(row);
    });
}

function updateFeedbackStats() {
    const total = allFeedback.length;
    const unread = allFeedback.filter((f) => !f.read).length;
    const urgent = allFeedback.filter((f) => {
        const p = normalizePriority(f.priority);
        return p === 'urgent' || p === 'high';
    }).length;

    const countEl = document.getElementById('feedbackCount');
    const unreadEl = document.getElementById('unreadFeedbackCount');
    const urgentEl = document.getElementById('urgentFeedbackCount');

    // Smooth counter animation
    if (countEl) countEl.textContent = total;
    if (unreadEl) unreadEl.textContent = unread;
    if (urgentEl) urgentEl.textContent = urgent;
}

function normalizePriority(value) {
    const raw = (value || 'medium').toString().toLowerCase();
    if (['urgent', 'high', 'medium', 'low'].includes(raw)) return raw;
    return 'medium';
}

function formatStatus(status) {
    const value = (status || 'new').toString().toLowerCase();
    if (value === 'in_progress') return 'In Progress';
    if (value === 'resolved' || value === 'ready') return 'Ready';
    return value.charAt(0).toUpperCase() + value.slice(1);
}

function tryUnpackLocation(text) {
    if (!text) return 'Not specified';
    const barangayMatch = text.match(/Barangay:\s*([^,"]+)/i);
    const purokMatch = text.match(/Purok:\s*([^,"]+)/i);
    if (barangayMatch || purokMatch) {
        const b = (barangayMatch ? barangayMatch[1] : '').trim();
        const p = (purokMatch ? purokMatch[1] : '').trim();
        return `${p ? p + ', ' : ''}${b}`.trim() || 'Not specified';
    }
    return 'Not specified';
}

function formatTimestamp(raw) {
    if (!raw) return '';
    try {
        if (utils && utils.formatDate) return utils.formatDate(raw);
        const date = new Date(raw);
        return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });
    } catch (e) {
        return String(raw);
    }
}

async function toggleFeedbackResolved(id) {
    const item = allFeedback.find((f) => f.id === id);
    if (!item) return;

    const isCurrentlyResolved = item.status === 'resolved';
    const newStatus = isCurrentlyResolved ? 'new' : 'resolved';

    try {
        if (dbService && dbService.updateResidentFeedback) {
            await dbService.updateResidentFeedback(id, { status: newStatus });
        }
        item.status = newStatus;
        applyFilters();
        showNotification(newStatus === 'resolved' ? 'Feedback marked as Ready' : 'Feedback status reset', 'success');
    } catch (error) {
        console.error('Error updating feedback status:', error);
        showNotification('Failed to update status', 'error');
    }
}

async function toggleFeedbackRead(id) {
    const item = allFeedback.find((f) => f.id === id);
    if (!item) return;
    const newRead = !item.read;

    try {
        if (dbService && dbService.updateResidentFeedback) {
            await dbService.updateResidentFeedback(id, { read: newRead });
        }
        item.read = newRead;
        applyFilters();
        showNotification(newRead ? 'Marked as read' : 'Marked as unread', 'info');
    } catch (error) {
        console.error('Error updating read state:', error);
        showNotification('Failed to update state', 'error');
    }
}

async function deleteFeedback(id) {
    if (!confirm('Are you sure you want to delete this feedback?')) return;

    try {
        if (dbService && dbService.deleteResidentFeedback) {
            await dbService.deleteResidentFeedback(id);
        }
        allFeedback = allFeedback.filter((f) => f.id !== id);
        applyFilters();
        showNotification('Feedback deleted successfully', 'success');
    } catch (error) {
        console.error('Error deleting feedback:', error);
        showNotification('Failed to delete feedback', 'error');
    }
}

async function markAllFeedbackAsUnread() {
    const readFeedback = allFeedback.filter(f => f.read);

    if (readFeedback.length === 0) {
        showNotification('All feedback is already unread.', 'info');
        return;
    }

    if (!confirm(`Mark ${readFeedback.length} feedback items as unread?`)) return;

    try {
        if (dbService && dbService.updateResidentFeedback) {
            for (const f of readFeedback) {
                const res = await dbService.updateResidentFeedback(f.id, { read: false });
                if (res && res.error) throw res.error;
            }
        }

        allFeedback.forEach(f => {
            if (f.read) f.read = false;
        });

        applyFilters();

        if (window.parent && typeof window.parent.updateBadge === 'function') {
            window.parent.updateBadge();
        }

        showNotification('All feedback marked as unread (reset)', 'success');
    } catch (error) {
        console.error('Error marking all as unread:', error);
        showNotification('Failed to update feedback', 'error');
    }
}

function showNotification(message, type = 'info') {
    const toast = document.createElement('div');
    toast.className = `notification-toast ${type}`;
    toast.innerHTML = `
        <i class="fas ${type === 'success' ? 'fa-check-circle' : type === 'error' ? 'fa-times-circle' : 'fa-info-circle'}"></i>
        <span>${message}</span>
    `;

    document.body.appendChild(toast);
    setTimeout(() => toast.classList.add('show'), 50);
    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

function escapeHtml(value) {
    if (value === null || value === undefined) return '';
    return value
        .toString()
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

// Expose globals for onclick handlers
window.toggleFeedbackResolved = toggleFeedbackResolved;
window.toggleFeedbackRead = toggleFeedbackRead;
window.deleteFeedback = deleteFeedback;
window.loadFeedbackFromFirebase = loadFeedbackFromFirebase;
window.markAllFeedbackAsUnread = markAllFeedbackAsUnread;