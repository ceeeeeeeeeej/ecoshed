/* Build: 1.0.0 - 2026-04-08T04:09:36.438Z */
﻿import { supabase, dbService, realtime, utils, authService } from '../../config/supabase_config.js';

// Schedules page functionality
console.log(' Schedules page loaded');

// Initialize schedules page
document.addEventListener('DOMContentLoaded', () => {
    console.log(' Initializing schedules page...');
    initializeSchedulesPage();
});

let schedules = [];
let fixedSchedules = [];
let currentView = 'list';
let currentMonth = new Date();
let currentCollectionFilter = 'all';
let unsubscribeSchedules = null;
let unsubscribeFixedSchedules = null;
let unsubscribeSpecials = null;
let editingScheduleId = null;

window.setCollectionFilter = function(filter) {
    console.log(' Setting collection filter:', filter);
    currentCollectionFilter = filter;
    
    // Update button states
    document.querySelectorAll('.btn-filter').forEach(btn => {
        if (btn.getAttribute('data-filter') === filter) {
            btn.classList.add('active');
        } else {
            btn.classList.remove('active');
        }
    });
    
    // Re-render views
    renderScheduleList();
    renderCalendar();
};

window.toggleCalendarVisibility = function() {
    const calendarSection = document.getElementById('calendarSection');
    const toggleBtn = document.getElementById('toggleCalendarBtn');
    
    if (calendarSection.style.display === 'none') {
        calendarSection.style.display = 'block';
        toggleBtn.classList.add('active');
        toggleBtn.innerHTML = '<i class="fas fa-calendar-times"></i> Hide Calendar';
    } else {
        calendarSection.style.display = 'none';
        toggleBtn.classList.remove('active');
        toggleBtn.innerHTML = '<i class="fas fa-calendar-alt"></i> Calendar';
    }
};

window.dumpSchedulesState = function() {
    console.log('--- SCHEDULES INTERNAL STATE ---');
    console.log('schedules:', JSON.stringify(schedules));
    console.log('fixedSchedules:', JSON.stringify(fixedSchedules));
};

function normalizeDateKey(date) {
    if (!(date instanceof Date) || isNaN(date)) return '';
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}



function getDayOfWeek(dayName) {
    const days = {
        monday: 1,
        tuesday: 2,
        wednesday: 3,
        thursday: 4,
        friday: 5,
        saturday: 6,
        sunday: 7
    };
    return days[(dayName || '').toLowerCase()];
}

function calculateNextRunDate(daysArray, timeString) {
    if (!daysArray || daysArray.length === 0) return new Date();
    const now = new Date();
    let minDiff = Infinity;
    let nextDate = null;
    
    const [hh, mm] = (timeString || '08:00').split(':').map(n => parseInt(n, 10));
    
    daysArray.forEach(dayName => {
        const target = getDayOfWeek(dayName);
        if(!target) return;
        
        const currentDayOfWeek = now.getDay() === 0 ? 7 : now.getDay();
        let daysUntil = target - currentDayOfWeek;
        
        if (daysUntil === 0) {
            const tempDate = new Date(now);
            tempDate.setHours(hh||8, mm||0, 0, 0);
            if (now > tempDate) { 
                daysUntil = 7;
            }
        } else if (daysUntil < 0) {
            daysUntil += 7;
        }
        
        if (daysUntil < minDiff) {
            minDiff = daysUntil;
            nextDate = new Date(now);
            nextDate.setDate(now.getDate() + daysUntil);
            nextDate.setHours(hh||8, mm||0, 0, 0);
        }
    });
    
    return nextDate || new Date();
}

function generateSingleFixedSchedules(manualSchedules) {
    const items = [];
    const activeFixed = fixedSchedules || [];
    
    activeFixed.forEach(fs => {
        const area = (fs.area || '').toLowerCase();
        const days = Array.isArray(fs.days) ? fs.days : [];
        const time = fs.time || '08:00';
        const scheduleName = fs.scheduleName || 'Eco Collection';
        
        const nextDate = calculateNextRunDate(days, time);
        
        items.push({
            id: fs.id, // We use the mother ID directly so delete works immediately
            originalFixedId: fs.id,
            name: scheduleName,
            area: fs.area,
            frequency: 'weekly',
            description: '',
            status: 'active',
            scheduledDate: nextDate,
            startDate: formatDateInput(nextDate),
            startTime: time,
            isFixed: true,
            isFixedRule: true,
            days: days,
            fixedTime: time,
            ruleDescription: `Every ${days.map(d=>capitalize(d.slice(0,3))).join(' & ')}`
        });
    });
    
    return items;
}

function generateFixedOccurrences(manualSchedules) {
    const items = [];
    const activeFixed = fixedSchedules || [];
    const now = new Date();
    // Normalize "today" to start of day to avoid partial day shifts
    now.setHours(0, 0, 0, 0);

    const excluded = new Set();
    const scheduledDatesForArea = new Map(); // Track all manual/rescheduled dates per area

    (manualSchedules || []).forEach((s) => {
        if (!s?.area) return;
        const area = (s.area || '').toLowerCase();

        if (!scheduledDatesForArea.has(area)) {
            scheduledDatesForArea.set(area, new Set());
        }

        if (s.isRescheduled) {
            if (s.originalDate instanceof Date) {
                // If rescheduled, definitely exclude the original date so the old slot vanishes
                excluded.add(`${area}|${normalizeDateKey(s.originalDate)}`);
            }
            if (s.scheduledDate instanceof Date) {
                // Also track the NEW date so we don't accidentally render a fixed schedule on the same day as the reschedule
                scheduledDatesForArea.get(area).add(normalizeDateKey(s.scheduledDate));
            }
        } else if (s.scheduledDate instanceof Date) {
            // Manual schedules or single overrides block fixed schedules on their day
            scheduledDatesForArea.get(area).add(normalizeDateKey(s.scheduledDate));
        }
    });

    activeFixed.forEach((fs) => {
        const area = (fs.area || '').toLowerCase();
        const days = Array.isArray(fs.days) ? fs.days : [];
        const time = fs.time || '08:00';
        const scheduleName = fs.scheduleName || 'Eco Collection';
        const areaManualDates = scheduledDatesForArea.get(area) || new Set();

        const currentDayOfWeek = now.getDay() === 0 ? 7 : now.getDay();

        for (let week = 0; week < 52; week++) {
            days.forEach((dayName) => {
                const target = getDayOfWeek(dayName);
                if (!target) return;

                let daysUntil = target - currentDayOfWeek;
                if (daysUntil < 0) daysUntil += 7; // Next occurrence

                const scheduleDate = new Date(now);
                scheduleDate.setDate(now.getDate() + daysUntil + (week * 7));

                const [hh, mm] = (time || '08:00').split(':').map(n => parseInt(n, 10));
                scheduleDate.setHours(hh || 8, mm || 0, 0, 0);

                const dateKey = normalizeDateKey(scheduleDate);

                // Skip if this exact original date was rescheduled AWAY from
                if (excluded.has(`${area}|${dateKey}`)) return;

                // Skip if we already have a manual/rescheduled collection for this area on this day
                if (areaManualDates.has(dateKey)) return;

                items.push({
                    id: `fixed_${area}_${dateKey}`,
                    originalFixedId: fs.id,
                    name: scheduleName,
                    area,
                    frequency: 'weekly',
                    description: 'Fixed schedule',
                    status: 'scheduled',
                    scheduledDate: scheduleDate,
                    startDate: formatDateInput(scheduleDate),
                    startTime: formatTimeInput(scheduleDate),
                    isFixed: true,
                    fixedTime: time
                });
            });
        }
    });

    return items;
}

