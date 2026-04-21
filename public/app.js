let allOrders = [];
let searchQuery = '';
let currentView = 'dashboard';
let previousOrderCount = -1;
let alertsEnabled = true;

// Audio context/element setup
const alertSound = new Audio('https://assets.mixkit.co/active_storage/sfx/2869/2869-preview.mp3');

// Authentication helper
function getAuthHeader() {
    return localStorage.getItem('medical_auth');
}

async function fetchOrders() {
    const auth = getAuthHeader();
    if (!auth) {
        window.location.href = '/login.html';
        return;
    }

    try {
        const response = await fetch('/api/orders', {
            headers: { 'Authorization': `Basic ${auth}` }
        });

        if (response.status === 401) {
            localStorage.removeItem('medical_auth');
            window.location.href = '/login.html';
            return;
        }

        const data = await response.json();
        const newOrders = data.orders || [];
        
        // Handle New Order Alert
        if (previousOrderCount !== -1 && newOrders.length > previousOrderCount) {
            triggerNewOrderAlert();
        }
        
        previousOrderCount = newOrders.length;
        allOrders = newOrders;
        
        renderCurrentView();
        updateStats();
    } catch (error) {
        console.error('Failed to fetch orders:', error);
    }
}

function triggerNewOrderAlert() {
    if (!alertsEnabled) return;
    
    // 1. Play chime sound
    alertSound.play().catch(e => console.log('Audio playback blocked - needs user interaction'));
    
    // 2. Voice announcement (Text-to-Speech)
    if ('speechSynthesis' in window) {
        const msg = new SpeechSynthesisUtterance('New medical order arrived');
        msg.rate = 0.9; // Slightly slower for clarity
        msg.pitch = 1.1; // Professional tone
        window.speechSynthesis.speak(msg);
    }
    
    // 3. Visual Notification (Toast)
    showToast('🚀 New Medical Order Received!');
}

function showToast(message) {
    const toast = document.createElement('div');
    toast.className = 'order-toast';
    toast.innerHTML = `
        <div style="display: flex; align-items: center; gap: 1rem;">
            <div class="logo-icon" style="width: 32px; height: 32px; font-size: 1rem;">📦</div>
            <div>
                <p style="font-weight: 700; font-size: 0.875rem; color: #fff;">New Activity</p>
                <p style="font-size: 0.75rem; color: var(--text-secondary);">${message}</p>
            </div>
        </div>
    `;
    document.body.appendChild(toast);
    
    setTimeout(() => {
        toast.classList.add('visible');
    }, 100);
    
    setTimeout(() => {
        toast.classList.remove('visible');
        setTimeout(() => toast.remove(), 300);
    }, 5000);
}

function updateStats() {
    const total = allOrders.length;
    const pending = allOrders.filter(o => o.status === 'PENDING').length;
    
    const today = new Date().toLocaleDateString();
    const todayCount = allOrders.filter(o => new Date(o.timestamp).toLocaleDateString() === today).length;

    animateValue('stat-total', total);
    animateValue('stat-pending', pending);
    animateValue('stat-today', todayCount);
}

function animateValue(id, value) {
    const el = document.getElementById(id);
    if (!el) return;
    el.textContent = value;
}

// Logging helper
function addLog(message) {
    const logBox = document.getElementById('service-logs');
    if (logBox) {
        const entry = document.createElement('div');
        entry.textContent = `[${new Date().toLocaleTimeString()}] ${message}`;
        logBox.prepend(entry);
        if (logBox.children.length > 50) logBox.lastChild.remove();
    }
}

