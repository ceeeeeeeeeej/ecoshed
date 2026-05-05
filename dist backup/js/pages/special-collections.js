console.log("%c🚀 DISK UPDATE VERIFIED: special-collections.js loaded", "color: white; background: purple; padding: 10px; font-size: 20px;");
import { supabase, dbService, realtime, utils, authService } from '../../config/supabase_config.js?v=102';

console.log('✨ Special Collections page loaded');

let specialCollections = [];
let currentFilter = 'all';
let currentCollectionId = null;
let unsubscribeSpecialCollections = null;

document.addEventListener('DOMContentLoaded', () => {
    console.log('✨ Initializing special collections page...');
    initializeSpecialCollectionsPage();
});

function initializeSpecialCollectionsPage() {
    setupEventListeners();
    loadSpecialCollections();

    // Subscribe to real-time updates
    if (realtime && realtime.subscribeToSpecialCollections) {
        unsubscribeSpecialCollections = realtime.subscribeToSpecialCollections((data) => {
            console.log('🔄 Real-time update received:', data);
            if (data && data.length > 0) {
                // We could merge, but simpler to just reload for now or use the payload if we handled it in config
                // The config method I wrote calls getSpecialCollections and passes that data.
                specialCollections = data;
                renderCollections();
                updateCounts();
                showNotification('Special collections list updated', 'info');
            }
        });
    }
}

function setupEventListeners() {
    // Tab filters
    const tabs = document.querySelectorAll('.tab-btn');
    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            tabs.forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            currentFilter = tab.dataset.status;
            renderCollections();
        });
    });

    // Search
    const searchInput = document.getElementById('searchInput');
    if (searchInput) {
        searchInput.addEventListener('input', renderCollections);
    }
}

async function loadSpecialCollections() {

    try {

        const { data, error } = await dbService.getSpecialCollections();

        if (error) {
            console.error('Error loading collections:', error);
            return;
        }

        // SAVE data globally
        specialCollections = data || [];

        console.log("Loaded collections summary:");
        console.table(specialCollections.map(c => ({
            id: c.id,
            resident: c.residentName,
            status: c.status,
            type: c.wasteType
        })));

        renderCollections();
        updateCounts();

    } catch (err) {
        console.error("Failed to load collections:", err);
    }

}

function renderCollections() {
    const container = document.getElementById('collectionsContainer');
    const emptyState = document.getElementById('emptyState');
    const searchInput = document.getElementById('searchInput');
    const searchTerm = searchInput ? searchInput.value.toLowerCase() : '';

    if (!container) return;

    // Filter collections
    let filtered = specialCollections;

    // Apply status filter
    if (currentFilter !== 'all') {
        filtered = filtered.filter(c => c.status === currentFilter);
    }

    // Apply search filter
    if (searchTerm) {
        filtered = filtered.filter(c =>
            (c.residentName && c.residentName.toLowerCase().includes(searchTerm)) ||
            (c.residentLocation && c.residentLocation.toLowerCase().includes(searchTerm)) ||
            (c.wasteType && c.wasteType.toLowerCase().includes(searchTerm))
        );
    }

    // Render
    if (filtered.length === 0) {
        container.innerHTML = '';
        if (emptyState) emptyState.style.display = 'flex';
    } else {
        if (emptyState) emptyState.style.display = 'none';
        container.innerHTML = filtered.map(c => createCollectionCard(c)).join('');
        addActionButtonListeners();
    }
}