function getDisplaySchedules() {
    const manual = schedules || [];
    const fixed = generateFixedOccurrences(manual);
    return [...manual, ...fixed].sort((a, b) => a.scheduledDate - b.scheduledDate);
}

function getListSchedules() {
    const manual = (schedules || []).filter(s => !s.isRescheduled); // Keep manual and special
    const fixedRules = generateSingleFixedSchedules(manual);
    return [...manual, ...fixedRules].sort((a, b) => a.scheduledDate - b.scheduledDate);
}

let reminderDaemonInterval = null;

async function checkAndSendReminders() {
    console.log(' Using server-side reminders (pg_cron).');
    return;
}

function startReminderDaemon() {
    console.log(' Reminder daemon disabled (using server-side cron).');
}

window.triggerTestReminder = function() {
    console.log(' Browser-based reminders disabled.');
};

window.triggerTestCollectionStart = function() {
    console.log(' Browser-based alerts disabled.');
};

if (window.parent && window.parent !== window) {
    window.parent.triggerTestReminder = window.triggerTestReminder;
    window.parent.triggerTestCollectionStart = window.triggerTestCollectionStart;
}

async function checkAndNotifyCollectionStart() {
    console.log(' Using server-side alerts (pg_cron).');
    return;
}

function initializeSchedulesPage() {
    console.log(' EcoSched Clean Version v1.2');
    
    // Start Automatic Push Notification Reminder Daemon
    startReminderDaemon();
    
    // One-time cache purge for v1.2
    const currentVersion = '1.2';
    const lastVersion = localStorage.getItem('ecosched_version');
    if (lastVersion !== currentVersion) {
        console.log(' Purging local storage for new version:', currentVersion);
        // Clear specific keys related to schedules to avoid destroying user settings if any
        localStorage.removeItem('cached_schedules');
        localStorage.removeItem('cached_fixed_schedules');
        localStorage.removeItem('schedules_persistence_v1');
        // If we want a full clean:
        // localStorage.clear(); 
        localStorage.setItem('ecosched_version', currentVersion);
    }

    setupEventListeners();
    loadFixedSchedules();
    loadSchedulesFromSupabase();
    renderCalendar();
    renderScheduleList();
}

async function handleUpdateSchedule(event) {
    const form = event.target;
    const formData = new FormData(form);

    const scheduleName = formData.get('scheduleName')?.trim();
    const area = formData.get('area');
    const frequency = formData.get('frequency');
    const startDate = formData.get('startDate');
    const startTime = formData.get('startTime');
    const description = formData.get('description')?.trim() || '';
    const residentName = formData.get('residentName')?.trim() || '';
    const pickupLocation = formData.get('pickupLocation')?.trim() || '';
    const isReschedule = (formData.get('isReschedule') || 'false') === 'true';
    const originalDateValue = formData.get('originalDate')?.toString().trim() || '';
    const originalTimeValue = formData.get('originalTime')?.toString().trim() || '';

    if (!scheduleName || !area || !frequency || !startDate || !startTime) {
        showNotification('Please fill in all required fields', 'error');
        return;
    }

    const scheduledDate = new Date(`${startDate}T${startTime}`);
    if (isNaN(scheduledDate)) {
        showNotification('Please provide a valid date and time', 'error');
        return;
    }

    // User is already authenticated in dashboard - get user ID for tracking
    const { data: { user } } = await supabase.auth.getUser();

    const existing = schedules.find(s => s.id === editingScheduleId) || {};

    const updates = {
        name: scheduleName,
        area,
        serviceArea: area,
        frequency,
        description,
        residentName,
        pickupLocation,
        scheduledDate,
        startDate,
        startTime,
        status: existing.status || 'scheduled',
        updatedBy: user?.id || 'unknown'
    };

    if (existing.isRescheduled) {
        updates.isRescheduled = true;
        updates.originalDate = existing.originalDate || null;
        updates.rescheduledReason = description || existing.rescheduledReason || '';
        updates.frequency = 'one-time';
    }

    try {
        if (dbService && dbService.updateCollectionSchedule) {
            console.log(' Updating schedule:', editingScheduleId, updates);
            const { error } = await dbService.updateCollectionSchedule(editingScheduleId, updates);
            if (error) throw error;
        }

        const index = schedules.findIndex(s => s.id === editingScheduleId);
        if (index !== -1) {
            schedules[index] = normalizeSchedule({ id: editingScheduleId, ...updates });
        }

        renderScheduleList();
        renderCalendar();

        showNotification('Schedule updated successfully!', 'success');

        if (updates.isRescheduled) {
            notifyUsersOfReschedule({ ...existing, ...updates }, 'reschedule');
        }

        editingScheduleId = null;
        form.reset();
        closeAddScheduleModal();
    } catch (error) {
        console.error('Error updating schedule:', error);
        const message = utils?.getErrorMessage?.(error) || 'Failed to update schedule. Please try again.';
        showNotification(message, 'error');
    }
}

function setupEventListeners() {
    const addScheduleForm = document.getElementById('addScheduleForm');
    if (addScheduleForm) {
        addScheduleForm.addEventListener('submit', handleScheduleFormSubmit);
    }

    const selectAllCheckbox = document.getElementById('selectAllSchedules');
    if (selectAllCheckbox) {
        selectAllCheckbox.addEventListener('change', (e) => {
            const checkboxes = document.querySelectorAll('.schedule-checkbox');
            checkboxes.forEach(cb => {
                cb.checked = e.target.checked;
            });
            updateBulkDeleteUI();
        });
    }

    const bulkDeleteBtn = document.getElementById('bulkDeleteBtn');
    if (bulkDeleteBtn) {
        bulkDeleteBtn.addEventListener('click', bulkDeleteSchedules);
    }
}

async function handleScheduleFormSubmit(event) {
    event.preventDefault();
    if (editingScheduleId) {
        await handleUpdateSchedule(event);
    } else {
        await handleAddSchedule(event);
    }
}

async function cleanUpPastReschedules() {
    if (!dbService || !dbService.deleteCollectionSchedule) return;

    const now = new Date();
    const twentyFourHoursAgo = new Date(now.getTime() - (24 * 60 * 60 * 1000));

    const pastReschedules = schedules.filter(s => {
        if (!s.isRescheduled) return false;
        return s.scheduledDate < twentyFourHoursAgo;
    });

    if (pastReschedules.length === 0) return;

    console.log(` Cleaning up ${pastReschedules.length} past reschedules...`);

    let deletedCount = 0;
    for (const schedule of pastReschedules) {
        try {
            const { error } = await dbService.deleteCollectionSchedule(schedule.id);
            if (!error) {
                deletedCount++;
                schedules = schedules.filter(s => s.id !== schedule.id);
            }
        } catch (err) {
            console.error('Failed to delete past reschedule:', err);
        }
    }

    if (deletedCount > 0) {
        console.log(` Successfully cleaned up ${deletedCount} past reschedules.`);
    }
}

