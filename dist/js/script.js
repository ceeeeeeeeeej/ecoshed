// Admin Dashboard JavaScript
import { authService, dbService, realtime, utils, supabase, TABLES } from '../config/supabase_config.js';

// DOM Elements - will be initialized after DOM is ready
let loginScreen, registrationScreen, loginForm, registrationForm;
let sidebarToggle, sidebar, menuItems, pages;

// Initialize the application
document.addEventListener('DOMContentLoaded', function () {
    // Initialize DOM elements
    initializeDOMElements();

    // Check if user is already logged in (must have both local flag and Supabase user)
    const hasLocalSession = localStorage.getItem('adminLoggedIn') === 'true';
    if (authService && authService.getCurrentUser) {
        const currentUser = authService.getCurrentUser();
        if (hasLocalSession && currentUser) {
            showDashboard();
        } else {
            showLogin();
        }
    } else {
        // If we cannot verify with Supabase Auth, do not trust localStorage alone
        showLogin();
    }

    // Listen to Supabase auth state changes
    if (authService && authService.onAuthStateChanged) {
        authService.onAuthStateChanged((event, session) => {
            const user = session?.user;
            if (user && localStorage.getItem('adminLoggedIn') === 'true') {
                showDashboard();
            } else {
                showLogin();
            }
        });
    } else {
        console.warn('Supabase auth service not available, using localStorage only');
    }

    // Initialize event listeners
    initializeEventListeners();

    // Clear URL parameters for security
    if (window.location.search) {
        window.history.replaceState({}, document.title, window.location.pathname);
    }
});

// Initialize DOM elements
function initializeDOMElements() {
    console.log('Initializing DOM elements...');
    loginScreen = document.getElementById('loginScreen');
    // adminDashboard removed - now using separate dashboard.html
    loginForm = document.getElementById('loginForm');
    registrationForm = document.getElementById('registrationForm');
    sidebarToggle = document.querySelector('.sidebar-toggle');
    sidebar = document.querySelector('.sidebar');
    menuItems = document.querySelectorAll('.menu-item');
    pages = document.querySelectorAll('.page');

    console.log('DOM elements found:', {
        loginScreen: !!loginScreen,
        // adminDashboard removed - now using separate dashboard.html
        loginForm: !!loginForm,
        registrationForm: !!registrationForm,
        sidebarToggle: !!sidebarToggle,
        sidebar: !!sidebar,
        menuItems: menuItems.length,
        pages: pages.length
    });

    // Validate critical elements
    if (!loginScreen) console.error('loginScreen element not found');
    if (!loginForm) console.error('loginForm element not found');
}

// Initialize all event listeners
function initializeEventListeners() {
    // Login form submission
    if (loginForm) {
        console.log('Adding login form event listener');
        loginForm.addEventListener('submit', handleLogin);
    } else {
        console.error('Cannot add login form event listener - element not found');
    }

    // Password visibility toggle for login
    const loginPasswordIcon = document.querySelector('.password-icon');
    if (loginPasswordIcon) {
        loginPasswordIcon.addEventListener('click', togglePasswordVisibility);
    }


    // Demo login button
    const demoLoginBtn = document.getElementById('demoLoginBtn');
    if (demoLoginBtn) {
        console.log('Adding demo login button event listener');
        demoLoginBtn.addEventListener('click', function (e) {
            e.preventDefault();
            console.log('Demo login clicked');
            handleDemoLogin();
        });
    } else {
        console.error('Demo login button not found');
    }
}

