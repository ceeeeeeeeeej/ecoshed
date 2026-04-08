// Analytics page functionality
import { dbService, realtime, utils } from '../../config/supabase_config.js';

console.log('📊 Analytics page loaded');

// Chart instances
let volumeChart = null;
let routeChart = null;
let wasteTypeChart = null;
let coverageChart = null;
let currentDateRange = 30;
let currentVolumeChartType = 'line';

// Analytics data storage
let analyticsData = {
    collections: [],
    feedback: [],
    routes: [],
    sensors: []
};

// Map instance
let sensorSubscription = null;

// Initialize analytics page
document.addEventListener('DOMContentLoaded', function () {
    console.log('📊 Initializing analytics page...');
    initializePage();
});

// Cleanup subscriptions on page unload
window.addEventListener('beforeunload', () => {
    if (sensorSubscription) {
        sensorSubscription.unsubscribe();
    }
});

async function initializePage() {
    showLoadingState();
    await loadInitialData();
    initializeCharts();
    updateUI();
    setupRealtimeSubscription();
    requestNotificationPermission();
}

// Request browser notification permission
async function requestNotificationPermission() {
    if ('Notification' in window) {
        if (Notification.permission === 'default') {
            const permission = await Notification.requestPermission();
            if (permission === 'granted') {
                console.log('✅ Browser notifications enabled');
                // Show test notification
                new Notification('EcoSched Analytics', {
                    body: 'Real-time monitoring is now active',
                    icon: '/Admin_Dashboard/assets/logo.png',
                    badge: '/Admin_Dashboard/assets/logo.png'
                });
            }
        } else if (Notification.permission === 'granted') {
            console.log('✅ Browser notifications already enabled');
        } else {
            console.warn('⚠️ Browser notifications blocked by user');
        }
    }
}

function showLoadingState() {
    const valueElements = ['efficiencyValue', 'responseTimeValue', 'wasteVolumeValue', 'satisfactionValue'];
    valueElements.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
    });
}

async function loadInitialData() {
    try {
        console.log('📥 Fetching analytics data from Supabase...');

        // Fetch data in parallel
        const [schedulesRes, feedbackRes, routesRes, sensorsRes] = await Promise.all([
            dbService.getCollectionSchedules(),
            dbService.getResidentFeedback(null, 200),
            dbService.getRoutes ? dbService.getRoutes() : { data: [] },
            dbService.getBins ? dbService.getBins() : { data: [] }
        ]);

        analyticsData.collections = schedulesRes.data || [];
        analyticsData.feedback = feedbackRes.data || [];
        analyticsData.sensors = sensorsRes.data || [];
        analyticsData.routes = routesRes.data || [];

        console.log('✅ Data loaded:', {
            collections: analyticsData.collections.length,
            feedback: analyticsData.feedback.length,
            sensors: analyticsData.sensors.length,
            routes: analyticsData.routes.length
        });
    } catch (error) {
        console.error('❌ Error loading analytics data:', error);
    }
}

function updateUI() {
    updateSensorMetrics();
}

function updateSensorMetrics() {
    const activeSensors = analyticsData.sensors.filter(s => s.status === 'active');
    const criticalBins = activeSensors.filter(s => s.fill_level >= 80);

    // 1. Average Fill Level
    const avgFillLevel = activeSensors.length > 0
        ? Math.round(activeSensors.reduce((sum, s) => sum + (s.fill_level || 0), 0) / activeSensors.length)
        : 0;

    document.getElementById('avgFillValue').textContent = `${avgFillLevel}%`;
    document.getElementById('avgFillChange').textContent = activeSensors.length > 0
        ? `From ${activeSensors.length} active sensors`
        : 'No sensors available';

    // 2. Critical Bins Count
    document.getElementById('criticalBinsValue').textContent = criticalBins.length;
    document.getElementById('criticalBinsChange').textContent = criticalBins.length > 0
        ? `${criticalBins.length} bins require immediate attention`
        : 'All bins operating normally';

    // 3. Active Sensors Count
    document.getElementById('activeSensorsValue').textContent = activeSensors.length;
    document.getElementById('activeSensorsChange').textContent = `${analyticsData.sensors.length} total sensors`;

    // 4. Last Update Time
    const now = new Date();
    const timeStr = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
    document.getElementById('lastUpdateValue').textContent = timeStr;
    document.getElementById('lastUpdateChange').textContent = 'Real-time monitoring active';

    // Show alert if there are critical bins
    if (criticalBins.length > 0) {
        showCriticalBinAlert(criticalBins);
    }
}