async function loadSchedulesFromSupabase() {
    try {
        let manualSchedules = [];
        let specialSchedules = [];

        // 1. Load manual collection schedules
        if (dbService && dbService.getCollectionSchedules) {
            const { data, error } = await dbService.getCollectionSchedules();
            if (error) throw error;
            manualSchedules = (data || []).map(normalizeSchedule);
        }

        // 2. Load scheduled special collections
        if (dbService && dbService.getSpecialCollections) {
            const { data, error } = await dbService.getSpecialCollections();
            if (!error && data) {
                specialSchedules = data
                    .filter(s => (s.status || '').toLowerCase() === 'scheduled')
                    .map(normalizeSpecialToSchedule);
            }
        }

        schedules = [...manualSchedules, ...specialSchedules];

        // 3. Auto-revert old reschedules by deleting them if > 24 hours past
        await cleanUpPastReschedules();

        // 4. Realtime subscription for collection_schedules
        if (realtime && realtime.subscribeToCollectionSchedules && !unsubscribeSchedules) {
            unsubscribeSchedules = realtime.subscribeToCollectionSchedules((items) => {
                const updatedManual = (items || []).map(normalizeSchedule);
                // Keep specials, update manual
                const currentSpecials = schedules.filter(s => s.isSpecial);
                schedules = [...updatedManual, ...currentSpecials];
                renderScheduleList();
                renderCalendar();
            });
        }

        // 5. Realtime subscription for special_collections
        if (realtime && realtime.subscribeToSpecialCollections && !unsubscribeSpecials) {
            unsubscribeSpecials = realtime.subscribeToSpecialCollections((items) => {
                const updatedSpecials = (items || [])
                    .filter(s => (s.status || '').toLowerCase() === 'scheduled')
                    .map(normalizeSpecialToSchedule);
                // Keep manual, update specials
                const currentManual = schedules.filter(s => !s.isSpecial);
                schedules = [...currentManual, ...updatedSpecials];
                renderScheduleList();
                renderCalendar();
            });
        }
    } catch (error) {
        console.error('CRITICAL: Error loading schedules from Supabase:', error);
        showNotification('Failed to load schedules: ' + (error.message || 'Unknown error'), 'error');
        schedules = [];
    } finally {
        renderScheduleList();
        renderCalendar();
    }
}

async function loadFixedSchedules() {
    try {
        if (dbService && dbService.getAreaSchedules) {
            const { data, error } = await dbService.getAreaSchedules(true);
            console.log(' [DEBUG] getAreaSchedules returned:', JSON.stringify(data), 'error:', error);
            if (!error && Array.isArray(data)) {
                fixedSchedules = data;
                console.log(' [DEBUG] fixedSchedules set to:', fixedSchedules.length, 'items:', JSON.stringify(fixedSchedules));
            } else {
                fixedSchedules = [];
                console.log(' [DEBUG] fixedSchedules set to empty (error or null data)');
            }
        } else {
            fixedSchedules = [];
            console.log(' [DEBUG] dbService.getAreaSchedules not available, fixedSchedules = []');
        }

        if (realtime && realtime.subscribeToAreaSchedules && !unsubscribeFixedSchedules) {
            unsubscribeFixedSchedules = realtime.subscribeToAreaSchedules((items) => {
                console.log(' [DEBUG] realtime area_schedules update:', JSON.stringify(items));
                fixedSchedules = Array.isArray(items) ? items : [];
                renderScheduleList();
                renderCalendar();
            }, true);
        }
    } catch (error) {
        console.error('CRITICAL: Error loading fixed schedules from Supabase:', error);
        fixedSchedules = [];
    }
}

function renderFixedSchedulesInfo() {
    // Display fixed schedules in a separate section if needed
    console.log('Fixed schedules loaded:', fixedSchedules);
}

function normalizeSpecialToSchedule(special) {
    const scheduledDate = resolveScheduledDate(special);
    const metadata = special.metadata || {};
    const street = special.residentStreet || metadata.residentStreet || 'N/A';
    const age = special.residentAge || metadata.residentAge || 'N/A';

    return {
        id: special.id,
        name: `Special Collection: ${special.residentName} (${special.wasteType})`,
        area: special.residentBarangay || '',
        frequency: 'one-time',
        description: `Location: ${special.pickupLocation || special.residentBarangay || ''}, Resident: ${special.residentName || ''}, Purok: ${special.residentPurok || 'N/A'}, Street: ${street}, Barangay: ${special.residentBarangay || 'N/A'}, Age: ${age}. ${special.message || special.specialInstructions || ''}`,
        status: special.status || 'scheduled',
        scheduledDate,
        startDate: formatDateInput(scheduledDate),
        startTime: special.scheduledTime || metadata.scheduledTime || formatTimeInput(scheduledDate),
        isSpecial: true,
        residentId: special.residentId,
        residentName: special.residentName || '',
        pickupLocation: special.pickupLocation || '',
        residentPurok: special.residentPurok || '',
        residentStreet: street,
        residentBarangay: special.residentBarangay || '',
        residentAge: age
    };
}

function normalizeSchedule(schedule) {
    const scheduledDate = resolveScheduledDate(schedule);
    const originalDate = resolveOriginalDate(schedule);
    return {
        id: schedule.id || schedule.scheduleId || `schedule_${Date.now()}`,
        name: schedule.name || schedule.scheduleName || schedule.route || 'Untitled Schedule',
        area: schedule.area || schedule.serviceArea || '',
        residentName: schedule.residentName || '',
        pickupLocation: schedule.pickupLocation || '',
        wasteType: schedule.wasteType || '',
        frequency: schedule.frequency || 'one-time',
        description: schedule.description || '',
        status: schedule.status || 'scheduled',
        scheduledDate,
        startDate: formatDateInput(scheduledDate),
        startTime: formatTimeInput(scheduledDate),
        isRescheduled: schedule.isRescheduled || false,
        originalDate,
        rescheduledReason: schedule.rescheduledReason || ''
    };
}

function resolveOriginalDate(schedule) {
    if (!schedule) return null;
    if (schedule.originalDate?.toDate) return schedule.originalDate.toDate();
    if (schedule.originalDate instanceof Date) return schedule.originalDate;
    if (typeof schedule.originalDate === 'string') {
        const parsed = new Date(schedule.originalDate);
        if (!isNaN(parsed)) return parsed;
    }
    return null;
}

function resolveScheduledDate(schedule) {
    if (!schedule) return new Date();
    if (schedule.scheduledDate?.toDate) return schedule.scheduledDate.toDate();
    if (schedule.scheduledDate instanceof Date) return schedule.scheduledDate;
    if (typeof schedule.scheduledDate === 'string') {
        const parsed = new Date(schedule.scheduledDate);
        if (!isNaN(parsed)) return parsed;
    }

    if (schedule.startDate) {
        const timePart = schedule.startTime || '00:00';
        const parsed = new Date(`${schedule.startDate}T${timePart}`);
        if (!isNaN(parsed)) return parsed;
    }

    return new Date();
}