function switchView(viewId) {
    currentView = viewId;
    
    // Update Sidebar navigation UI
    document.querySelectorAll('.nav-item').forEach(item => {
        item.classList.remove('active');
    });
    const sidebarItem = document.getElementById(`nav-${viewId}`);
    if (sidebarItem) sidebarItem.classList.add('active');
    
    // Update Mobile Bottom Nav UI
    document.querySelectorAll('.mobile-nav-item').forEach(item => {
        item.classList.remove('active');
    });
    const mobileItem = document.getElementById(`m-nav-${viewId}`);
    if (mobileItem) mobileItem.classList.add('active');
    
    // Update Sections display
    document.querySelectorAll('.content-view').forEach(view => {
        view.style.display = 'none';
        view.classList.remove('active');
    });
    const activeView = document.getElementById(`view-${viewId}`);
    if (activeView) {
        activeView.style.display = 'block';
        setTimeout(() => activeView.classList.add('active'), 10);
    }
    
    renderCurrentView();
}

function renderCurrentView() {
    if (currentView === 'dashboard') {
        renderOrders(allOrders.slice(-5), 'dashboard-orders');
    } else if (currentView === 'orders') {
        const filteredOrders = allOrders.filter(order => {
            const searchText = (order.name + order.contact + (order.notes || '')).toLowerCase();
            return searchText.includes(searchQuery.toLowerCase());
        });
        renderOrders(filteredOrders, 'all-orders-container');
    }
}

async function completeOrder(id, btn) {
    try {
        btn.disabled = true;
        btn.textContent = 'Saving...';
        await fetch(`/api/orders/${id}/complete`, { 
            method: 'POST',
            headers: { 'Authorization': `Basic ${getAuthHeader()}` }
        });
        fetchOrders();
    } catch (error) {
        console.error('Failed to complete order:', error);
        btn.disabled = false;
        btn.textContent = 'Complete';
    }
}

