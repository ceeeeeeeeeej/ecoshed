const fs = require('fs');
const path = require('path');

// Build configuration
const BUILD_CONFIG = {
    sourceDir: '.',
    distDir: './dist',
    minify: false,
    optimize: false,
    version: '1.0.0',
    buildTime: new Date().toISOString()
};

// Files to copy and optimize
const FILES_TO_PROCESS = {
    html: [
        'html/login.html',
        'html/registration.html',
        'html/dashboard.html',
        'html/users.html',

        'html/routes.html',
        'html/schedules.html',
        'html/special-collections.html',
        'html/feedback.html',
        'html/gps-sensor.html',
        'html/analytics.html',
        'html/notifications.html',
        'html/settings.html'
    ],
    css: [
        'css/landing.css',
        'css/main.css',
        'css/dashboard.css',
        'css/pages/users.css',

        'css/pages/routes.css',
        'css/pages/schedules.css',
        'css/pages/analytics.css',
        'css/pages/notifications.css',
        'css/pages/settings.css'
    ],
    js: [
        'js/script.js',
        'js/dashboard.js',
        'js/landing.js',
        'js/pages/users.js',

        'js/pages/routes.js',
        'js/pages/schedules.js',
        'js/pages/special-collections.js',
        'js/pages/feedback.js',
        'js/pages/analytics.js',
        'js/pages/notifications.js',
        'js/pages/settings.js'
    ],
    config: [
        'config/supabase_config.js'
    ],
    assets: [
        'assets/image/logo/logo1.png',
        'assets/image/logo/logo2.png',
        'assets/image/logo/logo3.png',
        'assets/image/residentbackground.png'
    ]
};

// Utility functions
function ensureDir(dir) {
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
}

function copyFile(src, dest) {
    ensureDir(path.dirname(dest));
    fs.copyFileSync(src, dest);
    console.log(`✓ Copied: ${src} → ${dest}`);
}

