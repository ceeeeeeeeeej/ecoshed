// Landing Page JavaScript

document.addEventListener('DOMContentLoaded', function () {
    // Mobile Navigation Toggle
    const hamburger = document.querySelector('.hamburger');
    const navMenu = document.querySelector('.nav-menu');

    hamburger.addEventListener('click', function () {
        hamburger.classList.toggle('active');
        navMenu.classList.toggle('active');
    });

    // Close mobile menu when clicking on a navigation link (not modal triggers)
    document.querySelectorAll('.nav-link').forEach(link => {
        link.addEventListener('click', (e) => {
            // Only close mobile menu if it's a real navigation link (not modal triggers)
            if (link.getAttribute('href') && link.getAttribute('href').startsWith('#')) {
                hamburger.classList.remove('active');
                navMenu.classList.remove('active');
            }
        });
    });

    // Smooth scrolling for navigation links
    document.querySelectorAll('a[href^="#"]').forEach(anchor => {
        anchor.addEventListener('click', function (e) {
            const href = this.getAttribute('href');
            // Skip modal trigger links (they have specific IDs)
            if (this.id === 'adminDashboardLink' || this.id === 'getStartedBtn' || this.id === 'adminAccessBtn' || this.id === 'footerAdminLink') {
                return; // Let the modal handlers deal with these
            }

            // Only process valid href attributes that aren't just "#"
            if (href && href !== '#' && href.length > 1) {
                e.preventDefault();
                const target = document.querySelector(href);
                if (target) {
                    target.scrollIntoView({
                        behavior: 'smooth',
                        block: 'start'
                    });
                }
            }
        });
    });

    // Image Gallery Slider
    const galleryImages = document.querySelectorAll('.gallery-image');
    const indicators = document.querySelectorAll('.indicator');
    let currentSlide = 0;

    function showSlide(index) {
        galleryImages.forEach((img, i) => {
            img.classList.toggle('active', i === index);
        });
        indicators.forEach((indicator, i) => {
            indicator.classList.toggle('active', i === index);
        });
    }

    indicators.forEach((indicator, index) => {
        indicator.addEventListener('click', () => {
            currentSlide = index;
            showSlide(currentSlide);
        });
    });

    // Auto-slide functionality
    setInterval(() => {
        currentSlide = (currentSlide + 1) % galleryImages.length;
        showSlide(currentSlide);
    }, 5000);

    // Enhanced navbar scroll effect
    window.addEventListener('scroll', function () {
        const navbar = document.querySelector('.navbar');
        if (window.scrollY > 100) {
            navbar.classList.add('scrolled');
        } else {
            navbar.classList.remove('scrolled');
        }
    });

    // Active navigation highlighting
    const sections = document.querySelectorAll('section[id]');
    const navLinks = document.querySelectorAll('.nav-link');

    function highlightNavigation() {
        let current = '';
        sections.forEach(section => {
            const sectionTop = section.offsetTop;
            const sectionHeight = section.clientHeight;
            if (window.scrollY >= (sectionTop - 200)) {
                current = section.getAttribute('id');
            }
        });

        navLinks.forEach(link => {
            link.classList.remove('active');
            if (link.getAttribute('href') === `#${current}`) {
                link.classList.add('active');
            }
        });
    }

    window.addEventListener('scroll', highlightNavigation);

    // Observe elements for animation
    const revealObserver = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.classList.add('active');
            }
        });
    }, {
        threshold: 0.1,
        rootMargin: '0px 0px -50px 0px'
    });

    // Initialize reveal elements
    document.querySelectorAll('.reveal').forEach(el => {
        revealObserver.observe(el);
    });

    // Counter animation for stats
    function animateCounters() {
        const counters = document.querySelectorAll('.stat-number');
        counters.forEach(counter => {
            const target = parseInt(counter.textContent.replace(/[^\d]/g, ''));
            const duration = 2000;
            const increment = target / (duration / 16);
            let current = 0;

            const timer = setInterval(() => {
                current += increment;
                if (current >= target) {
                    current = target;
                    clearInterval(timer);
                }

                if (counter.textContent.includes('tons')) {
                    counter.textContent = current.toFixed(1) + ' tons';
                } else if (counter.textContent.includes('%')) {
                    counter.textContent = Math.floor(current) + '%';
                } else {
                    counter.textContent = Math.floor(current).toLocaleString();
                }
            }, 16);
        });
    }

    // Trigger counter animation when stats section is visible
    const statsSection = document.querySelector('.about-stats');
    if (statsSection) {
        const statsObserver = new IntersectionObserver(function (entries) {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    animateCounters();
                    statsObserver.unobserve(entry.target);
                }
            });
        }, { threshold: 0.5 });

        statsObserver.observe(statsSection);
    }

    // Parallax effect for hero background
    window.addEventListener('scroll', function () {
        const scrolled = window.pageYOffset;
        const parallaxElements = document.querySelectorAll('.floating-leaf, .recycling-symbol');

        parallaxElements.forEach((element, index) => {
            const speed = 0.5 + (index * 0.1);
            element.style.transform = `translateY(${scrolled * speed}px)`;
        });
    });

    // Form validation for contact form (if added later)
    function validateForm(form) {
        const inputs = form.querySelectorAll('input[required], textarea[required]');
        let isValid = true;

        inputs.forEach(input => {
            if (!input.value.trim()) {
                input.style.borderColor = '#e74c3c';
                isValid = false;
            } else {
                input.style.borderColor = '#ddd';
            }
        });

        return isValid;
    }

    // Map slider controls for Location section
    const mapSlides = document.querySelectorAll('.map-slide');
    const prevMapBtn = document.querySelector('.map-slider-btn.prev');
    const nextMapBtn = document.querySelector('.map-slider-btn.next');
    let currentMapIndex = 0;

    function showMapSlide(index) {
        if (!mapSlides.length) return;
        currentMapIndex = (index + mapSlides.length) % mapSlides.length;
        mapSlides.forEach((slide, slideIndex) => {
            slide.classList.toggle('active', slideIndex === currentMapIndex);
        });
    }

    prevMapBtn?.addEventListener('click', () => {
        showMapSlide(currentMapIndex - 1);
    });

    nextMapBtn?.addEventListener('click', () => {
        showMapSlide(currentMapIndex + 1);
    });

    if (mapSlides.length) {
        showMapSlide(0);
    }

    // Add loading animation and initialize scroll helpers
    window.addEventListener('load', function () {
        document.body.classList.add('loaded');
        checkMapLoading();
        initScrollProgress();
        // initScrollAnimations handled by observer
    });

    // Check if Google Maps iframe loaded successfully
    function checkMapLoading() {
        const iframe = document.getElementById('googleMap');
        const fallback = document.getElementById('mapFallback');

        if (iframe) {
            let mapLoaded = false;

            // Set a timeout to check if iframe loads
            const timeout = setTimeout(() => {
                if (!mapLoaded) {
                    console.warn('Google Maps iframe failed to load within timeout period');
                    showMapFallback();
                }
            }, 8000); // Increased timeout to 8 seconds

            // Clear timeout if iframe loads successfully
            iframe.addEventListener('load', () => {
                mapLoaded = true;
                clearTimeout(timeout);
                console.log('Google Maps iframe loaded successfully');
            });

            // Handle iframe error
            iframe.addEventListener('error', (e) => {
                console.error('Google Maps iframe error:', e);
                clearTimeout(timeout);
                showMapFallback();
            });

            // Additional check for network errors
            iframe.addEventListener('loadstart', () => {
                console.log('Google Maps iframe started loading...');
            });
        }
    }

    // Show map fallback
    function showMapFallback() {
        const iframe = document.getElementById('googleMap');
        const fallback = document.getElementById('mapFallback');

        if (iframe && fallback) {
            iframe.style.display = 'none';
            fallback.style.display = 'flex';
        }
    }

    // Enhanced click effects to buttons
    document.querySelectorAll('.btn').forEach(button => {
        button.addEventListener('click', function (e) {
            const ripple = document.createElement('span');
            const rect = this.getBoundingClientRect();
            const size = Math.max(rect.width, rect.height);
            const x = e.clientX - rect.left - size / 2;
            const y = e.clientY - rect.top - size / 2;

            ripple.style.width = ripple.style.height = size + 'px';
            ripple.style.left = x + 'px';
            ripple.style.top = y + 'px';
            ripple.classList.add('ripple');

            this.appendChild(ripple);

            // Add loading state for primary buttons
            if (this.classList.contains('btn-primary')) {
                this.style.pointerEvents = 'none';
                this.style.opacity = '0.8';

                setTimeout(() => {
                    this.style.pointerEvents = 'auto';
                    this.style.opacity = '1';
                }, 1000);
            }

            setTimeout(() => {
                ripple.remove();
            }, 800);
        });
    });

    // Initialize scroll progress indicator
    function initScrollProgress() {
        const progressBar = document.createElement('div');
        progressBar.className = 'scroll-indicator';
        document.body.appendChild(progressBar);

        window.addEventListener('scroll', function () {
            const scrollTop = window.pageYOffset;
            const docHeight = document.body.scrollHeight - window.innerHeight;
            const scrollPercent = (scrollTop / docHeight) * 100;
            progressBar.style.transform = `scaleX(${scrollPercent / 100})`;
        });
    }

    // Initialize scroll animations
    // Unified scroll animation system handling is now done via the .reveal class observer above

    // Add parallax effect to floating elements
    function updateParallax() {
        const scrolled = window.pageYOffset;
        const parallaxElements = document.querySelectorAll('.floating-leaf, .recycling-symbol');

        parallaxElements.forEach((element, index) => {
            const speed = 0.3 + (index * 0.1);
            const yPos = -(scrolled * speed);
            element.style.transform = `translateY(${yPos}px)`;
        });
    }

    window.addEventListener('scroll', updateParallax);

    // Add typing effect to hero title
    function typeWriter(element, text, speed = 100) {
        let i = 0;
        element.innerHTML = '';

        function type() {
            if (i < text.length) {
                element.innerHTML += text.charAt(i);
                i++;
                setTimeout(type, speed);
            }
        }

        type();
    }

    // Initialize typing effect on page load
    window.addEventListener('load', function () {
        const heroTitle = document.querySelector('.hero-title');
        if (heroTitle) {
            const originalText = heroTitle.textContent;
            setTimeout(() => {
                typeWriter(heroTitle, originalText, 50);
            }, 1000);
        }
    });

    // Initialize modals
    initializeModals();
});