function renderOrders(orders, containerId) {
    const container = document.getElementById(containerId);
    if (!container) return;

    if (orders.length === 0) {
        container.innerHTML = `
            <div style="text-align: center; padding: 4rem; background: var(--bg-card); border-radius: 24px; border: 1px dashed var(--border); grid-column: 1 / -1;">
                <div style="font-size: 2rem; margin-bottom: 1rem; opacity: 0.3;">
                    <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" style="margin-inline: auto;"><path d="M22 13V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v7"/><path d="M22 13a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2"/><path d="M22 13l-5 5H7l-5-5"/><path d="m11 4 1 1.5L13 4"/></svg>
                </div>
                <p style="color: var(--text-secondary);">No medical data available in this section.</p>
            </div>
        `;
        return;
    }

    container.innerHTML = orders.slice().reverse().map(order => {
        const name = order.name || 'Unknown Patient';
        const initials = name.split(' ').map(n => n[0]).join('').toUpperCase().substring(0, 2);
        const time = new Date(order.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        const isPending = order.status === 'PENDING';
        
        return `
            <div class="order-card ${isPending ? 'is-pending' : ''}">
                <div class="patient-info">
                    <div class="avatar">${initials}</div>
                    <div class="patient-details">
                        <span class="patient-name">${name}</span>
                        <span class="patient-meta">+${order.contact}</span>
                    </div>
                </div>
                
                <div class="order-content">
                    ${order.image ? `
                        <img src="${order.image}" class="prescription-thumb" onclick="openModal('${order.image}')" alt="Rx">
                        <div>
                            <p style="font-size: 0.875rem; color: #fff; font-weight: 600;">Prescription</p>
                            <p class="patient-meta">Clinical Records</p>
                        </div>
                    ` : `
                        <div style="opacity: 0.5;">
                            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><line x1="10" y1="9" x2="8" y2="9"/></svg>
                        </div>
                        <p class="notes-text" title="${order.notes || ''}">${order.notes || 'Notes'}</p>
                    `}
                </div>

                <div>
                    <span class="status-badge ${order.status === 'COMPLETED' ? 'status-completed' : 'status-pending'}">
                        ${order.status}
                    </span>
                </div>

                <div class="action-area">
                    <div class="patient-meta" style="font-weight: 500;">
                        ${time}
                    </div>
                    ${order.status === 'PENDING' ? `
                        <button class="btn-complete" onclick="completeOrder(${order.id}, this)">Complete</button>
                    ` : `
                        <div style="width: 100px; text-align: right; color: var(--success); font-size: 0.8125rem; font-weight: 600;">
                            Processed ✓
                        </div>
                    `}
                </div>
            </div>
        `;
    }).join('');
}

// Navigation Events
// Navigation Events
document.getElementById('nav-dashboard').addEventListener('click', (e) => { e.preventDefault(); switchView('dashboard'); });
document.getElementById('nav-orders').addEventListener('click', (e) => { e.preventDefault(); switchView('orders'); });
document.getElementById('nav-status').addEventListener('click', (e) => { e.preventDefault(); switchView('status'); });
document.getElementById('nav-logout').addEventListener('click', (e) => { 
    e.preventDefault(); 
    localStorage.removeItem('medical_auth');
    window.location.href = '/login.html';
});

// Mobile Nav Listeners
const mobileLinks = [
    { id: 'm-nav-dashboard', view: 'dashboard' },
    { id: 'm-nav-orders', view: 'orders' },
    { id: 'm-nav-status', view: 'status' }
];

mobileLinks.forEach(link => {
    const el = document.getElementById(link.id);
    if (el) {
        el.addEventListener('click', (e) => {
            e.preventDefault();
            switchView(link.view);
        });
    }
});

const mLogout = document.getElementById('m-nav-logout');
if (mLogout) {
    mLogout.addEventListener('click', (e) => {
        e.preventDefault();
        localStorage.removeItem('medical_auth');
        window.location.href = '/login.html';
    });
}

// Alert Toggle
document.getElementById('noti-toggle').addEventListener('click', function() {
    alertsEnabled = !alertsEnabled;
    const icon = document.getElementById('noti-icon');
    const text = document.getElementById('noti-text');
    if (alertsEnabled) {
        icon.innerHTML = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/></svg>';
        text.textContent = 'Alerts On';
        this.style.color = 'var(--primary)';
        alertSound.play().catch(() => {});
    } else {
        icon.innerHTML = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M13.73 21a2 2 0 0 1-3.46 0"/><path d="M18.63 13A17.89 17.89 0 0 1 18 8"/><path d="M6.26 6.26A5.86 5.86 0 0 0 6 8c0 7-3 9-3 9h14"/><path d="m2 2 20 20"/></svg>';
        text.textContent = 'Alerts Muted';
        this.style.color = 'var(--text-muted)';
    }
});

// Bot Management Events
document.getElementById('btn-start-bot').addEventListener('click', async function() {
    this.disabled = true;
    this.textContent = 'Starting...';
    try {
        const response = await fetch('/api/bot/start', {
            method: 'POST',
            headers: { 'Authorization': `Basic ${getAuthHeader()}` }
        });
        const data = await response.json();
        if (data.success) {
            addLog('Bot start command sent successfully.');
            showToast('Bot starting...');
        }
    } catch (e) {
        addLog('Failed to start bot: ' + e.message);
    }
    setTimeout(() => {
        this.disabled = false;
        this.textContent = '▶ Start Bot';
    }, 3000);
});

document.getElementById('btn-stop-bot').addEventListener('click', async function() {
    if (!confirm('Are you sure you want to stop the WhatsApp service?')) return;
    this.disabled = true;
    this.textContent = 'Stopping...';
    try {
        const response = await fetch('/api/bot/stop', {
            method: 'POST',
            headers: { 'Authorization': `Basic ${getAuthHeader()}` }
        });
        const data = await response.json();
        if (data.success) {
            addLog('Bot stop command sent.');
            showToast('Bot stopping...');
        }
    } catch (e) {
        addLog('Failed to stop bot: ' + e.message);
    }
    setTimeout(() => {
        this.disabled = false;
        this.textContent = '⏹ Stop Bot';
    }, 3000);
});

document.getElementById('btn-reset-session').addEventListener('click', async function() {
    if (!confirm('This will log out the current WhatsApp session and generate a new QR. Continue?')) return;
    this.disabled = true;
    this.textContent = 'Resetting...';
    try {
        const response = await fetch('/api/bot/reset', {
            method: 'POST',
            headers: { 'Authorization': `Basic ${getAuthHeader()}` }
        });
        const data = await response.json();
        if (data.success) {
            addLog('Session reset requested. Waiting for new QR...');
            showToast('New QR generating...');
        }
    } catch (e) {
        addLog('Failed to reset session: ' + e.message);
    }
    setTimeout(() => {
        this.disabled = false;
        this.textContent = '🔄 Regenerate QR';
    }, 5000);
});

// Search logic
document.getElementById('order-search').addEventListener('input', (e) => {
    searchQuery = e.target.value;
    renderCurrentView();
});

// Modal logic
const modal = document.getElementById('image-modal');
const modalImg = document.getElementById('modal-img');

function openModal(src) {
    modal.style.display = 'flex';
    modalImg.src = src;
    document.body.classList.add('modal-open');
}

document.getElementById('close-modal').onclick = () => {
    modal.style.display = 'none';
    document.body.classList.remove('modal-open');
};

window.onclick = (event) => {
    if (event.target == modal) {
        modal.style.display = 'none';
        document.body.classList.remove('modal-open');
    }
};

// Check Bot Status (For Cloud Hosting)
async function checkBotStatus() {
    try {
        const response = await fetch('/api/status', {
            headers: { 'Authorization': `Basic ${getAuthHeader()}` }
        });
        const data = await response.json();
        
        const statusText = document.getElementById('connection-status-text');
        const meta = document.getElementById('connection-meta');
        const qrContainer = document.getElementById('qr-container');
        const qrPlaceholder = document.getElementById('qr-image-placeholder');
        const sysOnline = document.getElementById('connection-status');

        if (data.status === 'OFFLINE' || data.status === 'STOPPED') {
            statusText.textContent = 'OFFLINE';
            statusText.style.color = 'var(--danger)';
            meta.textContent = 'WhatsApp service is stopped.';
            qrContainer.style.display = 'none';
            if (sysOnline) {
                sysOnline.querySelector('.nav-icon').textContent = '🔴';
                sysOnline.querySelector('.nav-text').textContent = 'Service Offline';
                sysOnline.style.color = 'var(--danger)';
            }
        } else if (data.status === 'AWAITING_QR') {
            if (statusText.textContent !== 'AWAITING LOGIN') addLog('WhatsApp session expired. QR code generated.');
            statusText.textContent = 'AWAITING LOGIN';
            statusText.style.color = 'var(--warning)';
            meta.textContent = 'Please scan the QR code below';
            qrContainer.style.display = 'block';
            qrPlaceholder.innerHTML = `<img src="https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=${encodeURIComponent(data.qr)}" alt="QR Code">`;
            if (sysOnline) {
                sysOnline.querySelector('.nav-icon').textContent = '🟡';
                sysOnline.querySelector('.nav-text').textContent = 'Login Required';
                sysOnline.style.color = 'var(--warning)';
            }
        } else {
            if (statusText.textContent !== 'CONNECTED') addLog('WhatsApp Bot connected and ready.');
            statusText.textContent = 'CONNECTED';
            statusText.style.color = 'var(--success)';
            meta.textContent = 'WhatsApp Instance is active';
            qrContainer.style.display = 'none';
            if (sysOnline) {
                sysOnline.querySelector('.nav-icon').textContent = '🟢';
                sysOnline.querySelector('.nav-text').textContent = 'System Online';
                sysOnline.style.color = 'var(--success)';
            }
        }
    } catch (e) {
        console.error('Status check failed:', e);
    }
}

// Initial setup
fetchOrders();
setInterval(fetchOrders, 8000);
setInterval(checkBotStatus, 5000); // Check bot status every 5 seconds


