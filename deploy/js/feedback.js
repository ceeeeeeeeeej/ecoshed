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
    try {
        if (dbService && dbService.getResidentFeedback) {
            const { data, error } = await dbService.getResidentFeedback(null, 100);
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
        showNotification('Failed to load resident feedback', 'error');
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
}

function applyFilters() {
    let list = [...allFeedback];

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

    filteredFeedback.forEach((item) => {
        const row = document.createElement('tr');
        const status = (item.status || 'new').toString().toLowerCase();
        const priority = normalizePriority(item.priority);
        const createdAtLabel = formatTimestamp(item.createdAt || item.created_at || item.timestamp);
        const residentName = item.isAnonymous ? 'Anonymous' : (item.residentName || 'Resident');
        const barangay = item.barangay || '';
        const purok = item.purok || '';
        const serviceArea = formatServiceArea(item.serviceArea || '');
        const locationLabel = barangay || purok
            ? `${purok ? purok + ', ' : ''}${barangay}`
            : tryUnpackLocation(item.message || item.feedback_text || '');

        row.innerHTML = `
            <td>
                <div class="feedback-main">
                    <div class="feedback-title">
                        ${status === 'new' ? '<span class="new-dot"></span>' : ''}
                        ${escapeHtml(item.category || 'Resident Feedback')}
                    </div>
                    <div class="feedback-message">${escapeHtml(item.feedback_text || item.message || '')}</div>
                    <div class="feedback-meta-line">Source: Resident Feedback</div>
                </div>
            </td>
            <td>
                <div class="feedback-resident">
                    <div class="resident-name">${escapeHtml(residentName)}</div>
                    <div class="resident-location">${escapeHtml(locationLabel)}</div>
                </div>
            </td>
            <td>
                <span class="priority-badge ${priority}">${priority}</span>
            </td>
            <td>
                <span class="status-badge status-${status}">${formatStatus(status)}</span>
            </td>
            <td>${escapeHtml(createdAtLabel)}</td>
            <td>
                <div class="action-buttons">
                    <button class="action-icon action-mark-read" onclick="toggleFeedbackRead('${item.id}')" title="Mark read/unread">
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

    if (countEl) countEl.textContent = `${total} feedback item${total === 1 ? '' : 's'}`;
    if (unreadEl) unreadEl.textContent = `${unread} unread`;
    if (urgentEl) urgentEl.textContent = `${urgent} urgent/high`;
}

function normalizePriority(value) {
    const raw = (value || 'medium').toString().toLowerCase();
    if (['urgent', 'high', 'medium', 'low'].includes(raw)) return raw;
    return 'medium';
}

function formatStatus(status) {
    const value = (status || 'new').toString().toLowerCase();
    if (value === 'in_progress') return 'In Progress';
    return value.charAt(0).toUpperCase() + value.slice(1);
}

function formatServiceArea(area) {
    if (!area) return '—';
    const value = area.toString().toLowerCase();
    if (value === 'victoria') return 'Victoria';
    if (value === 'dayo-an') return 'Dayo-An';
    return value
        .split('-')
        .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
        .join(' ');
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
        if (utils && utils.formatDate) {
            return utils.formatDate(raw);
        }
        if (raw.toDate) {
            return raw.toDate().toLocaleString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true, month: 'short', day: 'numeric', year: 'numeric' });
        }
        const date = new Date(raw);
        if (!Number.isNaN(date.getTime())) {
            return date.toLocaleString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true, month: 'short', day: 'numeric', year: 'numeric' });
        }
        return String(raw);
    } catch (e) {
        return String(raw);
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
        showNotification(newRead ? 'Feedback marked as read' : 'Feedback marked as unread', 'success');
    } catch (error) {
        console.error('Error updating feedback read state:', error);
        showNotification('Failed to update feedback state', 'error');
    }
}

async function deleteFeedback(id) {
    const item = allFeedback.find((f) => f.id === id);
    if (!item) return;

    if (!confirm('Are you sure you want to delete this feedback?')) {
        return;
    }

    try {
        if (dbService && dbService.deleteResidentFeedback) {
            await dbService.deleteResidentFeedback(id);
        }
        allFeedback = allFeedback.filter((f) => f.id !== id);
        filteredFeedback = filteredFeedback.filter((f) => f.id !== id);
        renderFeedbackTable();
        updateFeedbackStats();
        showNotification('Feedback deleted', 'success');
    } catch (error) {
        console.error('Error deleting feedback:', error);
        showNotification('Failed to delete feedback', 'error');
    }
}

function resetFeedbackFilters() {
    applyFilters();
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

function showNotification(message, type = 'info') {
    const toast = document.createElement('div');
    toast.className = `notification-toast ${type}`;
    toast.innerHTML = `
        <i class="fas ${type === 'success' ? 'fa-check-circle' : type === 'error' ? 'fa-times-circle' : type === 'warning' ? 'fa-exclamation-triangle' : 'fa-info-circle'}"></i>
        <span>${message}</span>
    `;

    document.body.appendChild(toast);

    setTimeout(() => toast.classList.add('show'), 50);

    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

window.resetFeedbackFilters = resetFeedbackFilters;
window.toggleFeedbackRead = toggleFeedbackRead;
window.deleteFeedback = deleteFeedback;