function renderScheduleList() {
    const scheduleListElement = document.getElementById('scheduleList');
    if (!scheduleListElement) return;

    let displaySchedules = getListSchedules();
    
    // Apply collection filter
    if (currentCollectionFilter === 'regular') {
        displaySchedules = displaySchedules.filter(s => !s.name.includes('Special Collection:'));
    } else if (currentCollectionFilter === 'special') {
        displaySchedules = displaySchedules.filter(s => s.name.includes('Special Collection:'));
    }

    const today = new Date();

    const todaySchedules = displaySchedules.filter(s => isSameDate(s.scheduledDate, today));
    const upcomingSchedules = displaySchedules.filter(s => !isSameDate(s.scheduledDate, today) && s.scheduledDate >= today);

    if (!displaySchedules.length) {
        scheduleListElement.innerHTML = `
            <div class="empty-state">
                <i class="fas fa-calendar-times" style="font-size: 3rem; color: #d1d5db; margin-bottom: 1rem;"></i>
                <p>No schedules yet</p>
                <p style="color: #6b7280; font-size: 0.875rem;">Create a schedule to get started</p>
            </div>
        `;
        return;
    }

    // Add Summary Header
    const activeRecurringCount = (fixedSchedules || []).length;
    let summaryHtml = '';
    
    if (activeRecurringCount > 0 && currentCollectionFilter !== 'special') {
        const nextRuns = fixedSchedules.map(fs => calculateNextRunDate(fs.days, fs.time));
        const earliestNextRun = nextRuns.length > 0 ? new Date(Math.min(...nextRuns)) : new Date();
        const formattedNextRun = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).format(earliestNextRun);
        
        let avgFrequency = 1;
        if(fixedSchedules.length > 0) {
            const totalDays = fixedSchedules.reduce((acc, curr) => acc + (curr.days ? curr.days.length : 0), 0);
            avgFrequency = Math.round(totalDays / fixedSchedules.length);
        }

        summaryHtml = `
            <div class="summary-header">
                <div class="summary-stat">
                    <span class="stat-value">${activeRecurringCount}</span>
                    <span class="stat-label">Active Schedule${activeRecurringCount !== 1 ? 's' : ''}</span>
                </div>
                <div class="summary-stat">
                    <span class="stat-value">${avgFrequency}</span>
                    <span class="stat-label">Runs per week (avg)</span>
                </div>
                <div class="summary-stat">
                    <span class="stat-value">${formattedNextRun}</span>
                    <span class="stat-label">Next run</span>
                </div>
            </div>
        `;
    }

    let html = summaryHtml;

    if (todaySchedules.length > 0) {
        html += `
            <div class="section-header" style="width: 100%; margin: 20px 0 10px 0; padding-bottom: 10px; border-bottom: 1px solid #e5e7eb;">
                <h3 style="color: #ef4444; display: flex; align-items: center; gap: 8px;">
                    <i class="fas fa-exclamation-circle"></i> Today's Schedule
                </h3>
            </div>
            <div class="schedule-grid ${currentView === 'grid' ? 'grid-view' : ''}" style="margin-bottom: 30px;">
                ${todaySchedules.map(createScheduleCard).join('')}
            </div>
        `;
    }

    if (upcomingSchedules.length > 0) {
        html += `
            <div class="section-header" style="width: 100%; margin: 20px 0 10px 0; padding-bottom: 10px; border-bottom: 1px solid #e5e7eb;">
                <h3 style="color: #374151; display: flex; align-items: center; gap: 8px;">
                    <i class="fas fa-calendar-alt"></i> Upcoming Schedules
                </h3>
            </div>
            <div class="schedule-grid ${currentView === 'grid' ? 'grid-view' : ''}">
                ${upcomingSchedules.map(createScheduleCard).join('')}
            </div>
        `;
    } else if (todaySchedules.length > 0) {
        // If there are today schedules but no upcoming, we don't need to say "No upcoming"
    } else {
        // Fallback if somehow filtered out everything (e.g. only past)
        html += `<p>No upcoming schedules found.</p>`;
    }

    scheduleListElement.innerHTML = html;

    // Reset select all state when re-rendering
    const selectAllCheckbox = document.getElementById('selectAllSchedules');
    if (selectAllCheckbox) selectAllCheckbox.checked = false;
    updateBulkDeleteUI();

    // Re-attach event listeners...
    // Note: Since we use innerHTML, we need to attach to all buttons in the document or scope
    attachScheduleEventListeners(scheduleListElement);
}

function updateBulkDeleteUI() {
    const checkboxes = document.querySelectorAll('.schedule-checkbox:checked');
    const bulkDeleteBtn = document.getElementById('bulkDeleteBtn');
    const selectedCountSpan = document.getElementById('selectedCount');
    
    if (bulkDeleteBtn && selectedCountSpan) {
        selectedCountSpan.textContent = checkboxes.length;
        if (checkboxes.length > 0) {
            bulkDeleteBtn.style.display = 'inline-flex'; // Restore inline-flex from inline styles
        } else {
            bulkDeleteBtn.style.display = 'none';
        }
    }
}

async function bulkDeleteSchedules() {
    const checkboxes = document.querySelectorAll('.schedule-checkbox:checked');
    if (checkboxes.length === 0) return;

    const confirmed = window.confirm(`Are you sure you want to delete ${checkboxes.length} selected schedule(s)?\n\nDeleting a "FIXED" schedule will remove the entire recurring sequence.`);
    if (!confirmed) return;

    // Group unique IDs to avoid redundant DB calls
    const fixedIdsToDelete = new Set();
    const manualIdsToDelete = new Set();
    const checkboxArray = Array.from(checkboxes);

    console.log(' [DEBUG] Bulk delete processing', checkboxes.length, 'checkboxes');

    checkboxArray.forEach(cb => {
        const id = cb.getAttribute('data-id');
        const isFixed = cb.getAttribute('data-isfixed') === 'true';
        const originalFixedId = cb.getAttribute('data-originalfixedid');
        
        if (isFixed && originalFixedId) {
            fixedIdsToDelete.add(originalFixedId);
        } else if (!isFixed && id) {
            manualIdsToDelete.add(id);
        }
    });

    console.log(' [DEBUG] IDs to delete:', {
        fixed: Array.from(fixedIdsToDelete),
        manual: Array.from(manualIdsToDelete)
    });

    let deletedCount = 0;

    // 1. Delete Fixed Area Schedules
    for (const fixedId of fixedIdsToDelete) {
        try {
            if (dbService && dbService.deleteAreaSchedule) {
                const { error } = await dbService.deleteAreaSchedule(fixedId);
                if (!error) {
                    deletedCount++;
                    fixedSchedules = fixedSchedules.filter(fs => fs.id !== fixedId);
                }
            }
        } catch (error) {
            console.error('Error deleting fixed schedule in bulk:', error);
        }
    }

    // 2. Delete Manual Collection Schedules
    for (const manualId of manualIdsToDelete) {
        try {
            if (dbService && dbService.deleteCollectionSchedule) {
                const { error } = await dbService.deleteCollectionSchedule(manualId);
                if (!error) {
                    deletedCount++;
                    schedules = schedules.filter(s => s.id !== manualId);
                }
            }
        } catch (error) {
            console.error('Error deleting manual schedule in bulk:', error);
        }
    }

    // Notify users about deletions (optional: one notification per area affected)
    const affectedAreas = [...new Set(Array.from(checkboxes).map(cb => cb.getAttribute('data-area')))];
    affectedAreas.forEach(area => {
        if (area) notifyUsersOfScheduleAction({ area }, 'deletion-bulk');
    });

    if (deletedCount > 0) {
        showNotification(`Successfully deleted ${deletedCount} schedule(s).`, 'success');
        
        // Update UI immediately using local filtered arrays
        renderScheduleList();
        renderCalendar();
        updateBulkDeleteUI();
        
        // Refresh fixed schedules from DB in background to ensure sync
        await loadFixedSchedules(); 
        renderScheduleList();
        renderCalendar();
    } else {
        showNotification('Failed to delete selected schedules.', 'error');
    }
}