// Simplified navigation functionality
function initializeModals() {
    // No modal functionality needed - all links go to separate pages
    console.log('Landing page navigation initialized');
}

// Form functionality - removed since no forms on landing page
function initializeForms() {
    // No forms on landing page - all forms are on separate pages
    console.log('No forms to initialize on landing page');
}

// All form functions removed - forms are now on separate pages


// Validate registration form
function validateRegistrationForm(userData) {
    let isValid = true;

    // Clear previous validation states
    clearValidationStates();

    // Validate first name
    if (!userData.firstName || userData.firstName.trim().length < 2) {
        showFieldError('firstName', 'First name must be at least 2 characters');
        isValid = false;
    }

    // Validate last name
    if (!userData.lastName || userData.lastName.trim().length < 2) {
        showFieldError('lastName', 'Last name must be at least 2 characters');
        isValid = false;
    }

    // Validate email
    if (!userData.email) {
        showFieldError('email', 'Please enter a valid email address');
        isValid = false;
    } else {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(userData.email)) {
            showFieldError('email', 'Please enter a valid email address');
            isValid = false;
        }
    }

    // Validate organization
    if (!userData.organization || userData.organization.trim().length < 2) {
        showFieldError('organization', 'Organization name is required');
        isValid = false;
    }

    // Validate role
    if (!userData.role) {
        showFieldError('role', 'Please select your role');
        isValid = false;
    }

    // Validate service area
    if (!userData.serviceArea) {
        showFieldError('serviceArea', 'Please select a service area');
        isValid = false;
    }

    // Validate password
    if (!userData.password) {
        showFieldError('password', 'Password is required');
        isValid = false;
    } else if (userData.password.length < 8) {
        showFieldError('password', 'Password must be at least 8 characters');
        isValid = false;
    }

    // Validate password confirmation
    if (!userData.confirmPassword) {
        showFieldError('confirmPassword', 'Please confirm your password');
        isValid = false;
    } else if (userData.password !== userData.confirmPassword) {
        showFieldError('confirmPassword', 'Passwords do not match');
        isValid = false;
    }

    // Validate terms agreement
    const termsCheckbox = document.getElementById('agreeTerms');
    if (!termsCheckbox.checked) {
        showFieldError('agreeTerms', 'You must agree to the terms and conditions');
        isValid = false;
    }

    return isValid;
}

