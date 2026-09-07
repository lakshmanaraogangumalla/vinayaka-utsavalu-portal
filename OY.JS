/* ============================================================
   1. SAFE STORAGE & DATA HELPERS
============================================================ */
const SafeUtils = {
    getString: (val, def = "") => (typeof val === "string" ? val : (val != null ? String(val) : def)),
    getNumber: (val, def = 0) => {
        if (typeof val === "number" && !isNaN(val)) return val;
        const parsed = parseFloat(String(val).replace(/,/g, ''));
        return isNaN(parsed) ? def : parsed;
    },
    getArray: (val, def = []) => (Array.isArray(val) ? val : def),
    getObject: (val, def = {}) => (val !== null && typeof val === "object" && !Array.isArray(val) ? val : def),
    escapeHTML: (str) => SafeUtils.getString(str).replace(/[&<>'"]/g, tag => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[tag])),
    parseJSON: (str, def = {}) => { try { return JSON.parse(str) || def; } catch (e) { return def; } }
};

function safeGetSession(key, def = null) { try { return sessionStorage.getItem(key) || def; } catch (e) { return def; } }
function safeGetLocal(key, def = null) { try { return localStorage.getItem(key) || def; } catch (e) { return def; } }
function safeSetSession(key, val) { try { sessionStorage.setItem(key, val); } catch (e) {} }
function safeSetLocal(key, val) { try { localStorage.setItem(key, val); } catch (e) {} }

/* ============================================================
   2. AUTHENTICATION LIFECYCLE
============================================================ */
const AuthManager = {
    state: {
        token: safeGetSession('vcs_token', null) || safeGetLocal('vcs_token_backup', null),
        role: safeGetSession('vcs_role', 'public'),
        userName: safeGetSession('vcs_user', null),
        isAuthenticated: false
    },

    init() {
        if (this.state.token && this.state.role === 'admin') {
            this.state.isAuthenticated = true;
            safeSetSession('vcs_token', this.state.token);
            safeSetSession('vcs_role', this.state.role);
        } else if (this.state.token && this.state.role === 'user') {
            this.state.isAuthenticated = true;
        } else {
            this.state.role = 'public';
            this.state.isAuthenticated = false;
        }
    },

    setSession(token, role, userName) {
        this.state.token = token;
        this.state.role = String(role).toLowerCase().trim();
        this.state.userName = userName;
        this.state.isAuthenticated = true;

        safeSetSession('vcs_token', token);
        safeSetSession('vcs_role', this.state.role);
        safeSetSession('vcs_user', userName);

        if (this.state.role === 'admin') {
            safeSetLocal('vcs_token_backup', token);
        }
    },

    clearSession() {
        this.state.token = null;
        this.state.role = 'public';
        this.state.userName = null;
        this.state.isAuthenticated = false;

        sessionStorage.removeItem('vcs_token');
        sessionStorage.removeItem('vcs_role');
        sessionStorage.removeItem('vcs_user');
        localStorage.removeItem('vcs_token_backup');
    },

    isAdmin() {
        return this.state.isAuthenticated && this.state.role === 'admin';
    }
};

AuthManager.init();

/* ============================================================
   3. GLOBAL APPLICATION CONFIGURATION & API ROUTING
============================================================ */
const API_URL = "https://script.google.com/macros/s/AKfycbzMbiEbi0--bj7vjOtoZvt0EvWVaE1b31uHA--HWItBRbOa97RyWNzISMkMXqxFzx4/exec";

let appState = {
    currentYear: "all",
    lang: safeGetLocal('appLang', 'te'), 
    aiContextYear: new Date().getFullYear().toString()
};

let adminDataCache = {};
let publicDataCache = {};
let currentTableName = "";
let currentEditId = null;
let flipbookPages = [];

async function apiCall(action, payloadData = {}, isRetry = false) {
    if (!navigator.onLine) throw new Error("OFFLINE");
    
    const payload = { 
        action, 
        sessionToken: AuthManager.state.token, 
        ...payloadData 
    };

    try {
        const response = await fetch(API_URL, { 
            method: 'POST', 
            headers: { 'Content-Type': 'text/plain;charset=utf-8' },
            body: JSON.stringify(payload) 
        });
        
        const textRes = await response.text();
        let res;
        try {
            res = JSON.parse(textRes);
        } catch (e) {
            console.error("Non-JSON Response Received:", textRes);
            throw new Error("Invalid server response.");
        }

        if (res.status === 'error') {
            const errCode = res.error?.code || "";
            const isAuthAction = (action === 'adminLogin' || action === 'login' || action === 'signup');

            if (errCode === "SESSION_EXPIRED" && !isAuthAction) {
                if (!isRetry) {
                    await new Promise(r => setTimeout(r, 1200));
                    return await apiCall(action, payloadData, true);
                }
                AuthManager.clearSession();
                updateRouting();
                showToast("Session expired. Please sign in again.", "warning");
                throw new Error("SESSION_TERMINATED");
            }
            throw new Error(res.error?.message || "Operation failed.");
        }

        return res; 
    } catch (err) {
        if (err.message !== "SESSION_TERMINATED") {
            console.warn(`[API Info: ${action}]:`, err.message);
        }
        throw err;
    }
}

const TABLE_SCHEMAS = {
  "Users": ["id", "name", "phone", "email", "role", "passwordHash", "status", "createdAt", "updatedAt", "deletedAt"],
  "Banners": ["id", "title", "description", "imageUrl", "financialYear", "status", "createdAt", "updatedAt"],
  "Donors": ["id", "name", "phone", "village", "email", "status", "createdAt", "updatedAt"],
  "Donations": ["id", "receiptId", "donorName", "phone", "amount", "paymentMethod", "utrNumber", "category", "financialYear", "status", "notes", "verifiedBy", "createdAt"],
  "Events": ["id", "title", "eventDate", "financialYear", "time", "location", "description", "status", "createdAt"],
  "WorkAllocations": ["id", "taskName", "assignedTo", "phone", "financialYear", "dueDate", "priority", "status", "createdAt"],
  "FoodDistribution": ["id", "distributionDate", "financialYear", "mealType", "foodItem", "estimatedServings", "totalDishCost", "costPerServing", "sponsorName", "notes", "createdAt"],
  "FinancialTracker": ["id", "date", "financialYear", "type", "category", "subCategory", "vendorName", "invoiceNumber", "amount", "paymentMode", "description", "createdAt"],
  "FinancialAssistance": ["id", "personName", "phone", "amount", "financialYear", "issueDate", "dueDate", "status", "notes", "createdAt"],
  "Repayments": ["id", "assistanceId", "personName", "amountPaid", "financialYear", "paymentDate", "paymentMode", "createdAt"],
  "PoojaItems": ["id", "financialYear", "dayNumber", "itemName", "quantity", "unit", "estimatedCost", "actualCost", "vendorName", "isPurchased", "createdAt"],
  "GroceryList": ["id", "financialYear", "itemName", "category", "usedForDish", "quantity", "unit", "unitPrice", "totalAmount", "vendor", "isPurchased", "createdAt"],
  "Notes": ["id", "financialYear", "title", "content", "category", "pinned", "author", "createdAt"],
  "Reminders": ["id", "financialYear", "title", "reminderDate", "reminderTime", "isCompleted", "createdAt"],
  "CulturalStories": ["id", "title", "storyText", "summary", "language", "createdAt"],
  "FestivalHistory": ["id", "financialYear", "title", "openingBalance", "totalDonations", "totalExpenses", "closingBalance", "createdAt"],
  "FlipBook": ["id", "financialYear", "pageNumber", "title", "storyText", "imageUrl", "status", "createdAt"],
  "Announcements": ["id", "financialYear", "title", "message", "priority", "startDate", "endDate", "status", "createdAt"]
};

const SAFE_PUBLIC_TABLES = ["Banners", "Donors", "Donations", "Events", "FoodDistribution", "CulturalStories", "FestivalHistory", "FlipBook", "Announcements"];

/* ============================================================
   4. TRANSLATIONS (I18N)
============================================================ */
const i18n = {
    en: {
        pageTitle: "Swarna Ganapathi Swami - Community", navBanners: "Banners", navEvents: "Events", navDonations: "Donations", navFlipbook: "FlipBook Archive",
        loginBtn: "Login", adminBtn: "Admin", logoutBtn: "Logout", drumRat: "Drum (🥁)", fluteRat: "Flute (🪈)", prayRat: "Pray 🙏",
        appTitle: "Swarna Ganapathi Swamy festival celebrations", tagline2: "Live Information Portal for Sri Vinayaka Chavithi",
        onlineDonation: "Online Donation (Direct UPI Checkout)", devoteeName: "Devotee Name", phoneNumber: "Phone Number", amountLbl: "Amount (₹)",
        genQR: "Generate QR Code", scanLbl: "Scan using PhonePe, Google Pay, or Paytm", submitVerification: "Submit Verification",
        publicDbTitle: "📋 Public Database", yearLbl: "Financial Year:", welcomeBack: "Welcome", userDashDesc: "Track your donations and community activities.",
        userLoginTitle: "User Login", closeBtn: "Close", newUserTxt: "New user?", signupLink: "Sign up here", userSignupTitle: "User Sign Up",
        createAccBtn: "Create Account", hasAccTxt: "Already have an account?", loginLink: "Login here", adminLoginTitle: "Admin Access",
        secureLoginBtn: "Secure Login", adminPortalTitle: "Admin Portal", dashboardBtn: "Dashboard", financialDashBtn: "Financial Dashboard",
        addRecordBtn: "Add Record", recordMgmtTitle: "Record Management", cancelBtn: "Cancel", saveRecordBtn: "Save Record", flipbookArchiveTitle: "Digital FlipBook Archive",
        listening: "Listening...", askHere: "Ask Musika here...", offlineMsg: "You are offline. Showing cached information.", delConfirm: "Are you sure you want to permanently delete this record?",
        footerBrand: "Swarna Ganapathi", footerDesc: "A divine digital platform for Sri Vinayaka Chavithi community management, built with devotion and Musika AI.",
        quickLinks: "Quick Links", supportContact: "Support & Contact", systemStatus: "System Status", askMusikaAI: "Ask Musika AI"
    },
    te: {
        pageTitle: "స్వర్ణ గణపతి స్వామి - కమ్యూనిటీ", navBanners: "బ్యానర్లు", navEvents: "కార్యక్రమాలు", navDonations: "విరాళాలు", navFlipbook: "ఫ్లిప్‌బుక్ ఆర్కైవ్",
        loginBtn: "లాగిన్", adminBtn: "అడ్మిన్", logoutBtn: "లాగౌట్", drumRat: "డోలు (🥁)", fluteRat: "వేణువు (🪈)", prayRat: "నమస్కారం 🙏",
        appTitle: "స్వర్ణ గణపతి స్వామి వారి - ఉత్సవాల వేదిక", tagline2: "శ్రీ వినాయక చవితి మహోత్సవాల ప్రత్యక్ష సమాచార వేదిక",
        onlineDonation: "ఆన్‌లైన్ విరాళం (Direct UPI Checkout)", devoteeName: "భక్తుని పేరు", phoneNumber: "ఫోన్ నంబర్", amountLbl: "మొత్తం (₹)",
        genQR: "QR కోడ్ రూపొందించండి", scanLbl: "PhonePe, Google Pay, లేదా Paytm తో స్కాన్ చేయండి", submitVerification: "చెల్లింపును ధృవీకరించండి",
        publicDbTitle: "📋 పబ్లిక్ రికార్డులు (Public Database)", yearLbl: "ఆర్థిక సంవత్సరం:", welcomeBack: "స్వాగతం", userDashDesc: "మీ విరాళాలు మరియు సమాచారాన్ని ట్రాక్ చేయండి.",
        userLoginTitle: "యూజర్ లాగిన్", closeBtn: "మూసివేయు", newUserTxt: "కొత్త వారా?", signupLink: "సైన్ అప్ చేయండి", userSignupTitle: "యూజర్ సైన్ అప్",
        createAccBtn: "ఖాతా సృష్టించండి", hasAccTxt: "ఖాతా ఉందా?", loginLink: "లాగిన్ అవ్వండి", adminLoginTitle: "అడ్మిన్ లాగిన్",
        secureLoginBtn: "సురక్షిత లాగిన్", adminPortalTitle: "అడ్మిన్ పోర్టల్", dashboardBtn: "డాష్‌బోర్డ్", financialDashBtn: "ఆర్థిక డాష్‌బోర్డ్",
        addRecordBtn: "కొత్త రికార్డు", recordMgmtTitle: "రికార్డు నిర్వహణ", cancelBtn: "రద్దు చేయి", saveRecordBtn: "భద్రపరచు", flipbookArchiveTitle: "డిజిటల్ ఫ్లిప్‌బుక్ ఆర్కైవ్",
        listening: "వింటున్నాను...", askHere: "ఇక్కడ అడగండి...", offlineMsg: "మీరు ఆఫ్‌లైన్‌లో ఉన్నారు. కాష్ డేటా చూపిస్తున్నాము.", delConfirm: "మీరు ఖచ్చితంగా ఈ రికార్డును తొలగించాలనుకుంటున్నారా?",
        footerBrand: "స్వర్ణ గణపతి", footerDesc: "శ్రీ వినాయక చవితి కమ్యూనిటీ నిర్వహణ కోసం భక్తి మరియు అధునాతన మూషిక AI సాంకేతికతతో నిర్మించబడిన డిజిటల్ వేదిక.",
        quickLinks: "త్వరిత లింకులు", supportContact: "మద్దతు & సంప్రదింపు", systemStatus: "సిస్టమ్ స్థితి", askMusikaAI: "మూషిక AI ని అడగండి"
    }
};

function t(key) { return i18n[appState.lang]?.[key] || key; }

function setLanguage(lang) {
    appState.lang = lang;
    safeSetLocal('appLang', lang); 
    
    const btnTe = document.getElementById('lang-btn-te');
    const btnEn = document.getElementById('lang-btn-en');
    if (btnTe) btnTe.className = lang === 'te' ? 'px-2.5 py-1 rounded-lg bg-amber-500 text-amber-950 transition font-black' : 'px-2.5 py-1 rounded-lg text-amber-200 hover:text-white transition';
    if (btnEn) btnEn.className = lang === 'en' ? 'px-2.5 py-1 rounded-lg bg-amber-500 text-amber-950 transition font-black' : 'px-2.5 py-1 rounded-lg text-amber-200 hover:text-white transition';
    
    document.querySelectorAll('[data-i18n]').forEach(el => {
        const key = el.getAttribute('data-i18n');
        if (i18n[lang]?.[key]) {
            if (el.innerHTML.includes('<svg') || el.innerHTML.includes('<i')) {
                const icon = el.innerHTML.match(/<(svg|i)[^>]*>.*?<\/(svg|i)>/)?.[0] || '';
                el.innerHTML = icon + ' ' + i18n[lang][key];
            } else {
                el.innerText = i18n[lang][key];
            }
        }
    });

    renderPublicTable();
    renderFlipbookArchiveSection();
}

/* ============================================================
   5. ROUTING & INITIALIZATION
============================================================ */
function updateRouting() {
    const pubView = document.getElementById('public-view');
    const usrView = document.getElementById('user-view');
    const admView = document.getElementById('admin-view');
    
    if (pubView) pubView.classList.add('hidden');
    if (usrView) usrView.classList.add('hidden');
    if (admView) admView.classList.add('hidden');
    
    const btnLogin = document.getElementById('btn-login');
    const btnAdminLogin = document.getElementById('btn-admin-login');
    const btnLogout = document.getElementById('btn-logout');

    if (AuthManager.state.isAuthenticated) {
        if (btnLogin) btnLogin.classList.add('hidden');
        if (btnAdminLogin) btnAdminLogin.classList.add('hidden');
        if (btnLogout) btnLogout.classList.remove('hidden');

        if (AuthManager.isAdmin()) {
            if (admView) admView.classList.remove('hidden');
        } else {
            if (usrView) usrView.classList.remove('hidden');
            if (pubView) pubView.classList.remove('hidden');
        }
    } else {
        if (btnLogin) btnLogin.classList.remove('hidden');
        if (btnAdminLogin) btnAdminLogin.classList.remove('hidden');
        if (btnLogout) btnLogout.classList.add('hidden');
        if (pubView) pubView.classList.remove('hidden');
    }
}

async function initializeApp() {
    updateRouting();
    if (AuthManager.isAdmin()) {
        await loadAdminDashboard();
    } else if (AuthManager.state.isAuthenticated) {
        loadUserDashboard();
        await loadPublicData();
    } else {
        await loadPublicData();
    }
}

async function handleLogin(type) {
    const modalId = type === 'admin' ? 'admin-login-modal' : 'login-modal';
    const btn = document.querySelector(`#${modalId} button[data-action="handleLogin"]`) || document.querySelector(`#${modalId} button`);
    const originalText = btn ? btn.innerText : "Login";
    if (btn) { btn.innerText = "Verifying..."; btn.disabled = true; }

    const payload = type === 'admin' 
        ? { secret: (document.getElementById('admin-secret')?.value || "").trim() }
        : { identifier: (document.getElementById('login-id')?.value || "").trim(), password: (document.getElementById('login-pass')?.value || "").trim() };
    
    try {
        const res = await apiCall(type === 'admin' ? 'adminLogin' : 'login', payload);
        AuthManager.setSession(res.data.sessionToken, res.data.user.role, res.data.user.name);
        hideModal(modalId);
        showToast(`${t('welcomeBack')}, ${res.data.user.name}!`, "success");
        await initializeApp();
    } catch (err) {
        showToast(err.message || "Invalid credentials", "error");
    } finally {
        if (btn) { btn.innerText = originalText; btn.disabled = false; }
    }
}

function logout() {
    apiCall('logout', {}).catch(() => {});
    AuthManager.clearSession();
    adminDataCache = {};
    updateRouting();
    showToast("Logged out successfully.", "info");
}

/* ============================================================
   6. ADMIN DASHBOARD & CRUD CONTROLLER
============================================================ */
async function loadAdminDashboard() {
    const adminUserEl = document.getElementById('admin-user-name');
    if (adminUserEl) adminUserEl.textContent = AuthManager.state.userName || "System Admin";
    renderAdminSidebar();

    try {
        const res = await apiCall('getAdminData');
        adminDataCache = res.data;
        safeSetLocal('offline_admin_data', JSON.stringify(adminDataCache));
        
        const yearFilterEl = document.getElementById('global-year-filter');
        if (yearFilterEl) yearFilterEl.value = appState.currentYear;

        renderDashboardMetrics();
        renderFinancialDashboard();
        feedFinancialData();
    } catch (err) {
        const offline = safeGetLocal('offline_admin_data', null);
        if (offline) {
            adminDataCache = JSON.parse(offline);
            renderDashboardMetrics();
            renderFinancialDashboard();
            feedFinancialData();
            showToast("Viewing cached administrative data", "warning");
        } else {
            showToast("Database loading in progress. Please retry.", "error");
        }
    }
}

function renderAdminSidebar() {
    const container = document.getElementById('admin-table-buttons');
    if (!container) return;
    const tables = Object.keys(TABLE_SCHEMAS);
    container.innerHTML = tables.map(tbl => `
        <button onclick="renderTableView('${tbl}')" class="text-left px-3 py-1.5 rounded-lg hover:bg-amber-900 text-amber-100 font-bold text-xs transition">
            <i class="fas fa-table w-4 text-amber-500"></i> ${tbl}
        </button>
    `).join('');
}

function handleYearChange() {
    appState.currentYear = document.getElementById('global-year-filter')?.value || "all";
    renderDashboardMetrics();
    renderFinancialDashboard();
    if (currentTableName) renderTableView(currentTableName);
}

function renderDashboardMetrics() {
    showAdminSection('dashboard');
    const year = appState.currentYear;
    const dashSection = document.getElementById('admin-dashboard-section');
    if (!dashSection) return;
    
    const filterByYear = (arr) => {
        if (!arr) return [];
        if (year === "all") return arr;
        return arr.filter(item => (item.financialYear || item.createdAt || item.date || item.eventDate || "").toString().includes(year));
    };

    const yrDonations = filterByYear(adminDataCache["Donations"]);
    const yrExpenses = filterByYear(adminDataCache["FinancialTracker"]);
    
    let totalDonors = adminDataCache["Donors"] ? filterByYear(adminDataCache["Donors"]).length : 0;
    let verifiedDonations = yrDonations ? yrDonations.filter(d => d.status === "Verified").reduce((acc, curr) => acc + SafeUtils.getNumber(curr.amount), 0) : 0;
    let totalExpenses = yrExpenses ? yrExpenses.reduce((acc, curr) => acc + SafeUtils.getNumber(curr.amount), 0) : 0;
    let eventCount = adminDataCache["Events"] ? filterByYear(adminDataCache["Events"]).length : 0;

    dashSection.innerHTML = `
        <div class="bg-amber-900/60 p-5 rounded-xl border border-amber-500/30 flex flex-col justify-center shadow-lg">
            <span class="text-amber-200 text-xs font-bold uppercase mb-1"><i class="fas fa-users"></i> Total Donors</span>
            <span class="text-3xl font-black text-white">${totalDonors}</span>
        </div>
        <div class="bg-green-900/60 p-5 rounded-xl border border-green-500/30 flex flex-col justify-center shadow-lg">
            <span class="text-green-200 text-xs font-bold uppercase mb-1"><i class="fas fa-check-circle"></i> Verified Donations</span>
            <span class="text-3xl font-black text-white">₹${verifiedDonations.toLocaleString('en-IN')}</span>
        </div>
        <div class="bg-red-900/60 p-5 rounded-xl border border-red-500/30 flex flex-col justify-center shadow-lg">
            <span class="text-red-200 text-xs font-bold uppercase mb-1"><i class="fas fa-wallet"></i> Total Expenses</span>
            <span class="text-3xl font-black text-white">₹${totalExpenses.toLocaleString('en-IN')}</span>
        </div>
        <div class="bg-blue-900/60 p-5 rounded-xl border border-blue-500/30 flex flex-col justify-center shadow-lg">
            <span class="text-blue-200 text-xs font-bold uppercase mb-1"><i class="fas fa-calendar-alt"></i> Events</span>
            <span class="text-3xl font-black text-white">${eventCount}</span>
        </div>
    `;
}

function renderFinancialDashboard() {
    const container = document.getElementById('financial-metrics-container');
    if (!container) return;

    if (appState.currentYear === "all") {
        container.innerHTML = `<p class="text-amber-200 col-span-3 text-center bg-amber-900/40 p-4 rounded-xl border border-amber-500/30">Select a specific financial year to review ledger and carry-forward balance.</p>`;
        return;
    }

    const targetYear = parseInt(appState.currentYear, 10);
    let openingBalance = 0;
    
    if (adminDataCache["Donations"] && adminDataCache["FinancialTracker"]) {
        const pastDonations = adminDataCache["Donations"].filter(d => d.status === "Verified" && parseInt((d.financialYear || d.createdAt || "").substring(0,4), 10) < targetYear).reduce((acc, curr) => acc + SafeUtils.getNumber(curr.amount), 0);
        const pastExpenses = adminDataCache["FinancialTracker"].filter(d => parseInt((d.financialYear || d.date || "").substring(0,4), 10) < targetYear).reduce((acc, curr) => acc + SafeUtils.getNumber(curr.amount), 0);
        openingBalance = pastDonations - pastExpenses;
    }

    let cyDonations = (adminDataCache["Donations"] || []).filter(d => d.status === "Verified" && parseInt((d.financialYear || d.createdAt || "").substring(0,4), 10) === targetYear).reduce((acc, curr) => acc + SafeUtils.getNumber(curr.amount), 0);
    let cyExpenses = (adminDataCache["FinancialTracker"] || []).filter(d => parseInt((d.financialYear || d.date || "").substring(0,4), 10) === targetYear).reduce((acc, curr) => acc + SafeUtils.getNumber(curr.amount), 0);
    let closingBalance = openingBalance + cyDonations - cyExpenses;

    container.innerHTML = `
        <div class="bg-amber-950 p-5 rounded-xl border border-amber-500/50 shadow-md">
            <p class="text-xs font-bold text-amber-400 uppercase tracking-widest mb-2"><i class="fas fa-piggy-bank"></i> Opening Balance</p>
            <p class="text-2xl font-black text-white">₹${openingBalance.toLocaleString('en-IN')}</p>
        </div>
        <div class="bg-green-950 p-5 rounded-xl border border-green-500/50 shadow-md">
            <p class="text-xs font-bold text-green-400 uppercase tracking-widest mb-2"><i class="fas fa-arrow-down"></i> Income (Donations)</p>
            <p class="text-2xl font-black text-green-300">+ ₹${cyDonations.toLocaleString('en-IN')}</p>
        </div>
        <div class="bg-red-950 p-5 rounded-xl border border-red-500/50 shadow-md">
            <p class="text-xs font-bold text-red-400 uppercase tracking-widest mb-2"><i class="fas fa-arrow-up"></i> Expenses</p>
            <p class="text-2xl font-black text-red-300">- ₹${cyExpenses.toLocaleString('en-IN')}</p>
        </div>
        <div class="col-span-1 sm:col-span-3 bg-gradient-to-r from-amber-500 to-amber-600 p-6 rounded-xl border-2 border-amber-300 shadow-[0_10px_25px_rgba(245,158,11,0.4)] flex justify-between items-center text-amber-950 mt-2">
            <span class="font-black text-xl uppercase tracking-widest">Available Balance (${targetYear})</span>
            <span class="font-black text-4xl drop-shadow-md">₹${closingBalance.toLocaleString('en-IN')}</span>
        </div>
    `;
}

function showAdminSection(section) {
    document.getElementById('admin-dashboard-section')?.classList.toggle('hidden', section !== 'dashboard');
    document.getElementById('admin-finance-section')?.classList.toggle('hidden', section !== 'finance');
    document.getElementById('admin-table-section')?.classList.toggle('hidden', section !== 'table');
}

function renderTableView(tableName) {
    currentTableName = tableName;
    showAdminSection('table');
    const titleEl = document.getElementById('current-table-title');
    if (titleEl) titleEl.textContent = tableName;
    
    let data = adminDataCache[tableName] || [];
    if (appState.currentYear && appState.currentYear !== "all") {
        data = data.filter(item => {
            const rowDate = (item.financialYear || item.createdAt || item.date || item.eventDate || item.year || "").toString();
            return !rowDate || rowDate === '-' || rowDate.includes(appState.currentYear);
        });
    }

    const thead = document.getElementById('dynamic-table-head');
    const tbody = document.getElementById('dynamic-table-body');
    if (!thead || !tbody) return;
    
    thead.innerHTML = ""; 
    tbody.innerHTML = "";

    const schemaFields = TABLE_SCHEMAS[tableName] || [];
    const keys = schemaFields.filter(k => k !== "id");
    
    let headerRow = "<tr>";
    keys.forEach(k => { headerRow += `<th class="px-4 py-3">${k}</th>`; });
    headerRow += `<th class="px-4 py-3 text-right">Actions</th></tr>`;
    thead.innerHTML = headerRow;

    if (data.length === 0) {
        tbody.innerHTML = `<tr><td class="p-4 text-center text-amber-300/80" colspan="100%">No records found.</td></tr>`;
        return;
    }

    data.forEach(row => {
        let tr = document.createElement('tr');
        tr.className = "hover:bg-amber-900/40 transition border-b border-amber-800/30";
        
        keys.forEach(k => {
            let val = row[k] !== undefined && row[k] !== "" ? row[k] : '-';
            if ((k.toLowerCase().includes('date') || k.toLowerCase().includes('at')) && val !== '-') {
                val = formatDate(val);
            }
            if (k === "status") {
                if (val === "Verified" || val === "Active") val = `<span class="bg-green-600/30 text-green-400 px-2 py-0.5 rounded text-xs font-bold">${val}</span>`;
                else if (val === "Pending") val = `<span class="bg-yellow-600/30 text-yellow-400 px-2 py-0.5 rounded text-xs font-bold">${val}</span>`;
                else val = `<span class="bg-red-600/30 text-red-400 px-2 py-0.5 rounded text-xs font-bold">${val}</span>`;
            }
            tr.innerHTML += `<td class="px-4 py-3 whitespace-nowrap max-w-[200px] truncate" title="${val}">${val}</td>`;
        });

        let actions = `<td class="px-4 py-3 text-right space-x-3 whitespace-nowrap">`;
        if (tableName === "Donations" && row.status !== "Verified") {
            actions += `<button onclick="verifyDonation('${row.id}')" class="text-green-400 hover:text-green-300 font-bold text-xs"><i class="fas fa-check-circle"></i> Verify</button>`;
        }
        actions += `
            <button onclick="openRecordModal('${row.id}')" class="text-blue-400 hover:text-blue-300 font-bold text-xs"><i class="fas fa-edit"></i> Edit</button>
            <button onclick="deleteRecord('${tableName}', '${row.id}')" class="text-red-400 hover:text-red-300 font-bold text-xs"><i class="fas fa-trash"></i> Delete</button>
        </td>`;
        tr.innerHTML += actions;
        tbody.appendChild(tr);
    });
}

function filterCurrentTable() {
    const input = document.getElementById('table-search')?.value.toLowerCase() || "";
    const rows = document.getElementById('dynamic-table-body')?.getElementsByTagName('tr') || [];
    for (let i = 0; i < rows.length; i++) {
        rows[i].style.display = rows[i].textContent.toLowerCase().includes(input) ? "" : "none";
    }
}

function openRecordModal(id = null) {
    currentEditId = id;
    const modalTitle = document.getElementById('crud-modal-title');
    if (modalTitle) modalTitle.textContent = id ? `Edit Record - ${currentTableName}` : `New Record - ${currentTableName}`;
    const container = document.getElementById('crud-form-fields');
    if (!container) return;
    container.innerHTML = "";
    
    let schema = TABLE_SCHEMAS[currentTableName] || [];
    let recordData = (id && adminDataCache[currentTableName]) ? adminDataCache[currentTableName].find(r => r.id === id) || {} : {};

    schema.forEach(field => {
        if (["id", "createdAt", "updatedAt", "deletedAt"].includes(field)) return;
        let inputType = field.toLowerCase().includes("date") ? "date" : (field.toLowerCase().includes("amount") || field.toLowerCase().includes("quantity") ? "number" : "text");
        let val = recordData[field] !== undefined ? recordData[field] : "";
        
        if (field === "status") {
            container.innerHTML += `
                <div class="flex flex-col gap-1">
                    <label class="text-xs font-bold text-amber-400 uppercase tracking-wider">${field}</label>
                    <select id="crud-field-${field}" class="bg-amber-900 border border-amber-500 text-white p-2 rounded focus:outline-none">
                        <option value="Active" ${val === 'Active' ? 'selected' : ''}>Active</option>
                        <option value="Pending" ${val === 'Pending' ? 'selected' : ''}>Pending</option>
                        <option value="Verified" ${val === 'Verified' ? 'selected' : ''}>Verified</option>
                        <option value="Inactive" ${val === 'Inactive' ? 'selected' : ''}>Inactive</option>
                    </select>
                </div>`;
        } else if (field === "financialYear") {
            let defaultYear = (appState.currentYear !== "all") ? appState.currentYear : new Date().getFullYear();
            container.innerHTML += `
                <div class="flex flex-col gap-1">
                    <label class="text-xs font-bold text-amber-400 uppercase tracking-wider">${field}</label>
                    <input type="number" id="crud-field-${field}" value="${val || defaultYear}" class="bg-amber-900 border border-amber-500 text-white p-2 rounded focus:outline-none">
                </div>`;
        } else {
            container.innerHTML += `
                <div class="flex flex-col gap-1">
                    <label class="text-xs font-bold text-amber-400 uppercase tracking-wider">${field}</label>
                    <input type="${inputType}" id="crud-field-${field}" value="${val}" class="bg-amber-900 border border-amber-500 text-white p-2 rounded focus:outline-none">
                </div>`;
        }
    });
    showModal('crud-modal');
}

async function saveRecord() {
    const btn = document.getElementById('crud-save-btn');
    if (btn) { btn.innerText = "Saving..."; btn.disabled = true; }
    
    let schemaFields = TABLE_SCHEMAS[currentTableName] || [];
    let payloadData = {};
    if (currentEditId) payloadData.id = currentEditId;

    schemaFields.forEach(field => {
        if (["id", "createdAt", "updatedAt", "deletedAt"].includes(field)) return;
        const el = document.getElementById(`crud-field-${field}`);
        if (el) payloadData[field] = el.value !== undefined ? el.value : "";
    });

    try {
        await apiCall(currentEditId ? "update" : "add", { sheetName: currentTableName, data: payloadData });
        showToast("Record saved successfully!");
        hideModal('crud-modal');
        await loadAdminDashboard();
        renderTableView(currentTableName);
    } catch (err) {
        showToast(err.message || "Save error occurred.", "error");
    } finally {
        if (btn) { btn.innerText = "Save Record"; btn.disabled = false; }
    }
}

async function deleteRecord(tableName, id) {
    if (!confirm(t('delConfirm'))) return;
    try {
        await apiCall('delete', { sheetName: tableName, id: id });
        showToast("Record deleted.");
        await loadAdminDashboard();
        renderTableView(tableName);
    } catch (err) {
        showToast("Deletion failed.", "error");
    }
}

async function verifyDonation(id) {
    const record = adminDataCache["Donations"]?.find(d => d.id === id);
    if (!record) return showToast("Record not found", "error");
    let utr = prompt(`Verify UTR:`, record.utrNumber || "");
    if (utr === null) return;
    try {
        await apiCall('verifyDonation', { id, status: "Verified", utrNumber: utr, amount: record.amount });
        showToast("Donation marked as Verified!");
        await loadAdminDashboard();
        renderTableView(currentTableName);
    } catch (err) {
        showToast("Verification failed.", "error");
    }
}

/* ============================================================
   7. PUBLIC DATA & VIEWS
============================================================ */
async function loadPublicData() {
    try {
        const res = await apiCall('getPublicData');
        publicDataCache = res.data;
        safeSetLocal('offline_public_data', JSON.stringify(publicDataCache));
        populatePublicTableDropdown();
        renderPublicTable();
        renderCarousel(publicDataCache.Banners || []);
        renderFlipbookArchiveSection();
        feedFinancialData();
    } catch (err) {
        const cached = safeGetLocal('offline_public_data', null);
        if (cached) {
            publicDataCache = JSON.parse(cached);
            populatePublicTableDropdown();
            renderPublicTable();
            renderCarousel(publicDataCache.Banners || []);
            renderFlipbookArchiveSection();
            feedFinancialData();
        }
    }
}

function loadUserDashboard() {
    const userDisplay = document.getElementById('user-display-name');
    const panel = document.getElementById('user-greeting-panel');
    if (userDisplay && panel) {
        userDisplay.textContent = AuthManager.state.userName || 'Devotee';
        panel.classList.remove('hidden');
    }
}

function populatePublicTableDropdown() {
    const selector = document.getElementById("public-table-selector");
    if (!selector) return;
    const available = SAFE_PUBLIC_TABLES.filter(t => publicDataCache[t]);
    selector.innerHTML = (available.length ? available : ["Donations", "Events"]).map(t => `<option value="${t}">${t}</option>`).join('');
    if (selector.querySelector('option[value="Donations"]')) selector.value = "Donations";
}

function renderPublicTable() {
    const selector = document.getElementById("public-table-selector");
    const yearFilter = document.getElementById("public-year-filter");
    if (!selector || !yearFilter) return;
    
    const tableKey = selector.value;
    const selectedYear = yearFilter.value;
    let records = publicDataCache[tableKey] || [];
    
    if (selectedYear !== "all") {
        records = records.filter(item => {
            const rowYear = (item.financialYear || item.year || item.createdAt || item.date || item.eventDate || "").toString();
            return rowYear.includes(selectedYear);
        });
    }

    const thead = document.getElementById("public-table-head");
    const tbody = document.getElementById("public-table-body");
    if (!thead || !tbody) return;

    if (!records.length) {
        thead.innerHTML = `<tr><th class="p-4 text-center">Notice</th></tr>`;
        tbody.innerHTML = `<tr><td class="p-6 text-center text-amber-300">No records available.</td></tr>`;
        return;
    }

    const keys = Object.keys(records[0]).filter(k => !["id", "passwordHash", "sessionToken", "updatedAt"].includes(k));
    thead.innerHTML = `<tr>${keys.map(k => `<th class="p-4 border-b border-amber-500/30">${k}</th>`).join('')}</tr>`;
    tbody.innerHTML = records.map(r => `
        <tr class="hover:bg-amber-900/30 transition border-b border-amber-800/30">
            ${keys.map(k => `<td class="p-4 whitespace-nowrap">${r[k] || '-'}</td>`).join('')}
        </tr>
    `).join('');
}

let slideIndex = 0;
let carouselTimer = null;
function renderCarousel(banners) {
    const track = document.getElementById('carousel-track');
    if (!track) return;
    const active = banners.filter(b => b.status === "Active" || !b.status);
    if (!active.length) {
        track.innerHTML = `<div class="min-w-full h-full flex items-center justify-center bg-amber-900/40 text-amber-200 font-bold">Announcements Coming Soon</div>`;
        return;
    }
    track.innerHTML = active.map(b => `
        <div class="min-w-full h-full relative flex-shrink-0">
            <img src="${b.imageUrl}" class="w-full h-full object-cover opacity-80" alt="${b.title || ''}" onerror="this.src='https://images.unsplash.com/photo-1628744448840-55bdb2497bd4?w=800&q=80'">
            <div class="absolute inset-0 bg-gradient-to-t from-amber-950 via-transparent to-transparent flex flex-col justify-end p-8">
                <h3 class="text-3xl font-black text-amber-300 drop-shadow-md">${b.title || ''}</h3>
                <p class="text-white font-bold drop-shadow-md">${b.description || ''}</p>
            </div>
        </div>
    `).join('');
    if (carouselTimer) clearInterval(carouselTimer);
    carouselTimer = setInterval(nextSlide, 5000);
}

function nextSlide() { const track = document.getElementById('carousel-track'); if (track && track.children.length) { slideIndex = (slideIndex + 1) % track.children.length; track.style.transform = `translateX(-${slideIndex * 100}%)`; } }
function prevSlide() { const track = document.getElementById('carousel-track'); if (track && track.children.length) { slideIndex = (slideIndex - 1 + track.children.length) % track.children.length; track.style.transform = `translateX(-${slideIndex * 100}%)`; } }

function generateUPIQRCode() {
    const name = document.getElementById("upi-name")?.value.trim(); 
    const amount = document.getElementById("upi-amount")?.value.trim();
    if (!name || !amount || Number(amount) <= 0) return showToast("Enter Name and valid Amount", "error");
    const qrImg = document.getElementById("upi-qr-image");
    if (qrImg) qrImg.src = `https://quickchart.io/qr?text=${encodeURIComponent(`upi://pay?pa=9390198031@ybl&pn=VinayakaSeva&tn=Donation_${encodeURIComponent(name)}&am=${amount}&cu=INR`)}&size=250&margin=2`;
    const qrBox = document.getElementById("upi-qr-box");
    if (qrBox) { qrBox.classList.remove("hidden"); qrBox.classList.add("flex"); }
    showToast("QR Code Generated!");
}

async function confirmUPIPayment() {
    const name = document.getElementById("upi-name")?.value.trim(); 
    const phone = document.getElementById("upi-phone")?.value.trim();
    const amount = document.getElementById("upi-amount")?.value.trim(); 
    const utr = document.getElementById("upi-utr")?.value.trim();
    if (!utr || utr.length < 6) return showToast("Enter a valid 12-digit UTR", "error");
    
    const btn = document.getElementById("btn-confirm-upi"); 
    if (btn) { btn.disabled = true; btn.innerText = "Submitting..."; }
    try {
        await apiCall('add', { sheetName: 'Donations', data: { donorName: name, phone: phone, amount: amount, paymentMethod: 'UPI', utrNumber: utr, status: 'Pending' } });
        showToast("Payment submitted for verification!"); 
        document.getElementById("upi-qr-box")?.classList.replace("flex", "hidden"); 
    } catch(e) {
        showToast(e.message || "Submission failed", "error");
    } finally {
        if (btn) { btn.disabled = false; btn.innerText = "Submit Verification"; }
    }
}

/* ============================================================
   8. FLIPBOOK 3D VIEWER
============================================================ */
function openFlipbook() {
    const year = document.getElementById('public-year-filter')?.value || "all";
    const cache = AuthManager.isAdmin() ? adminDataCache : publicDataCache;
    flipbookPages = (cache["FlipBook"] || []).filter(p => year === "all" || String(p.financialYear).includes(year));
    
    if (!flipbookPages.length) {
        showToast("No pages archived for this year.", "info");
        return;
    }
    showModal('flipbook-modal');
    renderTurnJsBook();
}

function closeFlipbook() { 
    if (window.$ && typeof $("#flipbook").turn === "function") {
        try { if($("#flipbook").turn("is")) $("#flipbook").turn("destroy"); } catch(e){}
    }
    hideModal('flipbook-modal'); 
}

function renderTurnJsBook() {
    if (!window.$ || typeof $("#flipbook").turn !== "function") return;
    const book = $("#flipbook");
    if (!book.length) return;
    try { if (book.turn("is")) book.turn("destroy"); } catch(e){}
    book.html("");
    
    book.append(`
        <div class="hard bg-gradient-to-br from-amber-950 to-amber-900 text-amber-200 flex flex-col items-center justify-center p-6 border-4 border-amber-500 text-center shadow-2xl">
            <h1 class="text-2xl font-black text-amber-400 mb-2">Vinayaka Seva</h1>
            <p class="text-xs uppercase font-bold tracking-widest text-amber-300">Digital Archive</p>
        </div>
        <div class="hard bg-amber-100/90 shadow-inner"></div>
    `);

    flipbookPages.forEach(p => {
        book.append(`
            <div class="bg-amber-50/95 text-amber-950 p-6 flex flex-col justify-between border-2 border-amber-300 h-full shadow-md">
                <div class="overflow-y-auto pr-1 flex-1">
                    <h3 class="text-lg font-black text-amber-900 mb-2 border-b-2 border-amber-400 pb-1">${p.title || 'Chapter'}</h3>
                    ${p.imageUrl ? `<img src="${p.imageUrl}" class="w-full h-40 object-cover rounded my-2 border border-amber-500">` : ''}
                    <p class="text-xs text-slate-800 leading-relaxed">${p.storyText || ''}</p>
                </div>
                <div class="text-right text-[10px] font-black text-amber-700 pt-2 border-t border-amber-300">- Page ${p.pageNumber || ''} -</div>
            </div>
        `);
    });

    book.append(`
        <div class="hard bg-amber-100/90 shadow-inner"></div>
        <div class="hard bg-gradient-to-br from-amber-900 to-amber-950 text-amber-300 flex flex-col items-center justify-center font-black p-6 border-4 border-amber-500 text-center shadow-2xl">
            <p class="text-amber-400 text-base mb-1">शुभं భవతు</p>
        </div>
    `);

    setTimeout(() => {
        let w = Math.min(window.innerWidth * 0.88, 800);
        let h = Math.min(window.innerHeight * 0.65, 480);
        try {
            book.turn({ width: w, height: h, autoCenter: true, elevation: 50, gradients: true });
        } catch(e){}
    }, 120);
}

function turnPage(dir) {
    if (window.$ && typeof $("#flipbook").turn === "function") {
        try { if (dir > 0) $("#flipbook").turn("next"); else $("#flipbook").turn("previous"); } catch(e){}
    }
}

function renderFlipbookArchiveSection() {
    const grid = document.getElementById("flipbook-cards-grid");
    if (!grid) return;
    const cache = AuthManager.isAdmin() ? adminDataCache : publicDataCache;
    const pages = (cache["FlipBook"] || []).filter(p => p.status !== "Inactive");
    
    if (!pages.length) {
        grid.innerHTML = `<div class="col-span-full text-center py-6 text-amber-200">FlipBook archive empty.</div>`;
        return;
    }
    grid.innerHTML = pages.map(p => `
        <div class="bg-amber-950/80 border-2 border-amber-500/40 rounded-2xl overflow-hidden shadow-xl flex flex-col justify-between">
            <div class="p-4">
                <span class="bg-amber-600 text-amber-950 font-black text-[10px] px-2 py-0.5 rounded">Page ${p.pageNumber || 1}</span>
                <h3 class="text-base font-black text-amber-300 mt-2">${p.title || 'Untitled'}</h3>
                <p class="text-amber-100 text-xs mt-1 line-clamp-3">${p.storyText || ''}</p>
            </div>
            <div class="p-4 pt-0">
                <button data-action="openFlipbook" class="w-full bg-amber-600 hover:bg-amber-500 text-amber-950 font-black py-2 rounded-xl text-xs transition">
                    Open 3D Reader
                </button>
            </div>
        </div>
    `).join('');
}

/* ============================================================
   9. FINANCIAL LEDGER INTEGRATION
============================================================ */
function feedFinancialData() {
    const cache = AuthManager.isAdmin() ? adminDataCache : publicDataCache;
    const donations = (cache["Donations"] || []).filter(d => AuthManager.isAdmin() || d.status === "Verified");
    const tracker = cache["FinancialTracker"] || [];

    const list = [
        ...donations.map(d => ({ ...d, transactionType: 'income', amount: d.amount, date: d.createdAt || d.date })),
        ...tracker.map(t => ({ ...t, transactionType: t.type || 'expense', amount: t.amount, date: t.date || t.createdAt }))
    ];

    if (typeof window.setFinancialTransactions === 'function') {
        window.setFinancialTransactions(list);
    }
}

function calculateInterest() {
    const p = parseFloat(document.getElementById("calc-principal")?.value) || 0;
    const r = parseFloat(document.getElementById("calc-rate")?.value) || 0;
    const t = parseFloat(document.getElementById("calc-time")?.value) || 0;
    if (p <= 0 || r <= 0 || t <= 0) return showToast("Enter valid numerical values", "error");
    const si = (p * r * t) / 100;
    const ci = p * Math.pow((1 + (r / 100)), t) - p;
    document.getElementById("res-si").textContent = `₹${si.toLocaleString('en-IN')}`;
    document.getElementById("res-ci").textContent = `₹${ci.toLocaleString('en-IN')}`;
    document.getElementById("res-total").textContent = `₹${(p + si).toLocaleString('en-IN')}`;
    document.getElementById("calc-result-box")?.classList.remove("hidden");
    document.getElementById("calc-result-box")?.classList.add("grid");
}
/* ============================================================
   10.1 MOOSHIKA TABLE REGISTRY & SCHEMA MAP
============================================================ */
const MusikaTables = {
    Users: {
        aliases: ["users", "user", "వినియోగదారులు", "యూజర్లు", "admins", "members"],
        numeric: [],
        dateFields: ["createdAt", "updatedAt"]
    },
    Banners: {
        aliases: ["banner", "banners", "బ్యానర్లు", "పోస్టర్"],
        numeric: [],
        dateFields: ["createdAt", "updatedAt"]
    },
    Donors: {
        aliases: ["donor", "donors", "దాతలు", "దాత"],
        numeric: [],
        dateFields: ["createdAt", "updatedAt"]
    },
    Donations: {
        aliases: ["donation", "donations", "donate", "విరాళం", "విరాళాలు", "చందా", "చందాలు", "funds", "receipts"],
        numeric: ["amount"],
        dateFields: ["createdAt", "updatedAt", "date"]
    },
    Events: {
        aliases: ["event", "events", "కార్యక్రమం", "కార్యక్రమాలు", "ఈవెంట్స్", "schedule", "పూజ సమయం", "dates"],
        numeric: [],
        dateFields: ["eventDate", "createdAt", "updatedAt"]
    },
    WorkAllocations: {
        aliases: ["work", "task", "tasks", "work allocations", "పని", "పనులు", "టాస్క్", "బాధ్యతలు", "duty"],
        numeric: [],
        dateFields: ["dueDate", "createdAt", "updatedAt"]
    },
    FoodDistribution: {
        aliases: ["food", "food distribution", "meals", "ఆహారం", "అన్నదానం", "భోజనం", "prasadam", "ప్రసాదం"],
        numeric: ["estimatedServings", "totalDishCost", "costPerServing", "quantity"],
        dateFields: ["distributionDate", "createdAt", "updatedAt"]
    },
    FinancialTracker: {
        aliases: ["finance", "financial", "expense", "expenses", "ఖర్చు", "ఖర్చులు", "ఆర్థిక", "ఫైనాన్స్", "bills", "spending"],
        numeric: ["amount"],
        dateFields: ["date", "createdAt", "updatedAt"]
    },
    FinancialAssistance: {
        aliases: ["assistance", "financial assistance", "help", "సహాయం", "ఆర్థిక సహాయం", "borrowed", "loan"],
        numeric: ["amount"],
        dateFields: ["issueDate", "dueDate", "createdAt", "updatedAt"]
    },
    Repayments: {
        aliases: ["repayment", "repayments", "paid", "తిరిగి చెల్లింపు", "చెల్లింపులు", "returned"],
        numeric: ["amountPaid"],
        dateFields: ["paymentDate", "createdAt", "updatedAt"]
    },
    PoojaItems: {
        aliases: ["pooja", "pooja items", "puja", "పూజ", "పూజా సామగ్రి", "సామగ్రి", "dravyam"],
        numeric: ["dayNumber", "quantity", "estimatedCost", "actualCost"],
        dateFields: ["createdAt", "updatedAt"]
    },
    GroceryList: {
        aliases: ["grocery", "groceries", "shopping", "కిరాణా", "సరుకులు", "షాపింగ్", "provisions"],
        numeric: ["quantity", "unitPrice", "totalAmount"],
        dateFields: ["createdAt", "updatedAt"]
    },
    Notes: {
        aliases: ["note", "notes", "నోట్స్", "గమనికలు", "చిత్తుప్రతులు"],
        numeric: [],
        dateFields: ["createdAt", "updatedAt"]
    },
    Reminders: {
        aliases: ["reminder", "reminders", "గుర్తుచేయింపు", "రిమైండర్లు", "alerts"],
        numeric: [],
        dateFields: ["reminderDate", "createdAt", "updatedAt"]
    },
    CulturalStories: {
        aliases: ["story", "stories", "cultural", "సాంస్కృతిక కథలు", "కథలు", "mythology"],
        numeric: [],
        dateFields: ["createdAt", "updatedAt"]
    },
    AIKnowledge: {
        aliases: ["knowledge", "ai knowledge", "జ్ఞానం", "AI జ్ఞానం", "rules", "faq"],
        numeric: [],
        dateFields: ["createdAt", "updatedAt"]
    },
    FestivalHistory: {
        aliases: ["history", "festival history", "చరిత్ర", "పండుగ చరిత్ర", "past festivals"],
        numeric: ["openingBalance", "totalDonations", "totalExpenses", "closingBalance", "year"],
        dateFields: ["createdAt", "updatedAt"]
    },
    FlipBook: {
        aliases: ["flipbook", "flip book", "ఫ్లిప్ బుక్", "digital book", "album"],
        numeric: ["pageNumber"],
        dateFields: ["createdAt", "updatedAt"]
    },
    AIConversations: {
        aliases: ["conversation", "conversations", "chat history", "చాట్", "సంభాషణలు"],
        numeric: [],
        dateFields: ["createdAt", "updatedAt"]
    },
    AISettings: {
        aliases: ["ai settings", "settings", "సెట్టింగ్స్", "AI సెట్టింగ్స్", "config"],
        numeric: [],
        dateFields: ["createdAt", "updatedAt"]
    },
    AuditLogs: {
        aliases: ["audit", "audit logs", "logs", "లాగ్స్", "ఆడిట్", "system logs"],
        numeric: [],
        dateFields: ["timestamp", "createdAt"]
    },
    Announcements: {
        aliases: ["announcement", "announcements", "notice", "notices", "ప్రకటన", "ప్రకటనలు", "నోటీసులు"],
        numeric: [],
        dateFields: ["startDate", "endDate", "createdAt", "updatedAt"]
    }
};

/* ============================================================
   10.2 ADVANCED DATA HELPERS & SECURITY GUARD
============================================================ */
const MusikaAdvancedUtils = {
    text(value) {
        return String(value ?? "").toLowerCase().trim();
    },

    number(value) {
        if (typeof value === "number" && !isNaN(value)) return value;
        const parsed = parseFloat(String(value ?? "").replace(/,/g, ""));
        return Number.isFinite(parsed) ? parsed : 0;
    },

    escape(value) {
        return String(value ?? "")
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");
    },

    money(value) {
        return `₹${this.number(value).toLocaleString("en-IN")}`;
    },

    date(value) {
        if (!value || value === "-") return "-";
        try {
            const d = new Date(value);
            return isNaN(d.getTime()) ? String(value) : d.toLocaleDateString("en-IN", { day: '2-digit', month: 'short', year: 'numeric' });
        } catch {
            return String(value);
        }
    },

    getRecords(tableName, isAdmin = false, targetYear = null, targetMonth = null) {
        const source = (isAdmin && typeof adminDataCache !== "undefined" && Object.keys(adminDataCache).length)
            ? adminDataCache
            : (typeof publicDataCache !== "undefined" ? publicDataCache : {});

        if (!isAdmin) {
            const blockedTables = ["Users", "AuditLogs", "AISettings", "AIConversations"];
            if (blockedTables.includes(tableName)) return [];
        }

        let list = Array.isArray(source?.[tableName]) ? source[tableName] : [];

        if (targetYear && targetYear !== "all") {
            const strYear = String(targetYear);
            list = list.filter(item => {
                const check = (item.financialYear || item.createdAt || item.date || item.eventDate || item.year || "").toString();
                return check.includes(strYear);
            });
        }

        if (targetMonth) {
            list = list.filter(item => {
                const rawDate = (item.date || item.createdAt || item.eventDate || item.distributionDate || "").toString();
                if (!rawDate) return false;
                const d = new Date(rawDate);
                return !isNaN(d.getTime()) && (d.getMonth() + 1) === targetMonth;
            });
        }

        return list;
    },

    total(records, field) {
        return records.reduce((sum, row) => sum + this.number(row[field]), 0);
    },

    average(records, field) {
        if (!records.length) return 0;
        return this.total(records, field) / records.length;
    },

    latest(records, count = 5) {
        return [...records].sort((a, b) => {
            const da = new Date(a.updatedAt || a.createdAt || a.date || a.eventDate || 0);
            const db = new Date(b.updatedAt || b.createdAt || b.date || b.eventDate || 0);
            return db - da;
        }).slice(0, count);
    },

    search(records, fields, query) {
        const q = this.text(query);
        return records.filter(row =>
            fields.some(field => this.text(row[field]).includes(q))
        );
    }
};

/* ============================================================
   10.3 LANGUAGE DETECTOR
============================================================ */
const MusikaLanguage = {
    detect(text) {
        return /[\u0C00-\u0C7F]/.test(String(text || "")) ? "te" : "en";
    },
    isTelugu(text) {
        return this.detect(text) === "te";
    }
};

/* ============================================================
   10.4 NLP ENGINE (INTENT & DOMAIN CLASSIFIERS)
============================================================ */
const MusikaNLP = {
    normalizeText(text) {
        return String(text || "")
            .toLowerCase()
            .replace(/[.,\/#!$%\^&\*;:{}=\-_`~()?[\]{}"']/g, " ")
            .replace(/\s+/g, " ")
            .trim();
    },

    extractYear(text) {
        const match = text.match(/\b(20\d{2})\b/);
        return match ? match[1] : null;
    },

    extractMonth(text) {
        const months = {
            jan: 1, january: 1, జనవరి: 1,
            feb: 2, february: 2, ఫిబ్రవరి: 2,
            mar: 3, march: 3, మార్చి: 3,
            apr: 4, april: 4, ఏప్రిల్: 4,
            may: 5, మే: 5,
            jun: 6, june: 6, జూన్: 6,
            jul: 7, july: 7, జూలై: 7,
            aug: 8, august: 8, ఆగస్టు: 8,
            sep: 9, september: 9, సెప్టెంబర్: 9,
            oct: 10, october: 10, అక్టోబర్: 10,
            nov: 11, november: 11, నవంబర్: 11,
            dec: 12, december: 12, డిసెంబర్: 12
        };
        for (const [m, idx] of Object.entries(months)) {
            if (text.includes(m)) return idx;
        }
        return null;
    },

    has(text, patterns) {
        const val = this.normalizeText(text);
        return patterns.some(p => val.includes(p.toLowerCase()));
    },

    detectIntent(text) {
        const q = this.normalizeText(text);

        // 1. Comprehensive Full Report (Donations + Expenses + Events + Balance)
        if (this.has(q, [
            "full report", "annual report", "year report", "complete report", "summary report",
            "పూర్తి నివేదిక", "సంవత్సరం నివేదిక", "వార్షిక నివేదిక", "మొత్తం రిపోర్ట్", "సమగ్ర సమాచారం"
        ])) return "FULL_REPORT";

        // 2. Year-Wise & Date-Wise Donors List
        if (this.has(q, [
            "donors list", "donor names", "who are the donors", "list of donors", "show donors", "donations list",
            "year wise donations", "date wise donations", "devotee list",
            "దాతల జాబితా", "దాతల పేర్లు", "ఎవరెవరు ఇచ్చారు", "దాతలు ఎవరు", "దాతలు",
            "తేదీ వారిగా విరాళాలు", "సంవత్సరం వారిగా విరాళాలు", "విరాళాల జాబితా"
        ])) return "YEAR_DONORS";

        // 3. Date-Wise Notes & Reminders
        if (this.has(q, [
            "date wise note", "date note", "show notes", "reminders list", "important notes",
            "తేదీ వారిగా నోట్స్", "గమనికలు", "నోట్స్ చూపించు", "రిమైండర్ జాబితా", "ముఖ్యమైన వివరాలు"
        ])) return "DATE_NOTES";

        // 4. Upcoming Events
        if (this.has(q, [
            "upcoming events", "next events", "future events", "event dates",
            "రాబోయే కార్యక్రమాలు", "తదుపరి కార్యక్రమాలు", "వచ్చే ఈవెంట్లు", "కార్యక్రమాల తేదీలు"
        ])) return "UPCOMING_EVENTS";

        // 5. Basic Greetings
        if (this.has(q, ["hi", "hello", "hey", "namaste", "నమస్కారం", "హాయ్", "నమస్తే", "బాగున్నారా"])) return "GREETING";

        // 6. Balance & Ledger
        if (this.has(q, ["balance", "remaining", "current balance", "మిగిలిన", "బ్యాలెన్స్", "నిల్వ", "లెక్కలు", "నికర"])) return "BALANCE";

        // 7. Individual Devotee Lookup
        if (this.has(q, ["who donated", "donor name", "భక్తుడు", "ఎవరు ఇచ్చారు", "రసీదు", "receipt", "did donate"])) return "DONOR_SEARCH";

        // 8. Food / Annadanam
        if (this.has(q, ["annadanam", "meals", "food distribution", "అన్నదానం", "భోజనం", "ప్రసాదం", "servings"])) return "FOOD";

        // 9. Announcements
        if (this.has(q, ["announcement", "notice", "alert", "ప్రకటన", "ప్రకటనలు", "నోటీసులు"])) return "ANNOUNCEMENTS";

        // 10. Digital FlipBook
        if (this.has(q, ["flipbook", "story", "stories", "album", "ఫ్లిప్ బుక్", "కథలు", "పుస్తకం"])) return "FLIPBOOK";

        // Standard Math & Aggregate Operations
        if (this.has(q, ["how many", "count", "number of", "ఎంత మంది", "ఎన్ని", "ఎంత"])) return "COUNT";
        if (this.has(q, ["total", "sum", "మొత్తం", "మొత్తము", "ఎంత డబ్బు", "సంగ్రహం"])) return "TOTAL";
        if (this.has(q, ["average", "avg", "సగటు"])) return "AVERAGE";
        if (this.has(q, ["highest", "maximum", "max", "top", "అత్యధిక", "గరిష్ట"])) return "MAX";
        if (this.has(q, ["lowest", "minimum", "min", "కనిష్ట", "అత్యల్ప"])) return "MIN";
        if (this.has(q, ["recent", "latest", "new", "ఇటీవలి", "తాజా", "చివరి"])) return "LATEST";
        if (this.has(q, ["pending", "పెండింగ్", "పూర్తి కాలేదు", "బాకీ", "కొనాల్సిన"])) return "PENDING";
        if (this.has(q, ["completed", "finished", "పూర్తయిన", "పూర్తి", "కొన్నవి"])) return "COMPLETED";
        if (this.has(q, ["verified", "వెరిఫైడ్", "ధృవీకరించిన", "ధృవీకరణ"])) return "VERIFIED";

        return "GENERAL";
    },

    detectDomain(text) {
        const q = this.normalizeText(text);

        for (const [table, config] of Object.entries(MusikaTables)) {
            if (config.aliases.some(alias => q.includes(alias.toLowerCase()))) {
                return table;
            }
        }

        if (this.has(q, ["donat", "విరాళ", "చందా", "utr", "donor"])) return "Donations";
        if (this.has(q, ["expense", "spent", "cost", "ఖర్చు", "బిల్లులు", "finance"])) return "FinancialTracker";
        if (this.has(q, ["event", "schedule", "కార్యక్రమం", "ఈవెంట్"])) return "Events";
        if (this.has(q, ["task", "work", "పని", "టాస్క్"])) return "WorkAllocations";
        if (this.has(q, ["food", "meal", "annadanam", "అన్నదానం", "ఆహారం", "ప్రసాదం"])) return "FoodDistribution";
        if (this.has(q, ["grocery", "shopping", "కిరాణా", "సరుకులు"])) return "GroceryList";
        if (this.has(q, ["pooja", "puja", "పూజ", "సామగ్రి"])) return "PoojaItems";
        if (this.has(q, ["reminder", "రిమైండర్"])) return "Reminders";
        if (this.has(q, ["note", "నోట్స్", "గమనిక"])) return "Notes";
        if (this.has(q, ["announcement", "notice", "ప్రకటన", "నోటీసు"])) return "Announcements";
        if (this.has(q, ["assistance", "సహాయం", "సాయం"])) return "FinancialAssistance";
        if (this.has(q, ["repayment", "తిరిగి చెల్లింపు", "చెల్లించిన"])) return "Repayments";
        if (this.has(q, ["story", "cultural", "కథ", "సాంస్కృతిక"])) return "CulturalStories";
        if (this.has(q, ["history", "చరిత్ర", "గత"])) return "FestivalHistory";
        if (this.has(q, ["flipbook", "ఫ్లిప్ బుక్"])) return "FlipBook";

        return "Donations";
    }
};

/* ============================================================
   10.5 VISUAL RESPONSE FORMATTER
============================================================ */
const MusikaResponse = {
    box(title, content) {
        return `
            <div class="bg-amber-950/95 p-3.5 rounded-xl border border-amber-500/40 shadow-lg space-y-2 text-xs">
                <div class="text-amber-300 font-black text-sm flex items-center gap-2 border-b border-amber-500/20 pb-1.5">
                    ${title}
                </div>
                <div class="text-white leading-relaxed">
                    ${content}
                </div>
            </div>
        `;
    },

    list(records, fields = []) {
        if (!records.length) {
            return `<div class="text-amber-200/80 italic py-1">No matching records available.</div>`;
        }

        return records.map((row, index) => {
            const values = fields.map(field => {
                const label = field.charAt(0).toUpperCase() + field.slice(1);
                let val = row[field];
                if ((field.toLowerCase().includes("date") || field.toLowerCase().includes("at")) && val) {
                    val = MusikaAdvancedUtils.date(val);
                } else if (field.toLowerCase().includes("amount") || field.toLowerCase().includes("cost")) {
                    val = MusikaAdvancedUtils.money(val);
                } else {
                    val = MusikaAdvancedUtils.escape(val ?? "-");
                }

                return `
                    <div class="truncate">
                        <span class="text-amber-300/80 font-bold">${MusikaAdvancedUtils.escape(label)}:</span> 
                        <span class="text-amber-100">${val}</span>
                    </div>
                `;
            }).join("");

            return `
                <div class="border-b border-amber-800/40 py-1.5 text-[11px] last:border-b-0">
                    <div class="font-black text-amber-400">#${index + 1}</div>
                    <div class="grid grid-cols-1 sm:grid-cols-2 gap-x-2 gap-y-0.5 mt-0.5">
                        ${values}
                    </div>
                </div>
            `;
        }).join("");
    }
};

/* ============================================================
   10.6 ADVANCED CROSS-TABLE QUERY ENGINE
============================================================ */
const MusikaQueryEngine = {
    execute(rawQuery) {
        const query = MusikaNLP.normalizeText(rawQuery);
        const lang = MusikaLanguage.detect(rawQuery);
        const isTe = lang === "te";
        const intent = MusikaNLP.detectIntent(query);
        const domain = MusikaNLP.detectDomain(query);
        const explicitYear = MusikaNLP.extractYear(query);
        const explicitMonth = MusikaNLP.extractMonth(query);

        const currentActiveYear = (typeof appState !== "undefined" && appState.currentYear !== "all") 
            ? appState.currentYear 
            : null;
        const targetYear = explicitYear || currentActiveYear;
        const yearTag = targetYear ? `(${targetYear})` : `(All Years)`;

        const isAdmin = typeof AuthManager !== "undefined" && AuthManager.isAdmin();
        const records = MusikaAdvancedUtils.getRecords(domain, isAdmin, targetYear, explicitMonth);

        /* ----------------------------------------------------
           1. FULL COMPREHENSIVE ANNUAL REPORT
        ---------------------------------------------------- */
        if (intent === "FULL_REPORT") {
            const donRecords = MusikaAdvancedUtils.getRecords("Donations", isAdmin, targetYear)
                .filter(d => isAdmin || d.status === "Verified");
            const expRecords = MusikaAdvancedUtils.getRecords("FinancialTracker", isAdmin, targetYear);
            const evRecords = MusikaAdvancedUtils.getRecords("Events", isAdmin, targetYear);
            const foodRecords = MusikaAdvancedUtils.getRecords("FoodDistribution", isAdmin, targetYear);

            const totalDon = MusikaAdvancedUtils.total(donRecords, "amount");
            const totalExp = MusikaAdvancedUtils.total(expRecords, "amount");
            const netBalance = totalDon - totalExp;
            const totalMeals = MusikaAdvancedUtils.total(foodRecords, "estimatedServings");

            let html = `
                <div class="bg-amber-950/95 p-4 rounded-xl border-2 border-amber-500/50 shadow-xl space-y-3 text-xs">
                    <div class="border-b border-amber-500/30 pb-2 flex justify-between items-center">
                        <span class="text-amber-300 font-black text-sm">📊 ${isTe ? 'సమగ్ర నివేదిక' : 'Comprehensive Festival Report'} ${yearTag}</span>
                        <span class="bg-amber-500 text-amber-950 font-bold px-2 py-0.5 rounded text-[10px]">${donRecords.length} Donors</span>
                    </div>

                    <div class="grid grid-cols-2 gap-2">
                        <div class="bg-green-950/70 p-2 rounded-lg border border-green-500/30">
                            <p class="text-green-300 font-semibold text-[10px]">${isTe ? 'మొత్తం ఆదాయం' : 'Total Donations'}</p>
                            <p class="text-base font-black text-white">${MusikaAdvancedUtils.money(totalDon)}</p>
                        </div>
                        <div class="bg-red-950/70 p-2 rounded-lg border border-red-500/30">
                            <p class="text-red-300 font-semibold text-[10px]">${isTe ? 'మొత్తం ఖర్చులు' : 'Total Expenses'}</p>
                            <p class="text-base font-black text-white">${MusikaAdvancedUtils.money(totalExp)}</p>
                        </div>
                    </div>

                    <div class="bg-amber-900/40 p-2.5 rounded-lg border border-amber-500/30 flex justify-between items-center">
                        <span class="font-bold text-amber-200">${isTe ? 'నికర నిల్వ (Net Balance):' : 'Surplus / Closing Balance:'}</span>
                        <span class="text-base font-black ${netBalance >= 0 ? 'text-amber-300' : 'text-red-400'}">${MusikaAdvancedUtils.money(netBalance)}</span>
                    </div>

                    <div class="border-t border-amber-800/40 pt-2 grid grid-cols-2 gap-2 text-[11px] text-amber-200">
                        <div>📅 ${isTe ? 'కార్యక్రమాలు' : 'Events'}: <strong>${evRecords.length}</strong></div>
                        <div>🍚 ${isTe ? 'అన్నప్రసాదం' : 'Meals Served'}: <strong>~${totalMeals.toLocaleString('en-IN')}</strong></div>
                    </div>

                    ${evRecords.length ? `
                        <div class="border-t border-amber-800/40 pt-2">
                            <p class="font-bold text-amber-300 text-[11px] mb-1">${isTe ? 'ప్రధాన కార్యక్రమాలు:' : 'Key Event Milestones:'}</p>
                            <ul class="space-y-1 text-[10px] text-amber-100">
                                ${evRecords.slice(0, 3).map(e => `<li>• ${e.title} (${MusikaAdvancedUtils.date(e.eventDate || e.createdAt)})</li>`).join('')}
                            </ul>
                        </div>
                    ` : ''}
                </div>
            `;

            let speech = isTe
                ? `${targetYear || ""} సంవత్సరానికి మొత్తం విరాళాలు ${totalDon} రూపాయలు, ఖర్చులు ${totalExp} రూపాయలు. మిగిలిన నిల్వ ${netBalance} రూపాయలు. మొత్తం ${evRecords.length} కార్యక్రమాలు నిర్వహించబడ్డాయి.`
                : `Annual summary for ${targetYear || "all records"}: Total donations are ${totalDon} rupees, expenses are ${totalExp} rupees, with an available balance of ${netBalance} rupees across ${evRecords.length} events.`;

            return { html, speech };
        }

        /* ----------------------------------------------------
           2. YEAR-WISE & DATE-WISE DONORS LEDGER (READS ALL)
        ---------------------------------------------------- */
        if (intent === "YEAR_DONORS") {
            const donRecords = MusikaAdvancedUtils.getRecords("Donations", isAdmin, targetYear, explicitMonth)
                .filter(d => isAdmin || d.status === "Verified");

            if (!donRecords.length) {
                return {
                    html: MusikaResponse.box(
                        `👥 ${isTe ? 'దాతల వివరాలు' : 'Donors List'} ${yearTag}`,
                        isTe ? `${targetYear || "ఈ"} కాలానికి ధృవీకరించిన విరాళాల రికార్డులు ఏవీ లేవు.` : `No verified donor records found for ${targetYear || "this selection"}.`
                    ),
                    speech: isTe ? "దాతల వివరాలు అందుబాటులో లేవు." : "No donor records found."
                };
            }

            const total = MusikaAdvancedUtils.total(donRecords, "amount");

            // Sort newest to oldest
            const sorted = [...donRecords].sort((a, b) => {
                const da = new Date(b.createdAt || b.date || 0);
                const db = new Date(a.createdAt || a.date || 0);
                return da - db;
            });

            let html = `
                <div class="bg-amber-950/95 p-3.5 rounded-xl border border-amber-500/40 shadow-lg text-xs space-y-2">
                    <div class="flex justify-between items-center border-b border-amber-500/20 pb-1.5">
                        <span class="text-amber-300 font-black text-sm">👥 ${isTe ? 'తేదీ మరియు దాతల వివరాలు' : 'Donations Ledger'} ${yearTag} (${donRecords.length})</span>
                        <span class="text-green-400 font-bold">${MusikaAdvancedUtils.money(total)}</span>
                    </div>
                    <div class="max-h-60 overflow-y-auto space-y-1.5 pr-1">
                        ${sorted.map((d, i) => `
                            <div class="p-2 rounded bg-amber-900/40 border border-amber-800/30 flex justify-between items-center text-[11px]">
                                <div>
                                    <div class="font-bold text-white flex items-center gap-1.5">
                                        <span>${i + 1}.</span> 
                                        <span>${d.donorName || "Anonymous"}</span>
                                    </div>
                                    <div class="text-[10px] text-amber-300/80 mt-0.5">
                                        📅 ${MusikaAdvancedUtils.date(d.createdAt || d.date)} • 💳 ${d.paymentMethod || "Cash"}
                                        ${d.receiptId ? ` • 🧾 #${d.receiptId}` : ''}
                                    </div>
                                </div>
                                <span class="font-black text-green-300 text-sm">${MusikaAdvancedUtils.money(d.amount)}</span>
                            </div>
                        `).join('')}
                    </div>
                </div>
            `;

            // Builds a full spoken list of all donor names, dates, and amounts
            let speech = "";
            if (isTe) {
                speech = `${targetYear || ""} లో మొత్తం ${donRecords.length} మంది దాతల నుండి ${total} రూపాయలు వచ్చాయి. వివరాలు: `;
                speech += sorted.map((d, i) => `${i + 1}. ${d.donorName}, తేదీ ${MusikaAdvancedUtils.date(d.createdAt || d.date)}, మొత్తం ${MusikaAdvancedUtils.number(d.amount)} రూపాయలు`).join('. ');
            } else {
                speech = `For ${targetYear || "all records"}, total donations collected are ${total} rupees from ${donRecords.length} donors. Here is the full list: `;
                speech += sorted.map((d, i) => `${i + 1}. ${d.donorName}, date ${MusikaAdvancedUtils.date(d.createdAt || d.date)}, amount ${MusikaAdvancedUtils.number(d.amount)} rupees`).join('. ');
            }

            return { html, speech };
        }

        /* ----------------------------------------------------
           3. DATE-WISE NOTES & REMINDERS
        ---------------------------------------------------- */
        if (intent === "DATE_NOTES") {
            const notes = MusikaAdvancedUtils.getRecords("Notes", isAdmin, targetYear, explicitMonth);
            const reminders = MusikaAdvancedUtils.getRecords("Reminders", isAdmin, targetYear, explicitMonth);

            if (!notes.length && !reminders.length) {
                return {
                    html: MusikaResponse.box(
                        `📝 ${isTe ? 'నోట్స్ మరియు రిమైండర్లు' : 'Notes & Reminders'} ${yearTag}`,
                        isTe ? "ఈ తేదీకి ఎటువంటి ముఖ్య గమనికలు నమోదు కాలేదు." : "No notes or reminder logs found."
                    ),
                    speech: isTe ? "నోట్స్ ఏవీ లేవు." : "No notes or reminders found."
                };
            }

            let html = `
                <div class="bg-amber-950/95 p-3.5 rounded-xl border border-amber-500/40 shadow-lg text-xs space-y-2">
                    <div class="text-amber-300 font-black text-sm border-b border-amber-500/20 pb-1.5">
                        📝 ${isTe ? 'తేదీ వారీ గమనికలు & రిమైండర్లు' : 'Festival Logs & Notes'} ${yearTag}
                    </div>
                    
                    ${notes.length ? `
                        <div class="space-y-1.5 mb-2">
                            <p class="text-amber-400 font-bold text-[11px]">${isTe ? 'ముఖ్య గమనికలు:' : 'Documented Notes:'}</p>
                            ${notes.slice(0, 4).map(n => `
                                <div class="bg-amber-900/40 p-2 rounded border border-amber-700/30">
                                    <div class="flex justify-between text-[11px] font-bold text-white">
                                        <span>${n.title || "Note"}</span>
                                        <span class="text-amber-300 text-[10px]">${MusikaAdvancedUtils.date(n.createdAt)}</span>
                                    </div>
                                    <p class="text-[10px] text-amber-200/90 mt-1">${n.content || ""}</p>
                                </div>
                            `).join('')}
                        </div>
                    ` : ''}

                    ${reminders.length ? `
                        <div class="space-y-1">
                            <p class="text-amber-400 font-bold text-[11px]">${isTe ? 'రిమైండర్లు:' : 'Active Reminders:'}</p>
                            ${reminders.slice(0, 3).map(r => `
                                <div class="flex justify-between items-center text-[10px] text-amber-100 py-1 border-b border-amber-800/30">
                                    <span>• ${r.title}</span>
                                    <span class="text-amber-300">${MusikaAdvancedUtils.date(r.reminderDate)} ${r.reminderTime || ''}</span>
                                </div>
                            `).join('')}
                        </div>
                    ` : ''}
                </div>
            `;

            let speech = isTe
                ? `తేదీల వారీగా ${notes.length} నోట్స్ మరియు ${reminders.length} రిమైండర్లు ఉన్నాయి.`
                : `There are ${notes.length} notes and ${reminders.length} scheduled reminders.`;

            return { html, speech };
        }

        /* ----------------------------------------------------
           4. UPCOMING FESTIVAL EVENTS
        ---------------------------------------------------- */
        if (intent === "UPCOMING_EVENTS" || domain === "Events") {
            const evRecords = MusikaAdvancedUtils.getRecords("Events", isAdmin, targetYear);
            const now = new Date();
            now.setHours(0, 0, 0, 0);

            const futureEvents = evRecords.filter(e => {
                if (!e.eventDate) return false;
                const ed = new Date(e.eventDate);
                return !isNaN(ed.getTime()) && ed >= now;
            }).sort((a, b) => new Date(a.eventDate) - new Date(b.eventDate));

            const listToShow = futureEvents.length ? futureEvents : evRecords.slice(0, 4);

            return {
                html: MusikaResponse.box(
                    `📅 ${isTe ? 'రాబోయే ఉత్సవ కార్యక్రమాలు' : 'Upcoming Festival Schedule'} ${yearTag}`,
                    futureEvents.length 
                        ? MusikaResponse.list(listToShow, ["title", "eventDate", "time", "location", "status"])
                        : `<p class="text-amber-200/80 mb-2">${isTe ? 'మునుపటి లేదా ప్రస్తుత షెడ్యూల్:' : 'Recent/Current Schedule:'}</p>${MusikaResponse.list(listToShow, ["title", "eventDate", "time", "location"])}`
                ),
                speech: isTe
                    ? (futureEvents.length ? `రాబోయే కార్యక్రమం: ${futureEvents[0].title}. తేదీ: ${MusikaAdvancedUtils.date(futureEvents[0].eventDate)}.` : "రాబోయే కార్యక్రమాలు ఏవీ లేవు.")
                    : (futureEvents.length ? `The next event is ${futureEvents[0].title} on ${MusikaAdvancedUtils.date(futureEvents[0].eventDate)}.` : "No upcoming events scheduled.")
            };
        }

        /* ----------------------------------------------------
           5. GREETING
        ---------------------------------------------------- */
        if (intent === "GREETING") {
            const hr = new Date().getHours();
            const timeGreet = hr < 12 ? (isTe ? "శుభోదయం" : "Good Morning") : (hr < 17 ? (isTe ? "శుభ మధ్యాహ్నం" : "Good Afternoon") : (isTe ? "శుభ సాయంత్రం" : "Good Evening"));
            return {
                html: MusikaResponse.box(
                    `🙏 ${timeGreet}!`,
                    isTe 
                        ? "నేను మూషిక AI ని. విరాళాలు, ఖర్చులు, పనులు, అన్నదానం, తేదీ వారీగా నోట్స్ మరియు పూజా కార్యక్రమాల వివరాలను విశ్లేషించడానికి సిద్ధంగా ఉన్నాను."
                        : "I am Mooshika AI. Ask me about year-wise donors, date-wise logs, expenses, food distribution, tasks, or full annual reports!"
                ),
                speech: isTe 
                    ? `${timeGreet}! నేను మూషిక AI ని. మీకు ఎలాంటి సమాచారం కావాలో అడగండి.`
                    : `${timeGreet}! I am Mooshika AI. How can I assist you with festival records?`
            };
        }

        /* ----------------------------------------------------
           6. FINANCIAL LEDGER / BALANCE
        ---------------------------------------------------- */
        if (intent === "BALANCE") {
            const donTable = MusikaAdvancedUtils.getRecords("Donations", isAdmin, targetYear);
            const validDonations = donTable.filter(d => isAdmin || d.status === "Verified");
            const totalIncome = MusikaAdvancedUtils.total(validDonations, "amount");

            const expTable = MusikaAdvancedUtils.getRecords("FinancialTracker", isAdmin, targetYear);
            const totalExpenses = MusikaAdvancedUtils.total(expTable, "amount");

            const netBalance = totalIncome - totalExpenses;

            return {
                html: MusikaResponse.box(
                    `⚖️ ${isTe ? 'ఆర్థిక నిల్వ వివరాలు' : 'Financial Ledger Balance'} ${yearTag}`,
                    `
                    <div class="space-y-1.5">
                        <div class="flex justify-between items-center text-green-400">
                            <span>${isTe ? 'మొత్తం ఆదాయం:' : 'Total Collections:'}</span>
                            <span class="font-bold">${MusikaAdvancedUtils.money(totalIncome)}</span>
                        </div>
                        <div class="flex justify-between items-center text-red-400">
                            <span>${isTe ? 'మొత్తం ఖర్చులు:' : 'Total Expenditures:'}</span>
                            <span class="font-bold">${MusikaAdvancedUtils.money(totalExpenses)}</span>
                        </div>
                        <div class="border-t border-amber-800 pt-1 flex justify-between items-center text-sm">
                            <span class="text-amber-200 font-bold">${isTe ? 'మిగిలిన నిల్వ:' : 'Net Balance:'}</span>
                            <span class="font-black ${netBalance >= 0 ? 'text-amber-300' : 'text-red-400'}">
                                ${MusikaAdvancedUtils.money(netBalance)}
                            </span>
                        </div>
                    </div>
                    `
                ),
                speech: isTe 
                    ? `${targetYear || ""} సంవత్సరానికి మొత్తం విరాళాలు ${totalIncome} రూపాయలు, ఖర్చులు ${totalExpenses} రూపాయలు. మిగిలిన నిల్వ ${netBalance} రూపాయలు.`
                    : `For ${targetYear || "all records"}, collections are ${totalIncome} rupees and expenses are ${totalExpenses} rupees, leaving ${netBalance} rupees.`
            };
        }

        /* ----------------------------------------------------
           7. DEVOTEE LOOKUP
        ---------------------------------------------------- */
        if (intent === "DONOR_SEARCH") {
            const donTable = MusikaAdvancedUtils.getRecords("Donations", isAdmin, targetYear);
            const searchKeyword = query.replace(/(who|donated|did|devotee|donor|give|receipt|find|search|చూపించు|ఎవరు|విరాళం|ఇచ్చారు)/g, "").trim();

            if (!searchKeyword || searchKeyword.length < 2) {
                return {
                    html: MusikaResponse.box(
                        "🔎 Devotee Lookup",
                        isTe ? "దయచేసి భక్తుని పేరు లేదా రసీదు సంఖ్యను పేర్కొనండి." : "Please specify a devotee name, phone number, or receipt ID."
                    ),
                    speech: isTe ? "దయచేసి భక్తుని పేరు స్పష్టంగా తెలపండి." : "Please mention the devotee name or receipt number."
                };
            }

            const matches = donTable.filter(d => 
                MusikaAdvancedUtils.text(d.donorName).includes(searchKeyword) ||
                MusikaAdvancedUtils.text(d.receiptId).includes(searchKeyword) ||
                MusikaAdvancedUtils.text(d.phone).includes(searchKeyword)
            );

            if (!matches.length) {
                return {
                    html: MusikaResponse.box(
                        "🔎 Devotee Lookup",
                        isTe ? `"${searchKeyword}" పేరుతో ఎలాంటి రికార్డులు లభించలేదు.` : `No donation records found matching "${searchKeyword}".`
                    ),
                    speech: isTe ? `క్షమించండి, ${searchKeyword} పేరుతో రికార్డులు లేవు.` : `No records found for ${searchKeyword}.`
                };
            }

            return {
                html: MusikaResponse.box(
                    `🔎 Devotee Matches (${matches.length})`,
                    MusikaResponse.list(matches.slice(0, 5), ["donorName", "amount", "receiptId", "paymentMethod", "status"])
                ),
                speech: isTe 
                    ? `${matches[0].donorName} పేరిట ${matches[0].amount} రూపాయల రికార్డు ఉంది.`
                    : `Found ${matches.length} matching donations. The latest entry is ${matches[0].donorName} for ${matches[0].amount} rupees.`
            };
        }

        /* ----------------------------------------------------
           8. FOOD DISTRIBUTION / ANNADANAM
        ---------------------------------------------------- */
        if (intent === "FOOD" || domain === "FoodDistribution") {
            const foodRecords = MusikaAdvancedUtils.getRecords("FoodDistribution", isAdmin, targetYear);
            if (!foodRecords.length) {
                return {
                    html: MusikaResponse.box("🍚 Food Distribution", isTe ? "అన్నదాన వివరాలు నమోదు కాలేదు." : "No food distribution entries logged."),
                    speech: isTe ? "అన్నదానం వివరాలు అందుబాటులో లేవు." : "No food distribution records found."
                };
            }

            const latestMeal = foodRecords[0];
            const totalServings = MusikaAdvancedUtils.total(foodRecords, "estimatedServings");

            return {
                html: MusikaResponse.box(
                    `🍚 ${isTe ? 'అన్నప్రసాదం నివేదిక' : 'Annadanam Summary'} ${yearTag}`,
                    `
                    <div class="space-y-1">
                        <div><strong>Total Recorded Servings:</strong> ~${totalServings.toLocaleString('en-IN')}</div>
                        <div class="mt-2 text-amber-300 font-bold border-t border-amber-800/40 pt-1">Latest Distribution:</div>
                        ${MusikaResponse.list([latestMeal], ["mealType", "foodItem", "estimatedServings", "sponsorName", "distributionDate"])}
                    </div>
                    `
                ),
                speech: isTe 
                    ? `అన్నప్రసాదం పంపిణీ ద్వారా సుమారు ${totalServings} మందికి భోజనం అందించబడింది. తాజా అంశం: ${latestMeal.foodItem || latestMeal.mealType}.`
                    : `Food distribution accounts for approximately ${totalServings} servings. Latest meal item is ${latestMeal.foodItem || latestMeal.mealType}.`
            };
        }

        /* ----------------------------------------------------
           9. STATISTICAL SUM / TOTAL
        ---------------------------------------------------- */
        if (intent === "TOTAL") {
            let numField = MusikaTables[domain]?.numeric?.[0] || "amount";
            if (domain === "Repayments") numField = "amountPaid";
            if (domain === "PoojaItems") numField = "estimatedCost";
            if (domain === "GroceryList") numField = "totalAmount";

            const total = MusikaAdvancedUtils.total(records, numField);
            return {
                html: MusikaResponse.box(
                    `💰 Total ${domain} ${yearTag}`,
                    `Total (${numField}): <strong>${MusikaAdvancedUtils.money(total)}</strong> across ${records.length} entries.`
                ),
                speech: isTe 
                    ? `${domain} మొత్తం విలువ ${total} రూపాయలు.`
                    : `The total for ${domain} is ${total} rupees.`
            };
        }

        /* ----------------------------------------------------
           10. RECORD COUNT
        ---------------------------------------------------- */
        if (intent === "COUNT") {
            return {
                html: MusikaResponse.box(
                    `📊 ${domain} Count ${yearTag}`,
                    `Total entries: <strong>${records.length}</strong> records logged.`
                ),
                speech: isTe 
                    ? `${domain} లో మొత్తం ${records.length} రికార్డులు ఉన్నాయి.`
                    : `There are ${records.length} records in ${domain}.`
            };
        }

        /* ----------------------------------------------------
           11. PENDING / COMPLETED FILTERS
        ---------------------------------------------------- */
        if (intent === "PENDING") {
            const pending = records.filter(row => {
                const vals = [row.status, row.isCompleted, row.isPurchased].map(v => MusikaAdvancedUtils.text(v));
                return vals.includes("pending") || vals.includes("false") || vals.includes("not completed") || vals.includes("not purchased");
            });

            return {
                html: MusikaResponse.box(
                    `⏳ Pending ${domain} ${yearTag}`,
                    `
                    <div class="mb-1 text-amber-200">Pending count: <strong>${pending.length}</strong></div>
                    ${MusikaResponse.list(pending.slice(0, 5), Object.keys(pending[0] || {}).slice(0, 5))}
                    `
                ),
                speech: isTe 
                    ? `${pending.length} పెండింగ్ రికార్డులు ఉన్నాయి.`
                    : `There are ${pending.length} pending items in ${domain}.`
            };
        }

        /* ----------------------------------------------------
           12. UNIVERSAL FALLBACK SEARCH
        ---------------------------------------------------- */
        let crossMatches = [];
        for (const tbl of Object.keys(MusikaTables)) {
            const tRecords = MusikaAdvancedUtils.getRecords(tbl, isAdmin, targetYear);
            const hits = MusikaAdvancedUtils.search(tRecords, Object.keys(tRecords[0] || {}), query);
            if (hits.length) {
                crossMatches.push({ table: tbl, records: hits.slice(0, 3) });
            }
        }

        if (crossMatches.length) {
            let combinedHtml = "";
            crossMatches.forEach(grp => {
                combinedHtml += `
                    <div class="mb-3 border-b border-amber-800/40 pb-2 last:border-b-0">
                        <div class="text-amber-300 font-bold mb-1">📂 ${grp.table} (${grp.records.length})</div>
                        ${MusikaResponse.list(grp.records, Object.keys(grp.records[0] || {}).slice(0, 4))}
                    </div>
                `;
            });

            return {
                html: MusikaResponse.box(`🔎 Search Matches ${yearTag}`, combinedHtml),
                speech: isTe 
                    ? `${crossMatches.length} విభాగాల్లో సమాచారం లభించింది.`
                    : `Found matching entries across ${crossMatches.length} categories.`
            };
        }

        // Final General Summary
        const allDon = MusikaAdvancedUtils.getRecords("Donations", isAdmin, targetYear).filter(d => isAdmin || d.status === "Verified");
        const allExp = MusikaAdvancedUtils.getRecords("FinancialTracker", isAdmin, targetYear);
        const donSum = MusikaAdvancedUtils.total(allDon, "amount");
        const expSum = MusikaAdvancedUtils.total(allExp, "amount");

        return {
            html: MusikaResponse.box(
                `🌸 Festival Overview ${yearTag}`,
                `
                <div class="grid grid-cols-2 gap-2 text-[11px] mb-2">
                    <div class="bg-amber-900/40 p-1.5 rounded border border-amber-600/30">
                        <span class="text-green-300 font-bold">Donations:</span> ${MusikaAdvancedUtils.money(donSum)}
                    </div>
                    <div class="bg-amber-900/40 p-1.5 rounded border border-amber-600/30">
                        <span class="text-red-300 font-bold">Expenses:</span> ${MusikaAdvancedUtils.money(expSum)}
                    </div>
                </div>
                <div class="text-amber-200 text-[11px]">
                    Net Balance: <strong>${MusikaAdvancedUtils.money(donSum - expSum)}</strong>
                </div>
                `
            ),
            speech: isTe 
                ? `స్వర్ణ గణపతి ఉత్సవాల్లో ${donSum} రూపాయల విరాళాలు మరియు ${expSum} రూపాయల ఖర్చులు నమోదయ్యాయి.`
                : `Festival records show ${donSum} rupees in donations and ${expSum} rupees in expenses.`
        };
    }
};

/* ============================================================
   10.7 ADVANCED CHUNKED VOICE SPEECH ENGINE
============================================================ */
let speechQueue = [];
let isSpeaking = false;

window.speakAIResponse = function(rawText) {
    if (!("speechSynthesis" in window)) return;
    window.stopAIaudio();

    const clean = String(rawText || "")
        .replace(/<[^>]*>/g, " ")
        .replace(/[\u{1F600}-\u{1F64F}|\u{1F300}-\u{1F5FF}|\u{1F680}-\u{1F6FF}|\u{2600}-\u{26FF}|\u{2700}-\u{27BF}]/gu, "")
        .replace(/[#*`_~₹]/g, "")
        .replace(/\s+/g, " ")
        .trim();

    if (!clean) return;

    // Split long text into bite-sized sentence chunks (prevents browser TTS timeout)
    const chunks = clean.match(/[^.!?]+[.!?]+|[^.!?]+$/g) || [clean];
    speechQueue = chunks.map(c => c.trim()).filter(Boolean);

    const isTe = MusikaLanguage.isTelugu(clean) || (typeof appState !== "undefined" && appState.lang === "te");
    const voices = window.speechSynthesis.getVoices();
    let selectedVoice = null;

    if (isTe) {
        selectedVoice = voices.find(v => v.lang && v.lang.toLowerCase().startsWith("te")) ||
                       voices.find(v => v.lang && v.lang.toLowerCase().includes("te-in")) ||
                       voices.find(v => v.lang && v.lang.toLowerCase().startsWith("hi")) ||
                       voices[0];
    } else {
        selectedVoice = voices.find(v => v.lang && (v.lang.toLowerCase() === "en-in" || v.lang.toLowerCase() === "en-gb")) ||
                       voices.find(v => v.lang && v.lang.toLowerCase().startsWith("en")) ||
                       voices[0];
    }

    function playNextChunk() {
        if (!speechQueue.length) {
            isSpeaking = false;
            return;
        }

        isSpeaking = true;
        const currentSentence = speechQueue.shift();
        const utter = new SpeechSynthesisUtterance(currentSentence);
        
        utter.voice = selectedVoice;
        utter.lang = isTe ? "te-IN" : "en-IN";
        utter.rate = 0.95;
        utter.pitch = 1.0;
        utter.volume = 1.0;

        utter.onend = () => {
            playNextChunk();
        };

        utter.onerror = (e) => {
            console.warn("TTS chunk error:", e);
            playNextChunk();
        };

        window.speechSynthesis.speak(utter);
    }

    playNextChunk();
};

window.stopAIaudio = function() {
    speechQueue = [];
    isSpeaking = false;
    if ("speechSynthesis" in window) {
        window.speechSynthesis.cancel();
    }
};
/* ============================================================
   10.8 SPEECH RECOGNITION (STT)
============================================================ */
window.startVoiceRecognition = function() {
    const SpeechRec = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRec) {
        if (typeof showToast === "function") showToast("Voice recognition not supported in browser", "warning");
        return;
    }

    const rec = new SpeechRec();
    const isTe = typeof appState !== "undefined" && appState.lang === "te";
    rec.lang = isTe ? "te-IN" : "en-IN";
    rec.continuous = false;
    rec.interimResults = false;
    rec.maxAlternatives = 1;

    rec.onstart = () => {
        document.getElementById("voice-pulse")?.classList.remove("hidden");
    };
    rec.onend = () => {
        document.getElementById("voice-pulse")?.classList.add("hidden");
    };
    rec.onerror = (e) => {
        console.warn("STT Error:", e.error);
        document.getElementById("voice-pulse")?.classList.add("hidden");
    };
    rec.onresult = (e) => {
        const q = e.results?.[0]?.[0]?.transcript || "";
        const inp = document.getElementById("chat-input");
        if (inp) inp.value = q;
        if (q.trim()) sendChatMessage();
    };

    try {
        rec.start();
    } catch (err) {
        console.warn(err);
    }
};

/* ============================================================
   10.9 CHAT INTERACTION CONTROLLER
============================================================ */
window.toggleChat = function() {
    const box = document.getElementById("chat-box");
    if (box) box.classList.toggle("hidden");
};

function addMooshikaMessage(msg, type = "ai") {
    const chat = document.getElementById("chat-messages");
    if (!chat) return;

    const d = document.createElement("div");
    d.className = type === "user"
        ? "bg-amber-500 text-amber-950 p-2.5 rounded-lg ml-6 font-semibold shadow text-xs"
        : "bg-amber-900/90 text-white p-2.5 rounded-lg mr-4 border border-amber-500/30 shadow text-xs";

    if (type === "user") {
        d.textContent = msg;
    } else {
        d.innerHTML = msg;
    }

    chat.appendChild(d);
    chat.scrollTop = chat.scrollHeight;
}

function sendChatMessage() {
    const inp = document.getElementById("chat-input");
    const q = inp ? inp.value.trim() : "";
    if (!q) return;

    addMooshikaMessage(q, "user");
    if (inp) inp.value = "";

    const thinkingId = "musika-thinking-" + Date.now();
    addMooshikaMessage(`
        <div id="${thinkingId}" class="flex items-center gap-2 text-amber-200">
            <span>🧠</span><span>Mooshika AI is thinking...</span>
        </div>
    `, "ai");

    setTimeout(() => {
        document.getElementById(thinkingId)?.remove();
        try {
            const res = MusikaQueryEngine.execute(q);
            addMooshikaMessage(res.html, "ai");
            if (res.speech) window.speakAIResponse(res.speech);

            if (typeof saveAIConversation === "function") {
                saveAIConversation(q, res.speech || "");
            }
        } catch (err) {
            console.error("Mooshika Engine Failure:", err);
            addMooshikaMessage(`<div class="text-red-300">⚠️ Internal error processing Mooshika AI query.</div>`, "ai");
        }
    }, 200);
}

function clearChatHistory() {
    const chat = document.getElementById("chat-messages");
    if (chat) chat.innerHTML = "";
    window.stopAIaudio();
    if (typeof showToast === "function") showToast("Chat cleared", "info");
}

function getDynamicGreeting(lang) {
    const hr = new Date().getHours();
    const greet = hr < 12 ? (lang === "te" ? "శుభోదయం" : "Good Morning") : (hr < 17 ? (lang === "te" ? "శుభ మధ్యాహ్నం" : "Good Afternoon") : (lang === "te" ? "శుభ సాయంత్రం" : "Good Evening"));
    return lang === "te"
        ? `🙏 **${greet}!** నేను మూషిక AI ని. విరాళాలు, ఖర్చులు లేదా పూజా విశేషాల గురించి నన్ను ఏదైనా అడగండి.`
        : `🙏 **${greet}!** I am Mooshika AI. Ask me about donations, expenses, food distribution, or festival events!`;
}

/* ============================================================
   10.10 GLOBAL SCOPE EXPORTS
============================================================ */
window.MusikaAI = {
    query: MusikaQueryEngine.execute,
    speak: window.speakAIResponse,
    stopSpeech: window.stopAIaudio,
    voice: window.startVoiceRecognition,
    clearChat: clearChatHistory,
    tables: MusikaTables
};

window.sendChatMessage = sendChatMessage;
window.clearChatHistory = clearChatHistory;
window.getDynamicGreeting = getDynamicGreeting;
/* ============================================================
   11. UI MODALS & NOTIFICATIONS
============================================================ */
function showModal(id) { document.getElementById(id)?.classList.remove('hidden'); }
function hideModal(id) { document.getElementById(id)?.classList.add('hidden'); }

function showToast(msg, type = 'success') {
    const c = document.getElementById("toast-container");
    if (!c) return;
    const t = document.createElement("div");
    const bg = type === 'error' ? 'bg-red-600' : (type === 'warning' ? 'bg-yellow-600' : 'bg-green-600');
    t.className = `toast-enter px-4 py-2.5 rounded-lg shadow-xl text-white font-bold text-xs flex items-center gap-2 ${bg}`;
    t.innerHTML = `<span>${msg}</span>`;
    c.appendChild(t);
    setTimeout(() => { t.remove(); }, 3500);
}

function formatDate(iso) {
    if (!iso || iso === '-') return '-';
    const d = new Date(iso);
    if (isNaN(d.getTime())) return iso;
    return `${String(d.getDate()).padStart(2, '0')}-${String(d.getMonth()+1).padStart(2, '0')}-${d.getFullYear()}`;
}

/* ============================================================
   12. ATTACH TO WINDOW SCOPE (PREVENTS INLINE ONCLICK ERRORS)
============================================================ */
window.renderTableView = renderTableView;
window.deleteRecord = deleteRecord;
window.verifyDonation = verifyDonation;
window.openRecordModal = openRecordModal;
window.saveRecord = saveRecord;
window.filterCurrentTable = filterCurrentTable;
window.handleYearChange = handleYearChange;
window.generateUPIQRCode = generateUPIQRCode;
window.confirmUPIPayment = confirmUPIPayment;
window.openFlipbook = openFlipbook;
window.closeFlipbook = closeFlipbook;
window.turnPage = turnPage;
window.nextSlide = nextSlide;
window.prevSlide = prevSlide;
window.showModal = showModal;
window.hideModal = hideModal;
window.setLanguage = setLanguage;
window.handleLogin = handleLogin;
window.logout = logout;
window.calculateInterest = calculateInterest;
window.sendChatMessage = sendChatMessage;
window.clearChatHistory = clearChatHistory;
window.showAdminSection = showAdminSection;

/* ============================================================
   13. UI ACTION LISTENERS & STARTUP
============================================================ */
document.addEventListener("DOMContentLoaded", () => {
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('service-worker.js').catch(() => {});
    }

    document.getElementById("chat-input")?.addEventListener("keydown", (e) => {
        if (e.key === "Enter") { e.preventDefault(); sendChatMessage(); }
    });

    document.addEventListener("click", (e) => {
        let btn = e.target;
        while (btn && btn !== document && !btn.getAttribute('data-action')) {
            btn = btn.parentNode;
        }
        if (!btn || btn === document) return;
        
        const action = btn.getAttribute('data-action');
        const target = btn.getAttribute('data-target');

        if (action === 'showModal') showModal(target);
        if (action === 'hideModal') hideModal(target);
        if (action === 'switchModal') { hideModal(btn.getAttribute('data-from')); showModal(btn.getAttribute('data-to')); }
        if (action === 'handleLogin') handleLogin(btn.getAttribute('data-type'));
        if (action === 'logout') logout();
        if (action === 'setLangTe') setLanguage('te');
        if (action === 'setLangEn') setLanguage('en');
        if (action === 'generateUPI') generateUPIQRCode();
        if (action === 'confirmUPI') confirmUPIPayment();
        if (action === 'showAdminSection') showAdminSection(btn.getAttribute('data-section'));
        if (action === 'openRecordModal') openRecordModal(btn.getAttribute('data-id'));
        if (action === 'saveRecord') saveRecord();
        if (action === 'toggleChat') window.toggleChat();
        if (action === 'clearChat') clearChatHistory();
        if (action === 'sendChat') sendChatMessage();
        if (action === 'startVoice') window.startVoiceRecognition();
        if (action === 'stopVoice') window.stopAIaudio();
        if (action === 'openFlipbook') openFlipbook();
        if (action === 'closeFlipbook') closeFlipbook();
        if (action === 'flipbookNext') turnPage(1);
        if (action === 'flipbookPrev') turnPage(-1);
        if (action === 'prevSlide') prevSlide();
        if (action === 'nextSlide') nextSlide();
        if (action === 'calculateInterest') calculateInterest();
    });

    const yearHTML = '<option value="all">All Years</option>' + 
        Array.from({ length: 27 }, (_, i) => 2026 - i).map(y => `<option value="${y}">${y}</option>`).join('');
    
    ['global-year-filter', 'public-year-filter', 'section-flipbook-year', 'finance-year'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.innerHTML = yearHTML;
    });

    setLanguage(appState.lang);
    initializeApp();
});

window.addEventListener('online', () => {
    showToast("Internet restored! Reconnecting...", "success");
    initializeApp();
});

window.addEventListener('offline', () => {
    showToast("You are offline. Showing cached information.", "warning");
});

console.log("Swarna Ganapathi Platform v9.0.6 Loaded.");