function updateStatsCards() {
    // 1. Collection Efficiency
    const completed = analyticsData.collections.filter(s => s.status === 'completed').length;
    const total = analyticsData.collections.length;
    const efficiency = total > 0 ? (completed / total * 100).toFixed(1) : 0;

    document.getElementById('efficiencyValue').textContent = `${efficiency}%`;
    document.getElementById('efficiencyChange').textContent = `${total} total collections tracked`;

    // 2. Average Response Time (calculated from actual completion times)
    let avgTime = 0;
    const completedSchedules = analyticsData.collections.filter(s =>
        s.status === 'completed' && s.scheduledDate && s.completedDate
    );

    if (completedSchedules.length > 0) {
        const totalMinutes = completedSchedules.reduce((acc, schedule) => {
            const scheduled = schedule.scheduledDate?.toDate?.() || new Date(schedule.scheduledDate);
            const completed = schedule.completedDate?.toDate?.() || new Date(schedule.completedDate);
            const diffMinutes = Math.abs(completed - scheduled) / (1000 * 60);
            return acc + diffMinutes;
        }, 0);
        avgTime = Math.round(totalMinutes / completedSchedules.length);
    }

    document.getElementById('responseTimeValue').textContent = completedSchedules.length > 0 ? `${avgTime} min` : 'N/A';
    document.getElementById('responseTimeChange').textContent = `${completedSchedules.length} completed schedules`;

    // 3. Waste Collected (Average Sensor Fill Level)
    const activeSensors = analyticsData.sensors.filter(s => s.status === 'active');
    const avgFillLevel = activeSensors.length > 0
        ? Math.round(activeSensors.reduce((sum, s) => sum + (s.fill_level || 0), 0) / activeSensors.length)
        : 0;

    document.getElementById('wasteVolumeValue').textContent = `${avgFillLevel}%`;
    document.getElementById('wasteVolumeChange').textContent = activeSensors.length > 0
        ? `From ${activeSensors.length} active sensors`
        : 'No sensors available';

    // 4. Customer Satisfaction
    const ratings = analyticsData.feedback
        .filter(f => f.rating !== undefined)
        .map(f => f.rating);
    const avgRating = ratings.length > 0
        ? (ratings.reduce((a, b) => a + b, 0) / ratings.length).toFixed(1)
        : '0.0';

    document.getElementById('satisfactionValue').textContent = `${avgRating}/5`;
    document.getElementById('satisfactionChange').textContent = `From ${analyticsData.feedback.length} feedback items`;
}

// Generate data based on real records
function getVolumeData(days) {
    const labels = [];
    const volumeData = [];
    const today = new Date();

    for (let i = days - 1; i >= 0; i--) {
        const date = new Date(today);
        date.setDate(date.getDate() - i);
        const dateStr = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
        labels.push(dateStr);

        // Count collections for this day
        const dayCollections = analyticsData.collections.filter(s => {
            const sDate = s.scheduledDate?.toDate?.() || new Date(s.scheduledDate);
            return sDate.toDateString() === date.toDateString();
        }).length;

        volumeData.push(dayCollections);
    }

    return { labels, volumeData };
}

