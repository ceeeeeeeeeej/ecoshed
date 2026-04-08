// Settings page functionality
import { dbService, utils } from '../../config/supabase_config.js';

console.log('⚙️ Settings page loaded');

// Initialize settings page
document.addEventListener('DOMContentLoaded', async function () {
    console.log('⚙️ Initializing settings page...');
    setupEventListeners();
    await loadSettingsFromFirebase();
});

// Load global system settings from Firestore (shared by all admins)
async function loadSettingsFromFirebase() {
    try {
        if (dbService && dbService.getSystemSettings) {
            const { data, error } = await dbService.getSystemSettings();
            if (error) throw error;
            if (data) {
                applySettingsToForm(data);
            }
        }
    } catch (error) {
        console.warn('Failed to load system settings, using UI defaults:', error);
        // On error, keep whatever defaults are defined in the HTML
    }
}

// Apply loaded settings to the form controls
function applySettingsToForm(settings) {
    const systemNameInput = document.getElementById('systemName');
    if (systemNameInput && settings.systemName !== undefined) {
        systemNameInput.value = settings.systemName;
    }

    const timezoneSelect = document.getElementById('timezone');
    if (timezoneSelect && settings.timezone) {
        timezoneSelect.value = settings.timezone;
    }

    const languageSelect = document.getElementById('language');
    if (languageSelect && settings.language) {
        languageSelect.value = settings.language;
    }

    const dateFormatSelect = document.getElementById('dateFormat');
    if (dateFormatSelect && settings.dateFormat) {
        dateFormatSelect.value = settings.dateFormat;
    }

    const sessionTimeoutInput = document.getElementById('sessionTimeout');
    if (sessionTimeoutInput && settings.sessionTimeout !== undefined) {
        sessionTimeoutInput.value = settings.sessionTimeout;
    }

    const passwordPolicySelect = document.getElementById('passwordPolicy');
    if (passwordPolicySelect && settings.passwordPolicy) {
        passwordPolicySelect.value = settings.passwordPolicy;
    }

    const backupTimeInput = document.getElementById('backupTime');
    if (backupTimeInput && settings.backupTime) {
        backupTimeInput.value = settings.backupTime;
    }

    const retentionDaysInput = document.getElementById('retentionDays');
    if (retentionDaysInput && settings.retentionDays !== undefined) {
        retentionDaysInput.value = settings.retentionDays;
    }

    const allowRegCheckbox = document.getElementById('allowUserRegistration');
    if (allowRegCheckbox && settings.allowUserRegistration !== undefined) {
        allowRegCheckbox.checked = !!settings.allowUserRegistration;
    }

    const emailVerCheckbox = document.getElementById('emailVerificationRequired');
    if (emailVerCheckbox && settings.emailVerificationRequired !== undefined) {
        emailVerCheckbox.checked = !!settings.emailVerificationRequired;
    }

    const adminApprovalCheckbox = document.getElementById('adminApprovalRequired');
    if (adminApprovalCheckbox && settings.adminApprovalRequired !== undefined) {
        adminApprovalCheckbox.checked = !!settings.adminApprovalRequired;
    }
}

// Collect current form values into a settings object
function collectSettingsFromForm() {
    const settings = {};

    const systemNameInput = document.getElementById('systemName');
    if (systemNameInput) settings.systemName = systemNameInput.value;

    const timezoneSelect = document.getElementById('timezone');
    if (timezoneSelect) settings.timezone = timezoneSelect.value;

    const languageSelect = document.getElementById('language');
    if (languageSelect) settings.language = languageSelect.value;

    const dateFormatSelect = document.getElementById('dateFormat');
    if (dateFormatSelect) settings.dateFormat = dateFormatSelect.value;

    const sessionTimeoutInput = document.getElementById('sessionTimeout');
    if (sessionTimeoutInput) settings.sessionTimeout = Number(sessionTimeoutInput.value) || 0;

    const passwordPolicySelect = document.getElementById('passwordPolicy');
    if (passwordPolicySelect) settings.passwordPolicy = passwordPolicySelect.value;

    const backupTimeInput = document.getElementById('backupTime');
    if (backupTimeInput) settings.backupTime = backupTimeInput.value;

    const retentionDaysInput = document.getElementById('retentionDays');
    if (retentionDaysInput) settings.retentionDays = Number(retentionDaysInput.value) || 0;

    const allowRegCheckbox = document.getElementById('allowUserRegistration');
    if (allowRegCheckbox) settings.allowUserRegistration = allowRegCheckbox.checked;

    const emailVerCheckbox = document.getElementById('emailVerificationRequired');
    if (emailVerCheckbox) settings.emailVerificationRequired = emailVerCheckbox.checked;

    const adminApprovalCheckbox = document.getElementById('adminApprovalRequired');
    if (adminApprovalCheckbox) settings.adminApprovalRequired = adminApprovalCheckbox.checked;

    return settings;
}

function setupEventListeners() {
    // Inline onclick handlers in settings.html call saveSettings/showSettingsSection/etc.
}

// Save all settings globally for all admins (only superadmin can modify)
async function saveSettings() {
    // Only superadmin accounts are allowed to change global system settings
    try {
        const rawUser = localStorage.getItem('userData');
        const parsedUser = rawUser ? JSON.parse(rawUser) : null;
        const role = (parsedUser?.role || '').toLowerCase();

        if (role !== 'superadmin') {
            showNotification('Only super administrator accounts can update system settings.', 'error');
            return;
        }

        const settings = collectSettingsFromForm();

        if (!dbService || !dbService.updateSystemSettings) {
            throw new Error('Settings service unavailable');
        }

        const { error } = await dbService.updateSystemSettings(settings);
        if (error) throw error;

        showNotification('Settings saved successfully!', 'success');
    } catch (error) {
        console.error('Error saving settings:', error);
        const message = utils && utils.getErrorMessage
            ? utils.getErrorMessage(error)
            : (error.message || 'Failed to save settings');
        showNotification(message, 'error');
    }
}

// Navigate between settings sections
function showSettingsSection(sectionKey) {
    const sections = document.querySelectorAll('.settings-section');
    sections.forEach(section => section.classList.remove('active'));

    const target = document.getElementById(`${sectionKey}-settings`);
    if (target) target.classList.add('active');

    const navItems = document.querySelectorAll('.settings-nav .nav-item');
    navItems.forEach(btn => btn.classList.remove('active'));

    const activeBtn = document.querySelector(`.settings-nav .nav-item[onclick*="'${sectionKey}'"]`);
    if (activeBtn) activeBtn.classList.add('active');
}

// Integration/backup stubs (UI feedback only)
function configureIntegration(integrationKey) {
    showNotification(`Integration settings for ${integrationKey} are not configured yet.`, 'info');
}

function createBackup() {
    showNotification('Backup operation is not implemented in this demo.', 'info');
}

function restoreBackup() {
    showNotification('Restore operation is not implemented in this demo.', 'info');
}

// Simple toast notification for settings page
function showNotification(message, type = 'info') {
    const notification = document.createElement('div');
    notification.className = `notification notification-${type}`;
    notification.textContent = message;

    document.body.appendChild(notification);

    setTimeout(() => {
        notification.remove();
    }, 3000);
}

// Expose functions globally for inline handlers in settings.html
window.saveSettings = saveSettings;
window.showSettingsSection = showSettingsSection;
window.configureIntegration = configureIntegration;
window.createBackup = createBackup;
window.restoreBackup = restoreBackup;

