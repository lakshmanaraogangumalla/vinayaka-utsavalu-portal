/* Paste the NEW secured Google Apps Script web-app /exec URL here. */
window.COMMUNITY_CONFIG = Object.freeze({ apiUrl: "https://script.google.com/macros/s/AKfycbya3d3axp4YY3Abf9W5GvntCNX8F9l6HVUXv86MLuv3cY98QTYQdeLJmzC1ucoZEhnk/exec" });


/* Shared, dependency-free accounting: loaded by browser and copied into Code.gs. */
const CommunityCore = (() => {
    const num = v => { const n = Number(String(v ?? '').replace(/,/g, '')); return Number.isFinite(n) ? n : 0; };
    const cents = v => Math.round(num(v) * 100);
    const yes = v => v === true || /^(true|yes|1|purchased|paid)$/i.test(String(v));
    const live = r => !r.deletedAt && !/^(rejected|cancelled|inactive|draft)$/i.test(String(r.status));
    const year = r => String(r.financialYear || r.year || r.date || r.paymentDate || r.issueDate || r.eventDate || r.distributionDate || r.createdAt || '').slice(0,4);
    function report(db, target) {
      const rows = t => (db[t] || []).filter(live);
      const entries = [];
      const add = (r, bucket, amount, category, table) => entries.push({year: year(r), bucket, cents:cents(amount), category, table, id:r.id, date:r.donationDate||r.purchaseDate||r.paymentDate||r.issueDate||r.date||r.createdAt, description:r.donorName||r.itemName||r.personName||r.description||category});
      const ledgers = rows('FinancialTracker');
      const sourceBuckets = {Donations:'donations', GroceryList:'expenses', PoojaItems:'expenses', FinancialAssistance:'assistance', Repayments:'repayments'};
      rows('Donations').filter(r => r.status === 'Verified').forEach(r => add(r,'donations',r.amount,'Donations','Donations'));
      rows('GroceryList').filter(r => yes(r.isPurchased)).forEach(r => add(r,'expenses',r.totalAmount !== '' && r.totalAmount != null ? r.totalAmount : num(r.quantity)*num(r.unitPrice),'Groceries','GroceryList'));
      rows('PoojaItems').filter(r => yes(r.isPurchased)).forEach(r => add(r,'expenses',r.actualCost,'Pooja','PoojaItems'));
      rows('FinancialAssistance').filter(r => /^(paid|disbursed|active|completed)$/i.test(String(r.status))).forEach(r => add(r,'assistance',r.amount,'Assistance','FinancialAssistance'));
      rows('Repayments').filter(r => r.status !== 'Pending').forEach(r => add(r,'repayments',r.amountPaid,'Repayments','Repayments'));
      const warnings=[];
      ledgers.forEach(r => {
        if (r.sourceTable || r.sourceId) {
          const linked = entries.find(e=> e.table===r.sourceTable && String(e.id)===String(r.sourceId));
          if (linked) {
            if (linked.cents!==cents(r.amount) || linked.year!==year(r)) warnings.push('Linked ledger differs from source: '+r.id);
            return; // Authoritative source is counted once.
          }
          if (sourceBuckets[r.sourceTable]) { warnings.push('Unresolved or unpaid source: '+r.id); return; }
        }
        const income = /^(income|interest|ఆదాయం|వడ్డీ)$/i.test(String(r.type));
        const expense = /^(expense|ఖర్చు)$/i.test(String(r.type));
        if (!income && !expense) {warnings.push('Ledger type missing or unknown: '+r.id); return;}
        add(r,income?'otherIncome':'expenses',r.amount,r.category || 'Other','FinancialTracker');
      });
      const seeds=rows('FestivalHistory').filter(r=>r.openingBalance!=='' && r.openingBalance!=null && /^\d{4}$/.test(year(r))).sort((a,b)=>year(a).localeCompare(year(b)));
      const baseline=seeds[0]; const start=baseline?year(baseline):'0000';
      const valid=entries.filter(e=>/^\d{4}$/.test(e.year)&&e.year>=start);
      entries.filter(e=>!/^\d{4}$/.test(e.year)).forEach(e=>warnings.push('Record has no year: '+e.table+'/'+e.id));
      const all=String(target)==='all'; const selected=valid.filter(e=>all||e.year===String(target));
      const signed=e=>['expenses','assistance'].includes(e.bucket)?-e.cents:e.cents;
      let opening=baseline && (all || String(target)>=start)?cents(baseline.openingBalance):0;
      if(!all) opening+=valid.filter(e=>e.year<String(target)).reduce((s,e)=>s+signed(e),0);
      const result={financialYear:String(target),openingBalance:opening/100,donations:0,otherIncome:0,expenses:0,assistance:0,repayments:0,categories:{},warnings};
      for(const bucket of ['donations','otherIncome','expenses','assistance','repayments']) result[bucket]=selected.filter(e=>e.bucket===bucket).reduce((s,e)=>s+e.cents,0)/100;
      selected.filter(e=>e.bucket==='expenses').forEach(e=>result.categories[e.category]=(result.categories[e.category]||0)+e.cents);
      Object.keys(result.categories).forEach(k=>result.categories[k]/=100);
      result.closingBalance=(opening+selected.reduce((s,e)=>s+signed(e),0))/100;
      result.totalDonations=result.donations; result.totalExpenses=result.expenses;
      result.assistanceOutstanding=valid.filter(e=>all||e.year<=String(target)).reduce((s,e)=>s+(e.bucket==='assistance'?e.cents:e.bucket==='repayments'?-e.cents:0),0)/100;
      result.entries=selected;
      return result;
    }
    return {num,yes,live,year,report};
  })();
  if(typeof module!=='undefined') module.exports=CommunityCore;
  

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
        token: safeGetSession('vcs_token', null),
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
            // Tokens remain in this tab only.
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
const API_URL = window.COMMUNITY_CONFIG?.apiUrl || "";

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
    if (!API_URL) throw new Error("Set your updated Apps Script URL in config.js first.");
    // navigator.onLine is only a hint; let fetch determine actual connectivity.
    
    const payload = { 
        action, 
        sessionToken: AuthManager.state.token, 
        ...payloadData 
    };

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 45000);
    try {
        const response = await fetch(API_URL, { 
            method: 'POST', signal: controller.signal, 
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
                adminDataCache = {};
                document.getElementById("chat-messages")?.replaceChildren();
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
    } finally { clearTimeout(timeout); }
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

const SAFE_PUBLIC_TABLES = ["Donations", "Banners", "Events", "FoodDistribution", "CulturalStories", "FestivalHistory", "FlipBook", "Announcements", "AIKnowledge"];

/* ============================================================
   4. TRANSLATIONS (I18N)
============================================================ */
const i18n = {
    en: {
        pageTitle: "Swarna Ganapathi Swami - Community", navBanners: "Banners", navEvents: "Events", navDonations: "Donations", navFlipbook: "FlipBook Archive",
        loginBtn: "Login", adminBtn: "Admin", logoutBtn: "Logout", drumRat: "Drum (🥁)", fluteRat: "Flute (🪈)", prayRat: "Pray 🙏",
        appTitle: "Vinayaka Seva - Festival Portal", tagline2: "Live Information Portal for Sri Vinayaka Chavithi",
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
    document.getElementById("chat-messages")?.replaceChildren();
    document.getElementById("dynamic-table-body")?.replaceChildren();
    document.getElementById("financial-metrics-container")?.replaceChildren();
    loadPublicData();
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
        // Private records are never persisted in browser storage.
        
        const yearFilterEl = document.getElementById('global-year-filter');
        if (yearFilterEl) yearFilterEl.value = appState.currentYear;

        renderDashboardMetrics();
        renderFinancialDashboard();
        feedFinancialData();
    } catch (err) {
        const offline = null;
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
   7. PUBLIC DATA & VIEWS (BULLETPROOF UNIFIED DATA PIPELINE)
============================================================ */

const PUBLIC_TABLE_WHITELIST = ["Donations", "Banners", "Events", "FoodDistribution", "CulturalStories", "FestivalHistory", "FlipBook", "Announcements", "AIKnowledge"];

const STRIPPED_PUBLIC_KEYS = [
    "id",
    "passwordhash",
    "sessiontoken",
    "updatedat",
    "deletedat",
    "verifiedby",
    "phone",
    "email",
    "token",
    "createdby",
    "updatedby"
];

async function loadPublicData() {
    const tbody = document.getElementById("public-table-body");
    if (tbody) {
        tbody.innerHTML = `<tr><td class="p-6 text-center text-amber-300 font-bold" colspan="100%"><i class="fas fa-spinner fa-spin mr-2"></i> Fetching records from database...</td></tr>`;
    }

    try {
        const res = await apiCall('getPublicData');
        
        // Unpack response payload cleanly
        if (res && res.data && typeof res.data === "object") {
            publicDataCache = res.data;
        } else if (res && typeof res === "object") {
            publicDataCache = res;
        } else {
            publicDataCache = {};
        }

        safeSetLocal('offline_public_data_v10', JSON.stringify(publicDataCache));
        
        bindPublicFilterListeners();
        populatePublicTableDropdown();
        renderPublicTable();
        
        if (typeof renderCarousel === "function") {
            renderCarousel(publicDataCache.Banners || []);
        }
        if (typeof renderFlipbookArchiveSection === "function") {
            renderFlipbookArchiveSection();
        }
        if (typeof feedFinancialData === "function") {
            feedFinancialData();
        }
    } catch (err) {
        console.warn("[Public Data Load Exception]:", err.message);
        const cached = safeGetLocal('offline_public_data_v10', null);
        if (cached) {
            publicDataCache = SafeUtils.parseJSON(cached, {});
            bindPublicFilterListeners();
            populatePublicTableDropdown();
            renderPublicTable();
            if (typeof renderCarousel === "function") {
                renderCarousel(publicDataCache.Banners || []);
            }
            if (typeof renderFlipbookArchiveSection === "function") {
                renderFlipbookArchiveSection();
            }
            if (typeof feedFinancialData === "function") {
                feedFinancialData();
            }
        } else if (tbody) {
            tbody.innerHTML = `<tr><td class="p-6 text-center text-red-400 font-bold" colspan="100%">Unable to retrieve records. Verify your Web App URL.</td></tr>`;
        }
    }
}

function bindPublicFilterListeners() {
    const selector = document.getElementById("public-table-selector");
    const yearFilter = document.getElementById("public-year-filter");

    if (selector && !selector.dataset.bound) {
        selector.dataset.bound = "true";
        selector.addEventListener("change", () => renderPublicTable());
    }
    if (yearFilter && !yearFilter.dataset.bound) {
        yearFilter.dataset.bound = "true";
        yearFilter.addEventListener("change", () => renderPublicTable());
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

    const currentVal = selector.value;
    
    // Fill all tables permanently so none disappear
    selector.innerHTML = PUBLIC_TABLE_WHITELIST.map(tbl => `<option value="${tbl}">${tbl}</option>`).join('');

    if (currentVal && PUBLIC_TABLE_WHITELIST.includes(currentVal)) {
        selector.value = currentVal;
    } else {
        selector.value = "Donations";
    }
}

function renderPublicTable() {
    const selector = document.getElementById("public-table-selector");
    const yearFilter = document.getElementById("public-year-filter");
    const thead = document.getElementById("public-table-head");
    const tbody = document.getElementById("public-table-body");

    if (!selector || !yearFilter || !thead || !tbody) return;

    const tableKey = selector.value || "Donations";
    const selectedYear = String(yearFilter.value || "all").trim();

    // Pull records directly or case-insensitively
    let records = [];
    if (publicDataCache && typeof publicDataCache === 'object') {
        if (Array.isArray(publicDataCache[tableKey])) {
            records = [...publicDataCache[tableKey]];
        } else {
            const foundKey = Object.keys(publicDataCache).find(k => k.toLowerCase() === tableKey.toLowerCase());
            if (foundKey && Array.isArray(publicDataCache[foundKey])) {
                records = [...publicDataCache[foundKey]];
            }
        }
    }

    // Comprehensive Year Filter
    if (selectedYear !== "all") {
        records = records.filter(item => {
            if (!item || typeof item !== "object") return false;

            // Check financialYear or year fields
            const rawYear = String(item.financialYear || item.year || "").trim();
            if (rawYear && (rawYear === selectedYear || rawYear.includes(selectedYear))) return true;

            // Check date fields
            const rawDate = String(item.createdAt || item.date || item.eventDate || item.distributionDate || "").trim();
            if (rawDate) {
                if (rawDate.includes(selectedYear)) return true;
                const parsedDate = new Date(rawDate);
                if (!isNaN(parsedDate.getTime()) && parsedDate.getFullYear().toString() === selectedYear) {
                    return true;
                }
            }
            return false;
        });
    }

    if (records.length === 0) {
        thead.innerHTML = `<tr><th class="p-4 text-center border-b border-amber-500/30 text-amber-300">Notice</th></tr>`;
        tbody.innerHTML = `<tr><td class="p-6 text-center text-amber-200 font-bold">No records found for ${tableKey} in ${selectedYear === "all" ? "All Years" : selectedYear}.</td></tr>`;
        return;
    }

    // Clean keys and extract column headers
    const firstRow = records[0];
    const keys = Object.keys(firstRow).filter(k => !STRIPPED_PUBLIC_KEYS.includes(k.toLowerCase()));

    if (keys.length === 0) {
        thead.innerHTML = `<tr><th class="p-4 text-center border-b border-amber-500/30 text-amber-300">Notice</th></tr>`;
        tbody.innerHTML = `<tr><td class="p-6 text-center text-amber-200">No public display columns available.</td></tr>`;
        return;
    }

    thead.innerHTML = `
        <tr class="bg-amber-950/80 text-amber-300 text-xs uppercase font-black tracking-wider">
            ${keys.map(k => `<th class="p-3.5 border-b border-amber-500/30 text-left whitespace-nowrap">${SafeUtils.escapeHTML(k)}</th>`).join('')}
        </tr>
    `;

    tbody.innerHTML = records.map(r => {
        const cells = keys.map(k => {
            let val = r[k] !== undefined && r[k] !== null && r[k] !== "" ? r[k] : "-";
            const lk = k.toLowerCase();

            // Format dates
            if ((lk.includes("date") || lk.includes("at")) && val !== "-") {
                val = formatDate(val);
            }
            // Format amounts / numbers
            else if ((lk.includes("amount") || lk.includes("cost") || lk.includes("balance") || lk.includes("price")) && !isNaN(val) && val !== "-") {
                val = `₹${parseFloat(val).toLocaleString("en-IN")}`;
            }
            // Status badges
            else if (lk === "status") {
                const s = String(val).toLowerCase();
                if (s === "verified" || s === "active" || s === "completed") {
                    val = `<span class="bg-green-600/30 text-green-400 px-2 py-0.5 rounded text-xs font-bold">${SafeUtils.escapeHTML(val)}</span>`;
                } else if (s === "pending") {
                    val = `<span class="bg-yellow-600/30 text-yellow-400 px-2 py-0.5 rounded text-xs font-bold">${SafeUtils.escapeHTML(val)}</span>`;
                } else {
                    val = `<span class="bg-red-600/30 text-red-400 px-2 py-0.5 rounded text-xs font-bold">${SafeUtils.escapeHTML(val)}</span>`;
                }
            }
            // Image URLs
            else if (lk.includes("image") && String(val).startsWith("http")) {
                val = `<a href="${SafeUtils.escapeHTML(val)}" target="_blank" class="text-amber-400 hover:underline font-bold inline-flex items-center gap-1"><i class="fas fa-image"></i> View</a>`;
            } else {
                val = SafeUtils.escapeHTML(val);
            }

            return `<td class="p-3 text-xs text-amber-100 whitespace-nowrap max-w-[280px] truncate" title="${SafeUtils.escapeHTML(r[k] || '')}">${val}</td>`;
        }).join('');

        return `<tr class="hover:bg-amber-900/30 transition border-b border-amber-800/30">${cells}</tr>`;
    }).join('');
}

let slideIndex = 0;
let carouselTimer = null;
function renderCarousel(banners) {
    const track = document.getElementById('carousel-track');
    if (!track) return;
    const active = (banners || []).filter(b => b.status === "Active" || !b.status);
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

function nextSlide() { 
    const track = document.getElementById('carousel-track'); 
    if (track && track.children.length) { 
        slideIndex = (slideIndex + 1) % track.children.length; 
        track.style.transform = `translateX(-${slideIndex * 100}%)`; 
    } 
}

function prevSlide() { 
    const track = document.getElementById('carousel-track'); 
    if (track && track.children.length) { 
        slideIndex = (slideIndex - 1 + track.children.length) % track.children.length; 
        track.style.transform = `translateX(-${slideIndex * 100}%)`; 
    } 
}

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
        await apiCall('add', { 
            sheetName: 'Donations', 
            data: { 
                donorName: name, 
                phone: phone, 
                amount: amount, 
                paymentMethod: 'UPI', 
                utrNumber: utr, 
                status: 'Pending', publicConsent: document.getElementById('donor-public-consent')?.checked || false
            } 
        });
        showToast("Payment submitted for verification!"); 
        document.getElementById("upi-qr-box")?.classList.replace("flex", "hidden"); 
    } catch(e) {
        showToast(e.message || "Submission failed", "error");
    } finally {
        if (btn) { btn.disabled = false; btn.innerText = "Submit Verification"; }
    }
}

// Global attachments
window.renderPublicTable = renderPublicTable;
window.populatePublicTableDropdown = populatePublicTableDropdown;
window.loadPublicData = loadPublicData;
window.bindPublicFilterListeners = bindPublicFilterListeners;
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
            if (!SAFE_PUBLIC_TABLES.includes(tableName)) return [];
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
        const lang = appState.lang;
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
        d.innerHTML = window.DOMPurify ? DOMPurify.sanitize(msg) : SafeUtils.escapeHTML(msg);
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
    t.textContent = String(msg);
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
    // Service worker registration is handled by the v12 update controller.

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
        Array.from({ length: new Date().getFullYear() - 1999 }, (_, i) => new Date().getFullYear() - i).map(y => `<option value="${y}">${y}</option>`).join('');
    
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

console.log("Swarna Ganapathi Platform v19.0 Loaded.");
document.addEventListener("change", (e) => {
    if (e.target && (e.target.id === "public-year-filter" || e.target.id === "public-table-selector")) {
        renderPublicTable();
    }
});

/* v10: preserve the existing UI; extend its controllers before DOMContentLoaded. */
'use strict';
const AdvancedUI = {
  te: {
    Users:'వినియోగదారులు',Banners:'బ్యానర్లు',Donors:'దాతలు',Donations:'విరాళాలు',Events:'కార్యక్రమాలు',WorkAllocations:'పని కేటాయింపులు',FoodDistribution:'అన్నదానం',FinancialTracker:'ఆర్థిక లావాదేవీలు',FinancialAssistance:'ఆర్థిక సహాయం',Repayments:'తిరిగి చెల్లింపులు',PoojaItems:'పూజా సామగ్రి',GroceryList:'కిరాణా జాబితా',Notes:'గమనికలు',Reminders:'గుర్తుచేయింపులు',CulturalStories:'కథలు, మంత్రాలు',AIKnowledge:'సహాయకుని జ్ఞానం',FestivalHistory:'వార్షిక నివేదికలు',FlipBook:'ఫ్లిప్‌బుక్',Announcements:'ప్రకటనలు',AISettings:'సహాయకుని సెట్టింగులు',AuditLogs:'చర్యల చరిత్ర',AIConversations:'సంభాషణలు',
    id:'రికార్డు గుర్తింపు',name:'పేరు',phone:'ఫోన్',email:'ఇమెయిల్',role:'పాత్ర',title:'శీర్షిక',description:'వివరణ',imageUrl:'చిత్రం లింక్',financialYear:'సంవత్సరం',status:'స్థితి',createdAt:'సృష్టించిన తేదీ',updatedAt:'మార్చిన తేదీ',deletedAt:'తొలగించిన తేదీ',receiptId:'రసీదు సంఖ్య',donorName:'దాత పేరు',amount:'మొత్తం',paymentMethod:'చెల్లింపు విధానం',utrNumber:'లావాదేవీ సంఖ్య',category:'వర్గం',notes:'గమనికలు',verifiedBy:'ధృవీకరించినవారు',eventDate:'కార్యక్రమ తేదీ',time:'సమయం',location:'స్థలం',taskName:'పని పేరు',assignedTo:'బాధ్యులు',dueDate:'గడువు తేదీ',priority:'ప్రాధాన్యత',distributionDate:'అన్నదానం తేదీ',mealType:'భోజన రకం',foodItem:'వంటకం',estimatedServings:'భోజనాల సంఖ్య',totalDishCost:'వంటకం ఖర్చు',costPerServing:'ఒక్కరికి ఖర్చు',sponsorName:'ప్రాయోజకుడు',date:'తేదీ',type:'రకం',subCategory:'ఉప వర్గం',vendorName:'విక్రేత పేరు',invoiceNumber:'బిల్లు సంఖ్య',paymentMode:'చెల్లింపు విధానం',personName:'వ్యక్తి పేరు',issueDate:'సహాయం ఇచ్చిన తేదీ',assistanceId:'సహాయం గుర్తింపు',amountPaid:'చెల్లించిన మొత్తం',paymentDate:'చెల్లించిన తేదీ',dayNumber:'రోజు సంఖ్య',itemName:'వస్తువు పేరు',quantity:'పరిమాణం',unit:'కొలమానం',estimatedCost:'అంచనా ఖర్చు',actualCost:'వాస్తవ ఖర్చు',isPurchased:'కొనుగోలు చేశారా',usedForDish:'వంటకం కోసం',unitPrice:'ఒక్కదాని ధర',totalAmount:'మొత్తం ధర',vendor:'విక్రేత',content:'విషయం',pinned:'ముఖ్య గమనిక',author:'రచయిత',reminderDate:'గుర్తుచేయు తేదీ',reminderTime:'గుర్తుచేయు సమయం',isCompleted:'పూర్తయిందా',storyText:'కథ లేదా మంత్రం',summary:'సారాంశం',language:'భాష',openingBalance:'ప్రారంభ నిల్వ',totalDonations:'మొత్తం విరాళాలు',totalExpenses:'మొత్తం ఖర్చులు',closingBalance:'ముగింపు నిల్వ',pageNumber:'పేజీ సంఖ్య',message:'సందేశం',startDate:'ప్రారంభ తేదీ',endDate:'ముగింపు తేదీ',question:'ప్రశ్న',answer:'జవాబు',keywords:'ముఖ్య పదాలు',visibility:'ఎవరికి కనిపించాలి',publicConsent:'దాత పేరు బహిరంగంగా చూపవచ్చా',donationDate:'విరాళం తేదీ',purchaseDate:'కొనుగోలు తేదీ',sourceTable:'మూల పట్టిక',sourceId:'మూల రికార్డు గుర్తింపు',village:'గ్రామం',settingKey:'సెట్టింగ్ పేరు',settingValue:'సెట్టింగ్ విలువ',timestamp:'సమయం',action:'చర్య',sheetName:'పట్టిక',recordId:'రికార్డు గుర్తింపు',details:'వివరాలు',userId:'వినియోగదారు గుర్తింపు',
    Public:'బహిరంగం',Private:'వ్యక్తిగతం',Active:'సక్రియం',Inactive:'నిష్క్రియం',Pending:'పెండింగ్',Verified:'ధృవీకరించబడింది',Rejected:'తిరస్కరించబడింది',Paid:'చెల్లించబడింది',Disbursed:'సహాయం ఇచ్చారు',Completed:'పూర్తయింది',Income:'ఆదాయం',Expense:'ఖర్చు',Interest:'వడ్డీ',true:'అవును',false:'కాదు',
    donations:'విరాళాలు',otherIncome:'ఇతర ఆదాయం / వడ్డీ',expenses:'కొనుగోలు, ఇతర ఖర్చులు',assistance:'ఇచ్చిన ఆర్థిక సహాయం',repayments:'అందిన తిరిగి చెల్లింపులు',assistanceOutstanding:'తిరిగి రావలసిన సహాయం',Groceries:'కిరాణా',Pooja:'పూజ',Other:'ఇతర',
    add:'కొత్త రికార్డు',edit:'మార్చు',delete:'తొలగించు',save:'భద్రపరచు',empty:'రికార్డులు లేవు',all:'అన్ని సంవత్సరాలు',report:'వార్షిక ఆర్థిక నివేదిక',export:'CSV డౌన్‌లోడ్',private:'ఈ సమాచారం నిర్వాహకులకు మాత్రమే అందుబాటులో ఉంది.',unmatched:'దీనికి సరిపోయే సమాచారం లేదు. దాత పేరు, సంవత్సరం, కార్యక్రమం లేదా కథ పేరు అడగండి.',draft:'వివరాలు పరిశీలించి భద్రపరచండి.',fresh:'చివరిగా సమకాలీకరించిన సమయం',offline:'ఆఫ్‌లైన్‌లో భద్రపరచిన బహిరంగ సమాచారం మాత్రమే అందుబాటులో ఉంది.',next:'తదుపరి',previous:'మునుపటి',upcoming:'రాబోయే కార్యక్రమాలు',anonymous:'అజ్ఞాత దాత'
  },
  label(k) {
    if(appState.lang==='te') {
      if(this.te[k]) return this.te[k];
      if(/(En|Te)$/.test(k)) return this.label(k.slice(0,-2)) + (k.endsWith('Te')?' (తెలుగు)':' (ఆంగ్లం)');
    }
    return String(k).replace(/([a-z])([A-Z])/g,'$1 $2').replace(/^./,c=>c.toUpperCase());
  },
  text(r,k) {const localized=r[k+(appState.lang==='te'?'Te':'En')];return localized!==undefined&&localized!==null&&localized!==''?localized:(r[k]??'');},
  money(v){return new Intl.NumberFormat(appState.lang==='te'?'te-IN-u-nu-latn':'en-IN',{style:'currency',currency:'INR',maximumFractionDigits:2}).format(CommunityCore.num(v));},
  number(v){return new Intl.NumberFormat(appState.lang==='te'?'te-IN-u-nu-latn':'en-IN').format(v);},
  date(v){if(v===null||v===undefined||String(v).trim()==='')return '—';const d=new Date(v);if(isNaN(d.getTime())||d.getFullYear()<2000)return '—';return new Intl.DateTimeFormat(appState.lang==='te'?'te-IN-u-nu-latn':'en-IN',{dateStyle:'medium',timeZone:'Asia/Kolkata'}).format(d);},
  image(v){try{const u=new URL(v);return u.protocol==='https:'?u.href:'';}catch{return '';}},
  esc:SafeUtils.escapeHTML
};
const READ_ONLY_TABLES=['Users','AuditLogs','AIConversations'];
TABLE_SCHEMAS.Users=TABLE_SCHEMAS.Users.filter(k=>k!=='passwordHash');
Object.assign(TABLE_SCHEMAS,{AIKnowledge:['id','category','question','answer','keywords','visibility','questionEn','questionTe','answerEn','answerTe','status'],AISettings:['id','settingKey','settingValue','description'],AuditLogs:['id','timestamp','action','sheetName','recordId','details','userId'],AIConversations:['id','question','answer','language','createdAt']});
for(const table of ['Banners','Events','CulturalStories','FlipBook','Announcements']) TABLE_SCHEMAS[table].push('visibility','titleEn','titleTe',...(table==='CulturalStories'||table==='FlipBook'?['storyTextEn','storyTextTe']:['descriptionEn','descriptionTe']));
TABLE_SCHEMAS.FoodDistribution.push('visibility');
TABLE_SCHEMAS.Donations.push('donationDate','publicConsent');
TABLE_SCHEMAS.FinancialTracker.push('sourceTable','sourceId');
TABLE_SCHEMAS.GroceryList.push('purchaseDate');TABLE_SCHEMAS.PoojaItems.push('purchaseDate');
for(const table of ['Notes','Reminders','CulturalStories','FoodDistribution','FinancialTracker','Repayments','GroceryList','PoojaItems','FestivalHistory']) if(!TABLE_SCHEMAS[table].includes('status'))TABLE_SCHEMAS[table].push('status');
try {['offline_admin_data','offline_public_data','vcs_token_backup'].forEach(k=>localStorage.removeItem(k));}catch{}

function reportResult(year) {
 if(AuthManager.isAdmin())return CommunityCore.report(adminDataCache,year);
 const reports=publicDataCache.FestivalHistory||[];
 if(year!=='all')return reports.find(r=>String(r.financialYear)===String(year))||null;
 if(!reports.length)return null;
 const sorted=[...reports].sort((a,b)=>String(a.financialYear).localeCompare(String(b.financialYear)));
 const r={financialYear:'all',openingBalance:sorted[0].openingBalance,closingBalance:sorted.at(-1).closingBalance};
 for(const k of ['totalDonations','totalExpenses','otherIncome','assistance','repayments'])r[k]=reports.reduce((s,v)=>s+CommunityCore.num(v[k]),0);
 return r;
}
function reportHTML(r) {
 if(!r)return '<p>'+AdvancedUI.label('empty')+'</p>';
 const fields=['openingBalance','totalDonations','otherIncome','totalExpenses','assistance','repayments','closingBalance'];
 return '<div class="advanced-report">'+fields.map(k=>'<div><span>'+AdvancedUI.label(k)+'</span><strong>'+AdvancedUI.money(r[k])+'</strong></div>').join('')+'</div>'+(r.categories?'<p>'+Object.entries(r.categories).map(([k,v])=>AdvancedUI.esc(AdvancedUI.label(k))+': '+AdvancedUI.money(v)).join(' · ')+'</p>':'')+(r.warnings?.length?'<p role="status">'+AdvancedUI.esc(r.warnings.join('; '))+'</p>':'');
}
renderFinancialDashboard=function(){const el=document.getElementById('financial-metrics-container');if(el)el.innerHTML=reportHTML(reportResult(appState.currentYear))+'<button class="advanced-button" onclick="exportAnnualReport()">'+AdvancedUI.label('export')+'</button>';};
renderDashboardMetrics=function(){const el=document.getElementById('admin-dashboard-section');if(el)el.innerHTML=reportHTML(reportResult(appState.currentYear));};
window.exportAnnualReport=function(){
 const r=reportResult(appState.currentYear);if(!r)return;
 const cell=v=>'"'+String(v??'').replace(/^[=+@-]/,"'" ).replace(/"/g,'""')+'"';
 const data=[['Year','Metric','INR'],...['openingBalance','totalDonations','otherIncome','totalExpenses','assistance','repayments','closingBalance'].map(k=>[r.financialYear,k,r[k]])];
 const blob=new Blob(['\ufeff'+data.map(row=>row.map(cell).join(',')).join('\r\n')],{type:'text/csv;charset=utf-8'});
 const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download='committee-report-'+r.financialYear+'.csv';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
};
renderAdminSidebar=function(){const el=document.getElementById('admin-table-buttons');if(!el)return;el.replaceChildren();Object.keys(TABLE_SCHEMAS).forEach(table=>{const b=document.createElement('button');b.className='advanced-nav';b.textContent=AdvancedUI.label(table);b.onclick=()=>renderTableView(table);el.append(b);});};
function rowCell(row,key){
 const td=document.createElement('td');td.className='px-4 py-3';let v=AdvancedUI.text(row,key);
 if(/imageUrl/.test(key)&&AdvancedUI.image(v)){const img=document.createElement('img');img.src=AdvancedUI.image(v);img.alt=AdvancedUI.text(row,'title');img.loading='lazy';img.className='advanced-thumbnail';img.onerror=()=>{img.replaceWith(document.createTextNode(AdvancedUI.label('empty')));};td.append(img);return td;}
 if(/^(date|.*Date|createdAt|updatedAt)$/.test(key)&&v)v=AdvancedUI.date(v);
 else if(/amount|cost|price|balance|totalDonations|totalExpenses|otherIncome|assistance$|repayments$/i.test(key)&&v!==''&&!isNaN(v))v=AdvancedUI.money(v);
 else if(['status','visibility','isPurchased','isCompleted','pinned','publicConsent','type'].includes(key))v=AdvancedUI.label(String(row[key]));
 td.textContent=v===''?'—':String(v);return td;
}
renderTableView=function(table){
 if(!AuthManager.isAdmin()||!TABLE_SCHEMAS[table])return;
 currentTableName=table;showAdminSection('table');
 const title=document.getElementById('current-table-title');if(title)title.textContent=AdvancedUI.label(table);
 const head=document.getElementById('dynamic-table-head'),body=document.getElementById('dynamic-table-body');if(!head||!body)return;
 const keys=TABLE_SCHEMAS[table].filter(k=>!['deletedAt','passwordHash'].includes(k));
 head.innerHTML='<tr>'+keys.map(k=>'<th class="px-4 py-3">'+AdvancedUI.label(k)+'</th>').join('')+'<th></th></tr>';body.replaceChildren();
 const rows=(adminDataCache[table]||[]).filter(r=>appState.currentYear==='all'||CommunityCore.year(r)===String(appState.currentYear));
 rows.forEach(row=>{const tr=document.createElement('tr');keys.forEach(k=>tr.append(rowCell(row,k)));const td=document.createElement('td');
 if(!READ_ONLY_TABLES.includes(table))for(const [key,fn] of [['edit',()=>openRecordModal(row.id)],['delete',()=>deleteRecord(table,row.id)]]){const b=document.createElement('button');b.textContent=AdvancedUI.label(key);b.className='advanced-button';b.onclick=fn;td.append(b);}
 if(table==='Donations'&&row.status!=='Verified'){const b=document.createElement('button');b.textContent=AdvancedUI.label('Verified');b.onclick=()=>verifyDonation(row.id);td.append(b);}
 tr.append(td);body.append(tr);});if(!rows.length)body.innerHTML='<tr><td>'+AdvancedUI.label('empty')+'</td></tr>';
};
openRecordModal=function(id=null){
 if(!AuthManager.isAdmin()||READ_ONLY_TABLES.includes(currentTableName))return showToast(AdvancedUI.label('private'),'warning');
 currentEditId=id;const r=(adminDataCache[currentTableName]||[]).find(v=>String(v.id)===String(id))||{};
 const el=document.getElementById('crud-form-fields');if(!el)return;el.replaceChildren();
 document.getElementById('crud-modal-title').textContent=AdvancedUI.label(id?'edit':'add')+' · '+AdvancedUI.label(currentTableName);
 const readonly=['id','createdAt','updatedAt','deletedAt','verifiedBy','receiptId','totalAmount','costPerServing'];
 for(const k of TABLE_SCHEMAS[currentTableName]){
 if(readonly.includes(k))continue;
 const wrap=document.createElement('div');wrap.className='advanced-field';const label=document.createElement('label');label.htmlFor='crud-field-'+k;label.textContent=AdvancedUI.label(k);wrap.append(label);
 let options=null;
 if(k==='visibility')options=['Private','Public'];
 if(k==='status')options=currentTableName==='Donations'?['Pending','Verified','Rejected']:currentTableName==='FinancialAssistance'?['Pending','Disbursed','Completed','Inactive']:['Active','Pending','Completed','Inactive'];
 if(['isPurchased','isCompleted','pinned','publicConsent'].includes(k))options=['false','true'];
 if(k==='type'&&currentTableName==='FinancialTracker')options=['Expense','Income','Interest'];
 if(k==='sourceTable')options=['','Donations','GroceryList','PoojaItems','FinancialAssistance','Repayments'];
 let input=document.createElement(options?'select':/content|description|storyText|answer|notes|message/i.test(k)?'textarea':'input');
 if(options)options.forEach(v=>{const o=document.createElement('option');o.value=v;o.textContent=v?AdvancedUI.label(v):'—';input.append(o);});
 if(input.tagName==='INPUT')input.type=/Date$|^date$/.test(k)?'date':/amount|cost|price|quantity|financialYear|pageNumber|dayNumber|Servings|balance/i.test(k)?'number':'text';
 if(input.type==='number'){input.step=/financialYear|Number/.test(k)?'1':'0.01';if(!/balance/i.test(k))input.min=k==='financialYear'?'2000':'0';if(k==='financialYear')input.max='2099';}
 input.id='crud-field-'+k;input.className='advanced-input';
 const defaultValue=k==='financialYear'?(appState.currentYear==='all'?new Date().getFullYear():appState.currentYear):options?options[0]:'';
 input.value=r[k]??defaultValue;if(input.type==='date')input.value=String(input.value).slice(0,10);
 wrap.append(input);el.append(wrap);
 }
 showModal('crud-modal');
};
const oldSaveRecord=saveRecord;
saveRecord=async function(){if(!AuthManager.isAdmin())return;const fields=[...document.querySelectorAll('#crud-form-fields input')];if(fields.some(el=>!el.reportValidity()))return;await oldSaveRecord();await loadPublicData();};
deleteRecord=async function(table,id){if(!AuthManager.isAdmin()||!confirm(appState.lang==='te'?'ఈ రికార్డును తొలగించాలా?':'Move this record to trash?'))return;try{await apiCall('softDelete',{sheetName:table,id});await loadAdminDashboard();renderTableView(table);await loadPublicData();}catch(e){showToast(e.message,'error');}};
populatePublicTableDropdown=function(){const el=document.getElementById('public-table-selector');if(!el)return;const value=el.value;el.innerHTML=PUBLIC_TABLE_WHITELIST.map(k=>'<option value="'+k+'">'+AdvancedUI.label(k)+'</option>').join('');el.value=PUBLIC_TABLE_WHITELIST.includes(value)?value:'Donations';};
renderPublicTable=function(){
 const table=document.getElementById('public-table-selector')?.value||'Donations',year=document.getElementById('public-year-filter')?.value||'all';
 const head=document.getElementById('public-table-head'),body=document.getElementById('public-table-body');if(!head||!body)return;
 if(!PUBLIC_TABLE_WHITELIST.includes(table)){head.replaceChildren();body.replaceChildren();return;}
 const rows=(publicDataCache[table]||[]).filter(r=>year==='all'||CommunityCore.year(r)===year);
 const keys=[...new Set(rows.flatMap(r=>Object.keys(r)))].filter(k=>!STRIPPED_PUBLIC_KEYS.includes(k.toLowerCase())&&!/(En|Te)$/.test(k));
 head.innerHTML='<tr>'+keys.map(k=>'<th class="p-3">'+AdvancedUI.label(k)+'</th>').join('')+'</tr>';body.replaceChildren();
 rows.forEach(r=>{const tr=document.createElement('tr');keys.forEach(k=>tr.append(rowCell(r,k)));body.append(tr);});if(!rows.length)body.innerHTML='<tr><td>'+AdvancedUI.label('empty')+'</td></tr>';
};
renderCarousel=function(banners){
 const track=document.getElementById('carousel-track');if(!track)return;clearInterval(carouselTimer);slideIndex=0;track.style.transform='translateX(0)';track.replaceChildren();
 banners.filter(CommunityCore.live).forEach(b=>{const slide=document.createElement('div');slide.className='min-w-full h-full relative flex-shrink-0';const url=AdvancedUI.image(b.imageUrl);
 if(url){const img=document.createElement('img');img.src=url;img.alt=AdvancedUI.text(b,'title');img.className='w-full h-full object-cover opacity-80';img.onerror=()=>img.remove();slide.append(img);}
 const caption=document.createElement('div');caption.className='advanced-caption';const h=document.createElement('h3');h.textContent=AdvancedUI.text(b,'title');const p=document.createElement('p');p.textContent=AdvancedUI.text(b,'description');caption.append(h,p);slide.append(caption);track.append(slide);});
 if(!track.children.length)track.textContent=AdvancedUI.label('empty');else if(track.children.length>1&&!matchMedia('(prefers-reduced-motion: reduce)').matches)carouselTimer=setInterval(nextSlide,6000);
};
let advancedPage=0;
renderTurnJsBook=function(){
 const el=document.getElementById('flipbook');if(!el)return;
 el.className='advanced-book';el.style.width='min(88vw, 380px)';el.style.height='min(65vh, 500px)';el.replaceChildren();
 const p=flipbookPages[advancedPage];if(!p)return;
 const heading=document.createElement('h3');heading.textContent=AdvancedUI.text(p,'title');el.append(heading);
 if(AdvancedUI.image(p.imageUrl)){const img=document.createElement('img');img.src=AdvancedUI.image(p.imageUrl);img.alt=AdvancedUI.text(p,'title');img.onerror=()=>img.remove();el.append(img);}
 const content=document.createElement('p');content.textContent=AdvancedUI.text(p,'storyText');el.append(content);
 const counter=document.createElement('small');counter.textContent=AdvancedUI.number(advancedPage+1)+' / '+AdvancedUI.number(flipbookPages.length);el.append(counter);
};
openFlipbook=function(yearOverride){const year=typeof yearOverride==='string'?yearOverride:document.getElementById('public-year-filter')?.value||'all';const cache=AuthManager.isAdmin()?adminDataCache:publicDataCache;flipbookPages=(cache.FlipBook||[]).filter(r=>CommunityCore.live(r)&&(year==='all'||CommunityCore.year(r)===year)).sort((a,b)=>CommunityCore.year(a).localeCompare(CommunityCore.year(b))||Number(a.pageNumber)-Number(b.pageNumber));if(!flipbookPages.length)return showToast(AdvancedUI.label('empty'),'info');advancedPage=0;showModal('flipbook-modal');renderTurnJsBook();};
turnPage=function(dir){advancedPage=Math.max(0,Math.min(flipbookPages.length-1,advancedPage+dir));renderTurnJsBook();};
closeFlipbook=function(){hideModal('flipbook-modal');};
renderFlipbookArchiveSection=function(){const grid=document.getElementById('flipbook-cards-grid');if(!grid)return;grid.replaceChildren();const cache=AuthManager.isAdmin()?adminDataCache:publicDataCache;const filter=document.getElementById('section-flipbook-year')?.value||'all';const pages=(cache.FlipBook||[]).filter(r=>CommunityCore.live(r)&&(filter==='all'||CommunityCore.year(r)===filter));
 [...new Set(pages.map(CommunityCore.year))].sort().reverse().forEach(y=>{const b=document.createElement('button');b.className='advanced-book-cover';b.textContent=AdvancedUI.label('FlipBook')+' '+y+' · '+AdvancedUI.number(pages.filter(p=>CommunityCore.year(p)===y).length);b.onclick=()=>openFlipbook(y);grid.append(b);});if(!pages.length)grid.textContent=AdvancedUI.label('empty');};
const QUERY_ALIASES={
 Donations:['donation','donations','donor','donors','donaname','చందా','విరాళ','దాత'],
 FinancialAssistance:['financial assistance','assistance','loan','సహాయం'],Repayments:['repayment','repayments','తిరిగి చెల్లింపు'],
 GroceryList:['grocery','groceries','grocerr','కిరాణా','సరుకులు'],PoojaItems:['pooja','puja','పూజా సామగ్రి','పూజ వస్తువు'],
 FinancialTracker:['ledger','expense','expenses','ఖర్చు','లావాదేవీ'],Events:['event','events','upcoming','కార్యక్రమ','రాబోయే'],
 CulturalStories:['story','stories','mantra','mantram','mataram','కథ','మంత్ర'],Notes:['note','notes','గమనిక','నోట్స్'],
 Banners:['banner','banners','బ్యానర్'],FlipBook:['flipbook','flip book','ఫ్లిప్'],FoodDistribution:['food','prasadam','అన్నదానం','ప్రసాదం'],
 WorkAllocations:['work','task','పని'],Reminders:['reminder','గుర్తు'],Announcements:['announcement','ప్రకటన'],AIKnowledge:['knowledge','జ్ఞానం'],Users:['users','user details','వినియోగదారు'],AISettings:['settings'],AuditLogs:['audit'],AIConversations:['conversations']};
const normalizeQuery=q=>String(q).replace(/[౦-౯]/g,c=>String(c.charCodeAt(0)-0x0C66)).toLowerCase().trim();
function queryDomain(q){return Object.keys(QUERY_ALIASES).find(t=>QUERY_ALIASES[t].some(a=>/^[a-z ]+$/.test(a)?new RegExp('\\b'+a+'\\b').test(q):q.includes(a)))||null;}
function queryReply(text){return {html:'<p>'+AdvancedUI.esc(text)+'</p>',speech:text};}
MusikaQueryEngine.execute=function(raw){
 const q=normalizeQuery(raw),admin=AuthManager.isAdmin(),db=admin?adminDataCache:publicDataCache;
 const year=(q.match(/\b20\d{2}\b/)||[])[0]||(/this year|ఈ సంవత్సరం/.test(q)?String(new Date().getFullYear()):(appState.currentYear!=='all'?appState.currentYear:'all'));
 const domain=queryDomain(q);
 const isAdd=/^(add|create|new)\b|జోడించు|చేర్చు/.test(q),isEdit=/^(edit|update)\b|సవరించు|మార్చు/.test(q),isDelete=/^(delete|remove)\b|తొలగించు/.test(q);
 if(isAdd||isEdit||isDelete){
   if(!admin)return queryReply(AdvancedUI.label('private'));
   if(!domain||READ_ONLY_TABLES.includes(domain))return queryReply(appState.lang==='te'?'పట్టిక పేరు చెప్పండి. ఉదాహరణ: కిరాణా జోడించు.':'Name an editable table, for example: add groceries.');
   currentTableName=domain;
   if(isAdd){openRecordModal();const yf=document.getElementById('crud-field-financialYear');if(yf&&year!=='all')yf.value=year;return queryReply(AdvancedUI.label('draft'));}
   const id=(raw.match(/\bREC_[\w-]+\b/)||[])[0];const record=(db[domain]||[]).find(r=>String(r.id)===id);
   if(!record){renderTableView(domain);return queryReply(appState.lang==='te'?'మార్చాల్సిన రికార్డును పట్టికలో ఎంచుకోండి.':'Select the exact record in the table to edit or delete.');}
   if(isEdit)openRecordModal(id);else {renderTableView(domain);return queryReply(appState.lang==='te'?'తొలగింపు కోసం రికార్డు పక్కన తొలగించు నొక్కండి.':'Use Delete beside record '+id+' and confirm the deletion.');}
   return queryReply(AdvancedUI.label('draft'));
 }
 if(domain&&!admin&&!PUBLIC_TABLE_WHITELIST.includes(domain)){
   // Public visitors may see expense totals, but never expense records.
   if(domain!=='FinancialTracker')return queryReply(AdvancedUI.label('private'));
 }
 if(/report|summary|balance|నివేదిక|నిల్వ|మిగిలిన/.test(q)||domain==='FinancialTracker'&&!/ledger|లావాదేవీ/.test(q)){
   const r=reportResult(year);if(!r)return queryReply(AdvancedUI.label('empty'));
   return {html:'<strong>'+AdvancedUI.label('report')+' '+(year==='all'?AdvancedUI.label('all'):year)+'</strong>'+reportHTML(r),speech:['openingBalance','totalDonations','otherIncome','totalExpenses','assistance','repayments','closingBalance'].map(k=>AdvancedUI.label(k)+' '+AdvancedUI.money(r[k])).join('. ')};
 }
 if(domain&&!admin&&!PUBLIC_TABLE_WHITELIST.includes(domain))return queryReply(AdvancedUI.label('private'));
 const tables=domain?[domain]:Object.keys(db).filter(t=>Array.isArray(db[t])&&(admin||PUBLIC_TABLE_WHITELIST.includes(t))&&!['Users','AuditLogs','AISettings','AIConversations'].includes(t));
 let results=[];
 const indiaDay=v=>{const d=new Date(v);return isNaN(d)?'':new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Kolkata',year:'numeric',month:'2-digit',day:'2-digit'}).format(d);};
 const today=indiaDay(new Date());
 const dateOf=(r,t)=>t==='Events'?r.eventDate:t==='Donations'?r.donationDate||r.date||r.createdAt:r.purchaseDate||r.paymentDate||r.issueDate||r.date||r.createdAt;
 let term=q.replace(/\b20\d{2}\b/g,'').replace(/\b(tell|show|give|details|from|me|the|all|list|name|names|amount|amounts|and|of|in|for|please|this|year|today|recent|latest|upcoming|next|total|how|much|is)\b/g,'');
 Object.values(QUERY_ALIASES).flat().sort((a,b)=>b.length-a.length).forEach(a=>{term=term.replaceAll(a,' ');});
 term=term.replace(/చెప్పు|చూపించు|పేర్లు|పేరు|మొత్తాలు|మొత్తం|ఈ సంవత్సరం|ఈరోజు|ఇవాళ|ఎంత|అన్ని|వివరాలు/g,' ').replace(/[?,.!]/g,' ').replace(/\s+/g,' ').trim();
 for(const table of tables){
 let rows=(db[table]||[]).filter(CommunityCore.live).filter(r=>year==='all'||CommunityCore.year(r)===String(year));
 if(table==='Donations')rows=rows.filter(r=>r.status==='Verified');
 if(['GroceryList','PoojaItems'].includes(table)&&/expense|spent|ఖర్చు/.test(q))rows=rows.filter(r=>CommunityCore.yes(r.isPurchased));
 if(/today|ఈరోజు|ఇవాళ/.test(q))rows=rows.filter(r=>indiaDay(dateOf(r,table))===today);
 if(/upcoming|next|రాబోయే/.test(q)&&table==='Events')rows=rows.filter(r=>String(r.eventDate).slice(0,10)>=today).sort((a,b)=>String(a.eventDate).localeCompare(String(b.eventDate)));
 if(/recent|latest|ఇటీవల/.test(q))rows.sort((a,b)=>String(dateOf(b,table)).localeCompare(String(dateOf(a,table))));
 if(term)rows=rows.filter(r=>Object.values(r).some(v=>normalizeQuery(v).includes(term)));
 // For questions, match curated knowledge by words even if word order differs.
 if(table==='AIKnowledge'&&!rows.length){const words=q.split(/\s+/).filter(w=>w.length>2);rows=(db[table]||[]).filter(r=>words.filter(w=>normalizeQuery([r.question,r.questionTe,r.questionEn,r.keywords].join(' ')).includes(w)).length>=Math.min(2,words.length));}
 if(rows.length)results.push({table,rows});
 }
 if(!results.length)return queryReply(AdvancedUI.label('unmatched'));
 let html='',speech=[];
 results.forEach(({table,rows})=>{
 const numeric=table==='Donations'?'amount':table==='GroceryList'?'totalAmount':table==='PoojaItems'?'actualCost':table==='Repayments'?'amountPaid':table==='FinancialAssistance'?'amount':null;
 const visible=/recent|latest|ఇటీవల/.test(q)?rows.slice(0,10):rows.slice(0,50);
 html+='<h4>'+AdvancedUI.label(table)+' · '+AdvancedUI.number(rows.length)+'</h4>';
 if(numeric){const sum=rows.reduce((s,r)=>s+Math.round(CommunityCore.num(r[numeric])*100),0)/100;html+='<p>'+AdvancedUI.money(sum)+'</p>';speech.push(AdvancedUI.label(table)+' '+AdvancedUI.money(sum));}
 html+='<ul>';
 visible.forEach(r=>{
 const text=table==='Donations'?r.donorName+' — '+AdvancedUI.money(r.amount):table==='CulturalStories'?AdvancedUI.text(r,'title')+': '+AdvancedUI.text(r,'storyText'):table==='AIKnowledge'?AdvancedUI.text(r,'answer'):table==='Events'?AdvancedUI.text(r,'title')+' — '+AdvancedUI.date(r.eventDate)+' '+(r.time||'')+' '+(r.location||''):table==='Notes'?AdvancedUI.text(r,'title')+': '+r.content:table==='Announcements'?AdvancedUI.text(r,'title')+': '+r.message:Object.keys(r).filter(k=>!/(En|Te)$/.test(k)&&!['createdBy','updatedBy','deletedBy'].includes(k)).map(k=>AdvancedUI.label(k)+': '+(numeric===k?AdvancedUI.money(r[k]):AdvancedUI.text(r,k))).join(' · ');
 html+='<li>'+AdvancedUI.esc(text)+'</li>';if(speech.length<8)speech.push(text);
 });html+='</ul>';
 if(rows.length>visible.length)html+='<p>'+ (appState.lang==='te'?'మొదటి రికార్డులు మాత్రమే చూపిస్తున్నాము. సంవత్సరం లేదా పేరుతో వెతకండి.':'Showing the first records. Narrow the search by year or name.')+'</p>';
 });
 return {html,speech:speech.join('. ')};
};
// Voice input is reviewed in the text box before Send; repeated taps cancel.
let activeRecognition=null;
window.startVoiceRecognition=function(){
 if(activeRecognition){activeRecognition.abort();return;}
 const SpeechRec=window.SpeechRecognition||window.webkitSpeechRecognition;
 if(!SpeechRec)return showToast(appState.lang==='te'?'ఈ బ్రౌజర్‌లో మైక్ గుర్తింపు లేదు. టైప్ చేయండి.':'Speech recognition is unavailable. Please type your question.','warning');
 window.stopAIaudio();const rec=new SpeechRec();activeRecognition=rec;rec.lang=appState.lang==='te'?'te-IN':'en-IN';rec.interimResults=true;rec.continuous=false;
 const input=document.getElementById('chat-input');const pulse=document.getElementById('voice-pulse');
 rec.onstart=()=>{pulse?.classList.remove('hidden');if(input)input.placeholder=t('listening');};
 rec.onresult=e=>{if(input)input.value=Array.from(e.results).map(r=>r[0].transcript).join(' ');};
 rec.onend=()=>{activeRecognition=null;pulse?.classList.add('hidden');if(input)input.placeholder=t('askHere');};
 rec.onerror=e=>{const messages=appState.lang==='te'?{'not-allowed':'మైక్ అనుమతి ఇవ్వండి.','no-speech':'మాటలు వినబడలేదు. మళ్ళీ ప్రయత్నించండి.',network:'వాయిస్ సేవకు ఇంటర్నెట్ అవసరం.'}:{'not-allowed':'Allow microphone access.','no-speech':'No speech detected. Please try again.',network:'Speech service could not connect.'};if(e.error!=='aborted')showToast(messages[e.error]||e.error,'warning');};
 try{rec.start();}catch(e){activeRecognition=null;showToast(e.message,'error');}
};
let speechGeneration=0;
window.stopAIaudio=function(){speechGeneration++;if('speechSynthesis'in window)window.speechSynthesis.cancel();};
window.speakAIResponse=function(text){
 if(!('speechSynthesis'in window))return;window.stopAIaudio();const generation=speechGeneration;
 const lang=appState.lang==='te'?'te-IN':'en-IN';const voices=window.speechSynthesis.getVoices();const voice=voices.find(v=>v.lang.toLowerCase().startsWith(lang.slice(0,2)));
 if(!voice){showToast(appState.lang==='te'?'తెలుగు వాయిస్ అందుబాటులో లేదు. జవాబు చదవండి.':'No matching voice is installed. The answer is available as text.','info');return;}
 const clean=String(text).replace(/[౦-౯]/g,c=>String(c.charCodeAt(0)-0x0C66)).replace(/₹/g,lang==='te-IN'?' రూపాయలు ':' rupees ').replace(/%/g,lang==='te-IN'?' శాతం ':' percent ').replace(/<[^>]*>/g,' ');
 const chunks=clean.match(/.{1,160}(?:\s|$)|.{1,160}/g)||[];
 const next=()=>{if(generation!==speechGeneration||!chunks.length)return;const utter=new SpeechSynthesisUtterance(chunks.shift());utter.voice=voice;utter.lang=lang;utter.rate=.95;utter.onend=next;utter.onerror=()=>{if(generation===speechGeneration)window.stopAIaudio();};window.speechSynthesis.speak(utter);};next();
};
const previousLanguage=setLanguage;
setLanguage=function(lang){
 if(!['te','en'].includes(lang))lang='te';activeRecognition?.abort();window.stopAIaudio();previousLanguage(lang);document.documentElement.lang=lang;
 renderAdminSidebar();populatePublicTableDropdown();renderPublicTable();renderFlipbookArchiveSection();renderCarousel(publicDataCache.Banners||[]);
 if(AuthManager.isAdmin()){renderFinancialDashboard();renderDashboardMetrics();if(currentTableName)renderTableView(currentTableName);}
 const input=document.getElementById('chat-input');if(input)input.placeholder=t('askHere');
 for(const el of document.querySelectorAll('select option[value="all"]'))el.textContent=AdvancedUI.label('all');
};
async function handleSignup(){
 const read=id=>document.getElementById(id)?.value||'';
 if(read('signup-pass')!==read('signup-confirm'))return showToast(appState.lang==='te'?'పాస్‌వర్డ్‌లు సరిపోలడం లేదు.':'Passwords do not match.','error');
 try{await apiCall('signup',{data:{name:read('signup-name'),phone:read('signup-phone'),email:read('signup-email'),password:read('signup-pass')}});hideModal('signup-modal');showModal('login-modal');}catch(e){showToast(e.message,'error');}
}
Object.assign(window,{renderTableView,openRecordModal,saveRecord,deleteRecord,populatePublicTableDropdown,renderPublicTable,openFlipbook,closeFlipbook,turnPage,setLanguage});
const oldInitialize=initializeApp;
initializeApp=async function(){await oldInitialize();if(AuthManager.isAdmin())await loadPublicData();};
const oldPublicLoad=loadPublicData;
loadPublicData=async function(){await oldPublicLoad();const host=document.getElementById('public-view');if(!host)return;
 let section=document.getElementById('advanced-events');if(!section){section=document.createElement('section');section.id='advanced-events';section.className='advanced-events';host.append(section);}
 section.replaceChildren();const title=document.createElement('h2');title.textContent=AdvancedUI.label('upcoming');section.append(title);
 const today=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Kolkata',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
 const events=(publicDataCache.Events||[]).filter(r=>String(r.eventDate).slice(0,10)>=today).sort((a,b)=>String(a.eventDate).localeCompare(String(b.eventDate))).slice(0,6);
 for(const r of events){const p=document.createElement('p');p.textContent=AdvancedUI.text(r,'title')+' · '+AdvancedUI.date(r.eventDate)+' '+(r.time||'')+' · '+(r.location||'');section.append(p);}
 if(!events.length)section.append(document.createTextNode(AdvancedUI.label('empty')));
 const stamp=document.createElement('p');stamp.className='advanced-sync';stamp.textContent=!navigator.onLine?AdvancedUI.label('offline'):publicDataCache.generatedAt?AdvancedUI.label('fresh')+': '+AdvancedUI.date(publicDataCache.generatedAt):'';section.append(stamp);
};
window.loadPublicData=loadPublicData;
document.addEventListener('DOMContentLoaded',()=>{
 document.querySelector('[data-action="handleSignup"]')?.addEventListener('click',handleSignup);
 document.getElementById('section-flipbook-year')?.addEventListener('change',renderFlipbookArchiveSection);
 const chat=document.getElementById('chat-messages');if(chat){chat.setAttribute('aria-live','polite');chat.setAttribute('role','log');}
 if(!API_URL)showToast(appState.lang==='te'?'config.js లో కొత్త బ్యాకెండ్ URL చేర్చండి.':'Add your new backend URL in config.js.','warning');
});
document.addEventListener('keydown',e=>{if(e.key==='Escape'){activeRecognition?.abort();window.stopAIaudio();closeFlipbook();}if(!document.getElementById('flipbook-modal')?.classList.contains('hidden')&&!/INPUT|TEXTAREA/.test(e.target.tagName)){if(e.key==='ArrowRight')turnPage(1);if(e.key==='ArrowLeft')turnPage(-1);}});
function renderDetailedFinance(){
 const year=document.getElementById('finance-year')?.value||'all';const r=reportResult(year);const admin=AuthManager.isAdmin();
 const type=document.getElementById('finance-type')?.value||'all',start=document.getElementById('finance-start-date')?.value||'',end=document.getElementById('finance-end-date')?.value||'',query=(document.getElementById('finance-search')?.value||'').toLowerCase();
 if(start&&end&&start>end)return showToast(appState.lang==='te'?'తేదీల క్రమాన్ని సరిచూడండి.':'Start date must precede end date.','error');
 const totals={'finance-total-income':(r?.totalDonations||0)+(r?.otherIncome||0)+(r?.repayments||0),'finance-total-donations':r?.totalDonations,'finance-total-expenses':(r?.totalExpenses||0)+(r?.assistance||0),'finance-net-balance':r?.closingBalance,'finance-opening-balance':r?.openingBalance,'finance-balance-income':(r?.totalDonations||0)+(r?.otherIncome||0)+(r?.repayments||0),'finance-balance-expense':(r?.totalExpenses||0)+(r?.assistance||0),'finance-closing-balance':r?.closingBalance};
 for(const [id,value]of Object.entries(totals)){const el=document.getElementById(id);if(el)el.textContent=r?AdvancedUI.money(value):'—';}
 // Totals always describe the selected whole year; filters affect the transaction list only.
 const body=document.getElementById('finance-transactions-body');if(!body)return;body.replaceChildren();
 const source=admin?(r?.entries||[]):[];let balance=CommunityCore.num(r?.openingBalance);
 const dated=source.slice().sort((a,b)=>String(a.date||a.year).localeCompare(String(b.date||b.year))).map(e=>{balance+=['expenses','assistance'].includes(e.bucket)?-e.cents/100:e.cents/100;return {...e,balance};});
 const filtered=dated.filter(e=>{const day=String(e.date||'').slice(0,10);return (!start||day>=start)&&(!end||day<=end)&&(type==='all'||type==='donation'&&e.bucket==='donations'||type==='income'&&['donations','otherIncome','repayments'].includes(e.bucket)||type==='expense'&&['expenses','assistance'].includes(e.bucket))&&(!query||[e.category,e.description,e.id].join(' ').toLowerCase().includes(query));});
 for(const e of filtered){const tr=document.createElement('tr');const expense=['expenses','assistance'].includes(e.bucket);[AdvancedUI.date(e.date),e.category,e.description,AdvancedUI.label(e.bucket),expense?'—':AdvancedUI.money(e.cents/100),expense?AdvancedUI.money(e.cents/100):'—',AdvancedUI.money(e.balance)].forEach(value=>{const td=document.createElement('td');td.textContent=value;tr.append(td);});body.append(tr);}
 if(!filtered.length){const tr=document.createElement('tr'),td=document.createElement('td');td.colSpan=7;td.textContent=AdvancedUI.label(admin?'empty':'private');tr.append(td);body.append(tr);}
 const count=document.getElementById('finance-record-count');if(count)count.textContent=AdvancedUI.number(filtered.length);
 const monthly=document.getElementById('monthly-financial-summary');if(monthly){monthly.replaceChildren();const groups={};source.forEach(e=>{const month=String(e.date||'').slice(0,7);if(!/^\d{4}-\d{2}$/.test(month))return;groups[month]=(groups[month]||0)+(['expenses','assistance'].includes(e.bucket)?-e.cents:e.cents);});Object.keys(groups).sort().forEach(month=>{const p=document.createElement('p');p.textContent=month+': '+AdvancedUI.money(groups[month]/100);monthly.append(p);});}
 for(const id of ['finance-start-date','finance-end-date','finance-type','finance-search']){const el=document.getElementById(id);if(el)el.disabled=!admin;}
}
feedFinancialData=renderDetailedFinance;
document.addEventListener('DOMContentLoaded',()=>{
 document.getElementById('global-year-filter')?.addEventListener('change',handleYearChange);
 document.getElementById('table-search')?.addEventListener('input',filterCurrentTable);
 const fb=document.getElementById('flipbook-year-select');if(fb){fb.innerHTML=document.getElementById('public-year-filter')?.innerHTML||'';fb.addEventListener('change',()=>openFlipbook(fb.value));}
 document.getElementById('finance-calculate-btn')?.addEventListener('click',renderDetailedFinance);
 document.getElementById('finance-year')?.addEventListener('change',renderDetailedFinance);
 document.getElementById('finance-search')?.addEventListener('input',renderDetailedFinance);
 document.getElementById('finance-reset-btn')?.addEventListener('click',()=>{for(const id of ['finance-start-date','finance-end-date','finance-search'])document.getElementById(id).value='';document.getElementById('finance-type').value='all';document.getElementById('finance-year').value='all';renderDetailedFinance();});
 document.getElementById('btn-stop-audio')?.classList.remove('hidden');
 const consent=document.createElement('label');consent.className='advanced-consent';const input=document.createElement('input');input.type='checkbox';input.id='donor-public-consent';consent.append(input,document.createTextNode(appState.lang==='te'?' నా పేరును బహిరంగ దాతల జాబితాలో చూపించవచ్చు.':' Show my name in the public donor list.'));document.getElementById('upi-amount')?.parentNode.append(consent);
 const note=document.createElement('p');note.className='advanced-sync';note.textContent=appState.lang==='te'?'మొత్తాలు ఎంచుకున్న పూర్తి సంవత్సరానికి. తేదీ, శోధన ఫిల్టర్లు లావాదేవీల జాబితాకు వర్తిస్తాయి.':'Totals cover the whole selected year. Date and search filters apply to the transaction list.';document.getElementById('finance-calculate-btn')?.parentNode.append(note);
});
AdvancedUI.en={private:'This information is available to committee admins only.',unmatched:'No matching saved information. Try a donor name, year, event or story title.',draft:'Review the form, complete the details and press Save.',empty:'No records found.',all:'All years',report:'Annual financial report',export:'Download CSV',fresh:'Last synced',offline:'Offline: showing previously saved public information.',add:'Add record',edit:'Edit',delete:'Delete',otherIncome:'Other income / interest',assistance:'Assistance disbursed',repayments:'Repayments received',expenses:'Purchase and other expenses',anonymous:'Anonymous donor'};
const labelBeforeEnglish=AdvancedUI.label.bind(AdvancedUI);
AdvancedUI.label=function(k){return appState.lang==='en'&&this.en[k]?this.en[k]:labelBeforeEnglish(k);};
Object.assign(i18n.en,{financialDashTitle:'Yearly Financial Accounting',sysOverviewLbl:'Committee overview and yearly reports',mooshikaBrain:'Musika Assistant',allTablesLbl:'Committee Records',flipbookTitle:'Festival FlipBook',loading:'Loading...',aiGreeting:'Ask about a year, donor, event or saved story. For example: 2024 donor names and amounts.'});
Object.assign(i18n.te,{financialDashTitle:'వార్షిక ఆర్థిక లెక్కలు',sysOverviewLbl:'కమిటీ సమాచారం, వార్షిక నివేదికలు',mooshikaBrain:'మూషిక సహాయకుడు',allTablesLbl:'కమిటీ రికార్డులు',flipbookTitle:'ఉత్సవ ఫ్లిప్‌బుక్',loading:'లోడ్ అవుతోంది...',aiGreeting:'సంవత్సరం, దాత, కార్యక్రమం లేదా భద్రపరచిన కథ గురించి అడగండి. ఉదాహరణ: 2024 దాతల పేర్లు, మొత్తాలు.'});
QUERY_ALIASES.Donations.push('విరాళాలు','విరాళాల','దాతల','దాతలు','చందాలు');QUERY_ALIASES.CulturalStories.push('కథలు','మంత్రాలు');QUERY_ALIASES.Events.push('కార్యక్రమాలు');
const STATIC_TRANSLATIONS={
 'Financial Tools':'ఆర్థిక సాధనాలు','All Tables Database':'అన్ని పట్టికలు','Table Name':'పట్టిక పేరు','Community Interest Calculator (వడ్డీ లెక్కల యంత్రం)':'సంఘ వడ్డీ లెక్కల యంత్రం','Principal Amount (₹)':'అసలు మొత్తం (₹)','Interest Rate (% per annum)':'వార్షిక వడ్డీ రేటు (%)','Time Period (Years)':'కాలం (సంవత్సరాలు)','Calculate Interest':'వడ్డీ లెక్కించు','Simple Interest':'సాధారణ వడ్డీ','Compound Interest':'చక్రవడ్డీ','Total Amount (Principal + SI)':'అసలు, సాధారణ వడ్డీ కలిపి','Admin Notice:':'నిర్వాహకులకు సూచన:','Always set the':'ప్రతి రికార్డులో','financialYear':'సంవత్సరం','(e.g., 2025, 2026) correctly. This ensures the record appears in the correct yearly ledger and calculate accurate carry-forward balances.':'సరిగ్గా నమోదు చేయండి. దీనితో వార్షిక లెక్కలు, మిగిలిన నిల్వ సరిగ్గా కనిపిస్తాయి.','Prev':'మునుపటి','Next':'తదుపరి','Loading Pages...':'పేజీలు లోడ్ అవుతున్నాయి...','Explore festival memories, cover images, and historical pages directly from the database.':'ఉత్సవాల జ్ఞాపకాలు, చిత్రాలు, పాత పేజీలు చూడండి.','Financial Management':'ఆర్థిక నిర్వహణ','Ledger & Calculator':'లెక్కలు, గణన యంత్రం','Calculate income, donations, pooja/grocery expenses, and closing balances year-wise.':'విరాళాలు, ఆదాయం, పూజ, కిరాణా ఖర్చులు, మిగిలిన నిల్వ సంవత్సరాల వారీగా చూడండి.','From Date':'ప్రారంభ తేదీ','To Date':'ముగింపు తేదీ','Financial Year':'సంవత్సరం','Transaction Type':'లావాదేవీ రకం','All Transactions':'అన్ని లావాదేవీలు','Income (Donations)':'ఆదాయం, విరాళాలు','Verified Donations Only':'ధృవీకరించిన విరాళాలు మాత్రమే','Expenses (Groceries, Pooja, Rent)':'ఖర్చులు, ఆర్థిక సహాయం','Calculate':'లెక్కించు','Reset':'రీసెట్','Total Income':'మొత్తం ఆదాయం','Total Donations':'మొత్తం విరాళాలు','Total Expenses':'మొత్తం ఖర్చులు, సహాయం','Net Balance':'మిగిలిన నిల్వ','Opening Balance (From Previous Year)':'గత సంవత్సరం నుండి నిల్వ','+ Total Income (Current Year)':'+ ఈ సంవత్సరం ఆదాయం, తిరిగి చెల్లింపులు','- Total Expenses (Current Year)':'- ఈ సంవత్సరం ఖర్చులు, ఆర్థిక సహాయం','Available Closing Balance':'అందుబాటులో ఉన్న ముగింపు నిల్వ','Financial Ledger':'ఆర్థిక లావాదేవీల పట్టిక','Date':'తేదీ','Category / Ref':'వర్గం / గుర్తింపు','Description':'వివరణ','Type':'రకం','Income':'ఆదాయం','Expense':'ఖర్చు','Balance':'నిల్వ','Monthly Financial Summary':'నెలవారీ ఆర్థిక సారాంశం','Phone or Email':'ఫోన్ లేదా ఇమెయిల్','Password':'పాస్‌వర్డ్','Full Name *':'పూర్తి పేరు *','Phone Number *':'ఫోన్ నంబర్ *','Email (Optional)':'ఇమెయిల్ (ఐచ్ఛికం)','Password *':'పాస్‌వర్డ్ *','Confirm Password *':'పాస్‌వర్డ్ మళ్ళీ నమోదు చేయండి *','Admin Secret Key':'అడ్మిన్ రహస్య కీ','Enter Full Name':'పూర్తి పేరు నమోదు చేయండి','10-digit mobile number':'10 అంకెల మొబైల్ నంబర్','e.g. 501, 1116, 5000':'ఉదా. ౫౦౧, ౧౧౧౬, ౫౦౦౦','Enter 12-digit UTR / Ref No.':'12 అంకెల లావాదేవీ సంఖ్య','Search records...':'రికార్డుల్లో వెతకండి...','Search transactions...':'లావాదేవీల్లో వెతకండి...','Ask here...':'ఇక్కడ అడగండి...','e.g. 50000':'ఉదా. ౫౦౦౦౦','e.g. 24 (or 2% per month)':'ఉదా. సంవత్సరానికి ౨౪ శాతం','e.g. 1.5':'ఉదా. ౧.౫','Use Voice Input':'మైక్ ద్వారా చెప్పండి','Stop AI Voice':'వాయిస్ ఆపండి','Clear Memory':'సంభాషణ తొలగించు','Close':'మూసివేయు','Saved committee records':'భద్రపరచిన కమిటీ రికార్డులు','View published community information.':'బహిరంగ కమిటీ సమాచారం చూడండి.'};
const staticNodes=[];
function applyStaticLanguage(){for(const item of staticNodes){const value=appState.lang==='te'?STATIC_TRANSLATIONS[item.english]:item.english;if(item.attr)item.node.setAttribute(item.attr,value);else item.node.nodeValue=item.prefix+value+item.suffix;}renderDetailedFinance();}
const lastLanguage=setLanguage;
setLanguage=function(lang){lastLanguage(lang);applyStaticLanguage();};window.setLanguage=setLanguage;
document.addEventListener('DOMContentLoaded',()=>{
 const walker=document.createTreeWalker(document.body,NodeFilter.SHOW_TEXT);let node;
 while(node=walker.nextNode()){const raw=node.nodeValue,english=raw.trim();if(STATIC_TRANSLATIONS[english]&&!node.parentElement.closest('[data-i18n],script,style,svg'))staticNodes.push({node,english,prefix:raw.match(/^\s*/)[0],suffix:raw.match(/\s*$/)[0]});}
 for(const el of document.querySelectorAll('[placeholder],[title]'))for(const attr of ['placeholder','title']){const english=el.getAttribute(attr);if(STATIC_TRANSLATIONS[english])staticNodes.push({node:el,attr,english});}
 applyStaticLanguage();
});
const clearOriginalSession=AuthManager.clearSession.bind(AuthManager);
AuthManager.clearSession=function(){clearOriginalSession();adminDataCache={};currentTableName='';currentEditId=null;window.stopAIaudio();activeRecognition?.abort();for(const id of ['dynamic-table-body','dynamic-table-head','crud-form-fields','chat-messages','admin-dashboard-section','financial-metrics-container','finance-transactions-body','monthly-financial-summary'])document.getElementById(id)?.replaceChildren();hideModal('crud-modal');hideModal('flipbook-modal');renderDetailedFinance();};
/* v11 integration: one script, visible errors, validated sessions and Latin digits. */
const ConnectionState={status:'loading',message:'',lastSync:null};
function numericDigits(value){return String(value??'').replace(/[౦-౯]/g,c=>String(c.charCodeAt(0)-0x0C66));}
function statusMessage(en,te){return appState.lang==='te'?te:en;}
function renderConnectionState(){
 let el=document.getElementById('connection-status');if(!el){el=document.createElement('section');el.id='connection-status';el.className='connection-status';el.setAttribute('role','status');document.querySelector('header')?.after(el);}
 const text=ConnectionState.status==='ready'?statusMessage('Connected. Committee data loaded.','కనెక్షన్ ఉంది. కమిటీ సమాచారం లోడ్ అయింది.'):ConnectionState.status==='loading'?statusMessage('Connecting to your committee database…','కమిటీ డేటాబేస్‌కు కనెక్ట్ అవుతోంది…'):ConnectionState.message;
 el.replaceChildren(document.createTextNode(text));el.dataset.state=ConnectionState.status;
 if(ConnectionState.status==='error'||ConnectionState.status==='offline'){const retry=document.createElement('button');retry.textContent=statusMessage('Retry','మళ్ళీ ప్రయత్నించు');retry.onclick=()=>initializeApp();el.append(retry);}
}
function apiErrorMessage(err){
 if(err.name==='AbortError')return statusMessage('The backend took too long to respond. Retry; do not submit the same record twice.','బ్యాకెండ్ స్పందించడానికి ఎక్కువ సమయం పట్టింది. మళ్ళీ ప్రయత్నించండి; అదే రికార్డును రెండుసార్లు పంపవద్దు.');
 if(err.message==='Failed to fetch'||err.message==='fetch failed')return statusMessage('Cannot reach Apps Script. Check your internet, deployment access, and API URL.','Apps Script కనెక్షన్ లేదు. ఇంటర్నెట్, డిప్లాయ్ అనుమతులు, API URL తనిఖీ చేయండి.');
 return err.message||String(err);
}
apiCall=async function(action,payloadData={}){
 if(!API_URL)throw new Error('Set apiUrl at the top of app.js.');
 // Do not reject requests solely because navigator.onLine is false.
 const sessionAtRequest=AuthManager.state.token;
 const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),45000);
 try{
  const response=await fetch(API_URL,{method:'POST',headers:{'Content-Type':'text/plain;charset=utf-8'},body:JSON.stringify({action,sessionToken:sessionAtRequest,...payloadData}),signal:controller.signal,redirect:'follow'});
  const raw=await response.text();let result;
  try{result=JSON.parse(raw);}catch{throw new Error(statusMessage('The URL returned a Google sign-in/error page instead of API data. Redeploy as a web app with access for your website visitors, then use its /exec URL.','API సమాచారానికి బదులుగా Google లాగిన్ లేదా ఎర్రర్ పేజీ వచ్చింది. వెబ్ యాప్ అనుమతులు, /exec URL తనిఖీ చేయండి.'));}
  if(!response.ok||result.status!=='success'){
    const err=new Error(result.error?.message||'Backend request failed.');err.code=result.error?.code;
    if(err.code==='SESSION_EXPIRED'&&sessionAtRequest&&sessionAtRequest===AuthManager.state.token){AuthManager.clearSession();updateRouting();}
    throw err;
  }
  if(!result.data||typeof result.data!=='object')throw new Error('Backend response is missing its data object. Deploy the supplied code.js backend.');
  return result;
 }finally{clearTimeout(timeout);}
};
function setFormMessage(modalId,text,error=true){const modal=document.getElementById(modalId);if(!modal)return;let el=modal.querySelector('.form-feedback');if(!el){el=document.createElement('p');el.className='form-feedback';el.setAttribute('role','alert');modal.firstElementChild?.append(el);}el.textContent=text;el.dataset.error=String(error);}
handleLogin=async function(type){
 const admin=type==='admin',modal=admin?'admin-login-modal':'login-modal';const btn=document.querySelector('#'+modal+' [data-action="handleLogin"]');if(btn?.disabled)return;
 const original=btn?.textContent;if(btn)btn.disabled=true;setFormMessage(modal,'');
 try{
  const payload=admin?{secret:document.getElementById('admin-secret')?.value||''}:{identifier:document.getElementById('login-id')?.value.trim()||'',password:document.getElementById('login-pass')?.value||''};
  if(admin&&!payload.secret||!admin&&(!payload.identifier||!payload.password))throw new Error(statusMessage('Complete the login fields.','లాగిన్ వివరాలు నమోదు చేయండి.'));
  const res=await apiCall(admin?'adminLogin':'login',payload);const user=res.data.user;
  if(!res.data.sessionToken||!['admin','user'].includes(user?.role))throw new Error('Invalid login response. Update the backend deployment.');
  AuthManager.setSession(res.data.sessionToken,user.role,user.name);hideModal(modal);updateRouting();
  if(admin)document.getElementById('admin-secret').value='';else document.getElementById('login-pass').value='';
  showToast(statusMessage('Login successful.','లాగిన్ విజయవంతమైంది.'));
  if(AuthManager.isAdmin())await loadAdminDashboard();else loadUserDashboard();
  await loadPublicData();
 }catch(err){const message=apiErrorMessage(err);setFormMessage(modal,message);showToast(message,'error');}
 finally{if(btn){btn.disabled=false;btn.textContent=original;}}
};
handleSignup=async function(){
 const btn=document.querySelector('[data-action="handleSignup"]');if(btn?.disabled)return;
 const value=id=>document.getElementById(id)?.value||'';
 const data={name:value('signup-name').trim(),phone:value('signup-phone').trim(),email:value('signup-email').trim(),password:value('signup-pass')};
 setFormMessage('signup-modal','');if(btn)btn.disabled=true;
 try{
  if(!data.name||!data.phone||data.password.length<10)throw new Error(statusMessage('Enter a name, phone and password with at least 10 characters.','పేరు, ఫోన్, కనీసం 10 అక్షరాల పాస్‌వర్డ్ ఇవ్వండి.'));
  if(data.password!==value('signup-confirm'))throw new Error(statusMessage('Passwords do not match.','పాస్‌వర్డ్‌లు సరిపోలలేదు.'));
  await apiCall('signup',{data});hideModal('signup-modal');showModal('login-modal');document.getElementById('login-id').value=data.phone;
  document.getElementById('signup-pass').value='';document.getElementById('signup-confirm').value='';setFormMessage('login-modal',statusMessage('Account created. Log in with your password.','ఖాతా సృష్టించబడింది. మీ పాస్‌వర్డ్‌తో లాగిన్ అవ్వండి.'),false);
 }catch(err){setFormMessage('signup-modal',apiErrorMessage(err));showToast(apiErrorMessage(err),'error');}finally{if(btn)btn.disabled=false;}
};
function updateAvailableYears(){
 const years=new Set(Array.from({length:new Date().getFullYear()-1998},(_,i)=>String(2000+i)));
 for(const db of [publicDataCache,adminDataCache])for(const rows of Object.values(db))if(Array.isArray(rows))for(const r of rows){const y=CommunityCore.year(r);if(/^20\d{2}$/.test(y))years.add(y);}
 for(const id of ['global-year-filter','public-year-filter','section-flipbook-year','finance-year','flipbook-year-select']){
  const el=document.getElementById(id);if(!el)continue;const selected=el.value||'all';el.innerHTML='<option value="all">'+AdvancedUI.label('all')+'</option>'+[...years].sort().reverse().map(y=>'<option value="'+y+'">'+y+'</option>').join('');el.value=selected;
 }
}
function renderPublicationNotice(){
 const host=document.getElementById('admin-view');if(!host)return;let el=document.getElementById('publication-notice');if(!el){el=document.createElement('section');el.id='publication-notice';el.className='publication-notice';host.prepend(el);}el.replaceChildren();
 for(const [table,counts]of Object.entries(adminDataCache._publication||{}))if(counts.total>counts.published){const b=document.createElement('button');b.className='advanced-button';b.textContent=AdvancedUI.label(table)+': '+(counts.total-counts.published)+' '+statusMessage('unpublished — review','ప్రచురించలేదు — పరిశీలించు');b.onclick=()=>renderTableView(table);el.append(b);}
}
loadAdminDashboard=async function(){
 if(!AuthManager.isAdmin())return;const token=AuthManager.state.token;
 try{
  const res=await apiCall('getAdminData');if(token!==AuthManager.state.token||!AuthManager.isAdmin())return;
  adminDataCache=res.data;const name=document.getElementById('admin-user-name');if(name)name.textContent=AuthManager.state.userName||'Admin';
  if(res.data._schema)for(const [table,keys]of Object.entries(res.data._schema))if(TABLE_SCHEMAS[table])TABLE_SCHEMAS[table]=[...new Set(keys.filter(k=>!['createdBy','updatedBy','deletedBy','verifiedAt'].includes(k)))];
  renderAdminSidebar();updateAvailableYears();renderDashboardMetrics();renderFinancialDashboard();renderDetailedFinance();renderPublicationNotice();if(currentTableName)renderTableView(currentTableName);
 }catch(err){showToast(apiErrorMessage(err),'error');ConnectionState.status='error';ConnectionState.message=apiErrorMessage(err);renderConnectionState();}
};
const renderPublicExtras=loadPublicData;
// Use one public-data request, keep published-only offline data, and never hide errors as "loading".
loadPublicData=async function(){
 try{
  const res=await apiCall('getPublicData');publicDataCache=res.data;safeSetLocal('offline_public_data_v11',JSON.stringify(publicDataCache));
  ConnectionState.status='ready';ConnectionState.lastSync=new Date();
 }catch(err){
  ConnectionState.status=navigator.onLine?'error':'offline';ConnectionState.message=apiErrorMessage(err);
  const cached=safeGetLocal('offline_public_data_v11',null);publicDataCache=cached?SafeUtils.parseJSON(cached,{}):{};
 }
 updateAvailableYears();populatePublicTableDropdown();renderPublicTable();renderCarousel(publicDataCache.Banners||[]);renderFlipbookArchiveSection();renderDetailedFinance();renderConnectionState();renderUpcomingEvents();
};
function renderUpcomingEvents(){const host=document.getElementById('public-view');if(!host)return;let el=document.getElementById('advanced-events');if(!el){el=document.createElement('section');el.id='advanced-events';el.className='advanced-events';host.append(el);}el.replaceChildren();const h=document.createElement('h2');h.textContent=AdvancedUI.label('upcoming');el.append(h);
 const today=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Kolkata',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());const rows=(publicDataCache.Events||[]).filter(r=>String(r.eventDate).slice(0,10)>=today).sort((a,b)=>String(a.eventDate).localeCompare(String(b.eventDate))).slice(0,8);
 for(const r of rows){const p=document.createElement('p');p.textContent=AdvancedUI.text(r,'title')+' · '+AdvancedUI.date(r.eventDate)+' '+(r.time||'')+' '+(r.location||'');el.append(p);}if(!rows.length)el.append(document.createTextNode(AdvancedUI.label('empty')));
}
initializeApp=async function(){
 ConnectionState.status=navigator.onLine?'loading':'offline';renderConnectionState();
 const token=AuthManager.state.token;
 if(token&&navigator.onLine){try{const res=await apiCall('refreshSession');if(token===AuthManager.state.token&&res.data.user)AuthManager.setSession(token,res.data.user.role,res.data.user.name);}catch(err){if(err.code==='SESSION_EXPIRED'||err.code==='UNAUTHORIZED')AuthManager.clearSession();else showToast(apiErrorMessage(err),'warning');}}
 updateRouting();if(AuthManager.isAdmin()&&navigator.onLine)await loadAdminDashboard();await loadPublicData();
};
const oldV11Language=setLanguage;
setLanguage=function(lang){oldV11Language(lang);renderConnectionState();renderUpcomingEvents();renderPublicationNotice();
 for(const item of staticNodes){if(item.attr)item.node.setAttribute(item.attr,numericDigits(item.node.getAttribute(item.attr)));else item.node.nodeValue=numericDigits(item.node.nodeValue);}
};
Object.assign(window,{handleLogin,handleSignup,loadAdminDashboard,loadPublicData,initializeApp,setLanguage,apiCall});
// Enter submits the relevant auth form. Passwords are never trimmed.
document.addEventListener('DOMContentLoaded',()=>{
 for(const [id,type]of [['login-pass','user'],['admin-secret','admin']])document.getElementById(id)?.addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();handleLogin(type);}});
 document.getElementById('signup-confirm')?.addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();handleSignup();}});
 for(const id of ['signup-pass','signup-confirm']){const el=document.getElementById(id);if(el){el.minLength=10;el.autocomplete='new-password';}}
 document.getElementById('login-pass')?.setAttribute('autocomplete','current-password');
 const register=document.getElementById('signup-modal');if(register){const hint=document.createElement('p');hint.className='form-feedback';hint.textContent=statusMessage('Password: at least 10 characters. Existing members should use Login.','పాస్‌వర్డ్: కనీసం 10 అక్షరాలు. ఖాతా ఉంటే లాగిన్ వాడండి.');register.firstElementChild?.append(hint);}
});
const VoicePreferences={enabled:safeGetLocal('voice-enabled','true')==='true',rate:Number(safeGetLocal('voice-rate','0.95'))||.95,voice:safeGetLocal('voice-name','')};
function saveVoicePreferences(){safeSetLocal('voice-enabled',String(VoicePreferences.enabled));safeSetLocal('voice-rate',String(VoicePreferences.rate));safeSetLocal('voice-name',VoicePreferences.voice);}
function populateVoiceChoices(){const el=document.getElementById('voice-choice');if(!el)return;const lang=appState.lang==='te'?'te':'en';const voices=window.speechSynthesis?.getVoices()||[];el.replaceChildren();const option=document.createElement('option');option.value='';option.textContent=statusMessage('Default voice','డిఫాల్ట్ వాయిస్');el.append(option);voices.filter(v=>v.lang.toLowerCase().startsWith(lang)).forEach(v=>{const o=document.createElement('option');o.value=v.name;o.textContent=v.name;el.append(o);});el.value=VoicePreferences.voice;}
window.speakAIResponse=function(text){
 if(!VoicePreferences.enabled||!window.speechSynthesis)return;
 window.stopAIaudio();const generation=speechGeneration,lang=appState.lang==='te'?'te-IN':'en-IN';
 const voices=window.speechSynthesis.getVoices();const matching=voices.filter(v=>v.lang.toLowerCase().startsWith(lang.slice(0,2)));const voice=matching.find(v=>v.name===VoicePreferences.voice)||matching[0];
 if(!voice){showToast(statusMessage('A matching voice is not installed. Read the answer or install a voice for this language.','ఈ భాష వాయిస్ ఇన్‌స్టాల్ కాలేదు. జవాబు చదవండి లేదా భాష వాయిస్ ఇన్‌స్టాల్ చేయండి.'),'info');return;}
 const clean=numericDigits(text).replace(/₹\s*([\d,.]+)/g,(_,v)=>v.replace(/,/g,'')+(lang==='te-IN'?' రూపాయలు':' rupees')).replace(/%/g,lang==='te-IN'?' శాతం':' percent').replace(/<[^>]*>/g,' ');
 const chunks=clean.match(/.{1,170}(?:\s|$)|.{1,170}/g)||[];
 const next=()=>{if(generation!==speechGeneration||!chunks.length)return;const utter=new SpeechSynthesisUtterance(chunks.shift());utter.voice=voice;utter.lang=lang;utter.rate=Math.max(.6,Math.min(1.4,VoicePreferences.rate));utter.onend=next;utter.onerror=()=>window.stopAIaudio();window.speechSynthesis.speak(utter);};next();
};
window.startFieldVoice=function(field){
 if(!AuthManager.isAdmin())return;const input=document.getElementById('crud-field-'+field);if(!input)return;
 if(activeRecognition){activeRecognition.abort();return;}
 const SpeechRec=window.SpeechRecognition||window.webkitSpeechRecognition;
 if(!SpeechRec)return showToast(statusMessage('Dictation is unavailable. Type in this field.','డిక్టేషన్ అందుబాటులో లేదు. ఈ ఫీల్డ్‌లో టైప్ చేయండి.'),'warning');
 const rec=new SpeechRec();activeRecognition=rec;window.stopAIaudio();rec.lang=field.endsWith('En')?'en-IN':field.endsWith('Te')?'te-IN':appState.lang==='te'?'te-IN':'en-IN';rec.interimResults=true;
 const initial=input.value;rec.onresult=e=>{input.value=(initial?initial+' ':'')+Array.from(e.results).map(r=>r[0].transcript).join(' ');};rec.onend=()=>{activeRecognition=null;};rec.onerror=e=>{if(e.error!=='aborted')showToast(e.error==='not-allowed'?statusMessage('Allow microphone access.','మైక్ అనుమతి ఇవ్వండి.'):e.error,'warning');};try{rec.start();}catch(e){activeRecognition=null;showToast(e.message,'error');}
};
const recordModalWithVoice=openRecordModal;
openRecordModal=function(id=null){recordModalWithVoice(id);if(!AuthManager.isAdmin())return;for(const input of document.querySelectorAll('#crud-form-fields input[type="text"],#crud-form-fields textarea')){const field=input.id.replace('crud-field-','');if(/Url|Id|utr|phone|email|password|setting/i.test(field))continue;const button=document.createElement('button');button.type='button';button.className='advanced-button';button.textContent=statusMessage('Dictate','మాట్లాడి నమోదు చేయి');button.onclick=()=>window.startFieldVoice(field);input.parentNode.append(button);}};window.openRecordModal=openRecordModal;
const queryBeforeCompare=MusikaQueryEngine.execute.bind(MusikaQueryEngine);
MusikaQueryEngine.execute=function(raw){const q=normalizeQuery(raw),years=[...new Set(q.match(/\b20\d{2}\b/g)||[])];if(years.length===2&&/compar|versus|vs|పోల్చు|తేడా/.test(q)){
 const a=reportResult(years[0]),b=reportResult(years[1]);if(!a||!b)return queryReply(statusMessage('A report is missing for one of those years.','ఈ సంవత్సరాల్లో ఒకదానికి నివేదిక లేదు.'));
 let html='<table><thead><tr><th></th><th>'+years[0]+'</th><th>'+years[1]+'</th><th>Δ</th></tr></thead><tbody>';const speech=[];
 for(const key of ['totalDonations','totalExpenses','closingBalance']){const diff=Math.round((CommunityCore.num(b[key])-CommunityCore.num(a[key]))*100)/100;html+='<tr><td>'+AdvancedUI.label(key)+'</td><td>'+AdvancedUI.money(a[key])+'</td><td>'+AdvancedUI.money(b[key])+'</td><td>'+AdvancedUI.money(diff)+'</td></tr>';speech.push(AdvancedUI.label(key)+': '+years[0]+' '+AdvancedUI.money(a[key])+', '+years[1]+' '+AdvancedUI.money(b[key]));}return {html:html+'</tbody></table>',speech:speech.join('. ')};
 }return queryBeforeCompare(raw);};