function attachScheduleEventListeners(container) {
    const editButtons = container.querySelectorAll('.edit-schedule-btn');
    editButtons.forEach(button => {
        button.addEventListener('click', () => {
            const id = button.getAttribute('data-id');
            if (id) {
                openEditScheduleModal(id);
            }
        });
    });

    const deleteButtons = container.querySelectorAll('.delete-schedule-btn');
    deleteButtons.forEach(button => {
        button.addEventListener('click', confirmDeleteSchedule);
    });

    const rescheduleButtons = container.querySelectorAll('.btn-reschedule');
    rescheduleButtons.forEach(button => {
        button.addEventListener('click', () => {
            const area = button.getAttribute('data-area');
            const date = button.getAttribute('data-date');
            const time = button.getAttribute('data-time');
            const name = button.getAttribute('data-name');
            const residentId = button.getAttribute('data-residentid');
            if (area && date) {
                openRescheduleModal({ area, date, time, name, residentId });
            }
        });
    });

    // Checkboxes for bulk delete
    const checkboxes = container.querySelectorAll('.schedule-checkbox');
    checkboxes.forEach(cb => {
        cb.addEventListener('change', () => {
            updateBulkDeleteUI();
            
            // Check if all are selected to update the "Select All" checkbox state
            const allCheckboxes = container.querySelectorAll('.schedule-checkbox');
            const checkedCheckboxes = container.querySelectorAll('.schedule-checkbox:checked');
            const selectAllCheckbox = document.getElementById('selectAllSchedules');
            if (selectAllCheckbox) {
                selectAllCheckbox.checked = allCheckboxes.length > 0 && allCheckboxes.length === checkedCheckboxes.length;
            }
        });
    });
}

function createScheduleCard(schedule) {
    const statusClass = getStatusClass(schedule.status);
    const isFixed = schedule.isFixed === true;
    const isRescheduled = schedule.isRescheduled === true;
    const isSpecial = schedule.name && schedule.name.includes('Special Collection:');
    const status = (schedule.status || 'scheduled').replace('-', ' ');

    const cardId = isFixed ? schedule.originalFixedId : schedule.id;

    const rescheduleBtnHTML = `
        <button type="button" class="btn-icon btn-reschedule" 
            data-area="${schedule.area}" 
            data-date="${formatDateInput(schedule.scheduledDate)}" 
            data-time="${schedule.fixedTime || schedule.startTime || '08:00'}" 
            data-name="${schedule.name}"
            data-residentid="${schedule.residentId || ''}"
            title="Edit / Reschedule">
            <i class="fas fa-edit"></i>
        </button>
    `;

    return `
        <div class="schedule-card modern-card" data-area="${schedule.area || ''}">
            <div class="card-checkbox-area">
                <input type="checkbox" class="schedule-checkbox" 
                    data-id="${schedule.id}" 
                    data-isfixed="${isFixed}" 
                    data-originalfixedid="${schedule.originalFixedId || ''}"
                    data-area="${schedule.area || ''}"
                    title="Select schedule">
            </div>
            
            <div class="card-content">
                <div class="card-header-main">
                    <h4 class="card-title">
                        ${(isSpecial && schedule.residentName) 
                            ? `Special Collection: ${schedule.residentName}${schedule.wasteType ? ` (${schedule.wasteType})` : ''}`
                            : (schedule.name || 'Eco Collection')}
                    </h4>
                    <div class="card-badges">
                        <span class="badge badge-${statusClass}">${status.toUpperCase()}</span>
                    </div>
                </div>
                
                <div class="card-location">
                    <i class="fas fa-map-marker-alt"></i> ${capitalize(schedule.area)}
                </div>
                
                <div class="card-tags">
                    ${isFixed ? '<span class="tag tag-recurring"><i class="fas fa-redo-alt"></i> Recurring</span>' : ''}
                    ${isFixed ? '<span class="tag tag-weekly">Weekly</span>' : ''}
                    ${isSpecial ? '<span class="tag tag-special">Special Collection</span>' : ''}
                </div>
                
                <div class="card-details-grid">
                    <div class="detail-box">
                        <i class="far fa-calendar"></i>
                        <div class="detail-text">
                            <span class="detail-label">Next Run / Date</span>
                            <span class="detail-value">${formatDisplayDate(schedule.scheduledDate)}</span>
                        </div>
                    </div>
                     <div class="detail-box">
                        <i class="far fa-clock"></i>
                        <div class="detail-text">
                            <span class="detail-label">Time</span>
                            <span class="detail-value">${formatDisplayTime(schedule.scheduledDate)}</span>
                        </div>
                    </div>
                    ${schedule.residentName ? `
                    <div class="detail-box">
                        <i class="fas fa-user"></i>
                        <div class="detail-text">
                            <span class="detail-label">Resident</span>
                            <span class="detail-value">${schedule.residentName}</span>
                        </div>
                    </div>
                    ` : ''}
                    ${schedule.pickupLocation ? `
                    <div class="detail-box">
                        <i class="fas fa-map-marker-alt"></i>
                        <div class="detail-text">
                            <span class="detail-label">Pickup Location</span>
                            <span class="detail-value">${schedule.pickupLocation}</span>
                        </div>
                    </div>
                    ` : ''}
                    ${isFixed ? `
                    <div class="detail-box full-width">
                        <i class="fas fa-sync"></i>
                        <div class="detail-text">
                            <span class="detail-label">Recurrence</span>
                            <span class="detail-value">${schedule.ruleDescription || 'Weekly'}</span>
                        </div>
                    </div>
                    ` : ''}
                </div>
                
                ${schedule.description || schedule.rescheduledReason ? `
                    <div class="card-notes">
                        <p>${schedule.description || schedule.rescheduledReason}</p>
                    </div>
                ` : ''}
            </div>
            
            <div class="card-actions">
                ${rescheduleBtnHTML}
                <button type="button" class="btn-icon delete-schedule-btn" data-id="${schedule.id}" data-isfixed="${isFixed}" data-originalfixedid="${schedule.originalFixedId}" title="Delete Schedule">
                    <i class="fas fa-trash"></i>
                </button>
            </div>
        </div>
    `;
}

