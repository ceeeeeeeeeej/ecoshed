(() => {
    'use strict';

    document.body?.classList.add('js-ready');

    const qs = (selector, root = document) => root.querySelector(selector);
    const qsa = (selector, root = document) => Array.from(root.querySelectorAll(selector));

    const nav = qs('.site-nav');
    const navToggle = qs('.nav-toggle');
    const navMenu = qs('#navMenu');
    const navLinks = qsa('.nav-link');
    const sections = navLinks
        .map((link) => qs(link.getAttribute('href')))
        .filter(Boolean);

    let ticking = false;

    const updateNavState = () => {
        const y = window.scrollY || 0;
        nav?.classList.toggle('scrolled', y > 18);

        let activeId = sections[0]?.id || 'home';
        for (const section of sections) {
            const top = section.getBoundingClientRect().top;
            if (top <= 130) activeId = section.id;
        }

        navLinks.forEach((link) => {
            link.classList.toggle('active', link.getAttribute('href') === `#${activeId}`);
        });
    };

    const onScroll = () => {
        if (ticking) return;
        ticking = true;
        window.requestAnimationFrame(() => {
            updateNavState();
            ticking = false;
        });
    };

    const closeMenu = () => {
        navMenu?.classList.remove('open');
        navToggle?.setAttribute('aria-expanded', 'false');
    };

    navToggle?.addEventListener('click', () => {
        const isOpen = navMenu?.classList.toggle('open') || false;
        navToggle.setAttribute('aria-expanded', String(isOpen));
    });

    navMenu?.addEventListener('click', (event) => {
        const target = event.target.closest('a');
        if (target) closeMenu();
    });

    document.addEventListener('keydown', (event) => {
        if (event.key === 'Escape') closeMenu();
    });

    window.addEventListener('scroll', onScroll, { passive: true });
    updateNavState();

    const revealItems = qsa('.reveal');
    if ('IntersectionObserver' in window) {
        const revealObserver = new IntersectionObserver((entries, observer) => {
            entries.forEach((entry) => {
                if (!entry.isIntersecting) return;
                entry.target.classList.add('visible');
                observer.unobserve(entry.target);
            });
        }, { threshold: 0.15, rootMargin: '0px 0px -40px 0px' });

        revealItems.forEach((item) => revealObserver.observe(item));
    } else {
        revealItems.forEach((item) => item.classList.add('visible'));
    }

    const mapSlides = qsa('.map-slide');
    const mapShell = qs('.map-shell');
    let activeMap = Math.max(0, mapSlides.findIndex((slide) => slide.classList.contains('active')));

    const showMap = (direction) => {
        if (!mapSlides.length) return;
        mapSlides[activeMap]?.classList.remove('active');
        activeMap = (activeMap + direction + mapSlides.length) % mapSlides.length;
        mapSlides[activeMap]?.classList.add('active');
    };

    mapShell?.addEventListener('click', (event) => {
        const button = event.target.closest('.map-btn');
        if (!button) return;
        showMap(button.classList.contains('next') ? 1 : -1);
    });

    const counters = qsa('[data-count]');
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    const animateCounter = (element) => {
        const end = Number(element.dataset.count || element.textContent || 0);
        if (!Number.isFinite(end) || reduceMotion) {
            element.textContent = String(end);
            return;
        }

        const duration = 900;
        const startTime = performance.now();
        const suffix = end === 100 ? '%' : '';

        const frame = (now) => {
            const progress = Math.min((now - startTime) / duration, 1);
            const eased = 1 - Math.pow(1 - progress, 3);
            element.textContent = `${Math.round(end * eased)}${suffix}`;
            if (progress < 1) window.requestAnimationFrame(frame);
        };

        window.requestAnimationFrame(frame);
    };

    if ('IntersectionObserver' in window) {
        const counterObserver = new IntersectionObserver((entries, observer) => {
            entries.forEach((entry) => {
                if (!entry.isIntersecting) return;
                animateCounter(entry.target);
                observer.unobserve(entry.target);
            });
        }, { threshold: 0.7 });

        counters.forEach((counter) => counterObserver.observe(counter));
    } else {
        counters.forEach(animateCounter);
    }
})();
