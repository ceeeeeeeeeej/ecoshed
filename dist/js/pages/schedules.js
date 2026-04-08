/* Build: 1.0.0 - 2026-03-17T12:48:30.516Z */
import { supabase, dbService, realtime, utils, authService } from '../../config/supabase_config.js';

// Schedules page functionality
console.log('📅 Schedules page loaded');

// Initialize schedules page
document.addEventListener('DOMContentLoaded', () => {
    console.log('📅 Initializing schedules page...');
    initializeSchedulesPage();
});

let schedules = [];
let fixedSchedules = [];
let currentView = 'list';
let currentMonth = new Date();
let unsubscribeSchedules = null;
let unsubscribeFixedSchedules = null;
let editingScheduleId = null;

function normalizeDateKey(date) {
    if (!(date instanceof Date) || isNaN(date)) return '';
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

function getFallbackFixedSchedules() {
    return [
        {
            id: 'fallback_victoria',
            area: 'victoria',
            scheduleName: 'Victoria Eco Collection',
            days: ['monday', 'tuesday'],
            time: '08:00',
            active: true
        },
        {
            id: 'fallback_dayo_an',
            area: 'dayo-an',
            scheduleName: 'Dayo-an Eco Collection',
            days: ['saturday'],
            time: '08:00',
            active: true
        }
    ];
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

function generateFixedOccurrences(manualSchedules) {
    const items = [];
    const activeFixed = fixedSchedules.length ? fixedSchedules : getFallbackFixedSchedules();
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

function initializeSchedulesPage() {
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
            console.log('📅 Updating schedule:', editingScheduleId, updates);
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

    console.log(`🧹 Cleaning up ${pastReschedules.length} past reschedules...`);

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
        console.log(`✅ Successfully cleaned up ${deletedCount} past reschedules.`);
    }
}

async function loadSchedulesFromSupabase() {
    try {
        if (dbService && dbService.getCollectionSchedules) {
            const { data, error } = await dbService.getCollectionSchedules();
            if (error) throw error;
            // Include all schedules from DB (both manual and reschedules)
            schedules = (data || []).map(normalizeSchedule);

            // Auto-revert old reschedules by deleting them if > 24 hours past
            await cleanUpPastReschedules();
        } else {
            schedules = []; // No mock schedules for the new strict logic
        }

        if (realtime && realtime.subscribeToCollectionSchedules && !unsubscribeSchedules) {
            unsubscribeSchedules = realtime.subscribeToCollectionSchedules((items) => {
                schedules = (items || []).map(normalizeSchedule);
                renderScheduleList();
                renderCalendar();
            });
        }
    } catch (error) {
        console.error('CRITICAL: Error loading schedules from Supabase:', error);
        showNotification('Failed to load schedules: ' + (error.message || 'Unknown error'), 'error');
        schedules = generateMockSchedules();
    } finally {
        renderScheduleList();
        renderCalendar();
    }
}

async function loadFixedSchedules() {
    try {
        if (dbService && dbService.getAreaSchedules) {
            const { data, error } = await dbService.getAreaSchedules(true);
            if (!error && Array.isArray(data) && data.length) {
                fixedSchedules = data;
            } else {
                fixedSchedules = getFallbackFixedSchedules();
            }
        } else {
            fixedSchedules = getFallbackFixedSchedules();
        }

        if (realtime && realtime.subscribeToAreaSchedules && !unsubscribeFixedSchedules) {
            unsubscribeFixedSchedules = realtime.subscribeToAreaSchedules((items) => {
                fixedSchedules = (items || []).length ? (items || []) : getFallbackFixedSchedules();
                renderScheduleList();
                renderCalendar();
            }, true);
        }
    } catch (error) {
        console.error('CRITICAL: Error loading fixed schedules from Supabase:', error);
        fixedSchedules = getFallbackFixedSchedules();
    }
}

function renderFixedSchedulesInfo() {
    // Display fixed schedules in a separate section if needed
    console.log('Fixed schedules loaded:', fixedSchedules);
}

function normalizeSchedule(schedule) {
    const scheduledDate = resolveScheduledDate(schedule);
    const originalDate = resolveOriginalDate(schedule);
    return {
        id: schedule.id || schedule.scheduleId || `schedule_${Date.now()}`,
        name: schedule.name || schedule.scheduleName || schedule.route || 'Untitled Schedule',
        area: schedule.area || schedule.serviceArea || 'general',
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

    const displaySchedules = getDisplaySchedules();
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

    let html = '';

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

    // Re-attach event listeners...
    // Note: Since we use innerHTML, we need to attach to all buttons in the document or scope
    attachScheduleEventListeners(scheduleListElement);
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
        button.addEventListener('click', async () => {
            const id = button.getAttribute('data-id');
            if (id) {
                await confirmDeleteSchedule(id);
            }
        });
    });

    const rescheduleButtons = container.querySelectorAll('.btn-reschedule');
    rescheduleButtons.forEach(button => {
        button.addEventListener('click', () => {
            const area = button.getAttribute('data-area');
            const date = button.getAttribute('data-date');
            const time = button.getAttribute('data-time');
            const name = button.getAttribute('data-name');
            if (area && date) {
                openRescheduleModal({ area, date, time, name });
            }
        });
    });
}

function createScheduleCard(schedule) {
    const statusClass = getStatusClass(schedule.status);
    const isFixedArea = fixedSchedules.some(fs => fs.area === schedule.area?.toLowerCase());
    const isFixed = schedule.isFixed === true;
    const isRescheduled = schedule.isRescheduled === true;

    // Always allow rescheduling for emergency purposes, but style it differently
    const rescheduleBtn = `
        <button type="button" class="btn-reschedule" 
            data-area="${schedule.area}" 
            data-date="${formatDateInput(schedule.scheduledDate)}" 
            data-time="${schedule.fixedTime || schedule.startTime || '08:00'}" 
            data-name="${schedule.name}"
            title="Change collection date or time"
            style="
                background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                color: white;
                border: none;
                padding: 8px 16px;
                border-radius: 8px;
                font-size: 13px;
                font-weight: 600;
                cursor: pointer;
                display: inline-flex;
                align-items: center;
                gap: 6px;
                transition: all 0.3s ease;
                box-shadow: 0 2px 8px rgba(102, 126, 234, 0.3);
            "
            onmouseover="this.style.transform='translateY(-2px)'; this.style.boxShadow='0 4px 12px rgba(102, 126, 234, 0.5)'"
            onmouseout="this.style.transform='translateY(0)'; this.style.boxShadow='0 2px 8px rgba(102, 126, 234, 0.3)'">
            <i class="fas fa-calendar-alt"></i>
            Reschedule
        </button>
    `;

    return `
        <div class="schedule-item-card">
            <div class="schedule-header">
                <h4 class="schedule-title">${schedule.name}</h4>
                <div style="display: flex; gap: 8px; align-items: center;">
                    ${isRescheduled ? '<span class="schedule-status warning" style="font-size: 0.75rem;">RESCHEDULED</span>' : ''}
                    ${(isFixed) ? '<span class="schedule-status info" style="font-size: 0.75rem;">FIXED</span>' : ''}
                    <span class="schedule-status ${statusClass}">${schedule.status.replace('-', ' ')}</span>
                </div>
                <div class="schedule-actions">
                    ${!isRescheduled && !isFixed ? '' : (isRescheduled ? `
                        <button type="button" class="btn-icon edit-schedule-btn" data-id="${schedule.id}" title="Edit Reschedule">
                            <i class="fas fa-edit"></i>
                        </button>
                        <button type="button" class="btn-icon delete-schedule-btn" data-id="${schedule.id}" title="Cancel Reschedule">
                            <i class="fas fa-trash"></i>
                        </button>
                    ` : rescheduleBtn)}
                </div>
            </div>
            <div class="schedule-details">
                <div class="schedule-detail">
                    <span class="schedule-detail-label">Area</span>
                    <span class="schedule-detail-value">${capitalize(schedule.area)}</span>
                </div>
                <div class="schedule-detail">
                    <span class="schedule-detail-label">Date</span>
                    <span class="schedule-detail-value">${formatDisplayDate(schedule.scheduledDate)}</span>
                </div>
                <div class="schedule-detail">
                    <span class="schedule-detail-label">Time</span>
                    <span class="schedule-detail-value">${formatDisplayTime(schedule.scheduledDate)}</span>
                </div>
                <div class="schedule-detail">
                    <span class="schedule-detail-label">Frequency</span>
                    <span class="schedule-detail-value">${capitalize(schedule.frequency)}</span>
                </div>
            </div>
            ${schedule.description ? `<p style="margin-top: 1rem; color: #4b5563;">${schedule.description}</p>` : ''}
            ${(isFixed) ? '<p style="margin-top: 0.5rem; color: #3b82f6; font-size: 0.875rem;"><i class="fas fa-info-circle"></i> Fixed recurring schedule</p>' : ''}
            ${isRescheduled && schedule.originalDate ? `<p style="margin-top: 0.5rem; color: #f97316; font-size: 0.875rem;"><i class="fas fa-exchange-alt"></i> Original: ${formatDisplayDate(schedule.originalDate)}</p>` : ''}
        </div>
    `;
}

function renderCalendar() {
    const calendarGrid = document.getElementById('calendarGrid');
    const currentMonthLabel = document.getElementById('currentMonth');
    if (!calendarGrid || !currentMonthLabel) return;

    const displaySchedules = getDisplaySchedules();

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

    const scheduleName = formData.get('scheduleName')?.trim();
    const area = formData.get('area');
    const frequency = formData.get('frequency');
    const startDate = formData.get('startDate');
    const startTime = formData.get('startTime');
    const description = formData.get('description')?.trim() || '';

    if (!scheduleName || !area || !frequency || (frequency === 'one-time' && (!startDate || !startTime)) || (frequency === 'weekly' && !startTime)) {
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
            console.log('📅 Creating new area schedule:', areaPayload);
            const { data, error } = await dbService.createAreaSchedule(areaPayload);
            if (error) throw error;

            showNotification('Fixed area schedule created successfully!', 'success');
            loadFixedSchedules(); // Refresh fixed schedules
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
    const isFixedArea = (fixedSchedules.length ? fixedSchedules : getFallbackFixedSchedules())
        .some(fs => (fs.area || '').toLowerCase() === normalizedArea);

    const isReschedule = (formData.get('isReschedule') || 'false') === 'true';
    const originalDateValue = formData.get('originalDate')?.toString().trim() || '';
    const originalTimeValue = formData.get('originalTime')?.toString().trim() || '';

    if (!isReschedule && frequency === 'one-time') {
        showNotification('Manual one-time schedules are disabled. Please use the reschedule button on a fixed schedule.', 'error');
        return;
    }

    const schedulePayload = {
        name: scheduleName,
        area,
        serviceArea: area,
        frequency,
        description,
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
            console.log('📅 Updating existing reschedule:', existingReschedule.id);
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

        if (persistedSchedule.isRescheduled) {
            notifyUsersOfReschedule(persistedSchedule, 'reschedule');
        }

        console.log('📅 Schedule created:', persistedSchedule);
        form.reset();
        closeAddScheduleModal();
    } catch (error) {
        console.error('Error creating schedule:', error);
        const message = utils?.getErrorMessage?.(error) || 'Failed to create schedule. Please try again.';
        showNotification(message, 'error');
    }
}

function openRescheduleModal({ area, date, time, name }) {
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
    form.scheduleName.value = name || `Reschedule: ${capitalize(area)}`;
    form.area.value = area;
    form.frequency.value = 'one-time';
    form.startDate.value = date;
    form.startTime.value = (time || '08:00').toString().slice(0, 5);
    form.description.value = '';
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

    if (frequency === 'weekly') {
        daysContainer.style.display = 'block';
        startDateGroup.style.display = 'none';
        form.startDate.required = false;
    } else {
        daysContainer.style.display = 'none';
        startDateGroup.style.display = 'block';
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

    form.scheduleName.value = schedule.name || '';
    form.area.value = schedule.area || '';
    form.frequency.value = schedule.frequency || '';
    form.startDate.value = schedule.startDate || formatDateInput(schedule.scheduledDate);
    form.startTime.value = schedule.startTime || formatTimeInput(schedule.scheduledDate);
    form.description.value = schedule.description || '';

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

    const title = modal.querySelector('.modal-header h3');
    const submitButton = modal.querySelector('.modal-actions button[type="submit"]');
    if (title) title.textContent = 'Edit Schedule';
    if (submitButton) submitButton.textContent = 'Save Changes';
}

async function confirmDeleteSchedule(scheduleId) {
    const schedule = schedules.find(s => s.id === scheduleId);
    const name = schedule?.name || 'this schedule';
    const confirmed = window.confirm(`Are you sure you want to delete ${name}? This action cannot be undone.`);
    if (!confirmed) return;

    try {
        if (dbService && dbService.deleteCollectionSchedule) {
            const { error } = await dbService.deleteCollectionSchedule(scheduleId);
            if (error) throw error;
        }

        schedules = schedules.filter(s => s.id !== scheduleId);
        renderScheduleList();
        renderCalendar();

        showNotification('Schedule deleted successfully.', 'success');
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

function generateMockSchedules() {
    const baseDate = new Date();
    return Array.from({ length: 5 }, (_, index) => {
        const date = new Date(baseDate);
        date.setDate(baseDate.getDate() + index * 2);
        date.setHours(8 + index, 30, 0, 0);
        return {
            id: `mock_schedule_${index + 1}`,
            name: `Route ${String.fromCharCode(65 + index)} Pickup`,
            area: index % 2 === 0 ? 'downtown' : 'residential',
            frequency: index % 2 === 0 ? 'weekly' : 'bi-weekly',
            description: 'Routine waste collection.',
            status: 'scheduled',
            scheduledDate: date,
            startDate: formatDateInput(date),
            startTime: formatTimeInput(date)
        };
    });
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
    return new Intl.DateTimeFormat('en-US', {
        hour: 'numeric',
        minute: 'numeric'
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

async function notifyUsersOfReschedule(schedule, type) {
    // schedule object has: area, scheduledDate, name, etc.
    if (!dbService || !dbService.getUsers || !dbService.createNotification) return;

    try {
        console.log(`🔔 Starting notification process for ${type} schedule:`, schedule);

        // 1. Get all users
        const { data: users, error } = await dbService.getUsers();
        if (error) throw error;

        // 2. Filter users
        const affectedArea = (schedule.area || '').toLowerCase();

        const residentsToNotify = users.filter(u =>
            u.role === 'resident' &&
            (u.location || u.barangay || '').toLowerCase() === affectedArea
        );

        const collectorsToNotify = users.filter(u =>
            (u.role === 'collector' || u.role === 'driver') &&
            u.status === 'active'
        );

        const recipients = [...residentsToNotify, ...collectorsToNotify];

        if (recipients.length === 0) {
            console.log('⚠️ No recipients found for notification');
            return;
        }

        console.log(`🔔 Found ${recipients.length} recipients (${residentsToNotify.length} residents, ${collectorsToNotify.length} collectors)`);

        // 3. Create notifications
        const dateObj = new Date(schedule.scheduledDate);
        const dateStr = dateObj.toLocaleDateString();
        const timeStr = dateObj.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

        const title = '📅 Schedule Update';
        const message = `Your collection for ${capitalize(schedule.area)} is now on ${dateStr} at ${timeStr}.${schedule.rescheduledReason ? ` Reason: ${schedule.rescheduledReason}` : ''}`;

        const notifications = recipients.map(user => ({
            userId: user.id,
            title: title,
            message: message,
            type: 'alert',
            priority: 'high'
        }));

        // 4. Send in parallel
        const promises = notifications.map(n => dbService.createNotification(n));
        await Promise.all(promises);

        console.log('✅ Notifications sent successfully');
        if (typeof showNotification === 'function') {
            // showNotification(`Notified ${recipients.length} users about the reschedule.`, 'info');
            console.log(`Notified ${recipients.length} users about the reschedule.`);
        }

    } catch (err) {
        console.error('❌ Error sending reschedule notifications:', err);
    }
}