const languageWithVoices=setLanguage;setLanguage=function(lang){languageWithVoices(lang);populateVoiceChoices();};window.setLanguage=setLanguage;
document.addEventListener('DOMContentLoaded',()=>{
 const box=document.getElementById('chat-box');if(!box)return;const tools=document.createElement('div');tools.className='voice-tools';
 const read=document.createElement('button');read.id='voice-read-toggle';const label=()=>read.textContent=statusMessage('Read aloud: ','జవాబు చదువు: ')+(VoicePreferences.enabled?'ON':'OFF');label();read.onclick=()=>{VoicePreferences.enabled=!VoicePreferences.enabled;saveVoicePreferences();label();if(!VoicePreferences.enabled)window.stopAIaudio();};
 const pause=document.createElement('button');pause.textContent=statusMessage('Pause / Resume','పాజ్ / కొనసాగించు');pause.onclick=()=>{const ss=window.speechSynthesis;if(ss)ss.paused?ss.resume():ss.pause();};
 const rate=document.createElement('select');rate.setAttribute('aria-label','Speech speed');for(const v of [.75,.95,1.15,1.3]){const o=document.createElement('option');o.value=String(v);o.textContent=v+'×';rate.append(o);}rate.value=String(VoicePreferences.rate);rate.onchange=()=>{VoicePreferences.rate=Number(rate.value);saveVoicePreferences();};
 const voices=document.createElement('select');voices.id='voice-choice';voices.setAttribute('aria-label','Voice');voices.onchange=()=>{VoicePreferences.voice=voices.value;saveVoicePreferences();};tools.append(read,pause,rate,voices);box.append(tools);populateVoiceChoices();window.speechSynthesis?.addEventListener('voiceschanged',populateVoiceChoices);
 const examples=document.createElement('div');examples.className='voice-tools';for(const q of ['2024 donor names and amounts','upcoming events','compare 2024 vs 2025']){const b=document.createElement('button');b.textContent=q;b.onclick=()=>{document.getElementById('chat-input').value=q;};examples.append(b);}box.append(examples);
});