function renderCalendar() {
    const calendarGrid = document.getElementById('calendarGrid');
    const currentMonthLabel = document.getElementById('currentMonth');
    if (!calendarGrid || !currentMonthLabel) return;

    let displaySchedules = getDisplaySchedules();
    
    // Apply collection filter
    if (currentCollectionFilter === 'regular') {
        displaySchedules = displaySchedules.filter(s => !s.name.includes('Special Collection:'));
    } else if (currentCollectionFilter === 'special') {
        displaySchedules = displaySchedules.filter(s => s.name.includes('Special Collection:'));
    }

    calendarGrid.innerHTML = '';
    const monthFormatter = new Intl.DateTimeFormat('en-US', { month: 'long', year: 'numeric' });
    currentMonthLabel.textContent = monthFormatter.format(currentMonth);

    const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    dayNames.forEach(day => {
        const header = document.createElement('div');
        header.className = 'calendar-day-header';
        header.textContent = day;
        calendarGrid.appendChild(header);
    });

    const firstDayOfMonth = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), 1);
    const startDate = new Date(firstDayOfMonth);
    startDate.setDate(startDate.getDate() - firstDayOfMonth.getDay());

    for (let i = 0; i < 42; i++) {
        const date = new Date(startDate);
        date.setDate(startDate.getDate() + i);
        const dayElement = document.createElement('div');
        dayElement.className = 'calendar-day';

        if (date.getMonth() !== currentMonth.getMonth()) {
            dayElement.classList.add('other-month');
        }

        if (isSameDate(date, new Date())) {
            dayElement.classList.add('today');
        }

        const dayNumber = document.createElement('div');
        dayNumber.className = 'day-number';
        dayNumber.textContent = date.getDate();
        dayElement.appendChild(dayNumber);

        const schedulesForDay = displaySchedules.filter(schedule => isSameDate(schedule.scheduledDate, date));
        schedulesForDay.forEach(schedule => {
            const scheduleItem = document.createElement('div');
            scheduleItem.className = 'schedule-item';
            scheduleItem.title = `${schedule.name} - ${formatDisplayTime(schedule.scheduledDate)}`;
            scheduleItem.textContent = schedule.name;
            dayElement.appendChild(scheduleItem);
        });

        calendarGrid.appendChild(dayElement);
    }
}

async function handleAddSchedule(event) {
    event.preventDefault();
    const form = event.target;
    const formData = new FormData(form);

    const area = formData.get('area');
    const scheduleName = `Collection: ${area || 'General'}`; // Default name
    const frequency = formData.get('frequency');
    const startDate = formData.get('startDate');
    const startTime = formData.get('startTime');
    const description = ''; // Default empty description
    const residentName = formData.get('residentName')?.trim() || '';
    const pickupLocation = formData.get('pickupLocation')?.trim() || '';

    if (!area || !frequency || (frequency === 'one-time' && (!startDate || !startTime)) || (frequency === 'weekly' && !startTime)) {
        showNotification('Please fill in all required fields', 'error');
        return;
    }

    // User is already authenticated in dashboard - get user ID for tracking
    const { data: { user } } = await supabase.auth.getUser();

    // Handle Weekly Recurring (Area Schedule)
    if (frequency === 'weekly') {
        const days = Array.from(form.querySelectorAll('input[name="days"]:checked')).map(cb => cb.value);
        if (days.length === 0) {
            showNotification('Please select at least one collection day', 'error');
            return;
        }

        const areaPayload = {
            area: area,
            scheduleName: scheduleName,
            days: days,
            time: startTime + ':00', // Ensure HH:MM:SS format
            isActive: true
        };

        try {
            console.log(' Creating new area schedule:', areaPayload);
            const { data, error } = await dbService.createAreaSchedule(areaPayload);
            if (error) throw error;

            showNotification('Fixed area schedule created successfully!', 'success');
            loadFixedSchedules(); // Refresh fixed schedules
            
            //  [NOTIFICATION] Alert residents that a new fixed weekly schedule was created
            notifyUsersOfScheduleAction(areaPayload, 'fixed');

            form.reset();
            closeAddScheduleModal();
            return;
        } catch (error) {
            console.error('Error creating area schedule:', error);
            showNotification('Failed to create area schedule: ' + (error.message || 'Unknown error'), 'error');
            return;
        }
    }

    const scheduledDate = new Date(`${startDate}T${startTime}`);
    if (isNaN(scheduledDate.getTime())) {
        showNotification('Invalid date or time', 'error');
        return;
    }

    const normalizedArea = (area || '').toLowerCase();
    const isFixedArea = (fixedSchedules || [])
        .some(fs => (fs.area || '').toLowerCase() === normalizedArea);

    const isReschedule = (formData.get('isReschedule') || 'false') === 'true';
    const originalDateValue = formData.get('originalDate')?.toString().trim() || '';
    const originalTimeValue = formData.get('originalTime')?.toString().trim() || '';

    /*
    if (!isReschedule && frequency === 'one-time') {
        showNotification('Manual one-time schedules are disabled. Please use the reschedule button on a fixed schedule.', 'error');
        return;
    }
    */

    const schedulePayload = {
        name: scheduleName,
        area,
        serviceArea: area,
        frequency,
        description,
        residentName,
        pickupLocation,
        scheduledDate,
        startDate,
        startTime,
        status: 'scheduled',
        createdBy: user?.id || 'unknown',
        userId: user?.id || 'unknown'
    };

    if (isReschedule && originalDateValue) {
        const originalTime = originalTimeValue || startTime || '08:00';
        const original = new Date(`${originalDateValue}T${originalTime}`);
        schedulePayload.isRescheduled = true;
        schedulePayload.originalDate = original;
        schedulePayload.rescheduledReason = description;
        schedulePayload.frequency = 'one-time';
    }

    try {
        let persistedSchedule = schedulePayload;

        // Prevent duplicate reschedules for the same original date & area
        let existingReschedule = null;
        if (schedulePayload.isRescheduled) {
            existingReschedule = schedules.find(s =>
                s.isRescheduled === true &&
                s.area?.toLowerCase() === schedulePayload.area?.toLowerCase() &&
                s.originalDate instanceof Date &&
                normalizeDateKey(s.originalDate) === normalizeDateKey(schedulePayload.originalDate)
            );
        }

        if (existingReschedule && dbService && dbService.updateCollectionSchedule) {
            // Update the existing reschedule instead of creating a new one
            console.log(' Updating existing reschedule:', existingReschedule.id);
            const { error } = await dbService.updateCollectionSchedule(existingReschedule.id, schedulePayload);
            if (error) throw error;
            persistedSchedule = { ...existingReschedule, ...schedulePayload };

            // Update local array
            const index = schedules.findIndex(s => s.id === existingReschedule.id);
            if (index !== -1) schedules[index] = normalizeSchedule(persistedSchedule);

        } else if (dbService && dbService.createCollectionSchedule) {
            // Create a brand new reschedule
            const { data, error } = await dbService.createCollectionSchedule(schedulePayload);
            if (error) throw error;
            if (data) {
                persistedSchedule = { ...schedulePayload, ...data };
            }
            schedules.push(normalizeSchedule(persistedSchedule));
        } else {
            persistedSchedule = { ...schedulePayload, id: `schedule_${Date.now()}` };
            schedules.push(normalizeSchedule(persistedSchedule));
        }
        renderScheduleList();
        renderCalendar();

        showNotification('Schedule created successfully!', 'success');

        //  [NOTIFICATION] Alert residents of the new schedule immediately
        if (persistedSchedule.isRescheduled) {
            // Pass the residentId from the form to ensured targeted notification
            const residentIdFromForm = formData.get('residentId');
            if (residentIdFromForm) persistedSchedule.residentId = residentIdFromForm;
            
            notifyUsersOfScheduleAction(persistedSchedule, 'reschedule');
        } else {
            // Also notify for regular one-time schedules
            notifyUsersOfScheduleAction(persistedSchedule, 'creation');
        }

        console.log(' Schedule created:', persistedSchedule);
        form.reset();
        closeAddScheduleModal();
    } catch (error) {
        console.error('Error creating schedule:', error);
        const message = utils?.getErrorMessage?.(error) || 'Failed to create schedule. Please try again.';
        showNotification(message, 'error');
    }
}