// Initialize all Chart.js charts
function initializeCharts() {
    const { labels, volumeData } = getVolumeData(currentDateRange);

    // Volume Chart
    const volumeCtx = document.getElementById('volumeChart');
    if (volumeCtx) {
        volumeChart = new Chart(volumeCtx, {
            type: currentVolumeChartType,
            data: {
                labels: labels,
                datasets: [{
                    label: 'Collection Volume',
                    data: volumeData,
                    borderColor: 'rgb(16, 185, 129)',
                    backgroundColor: currentVolumeChartType === 'bar'
                        ? 'rgba(16, 185, 129, 0.5)'
                        : 'rgba(16, 185, 129, 0.1)',
                    borderWidth: 2,
                    fill: currentVolumeChartType === 'line',
                    tension: 0.4
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    y: {
                        beginAtZero: true,
                        ticks: { stepSize: 1 }
                    }
                }
            }
        });
    }

    // Route Performance Chart (Bar)
    const routeCtx = document.getElementById('routeChart');
    if (routeCtx) {
        // Count schedules per route
        const routeCounts = {};
        analyticsData.collections.forEach(schedule => {
            if (schedule.routeId) {
                routeCounts[schedule.routeId] = (routeCounts[schedule.routeId] || 0) + 1;
            }
        });

        // Get top 6 routes with most schedules
        const sortedRoutes = analyticsData.routes
            .map(r => ({
                id: r.id,
                name: r.name || r.id,
                count: routeCounts[r.id] || 0
            }))
            .sort((a, b) => b.count - a.count)
            .slice(0, 6);

        const routeLabels = sortedRoutes.map(r => r.name);
        const routeData = sortedRoutes.map(r => r.count);

        routeChart = new Chart(routeCtx, {
            type: 'bar',
            data: {
                labels: routeLabels.length > 0 ? routeLabels : ['No Routes'],
                datasets: [{
                    label: 'Schedules',
                    data: routeData.length > 0 ? routeData : [0],
                    backgroundColor: 'rgba(59, 130, 246, 0.8)',
                    borderWidth: 1
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { display: false } },
                scales: { y: { beginAtZero: true, ticks: { stepSize: 1 } } }
            }
        });
    }

    // Waste Type Distribution (Doughnut)
    const wasteTypeCtx = document.getElementById('wasteTypeChart');
    if (wasteTypeCtx) {
        const wasteTypes = {};
        analyticsData.collections.forEach(s => {
            const type = s.wasteType || 'General';
            wasteTypes[type] = (wasteTypes[type] || 0) + 1;
        });

        const labels = Object.keys(wasteTypes);
        const data = Object.values(wasteTypes);

        wasteTypeChart = new Chart(wasteTypeCtx, {
            type: 'doughnut',
            data: {
                labels: labels.length > 0 ? labels : ['No Data'],
                datasets: [{
                    data: data.length > 0 ? data : [1],
                    backgroundColor: [
                        'rgba(16, 185, 129, 0.8)',
                        'rgba(59, 130, 246, 0.8)',
                        'rgba(251, 146, 60, 0.8)',
                        'rgba(139, 92, 246, 0.8)',
                        'rgba(236, 72, 153, 0.8)',
                        'rgba(156, 163, 175, 0.8)'
                    ],
                    borderWidth: 2,
                    borderColor: '#ffffff'
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { position: 'bottom' } }
            }
        });
    }


}

// Setup real-time subscription for sensor updates
function setupRealtimeSubscription() {
    if (!realtime || !realtime.channel) {
        console.warn('⚠️ Realtime not available, skipping subscription');
        return;
    }

    try {
        sensorSubscription = realtime
            .channel('bins-analytics')
            .on('postgres_changes', {
                event: '*',
                schema: 'public',
                table: 'bins'
            }, async (payload) => {
                console.log('🔔 Sensor data changed:', payload);

                // Reload sensor data
                const { data, error } = await dbService.getBins();
                if (!error && data) {
                    analyticsData.sensors = data;

                    // Update UI components
                    updateSensorMetrics();

                    console.log('✅ Sensor data refreshed in real-time');
                }
            })
            .subscribe();

        console.log('📡 Real-time sensor subscription active');
    } catch (error) {
        console.error('❌ Failed to setup real-time subscription:', error);
    }
}

// Show alert notification for critical bins
function showCriticalBinAlert(criticalBins) {
    // Only show alert once per session for the same bins
    const alertKey = `alert_${criticalBins.map(b => b.bin_id).sort().join('_')}`;
    if (sessionStorage.getItem(alertKey)) return;

    const binList = criticalBins.map(b => `${b.bin_id} (${b.fill_level}%)`).join(', ');
    const urgentBins = criticalBins.filter(b => b.fill_level >= 90);

    // Determine urgency level
    const isUrgent = urgentBins.length > 0;
    const title = isUrgent ? '🚨 URGENT: Bins Critical!' : '⚠️ Critical Alert';
    const message = isUrgent
        ? `${urgentBins.length} bin(s) are 90%+ full and require IMMEDIATE collection!`
        : `${criticalBins.length} bin(s) require immediate collection: ${binList}`;

    // Show browser notification
    if ('Notification' in window && Notification.permission === 'granted') {
        const notification = new Notification(title, {
            body: message,
            icon: '/Admin_Dashboard/assets/logo.png',
            badge: '/Admin_Dashboard/assets/logo.png',
            tag: 'critical-bins', // Replace previous notification
            requireInteraction: isUrgent, // Keep notification visible for urgent alerts
            vibrate: isUrgent ? [200, 100, 200] : undefined, // Vibration pattern for mobile
            data: { bins: criticalBins }
        });

        // Add click handler to navigate to bins page
        notification.onclick = function () {
            window.focus();
            notification.close();
            // Could navigate to bins management page
            console.log('Notification clicked - critical bins:', criticalBins);
        };
    }

    // Show in-page visual alert
    showInPageAlert(title, message, isUrgent);

    // Store notification for notifications page
    storeNotification(title, message, isUrgent ? 'urgent' : 'high', criticalBins);

    // Console log
    console.warn(`${title}: ${message}`);

    // Mark as alerted
    sessionStorage.setItem(alertKey, 'true');
}

// Show in-page alert banner
function showInPageAlert(title, message, isUrgent) {
    // Remove existing alert if present
    const existingAlert = document.getElementById('critical-bins-alert');
    if (existingAlert) existingAlert.remove();

    // Create alert banner
    const alert = document.createElement('div');
    alert.id = 'critical-bins-alert';
    alert.style.cssText = `
        position: fixed;
        top: 80px;
        right: 20px;
        max-width: 400px;
        background: ${isUrgent ? 'linear-gradient(135deg, #DC2626, #991B1B)' : 'linear-gradient(135deg, #F59E0B, #D97706)'};
        color: white;
        padding: 16px 20px;
        border-radius: 12px;
        box-shadow: 0 10px 40px rgba(0,0,0,0.3);
        z-index: 10000;
        font-family: 'Inter', sans-serif;
        animation: slideIn 0.3s ease-out;
    `;

    alert.innerHTML = `
        <div style="display: flex; align-items: start; gap: 12px;">
            <div style="font-size: 24px;">${isUrgent ? '🚨' : '⚠️'}</div>
            <div style="flex: 1;">
                <h4 style="margin: 0 0 8px 0; font-size: 16px; font-weight: 600;">${title}</h4>
                <p style="margin: 0; font-size: 14px; line-height: 1.5; opacity: 0.95;">${message}</p>
            </div>
            <button onclick="this.parentElement.parentElement.remove()" 
                style="background: none; border: none; color: white; font-size: 20px; cursor: pointer; padding: 0; opacity: 0.8; transition: opacity 0.2s;"
                onmouseover="this.style.opacity='1'" 
                onmouseout="this.style.opacity='0.8'">×</button>
        </div>
    `;

    // Add CSS animation
    const style = document.createElement('style');
    style.textContent = `
        @keyframes slideIn {
            from { transform: translateX(100%); opacity: 0; }
            to { transform: translateX(0); opacity: 1; }
        }
    `;
    document.head.appendChild(style);

    document.body.appendChild(alert);

    // Auto-remove after 15 seconds (30s for urgent)
    setTimeout(() => {
        if (alert.parentElement) {
            alert.style.animation = 'slideIn 0.3s ease-out reverse';
            setTimeout(() => alert.remove(), 300);
        }
    }, isUrgent ? 30000 : 15000);
}

// Store notification to localStorage and Supabase
async function storeNotification(title, message, priority, criticalBins) {
    const stored = localStorage.getItem('ecosched_notifications');
    const notifications = stored ? JSON.parse(stored) : [];

    const notification = {
        id: `alert-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        type: 'iot',
        priority: priority,
        title: title,
        message: message,
        timestamp: new Date().toISOString(),
        read: false,
        bins: criticalBins.map(b => ({ bin_id: b.bin_id, fill_level: b.fill_level, zone: b.zone }))
    };

    notifications.unshift(notification);

    // Keep only last 100 notifications in localStorage
    const trimmed = notifications.slice(0, 100);
    localStorage.setItem('ecosched_notifications', JSON.stringify(trimmed));

    // PERSIST TO SUPABASE: This makes it visible on the dedicated Notifications page for all admins
    try {
        if (dbService && dbService.createNotification) {
            await dbService.createNotification({
                title: title,
                message: message,
                type: 'iot',
                priority: priority
            });
            console.log('✅ Sensor notification persisted to Supabase');
        }
    } catch (error) {
        console.error('❌ Failed to persist notification to Supabase:', error);
    }

    console.log('📝 Notification stored locally:', notification);
}

// Export functions to global scope
function updateCharts() {
    const { labels, volumeData } = getVolumeData(currentDateRange);

    if (volumeChart) {
        volumeChart.data.labels = labels;
        volumeChart.data.datasets[0].data = volumeData;
        volumeChart.update();
    }
}

// Update date range and refresh charts
function updateDateRange() {
    const select = document.getElementById('dateRange');
    if (select) {
        currentDateRange = parseInt(select.value);
        updateCharts();
        console.log(`📅 Date range updated to ${currentDateRange} days`);
    }
}

// Toggle chart type (line/bar) for volume chart
function toggleChartType(chartId, type) {
    if (chartId === 'volume' && volumeChart) {
        currentVolumeChartType = type;
        volumeChart.config.type = type;
        volumeChart.data.datasets[0].backgroundColor = type === 'bar'
            ? 'rgba(16, 185, 129, 0.5)'
            : 'rgba(16, 185, 129, 0.1)';
        volumeChart.data.datasets[0].fill = type === 'line';
        volumeChart.update();
        console.log(`📊 Chart type changed to ${type}`);
    }
}

// Generate comprehensive report
function generateReport(event) {
    console.log('📄 Generating comprehensive report...');
    const button = event.target.closest('button');
    const originalText = button.innerHTML;
    button.disabled = true;
    button.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Generating...';

    setTimeout(() => {
        const timestamp = new Date().toISOString();
        const dateStr = timestamp.split('T')[0];

        const reportData = {
            reportTitle: "EcoSched Analytics Performance Report",
            generatedAt: timestamp,
            dateRange: `${currentDateRange} days`,
            summary: {
                totalCollections: analyticsData.collections.length,
                completedCollections: analyticsData.collections.filter(c => c.status === 'completed').length,
                totalFeedback: analyticsData.feedback.length,
                averageRating: (analyticsData.feedback.reduce((sum, f) => sum + (f.rating || 0), 0) / analyticsData.feedback.length || 0).toFixed(2),
                activeSensors: analyticsData.sensors.filter(s => s.status === 'active').length,
                criticalBins: analyticsData.sensors.filter(s => s.fill_level >= 80).length
            },
            sensorData: analyticsData.sensors.map(s => ({
                bin_id: s.bin_id,
                location: s.address,
                fill_level: `${s.fill_level}%`,
                status: s.status,
                last_update: s.updated_at
            })),
            feedbackData: analyticsData.feedback.map(f => ({
                user: f.userName,
                rating: f.rating,
                comment: f.comment,
                date: f.createdAt
            }))
        };

        // Download as JSON
        const jsonBlob = new Blob([JSON.stringify(reportData, null, 2)], { type: 'application/json' });
        downloadBlob(jsonBlob, `ecosched-report-${dateStr}.json`);

        // Also offer CSV for sensor data specifically as it's most requested for spreadsheets
        const csvContent = generateSensorCSV(analyticsData.sensors);
        const csvBlob = new Blob([csvContent], { type: 'text/csv' });
        downloadBlob(csvBlob, `sensor-data-${dateStr}.csv`);

        // Generate PDF Report
        generatePDFReport(reportData, dateStr);

        button.disabled = false;
        button.innerHTML = originalText;
        if (typeof showNotification === 'function') {
            showNotification('Analytics reports (PDF, JSON, CSV) generated successfully!', 'success');
        } else {
            alert('Analytics reports (PDF, JSON, CSV) generated successfully!');
        }
    }, 1000);
}

// Generate PDF Report using jsPDF
function generatePDFReport(reportData, dateStr) {
    if (!window.jspdf) {
        console.error('jsPDF library not found');
        return;
    }

    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.width;

    // Header
    doc.setFontSize(22);
    doc.setTextColor(40, 167, 69); // Green color
    doc.text('EcoSched', 14, 20);

    doc.setFontSize(16);
    doc.setTextColor(33, 37, 41);
    doc.text('Analytics Performance Report', 14, 30);

    doc.setFontSize(10);
    doc.setTextColor(108, 117, 125);
    doc.text(`Generated: ${reportData.generatedAt.split('T')[0]}`, 14, 38);
    doc.text(`Period: Last ${reportData.dateRange}`, 14, 43);

    // Summary Section
    doc.setFontSize(14);
    doc.setTextColor(33, 37, 41);
    doc.text('Executive Summary', 14, 55);

    const summaryData = [
        ['Total Collections', reportData.summary.totalCollections],
        ['Completed Collections', reportData.summary.completedCollections],
        ['Active Sensors', reportData.summary.activeSensors],
        ['Critical Bins (>80%)', reportData.summary.criticalBins],
        ['Resident Feedback', reportData.summary.totalFeedback],
        ['Average Rating', `${reportData.summary.averageRating} / 5.0`]
    ];

    doc.autoTable({
        startY: 60,
        head: [['Metric', 'Value']],
        body: summaryData,
        theme: 'striped',
        headStyles: { fillColor: [40, 167, 69] },
        styles: { fontSize: 10 }
    });

    // Sensor Status Section
    let finalY = doc.lastAutoTable.finalY + 15;
    doc.setFontSize(14);
    doc.text('Sensor Status Report', 14, finalY);

    const sensorRows = reportData.sensorData.map(s => [
        s.bin_id,
        s.location,
        s.fill_level,
        s.status
    ]);

    doc.autoTable({
        startY: finalY + 5,
        head: [['Bin ID', 'Location', 'Fill Level', 'Status']],
        body: sensorRows,
        theme: 'grid',
        headStyles: { fillColor: [52, 58, 64] },
        styles: { fontSize: 9 }
    });

    // Footer
    const pageCount = doc.internal.getNumberOfPages();
    for (let i = 1; i <= pageCount; i++) {
        doc.setPage(i);
        doc.setFontSize(8);
        doc.setTextColor(150);
        doc.text(`Page ${i} of ${pageCount}`, pageWidth - 20, doc.internal.pageSize.height - 10, { align: 'right' });
        doc.text('EcoSched Admin System', 14, doc.internal.pageSize.height - 10);
    }

    // Save the PDF
    doc.save(`ecosched-report-${dateStr}.pdf`);
}

function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

function generateSensorCSV(sensors) {
    const headers = ['Bin ID', 'Address', 'Zone', 'Fill Level (%)', 'Status', 'Last Emptied'];
    const rows = sensors.map(s => [
        s.bin_id,
        `"${s.address}"`,
        s.zone,
        s.fill_level,
        s.status,
        s.last_emptied || 'N/A'
    ]);

    return [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
}

// Create custom report
function createCustomReport() {
    console.log('📊 Creating custom report with real-time data...');
    const reportData = {
        dateRange: currentDateRange,
        generatedAt: new Date().toISOString(),
        customFilters: 'All data',
        metrics: {
            totalCollections: analyticsData.collections.length,
            completedCollections: analyticsData.collections.filter(c => c.status === 'completed').length,
            pendingCollections: analyticsData.collections.filter(c => c.status === 'pending').length,
            totalFeedback: analyticsData.feedback.length,
            avgRating: (analyticsData.feedback.reduce((sum, f) => sum + (f.rating || 0), 0) / analyticsData.feedback.length || 0).toFixed(2),
            activeRoutes: analyticsData.routes.length
        }
    };

    console.log('Custom report data:', reportData);
    // You can expand this to show a modal or download
}



// Export functions to global scope
window.generateReport = generateReport;
window.updateDateRange = updateDateRange;
window.toggleChartType = toggleChartType;
window.createCustomReport = createCustomReport;
window.analyticsData = analyticsData;  // Expose for heatmap auto-populate
// Removed unused exports