/* Version 12: responsive controls, public search, recoverable records and local rendering. */
const UI12 = {
  page: 1, pageSize: 15, trash: null, waitingWorker: null,
  en: {motion:'Motion',install:'Install app',search:'Search records',sort:'Sort',newest:'Newest first',byName:'Name',byAmount:'Highest amount',trash:'Deleted records',trashHint:'Restore a record to its original table. Restoring a public record makes it public again.',records:'Records',events:'Events',book:'Flipbook',assistant:'Assistant',updateReady:'An updated app is ready.',reload:'Reload',restore:'Restore',previous:'Previous',next:'Next',noRecords:'No matching records.',private:'Sign in as an admin to view this section.',chart:'Yearly donations and expenses',conflict:'This record changed. Reload it before saving.',saved:'Record saved.',restored:'Record restored.',offline:'Offline — showing saved public records.'},
  te: {motion:'కదలికలు',install:'యాప్ ఇన్‌స్టాల్',search:'రికార్డుల్లో వెతకండి',sort:'క్రమం',newest:'కొత్తవి ముందు',byName:'పేరు',byAmount:'ఎక్కువ మొత్తం',trash:'తొలగించిన రికార్డులు',trashHint:'రికార్డును పాత పట్టికలోకి పునరుద్ధరించండి. బహిరంగ రికార్డును పునరుద్ధరిస్తే మళ్ళీ అందరికీ కనిపిస్తుంది.',records:'రికార్డులు',events:'కార్యక్రమాలు',book:'ఫ్లిప్‌బుక్',assistant:'సహాయకుడు',updateReady:'కొత్త యాప్ వెర్షన్ సిద్ధంగా ఉంది.',reload:'రీలోడ్',restore:'పునరుద్ధరించు',previous:'మునుపటి',next:'తదుపరి',noRecords:'సరిపోయే రికార్డులు లేవు.',private:'ఈ విభాగానికి అడ్మిన్ లాగిన్ అవసరం.',chart:'వార్షిక విరాళాలు, ఖర్చులు',conflict:'రికార్డు మారింది. తాజా వివరాలు తెరిచి భద్రపరచండి.',saved:'రికార్డు భద్రపరచబడింది.',restored:'రికార్డు పునరుద్ధరించబడింది.',offline:'ఆఫ్‌లైన్ — భద్రపరచిన బహిరంగ రికార్డులు.'},
  t(key) { return (appState.lang === 'te' ? this.te : this.en)[key] || key; },
  icons: {
    microphone:'M12 15a3 3 0 0 0 3-3V5a3 3 0 0 0-6 0v7a3 3 0 0 0 3 3ZM5 10v2a7 7 0 0 0 14 0v-2M12 19v3M8 22h8',
    book:'M12 5c-3-2-7-2-10-1v15c4-1 7-1 10 1 3-2 7-2 10-1V4c-3-1-7-1-10 1Zm0 0v15',
    calendar:'M3 6h18v15H3ZM7 2v7M17 2v7M3 11h18M7 15h2M15 15h2',
    chart:'M3 3v18h18M7 17v-5M12 17V7M17 17V4',
    close:'m6 6 12 12M18 6 6 18', plus:'M12 4v16M4 12h16',
    next:'m9 5 7 7-7 7',previous:'m15 5-7 7 7 7',
    trash:'M3 6h18M8 6V3h8v3M5 6l1 15h12l1-15M9 10v7M15 10v7',
    restore:'M3 10a9 9 0 1 1 2 9M3 4v6h6M12 7v6l4 2',
    send:'m3 3 19 9-19 9 4-9-4-9Zm4 9h15',
    wallet:'M3 5h17v16H3ZM3 5l14-3v3M15 11h7v5h-7Z',
    down:'M12 3v18m-7-7 7 7 7-7',up:'M12 21V3m-7 7 7-7 7 7',
    info:'M12 11v6M12 7h.01M22 12A10 10 0 1 1 2 12a10 10 0 0 1 20 0',
    list:'M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01',
    calculator:'M5 2h14v20H5ZM8 5h8v4H8ZM8 13h1M15 13h1M8 17h1M15 17h1',
    heart:'M12 21 3 12a6 6 0 0 1 9-8 6 6 0 0 1 9 8Z',
    mail:'M2 4h20v16H2ZM2 4l10 9L22 4',
    location:'M12 22s8-8 8-14a8 8 0 0 0-16 0c0 6 8 14 8 14ZM15 8a3 3 0 1 1-6 0 3 3 0 0 1 6 0',
    phone:'M6 2 2 5c0 9 8 17 17 17l3-4-5-4-3 3-7-7 3-3-4-5Z',
    mute:'M11 4 6 8H2v8h4l5 4ZM16 8l6 8M22 8l-6 8',
    percent:'M5 20 19 4M8 6a2 2 0 1 1-4 0 2 2 0 0 1 4 0M20 18a2 2 0 1 1-4 0 2 2 0 0 1 4 0',
    robot:'M4 6h16v14H4ZM12 6V2M8 11h.01M16 11h.01M8 16h8M1 10v6M23 10v6',
    spinner:'M12 2a10 10 0 1 1-10 10'
  },
  icon(name) {
    const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');
    svg.setAttribute('viewBox','0 0 24 24');svg.setAttribute('class','ui-icon');svg.setAttribute('fill','none');svg.setAttribute('stroke','currentColor');svg.setAttribute('stroke-width','1.7');svg.setAttribute('stroke-linecap','round');svg.setAttribute('stroke-linejoin','round');svg.setAttribute('aria-hidden','true');
    const path=document.createElementNS('http://www.w3.org/2000/svg','path');path.setAttribute('d',this.icons[name]||this.icons.info);svg.append(path);return svg;
  },
  upgradeIcons(root=document) {
    const icons=[...(root.querySelectorAll?.('i[class*="fa-"]')||[])];
    if(root.matches?.('i[class*="fa-"]')) icons.unshift(root);
    const map={'book-open':'book','calendar-day':'calendar','calendar-alt':'calendar','chart-column':'chart','chart-pie':'chart','times':'close','chevron-left':'previous','chevron-right':'next','rotate-left':'restore','paper-plane':'send','arrow-up':'up','arrow-down':'down','hand-holding-heart':'heart','exclamation-triangle':'info','info-circle':'info','map-marker-alt':'location','envelope':'mail','volume-mute':'mute'};
    for(const old of icons){const token=[...old.classList].find(c=>c.startsWith('fa-')&&!['fa-spin'].includes(c))?.slice(3);const svg=this.icon(map[token]||token);if(old.classList.contains('fa-spin'))svg.classList.add('icon-spin');old.replaceWith(svg);}
  }
};