// Handle login form submission
async function handleLogin(e) {
    console.log('handleLogin function called');
    e.preventDefault();

    const emailField = document.getElementById('username');
    const passwordField = document.getElementById('password');
    const rememberMeField = document.getElementById('rememberMe');

    if (!emailField || !passwordField) {
        console.error('Login fields not found:', { emailField: !!emailField, passwordField: !!passwordField });
        return;
    }

    const email = emailField.value.trim();
    const password = passwordField.value;
    const rememberMe = rememberMeField ? rememberMeField.checked : false;
    let adminProfile = null;

    console.log('Login attempt:', { email, password: password ? '***' : 'empty', rememberMe });

    // Basic validation
    if (!email || !password) {
        showLoginError('Please enter both email and password');
        return;
    }

    // Show loading state
    const loginBtn = document.querySelector('.login-button');
    if (loginBtn) {
        loginBtn.classList.add('loading');
        loginBtn.disabled = true;
    }

    try {
        let user, error;

        if (authService && authService.signIn) {
            const result = await authService.signIn(email, password);
            user = result.user;
            error = result.error;
        } else {
            // Fallback demo login
            console.warn('Supabase auth service not available, using demo login');
            if (email === 'admin@ecoshed.com' && password === 'admin123') {
                user = { id: 'demo_user', email: email };
                error = null;
            } else {
                error = new Error('Invalid credentials');
            }
        }

        if (error) {
            throw error;
        }

        // Check if user is a collector - collectors cannot log into admin dashboard
        if (user && user.id && dbService) {
            try {
                // Get user from Supabase
                const { data: userData, error: userError } = await supabase
                    .from(TABLES.USERS)
                    .select('*')
                    .eq('id', user.id)
                    .single();

                if (userError && userError.code !== 'PGRST116') {
                    throw userError;
                }

                if (userData) {
                    adminProfile = userData;
                    const userStatus = (userData.status || '').toLowerCase();
                    if (userStatus === 'pending_approval') {
                        if (authService && authService.signOut) {
                            await authService.signOut();
                        }
                        throw new Error('Your account is awaiting admin approval. Please contact your system administrator.');
                    }

                    const userRole = (userData.role || '').toLowerCase();

                    // Only admin and superadmin accounts may access the admin dashboard
                    if (userRole !== 'admin' && userRole !== 'superadmin') {
                        if (authService && authService.signOut) {
                            await authService.signOut();
                        }
                        throw new Error('Only administrator and super administrator accounts can access the admin dashboard.');
                    }
                } else {
                    // User document doesn't exist in users table
                    // This might be a collector account created in a different table
                    // For security, deny access if user is not found in users
                    console.warn('User not found in users table - denying access');
                    if (authService && authService.signOut) {
                        await authService.signOut();
                    }
                    throw new Error('Access denied. This account is not authorized to access the admin dashboard.');
                }
            } catch (roleCheckError) {
                // Any error while checking role/profile should BLOCK login for security
                console.error('Error checking user role, denying access:', roleCheckError);
                if (authService && authService.signOut) {
                    await authService.signOut();
                }
                throw new Error('Unable to verify your admin permissions. Please try again later or contact your system administrator.');
            }
        }

        // Store login state
        localStorage.setItem('adminLoggedIn', 'true');
        const loginTimestamp = new Date().toISOString();
        const profileToStore = {
            uid: user.id,
            email: user.email,
            fullName: adminProfile?.fullName || `${adminProfile?.firstName || ''} ${adminProfile?.lastName || ''}`.trim() || user.displayName || user.email || 'Admin User',
            role: adminProfile?.role || 'admin',
            serviceArea: adminProfile?.serviceArea || adminProfile?.organization || 'Head Office',
            phone: adminProfile?.phone || '',
            organization: adminProfile?.organization || 'EcoSched Admin',
            lastLoginAt: loginTimestamp,
            loginTime: loginTimestamp
        };
        localStorage.setItem('userData', JSON.stringify(profileToStore));

        if (rememberMe) {
            localStorage.setItem('rememberMe', 'true');
        }

        console.log('Login successful:', user);
        showLoginSuccess();

        // Redirect to dashboard after success
        setTimeout(() => {
            showDashboard();
        }, 1500);

    } catch (error) {
        console.error('Login error:', error);
        const errorMessage = utils && utils.getErrorMessage ? utils.getErrorMessage(error) : error.message || 'Login failed';
        showLoginError(errorMessage);
    } finally {
        // Reset button state
        if (loginBtn) {
            loginBtn.classList.remove('loading');
            loginBtn.disabled = false;
        }
    }
}

// Handle demo login
function handleDemoLogin() {
    console.log('Demo login initiated');

    // Set demo user data
    localStorage.setItem('adminLoggedIn', 'true');
    const demoTimestamp = new Date().toISOString();
    localStorage.setItem('userData', JSON.stringify({
        uid: 'demo_user',
        email: 'demo@ecosched.com',
        fullName: 'Demo Administrator',
        role: 'admin',
        serviceArea: 'Demo Environment',
        organization: 'EcoSched',
        lastLoginAt: demoTimestamp,
        loginTime: demoTimestamp,
        isDemo: true
    }));

    showLoginSuccess('Demo login successful!');

    // Redirect to dashboard
    setTimeout(() => {
        showDashboard();
    }, 1500);
}

// Show login success
function showLoginSuccess(message = 'Login successful!') {
    const loginBtn = document.querySelector('.login-button');
    if (loginBtn) {
        const originalContent = loginBtn.innerHTML;
        loginBtn.innerHTML = `<i class="fas fa-check"></i><span>${message}</span>`;
        loginBtn.style.background = 'linear-gradient(135deg, #10b981, #059669)';

        setTimeout(() => {
            loginBtn.innerHTML = originalContent;
            loginBtn.style.background = 'linear-gradient(135deg, #00C853, #4CAF50)';
        }, 2000);
    }
}

// Show login error
function showLoginError(message) {
    const loginBtn = document.querySelector('.login-button');
    if (loginBtn) {
        const originalContent = loginBtn.innerHTML;
        loginBtn.innerHTML = `<i class="fas fa-times"></i><span>${message}</span>`;
        loginBtn.style.background = 'linear-gradient(135deg, #ef4444, #dc2626)';

        // Add shake animation
        loginBtn.style.animation = 'shake 0.5s ease-in-out';

        setTimeout(() => {
            loginBtn.innerHTML = originalContent;
            loginBtn.style.background = 'linear-gradient(135deg, #00C853, #4CAF50)';
            loginBtn.style.animation = '';
        }, 3000);
    }
}