// Validate individual field
function validateField(e) {
    const field = e.target;
    const fieldId = field.id;
    const value = field.value.trim();

    // Clear previous validation
    const formGroup = field.closest('.form-group');
    formGroup.classList.remove('error', 'success');

    const existingError = formGroup.querySelector('.error-message');
    if (existingError) {
        existingError.remove();
    }

    let isValid = true;
    let errorMessage = '';

    // Field-specific validation
    switch (fieldId) {
        case 'firstName':
        case 'lastName':
            if (value.length < 2) {
                isValid = false;
                errorMessage = 'Must be at least 2 characters';
            }
            break;

        case 'email':
            const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
            if (value && !emailRegex.test(value)) {
                isValid = false;
                errorMessage = 'Please enter a valid email address';
            }
            break;

        case 'password':
            if (value && value.length < 8) {
                isValid = false;
                errorMessage = 'Password must be at least 8 characters';
            }
            break;

        case 'confirmPassword':
            const password = document.getElementById('password').value;
            if (value && value !== password) {
                isValid = false;
                errorMessage = 'Passwords do not match';
            }
            break;
    }

    // Show validation result
    if (value && isValid) {
        formGroup.classList.add('success');
    } else if (value && !isValid) {
        formGroup.classList.add('error');
        const errorDiv = document.createElement('div');
        errorDiv.className = 'error-message';
        errorDiv.textContent = errorMessage;
        formGroup.appendChild(errorDiv);
    }
}