/* Render known assistant formatting locally, without a blocking external script. */
function safeAssistantHTML(html) {
  const template=document.createElement('template');template.innerHTML=String(html);
  const allowed=new Set(['DIV','SPAN','P','BR','STRONG','B','EM','I','UL','OL','LI','H3','H4','TABLE','THEAD','TBODY','TR','TH','TD']);
  for(const el of [...template.content.querySelectorAll('*')]){
    const tag=el.tagName.toUpperCase();
    if(['SCRIPT','STYLE','IFRAME','OBJECT','EMBED','SVG','MATH','FORM'].includes(tag)){el.remove();continue;}
    if(!allowed.has(tag)){el.replaceWith(...el.childNodes);continue;}
    for(const attr of [...el.attributes])if(attr.name!=='class')el.removeAttribute(attr.name);
  }
  const output=document.createElement('div');output.append(template.content.cloneNode(true));return output.innerHTML;
}
addMooshikaMessage=function(message,type='ai') {
  const host=document.getElementById('chat-messages');if(!host)return;
  const bubble=document.createElement('div');bubble.className='chat-bubble '+(type==='user'?'chat-bubble-user':'chat-bubble-assistant');
  if(type==='user')bubble.textContent=message;else bubble.innerHTML=safeAssistantHTML(message);
  host.append(bubble);host.scrollTop=host.scrollHeight;
};
let chatBusy=false;
sendChatMessage=async function(){
  const input=document.getElementById('chat-input'),query=input?.value.trim();if(!query||chatBusy)return;
  chatBusy=true;input.value='';addMooshikaMessage(query,'user');const button=document.getElementById('btn-chat-send');if(button)button.disabled=true;
  const typing=document.getElementById('typing-indicator');typing?.classList.remove('hidden');
  try{await Promise.resolve();const result=MusikaQueryEngine.execute(query);addMooshikaMessage(result.html);if(result.speech)window.speakAIResponse(result.speech);}
  catch(error){addMooshikaMessage(AdvancedUI.esc(apiErrorMessage(error)));}
  finally{typing?.classList.add('hidden');if(button)button.disabled=false;chatBusy=false;}
};

renderPublicTable=function(){
  const table=document.getElementById('public-table-selector')?.value||'Donations';
  const year=document.getElementById('public-year-filter')?.value||'all';
  const search=(document.getElementById('public-search')?.value||'').trim().toLocaleLowerCase();
  const sort=document.getElementById('public-sort')?.value||'newest';
  const head=document.getElementById('public-table-head'),body=document.getElementById('public-table-body');if(!head||!body)return;
  if(!PUBLIC_TABLE_WHITELIST.includes(table)){head.replaceChildren();body.replaceChildren();return;}
  const rows=(publicDataCache[table]||[]).filter(r=>(year==='all'||CommunityCore.year(r)===year)&&(!search||Object.values(r).some(v=>String(v).toLocaleLowerCase().includes(search))));
  const collator=new Intl.Collator(appState.lang==='te'?'te':'en',{numeric:true});
  rows.sort((a,b)=>sort==='amount'?CommunityCore.num(b.amount??b.totalDonations)-CommunityCore.num(a.amount??a.totalDonations):sort==='name'?collator.compare(AdvancedUI.text(a,'donorName')||AdvancedUI.text(a,'title')||a.name||'',AdvancedUI.text(b,'donorName')||AdvancedUI.text(b,'title')||b.name||''):String(b.date||b.eventDate||b.financialYear||'').localeCompare(String(a.date||a.eventDate||a.financialYear||'')));
  const pages=Math.max(1,Math.ceil(rows.length/UI12.pageSize));UI12.page=Math.min(Math.max(1,UI12.page),pages);
  const keys=[...new Set(rows.flatMap(r=>Object.keys(r)))].filter(k=>!STRIPPED_PUBLIC_KEYS.includes(k.toLowerCase())&&!/(En|Te)$/.test(k));
  head.replaceChildren();const hr=document.createElement('tr');for(const key of keys){const th=document.createElement('th');th.scope='col';th.textContent=AdvancedUI.label(key);hr.append(th);}head.append(hr);body.replaceChildren();
  for(const row of rows.slice((UI12.page-1)*UI12.pageSize,UI12.page*UI12.pageSize)){const tr=document.createElement('tr');for(const key of keys)tr.append(rowCell(row,key));body.append(tr);}
  if(!rows.length){const tr=document.createElement('tr'),td=document.createElement('td');td.colSpan=Math.max(1,keys.length);td.textContent=UI12.t('noRecords');tr.append(td);body.append(tr);}
  const info=document.getElementById('public-page-info');if(info)info.textContent=rows.length+' '+UI12.t('records')+' · '+UI12.page+' / '+pages;
  const nav=document.getElementById('public-pagination');if(nav){nav.replaceChildren();for(const [label,step,disabled]of [['previous',-1,UI12.page===1],['next',1,UI12.page===pages]]){const b=document.createElement('button');b.type='button';b.textContent=UI12.t(label);b.disabled=disabled;b.onclick=()=>{UI12.page+=step;renderPublicTable();};nav.append(b);}}
};

saveRecord=async function(){
  if(!AuthManager.isAdmin())return;
  const button=document.getElementById('crud-save-btn');if(button?.disabled)return;
  const table=currentTableName,id=currentEditId;
  if(READ_ONLY_TABLES.includes(table))return;
  const fields=[...document.querySelectorAll('#crud-form-fields input,#crud-form-fields textarea,#crud-form-fields select')];
  if(fields.some(el=>el.reportValidity&&!el.reportValidity()))return;
  const data={};for(const input of fields)if(input.id.startsWith('crud-field-'))data[input.id.slice(11)]=input.value;
  if(id)data.id=id;
  const existing=(adminDataCache[table]||[]).find(row=>String(row.id)===String(id));
  const payload={sheetName:table,data};if(id)payload.expectedUpdatedAt=editSnapshot13&&editSnapshot13.table===table&&editSnapshot13.id===String(id)?editSnapshot13.version:existing?.updatedAt||existing?.createdAt||'';
  if(button)button.disabled=true;
  try{await apiCall(id?'update':'add',payload);hideModal('crud-modal');showToast(UI12.t('saved'));await loadAdminDashboard();renderTableView(table);await loadPublicData();}
  catch(error){setFormMessage('crud-modal',apiErrorMessage(error));}
  finally{if(button)button.disabled=false;}
};

async function openTrash(){
  if(!AuthManager.isAdmin())return showToast(UI12.t('private'),'warning');
  showModal('trash-modal');const list=document.getElementById('trash-list');list.textContent=t('loading');const token=AuthManager.state.token;
  try{const res=await apiCall('getTrash');if(token!==AuthManager.state.token)return;UI12.trash=res.data;renderTrash();}
  catch(error){list.textContent=apiErrorMessage(error);}
}
function renderTrash(){
  const host=document.getElementById('trash-list');if(!host)return;host.replaceChildren();
  if(!AuthManager.isAdmin()){host.textContent=UI12.t('private');return;}
  let count=0;
  for(const [table,rows]of Object.entries(UI12.trash||{}))for(const row of rows){
    count++;const article=document.createElement('article');article.className='trash-row';const label=document.createElement('p');label.textContent=AdvancedUI.label(table)+' · '+(row.title||row.donorName||row.itemName||row.personName||row.id);
    const button=document.createElement('button');button.textContent=UI12.t('restore');button.onclick=async()=>{
      if(!confirm(UI12.t('restore')+': '+label.textContent+'?'))return;button.disabled=true;
      try{await apiCall('restore',{sheetName:table,id:row.id});showToast(UI12.t('restored'));await loadAdminDashboard();await loadPublicData();await openTrash();}
      catch(error){showToast(apiErrorMessage(error),'error');button.disabled=false;}
    };article.append(label,button);host.append(article);
  }
  if(!count)host.textContent=UI12.t('noRecords');
}

function renderYearlyChart(){
  const host=document.getElementById('yearly-chart');if(!host)return;host.replaceChildren();if(!AuthManager.isAdmin())return;
  const years=[...new Set(Object.values(adminDataCache).filter(Array.isArray).flat().map(CommunityCore.year))].filter(y=>/^20\d{2}$/.test(y)).sort().slice(-5);
  if(!years.length)return;
  const reports=years.map(year=>CommunityCore.report(adminDataCache,year));const max=Math.max(1,...reports.flatMap(r=>[r.totalDonations,r.totalExpenses]));
  const title=document.createElement('h3');title.textContent=UI12.t('chart');host.append(title);
  const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');svg.setAttribute('viewBox','0 0 600 220');svg.setAttribute('role','img');svg.setAttribute('aria-label',UI12.t('chart'));
  reports.forEach((r,i)=>{
    const x=35+i*(540/reports.length);for(const [key,color,offset]of [['totalDonations','#fbbf24',0],['totalExpenses','#fb7185',26]]){
      const rect=document.createElementNS('http://www.w3.org/2000/svg','rect');const height=150*Math.max(0,r[key])/max;for(const [k,v]of Object.entries({x:x+offset,y:180-height,width:20,height,fill:color,rx:4}))rect.setAttribute(k,String(v));
      const tooltip=document.createElementNS('http://www.w3.org/2000/svg','title');tooltip.textContent=r.financialYear+' '+AdvancedUI.label(key)+' '+AdvancedUI.money(r[key]);rect.append(tooltip);svg.append(rect);
    }
    const text=document.createElementNS('http://www.w3.org/2000/svg','text');text.setAttribute('x',String(x));text.setAttribute('y','206');text.setAttribute('fill','#fde68a');text.setAttribute('font-size','15');text.textContent=r.financialYear;svg.append(text);
  });host.append(svg);
  const legend=document.createElement('p');legend.textContent='● '+AdvancedUI.label('totalDonations')+' / '+AdvancedUI.label('totalExpenses');host.append(legend);
  const details=document.createElement('details'),summary=document.createElement('summary');summary.textContent=UI12.t('records');details.append(summary);
  for(const r of reports){const p=document.createElement('p');p.textContent=r.financialYear+': '+AdvancedUI.label('totalDonations')+' '+AdvancedUI.money(r.totalDonations)+'; '+AdvancedUI.label('totalExpenses')+' '+AdvancedUI.money(r.totalExpenses);details.append(p);}host.append(details);
}

const v12LoadAdmin=loadAdminDashboard;
loadAdminDashboard=async function(){await v12LoadAdmin();renderYearlyChart();UI12.upgradeIcons();};
const v12ClearSession=AuthManager.clearSession.bind(AuthManager);
AuthManager.clearSession=function(){v12ClearSession();UI12.trash=null;document.getElementById('trash-list')?.replaceChildren();document.getElementById('yearly-chart')?.replaceChildren();hideModal('trash-modal');};
const v12RenderCarousel=renderCarousel;
renderCarousel=function(banners){v12RenderCarousel(banners);if(document.documentElement.classList.contains('reduce-motion'))clearInterval(carouselTimer);if(!banners.length){const track=document.getElementById('carousel-track');if(track){track.replaceChildren();const image=document.createElement('img');image.src='VINYAKA.jpg';image.alt='Ganesh Chaturthi';image.className='banner-fallback';track.append(image);}}};
const v12RenderBook=renderTurnJsBook;
renderTurnJsBook=function(){v12RenderBook();const indicator=document.getElementById('flipbook-indicator');if(indicator)indicator.textContent=(advancedPage+1)+' / '+flipbookPages.length;document.querySelector('[data-action="flipbookPrev"]')?.toggleAttribute('disabled',advancedPage===0);document.querySelector('[data-action="flipbookNext"]')?.toggleAttribute('disabled',advancedPage>=flipbookPages.length-1);};
const v12Route=updateRouting;
updateRouting=function(){v12Route();document.body.classList.toggle('is-admin',AuthManager.isAdmin());};
const v12Section=showAdminSection;
showAdminSection=function(section){v12Section(section);document.getElementById('yearly-chart')?.classList.toggle('hidden',section!=='dashboard');};
const modalFocus=new Map();
const v12ShowModal=showModal,v12HideModal=hideModal;
showModal=function(id){modalFocus.set(id,document.activeElement);v12ShowModal(id);const modal=document.getElementById(id);modal?.querySelector('input,select,textarea,button')?.focus();document.body.classList.add('modal-open');};
hideModal=function(id){v12HideModal(id);modalFocus.get(id)?.focus?.();modalFocus.delete(id);if(![...document.querySelectorAll('[role="dialog"]')].some(el=>!el.classList.contains('hidden')))document.body.classList.remove('modal-open');};
const v12Language=setLanguage;
setLanguage=function(lang){v12Language(lang);document.querySelectorAll('[data-label12]').forEach(el=>el.textContent=UI12.t(el.dataset.label12));renderYearlyChart();if(UI12.trash)renderTrash();UI12.upgradeIcons();};
Object.assign(window,{sendChatMessage,renderPublicTable,saveRecord,loadAdminDashboard,showModal,hideModal,showAdminSection,setLanguage});

document.addEventListener('DOMContentLoaded',()=>{
  UI12.upgradeIcons();
  document.querySelectorAll('[data-label12]').forEach(el=>el.textContent=UI12.t(el.dataset.label12));
  const motion=document.getElementById('motion-toggle');const reduced=safeGetLocal('reduce-motion','')==='true'||matchMedia('(prefers-reduced-motion: reduce)').matches;
  document.documentElement.classList.toggle('reduce-motion',reduced);motion?.setAttribute('aria-pressed',String(reduced));
  motion?.addEventListener('click',()=>{const reduce=!document.documentElement.classList.contains('reduce-motion');document.documentElement.classList.toggle('reduce-motion',reduce);motion.setAttribute('aria-pressed',String(reduce));safeSetLocal('reduce-motion',String(reduce));if(reduce)clearInterval(carouselTimer);else renderCarousel(publicDataCache.Banners||[]);});
  for(const id of ['public-search','public-sort','public-year-filter','public-table-selector'])document.getElementById(id)?.addEventListener(id==='public-search'?'input':'change',()=>{UI12.page=1;renderPublicTable();});
  document.getElementById('open-trash')?.addEventListener('click',openTrash);
  document.addEventListener('pointerdown',e=>{const button=e.target.closest?.('button');if(!button)return;const rect=button.getBoundingClientRect();button.style.setProperty('--press-x',(e.clientX-rect.left)+'px');button.style.setProperty('--press-y',(e.clientY-rect.top)+'px');});
  if(typeof MutationObserver!=='undefined')new MutationObserver(mutations=>{for(const mutation of mutations)for(const node of mutation.addedNodes)if(node.nodeType===1)UI12.upgradeIcons(node);}).observe(document.body,{subtree:true,childList:true});
  // Swipe support uses a threshold so taps and vertical scrolling still work.
  let touchStart=null;const book=document.getElementById('flipbook');book?.addEventListener('touchstart',e=>{touchStart=e.touches[0];},{passive:true});book?.addEventListener('touchend',e=>{if(!touchStart)return;const end=e.changedTouches[0],dx=end.clientX-touchStart.clientX,dy=end.clientY-touchStart.clientY;if(Math.abs(dx)>60&&Math.abs(dx)>Math.abs(dy)*1.5)turnPage(dx<0?1:-1);touchStart=null;},{passive:true});
  document.addEventListener('keydown',e=>{
    const dialogs=[...document.querySelectorAll('[role="dialog"]')].filter(el=>!el.classList.contains('hidden'));const modal=dialogs.at(-1);
    if(!modal)return;if(e.key==='Escape'){e.preventDefault();hideModal(modal.id);return;}
    if(e.key==='Tab'){const focusable=[...modal.querySelectorAll('button,input,select,textarea,a[href]')].filter(el=>!el.disabled&&!el.closest('.hidden'));const first=focusable[0],last=focusable.at(-1);if(e.shiftKey&&document.activeElement===first){e.preventDefault();last?.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first?.focus();}}
  });
});

let installPrompt=null;
window.addEventListener('beforeinstallprompt',event=>{event.preventDefault();installPrompt=event;document.getElementById('install-app')?.classList.remove('hidden');});
window.addEventListener('appinstalled',()=>{installPrompt=null;document.getElementById('install-app')?.classList.add('hidden');});
document.addEventListener('DOMContentLoaded',()=>{
  document.getElementById('install-app')?.addEventListener('click',async()=>{if(!installPrompt)return;await installPrompt.prompt();installPrompt=null;document.getElementById('install-app').classList.add('hidden');});
  if(!('serviceWorker' in navigator)||location.protocol==='file:')return;
  navigator.serviceWorker.register('service-worker.js?v=12').then(registration=>{
    const showUpdate=()=>{if(registration.waiting){UI12.waitingWorker=registration.waiting;document.getElementById('update-notice')?.classList.remove('hidden');}};
    showUpdate();registration.addEventListener('updatefound',()=>{registration.installing?.addEventListener('statechange',showUpdate);});
    document.getElementById('activate-update')?.addEventListener('click',()=>{if(document.body.classList.contains('modal-open')&&!confirm(statusMessage('Close your current form and load the update? Unsaved changes will be lost.','ప్రస్తుత ఫారమ్ మూసి కొత్త వెర్షన్ తెరవాలా? భద్రపరచని మార్పులు పోతాయి.')))return;UI12.waitingWorker?.postMessage({type:'ACTIVATE_UPDATE'});});
    let reloading=false;navigator.serviceWorker.addEventListener('controllerchange',()=>{if(UI12.waitingWorker&&!reloading){reloading=true;location.reload();}});
  }).catch(error=>{showToast(statusMessage('Offline installation failed. Check that all package files were uploaded.','ఆఫ్‌లైన్ ఇన్‌స్టాలేషన్ విఫలమైంది. అన్ని ఫైళ్లను అప్‌లోడ్ చేశారో చూడండి.'),'warning');});
});

/* v13 — JavaScript-only update for the existing v12 HTML and CSS.
 * Load this complete app.js once; do not also load the legacy core/advanced scripts.
 * Backend permissions remain authoritative. Speech recognition needs browser support.
 */