function createCollectionCard(collection) {
    const statusClass = getStatusClass(collection.status);
    const statusText = getStatusText(collection.status);
    const scheduledDate = collection.scheduledDate ? new Date(collection.scheduledDate) : null;
    const createdDate = collection.createdAt ? new Date(collection.createdAt) : new Date();

    const metadata = collection.metadata || {};
    const street = metadata.residentStreet || '';
    const age = metadata.residentAge || '';

    const location = collection.pickupLocation || collection.residentLocation || '';
    const barangay = collection.residentBarangay || '';
    const fullLocation = [location, street, barangay].filter(Boolean).join(', ');

    return `
        <div class="collection-card">
            <div class="collection-header">
                <div>
                    <div style="display:flex; align-items:center; gap:8px;">
                        <h4>${collection.residentName || 'Unknown Resident'} ${age ? `<span style="font-weight:normal; font-size:0.8rem; color:#6b7280;">(${age} yrs)</span>` : ''}</h4>
                        <span class="text-muted" style="font-size:0.75rem;">• ${utils.getRelativeTime ? utils.getRelativeTime(createdDate) : formatDate(createdDate)}</span>
                    </div>
                    <p class="text-muted"><i class="fa-solid fa-map-marker-alt"></i> ${fullLocation || 'No location specified'}</p>
                </div>
                <span class="status-badge ${statusClass}">${statusText}</span>
            </div>
            <div class="collection-details">
                <div class="detail-item">
                    <i class="fa-solid fa-trash-can"></i>
                    <div>
                        <span class="detail-label">Waste Type</span>
                        <span class="detail-value">${collection.wasteType || '-'}</span>
                    </div>
                </div>
                <div class="detail-item">
                    <i class="fa-solid fa-box"></i>
                    <div>
                        <span class="detail-label">Quantity</span>
                        <span class="detail-value">${collection.estimatedQuantity || '-'}</span>
                    </div>
                </div>
                
                ${collection.paymentReference ? `
                <div class="detail-item">
                    <i class="fa-solid fa-receipt"></i>
                    <div>
                        <span class="detail-label">Payment Ref</span>
                        <span class="detail-value" style="font-family:monospace; background:#f3f4f6; padding:2px 6px; border-radius:4px;">${collection.paymentReference}</span>
                    </div>
                </div>
                ` : ''}

                ${scheduledDate ? `
                <div class="detail-item" style="grid-column: span 2; background-color: #f0fdf4; padding: 8px; border-radius: 6px; border: 1px solid #bbf7d0;">
                    <i class="fa-solid fa-truck-pickup" style="color: #16a34a;"></i>
                    <div>
                        <span class="detail-label" style="color: #166534;">Scheduled Pickup</span>
                        <span class="detail-value" style="color: #15803d; font-weight:600;">${formatDate(scheduledDate)} @ ${formatTimeLabel(collection.scheduledTime)}</span>
                    </div>
                </div>
                ` : ''}
            </div>
            
            ${collection.specialInstructions ? `
            <div class="collection-instructions">
                <i class="fa-solid fa-circle-info text-muted"></i>
                <span class="text-muted text-sm">"${collection.specialInstructions}"</span>
            </div>
            ` : ''}

            <div class="collection-actions">
                ${renderActionButtons(collection)}
            </div>
        </div>
    `;
}

function renderActionButtons(collection) {
    const buttons = [];

    buttons.push(`
        <button class="btn-sm btn-secondary" data-action="view" data-id="${collection.id}">
            <i class="fas fa-eye"></i> View Details
        </button>
    `);

    if (collection.status === 'pending') {
        buttons.push(`
            <button class="btn-sm btn-primary" data-action="approve" data-id="${collection.id}">
                <i class="fas fa-thumbs-up"></i> Approve Request
            </button>
        `);
    }

    if (collection.status === 'approved') {
        buttons.push(`
            <button class="btn-sm btn-success" data-action="schedule" data-id="${collection.id}">
                <i class="fas fa-calendar-plus"></i> Schedule Collection
            </button>
        `);
    }

    if (collection.status === 'scheduled') {
        buttons.push(`
            <button class="btn-sm btn-info" data-action="complete" data-id="${collection.id}">
                <i class="fas fa-check"></i> Mark Complete
            </button>
        `);
        
        buttons.push(`
            <button class="btn-sm btn-danger" style="margin-top: 5px;" data-action="cancel" data-id="${collection.id}">
                <i class="fas fa-times"></i> Cancel Request
            </button>
        `);
    }

    return buttons.join('');
}

function addActionButtonListeners() {
    const actionButtons = document.querySelectorAll('[data-action]');
    actionButtons.forEach(button => {
        button.addEventListener('click', async () => {
            const action = button.dataset.action;
            const id = button.dataset.id;
            const collection = specialCollections.find(c => c.id === id);

            if (!collection) return;

            switch (action) {
                case 'view':
                    openDetailsModal(collection);
                    break;
                case 'approve':
                    await confirmApproveCollection(collection);
                    break;
                case 'schedule':
                    openScheduleModal(collection);
                    break;
                case 'complete':
                    await confirmCompleteCollection(collection);
                    break;
                case 'cancel':
                    await confirmCancelCollection(collection);
                    break;
            }
        });
    });
}