// Show field error
function showFieldError(fieldId, message) {
    const field = document.getElementById(fieldId);
    const formGroup = field.closest('.form-group');

    formGroup.classList.add('error');
    formGroup.classList.remove('success');

    // Remove existing error message
    const existingError = formGroup.querySelector('.error-message');
    if (existingError) {
        existingError.remove();
    }

    // Add error message
    const errorDiv = document.createElement('div');
    errorDiv.className = 'error-message';
    errorDiv.textContent = message;
    formGroup.appendChild(errorDiv);
}

// Clear validation states
function clearValidationStates() {
    const formGroups = document.querySelectorAll('.form-group');
    formGroups.forEach(group => {
        group.classList.remove('error', 'success');
        const errorMessage = group.querySelector('.error-message');
        if (errorMessage) {
            errorMessage.remove();
        }
    });
}

// Check password strength
function checkPasswordStrength(e) {
    const password = e.target.value;
    const strengthIndicator = document.getElementById('passwordStrength');

    if (!strengthIndicator) return;

    // Simple password validation
    const validation = {
        score: [password.length >= 8, /[A-Z]/.test(password), /[a-z]/.test(password), /\d/.test(password)].filter(Boolean).length,
        strength: {
            length: password.length >= 8,
            uppercase: /[A-Z]/.test(password),
            lowercase: /[a-z]/.test(password),
            numbers: /\d/.test(password)
        }
    };

    // Update strength indicator
    let strengthClass = '';
    if (password.length === 0) {
        strengthClass = '';
    } else if (validation.score <= 2) {
        strengthClass = 'weak';
    } else if (validation.score === 3) {
        strengthClass = 'fair';
    } else if (validation.score === 4) {
        strengthClass = 'good';
    } else {
        strengthClass = 'strong';
    }

    strengthIndicator.className = `password-strength ${strengthClass}`;
}

// Toggle password visibility
function togglePassword(fieldId) {
    const field = document.getElementById(fieldId);
    const toggle = document.getElementById(fieldId + 'Toggle');

    if (field.type === 'password') {
        field.type = 'text';
        toggle.innerHTML = '<i class="fas fa-eye-slash"></i>';
    } else {
        field.type = 'password';
        toggle.innerHTML = '<i class="fas fa-eye"></i>';
    }
}

// Show notification
function showNotification(message, type = 'success') {
    const notification = document.createElement('div');
    notification.className = `registration-notification ${type}`;
    notification.innerHTML = `
        <div class="notification-content">
            <i class="fas fa-${type === 'success' ? 'check-circle' : 'exclamation-triangle'}"></i>
            <span>${message}</span>
        </div>
    `;

    // Add to page
    document.body.appendChild(notification);

    // Show notification
    setTimeout(() => {
        notification.classList.add('show');
    }, 100);

    // Remove notification after 5 seconds
    setTimeout(() => {
        notification.classList.remove('show');
        setTimeout(() => {
            if (notification.parentNode) {
                notification.parentNode.removeChild(notification);
            }
        }, 300);
    }, 5000);
}

// Add ripple effect CSS
const style = document.createElement('style');
style.textContent = `
    .btn {
        position: relative;
        overflow: hidden;
    }
    
    .ripple {
        position: absolute;
        border-radius: 50%;
        background: rgba(255, 255, 255, 0.6);
        transform: scale(0);
        animation: ripple-animation 0.6s linear;
        pointer-events: none;
    }
    
    @keyframes ripple-animation {
        to {
            transform: scale(4);
            opacity: 0;
        }
    }
    
    body.loaded {
        opacity: 1;
    }
    
    body {
        opacity: 0;
        transition: opacity 0.5s ease;
    }
`;
document.head.appendChild(style);