function openRescheduleModal({ area, date, time, name, residentId }) {
    openAddScheduleModal();
    const modal = document.getElementById('addScheduleModal');
    if (!modal) return;
    const form = modal.querySelector('form');
    if (!form) return;

    const title = modal.querySelector('.modal-header h3');
    const submitButton = modal.querySelector('.modal-actions button[type="submit"]');
    if (title) title.textContent = 'Reschedule Collection';
    if (submitButton) submitButton.textContent = 'Save Reschedule';

    form.isReschedule.value = 'true';
    form.originalDate.value = date;
    if (form.originalTime) form.originalTime.value = (time || '08:00').toString().slice(0, 5);
    form.area.value = area;
    if (form.residentId) form.residentId.value = residentId || '';
    form.frequency.value = 'one-time';
    form.startDate.value = date;
    form.startTime.value = (time || '08:00').toString().slice(0, 5);
    
    // Clear old resident info if not provided
    if (form.residentName) form.residentName.value = residentName || '';
    if (form.pickupLocation) form.pickupLocation.value = ''; // Location usually changes or is specific
    
    toggleFrequencyUI();
}

function openAddScheduleModal() {
    const modal = document.getElementById('addScheduleModal');
    if (modal) {
        editingScheduleId = null;
        modal.classList.add('show');
        const form = modal.querySelector('form');
        if (form) {
            form.reset();
            if (form.isReschedule) form.isReschedule.value = 'false';
            if (form.originalDate) form.originalDate.value = '';
            if (form.originalTime) form.originalTime.value = '';
            if (form.residentId) form.residentId.value = '';
            toggleFrequencyUI();
        }
        const title = modal.querySelector('.modal-header h3');
        const submitButton = modal.querySelector('.modal-actions button[type="submit"]');
        if (title) title.textContent = 'Create New Schedule';
        if (submitButton) submitButton.textContent = 'Create Schedule';
    }
}

function closeAddScheduleModal() {
    const modal = document.getElementById('addScheduleModal');
    if (modal) {
        modal.classList.remove('show');
        const form = modal.querySelector('form');
        form?.reset();
        if (form?.isReschedule) form.isReschedule.value = 'false';
        if (form?.originalDate) form.originalDate.value = '';
        if (form?.originalTime) form.originalTime.value = '';
        if (form?.residentId) form.residentId.value = '';
        if (form?.residentName) form.residentName.value = '';
        if (form?.pickupLocation) form.pickupLocation.value = '';
        editingScheduleId = null;
    }
}

function openAddAreaScheduleModal() {
    openAddScheduleModal();
    const modal = document.getElementById('addScheduleModal');
    if (!modal) return;
    const form = modal.querySelector('form');
    if (!form) return;

    const title = modal.querySelector('.modal-header h3');
    const submitButton = modal.querySelector('.modal-actions button[type="submit"]');
    if (title) title.textContent = 'Create New Area Schedule';
    if (submitButton) submitButton.textContent = 'Create Fixed Schedule';

    form.frequency.value = 'weekly';
    toggleFrequencyUI();
}

function toggleFrequencyUI() {
    const modal = document.getElementById('addScheduleModal');
    if (!modal) return;
    const form = modal.querySelector('form');
    const frequency = form.frequency.value;
    const daysContainer = document.getElementById('recurringDaysContainer');
    const startDateGroup = form.startDate.closest('.form-group');
    const residentInfoContainer = document.getElementById('residentInfoContainer');
    const pickupLocationContainer = document.getElementById('pickupLocationContainer');

    if (frequency === 'weekly') {
        daysContainer.style.display = 'block';
        startDateGroup.style.display = 'none';
        if (residentInfoContainer) residentInfoContainer.style.display = 'none';
        if (pickupLocationContainer) pickupLocationContainer.style.display = 'none';
        form.startDate.required = false;
    } else {
        daysContainer.style.display = 'none';
        startDateGroup.style.display = 'flex';
        if (residentInfoContainer) residentInfoContainer.style.display = 'block';
        if (pickupLocationContainer) pickupLocationContainer.style.display = 'block';
        form.startDate.required = true;
    }
}

function openEditScheduleModal(scheduleId) {
    const schedule = schedules.find(s => s.id === scheduleId);
    const modal = document.getElementById('addScheduleModal');
    if (!schedule || !modal) return;

    editingScheduleId = scheduleId;
    modal.classList.add('show');

    const form = modal.querySelector('form');
    if (!form) return;

    form.area.value = schedule.area || '';
    form.frequency.value = schedule.frequency || '';
    form.startDate.value = schedule.startDate || formatDateInput(schedule.scheduledDate);
    form.startTime.value = schedule.startTime || formatTimeInput(schedule.scheduledDate);

    if (form.isReschedule) {
        form.isReschedule.value = schedule.isRescheduled ? 'true' : 'false';
    }
    if (form.originalDate) {
        form.originalDate.value = schedule.originalDate instanceof Date
            ? formatDateInput(schedule.originalDate)
            : '';
    }
    if (form.originalTime) {
        form.originalTime.value = schedule.originalDate instanceof Date
            ? formatTimeInput(schedule.originalDate)
            : '';
    }

    if (form.residentName) form.residentName.value = schedule.residentName || '';
    if (form.pickupLocation) form.pickupLocation.value = schedule.pickupLocation || '';

    toggleFrequencyUI();

    const title = modal.querySelector('.modal-header h3');
    const submitButton = modal.querySelector('.modal-actions button[type="submit"]');
    if (title) title.textContent = 'Edit Schedule';
    if (submitButton) submitButton.textContent = 'Save Changes';
}


async function confirmDeleteSchedule(event) {
    const btn = event.currentTarget;
    const scheduleId = btn.getAttribute('data-id');
    const isFixed = btn.getAttribute('data-isfixed') === 'true';
    const originalFixedId = btn.getAttribute('data-originalfixedid');

    const schedule = schedules.find(s => s.id === scheduleId) || (isFixed ? { area: btn.closest('.schedule-card')?.getAttribute('data-area') } : null);
    
    let deleteMsg = `Are you sure you want to delete this schedule?`;
    if (isFixed) {
        deleteMsg = `WARNING: You are about to delete the ENTIRE weekly recurring schedule for ${capitalize(schedule?.area || 'this area')}.\n\nThis will remove all future occurrences. Proceed?`;
    }

    const confirmed = window.confirm(deleteMsg);
    if (!confirmed) return;

    try {
        if (isFixed && originalFixedId) {
            if (dbService && dbService.deleteAreaSchedule) {
                const { error } = await dbService.deleteAreaSchedule(originalFixedId);
                if (error) throw error;
                fixedSchedules = fixedSchedules.filter(fs => fs.id !== originalFixedId);
            }
        } else if (schedule?.isSpecial) {
            //  Handle Special Collection deletion
            if (dbService && dbService.deleteSpecialCollection) {
                const { error } = await dbService.deleteSpecialCollection(scheduleId);
                if (error) throw error;
                schedules = schedules.filter(s => s.id !== scheduleId);
            }
        } else if (dbService && dbService.deleteCollectionSchedule) {
            //  Handle regular manual schedule deletion
            const { error } = await dbService.deleteCollectionSchedule(scheduleId);
            if (error) throw error;
            schedules = schedules.filter(s => s.id !== scheduleId);
        }

        if (schedule) notifyUsersOfScheduleAction(schedule, isFixed ? 'deletion-bulk' : 'deletion');

        renderScheduleList();
        renderCalendar();

        showNotification('Schedule deleted successfully.', 'success');
        
        if (isFixed) {
            await loadFixedSchedules();
            renderScheduleList();
        }
    } catch (error) {
        console.error('Error deleting schedule:', error);
        const message = utils?.getErrorMessage?.(error) || 'Failed to delete schedule. Please try again.';
        showNotification(message, 'error');
    }
}