// Clear login errors
function clearLoginErrors() {
    const loginBtn = document.querySelector('.login-button');
    if (loginBtn) {
        loginBtn.style.background = 'linear-gradient(135deg, #00C853, #4CAF50)';
        loginBtn.style.animation = '';
    }
}

// Show login panel
function showLogin() {
    console.log('showLogin function called');

    // Check if we're on the dashboard page
    if (window.location.pathname.includes('dashboard.html')) {
        // Redirect to login page
        window.location.href = 'index.html';
        return;
    }

    const loginPanel = document.querySelector('.login-panel');
    const registrationPanel = document.querySelector('.registration-panel');

    if (loginPanel && registrationPanel) {
        loginPanel.style.display = 'block';
        registrationPanel.style.display = 'none';
    } else {
        console.log('Panel elements not found - this is normal on dashboard page');
    }

    if (loginScreen) {
        loginScreen.style.display = 'flex';
        loginScreen.style.setProperty('display', 'flex', 'important');
    }
}

// Show dashboard
function showDashboard() {
    console.log('showDashboard called');
    if (loginScreen) {
        console.log('Hiding login screen');
        loginScreen.style.display = 'none';
    } else {
        console.error('Login screen element not found');
    }

    // Redirect to dashboard.html instead of showing inline dashboard
    console.log('Redirecting to dashboard.html');
    window.location.href = 'dashboard.html';
}

// Toggle password visibility
function togglePasswordVisibility() {
    const passwordField = document.getElementById('password');
    const passwordIcon = document.querySelector('.password-icon i');

    if (passwordField && passwordIcon) {
        if (passwordField.type === 'password') {
            passwordField.type = 'text';
            passwordIcon.className = 'fas fa-eye-slash';
        } else {
            passwordField.type = 'password';
            passwordIcon.className = 'fas fa-eye';
        }
    }
}

// Toggle sidebar for mobile
function toggleSidebar() {
    if (sidebar) {
        sidebar.classList.toggle('open');
    }
}

// Logout function
function logout() {
    if (confirm('Are you sure you want to logout?')) {
        // Clear localStorage
        localStorage.removeItem('adminLoggedIn');
        localStorage.removeItem('userData');
        localStorage.removeItem('rememberMe');

        // Sign out from Supabase if available
        if (authService && authService.signOut) {
            authService.signOut();
        }

        // Redirect to login page
        window.location.href = 'index.html';
    }
}

// Open terms and privacy modal
function openTermsAndPrivacy() {
    // For now, just show an alert. In a real app, this would open a modal
    alert('Terms of Service and Privacy Policy would be displayed here.');
}

// Format phone number
function formatPhoneNumber(input) {
    let value = input.value.replace(/\D/g, '');

    if (value.length === 0) return;

    if (value.length <= 3) {
        input.value = value;
    } else if (value.length <= 6) {
        input.value = `(${value.slice(0, 3)}) ${value.slice(3)}`;
    } else if (value.length <= 10) {
        input.value = `(${value.slice(0, 3)}) ${value.slice(3, 6)}-${value.slice(6)}`;
    } else if (value.length === 11 && value[0] === '1') {
        input.value = `+1 (${value.slice(1, 4)}) ${value.slice(4, 7)}-${value.slice(7)}`;
    } else {
        input.value = `+${value}`;
    }
}

// Validate phone number
function validatePhoneNumber(phone) {
    if (!phone) return false;

    // Remove all non-digit characters except +
    const cleaned = phone.replace(/[^\d+]/g, '');

    // Check for various phone number formats
    const patterns = [
        /^\+1\d{10}$/,           // +1 followed by 10 digits (US/Canada)
        /^\+[1-9]\d{1,14}$/,     // International format (1-15 digits after country code)
        /^1\d{10}$/,             // 1 followed by 10 digits (US/Canada without +)
        /^\d{10}$/,              // 10 digits (US format)
        /^\d{3}-\d{3}-\d{4}$/,   // 3-3-4 format
        /^\(\d{3}\)\s?\d{3}-\d{4}$/, // (555) 123-4567 format
        /^\d{3}\.\d{3}\.\d{4}$/  // 555.123.4567 format
    ];

    return patterns.some(pattern => pattern.test(phone)) ||
        (cleaned.length >= 10 && cleaned.length <= 15 && /^\+?[1-9]\d+$/.test(cleaned));
}

// Export functions for global access
window.navigateToPage = function (page) {
    console.log('Navigate to page:', page);
    // This function is now handled in dashboard.js
};

window.showLogin = showLogin;
window.logout = logout;
window.openTermsAndPrivacy = openTermsAndPrivacy;
window.formatPhoneNumber = formatPhoneNumber;
window.validatePhoneNumber = validatePhoneNumber;