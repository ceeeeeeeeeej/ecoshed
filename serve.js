/**
 * Simple local HTTP server for the Admin Dashboard
 * Serves the dist/ folder on http://localhost:8000
 */
const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = 3000;
const DIST_DIR = path.join(__dirname, 'dist');

const MIME_TYPES = {
    '.html': 'text/html; charset=utf-8',
    '.css':  'text/css; charset=utf-8',
    '.js':   'application/javascript; charset=utf-8',
    '.json': 'application/json',
    '.png':  'image/png',
    '.jpg':  'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif':  'image/gif',
    '.svg':  'image/svg+xml',
    '.ico':  'image/x-icon',
    '.woff': 'font/woff',
    '.woff2':'font/woff2',
    '.ttf':  'font/ttf',
};

const server = http.createServer((req, res) => {
    let urlPath = req.url.split('?')[0]; // strip query strings
    if (urlPath === '/' || urlPath === '') urlPath = '/index.html';

    const filePath = path.join(DIST_DIR, urlPath);

    // Security: prevent directory traversal
    if (!filePath.startsWith(DIST_DIR)) {
        res.writeHead(403);
        res.end('Forbidden');
        return;
    }

    fs.readFile(filePath, (err, data) => {
        if (err) {
            // Try appending .html
            const htmlPath = filePath + '.html';
            fs.readFile(htmlPath, (err2, data2) => {
                if (err2) {
                    res.writeHead(404, { 'Content-Type': 'text/html' });
                    res.end('<h1>404 Not Found</h1><p>' + urlPath + '</p>');
                } else {
                    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
                    res.end(data2);
                }
            });
            return;
        }

        const ext = path.extname(filePath).toLowerCase();
        const contentType = MIME_TYPES[ext] || 'application/octet-stream';

        res.writeHead(200, { 'Content-Type': contentType });
        res.end(data);
    });
});

server.listen(PORT, () => {
    console.log('');
    console.log('🌱 EcoSched Admin Dashboard - Local Server');
    console.log('==========================================');
    console.log(`✅ Server running at: http://localhost:${PORT}`);
    console.log(`📁 Serving from:      ${DIST_DIR}`);
    console.log('');
    console.log('📄 Available pages:');
    console.log(`   http://localhost:${PORT}/index.html      (Landing)`);
    console.log(`   http://localhost:${PORT}/login.html      (Login)`);
    console.log(`   http://localhost:${PORT}/dashboard.html  (Dashboard)`);
    console.log(`   http://localhost:${PORT}/users.html      (Users)`);
    console.log(`   http://localhost:${PORT}/bins.html       (Bins)`);
    console.log(`   http://localhost:${PORT}/analytics.html  (Analytics)`);
    console.log('');
    console.log('Press Ctrl+C to stop the server.');
    console.log('');
});