async function confirmCancelCollection(collection) {
    if (!confirm(`Cancel collection for ${collection.residentName}?`)) {
        return;
    }

    try {
        if (dbService && dbService.updateSpecialCollection) {
            const { error } = await dbService.updateSpecialCollection(collection.id, { 
                status: 'cancelled'
            });
            if (error) throw error;
            showNotification('Collection request cancelled', 'success');
            await loadSpecialCollections();
        }
    } catch (error) {
        console.error('Error cancelling collection:', error);
        showNotification('Failed to cancel collection', 'error');
    }
}

async function confirmApproveCollection(collection) {
    console.log("Approving ID:", collection.id);
    if (!collection || !collection.id) {
        showNotification("Invalid request data", "error");
        return;
    }

    // Instead of native confirm, we can just proceed or show a toast notification
    // But for safety, let's just proceed as the user wants it "automatic"

    try {
        console.log("Approving collection ID:", collection.id);

        const result = await dbService.approveSpecialCollection(collection.id);
        const { error, data } = result;

        if (error) {
            console.error("Supabase approval error:", error);
            showNotification("Failed to approve request", "error");
            return;
        }

        // IMPORTANT: If data is empty, it means 0 rows were updated (likely RLS)
        if (!data || data.length === 0) {
            console.warn("No rows updated in Supabase. Check RLS policies.");
            showNotification("Approval failed: Your account may restricted or the record was not found.", "warning");
            return;
        }

        console.log("Collection approved successfully in Supabase");

        // Local state update
        const idx = specialCollections.findIndex(c => c.id === collection.id);
        if (idx !== -1) {
            specialCollections[idx].status = "approved";
        }

        // Centralized notification is now handled inside dbService.approveSpecialCollection
        console.log("Supabase notification handled by dbService for", collection.residentBarangay);

        // Re-render UI
        renderCollections();
        updateCounts();

        // 1. Switch to Approved tab logically
        currentFilter = "approved";

        // 2. Fresh reload (optional but good)
        await loadSpecialCollections();

        // Update the active class on tab buttons
        document.querySelectorAll('.tab-btn').forEach(btn => {
            if (btn.dataset.status === 'approved') {
                btn.classList.add('active');
            } else {
                btn.classList.remove('active');
            }
        });

        // Final render to ensure filter is applied
        renderCollections();

        // Show Success toast (not alert)
        showNotification("SUCCESS: Request approved.", "success");

    } catch (error) {
        console.error("Error approving collection:", error);
        showNotification("Failed to approve request", "error");
    }
}

// ... (downloadApprovalSlip remains but might not be needed)

function openDetailsModal(collection) {
    const modal = document.getElementById('detailsModal');
    const content = document.getElementById('detailsContent');

        const metadata = collection.metadata || {};
        const street = metadata.residentStreet || '';
        const age = metadata.residentAge || '';

        content.innerHTML = `
        <div class="details-grid">
            <div class="detail-group">
                <h4>Resident Information</h4>
                <p><strong>Name:</strong> ${collection.residentName || '-'}</p>
                <p><strong>Barangay:</strong> ${collection.residentBarangay || '-'}</p>
                <p><strong>Purok:</strong> ${collection.residentPurok || '-'}</p>
                ${street ? `<p><strong>Street:</strong> ${street}</p>` : ''}
                ${age ? `<p><strong>Age:</strong> ${age}</p>` : ''}
            </div>
            <div class="detail-group">
                <h4>Collection Details</h4>
                <p><strong>Waste Type:</strong> ${collection.wasteType || '-'}</p>
                <p><strong>Quantity:</strong> ${collection.estimatedQuantity || '-'}</p>
                <p><strong>Pickup Location:</strong> ${collection.pickupLocation || '-'}</p>
                ${collection.message ? `<p><strong>Message:</strong> ${collection.message}</p>` : ''}
            </div>
            ${collection.scheduledDate ? `
            <div class="detail-group">
                <h4>Schedule Information</h4>
                <p><strong>Date:</strong> ${formatDate(new Date(collection.scheduledDate))}</p>
                <p><strong>Time:</strong> ${formatTimeLabel(collection.scheduledTime)}</p>
            </div>
            ` : ''}
        </div>
    `;

    modal.classList.add('show');
}

function openScheduleModal(collection) {
    currentCollectionId = collection.id;
    const modal = document.getElementById('scheduleCollectionModal');

    document.getElementById('schedule-residentName').value = collection.residentName || '';
    document.getElementById('schedule-wasteType').value = collection.wasteType || '';
    document.getElementById('schedule-location').value = collection.pickupLocation || collection.residentLocation || '';

    // Set default date to tomorrow
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    document.getElementById('schedule-date').value = tomorrow.toISOString().split('T')[0];
    document.getElementById('schedule-time').value = '08:00';

    modal.classList.add('show');
}