function toggleView(view) {
    currentView = view;
    const viewButtons = document.querySelectorAll('.view-toggle .btn');
    viewButtons.forEach(button => {
        button.classList.toggle('active', button.textContent.trim().toLowerCase() === view);
    });
    renderScheduleList();
}

function previousMonth() {
    currentMonth = new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1, 1);
    renderCalendar();
}

function nextMonth() {
    currentMonth = new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 1);
    renderCalendar();
}


function getStatusClass(status) {
    const normalized = status?.toLowerCase() || '';
    if (normalized === 'completed') return 'completed';
    if (normalized === 'in-progress' || normalized === 'active') return 'active';
    return 'pending';
}

function capitalize(text = '') {
    return text.charAt(0).toUpperCase() + text.slice(1);
}

function formatDateInput(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

function formatTimeInput(date) {
    return date.toTimeString().slice(0, 5);
}

function formatDisplayDate(date) {
    return new Intl.DateTimeFormat('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric'
    }).format(date);
}

function formatDisplayTime(date) {
    if (!date || isNaN(date.getTime())) return 'N/A';
    return new Intl.DateTimeFormat('en-US', {
        hour: 'numeric',
        minute: 'numeric',
        hour12: true
    }).format(date);
}

function isSameDate(dateA, dateB) {
    return dateA.getFullYear() === dateB.getFullYear() &&
        dateA.getMonth() === dateB.getMonth() &&
        dateA.getDate() === dateB.getDate();
}

function showNotification(message, type = 'info') {
    utils?.showNotification?.(message, type);
    if (!utils || !utils.showNotification) {
        alert(`${type.toUpperCase()}: ${message}`);
    }
}

window.openAddScheduleModal = openAddScheduleModal;
window.openAddAreaScheduleModal = openAddAreaScheduleModal;
window.closeAddScheduleModal = closeAddScheduleModal;
window.toggleFrequencyUI = toggleFrequencyUI;
window.toggleView = toggleView;
window.previousMonth = previousMonth;
window.nextMonth = nextMonth;

async function notifyUsersOfScheduleAction(schedule, type) {
    // schedule object has: area, scheduledDate, name, etc.
    if (!dbService || !dbService.getUsers || !dbService.createNotification) return;

    try {
        console.log(` Starting notification process for ${type} action:`, schedule);

        // 1. Get all users
        const { data: users, error } = await dbService.getUsers();
        if (error) throw error;

        // 2. Filter users by role (Broadband: All areas receive notification)
        const targetAreaString = (schedule.area || '').toLowerCase();
        
        console.log(` Broadband broadcasting notification for Schedule in: "${targetAreaString}"`);
        
        const residentsToNotify = schedule.residentId 
            ? users.filter(u => u.id === schedule.residentId)
            : users.filter(u => u.role === 'resident');
        
        const collectorsToNotify = users.filter(u => {
            const isAuthorizedRole = u.role === 'admin' || u.role === 'collector' || u.role === 'driver';
            if (!isAuthorizedRole || u.status !== 'active') return false;
            return true; // Broadband: No location restriction
        });
        
        const recipients = [...residentsToNotify, ...collectorsToNotify];
        console.log(` Filtered recipients: ${recipients.length} (Residents: ${residentsToNotify.length}, Collectors: ${collectorsToNotify.length})`);
        if (recipients.length > 0) {
            console.log(' Recipient names:', recipients.map(u => u.fullName || u.email).join(', '));
        }

        if (recipients.length === 0) {
            console.log(' No recipients found for notification in area:', targetAreaString);
            return;
        }

        // 3. Prepare message based on type
        let title = ' Schedule Update | Pahibalo sa Eskedyul';
        let message = '';

        if (type === 'reschedule') {
            const dateObj = new Date(schedule.scheduledDate);
            const dateStr = dateObj.toLocaleDateString();
            const timeStr = dateObj.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
            const area = capitalize(schedule.area);
            message = `Your collection for ${area} is now on ${dateStr} at ${timeStr}.${schedule.rescheduledReason ? ` Reason: ${schedule.rescheduledReason}` : ''} \n\n Ang imong pagkolekta sa ${area} gibalhin sa ${dateStr}, ${timeStr}.${schedule.rescheduledReason ? ` Rason: ${schedule.rescheduledReason}` : ''}`;
        } else if (type === 'creation') {
            const dateObj = new Date(schedule.scheduledDate);
            const dateStr = dateObj.toLocaleDateString();
            const timeStr = dateObj.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
            const area = capitalize(schedule.area);
            title = ' New Collection Scheduled | Bag-ong Eskedyul';
            message = `A new collection has been scheduled for ${area} on ${dateStr} at ${timeStr}. \n\n Adunay bag-ong pagkolekta sa ${area} sa ${dateStr}, ${timeStr}.`;
        } else if (type === 'fixed') {
            const daysStr = Array.isArray(schedule.days) ? schedule.days.map(d => capitalize(d.slice(0, 3))).join(', ') : 'weekly';
            const timeStr = schedule.time ? schedule.time.slice(0, 5) : 'Scheduled';
            const area = capitalize(schedule.area);
            title = ' New Regular Schedule | Bag-ong Eskedyul';
            message = `A new weekly collection has been set for ${area}: Every ${daysStr} at ${timeStr}. \n\n Adunay bag-ong semana nga pagkolekta sa ${area}: Matag ${daysStr}, ${timeStr}.`;
        } else if (type === 'deletion' || type === 'deletion-bulk') {
            const area = capitalize(schedule.area);
            title = ' Schedule Cancelled | Gikanselar ang Eskedyul';
            message = `The collection schedule for ${area} has been cancelled or discontinued. Please check your app for the next available schedule. \n\n Ang eskedyul sa pagkolekta sa ${area} gikanselar. Palihog tan-awa ang app para sa sunod nga eskedyul.`;
        }

        if (!message) return;

        // 4. Send in parallel (both in-app and push)
        const promises = recipients.map(async (user) => {
            // In-app notification
            const inAppPromise = dbService.createNotification({
                userId: user.id,
                title: title,
                message: message,
                type: 'alert',
                priority: 'high'
            });

            //  The database trigger on the 'user_notifications' table will 
            // automatically handle the push delivery to the appropriate devices.
            return Promise.all([inAppPromise]);
        });

        await Promise.all(promises);
        console.log(` Notifications sent to ${recipients.length} users for ${type} action`);

    } catch (err) {
        console.error(' Error sending schedule notifications:', err);
    }
}