numericDigits=function(value){
  const zeros=[0x660,0x6f0,0x966,0x9e6,0xa66,0xae6,0xb66,0xbe6,0xc66,0xce6,0xd66,0xe50,0xed0,0xff10];
  return Array.from(String(value??''),char=>{const code=char.codePointAt(0);const zero=zeros.find(z=>code>=z&&code<=z+9);return zero===undefined?char:String(code-zero);}).join('');
};
function dictationNumber(text){
  const value=numericDigits(text).trim().replace(/,/g,'').replace(/\s*(rupees?|రూపాయలు|₹)\s*/gi,'');
  return /^\d+(?:\.\d+)?$/.test(value)&&Number.isFinite(Number(value))?value:null;
}
const VoiceController13={
  generation:0,timer:null,input:null,placeholder:'',
  stop(){this.generation++;clearTimeout(this.timer);const old=activeRecognition;activeRecognition=null;try{old?.abort();}catch{}if(this.input)this.input.placeholder=this.placeholder;this.input=null;document.getElementById('voice-pulse')?.classList.add('hidden');document.getElementById('btn-voice-input')?.setAttribute('aria-pressed','false');},
  start(input,{language,append=false,numeric=false}={}){
    if(!input)return;
    if(activeRecognition){this.stop();return;}
    const Rec=window.SpeechRecognition||window.webkitSpeechRecognition;
    if(!Rec)return showToast(statusMessage('Voice input is unavailable here. Please type.','ఇక్కడ వాయిస్ ఇన్‌పుట్ అందుబాటులో లేదు. టైప్ చేయండి.'),'warning');
    this.stop();window.stopAIaudio();const generation=this.generation,initial=input.value,rec=new Rec();activeRecognition=rec;
    const current=()=>generation===this.generation&&activeRecognition===rec;
    const finish=()=>{if(!current())return;clearTimeout(this.timer);activeRecognition=null;document.getElementById('voice-pulse')?.classList.add('hidden');document.getElementById('btn-voice-input')?.setAttribute('aria-pressed','false');input.placeholder=placeholder;};
    const placeholder=input.placeholder;this.input=input;this.placeholder=placeholder;
    rec.lang=language||(appState.lang==='te'?'te-IN':'en-IN');rec.interimResults=true;rec.maxAlternatives=3;rec.continuous=false;
    rec.onstart=()=>{if(!current())return;input.placeholder=statusMessage('Listening…','వింటున్నాను…');document.getElementById('voice-pulse')?.classList.remove('hidden');document.getElementById('btn-voice-input')?.setAttribute('aria-pressed','true');};
    rec.onresult=event=>{
      if(!current()||!input.isConnected)return;
      const transcript=Array.from(event.results,r=>r[0].transcript).join(' ').trim();
      if(numeric){const parsed=dictationNumber(transcript);if(parsed!==null)input.value=parsed;else if(Array.from(event.results).every(r=>r.isFinal))showToast(statusMessage('The amount was unclear. Type the number before saving.','మొత్తం స్పష్టంగా లేదు. భద్రపరిచే ముందు సంఖ్య టైప్ చేయండి.'),'warning');}
      else input.value=(append&&initial?initial+' ':'')+numericDigits(transcript);
      input.dispatchEvent(new Event('input',{bubbles:true}));
    };
    rec.onerror=event=>{if(!current())return;const messages={'not-allowed':statusMessage('Allow microphone access in your browser.','బ్రౌజర్‌లో మైక్రోఫోన్ అనుమతి ఇవ్వండి.'),'audio-capture':statusMessage('No microphone was found.','మైక్రోఫోన్ కనిపించలేదు.'),'no-speech':statusMessage('No speech detected. Tap the mic to try again.','మాటలు వినబడలేదు. మళ్ళీ మైక్ నొక్కండి.'),network:statusMessage('The speech service could not connect. You can still type.','వాయిస్ సేవ కనెక్ట్ కాలేదు. టైప్ చేయవచ్చు.')};if(event.error!=='aborted')showToast(messages[event.error]||statusMessage('Voice input stopped. Please try again.','వాయిస్ ఆగింది. మళ్ళీ ప్రయత్నించండి.'),'warning');finish();};
    rec.onend=finish;
    try{rec.start();this.timer=setTimeout(()=>{if(current()){finish();try{rec.abort();}catch{}}},45000);}catch(error){finish();showToast(statusMessage('Could not start the microphone. Please try again.','మైక్ ప్రారంభం కాలేదు. మళ్ళీ ప్రయత్నించండి.'),'warning');}
  }
};
window.startVoiceRecognition=()=>VoiceController13.start(document.getElementById('chat-input'));
window.startFieldVoice=function(field){
  if(!AuthManager.isAdmin())return;const input=document.getElementById('crud-field-'+field);if(!input)return;
  VoiceController13.start(input,{append:input.tagName==='TEXTAREA',numeric:input.type==='number',language:field.endsWith('En')?'en-IN':field.endsWith('Te')?'te-IN':undefined});
};

let editSnapshot13=null;
const openRecord13=openRecordModal;
openRecordModal=function(id=null){
  if(!AuthManager.isAdmin())return;
  openRecord13(id);const row=(adminDataCache[currentTableName]||[]).find(r=>String(r.id)===String(id));
  editSnapshot13=id?{table:currentTableName,id:String(id),version:row?.updatedAt||row?.createdAt||''}:null;
  for(const input of document.querySelectorAll('#crud-form-fields input[type="number"]')){
    if(input.parentNode.querySelector('[data-numeric-dictation]'))continue;
    const button=document.createElement('button');button.type='button';button.className='advanced-button';button.dataset.numericDictation='true';button.textContent=statusMessage('Dictate number','సంఖ్య చెప్పండి');button.onclick=()=>window.startFieldVoice(input.id.slice(11));input.parentNode.append(button);
  }
};
window.openRecordModal=openRecordModal;
const clearSession13=AuthManager.clearSession.bind(AuthManager);
AuthManager.clearSession=function(){VoiceController13.stop();editSnapshot13=null;clearSession13();};
const hideModal13=hideModal;
hideModal=function(id){if(id==='crud-modal')VoiceController13.stop();hideModal13(id);};window.hideModal=hideModal;
const language13=setLanguage;
setLanguage=function(lang){VoiceController13.stop();language13(lang);document.querySelectorAll('[data-numeric-dictation]').forEach(el=>el.textContent=statusMessage('Dictate number','సంఖ్య చెప్పండి'));};window.setLanguage=setLanguage;
document.addEventListener('visibilitychange',()=>{if(document.hidden){VoiceController13.stop();window.stopAIaudio();}});
window.addEventListener('pagehide',()=>{VoiceController13.stop();window.stopAIaudio();});
document.addEventListener('DOMContentLoaded',()=>{
  const chat=document.getElementById('chat-input');
  // IME Enter confirms Telugu composition; it must not submit the message.
  chat?.addEventListener('keydown',event=>{if(event.isComposing||event.keyCode===229)event.stopImmediatePropagation();},true);
  document.addEventListener('keydown',event=>{
    if(event.isComposing||event.ctrlKey||event.metaKey||event.altKey)return;
    if(event.key==='Escape'){VoiceController13.stop();return;}
    if(/INPUT|TEXTAREA|SELECT/.test(event.target.tagName)||event.target.isContentEditable)return;
    if(event.key==='/'&&!AuthManager.isAdmin()){const search=document.getElementById('public-search');if(search){event.preventDefault();search.focus();}}
  });
  const online=()=>showToast(statusMessage('Connection restored. You can refresh records.','ఇంటర్నెట్ వచ్చింది. రికార్డులను రిఫ్రెష్ చేయవచ్చు.'),'info');window.addEventListener('online',online);
});