async function confirmScheduleCollection() {
    const date = document.getElementById('schedule-date').value;
    const time = document.getElementById('schedule-time').value;

    if (!date || !time) {
        showNotification('Please fill in all required fields', 'error');
        return;
    }

    console.log('%c📅 SCHEDULING SPECIAL COLLECTION:', 'color: white; background: #059669; padding: 5px; font-weight: bold;');
    console.log('   - Collection ID:', currentCollectionId);
    console.log('   - Scheduled Date:', date);
    console.log('   - Scheduled Time:', time);
    console.log('   - Resident:', document.getElementById('schedule-residentName').value);

    const btn = document.querySelector('#scheduleCollectionModal .btn-primary');
    const originalText = btn.innerHTML;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Scheduling...';
    btn.disabled = true;

    try {
        if (dbService && dbService.scheduleSpecialCollection) {
            const { error } = await dbService.scheduleSpecialCollection(currentCollectionId, date, time);
            if (error) throw error;

            showNotification('Collection scheduled successfully', 'success');

            // Refresh list
            await loadSpecialCollections();
            closeScheduleModal();
        }
    } catch (error) {
        console.error('Error scheduling collection:', error);
        showNotification('Failed to schedule collection', 'error');
    } finally {
        if (btn) {
            btn.innerHTML = originalText;
            btn.disabled = false;
        }
    }
}

async function confirmCompleteCollection(collection) {
    if (!confirm(`Mark collection for ${collection.residentName} as completed?`)) {
        return;
    }

    try {
        if (dbService && dbService.updateSpecialCollection) {
            const { error } = await dbService.updateSpecialCollection(collection.id, { status: 'completed' });
            if (error) throw error;
            showNotification('Collection marked as completed', 'success');
            await loadSpecialCollections();
        }
    } catch (error) {
        console.error('Error completing collection:', error);
        showNotification('Failed to complete collection', 'error');
    }
}

function updateCounts() {
    const counts = {
        all: specialCollections.length,
        pending: 0,
        approved: 0,
        scheduled: 0,
        completed: 0,
        cancelled: 0
    };

    specialCollections.forEach(c => {
        if (counts[c.status] !== undefined) {
            counts[c.status]++;
        }
    });

    Object.keys(counts).forEach(status => {
        const badge = document.getElementById(`count-${status}`);
        if (badge) {
            badge.textContent = counts[status];
        }
    });
}

function getStatusClass(status) {
    const classes = {
        pending: 'warning',
        approved: 'info',
        scheduled: 'primary',
        completed: 'success',
        cancelled: 'danger'
    };
    return classes[status] || '';
}

function getStatusText(status) {
    const texts = {
        pending: 'Needs Approval',
        approved: 'Approved',
        scheduled: 'Scheduled',
        completed: 'Completed',
        cancelled: 'Cancelled'
    };
    return texts[status] || status;
}

function formatDate(date) {
    if (!date || isNaN(date.getTime())) return 'N/A';
    return new Intl.DateTimeFormat('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric'
    }).format(date);
}

function formatTimeLabel(timeStr) {
    if (!timeStr) return 'TBD';
    if (timeStr.includes('AM') || timeStr.includes('PM')) return timeStr;
    
    try {
        const [hour, minute] = timeStr.split(':').map(Number);
        if (isNaN(hour) || isNaN(minute)) return timeStr;
        
        const ampm = hour >= 12 ? 'PM' : 'AM';
        const h12 = hour % 12 || 12;
        return `${h12.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')} ${ampm}`;
    } catch (e) {
        return timeStr;
    }
}

function showNotification(message, type = 'info') {
    if (utils && utils.showNotification) {
        utils.showNotification(message, type);
    } else {
        console.log(`[${type.toUpperCase()}] ${message}`);
    }
}

function closeScheduleModal() {
    const modal = document.getElementById('scheduleCollectionModal');
    if (modal) modal.classList.remove('show');
    currentCollectionId = null;
}

function closeDetailsModal() {
    const modal = document.getElementById('detailsModal');
    if (modal) modal.classList.remove('show');
}

// Export functions to global scope
window.closeScheduleModal = closeScheduleModal;
window.closeDetailsModal = closeDetailsModal;
window.confirmScheduleCollection = confirmScheduleCollection;