function minifyCSS(css) {
    return css
        .replace(/\/\*[\s\S]*?\*\//g, '') // Remove comments
        .replace(/\s+/g, ' ') // Replace multiple spaces with single space
        .replace(/;\s*}/g, '}') // Remove semicolons before closing braces
        .replace(/\s*{\s*/g, '{') // Remove spaces around opening braces
        .replace(/;\s*/g, ';') // Remove spaces after semicolons
        .replace(/,\s*/g, ',') // Remove spaces after commas
        .replace(/:\s*/g, ':') // Remove spaces after colons
        .trim();
}

function minifyJS(js) {
    return js
        .replace(/\/\*[\s\S]*?\*\//g, '') // Remove block comments
        .replace(/\/\/.*$/gm, '') // Remove line comments
        .replace(/\s+/g, ' ') // Replace multiple spaces with single space
        .replace(/\s*{\s*/g, '{') // Remove spaces around opening braces
        .replace(/;\s*/g, ';') // Remove spaces after semicolons
        .replace(/,\s*/g, ',') // Remove spaces after commas
        .replace(/:\s*/g, ':') // Remove spaces after colons
        .trim();
}

function optimizeHTML(html) {
    return html
        .replace(/\s+/g, ' ') // Replace multiple spaces with single space
        .replace(/>\s+</g, '><') // Remove spaces between tags
        .replace(/\s+>/g, '>') // Remove spaces before closing tags
        .replace(/<\s+/g, '<') // Remove spaces after opening tags
        .trim();
}

function fixPaths(html) {
    return html
        .replace(/href="\.\.\//g, 'href="./')
        .replace(/src="\.\.\//g, 'src="./')
        .replace(/href='\.\.\//g, "href='./")
        .replace(/src='\.\.\//g, "src='./")
        .replace(/from\s+['"]\.\.\//g, "from './")
        .replace(/from\s+['"]\.\//g, "from './"); // Handle existing ./ if any
}

function addBuildInfo(content, type) {
    const buildInfo = `/* Build: ${BUILD_CONFIG.version} - ${BUILD_CONFIG.buildTime} */\n`;
    return type === 'css' || type === 'js' ? buildInfo + content : content;
}

// Main build function
function build() {
    console.log('🌱 EcoSched Admin Dashboard - Production Build');
    console.log('==============================================');
    console.log(`Build Version: ${BUILD_CONFIG.version}`);
    console.log(`Build Time: ${BUILD_CONFIG.buildTime}`);
    console.log('');

    // Ensure dist directory exists
    ensureDir(BUILD_CONFIG.distDir);

    // Process HTML files
    console.log('📄 Processing HTML files...');
    FILES_TO_PROCESS.html.forEach(file => {
        if (fs.existsSync(file)) {
            let content = fs.readFileSync(file, 'utf8');
            content = fixPaths(content); // Fix relative paths
            if (BUILD_CONFIG.optimize) {
                content = optimizeHTML(content);
            }
            content = addBuildInfo(content, 'html');

            // Create dist structure - move html files to root of dist
            const fileName = path.basename(file);
            const destPath = path.join(BUILD_CONFIG.distDir, fileName);
            ensureDir(path.dirname(destPath));
            fs.writeFileSync(destPath, content);
            console.log(`✓ Processed: ${file} → ${destPath}`);
        } else {
            console.log(`⚠ Skipped: ${file} (not found)`);
        }
    });

    // Process CSS files
    console.log('\n🎨 Processing CSS files...');
    FILES_TO_PROCESS.css.forEach(file => {
        if (fs.existsSync(file)) {
            let content = fs.readFileSync(file, 'utf8');
            if (BUILD_CONFIG.minify) {
                content = minifyCSS(content);
            }
            content = addBuildInfo(content, 'css');

            // Create dist structure - maintain css folder structure
            const destPath = path.join(BUILD_CONFIG.distDir, file);
            ensureDir(path.dirname(destPath));
            fs.writeFileSync(destPath, content);
            console.log(`✓ Processed: ${file} → ${destPath}`);
        } else {
            console.log(`⚠ Skipped: ${file} (not found)`);
        }
    });

    // Process JavaScript files
    console.log('\n⚡ Processing JavaScript files...');
    FILES_TO_PROCESS.js.forEach(file => {
        if (fs.existsSync(file)) {
            let content = fs.readFileSync(file, 'utf8');
            if (BUILD_CONFIG.minify) {
                content = minifyJS(content);
            }
            content = addBuildInfo(content, 'js');

            // Create dist structure - maintain js folder structure
            const destPath = path.join(BUILD_CONFIG.distDir, file);
            ensureDir(path.dirname(destPath));
            fs.writeFileSync(destPath, content);
            console.log(`✓ Processed: ${file} → ${destPath}`);
        } else {
            console.log(`⚠ Skipped: ${file} (not found)`);
        }
    });

    // Copy config files
    console.log('\n⚙️ Processing config files...');
    FILES_TO_PROCESS.config.forEach(file => {
        if (fs.existsSync(file)) {
            const destPath = path.join(BUILD_CONFIG.distDir, file);
            ensureDir(path.dirname(destPath));
            copyFile(file, destPath);
            console.log(`✓ Copied: ${file} → ${destPath}`);
        } else {
            console.log(`⚠ Skipped: ${file} (not found)`);
        }
    });

    // Copy assets
    console.log('\n🖼️ Processing assets...');
    FILES_TO_PROCESS.assets.forEach(file => {
        if (fs.existsSync(file)) {
            const destPath = path.join(BUILD_CONFIG.distDir, file);
            ensureDir(path.dirname(destPath));
            copyFile(file, destPath);
            console.log(`✓ Copied: ${file} → ${destPath}`);
        } else {
            console.log(`⚠ Skipped: ${file} (not found)`);
        }
    });

    // Copy additional files
    console.log('\n📋 Copying additional files...');
    const additionalFiles = [
        'firebase.json'
    ];

    additionalFiles.forEach(file => {
        if (fs.existsSync(file)) {
            const destPath = path.join(BUILD_CONFIG.distDir, file);
            copyFile(file, destPath);
            console.log(`✓ Copied: ${file} → ${destPath}`);
        } else {
            console.log(`⚠ Missing: ${file}`);
        }
    });

    // Create build info file
    const buildInfo = {
        version: BUILD_CONFIG.version,
        buildTime: BUILD_CONFIG.buildTime,
        files: {
            html: FILES_TO_PROCESS.html.filter(f => fs.existsSync(f)).length,
            css: FILES_TO_PROCESS.css.filter(f => fs.existsSync(f)).length,
            js: FILES_TO_PROCESS.js.filter(f => fs.existsSync(f)).length,
            assets: FILES_TO_PROCESS.assets.filter(f => fs.existsSync(f)).length
        },
        optimization: {
            minify: BUILD_CONFIG.minify,
            optimize: BUILD_CONFIG.optimize
        }
    };

    fs.writeFileSync(
        path.join(BUILD_CONFIG.distDir, 'build-info.json'),
        JSON.stringify(buildInfo, null, 2)
    );

    // Copy the main index.html from html directory to dist root
    const mainIndexPath = 'html/index.html';
    if (fs.existsSync(mainIndexPath)) {
        const indexContent = fs.readFileSync(mainIndexPath, 'utf8');
        let processedContent = fixPaths(indexContent); // Fix relative paths

        if (BUILD_CONFIG.optimize) {
            processedContent = optimizeHTML(processedContent);
        }
        processedContent = addBuildInfo(processedContent, 'html');

        fs.writeFileSync(path.join(BUILD_CONFIG.distDir, 'index.html'), processedContent);
        console.log(`✓ Processed: ${mainIndexPath} → dist/index.html`);
    } else {
        console.log(`⚠ Skipped: ${mainIndexPath} (not found)`);
    }

    console.log('\n🎉 Build completed successfully!');
    console.log('================================');
    console.log(`📁 Output directory: ${BUILD_CONFIG.distDir}`);
    console.log(`📊 Files processed: ${Object.values(buildInfo.files).reduce((a, b) => a + b, 0)}`);
    console.log(`⚡ Minification: ${BUILD_CONFIG.minify ? 'Enabled' : 'Disabled'}`);
    console.log(`🔧 Optimization: ${BUILD_CONFIG.optimize ? 'Enabled' : 'Disabled'}`);
    console.log('');
    console.log('🚀 Ready for deployment!');
    console.log('   - Use: firebase deploy (from dist/ directory)');
    console.log('   - Or use: npm run deploy (if configured)');
    console.log('   - Or upload dist/ folder to your hosting provider');
}

// Run build
build();