/* MUSIKA v14. Full app.js, existing HTML/CSS. No secrets in the browser. */
Object.assign(TABLE_SCHEMAS,{
 FestivalDays:['id','festivalName','financialYear','dayNumber','date','title','description','plannedBudget','visibility','sourceUrl','status'],
 Panchang:['id','date','location','timeZone','tithi','nakshatra','tithiEnds','nakshatraEnds','sunrise','sourceUrl','visibility','status'],
 SpecialDays:['id','date','financialYear','title','description','visibility','sourceUrl','status']
});
for(const table of ['FestivalDays','SpecialDays'])if(!PUBLIC_TABLE_WHITELIST.includes(table))PUBLIC_TABLE_WHITELIST.push(table);
for(const [table,fields] of Object.entries({Donors:['nameEn','nameTe'],Donations:['donorId','donorNameEn','donorNameTe']}))for(const f of fields)if(!TABLE_SCHEMAS[table].includes(f))TABLE_SCHEMAS[table].push(f);
Object.assign(QUERY_ALIASES,{FestivalDays:['festival days','navaratri','navarathri','chavithi','chaturthi','నవరాత్రి','చవితి'],SpecialDays:['special days','festivals','పండుగలు'],Panchang:['panchang','pancham','tithi','nakshatra','తిథి','నక్షత్రం','పంచాంగం']});
const UI14={pending:null,greeted:'',autoSend:false};
AdvancedUI.money=v=>new Intl.NumberFormat(appState.lang==='te'?'te-IN-u-nu-latn':'en-IN',{style:'currency',currency:'INR',minimumFractionDigits:0,maximumFractionDigits:2}).format(CommunityCore.num(v));
function now14(){const parts=Object.fromEntries(new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Kolkata',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(new Date()).map(p=>[p.type,p.value]));return {date:parts.year+'-'+parts.month+'-'+parts.day,hour:Number(parts.hour),time:parts.hour+':'+parts.minute};}
function greeting14(){const h=now14().hour,name=AuthManager.state.userName||statusMessage('friend','మిత్రమా');return statusMessage(h<12?'Good morning':h<17?'Good afternoon':'Good evening',h<12?'శుభోదయం':h<17?'శుభ మధ్యాహ్నం':'శుభ సాయంత్రం')+', '+name+'. '+statusMessage('Ask about donations, yearly expenses, festivals, time or weather.','విరాళాలు, వార్షిక ఖర్చులు, పండుగలు, సమయం లేదా వాతావరణం గురించి అడగండి.');}
const toggle14=window.toggleChat;
window.toggleChat=function(){toggle14();const box=document.getElementById('chat-box');if(!box?.classList.contains('hidden')){const key=(AuthManager.state.token||'public')+appState.lang;if(UI14.greeted!==key){UI14.greeted=key;const message=greeting14();addMooshikaMessage(AdvancedUI.esc(message));window.speakAIResponse(message);}}else{VoiceController13.stop();window.stopAIaudio();}};
const speech14=window.speakAIResponse;
window.speakAIResponse=text=>speech14(numericDigits(text).replace(/(\d)\.00\b/g,'$1'));
const number13=dictationNumber;
dictationNumber=function(text){
 const direct=number13(text);if(direct!==null)return direct;
 const small={zero:0,one:1,two:2,three:3,four:4,five:5,six:6,seven:7,eight:8,nine:9,ten:10,eleven:11,twelve:12,thirteen:13,fourteen:14,fifteen:15,sixteen:16,seventeen:17,eighteen:18,nineteen:19,twenty:20,thirty:30,forty:40,fifty:50,sixty:60,seventy:70,eighty:80,ninety:90,'ఒకటి':1,'ఒక':1,'రెండు':2,'మూడు':3,'నాలుగు':4,'ఐదు':5,'ఆరు':6,'ఏడు':7,'ఎనిమిది':8,'తొమ్మిది':9,'పది':10,'వంద':100,'రెండువందలు':200};
 const scales={hundred:100,thousand:1000,lakh:100000,lac:100000,crore:10000000,'వందలు':100,'వెయ్యి':1000,'వేలు':1000,'లక్ష':100000,'లక్షలు':100000};
 const tokens=numericDigits(text).toLowerCase().replace(/rupees?|రూపాయలు|₹|\band\b/g,' ').trim().split(/[\s-]+/);let sum=0,part=0,seen=false;
 for(const word of tokens){if(!word)continue;if(Object.hasOwn(small,word)){part+=small[word];seen=true;}else if(/^\d+$/.test(word)){part+=Number(word);seen=true;}else if(scales[word]){part=(part||1)*scales[word];if(scales[word]>=1000){sum+=part;part=0;}seen=true;}else return null;}
 return seen&&sum+part<=1000000000?String(sum+part):null;
};
const fields14={
 'english name':'donorNameEn','telugu name':'donorNameTe','పేరు':'name','name':'name','donor name':'donorName','దాత పేరు':'donorName','amount':'amount','మొత్తం':'amount','year':'financialYear','సంవత్సరం':'financialYear','quantity':'quantity','పరిమాణం':'quantity','unit price':'unitPrice','ధర':'unitPrice','actual cost':'actualCost','వాస్తవ ఖర్చు':'actualCost','estimated cost':'estimatedCost','title':'title','శీర్షిక':'title','item':'itemName','వస్తువు':'itemName','date':'date','తేదీ':'date','category':'category','వర్గం':'category','description':'description','వివరణ':'description','purchased':'isPurchased','కొన్నారా':'isPurchased','visibility':'visibility','status':'status','phone':'phone','ఫోన్':'phone','donor id':'donorId','page number':'pageNumber','day number':'dayNumber','festival name':'festivalName','content':'content','story':'storyText','type':'type','రకం':'type','location':'location','tithi':'tithi','nakshatra':'nakshatra','source url':'sourceUrl'};
function fieldValues14(raw,table){
 const aliases=Object.keys(fields14).sort((a,b)=>b.length-a.length);const escaped=aliases.map(a=>a.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'));const pattern=new RegExp('(?:^|[\\s,;])('+escaped.join('|')+')\\s*(?::|=)?\\s+','gi');
 const matches=[...raw.matchAll(pattern)],result={};
 matches.forEach((m,i)=>{let key=fields14[m[1].toLowerCase()],value=raw.slice(m.index+m[0].length,matches[i+1]?.index??raw.length).replace(/[;,\s]+$/g,'').trim().replace(/^"|"$/g,'');
 if(key==='name')key=table==='Donations'?'donorName':table==='Donors'?'name':table==='FinancialAssistance'||table==='Repayments'?'personName':['GroceryList','PoojaItems'].includes(table)?'itemName':'title';
 if(table==='Donors'&&key==='donorNameEn')key='nameEn';if(table==='Donors'&&key==='donorNameTe')key='nameTe';
 if(key==='amount'&&table==='PoojaItems')key='actualCost';if(key==='amount'&&table==='Repayments')key='amountPaid';
 if(key==='date')key=table==='Donations'?'donationDate':['GroceryList','PoojaItems'].includes(table)?'purchaseDate':table==='Events'?'eventDate':'date';
 if(!TABLE_SCHEMAS[table]?.includes(key)||!value)return;
 if(/^(amount|amountPaid|actualCost|estimatedCost|unitPrice|quantity|financialYear|pageNumber|dayNumber)$/.test(key)){const n=dictationNumber(value);if(n===null)throw new Error(statusMessage('Unclear number for ','సంఖ్య స్పష్టంగా లేదు: ')+key);value=n;}
 if(key==='isPurchased'){if(/^(yes|true|కొన్నాను|అవును)$/i.test(value))value='true';else if(/^(no|false|లేదు)$/i.test(value))value='false';else throw new Error('Use purchased yes or purchased no.');}
 if(['status','visibility','type'].includes(key))value=value.charAt(0).toUpperCase()+value.slice(1).toLowerCase();result[key]=value;
 });return result;
}
function table14(q){if(/\bdonations?\b|విరాళ|చందా/.test(q))return 'Donations';if(/\bdonors?\b|దాత/.test(q))return 'Donors';return Object.keys(TABLE_SCHEMAS).find(t=>q.includes(t.toLowerCase()))||queryDomain(q);}
function draft14(raw){
 const q=normalizeQuery(numericDigits(raw));const mode=/^(?:please\s+)?(?:add|create|new)\b|జోడించు|చేర్చు/.test(q)?'add':/^(?:please\s+)?(?:update|edit)\b|సవరించు|మార్చు/.test(q)?'update':/^(?:please\s+)?(?:delete|remove)\b|తొలగించు/.test(q)?'delete':null;
 if(!mode)return null;if(!AuthManager.isAdmin())return queryReply(AdvancedUI.label('private'));
 const table=table14(q);if(!table||READ_ONLY_TABLES.includes(table))return queryReply('Name an editable table, such as Donations, Donors, GroceryList or Notes.');
 const values=fieldValues14(raw,table);let row=null;
 if(mode!=='add'){
 const explicit=raw.match(/(?:\bid\s+)([\w-]+)/i)?.[1];const name=values.donorName||values.name||values.personName||values.itemName||values.title;
 const rows=(adminDataCache[table]||[]).filter(r=>CommunityCore.live(r)).filter(r=>explicit?String(r.id)===explicit:name?[r.donorName,r.name,r.personName,r.itemName,r.title].some(v=>normalizeQuery(v)===normalizeQuery(name)):false).filter(r=>!values.financialYear||String(r.financialYear)===values.financialYear);
 if(rows.length!==1){renderTableView(table);return queryReply(statusMessage('Choose an exact record ID. Matching records: ','ఖచ్చితమైన రికార్డు ID ఎంచుకోండి. సరిపోలినవి: ')+rows.map(r=>r.id).join(', '));}row=rows[0];
 }
 currentTableName=table;
 if(mode!=='delete'){openRecordModal(row?.id||null);if(table==='FinancialTracker'&&mode==='add')values.type=values.type||'Expense';for(const [key,value]of Object.entries(values)){const input=document.getElementById('crud-field-'+key);if(input)input.value=value;}}
 UI14.pending={mode,table,id:row?.id,version:row?.updatedAt||row?.createdAt||'',token:AuthManager.state.token};
 return queryReply((mode==='delete'?statusMessage('Delete this record? ','ఈ రికార్డు తొలగించాలా? ')+table+' '+row.id+' '+(row.donorName||row.name||row.itemName||row.title||''):statusMessage('Draft opened. Review the form. You can say “amount 200” or “name Setaramudhu”. ','ముసాయిదా తెరిచాను. ఫారమ్ పరిశీలించండి. “మొత్తం 200” లేదా “పేరు సీతారాముడు” చెప్పవచ్చు. '))+statusMessage('Say “confirm save” / “confirm delete”, or “cancel”.','“భద్రపరచు” / “తొలగింపు నిర్ధారించు”, లేదా “రద్దు” చెప్పండి.'));
}
async function confirm14(deleting){
 const p=UI14.pending;if(!p||p.token!==AuthManager.state.token||!AuthManager.isAdmin())return queryReply(AdvancedUI.label('private'));
 if(deleting!==(p.mode==='delete'))return queryReply('Use the confirmation for the current draft.');
 UI14.pending=null;
 if(deleting){await apiCall('delete',{sheetName:p.table,id:p.id,expectedUpdatedAt:p.version});await loadAdminDashboard();await loadPublicData();return queryReply(statusMessage('Record moved to trash.','రికార్డు తొలగించిన జాబితాకు మార్చాను.'));}
 if(currentTableName!==p.table||document.getElementById('crud-modal')?.classList.contains('hidden'))return queryReply('The draft was closed. Open the record again.');
 await saveRecord();if(!document.getElementById('crud-modal')?.classList.contains('hidden')){UI14.pending=p;return queryReply(statusMessage('Not saved. Review the error in the form.','భద్రపరచలేదు. ఫారమ్‌లో లోపం చూడండి.'));}return queryReply(statusMessage('Record saved.','రికార్డు భద్రపరచబడింది.'));
}
function donorAnswer14(raw,year){
 const db=AuthManager.isAdmin()?adminDataCache:publicDataCache;const q=normalizeQuery(raw);
 if(!AuthManager.isAdmin()&&Array.isArray(db.DonorTotals)&&!/today|ఈ రోజు|ఈరోజు|\bfor\b|\bnamed\b|పేరు/.test(q)){
 const totals=db.DonorTotals.filter(r=>year==='all'||String(r.financialYear)===year);if(!totals.length)return queryReply(statusMessage('No verified donations for this year.','ఈ సంవత్సరానికి ధృవీకరించిన విరాళాలు లేవు.'));
 const lines=totals.map(r=>(appState.lang==='te'?r.donorNameTe||r.donorName:r.donorNameEn||r.donorName)+' ('+r.financialYear+'): '+AdvancedUI.money(r.totalAmount));const total=totals.reduce((sum,r)=>sum+Math.round(CommunityCore.num(r.totalAmount)*100),0)/100;
 return {html:'<p>'+AdvancedUI.money(total)+'</p><ul>'+lines.slice(0,50).map(l=>'<li>'+AdvancedUI.esc(l)+'</li>').join('')+'</ul>',speech:lines.slice(0,10).join('. ')+'. '+statusMessage('Total ','మొత్తం ')+AdvancedUI.money(total)};
 }
 let rows=(db.Donations||[]).filter(r=>CommunityCore.live(r)&&r.status==='Verified'&&(year==='all'||CommunityCore.year(r)===year));
 if(/today|ఈ రోజు|ఈరోజు/.test(q))rows=rows.filter(r=>String(r.donationDate||r.date||r.createdAt||'').slice(0,10)===now14().date);
 const specific=raw.match(/(?:for|named|పేరు)\s+["“]?(.+?)["”]?(?:\s+20\d{2}|$)/i)?.[1];if(specific)rows=rows.filter(r=>[r.donorName,r.donorNameEn,r.donorNameTe].some(v=>normalizeQuery(v).includes(normalizeQuery(specific))));
 if(!rows.length)return queryReply(statusMessage('No verified donations match that query.','ఈ ప్రశ్నకు సరిపోయే ధృవీకరించిన విరాళాలు లేవు.'));
 const groups=new Map();for(const r of rows){const donor=AuthManager.isAdmin()?(db.Donors||[]).find(d=>d.id===r.donorId):null;const name=appState.lang==='te'?r.donorNameTe||donor?.nameTe||r.donorName:r.donorNameEn||donor?.nameEn||r.donorName;const key=r.donorId||r.id||Symbol();const g=groups.get(key)||{name,total:0,count:0};g.total+=Math.round(CommunityCore.num(r.amount)*100);g.count++;groups.set(key,g);}
 const list=[...groups.values()],total=list.reduce((s,g)=>s+g.total,0)/100;const lines=list.slice(0,50).map(g=>g.name+': '+AdvancedUI.money(g.total/100));
 return {html:'<p>'+AdvancedUI.esc(year+' · '+statusMessage('Verified total','ధృవీకరించిన మొత్తం')+' '+AdvancedUI.money(total))+'</p><ul>'+lines.map(l=>'<li>'+AdvancedUI.esc(l)+'</li>').join('')+'</ul>'+(list.length>50?'<p>Showing first 50; use the table for all records.</p>':''),speech:lines.slice(0,10).join('. ')+'. '+statusMessage('Total ','మొత్తం ')+AdvancedUI.money(total)};
}
async function specialQuery14(kind,raw,year){
 if(kind==='weather')return MusikaIntegration19.execute(appState.lang==='te'?'వాతావరణం':'weather');
 if(kind==='panchang'){const date=numericDigits(raw).match(/20\d{2}-\d{2}-\d{2}/)?.[0]||now14().date;const {data}=await apiCall('getPanchang',{date});if(!data.length)return queryReply(statusMessage('No verified panchang saved for this date and location. Ask an admin to add a sourced Panchang entry.','ఈ తేదీ, ప్రదేశానికి ధృవీకరించిన పంచాంగం లేదు. ఆధారంతో పంచాంగం నమోదు చేయమని అడ్మిన్‌ను అడగండి.'));return queryReply(data.map(r=>[r.date,r.location,r.timeZone,'Tithi: '+r.tithi,'until '+r.tithiEnds,'Nakshatra: '+r.nakshatra,'until '+r.nakshatraEnds,'Source: '+r.sourceUrl].join(' · ')).join('\n'));}
 const {data}=await apiCall('getFestivalReport',{year:year==='all'?now14().date.slice(0,4):year});if(!data.length)return queryReply(statusMessage('No festival schedule is saved for that year. Admin: add dated FestivalDays records for day 1 through the final day.','ఈ సంవత్సరానికి పండుగ షెడ్యూల్ లేదు. అడ్మిన్: మొదటి రోజు నుండి చివరి రోజు వరకు తేదీలతో FestivalDays నమోదు చేయండి.'));
 return {html:'<table><thead><tr><th>Festival / Day / Date</th><th>Donations</th><th>Expenses</th><th>Net cash</th></tr></thead><tbody>'+data.map(r=>'<tr><td>'+AdvancedUI.esc(r.festivalName+' / '+r.dayNumber+' / '+r.date)+'</td><td>'+AdvancedUI.money(r.donations)+'</td><td>'+AdvancedUI.money(r.expenses)+'</td><td>'+AdvancedUI.money(r.netCash)+'</td></tr>').join('')+'</tbody></table><p>'+statusMessage('Day totals include all committee transactions dated that day.','రోజువారీ మొత్తాల్లో ఆ తేదీ కమిటీ లావాదేవీలన్నీ ఉంటాయి.')+'</p>',speech:data.slice(0,10).map(r=>r.festivalName+' '+r.dayNumber+': '+AdvancedUI.money(r.donations)+', '+AdvancedUI.money(r.expenses)).join('. ')};
}
const query13=MusikaQueryEngine.execute.bind(MusikaQueryEngine);
MusikaQueryEngine.execute=function(raw){
 const q=normalizeQuery(numericDigits(raw)),year=q.match(/\b20\d{2}\b/)?.[0]||(/this year|ఈ సంవత్సరం/.test(q)?now14().date.slice(0,4):appState.currentYear||'all');
 if(/^(cancel|రద్దు)[.!]?$/i.test(q)){UI14.pending=null;hideModal('crud-modal');return queryReply(statusMessage('Cancelled.','రద్దు చేశాను.'));}
 if(/^(confirm save|save|భద్రపరచు)[.!]?$/.test(q))return confirm14(false);
 if(/^(confirm delete|తొలగింపు నిర్ధారించు)[.!]?$/.test(q))return confirm14(true);
 const draft=draft14(raw);if(draft)return draft;
 if(UI14.pending&&UI14.pending.mode!=='delete'&&AuthManager.isAdmin()&&UI14.pending.token===AuthManager.state.token&&!document.getElementById('crud-modal')?.classList.contains('hidden')){
 const values=fieldValues14(raw,UI14.pending.table);if(Object.keys(values).length){for(const [key,value]of Object.entries(values)){const input=document.getElementById('crud-field-'+key);if(input)input.value=value;}return queryReply(statusMessage('Draft updated. Review, then say confirm save.','ముసాయిదా మార్చాను. పరిశీలించి భద్రపరచు చెప్పండి.'));}}
 if(/^(hi|hello|good morning|good evening|good afternoon|నమస్కారం|శుభోదయం)[.! ]*$/.test(q))return queryReply(greeting14());
 if(/weather|వాతావరణం/.test(q))return specialQuery14('weather',raw,year);
 if(/panchang|pancham|tithi|naksh|తిథి|నక్షత్ర|పంచాంగ/.test(q))return specialQuery14('panchang',raw,year);
 if(/festival.*report|day.*report|navarat|navarath|chavthi|chavithi|chaturthi|నవరాత్రి|చవితి/.test(q))return specialQuery14('festival',raw,year);
 if(/^(?:what is |tell |today |current )?(?:time|date)|సమయం|ఈరోజు తేదీ/.test(q))return queryReply(now14().date+' '+now14().time+' IST');
 if(/donor|donation|donaname|దాత|విరాళ|చందా/.test(q)&&!/compar|versus|\bvs\b|పోల్చు/.test(q))return donorAnswer14(raw,year);
 if(/grocer|pooja|puja|కిరాణా|పూజా/.test(q)&&/expense|cost|total|ఖర్చు|మొత్తం/.test(q)){
 if(!AuthManager.isAdmin())return queryReply(statusMessage('Detailed expense records are private. Ask for the annual report for public totals.','వివరమైన ఖర్చులు ప్రైవేట్. బహిరంగ మొత్తాలకు వార్షిక నివేదిక అడగండి.'));
 const r=CommunityCore.report(adminDataCache,year),category=/grocer|కిరాణా/.test(q)?'Groceries':'Pooja';return queryReply(year+' '+category+': '+AdvancedUI.money(r.categories[category]||0));}
 if(/sloka|shloka|శ్లోక|మంత్ర|mantra|mataram|pooja procedure/.test(q)){
 const db=AuthManager.isAdmin()?adminDataCache:publicDataCache;const rows=(db.CulturalStories||[]).filter(CommunityCore.live);if(!rows.length)return queryReply(statusMessage('Add slokas, mantras and pooja instructions in CulturalStories and publish the entries you want visitors to read.','శ్లోకాలు, మంత్రాలు, పూజా విధానం CulturalStoriesలో నమోదు చేసి బహిరంగంగా చూపాల్సినవి ప్రచురించండి.'));return queryReply(rows.slice(0,3).map(r=>AdvancedUI.text(r,'title')+'\n'+AdvancedUI.text(r,'storyText')).join('\n\n'));}
 return query13(raw);
};
sendChatMessage=async function(){
 const input=document.getElementById('chat-input'),raw=input?.value.trim();if(!raw||chatBusy)return;const token=AuthManager.state.token;chatBusy=true;input.value='';addMooshikaMessage(raw,'user');const button=document.getElementById('btn-chat-send');if(button)button.disabled=true;document.getElementById('typing-indicator')?.classList.remove('hidden');
 try{const result=await MusikaQueryEngine.execute(raw);if(token!==AuthManager.state.token)return;addMooshikaMessage(result.html);if(result.speech)window.speakAIResponse(result.speech);}catch(error){if(token===AuthManager.state.token)addMooshikaMessage(AdvancedUI.esc(apiErrorMessage(error)));}finally{chatBusy=false;if(button)button.disabled=false;document.getElementById('typing-indicator')?.classList.add('hidden');}
};window.sendChatMessage=sendChatMessage;
const clear14=AuthManager.clearSession.bind(AuthManager);AuthManager.clearSession=function(){UI14.pending=null;UI14.greeted='';clear14();};
const mic14=window.startVoiceRecognition;window.startVoiceRecognition=function(){mic14();const rec=activeRecognition;if(!rec||!UI14.autoSend)return;const handler=rec.onresult,token=AuthManager.state.token;let sent=false;rec.onresult=event=>{handler(event);if(!sent&&activeRecognition===rec&&token===AuthManager.state.token&&Array.from(event.results).every(r=>r.isFinal)){sent=true;VoiceController13.stop();sendChatMessage();}};};
const publication13=renderPublicationNotice;
renderPublicationNotice=function(){publication13();const host=document.getElementById('publication-notice');if(!host)return;const note=document.createElement('p');note.textContent=statusMessage('Missing banners: check imageUrl, status Active and visibility Public. Use Publish below for banners you want everyone to see. Blank visibility is treated as public.','బ్యానర్లు లేవా: imageUrl, స్థితి Active, visibility Public తనిఖీ చేయండి. అందరికీ చూపాల్సిన బ్యానర్లకు క్రింద ప్రచురించు నొక్కండి. ఖాళీ visibility బహిరంగంగా పరిగణించబడుతుంది.');host.prepend(note);
 for(const row of adminDataCache.Banners||[]){const vis=String(row.visibility||'').trim().toLowerCase();if((!vis||vis==='public')&&CommunityCore.live(row))continue;const b=document.createElement('button');b.className='advanced-button';b.type='button';b.textContent=statusMessage('Publish banner: ','బ్యానర్ ప్రచురించు: ')+AdvancedUI.text(row,'title');b.onclick=async()=>{if(!AuthManager.isAdmin()||b.disabled)return;b.disabled=true;try{await apiCall('update',{sheetName:'Banners',expectedUpdatedAt:row.updatedAt||row.createdAt||'',data:{id:row.id,visibility:'Public',status:'Active'}});await loadAdminDashboard();await loadPublicData();showToast(statusMessage('Banner published.','బ్యానర్ ప్రచురించాను.'));}catch(error){showToast(apiErrorMessage(error),'error');b.disabled=false;}};host.append(b);}
};
const years13=updateAvailableYears;updateAvailableYears=function(){years13();for(const id of ['global-year-filter','public-year-filter','section-flipbook-year','finance-year','flipbook-year-select']){const el=document.getElementById(id);if(!el)continue;const selected=el.value;for(let y=new Date().getFullYear()+2;y<=Math.min(2099,new Date().getFullYear()+10);y++)if(![...el.options].some(o=>o.value===String(y))){const o=document.createElement('option');o.value=String(y);o.textContent=String(y);el.append(o);}el.value=selected;}};

/* Public view update: banner table integration and expanded public selector. */
const PUBLIC_VIEW_TABLES14=['Donors','Donations','Banners','Events','FoodDistribution','CulturalStories','FlipBook','FestivalHistory','Announcements','AIKnowledge','FestivalDays','SpecialDays','GroceryList','PoojaItems'];
for(const table of PUBLIC_VIEW_TABLES14)if(typeof PUBLIC_TABLE_WHITELIST!=='undefined'&&!PUBLIC_TABLE_WHITELIST.includes(table))PUBLIC_TABLE_WHITELIST.push(table);
function publicSafeText14(v){return String(v??'').replace(/[<>]/g,'').trim();}
function publicBannerText14(row,key){const lang=typeof appState!=='undefined'&&appState.lang==='te'?'Te':'En';return publicSafeText14(row[key+lang]||row[key]||(key==='title'?row.tittle:'')||'');}
function publicBannerImage14(v){const u=String(v||'').trim();return /^https:\/\//i.test(u)||/^(?:\.\/|[^/]+\.(?:png|jpe?g|webp|gif)(?:\?.*)?)$/i.test(u)?u:'';}
function renderPublicBanners14(rows){
 const track=document.getElementById('carousel-track');if(!track)return;clearInterval(carouselTimer);slideIndex=0;track.style.transform='translateX(0)';track.replaceChildren();
 const live=(Array.isArray(rows)?rows:[]).filter(r=>!r.deletedAt&&(String(r.visibility||'').trim()===''||String(r.visibility).trim().toLowerCase()==='public')&&String(r.status||'Active').toLowerCase()!=='inactive');
 if(!live.length){const s=document.createElement('div');s.className='min-w-full h-full relative flex-shrink-0';const i=document.createElement('img');i.src='VINYAKA.jpg';i.alt='Vinayaka Seva Festival';i.className='w-full h-full object-cover';s.append(i);track.append(s);track.dataset.bannerCount='0';return;}
 for(const row of live){const s=document.createElement('div');s.className='min-w-full h-full relative flex-shrink-0';const url=publicBannerImage14(row.imageUrl||row.image||row.bannerUrl);if(url){const i=document.createElement('img');i.src=url;i.alt=publicBannerText14(row,'title')||'Community banner';i.loading='lazy';i.className='w-full h-full object-cover';i.onerror=()=>i.remove();s.append(i);}const shade=document.createElement('div');shade.className='absolute inset-0 bg-gradient-to-t from-amber-950/90 via-amber-900/40 to-transparent flex flex-col justify-end p-8 text-left';const h=document.createElement('h3');h.className='text-3xl md:text-4xl font-black text-amber-300 drop-shadow-md';h.textContent=publicBannerText14(row,'title')||'Vinayaka Seva Festival';const p=document.createElement('p');p.className='text-white font-bold drop-shadow-md text-sm md:text-lg';p.textContent=publicBannerText14(row,'description');shade.append(h,p);s.append(shade);track.append(s);}
 track.dataset.bannerCount=String(track.children.length);track.setAttribute('aria-label',live.length+' published banners');
 if(track.children.length>1&&!document.documentElement.classList.contains('reduce-motion')&&!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches)carouselTimer=setInterval(nextSlide,5000);
}
const publicRender14=renderPublicTable;renderPublicTable=function(){const table=document.getElementById('public-table-selector')?.value||'Donations';if(!PUBLIC_VIEW_TABLES14.includes(table)){document.getElementById('public-table-head')?.replaceChildren();document.getElementById('public-table-body')?.replaceChildren();return;}publicRender14();};window.renderPublicTable=renderPublicTable;
const publicLoad14=loadPublicData;loadPublicData=async function(){await publicLoad14();renderPublicBanners14(publicDataCache.Banners||[]);populatePublicTableDropdown();renderPublicTable();};window.loadPublicData=loadPublicData;
document.addEventListener('DOMContentLoaded',()=>{populatePublicTableDropdown();document.getElementById('public-table-selector')?.addEventListener('change',renderPublicTable);document.querySelectorAll('[data-action="prevSlide"]').forEach(b=>b.addEventListener('click',prevSlide));document.querySelectorAll('[data-action="nextSlide"]').forEach(b=>b.addEventListener('click',nextSlide));renderPublicBanners14(publicDataCache?.Banners||[]);});

/* Background speech recognition is provided by MusikaVoice19 below. */
const utilityQuery15=MusikaQueryEngine.execute.bind(MusikaQueryEngine);MusikaQueryEngine.execute=function(raw){const q=normalizeQuery(raw);if(/map|location|directions|మ్యాప్|దారి/.test(q)){const x=raw.replace(/.*?(map|location|directions|మ్యాప్|దారి)/i,'').trim()||'Vinayaka Seva';return queryReply('Map: https://www.google.com/maps/search/'+encodeURIComponent(x))}if(/youtube|song|music|పాట|సంగీతం/.test(q)){const x=raw.replace(/.*?(youtube|song|music|పాట|సంగీతం)/i,'').trim()||'Ganesh bhajan';return queryReply('YouTube: https://www.youtube.com/results?search_query='+encodeURIComponent(x))}if(/news|వార్తలు/.test(q)){const x=raw.replace(/.*?(news|వార్తలు)/i,'').trim()||'India';return queryReply('News: https://news.google.com/search?q='+encodeURIComponent(x))}return utilityQuery15(raw)};

/* Multilingual table help and admin command routing. Append after the main app. */
const TABLE_ALIASES16={
 Donations:['donation','donations','donation table','donor donation','విరాళం','విరాళాలు'],Donors:['donor','donors','దాత','దాతలు'],Banners:['banner','banners','బ్యానర్','బ్యానర్లు'],Events:['event','events','కార్యక్రమం'],FoodDistribution:['food distribution','food donation','annadanam','అన్నదానం'],CulturalStories:['story','stories','sloka','mantra','కథ','మంత్రం'],FlipBook:['flipbook','flip book','ఫ్లిప్‌బుక్'],FestivalHistory:['festival history','annual report','వార్షిక నివేదిక'],Announcements:['announcement','ప్రకటన'],FestivalDays:['festival days','festival day','పండుగ రోజు'],SpecialDays:['special days','ప్రత్యేక రోజులు'],GroceryList:['grocery','groceries','kirana','కిరాణా'],PoojaItems:['pooja','puja','పూజ'],FinancialTracker:['expense','expenses','ledger','ఖర్చు','వ్యయం'],FinancialAssistance:['financial assistance','assistance','సహాయం'],Repayments:['repayment','repayments','తిరిగి చెల్లింపు'],Panchang:['panchang','pancham','tithi','nakshatra','పంచాంగం','తిథి','నక్షత్రం']};
const TABLE_FIELDS16={
 Donations:['id','donorId','donorName','donorNameEn','donorNameTe','phone','amount','paymentMethod','utrNumber','category','financialYear','donationDate','status','publicConsent','notes'],Donors:['id','name','nameEn','nameTe','phone','email','village','status'],Banners:['id','title','titleEn','titleTe','description','descriptionEn','descriptionTe','imageUrl','financialYear','visibility','status'],Events:['id','title','titleEn','titleTe','eventDate','financialYear','time','location','description','visibility','status'],FoodDistribution:['id','distributionDate','financialYear','mealType','foodItem','estimatedServings','totalDishCost','sponsorName','visibility','status'],CulturalStories:['id','title','titleEn','titleTe','storyText','storyTextEn','storyTextTe','summary','language','visibility','status'],FlipBook:['id','financialYear','pageNumber','title','storyText','imageUrl','visibility','status'],FestivalHistory:['id','financialYear','title','openingBalance','totalDonations','totalExpenses','closingBalance','status'],Announcements:['id','financialYear','title','message','priority','startDate','endDate','visibility','status'],FestivalDays:['id','festivalName','financialYear','dayNumber','date','title','description','plannedBudget','visibility','status'],SpecialDays:['id','date','financialYear','title','description','visibility','sourceUrl','status'],GroceryList:['id','financialYear','purchaseDate','itemName','category','usedForDish','quantity','unit','unitPrice','totalAmount','vendor','isPurchased','visibility','status'],PoojaItems:['id','financialYear','purchaseDate','dayNumber','itemName','quantity','unit','estimatedCost','actualCost','vendorName','isPurchased','visibility','status'],FinancialTracker:['id','date','financialYear','type','category','subCategory','vendorName','amount','paymentMode','description','visibility','status'],FinancialAssistance:['id','personName','amount','financialYear','issueDate','dueDate','visibility','status','notes'],Repayments:['id','assistanceId','personName','amountPaid','financialYear','paymentDate','paymentMode','visibility','status'],Panchang:['id','date','location','timeZone','tithi','nakshatra','tithiEnds','nakshatraEnds','sunrise','sourceUrl','visibility','status']};
function tableFromText16(raw){const q=normalizeQuery(raw);return Object.keys(TABLE_ALIASES16).sort((a,b)=>a.length-b.length).find(t=>TABLE_ALIASES16[t].some(a=>q.includes(a)))||null;}
function roleName16(){return AuthManager.isAdmin()?'admin':AuthManager.state.role==='user'?'user':'public';}
function tableHelp16(table,raw){
 const fields=TABLE_FIELDS16[table]||TABLE_SCHEMAS[table]||[];const admin=AuthManager.isAdmin();const publicAllowed=PUBLIC_VIEW_TABLES14.includes(table);
 if(!admin&&!publicAllowed)return queryReply(statusMessage('This table is private.','ఈ పట్టిక ప్రైవేట్.'));
 const visible=admin?fields:fields.filter(k=>!['phone','email','utrNumber','notes','personName','assistanceId','vendorName','sourceTable','sourceId'].includes(k));
 const title=statusMessage(table+' table attributes: ','పట్టిక లక్షణాలు: ')+visible.map(k=>AdvancedUI.label(k)).join(', ');
 const rows=(admin?adminDataCache:publicDataCache)[table]||[];const matching=rows.filter(r=>CommunityCore.live(r));
 const data=matching.slice(0,20).map(r=>visible.map(k=>AdvancedUI.label(k)+': '+(k.toLowerCase().includes('amount')||k.toLowerCase().includes('cost')||k==='totalAmount'?AdvancedUI.money(r[k]):AdvancedUI.text(r,k)||'—')).join(' · '));
 return {html:'<h3>'+AdvancedUI.esc(table)+'</h3><p>'+AdvancedUI.esc(title)+'</p>'+(data.length?'<ul>'+data.map(x=>'<li>'+AdvancedUI.esc(x)+'</li>').join('')+'</ul>':'<p>'+AdvancedUI.esc(statusMessage('No published rows.','ప్రచురించిన రికార్డులు లేవు.'))+'</p>'),speech:title+(data.length?'. '+data.slice(0,5).join('. '):'')};
}
const commandBefore16=MusikaQueryEngine.execute.bind(MusikaQueryEngine);
MusikaQueryEngine.execute=function(raw){
 const q=normalizeQuery(numericDigits(raw));const table=tableFromText16(raw);const asksTable=/\b(open|show|display|list|view|fields?|attributes?|attrit\w*|columns?|schema)\b|తెరువు|చూపించు|లక్షణాలు|కాలమ్స్/.test(q);
 if(table&&asksTable)return tableHelp16(table,raw);
 if(/\b(hey|hi|hello|ok|okay)\b.*\b(musika|mooshika)\b|^hey musika$/.test(q)){const answer=greeting14();return queryReply(answer);}
 return commandBefore16(raw);
};
window.MusikaQueryEngine=MusikaQueryEngine;


/* ===== Musika 19 modular integration ===== */
/* Musika 19: shared pure parsing. No DOM, credentials, network or eval(). */
var MusikaCore19 = (() => {
  const digits = value => String(value ?? '').replace(/[\u0660-\u0669\u06f0-\u06f9\u0966-\u096f\u09e6-\u09ef\u0a66-\u0a6f\u0ae6-\u0aef\u0b66-\u0b6f\u0be6-\u0bef\u0c66-\u0c6f\u0ce6-\u0cef\u0d66-\u0d6f]/g, c => {
    const starts = [0x660,0x6f0,0x966,0x9e6,0xa66,0xae6,0xb66,0xbe6,0xc66,0xce6,0xd66];
    return String(c.charCodeAt(0) - starts.find(n => c.charCodeAt(0) >= n && c.charCodeAt(0) < n + 10));
  });
  const small = {zero:0,one:1,two:2,three:3,four:4,five:5,six:6,seven:7,eight:8,nine:9,ten:10,eleven:11,twelve:12,thirteen:13,fourteen:14,fifteen:15,sixteen:16,seventeen:17,eighteen:18,nineteen:19,twenty:20,thirty:30,forty:40,fifty:50,sixty:60,seventy:70,eighty:80,ninety:90,first:1,second:2,third:3,fourth:4,fifth:5,sixth:6,seventh:7,eighth:8,ninth:9,'సున్నా':0,'ఒక':1,'ఒకటి':1,'ఒక్క':1,'రెండు':2,'మూడు':3,'నాలుగు':4,'ఐదు':5,'ఆరు':6,'ఏడు':7,'ఎనిమిది':8,'తొమ్మిది':9,'పది':10,'పదకొండు':11,'పన్నెండు':12,'పదమూడు':13,'పద్నాలుగు':14,'పదిహేను':15,'పదహారు':16,'పదిహేడు':17,'పద్దెనిమిది':18,'పంతొమ్మిది':19,'ఇరవై':20,'ఇరవయ్యి':20,'ముప్పై':30,'నలభై':40,'యాభై':50,'అరవై':60,'డెబ్బై':70,'ఎనభై':80,'తొంభై':90,'మొదటి':1,'రెండవ':2,'రెండో':2,'మూడవ':3,'మూడో':3,'నాలుగవ':4,'నాలుగో':4,'ఐదవ':5,'ఐదో':5,'ఆరవ':6,'ఆరో':6,'ఏడవ':7,'ఎనిమిదవ':8,'తొమ్మిదవ':9};
  const scales = {hundred:100,thousand:1000,lakh:100000,lac:100000,crore:10000000,'వంద':100,'వందలు':100,'వెయ్యి':1000,'వేయి':1000,'వేల':1000,'వేలు':1000,'లక్ష':100000,'లక్షలు':100000,'కోటి':10000000,'కోట్లు':10000000};
  function prepare(value) {
    return digits(value).toLowerCase().replace(/(రెండు|మూడు|నాలుగు|ఐదు|ఆరు|ఏడు|ఎనిమిది|తొమ్మిది)(వందలు|వేల|వేలు|లక్షలు)/g, '$1 $2')
      .replace(/(వేల|వందలు|లక్షలు)(ఇరవై|ముప్పై|నలభై|యాభై)/g, '$1 $2').replace(/(ఇరవై|ముప్పై|నలభై|యాభై)(ఒకటి|రెండు|మూడు|నాలుగు|ఐదు|ఆరు|ఏడు|ఎనిమిది|తొమ్మిది)/g, '$1 $2')
      .replace(/(\d)(?:st|nd|rd|th|వ|వలో|లో)(?=\s|$)/g, '$1').replace(/(?<=\d),(?=\d)/g, '');
  }
  function number(value) {
    const text = prepare(value).replace(/rupees?|రూపాయలు|రూపాయల|₹|\band\b/g,' ').trim();
    if (/^[+-]?\d+(?:\.\d+)?$/.test(text)) return Number.isFinite(Number(text)) ? Number(text) : null;
    let sum=0, part=0, seen=false;
    for (const token of text.split(/[\s-]+/)) {
      if (!token) continue;
      if (Object.prototype.hasOwnProperty.call(small,token)) { part += small[token]; seen=true; }
      else if (/^\d+(?:\.\d+)?$/.test(token)) { part += Number(token); seen=true; }
      else if (scales[token]) { part=(part||1)*scales[token]; if(scales[token]>=1000){sum+=part;part=0;} seen=true; }
      else return null;
    }
    return seen && Number.isFinite(sum+part) && sum+part <= 1e12 ? sum+part : null;
  }
  function year(value, selected='all', current=String(new Date().getFullYear())) {
    const text=prepare(value), candidates=[];
    const runs=text.match(/(?:[\p{L}\p{M}]+|\d+(?:\.\d+)?)/gu)||[];
    let run=[];
    const flush=()=>{
      if(!run.length)return;
      let n=number(run.join(' '));
      // English "twenty twenty five" is a common ASR transcription of 2025.
      const vals=run.map(t=>Object.prototype.hasOwnProperty.call(small,t)?small[t]:Number(t));
      if(vals[0]===20 && vals.length>=2 && vals.slice(1).every(Number.isFinite)) n=2000+vals.slice(1).reduce((a,b)=>a+b,0);
      if(Number.isInteger(n)&&n>=2000&&n<=2199)candidates.push(String(n));
      else for(const t of run)if(/^20\d{2}$|^21\d{2}$/.test(t))candidates.push(t);
      run=[];
    };
    for(const t of runs){if(/^(?:20|21)\d{2}$/.test(t)){flush();candidates.push(t);}else if(Object.prototype.hasOwnProperty.call(small,t)||scales[t]||/^\d+(?:\.\d+)?$/.test(t)||t==='and'&&run.length)run.push(t);else flush();}flush();
    const found=[...new Set(candidates)];
    if(found.length>1)return {year:null,explicit:true,ambiguous:true,years:found};
    if(found.length===1)return {year:found[0],explicit:true,ambiguous:false};
    if(/all years|every year|అన్ని సంవత్సర|అన్ని సంవత్/.test(text))return {year:'all',explicit:true};
    if(/this year|ప్రస్తుత సంవత్స|ఈ సంవత్స/.test(text))return {year:current,explicit:true};
    if(/last year|గత సంవత్స/.test(text))return {year:String(Number(current)-1),explicit:true};
    // A year was spoken but not understood: never silently return all years.
    if(/year|సంవత్స|సంవత్|ఏడాది/.test(text)&&!/^20\d{2}$|^21\d{2}$/.test(String(selected)))return {year:null,explicit:true,ambiguous:true};
    return {year:/^(?:20|21)\d{2}$/.test(String(selected))?String(selected):'all',explicit:false};
  }
  function rowYear(row){for(const k of ['financialYear','year','donationDate','date','eventDate','distributionDate','paymentDate','issueDate','createdAt']){const m=digits(row[k]).match(/^(20\d{2}|21\d{2})/);if(m)return m[1];}return '';}
  function money(value){return new Intl.NumberFormat('en-IN',{style:'currency',currency:'INR',minimumFractionDigits:0,maximumFractionDigits:2}).format(Number(value)||0);}
  function donorRows(db, selected, lang='en', admin=false, raw=''){
    const rows=Array.isArray(db.Donations)?db.Donations:db.DonorTotals||[], totals=!Array.isArray(db.Donations), groups=new Map();
    for(const r of rows){
      if(r.deletedAt||/^(private|admin)$/i.test(String(r.visibility||''))&&!admin)continue;
      if(!totals&&!/^verified$/i.test(String(r.status||'').trim()))continue;
      if(selected!=='all'&&rowYear(r)!==String(selected))continue;
      const anonymous=!admin&&/^(false|no|0|anonymous|private)$/i.test(String(r.publicConsent??'').trim());
      const donor=admin&&r.donorId?(db.Donors||[]).find(d=>String(d.id)===String(r.donorId)):null;
      const name=anonymous?(lang==='te'?'అజ్ఞాత దాత':'Anonymous'):(lang==='te'?r.donorNameTe||donor?.nameTe:r.donorNameEn||donor?.nameEn)||r.donorName||r.name||donor?.name||(lang==='te'?'భక్తులు':'Devotee');
      // Only stable links can merge donations; matching names alone are insufficient.
      const key=(anonymous?'anon:':'')+(r.donorId||r.id||'row:'+groups.size);
      const previous=groups.get(key)||{name,amount:0};
      previous.amount+=Math.round((number(totals?r.totalAmount:r.amount)||0)*100);groups.set(key,previous);
    }
    let result=[...groups.values()].map(r=>({...r,amount:r.amount/100}));
    const normalize=s=>String(s).toLowerCase().replace(/\s+/g,' ').trim();
    const q=normalize(raw), named=q.match(/(?:\bfor\b|\bnamed\b|\bname\b\s*[:=])\s+(.+?)(?:\s+(?:in\s+)?20\d{2}|$)/i);
    if(named)result=result.filter(r=>normalize(r.name).includes(normalize(named[1])));
    else {const matches=result.filter(r=>normalize(r.name).length>2&&q.includes(normalize(r.name)));if(matches.length)result=matches;}
    return result;
  }
  function calculate(expression) {
    const source=digits(expression).replace(/×/g,'*').replace(/÷/g,'/').replace(/\s/g,'');
    if(source.length>240||!/^[\d.+*/^()%\-]+$/.test(source))throw Error('Use numbers and + - * / ^ ( ) only.');
    const tokens=source.match(/\d+(?:\.\d+)?|\.\d+|[+*/^()%\-]/g)||[];
    if(tokens.join('')!==source)throw Error('Invalid expression.');
    let i=0,depth=0;
    const primary=()=>{if(++depth>32)throw Error('Formula too complex.');let v;if(tokens[i]==='('){i++;v=add();if(tokens[i++]!==')')throw Error('Missing closing parenthesis.');}else if(tokens[i]&&/^(?:\d|\.)/.test(tokens[i]))v=Number(tokens[i++]);else throw Error('Expected a number.');depth--;if(tokens[i]==='%'){i++;v/=100;}return v;};
    const power=()=>{let v=primary();if(tokens[i]==='^'){i++;v=Math.pow(v,unary());}return v;};
    const unary=()=>{if(tokens[i]==='+'||tokens[i]==='-'){const sign=tokens[i++];return (sign==='-'?-1:1)*unary();}return power();};
    const multiply=()=>{let v=unary();while(tokens[i]==='*'||tokens[i]==='/'){const op=tokens[i++],b=unary();if(op==='/'&&b===0)throw Error('Cannot divide by zero.');v=op==='*'?v*b:v/b;}return v;};
    const add=()=>{let v=multiply();while(tokens[i]==='+'||tokens[i]==='-'){const op=tokens[i++],b=multiply();v=op==='+'?v+b:v-b;}return v;};
    const result=add();if(i!==tokens.length||!Number.isFinite(result)||Math.abs(result)>1e15)throw Error('Formula result is outside the supported range.');return result;
  }
  function compound(principal,rate,years,periods=1){if(![principal,rate,years,periods].every(Number.isFinite)||principal<0||rate<0||years<0||periods<1||periods>365||!Number.isInteger(periods))throw Error('Invalid compound interest inputs.');const total=principal*Math.pow(1+rate/100/periods,periods*years);if(!Number.isFinite(total)||total>1e15)throw Error('Result too large.');return {principal,rate,years,periods,total:Math.round(total*100)/100,interest:Math.round((total-principal)*100)/100};}
  return {digits,number,year,rowYear,money,donorRows,calculate,compound};
})();

/* Musika 19 services: lazy, bounded requests; cached public content only. */
const MusikaServices = (() => {
  const pending=new Map(),memory=new Map(),config=window.MUSIKA_SERVICES_CONFIG||{};
  const local={get(key){try{return JSON.parse(localStorage.getItem(key)||'null');}catch{return null;}},set(key,value){try{localStorage.setItem(key,JSON.stringify(value));}catch{}}};
  const emit=(name,detail)=>{if(typeof window.CustomEvent==='function')window.dispatchEvent(new CustomEvent(name,{detail}));};
  function safeURL(value){try{const u=new URL(String(value));return u.protocol==='https:'&&!u.username&&!u.password?u.href:null;}catch{return null;}}
  async function json(url,{timeout=5000,method='GET',body,headers={}}={}){
    if(!safeURL(url))throw Error('Invalid service address.');
    const controller=new AbortController();let timer;
    const deadline=new Promise((_,reject)=>{timer=setTimeout(()=>{controller.abort();const e=Error('Service timed out.');e.code='TIMEOUT';reject(e);},Math.min(5000,Math.max(1,timeout)));});
    try{
      // The timer covers both the connection AND decoding the response body.
      return await Promise.race([deadline,(async()=>{const response=await fetch(url,{method,body,headers,signal:controller.signal,credentials:'omit',referrerPolicy:'no-referrer'});if(!response.ok)throw Error('Service unavailable ('+response.status+').');return await response.json();})()]);
    }finally{clearTimeout(timer);}
  }
  async function bridge(provider,params={},timeout=5000){
    const response=await json(window.COMMUNITY_CONFIG.apiUrl,{method:'POST',timeout,headers:{'Content-Type':'text/plain;charset=utf-8'},body:JSON.stringify({...params,action:'externalService',provider})});
    if(response.status!=='success'){const e=Error(response.error?.message||'Service unavailable.');e.code=response.error?.code;throw e;}return response.data;
  }
  async function cached(key,ttl,fn,{persist=false,force=false}={}){
    const stored=memory.get(key)||(persist?local.get('musika19_'+key):null);
    if(!force&&stored&&Date.now()-stored.timestamp>=0&&Date.now()-stored.timestamp<ttl)return {...stored.data,cached:true};
    if(pending.has(key))return pending.get(key);
    const work=(async()=>{try{const data=await fn(),entry={timestamp:Date.now(),data};memory.set(key,entry);if(persist)local.set('musika19_'+key,entry);return data;}catch(e){if(stored)return {...stored.data,stale:true,cached:true};throw e;}finally{pending.delete(key);}})();pending.set(key,work);return work;
  }
  async function fallback(tasks){let last;for(const task of tasks){try{return await task();}catch(e){last=e;}}throw last||Error('Service unavailable.');}
  const sayings=[
    {en:'A small act of service can brighten someone’s day.',te:'చిన్న సేవ కూడా ఒకరి రోజును ఆనందంగా మార్చగలదు.'},
    {en:'Share what you can, and treat every person with kindness.',te:'మీకు చేతనైనది పంచండి. ప్రతి ఒక్కరినీ దయతో చూడండి.'},
    {en:'Let devotion inspire care for your community.',te:'మీ భక్తి సమాజానికి సేవ చేసే ప్రేరణ కావాలి.'}
  ];
  function localWisdom(lang='en'){const r=sayings[Math.floor(Date.now()/86400000)%sayings.length];return {text:r[lang==='te'?'te':'en'],author:'',source:lang==='te'?'సమాజ సేవా సూక్తి':'Community reflection',timestamp:Date.now(),language:lang,offline:true};}
  let quotePending=null;
  async function fetchDailyWisdom({force=false,language=appState.lang}={}){
    const stored=local.get('musika_daily_quote');
    if(!force&&stored&&typeof stored.text==='string'&&Date.now()-stored.timestamp>=0&&Date.now()-stored.timestamp<21600000)return language==='te'&&stored.language!=='te'?localWisdom('te'):{...stored,cached:true};
    // These providers supply English text. Telugu mode uses actual Telugu text,
    // not an invented translation or English spoken with a Telugu voice.
    if(language==='te'){const quote=localWisdom('te');if(!stored||stored.language==='te')local.set('musika_daily_quote',quote);return quote;}
    if(quotePending)return quotePending;
    quotePending=(async()=>{
      const quote=await fallback([
        async()=>{const r=await json('https://api.quotable.io/random?tags=inspirational,wisdom',{timeout:4000});if(!r.content)throw Error('No quote.');return {text:String(r.content),author:String(r.author||''),source:'Quotable',sourceUrl:'https://github.com/lukePeavey/quotable',language:'en'};},
        async()=>{const r=await bridge('zenquotes',{},4000);if(!r.data?.text)throw Error('No quote.');return {...r.data,source:r.source,sourceUrl:r.sourceUrl};},
        async()=>{const r=await json('https://api.adviceslip.com/advice',{timeout:4000});if(!r.slip?.advice)throw Error('No advice.');return {text:String(r.slip.advice),author:'',source:'AdviceSlip',sourceUrl:'https://api.adviceslip.com/',language:'en'};},
        async()=>localWisdom('en')
      ]);quote.text=quote.text.slice(0,1200);quote.timestamp=Date.now();local.set('musika_daily_quote',quote);return quote;
    })();try{return await quotePending;}finally{quotePending=null;}
  }
  let position=null;
  async function location({precise=false}={}){
    if(position&&Date.now()-position.timestamp<1800000&&(!precise||position.source==='device'))return position;
    if(precise&&navigator.geolocation){try{const p=await new Promise((resolve,reject)=>navigator.geolocation.getCurrentPosition(resolve,reject,{timeout:5000,maximumAge:600000,enableHighAccuracy:false}));position={latitude:p.coords.latitude,longitude:p.coords.longitude,name:appState.lang==='te'?'మీ ప్రస్తుత ప్రాంతం':'Your current area',source:'device',timestamp:Date.now()};return position;}catch{}}
    try{const p=await json('https://ipapi.co/json/');if(p.error||typeof p.latitude!=='number'||typeof p.longitude!=='number'||Math.abs(p.latitude)>90||Math.abs(p.longitude)>180)throw Error('Location unavailable.');position={latitude:p.latitude,longitude:p.longitude,name:[p.city,p.region].filter(Boolean).join(', '),source:'IP estimate',timestamp:Date.now()};}
    catch{const lat=Number(config.defaultLatitude??16.5062),lon=Number(config.defaultLongitude??80.648);position={latitude:Number.isFinite(lat)&&Math.abs(lat)<=90?lat:16.5062,longitude:Number.isFinite(lon)&&Math.abs(lon)<=180?lon:80.648,name:String(config.defaultLocation||'Vijayawada area'),source:'configured/default location',timestamp:Date.now()};}
    return position;
  }
  function wmo(code,lang='en'){
    const pair=code===0?['Clear sky','స్వచ్ఛమైన ఆకాశం']:code<=3?['Partly cloudy','మేఘాలు']:code<=48?['Fog','పొగమంచు']:code<=57?['Drizzle','చినుకులు']:code<=67?['Rain','వర్షం']:code<=77?['Snow','మంచు వర్షం']:code<=82?['Rain showers','వర్షపు జల్లులు']:code<=86?['Snow showers','మంచు జల్లులు']:code<=99?['Thunderstorm','ఉరుములతో వర్షం']:['Conditions unavailable','వాతావరణ వివరాలు లేవు'];return pair[lang==='te'?1:0];
  }
  async function weather({precise=true,force=false}={}){
    const place=await location({precise});return cached('weather:'+place.latitude.toFixed(2)+':'+place.longitude.toFixed(2),600000,async()=>{
      const query=new URLSearchParams({latitude:place.latitude,longitude:place.longitude,current:'temperature_2m,relative_humidity_2m,apparent_temperature,precipitation,weather_code,wind_speed_10m',hourly:'precipitation_probability',forecast_days:'2',timezone:'Asia/Kolkata'});
      const r=await fallback([()=>json('https://api.open-meteo.com/v1/forecast?'+query),async()=>(await bridge('weather',place)).data]);
      if(!r.current||typeof r.current.temperature_2m!=='number')throw Error('Weather readings unavailable.');
      const probabilities=(r.hourly?.time||[]).map((t,i)=>({time:t,value:r.hourly.precipitation_probability?.[i]})).filter(x=>x.time>=r.current.time&&typeof x.value==='number').slice(0,6);
      return {place,current:r.current,rainProbability:probabilities.length?Math.max(...probabilities.map(x=>x.value)):null,source:'Open-Meteo',sourceUrl:'https://open-meteo.com/',fetchedAt:new Date().toISOString()};
    },{force});
  }
  async function convert(amount,from='USD',to='INR'){
    from=String(from).toUpperCase();to=String(to).toUpperCase();amount=Number(amount);
    if(!/^[A-Z]{3}$/.test(from)||!/^[A-Z]{3}$/.test(to)||!Number.isFinite(amount)||amount<0||amount>1e10)throw Error('Enter a valid amount and currency.');
    if(from===to)return {amount,from,to,rate:1,converted:amount,source:'Same currency'};
    const rate=await cached('rate:'+from+':'+to,3600000,()=>fallback([
      async()=>{const r=await json('https://api.frankfurter.dev/v1/latest?from='+from+'&to='+to);const value=r.rates?.[to];if(!Number.isFinite(value)||value<=0)throw Error('Rate unavailable.');return {rate:value,date:r.date,source:'Frankfurter / ECB',sourceUrl:'https://frankfurter.dev/'};},
      async()=>{const r=await bridge('exchange',{from,to,amount:1});return {...r.data,source:r.source,sourceUrl:r.sourceUrl};}
    ]),{persist:true});return {...rate,from,to,amount,converted:Math.round(amount*rate.rate*100)/100};
  }
  async function math(expression,operation='simplify'){
    if(operation==='simplify'){try{return {result:MusikaCore19.calculate(expression),source:'Built-in arithmetic'};}catch{}}
    if(!['simplify','factor','derive','integrate','zeroes'].includes(operation)||String(expression).length>200||!/^[\w\s.+*/^()=,\-]+$/.test(expression))throw Error('Use a mathematical expression, up to 200 characters.');
    const r=await json('https://newton.now.sh/api/v2/'+operation+'/'+encodeURIComponent(expression));if(r.error||r.result===undefined)throw Error('This formula could not be evaluated.');return {result:typeof r.result==='object'?JSON.stringify(r.result):String(r.result),source:'Newton',sourceUrl:'https://github.com/aunyks/newton-api'};
  }
  async function crypto(ids='bitcoin,ethereum'){
    if(!/^[a-z0-9-]+(?:,[a-z0-9-]+){0,4}$/.test(ids))throw Error('Invalid coin IDs.');
    return cached('crypto:'+ids,120000,async()=>{const r=await fallback([()=>json('https://api.coingecko.com/api/v3/simple/price?ids='+ids+'&vs_currencies=inr&include_last_updated_at=true'),async()=>(await bridge('crypto',{ids})).data]);if(!Object.values(r).some(v=>typeof v?.inr==='number'))throw Error('Prices unavailable.');return {prices:r,source:'CoinGecko',sourceUrl:'https://www.coingecko.com/'};});
  }
  async function bhajan(query='Ganesh bhajan'){
    const clean=String(query).replace(/[^\p{L}\p{M}\d\s]/gu,' ').trim().slice(0,80)||'Ganesh bhajan';
    return cached('bhajan:'+clean,21600000,async()=>{
      const q='mediatype:audio AND (licenseurl:*creativecommons* OR licenseurl:*publicdomain*) AND ('+clean.split(/\s+/).map(t=>'"'+t+'"').join(' OR ')+')';
      const params=new URLSearchParams({q,rows:'3',output:'json'});['identifier','title','creator'].forEach(field=>params.append('fl[]',field));
      const search=await json('https://archive.org/advancedsearch.php?'+params);
      for(const doc of (search.response?.docs||[]).slice(0,3)){
        if(!/^[A-Za-z0-9_.-]+$/.test(doc.identifier))continue;
        try{const meta=await json('https://archive.org/metadata/'+encodeURIComponent(doc.identifier));
          const license=String(meta.metadata?.licenseurl||'');if(!/creativecommons|publicdomain/i.test(license))continue;
          const file=(meta.files||[]).find(f=>/\.mp3$/i.test(f.name)&&!String(f.name).split('/').includes('..'));
          if(file)return {tracks:[{title:String(meta.metadata?.title||doc.title||'Bhajan'),author:String(meta.metadata?.creator||''),audioUrl:'https://archive.org/download/'+encodeURIComponent(doc.identifier)+'/'+file.name.split('/').map(encodeURIComponent).join('/'),license,url:'https://archive.org/details/'+encodeURIComponent(doc.identifier)}],source:'Internet Archive',sourceUrl:'https://archive.org/'};
        }catch{}
      }throw Error('No available licensed audio found. Try a different devotional title.');
    },{persist:true});
  }
  async function music(provider,query='devotional'){
    if(provider==='archive')return bhajan(query);
    if(provider==='freesound'){const r=await bridge('freesound',{query});return {...r.data,source:r.source,sourceUrl:r.sourceUrl};}
    return fallback([()=>bridge(provider,{query}),()=>bhajan(query)]).then(r=>r.data?{...r.data,source:r.source,sourceUrl:r.sourceUrl}:r);
  }
  async function metadata(query='devotional'){const r=await bridge('musicbrainz',{query});return {tracks:(r.data.recordings||[]).map(t=>({title:t.title,author:(t['artist-credit']||[]).map(a=>a.name||a.artist?.name||'').join(', '),url:'https://musicbrainz.org/recording/'+encodeURIComponent(t.id)})),source:r.source,sourceUrl:r.sourceUrl};}
  async function videos(query='Ganesh festival'){
    const direct=String(query).match(/(?:youtu\.be\/|[?&]v=|embed\/)([\w-]{11})(?:[^\w-]|$)/);
    if(direct)return {videos:[{videoId:direct[1],title:'YouTube video'}],source:'YouTube',sourceUrl:'https://www.youtube.com/'};
    return fallback([async()=>{const r=await bridge('youtube',{query});if(!r.data.videos?.length)throw Error('No videos.');return {...r.data,source:r.source,sourceUrl:r.sourceUrl};},async()=>{const r=await bridge('invidious',{query});if(!r.data.videos?.length)throw Error('No videos.');return {...r.data,source:r.source,sourceUrl:r.sourceUrl};},async()=>({videos:[],searchUrl:'https://www.youtube.com/results?search_query='+encodeURIComponent(query),source:'YouTube search',sourceUrl:'https://www.youtube.com/'})]);
  }
  function upi(amount,payee=config.upiId,name=config.upiName||'Vinayaka Seva'){
    if(!/^[\w.\-]{2,100}@[\w.\-]{2,60}$/.test(String(payee||'')))throw Error('Set the committee UPI ID in MUSIKA_SERVICES_CONFIG.upiId.');
    amount=Number(amount);if(!Number.isFinite(amount)||amount<=0||amount>1e7)throw Error('Enter a positive donation amount.');
    const uri='upi://pay?'+new URLSearchParams({pa:payee,pn:String(name).slice(0,100),am:amount.toFixed(2),cu:'INR'});
    return {uri,amount,payee,qrUrl:'https://quickchart.io/qr?'+new URLSearchParams({text:uri,size:'240',margin:'2'}),source:'QuickChart',sourceUrl:'https://quickchart.io/'};
  }
  async function story(title='Ganesha',language=appState.lang){
    const lang=language==='te'?'te':'en',page=String(title).slice(0,100);
    return cached('wiki:'+lang+':'+page,21600000,async()=>{const r=await json('https://'+lang+'.wikipedia.org/api/rest_v1/page/summary/'+encodeURIComponent(page));if(!r.extract)throw Error('No article summary.');return {title:r.title,text:r.extract,source:'Wikipedia',sourceUrl:r.content_urls?.desktop?.page||'https://'+lang+'.wikipedia.org/wiki/'+encodeURIComponent(page),license:'CC BY-SA; see article for attribution.'};},{persist:true});
  }
  let clockAnchor=null;
  async function clock(){
    const r=await cached('clock',1800000,()=>fallback([
      async()=>{const r=await json('https://worldtimeapi.org/api/timezone/Asia/Kolkata');const time=Date.parse(r.utc_datetime||r.datetime);if(!Number.isFinite(time))throw Error('Clock unavailable.');return {epoch:time,source:'WorldTimeAPI'};},
      async()=>{const r=await json(window.COMMUNITY_CONFIG.apiUrl,{method:'POST',headers:{'Content-Type':'text/plain'},body:JSON.stringify({action:'getServerTime'})});if(r.status!=='success'||!Number.isFinite(r.data?.epoch))throw Error('Server clock unavailable.');return {epoch:r.data.epoch,source:'Committee server clock'};},
      async()=>({epoch:Date.now(),source:'Device clock (fallback)',fallback:true})
    ]));if(!r.cached||!clockAnchor)clockAnchor={...r,tick:typeof performance!=='undefined'?performance.now():Date.now()};return clockNow();
  }
  function clockNow(){const tick=typeof performance!=='undefined'?performance.now():Date.now();return {epoch:clockAnchor?clockAnchor.epoch+tick-clockAnchor.tick:Date.now(),source:clockAnchor?.source||'Device clock',fallback:!clockAnchor||clockAnchor.fallback};}
  function istDate(epoch=Date.now()){const parts=Object.fromEntries(new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Kolkata',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date(epoch)).map(p=>[p.type,p.value]));return parts.year+'-'+parts.month+'-'+parts.day;}
  function sunWindows(sunrise,sunset,date){const rise=Date.parse(sunrise),set=Date.parse(sunset);if(!Number.isFinite(rise)||!Number.isFinite(set)||set<=rise)throw Error('Sunrise/sunset unavailable for this location and date.');const day=set-rise,weekday=new Date(date+'T12:00:00+05:30').getUTCDay(),segment=[8,2,7,5,6,4,3][weekday]-1;return {sunrise:rise,sunset:set,brahma:[rise-96*60000,rise-48*60000],abhijit:[rise+day/2-day/30,rise+day/2+day/30],rahu:[rise+segment*day/8,rise+(segment+1)*day/8]};}
  async function sunrise(date=istDate()){
    if(!/^20\d{2}-\d{2}-\d{2}$/.test(date))throw Error('Use YYYY-MM-DD.');const place=await location({precise:true});
    return cached('sun:'+place.latitude.toFixed(2)+':'+place.longitude.toFixed(2)+':'+date,21600000,async()=>{const r=await json('https://api.sunrise-sunset.org/json?'+new URLSearchParams({lat:place.latitude,lng:place.longitude,date,formatted:'0'}));if(r.status!=='OK')throw Error('Sunrise service unavailable.');return {date,place,...sunWindows(r.results.sunrise,r.results.sunset,date),approximate:true,source:'Sunrise-Sunset.org',sourceUrl:'https://sunrise-sunset.org/'};});
  }
  async function holidays(year=new Date().getFullYear()){
    if(!/^20\d{2}$/.test(String(year)))throw Error('Choose a year from 2000 to 2099.');
    const localRows=['Events','FestivalDays','SpecialDays'].flatMap(t=>(publicDataCache[t]||[]).filter(r=>!r.deletedAt&&MusikaCore19.rowYear(r)===String(year)).map(r=>({date:String(r.eventDate||r.date||'').slice(0,10),name:AdvancedUI.text(r,'title')||r.festivalName||'',source:'Committee calendar'}))).filter(r=>/^20\d{2}-\d{2}-\d{2}$/.test(r.date));
    const remote=await cached('holidays:'+year,21600000,async()=>{try{const r=await json('https://date.nager.at/api/v3/PublicHolidays/'+year+'/IN');if(!Array.isArray(r)||!r.length)throw Error('Calendar unavailable.');return {days:r.map(x=>({date:x.date,name:x.localName||x.name,source:'Nager.Date'})),source:'Nager.Date',sourceUrl:'https://date.nager.at/'};}catch{return {days:[{date:year+'-01-26',name:'Republic Day'},{date:year+'-08-15',name:'Independence Day'},{date:year+'-10-02',name:'Gandhi Jayanti'}].map(r=>({...r,source:'Fixed national date'})),source:'Partial offline calendar',partial:true};}},{persist:true});
    const map=new Map();for(const r of [...remote.days,...localRows])map.set(r.date+'|'+r.name,r);return {...remote,days:[...map.values()].sort((a,b)=>a.date.localeCompare(b.date))};
  }
  async function maps(query){try{const r=await bridge('nominatim',{query});return {places:(r.data||[]).map(p=>({name:p.display_name,latitude:Number(p.lat),longitude:Number(p.lon)})),source:r.source,sourceUrl:r.sourceUrl};}catch{return {places:[],searchUrl:'https://www.openstreetmap.org/search?query='+encodeURIComponent(query),source:'OpenStreetMap',sourceUrl:'https://www.openstreetmap.org/copyright'};}}
  async function notifyDonation(id){if(!AuthManager.isAdmin())throw Error('This information is restricted to committee administrators only.');const token=AuthManager.state.token;const r=await json(window.COMMUNITY_CONFIG.apiUrl,{method:'POST',headers:{'Content-Type':'text/plain'},body:JSON.stringify({action:'notifyDonation',id,sessionToken:token})});if(r.status!=='success')throw Error(r.error?.message||'Notification delivery could not be confirmed.');return r.data;}
  let audioContext=null;
  function bell(){try{audioContext||=new(window.AudioContext||window.webkitAudioContext)();if(audioContext.state==='suspended')void audioContext.resume();const now=audioContext.currentTime;[587.33,880,1174.66].forEach((frequency,i)=>{const o=audioContext.createOscillator(),g=audioContext.createGain();o.frequency.value=frequency;g.gain.setValueAtTime(0.0001,now);g.gain.exponentialRampToValueAtTime(0.06/(i+1),now+.01);g.gain.exponentialRampToValueAtTime(0.0001,now+.7);o.connect(g);g.connect(audioContext.destination);o.start(now);o.stop(now+.72);o.onended=()=>{o.disconnect();g.disconnect();};});}catch{}}
  return {json,bridge,cached,fallback,safeURL,fetchDailyWisdom,location,wmo,weather,convert,math,crypto,bhajan,music,metadata,videos,upi,story,clock,clockNow,istDate,sunWindows,sunrise,holidays,maps,notifyDonation,bell,emit,config};
})();
window.MusikaServices=MusikaServices;
window.fetchDailyWisdom=MusikaServices.fetchDailyWisdom;

/* One microphone owner for wake words, commands and field dictation. */
const MusikaVoice19 = (() => {
  const Recognition=window.SpeechRecognition||window.webkitSpeechRecognition;
  const wakeRegex=/(?:^|[\s,!.?])(?:(?:hey|hay|hi|hello|ok|okay|హే|హాయ్|నమస్తే|నమస్కారం)\s*[,!.]?\s*)?(?:musika|muski|muskiya|mooshika|mushika|mooshikaa|ముసికా?|మూషికా?|ముషికా?)(?=$|[\s,!.?])/i;
  let recognizer=null,retiring=null,enabled=false,mode='off',revision=0,restartTimer=null,commandTimer=null,retries=0,speaking=false,utterance=null,speechFinish=null,speechVersion=0;
  let submit=async text=>{const input=document.getElementById('chat-input');if(input){input.value=text;await window.sendChatMessage();}};
  const label=(en,te)=>appState.lang==='te'?te:en;
  function status(next,message=''){
    mode=next;const el=document.getElementById('musika-listen-status');
    if(el)el.textContent=message||({off:label('Microphone off','మైక్ ఆఫ్'),wake:label('Listening for “Hey Musika”','“హే మూషిక” కోసం వింటున్నాను'),command:label('Listening for your question…','మీ ప్రశ్న కోసం వింటున్నాను…'),dictation:label('Dictating into the selected field','ఎంచుకున్న ఫీల్డ్‌లో నమోదు'),speaking:label('Speaking…','జవాబు చెబుతున్నాను…'),processing:label('Finding your answer…','జవాబు వెతుకుతున్నాను…'),paused:label('Listening paused','వినడం ఆపాను'),error:label('Voice unavailable. You can type.','వాయిస్ అందుబాటులో లేదు. టైప్ చేయండి.')}[next]||next);
    const b=document.getElementById('musika-hotword-toggle');if(b){b.textContent=enabled?label('Disable Hey Musika','హే మూషిక ఆపండి'):label('Enable Hey Musika','హే మూషిక ప్రారంభించండి');b.setAttribute('aria-pressed',String(enabled));}
    MusikaServices.emit('musika:voice-state',{mode,enabled,message});
  }
  function closeMicrophone(){
    clearTimeout(restartTimer);clearTimeout(commandTimer);
    if(retiring)return retiring;
    if(!recognizer)return Promise.resolve();
    const r=recognizer;recognizer=null;if(activeRecognition===r)activeRecognition=null;
    // Wait for onend before allocating another recognizer; avoid overlapping engines.
    let resolveClose;const closing=new Promise(resolve=>{resolveClose=resolve;});retiring=closing;
    let finished=false,timer;const done=()=>{if(finished)return;finished=true;clearTimeout(timer);retiring=null;resolveClose();};r.onresult=null;r.onerror=null;r.onend=done;timer=setTimeout(done,900);try{r.abort();}catch{done();}
    return closing;
  }
  function stopSpeech(){speechVersion++;if(speechFinish)speechFinish();speechFinish=null;utterance=null;speaking=false;try{window.speechSynthesis?.cancel();}catch{}}
  async function speak(text,{resume=true}={}){
    stopSpeech();const generation=speechVersion;
    ++revision;await closeMicrophone();
    if(generation!==speechVersion)return;
    const ss=window.speechSynthesis;
    if(!VoicePreferences.enabled||!ss||!window.SpeechSynthesisUtterance){if(resume)resumeWake();return;}
    const lang=appState.lang==='te'?'te-IN':'en-IN',voices=ss.getVoices()||[];
    const matching=voices.filter(v=>v.lang.toLowerCase().startsWith(lang.slice(0,2)));
    const voice=matching.find(v=>v.name===VoicePreferences.voice)||matching.find(v=>v.lang===lang)||matching[0];
    if(voices.length&&!voice){status('paused',label('No voice installed for this language; read the displayed answer.','ఈ భాష వాయిస్ లేదు; తెరపై జవాబు చదవండి.'));if(resume)resumeWake();return;}
    const clean=MusikaCore19.digits(String(text)).replace(/<[^>]*>/g,' ').replace(/₹\s*([\d,.]+)/g,(_,n)=>String(Number(n.replace(/,/g,'')))+(lang==='te-IN'?' రూపాయలు':' rupees')).replace(/%/g,lang==='te-IN'?' శాతం':' percent');
    const chunks=clean.match(/.{1,160}(?:\s|$)|.{1,160}/g)||[];speaking=true;status('speaking');
    for(const chunk of chunks){
      if(generation!==speechVersion)break;
      await new Promise(resolve=>{let timer,done=false;const finish=()=>{if(done)return;done=true;clearTimeout(timer);if(speechFinish===finish)speechFinish=null;resolve();};speechFinish=finish;
        const u=new window.SpeechSynthesisUtterance(chunk);utterance=u;u.lang=lang;if(voice)u.voice=voice;u.rate=Math.max(.6,Math.min(1.4,VoicePreferences.rate||.95));u.onend=finish;u.onerror=()=>{if(generation===speechVersion){speechVersion++;speaking=false;}finish();};
        timer=setTimeout(()=>{if(generation===speechVersion){speechVersion++;speaking=false;ss.cancel();}finish();},35000);
        try{ss.speak(u);}catch{if(generation===speechVersion){speechVersion++;speaking=false;}finish();}
      });
    }
    if(generation===speechVersion){speaking=false;utterance=null;if(resume)resumeWake();}
  }
  function resumeWake(){if(enabled&&!document.hidden&&!speaking)restartTimer=setTimeout(()=>listen('wake'),350);else status(enabled?'paused':'off');}
  async function listen(next='wake',field=null,options={}){
    const turn=++revision;await closeMicrophone();
    if(turn!==revision||document.hidden||speaking||next==='wake'&&!enabled)return;
    if(!Recognition){enabled=false;status('error',label('Speech recognition is unavailable in this browser. Type your question.','ఈ బ్రౌజర్‌లో వాయిస్ గుర్తింపు లేదు. ప్రశ్న టైప్ చేయండి.'));return;}
    const r=new Recognition();recognizer=r;activeRecognition=next==='wake'?null:r;
    r.continuous=next==='wake';r.interimResults=false;r.maxAlternatives=1;r.lang=options.language||(appState.lang==='te'?'te-IN':'en-IN');
    let handled=false,failed=false;const auth=AuthManager.state.token;const current=()=>turn===revision&&recognizer===r;
    r.onstart=()=>{if(current())status(next);};
    r.onresult=event=>{
      if(!current()||speaking||window.speechSynthesis?.speaking||handled)return;
      for(let i=event.resultIndex||0;i<event.results.length;i++){
        if(event.results[i].isFinal===false)continue;const text=String(event.results[i][0]?.transcript||'').trim();if(!text)continue;retries=0;
        if(next==='wake'){if(wakeRegex.test(text)){handled=true;void wake(text);}continue;}
        handled=true;if(auth!==AuthManager.state.token){void pause();return;}
        if(next==='dictation'){
          let value=text;if(options.numeric){const n=MusikaCore19.number(text);if(n===null){status('error',label('Number unclear. Please type it or dictate again.','సంఖ్య స్పష్టంగా లేదు. టైప్ చేయండి లేదా మళ్లీ చెప్పండి.'));void closeMicrophone();return;}value=String(n);}
          if(field){field.value=(options.append&&field.value?field.value+' ':'')+value;field.dispatchEvent(new Event('input',{bubbles:true}));}++revision;void closeMicrophone().then(resumeWake);
        }else void handleCommand(text);
        break;
      }
    };
    r.onerror=event=>{
      if(!current())return;failed=!['no-speech','aborted'].includes(event.error);
      if(['not-allowed','service-not-allowed','audio-capture'].includes(event.error)){enabled=false;status('error',label('Microphone permission or a microphone is unavailable. Use Enable to try again.','మైక్ అనుమతి లేదా మైక్ లేదు. మళ్లీ ప్రారంభించండి.'));}
      else if(event.error==='network'){retries++;if(retries>=3)enabled=false;status('error',label('Speech service connection failed. You can still type.','వాయిస్ సేవ కనెక్ట్ కాలేదు. టైప్ చేయవచ్చు.'));}
      else if(event.error!=='aborted'&&event.error!=='no-speech')retries++;
    };
    r.onend=()=>{
      if(!current())return;recognizer=null;if(activeRecognition===r)activeRecognition=null;clearTimeout(commandTimer);
      if(handled)return;
      if(next==='wake'&&enabled&&!document.hidden)restartTimer=setTimeout(()=>listen('wake'),Math.min(8000,800*Math.pow(2,retries)));
      else if(!failed||enabled)resumeWake();
    };
    try{r.start();if(next!=='wake')commandTimer=setTimeout(()=>{if(current()){++revision;void closeMicrophone().then(resumeWake);}},15000);}catch{recognizer=null;activeRecognition=null;enabled=false;status('error',label('Could not start the microphone. Click Enable to retry.','మైక్ ప్రారంభం కాలేదు. మళ్లీ ప్రారంభించండి.'));}
  }
  async function handleCommand(text){++revision;await closeMicrophone();status('processing');try{await submit(text);}catch{status('error',label('That command failed. Please try again.','ఆ ఆదేశం పనిచేయలేదు. మళ్లీ ప్రయత్నించండి.'));}if(enabled&&!document.hidden&&!speaking)await listen('command');else resumeWake();}
  async function wake(text){
    ++revision;await closeMicrophone();stopSpeech();MusikaServices.bell();
    const box=document.getElementById('chat-box');if(box?.classList.contains('hidden')){if(typeof toggle14==='function')toggle14();else box.classList.remove('hidden');}
    const command=String(text).replace(wakeRegex,' ').replace(/^[\s,!.?]+|[\s,!.?]+$/g,'');
    if(command){await handleCommand(command);return;}
    const prompt=label('Yes, I am listening. How can I help you?','చెప్పండి, నేను వింటున్నాను. మీకు ఎలా సహాయపడగలను?');addMooshikaMessage(AdvancedUI.esc(prompt));await speak(prompt,{resume:false});if(enabled&&!document.hidden)await listen('command');
  }
  async function enable(){enabled=true;retries=0;stopSpeech();MusikaServices.bell();await listen('wake');}
  async function disable(){enabled=false;++revision;stopSpeech();await closeMicrophone();status('off');}
  async function pause(){++revision;await closeMicrophone();status(enabled?'paused':'off');}
  async function manual(field=null,options={}){stopSpeech();return listen(field?'dictation':'command',field,options);}
  function init(){
    const host=document.getElementById('chat-box');if(!host||document.getElementById('musika-hotword-toggle'))return;
    const tools=document.createElement('div');tools.className='voice-tools';const button=document.createElement('button');button.type='button';button.id='musika-hotword-toggle';button.onclick=()=>enabled?disable():enable();
    const state=document.createElement('span');state.id='musika-listen-status';state.setAttribute('role','status');state.setAttribute('aria-live','polite');tools.append(button,state);host.append(tools);status('off');
  }
  document.addEventListener('visibilitychange',()=>{if(document.hidden){stopSpeech();void pause();}else resumeWake();});
  window.addEventListener('pagehide',()=>{void disable();});
  return {init,enable,disable,start:enable,stop:pause,pause,manual,speak,stopSpeech,resumeWake,wake,listen,handleCommand,wakeRegex,setSubmit:fn=>{submit=fn;},get state(){return {mode,enabled,speaking,hasRecognizer:!!recognizer};}};
})();
window.MusikaHotword=MusikaVoice19;
window.speakAIResponse=text=>MusikaVoice19.speak(text);
window.stopAIaudio=()=>{MusikaVoice19.stopSpeech();MusikaVoice19.resumeWake();};
VoiceController13.stop=()=>MusikaVoice19.pause();
VoiceController13.start=(input,options={})=>input?.id==='chat-input'?MusikaVoice19.manual():MusikaVoice19.manual(input,options);
window.startVoiceRecognition=()=>MusikaVoice19.manual();
window.startFieldVoice=field=>{if(!AuthManager.isAdmin())return;const input=document.getElementById('crud-field-'+field);if(input)MusikaVoice19.manual(input,{append:input.tagName==='TEXTAREA',numeric:input.type==='number',language:field.endsWith('En')?'en-IN':field.endsWith('Te')?'te-IN':undefined});};

/* Musika 19 integrates with the existing app lifecycle and table UI. */
const MusikaIntegration19=(()=>{
  const previousQuery=MusikaQueryEngine.execute.bind(MusikaQueryEngine);
  const tr=(en,te)=>appState.lang==='te'?te:en;
  const deny=()=>queryReply(tr('This information is restricted to committee administrators only.','ఈ సమాచారం కమిటీ నిర్వాహకులకు మాత్రమే అందుబాటులో ఉంది.'));
  const publicTables=new Set(PUBLIC_VIEW_TABLES14);
  let audio=null,initialized=false,quoteBusy=false;
  const esc=value=>AdvancedUI.esc(String(value??''));
  function link(host,text,url){const href=MusikaServices.safeURL(url);if(!href)return;const a=document.createElement('a');a.href=href;a.textContent=text;a.target='_blank';a.rel='noopener noreferrer';a.className='advanced-button';host.append(a);}
  function source(host,result){if(result.sourceUrl)link(host,result.source||'Source',result.sourceUrl);}
  function reply(text,result={},afterRender){return {html:'<div class="musika-service-card"><p>'+esc(text).replace(/\n/g,'<br>')+'</p>'+(result.source?'<small>'+esc(result.source)+(result.stale?' · '+esc(tr('Cached; may be out of date','కాష్‌లోని పాత సమాచారం')):'')+'</small>':'')+'</div>',speech:text,afterRender:host=>{source(host,result);if(afterRender)afterRender(host);},service:true};}
  function unavailable(error){return queryReply(tr('This service is unavailable right now. Your committee records still work. ','ప్రస్తుతం ఈ సేవ అందుబాటులో లేదు. కమిటీ రికార్డులను ఉపయోగించవచ్చు. ')+(error?.code==='TIMEOUT'?tr('The request timed out.','సమయ పరిమితి ముగిసింది.') : tr('Try again later.','తరువాత మళ్లీ ప్రయత్నించండి.')));}
  function donorReply(raw,selection){
    if(selection.ambiguous)return queryReply(tr('Which year do you mean? Say “2025 donor names and amounts”.','ఏ సంవత్సరం కావాలి? “2025 దాతల పేర్లు మొత్తాలు” చెప్పండి.'));
    const admin=AuthManager.isAdmin(),db=admin?adminDataCache:publicDataCache;
    let chosen=db;
    if(/\btoday\b|ఈరోజు|ఈ రోజు/i.test(raw))chosen={...db,Donations:(db.Donations||[]).filter(r=>String(r.donationDate||r.date||r.createdAt||'').slice(0,10)===MusikaServices.istDate())};
    const rows=MusikaCore19.donorRows(chosen,selection.year,appState.lang,admin,raw);
    if(!rows.length)return queryReply(tr('No verified donor records match this year or name.','ఈ సంవత్సరం లేదా పేరుకు ధృవీకరించిన దాతల వివరాలు లేవు.'));
    if(/\btotal\b|మొత్తం ఎంత|మొత్తము ఎంత/i.test(raw)&&!/names|పేర్లు/i.test(raw))return queryReply(MusikaCore19.money(rows.reduce((s,r)=>s+Math.round(r.amount*100),0)/100));
    const lines=rows.map(r=>r.name+' '+MusikaCore19.money(r.amount));
    return {html:'<ul>'+lines.map(line=>'<li>'+esc(line)+'</li>').join('')+'</ul>',speech:lines.join('. '),records:rows,year:selection.year};
  }
  const privateAliases={Users:['users','యూజర్లు','వినియోగదారులు'],WorkAllocations:['work allocations','పని కేటాయింపులు'],Notes:['notes','గమనికలు'],Reminders:['reminders','రిమైండర్లు'],AuditLogs:['audit logs','ఆడిట్'],AISettings:['ai settings'],AIConversations:['ai conversations'],FinancialTracker:['financial tracker','financial transactions','ఆర్థిక లావాదేవీలు'],FinancialAssistance:['financial assistance','loans','రుణాలు'],Repayments:['repayments','తిరిగి చెల్లింపులు']};
  Object.entries(privateAliases).forEach(([table,aliases])=>{TABLE_ALIASES16[table]=[...(TABLE_ALIASES16[table]||[]),...aliases];});
  function tableReply(table,raw,selection){
    if(!AuthManager.isAdmin()&&!publicTables.has(table))return deny();
    if(selection.ambiguous)return queryReply(tr('Please specify one year.','ఒక సంవత్సరం చెప్పండి.'));
    const admin=AuthManager.isAdmin(),db=admin?adminDataCache:publicDataCache;
    const rows=(db[table]||[]).filter(r=>CommunityCore.live(r)&&(selection.year==='all'||MusikaCore19.rowYear(r)===selection.year));
    const schema=/attributes?|fields?|columns?|schema|లక్షణాలు|కాలమ్స్|ఫీల్డ్/i.test(raw);
    const keys=admin?(TABLE_SCHEMAS[table]||TABLE_FIELDS16[table]||[]):[...new Set(rows.flatMap(Object.keys))];
    const blocked=/password|salt|sessiontoken|tokenhash|secret|apikey|^createdBy$|^updatedBy$|^deletedBy$/i;
    const visible=keys.filter(k=>!blocked.test(k));
    if(schema)return queryReply(AdvancedUI.label(table)+': '+visible.map(k=>AdvancedUI.label(k)).join(', '));
    if(!rows.length)return queryReply(tr('No published records match this table and year.','ఈ పట్టిక, సంవత్సరానికి ప్రచురించిన రికార్డులు లేవు.'));
    const compact=rows.slice(0,30).map(r=>{const title=AdvancedUI.text(r,'title')||AdvancedUI.text(r,'itemName')||AdvancedUI.text(r,'name')||AdvancedUI.text(r,'question')||r.taskName||r.foodItem||r.personName||r.id;const details=[r.eventDate||r.distributionDate||r.date,r.quantity?String(r.quantity)+' '+(r.unit||''):'',AdvancedUI.text(r,'description')||AdvancedUI.text(r,'summary')||AdvancedUI.text(r,'message')||AdvancedUI.text(r,'answer')||AdvancedUI.text(r,'storyText')].filter(Boolean);return [title,...details].join(' · ');});
    const text=compact.join('\n')+(rows.length>30?'\n'+tr('More records are available in the table.','మిగిలిన వివరాలు పట్టికలో ఉన్నాయి.'):'');
    return reply(text,{},host=>{
      const button=document.createElement('button');button.type='button';button.className='advanced-button';button.textContent=tr('Open table','పట్టిక తెరవండి');button.onclick=()=>{if(admin&&AuthManager.isAdmin())renderTableView(table);else{const select=document.getElementById('public-table-selector');if(select){select.value=table;select.dispatchEvent(new Event('change',{bubbles:true}));}const year=document.getElementById('public-year-filter');if(year){year.value=selection.year;year.dispatchEvent(new Event('change',{bubbles:true}));}document.getElementById('public-records-area')?.scrollIntoView({behavior:'smooth'});}};host.append(button);
      for(const row of rows.slice(0,8)){const url=MusikaServices.safeURL(row.imageUrl);if(url){const img=document.createElement('img');img.src=url;img.alt=AdvancedUI.text(row,'title')||table;img.loading='lazy';img.style.cssText='max-width:100%;max-height:220px;object-fit:contain;border-radius:12px';img.onerror=()=>{img.remove();const p=document.createElement('p');p.textContent=tr('Image unavailable.','చిత్రం అందుబాటులో లేదు.');host.append(p);};host.append(img);}}
    });
  }
  function mediaReply(result){const tracks=result.tracks||[];if(!tracks.length)return queryReply(tr('No available tracks found.','అందుబాటులో పాటలు లేవు.'));return reply(tracks.some(t=>t.audioUrl)?tr('Choose Play to start the audio.','పాట ప్రారంభించడానికి ప్లే నొక్కండి.'):tracks.map(t=>[t.title,t.author].filter(Boolean).join(' — ')).join('\n'),result,host=>{
    for(const track of tracks.slice(0,5)){const title=document.createElement('p');title.textContent=[track.title,track.author].filter(Boolean).join(' — ');host.append(title);const url=MusikaServices.safeURL(track.audioUrl);if(url){const player=document.createElement('audio');player.controls=true;player.preload='none';player.src=url;player.style.maxWidth='100%';player.onplay=()=>{if(audio&&audio!==player)audio.pause();audio=player;MusikaVoice19.stopSpeech();void MusikaVoice19.pause();};player.onended=()=>MusikaVoice19.resumeWake();player.onpause=()=>MusikaVoice19.resumeWake();player.onerror=()=>{title.textContent+=' · '+tr('Audio unavailable','పాట అందుబాటులో లేదు');};host.append(player);audio=player;}if(track.url)link(host,tr('Track source','పాట మూలం'),track.url);if(track.license)link(host,tr('License','లైసెన్స్'),track.license);}
  });}
  function clockText(epoch){return new Intl.DateTimeFormat(appState.lang==='te'?'te-IN-u-nu-latn':'en-IN',{timeZone:'Asia/Kolkata',dateStyle:'medium',timeStyle:'medium'}).format(new Date(epoch))+' IST';}
  function shortTime(epoch){return new Intl.DateTimeFormat('en-IN',{timeZone:'Asia/Kolkata',hour:'2-digit',minute:'2-digit',hour12:true}).format(new Date(epoch));}
  function range(list){return list.map(shortTime).join(' – ');}
  function route(raw){
    const q=MusikaCore19.digits(raw).toLowerCase().trim();const selected=MusikaCore19.year(q,appState.currentYear||'all',MusikaServices.istDate().slice(0,4));
    if(/(?:change|switch|speak|language|భాష|మార్చు|మాట్లాడు)/i.test(q)&&/telugu|తెలుగు|english|ఇంగ్లీష్|ఆంగ్ల/i.test(q)){
      const lang=/telugu|తెలుగు/.test(q)?'te':'en';setLanguage(lang);return queryReply(lang==='te'?'ఇప్పుడు తెలుగులో జవాబు చెబుతాను.':'I will answer in English now.');
    }
    if(/^(?:stop|pause|resume|start) motion$|యానిమేషన్.*(?:ఆపు|ప్రారంభించు)/.test(q)){const reduce=/stop|pause|ఆపు/.test(q);document.documentElement.classList.toggle('reduce-motion',reduce);safeSetLocal('reduce-motion',String(reduce));if(reduce)clearInterval(carouselTimer);else renderCarousel(publicDataCache.Banners||[]);return queryReply(reduce?tr('Animations paused.','యానిమేషన్లు ఆపాను.'):tr('Animations resumed.','యానిమేషన్లు ప్రారంభించాను.'));}
    if(/^(?:(?:musika|muski|మూషిక)\s+)?(?:stop|pause|ఆపు|ఆపండి)(?:\s+(?:speaking|voice|music|song|motion|మాటలు|పాటలు|వాయిస్))?[.! ]*$/.test(q)){
      MusikaVoice19.stopSpeech();audio?.pause();return {html:'<p>'+esc(tr('Stopped.','ఆపాను.'))+'</p>',speech:''};
    }
    if(/stop listening|disable hotword|మైక్ ఆపు/.test(q)){void MusikaVoice19.disable();return queryReply(tr('Microphone disabled.','మైక్ ఆపాను.'));}
    if(MusikaVoice19.wakeRegex.test(q)){const command=q.replace(MusikaVoice19.wakeRegex,' ').trim();if(!command)return queryReply(tr('Yes, I am listening. How can I help you?','చెప్పండి, నేను వింటున్నాను. మీకు ఎలా సహాయపడగలను?'));return route(command);}
    // Preserve confirmation and role-verified CRUD before read-only service routing.
    if(UI14.pending||/^(?:add|create|new|update|edit|delete|remove|confirm|cancel|save)\b|జోడించు|చేర్చు|తొలగించు|సవరించు|భద్రపరచు|రద్దు/.test(q))return previousQuery(raw);
    const table=tableFromText16(q);
    if(table&&!AuthManager.isAdmin()&&!publicTables.has(table))return deny();
    if(/daily quote|wisdom|thought for the day|moral|మంచి మాట|సూక్తి|సుభాషితం/.test(q))return MusikaServices.fetchDailyWisdom().then(r=>reply(r.text+(r.author?' — '+r.author:''),r));
    if(/weather|వాతావరణ|వర్షం పడ/.test(q))return MusikaServices.weather().then(r=>{const c=r.current,text=tr('Weather at ','వాతావరణం: ')+r.place.name+' ('+r.place.source+'). '+MusikaServices.wmo(c.weather_code,appState.lang)+'. '+c.temperature_2m+'°C; '+tr('feels like ','అనిపించే ఉష్ణోగ్రత ')+c.apparent_temperature+'°C; '+tr('humidity ','తేమ ')+c.relative_humidity_2m+'%; '+tr('precipitation ','వర్షపాతం ')+c.precipitation+' mm.'+(r.rainProbability===null?'':' '+tr('Highest rain probability in the next six hours: ','తదుపరి ఆరు గంటల్లో గరిష్ఠ వర్ష అవకాశం: ')+r.rainProbability+'%.')+' '+tr('Observation: ','నమోదు సమయం: ')+c.time+' IST.';renderWeather(r);return reply(text,r);});
    if(/convert|currency|డాలర్|dollars?.*rupee|కరెన్సీ/.test(q)){
      const from=/euro|eur|యూరో/.test(q)?'EUR':/pound|gbp|పౌండ్/.test(q)?'GBP':/aud|australian/.test(q)?'AUD':'USD';
      const amountText=q.replace(/^.*?(?:convert|మార్చండి|మార్చు)\s*/,'').split(/dollars?|usd|euros?|eur|pounds?|gbp|aud|డాలర్లు|డాలర్|యూరో|పౌండ్/)[0].trim();
      const amount=MusikaCore19.number(amountText)||Number(q.match(/\d+(?:\.\d+)?/)?.[0]);
      if(!Number.isFinite(amount)||amount<0)return queryReply(tr('Say “convert 50 dollars”.','“convert 50 dollars” లేదా “50 డాలర్లు రూపాయలు” చెప్పండి.'));
      return MusikaServices.convert(amount,from,'INR').then(r=>reply(amount+' '+from+' = '+MusikaCore19.money(r.converted)+'\n'+tr('Reference rate date: ','మార్పిడి రేటు తేదీ: ')+r.date,r));
    }
    if(/compound interest|చక్రవడ్డీ/.test(q)){
      const n=key=>Number(q.match(new RegExp('(?:'+key+')\\s*[:=]?\\s*(\\d+(?:\\.\\d+)?)'))?.[1]);const p=n('principal|అసలు'),r=n('rate|రేటు'),y=n('years|సంవత్సరాలు'),f=n('periods');
      if(![p,r,y].every(Number.isFinite))return queryReply(tr('Use: compound interest principal 10000 rate 5 years 2 periods 1.','ఇలా చెప్పండి: compound interest principal 10000 rate 5 years 2 periods 1.'));
      const answer=MusikaCore19.compound(p,r,y,Number.isFinite(f)?f:1);return queryReply(tr('Total: ','మొత్తం: ')+MusikaCore19.money(answer.total)+'; '+tr('interest: ','వడ్డీ: ')+MusikaCore19.money(answer.interest));
    }
    if(/^(calculate|simplify|factor|derive|integrate)\b|^లెక్కించు/.test(q)){const m=q.match(/^(calculate|simplify|factor|derive|integrate|లెక్కించు)\s+(.+)$/);if(m)return MusikaServices.math(m[2],['calculate','లెక్కించు'].includes(m[1])?'simplify':m[1]).then(r=>reply(String(r.result),r));}
    if(/bitcoin|ethereum|crypto|బిట్‌కాయిన్|క్రిప్టో/.test(q))return MusikaServices.crypto().then(r=>reply(Object.entries(r.prices).map(([coin,v])=>coin+': '+MusikaCore19.money(v.inr)+(v.last_updated_at?' ('+clockText(v.last_updated_at*1000)+')':'')).join('\n'),r));
    if(/temple bell|bell sound|గంట మోగించు/.test(q)){MusikaServices.bell();return reply(tr('Temple bell.','గుడి గంట.'));}
    if(/freesound/.test(q))return MusikaServices.music('freesound').then(mediaReply).catch(()=>{MusikaServices.bell();return queryReply(tr('Playing the built-in bell.','అంతర్నిర్మిత గంట మోగిస్తున్నాను.'));});
    if(/musicbrainz|track metadata|album metadata/.test(q))return MusikaServices.metadata(q.replace(/musicbrainz|track metadata|album metadata/g,'').trim()||'devotional').then(mediaReply);
    if(/play bhajan|play music|bhajan|jamendo|ambient music|పాటలు|భజన/.test(q))return MusikaServices.music(/jamendo|ambient/.test(q)?'jamendo':'archive',q.replace(/play|music|jamendo|పాటలు/g,'').trim()||'Ganesh bhajan').then(mediaReply);
    if(/youtube|festival video|festival stream|యూట్యూబ్|వీడియో/.test(q))return MusikaServices.videos(raw).then(r=>reply(tr('Festival videos','పండుగ వీడియోలు'),r,host=>{
      if(r.searchUrl)link(host,tr('Search YouTube','యూట్యూబ్‌లో వెతకండి'),r.searchUrl);
      for(const v of r.videos||[]){if(!/^[\w-]{11}$/.test(v.videoId))continue;const b=document.createElement('button');b.type='button';b.className='advanced-button';b.textContent=v.title||'Play video';b.onclick=()=>{const iframe=document.createElement('iframe');iframe.src='https://www.youtube-nocookie.com/embed/'+v.videoId;iframe.title=v.title||'Festival video';iframe.allow='encrypted-media; picture-in-picture; fullscreen';iframe.referrerPolicy='strict-origin-when-cross-origin';iframe.style.cssText='width:100%;aspect-ratio:16/9;border:0';host.append(iframe);b.disabled=true;};host.append(b);}
    }));
    if(/upi|qr code|క్యూ ఆర్/.test(q)){const amount=Number(q.match(/\d+(?:\.\d+)?/)?.[0]);const r=MusikaServices.upi(amount);return reply(tr('Pay ','చెల్లించండి ')+MusikaCore19.money(r.amount)+' → '+r.payee,r,host=>{const image=document.createElement('img');image.src=r.qrUrl;image.alt='UPI QR '+r.payee;image.width=240;image.height=240;image.onerror=()=>image.remove();const a=document.createElement('a');a.href=r.uri;a.textContent=tr('Open UPI app','UPI యాప్ తెరవండి');a.className='advanced-button';host.append(image,a);});}
    if(/wikipedia|వికీపీడియా/.test(q)){const title=String(raw).replace(/wikipedia|వికీపీడియా|about|గురించి/gi,'').trim()||(appState.lang==='te'?'వినాయకుడు':'Ganesha');return MusikaServices.story(title).then(r=>reply(r.title+'\n'+r.text,r));}
    if(/sunrise|sunset|rahu kalam|brahma muhur|abhijit|సూర్యోదయం|సూర్యాస్తమయం|రాహుకాలం|బ్రహ్మ ముహూర్తం|అభిజిత్/.test(q))return MusikaServices.sunrise(q.match(/20\d{2}-\d{2}-\d{2}/)?.[0]).then(r=>reply(r.place.name+' · '+r.date+' IST\n'+tr('Sunrise: ','సూర్యోదయం: ')+shortTime(r.sunrise)+'; '+tr('Sunset: ','సూర్యాస్తమయం: ')+shortTime(r.sunset)+'\n'+tr('Brahma: ','బ్రహ్మ ముహూర్తం: ')+range(r.brahma)+'\n'+tr('Abhijit: ','అభిజిత్: ')+range(r.abhijit)+'\n'+tr('Rahu Kalam: ','రాహుకాలం: ')+range(r.rahu)+'\n'+tr('Approximate traditional time windows; this does not calculate tithi or nakshatra.','ఇవి సాంప్రదాయ గణనల ఆధారంగా అంచనా సమయాలు; తిథి, నక్షత్రం ఇందులో గణించబడవు.'),r));
    if(/holiday|సెలవు/.test(q)){
      if(selected.ambiguous)return queryReply(tr('Which year?','ఏ సంవత్సరం?'));const year=selected.year==='all'?MusikaServices.istDate().slice(0,4):selected.year;
      return MusikaServices.holidays(year).then(r=>{const today=/today|ఈరోజు|ఈ రోజు/.test(q),days=today?r.days.filter(d=>d.date===MusikaServices.istDate()):r.days;return reply((days.length?days.map(d=>d.date+' · '+d.name).join('\n'):tr('No holiday is listed for today.','ఈరోజు సెలవు జాబితాలో లేదు.'))+(r.partial?'\n'+tr('Partial calendar: movable festival dates require published committee records or another verified calendar.','అసంపూర్ణ క్యాలెండర్: మారే పండుగ తేదీలకు కమిటీ ప్రచురించిన వివరాలు లేదా ధృవీకరించిన క్యాలెండర్ అవసరం.') :''),r);});
    }
    if(/directions|map|navigation|మ్యాప్|దారి చూపు/.test(q)){const search=q.replace(/directions|map|navigation|మ్యాప్|దారి చూపు|\bto\b/g,'').trim()||'Ganesh temple Vijayawada';return MusikaServices.maps(search).then(r=>reply(tr('Map results','మ్యాప్ వివరాలు'),r,host=>{if(r.searchUrl)link(host,tr('Open map search','మ్యాప్‌లో వెతకండి'),r.searchUrl);for(const p of r.places)if(Number.isFinite(p.latitude)&&Math.abs(p.latitude)<=90&&Number.isFinite(p.longitude)&&Math.abs(p.longitude)<=180)link(host,p.name,'https://www.openstreetmap.org/?mlat='+p.latitude+'&mlon='+p.longitude+'#map=16/'+p.latitude+'/'+p.longitude);}));}
    if(/^(?:what is |tell |today |current )?(?:time|date)\b|సమయం|ఈరోజు తేదీ/.test(q))return MusikaServices.clock().then(r=>reply(clockText(r.epoch),r));
    if(/notify donation|broadcast donation/.test(q)){
      if(!AuthManager.isAdmin())return deny();const id=raw.match(/REC_[\w-]+/i)?.[0];if(!id)return queryReply('Use: notify donation REC_… (verified donation ID).');return MusikaServices.notifyDonation(id).then(r=>queryReply(r.state==='sent'?tr('Notification sent.','నోటిఫికేషన్ పంపాను.'):tr('Delivery was already attempted; check the channel.','ఇప్పటికే పంపడానికి ప్రయత్నించాం; ఛానెల్ చూడండి.')));
    }
    const donorQuery=/donor|donation|donaname|దాత|విరాళ|చందా/.test(q)&&!/compar|versus|\bvs\b|report|balance|పోల్చు|నివేదిక|నిల్వ/.test(q);
    if(donorQuery&&!/attributes?|fields?|columns?|schema|లక్షణాలు|కాలమ్స్/.test(q))return donorReply(raw,selected);
    const records=(AuthManager.isAdmin()?adminDataCache:publicDataCache).Donations||[];
    if(records.some(r=>[r.donorName,r.donorNameEn,r.donorNameTe].some(n=>n&&String(n).length>2&&q.includes(String(n).toLowerCase()))))return donorReply(raw,selected);
    if(table&&(/\b(open|show|display|list|view|fields?|attributes?|columns?|schema)\b|తెరువు|చూపించు|చూపు|లక్షణాలు|కాలమ్స్/.test(q)||selected.explicit&&!/report|balance|expense|compar|నివేదిక|ఖర్చు|నిల్వ|పోల్చు/.test(q)))return tableReply(table,raw,selected);
    // Pass a recognized spoken year to all older report/table handlers too.
    return previousQuery(selected.explicit&&!selected.ambiguous&&selected.year!=='all'?selected.year+' '+raw:raw);
  }
  function execute(raw){try{const result=route(String(raw||''));if(result&&typeof result.then==='function')return result.catch(unavailable);return result;}catch(e){return e.message?.startsWith('Set the committee UPI')?queryReply(e.message):unavailable(e);}}
  async function send(raw){
    const input=document.getElementById('chat-input');raw=String(raw??input?.value??'').trim();if(!raw||chatBusy)return;
    chatBusy=true;const token=AuthManager.state.token,language=appState.lang;if(input)input.value='';addMooshikaMessage(raw,'user');
    const button=document.getElementById('btn-chat-send');if(button)button.disabled=true;document.getElementById('typing-indicator')?.classList.remove('hidden');
    try{const result=await execute(raw);if(token!==AuthManager.state.token)return;addMooshikaMessage(result.html);const host=document.getElementById('chat-messages')?.lastElementChild;if(host&&typeof result.afterRender==='function')result.afterRender(host);MusikaServices.emit('musika:query-result',{service:!!result.service,year:result.year});if(result.speech)await MusikaVoice19.speak(result.speech,{resume:false});}
    catch(e){if(token===AuthManager.state.token)addMooshikaMessage(esc(tr('Unable to process this command. Please try again.','ఈ ఆదేశం అమలు కాలేదు. మళ్లీ ప్రయత్నించండి.')));}
    finally{chatBusy=false;if(button)button.disabled=false;document.getElementById('typing-indicator')?.classList.add('hidden');if(MusikaVoice19.state.mode!=='command')MusikaVoice19.resumeWake();}
  }
  async function refreshQuote(force=false){
    if(quoteBusy)return;quoteBusy=true;const refresh=document.getElementById('musika-wisdom-refresh');if(refresh)refresh.disabled=true;
    try{const r=await MusikaServices.fetchDailyWisdom({force});const text=document.getElementById('musika-wisdom-text'),credit=document.getElementById('musika-wisdom-source');if(text)text.textContent=r.text+(r.author?' — '+r.author:'');if(credit){credit.replaceChildren();source(credit,r);}}finally{quoteBusy=false;if(refresh)refresh.disabled=false;}
  }
  function renderWeather(r){const el=document.getElementById('musika-live-weather');if(el)el.textContent=r.place.name+' · '+r.current.temperature_2m+'°C · '+MusikaServices.wmo(r.current.weather_code,appState.lang);}
  function init(){
    if(initialized)return;const anchor=document.getElementById('carousel-track')?.parentElement||document.getElementById('public-view');if(!anchor)return;initialized=true;
    const style=document.createElement('style');style.id='musika19-styles';style.textContent='#wisdom-ticker-strip{display:flex;align-items:center;flex-wrap:wrap;gap:.7rem;margin:1rem 0;padding:1rem;border:1px solid #d99c3780;border-radius:1rem;background:#451a03ed;color:#fff1cf;backdrop-filter:blur(12px)}#musika-wisdom-text{flex:1;min-width:180px;margin:0;line-height:1.6}#wisdom-ticker-strip button{border-radius:999px;padding:.4rem .8rem;background:#fbbf24;color:#451a03;cursor:pointer}#wisdom-ticker-strip button:focus-visible{outline:3px solid white;outline-offset:3px}.musika-lamp{font-size:1.5rem;animation:musika-glow 3s ease-in-out infinite}#musika-live-bar{display:flex;flex-wrap:wrap;gap:1rem;font-size:.9rem;margin:.5rem 0}.musika-service-card p{white-space:normal;overflow-wrap:anywhere}.musika-service-card a{display:inline-block;margin:.3rem}@keyframes musika-glow{50%{opacity:.6}}@media(prefers-reduced-motion:reduce){.musika-lamp{animation:none}}';document.head.append(style);
    let strip=document.getElementById('wisdom-ticker-strip');if(!strip){strip=document.createElement('section');strip.id='wisdom-ticker-strip';strip.setAttribute('aria-label','Daily wisdom');anchor.insertAdjacentElement('afterend',strip);}
    strip.replaceChildren();const icon=document.createElement('span');icon.className='musika-lamp';icon.textContent='🪔';icon.setAttribute('aria-hidden','true');const text=document.createElement('p');text.id='musika-wisdom-text';text.setAttribute('aria-live','polite');const credit=document.createElement('span');credit.id='musika-wisdom-source';const refresh=document.createElement('button');refresh.type='button';refresh.id='musika-wisdom-refresh';refresh.textContent='↻';refresh.setAttribute('aria-label','Refresh daily wisdom');refresh.onclick=()=>refreshQuote(true);strip.append(icon,text,credit,refresh);
    const bar=document.createElement('div');bar.id='musika-live-bar';const clock=document.createElement('span');clock.id='musika-live-clock';const weather=document.createElement('button');weather.id='musika-live-weather';weather.type='button';weather.className='advanced-button';weather.textContent=tr('Weather at my location','నా ప్రాంతంలో వాతావరణం');weather.onclick=()=>send(appState.lang==='te'?'వాతావరణం':'weather');bar.append(clock,weather);strip.insertAdjacentElement('afterend',bar);
    const tick=()=>{const r=MusikaServices.clockNow();clock.textContent=clockText(r.epoch);clock.title=r.source;};tick();setInterval(tick,1000);
    void MusikaServices.clock().catch(()=>{});void refreshQuote();MusikaVoice19.init();
    setInterval(()=>{if(!document.hidden)void MusikaServices.weather({precise:false}).then(renderWeather).catch(()=>{});},1800000);
    setInterval(()=>{if(!document.hidden){void refreshQuote();void MusikaServices.clock().catch(()=>{});}},1800000);
    MusikaServices.emit('musika:services-ready',{version:'19.0.0'});
  }
  return {execute,send,init,refreshQuote,donorReply,tableReply,stopMusic:()=>{audio?.pause();}};
})();
dictationNumber=value=>{const n=MusikaCore19.number(value);return n===null?null:String(n);};
donorAnswer14=(raw,year)=>MusikaIntegration19.donorReply(raw,MusikaCore19.year(raw,year));
MusikaQueryEngine.execute=MusikaIntegration19.execute;
sendChatMessage=()=>MusikaIntegration19.send();window.sendChatMessage=sendChatMessage;
MusikaVoice19.setSubmit(MusikaIntegration19.send);
window.MusikaQueryEngine=MusikaQueryEngine;
Object.assign(window.MusikaAI,{query:MusikaIntegration19.execute,speak:window.speakAIResponse,stopSpeech:window.stopAIaudio,voice:window.startVoiceRecognition});
const initializeBefore19=initializeApp;
initializeApp=async function(){MusikaIntegration19.init();return initializeBefore19();};window.initializeApp=initializeApp;
const languageBefore19=setLanguage;
setLanguage=function(lang){MusikaVoice19.stopSpeech();void MusikaVoice19.pause();languageBefore19(lang);void MusikaIntegration19.refreshQuote();MusikaVoice19.resumeWake();};window.setLanguage=setLanguage;
const clearBefore19=AuthManager.clearSession.bind(AuthManager);
AuthManager.clearSession=function(){void MusikaVoice19.disable();MusikaIntegration19.stopMusic();clearBefore19();};
document.addEventListener('DOMContentLoaded',()=>{MusikaIntegration19.init();});
// Optional external integration: call this after your UI explicitly chooses to
// broadcast a verified donation. It does not auto-publish to a public ntfy topic.
window.broadcastVerifiedDonation=id=>MusikaServices.notifyDonation(id);
