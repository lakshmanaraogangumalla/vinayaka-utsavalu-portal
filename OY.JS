/* ============================================================
   GLOBAL CONFIGURATION & STATE
============================================================ */
const API_URL = "https://script.google.com/macros/s/AKfycbxwt7d5UGIteCu2PSm85JMr-NHCgt2Sm1KPHsTeMylgBiRCjvaUHTFiU0eP7x2lsIoH/exec";

let appState = {
    token: sessionStorage.getItem('sessionToken') || null,
    role: sessionStorage.getItem('userRole') || 'public',
    userName: sessionStorage.getItem('userName') || null,
    currentYear: new Date().getFullYear().toString(),
    lang: 'te' // Default language
};

let adminDataCache = {};
let publicDataCache = {};
let currentTableName = "";
let currentEditId = null;
let flipbookPages = [];

// ALL 22 TABLES DEFINED FOR ADMIN
const TABLE_SCHEMAS = {
  "Users": ["id", "name", "phone", "email", "role", "passwordHash", "sessionToken", "createdAt", "updatedAt"],
  "Banners": ["id", "title", "description", "imageUrl", "status", "createdAt", "updatedAt"],
  "Donors": ["id", "name", "phone", "village", "email", "status", "createdAt", "updatedAt"],
  "Donations": ["id", "donorName", "phone", "amount", "paymentMethod", "utrNumber", "status", "notes", "verifiedBy", "createdAt", "updatedAt"],
  "Events": ["id", "title", "eventDate", "time", "location", "description", "status", "createdAt", "updatedAt"],
  "WorkAllocations": ["id", "taskName", "assignedTo", "phone", "dueDate", "priority", "status", "createdAt", "updatedAt"],
  "FoodDistribution": ["id", "distributionDate", "mealType", "foodItem", "quantity", "sponsorName", "notes", "createdAt", "updatedAt"],
  "FinancialTracker": ["id", "date", "type", "category", "amount", "paymentMode", "description", "createdAt", "updatedAt"],
  "FinancialAssistance": ["id", "personName", "phone", "amount", "issueDate", "dueDate", "status", "notes", "createdAt", "updatedAt"],
  "Repayments": ["id", "assistanceId", "personName", "amountPaid", "paymentDate", "paymentMode", "createdAt", "updatedAt"],
  "PoojaItems": ["id", "dayNumber", "itemName", "quantity", "unit", "estimatedCost", "isPurchased", "createdAt", "updatedAt"],
  "GroceryList": ["id", "itemName", "category", "quantity", "unit", "vendor", "isPurchased", "createdAt", "updatedAt"],
  "Notes": ["id", "title", "content", "category", "pinned", "author", "createdAt", "updatedAt"],
  "Reminders": ["id", "title", "reminderDate", "reminderTime", "isCompleted", "createdAt", "updatedAt"],
  "CulturalStories": ["id", "title", "storyText", "summary", "language", "createdAt", "updatedAt"],
  "AIKnowledge": ["id", "category", "question", "answer", "keywords", "createdAt", "updatedAt"],
  "FestivalHistory": ["id", "year", "title", "highlights", "totalDonations", "totalExpenses", "createdAt", "updatedAt"],
  "FlipBook": ["id", "pageNumber", "title", "storyText", "imageUrl", "status", "createdAt", "updatedAt"],
  "AIConversations": ["id", "sessionId", "question", "answer", "createdAt", "updatedAt"],
  "AISettings": ["id", "settingKey", "settingValue", "description", "createdAt", "updatedAt"],
  "AuditLogs": ["id", "timestamp", "action", "sheetName", "recordId", "details", "createdAt"],
  "Announcements": ["id", "title", "message", "priority", "startDate", "endDate", "status", "createdAt", "updatedAt"]
};

// STRICT PUBLIC / USER PERMITTED TABLES (16 TABLES ONLY)
const SAFE_PUBLIC_TABLES = [
  "Banners", "Donors", "Donations", "Events", "WorkAllocations", "FoodDistribution", 
  "FinancialTracker", "FinancialAssistance", "Repayments", "PoojaItems", "GroceryList", 
  "Notes", "Reminders", "CulturalStories", "FestivalHistory", "Announcements"
];

const DATE_FIELDS = {
    "Donations": "createdAt", "Events": "eventDate", "FinancialTracker": "date",
    "FoodDistribution": "distributionDate", "FestivalHistory": "year", "FinancialAssistance": "issueDate",
    "Repayments": "paymentDate", "Reminders": "reminderDate"
};

// Mooshika DOM Elements
let mooshikaRat, mooshikaChat, mooshikaInput, mooshikaMessages, mooshikaTyping, mooshikaSend;

/* ============================================================
   DATE FORMATTER (DD-MM-YYYY)
============================================================ */
function formatDate(isoString) {
    if (!isoString) return '-';
    if (/^\d{4}$/.test(isoString.toString().trim())) return isoString;
    const date = new Date(isoString);
    if (isNaN(date.getTime())) return isoString; 
    const d = String(date.getDate()).padStart(2, '0');
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const y = date.getFullYear();
    return `${d}-${m}-${y}`; 
}

/* ============================================================
   TRANSLATION DICTIONARY
============================================================ */
const i18n = {
    en: {
        navBanners: "Banners", navEvents: "Events", navWork: "Work Allocations", navDonations: "Donations",
        navFood: "Food Dist.", navFinances: "Finances", navFlipbook: "FlipBook", navAdmin: "Admin",
        loginBtn: "Login", adminBtn: "Admin", logoutBtn: "Logout",
        drumRat: "Drum (🥁)", fluteRat: "Flute (🪈)", prayRat: "Pray 🙏",
        appTitle: "Vinayaka Seva - Festival Portal",
        tagline: "Live Information Portal for Sri Vinayaka Chavithi", tagline2: "Live Information Portal for Sri Vinayaka Chavithi",
        loading: "Loading information...",
        onlineDonation: "Online Donation (Direct UPI Checkout)",
        devoteeName: "Devotee Name", phoneNumber: "Phone Number", amountLbl: "Amount (₹)",
        genQR: "Generate QR Code", scanLbl: "Scan using PhonePe, Google Pay, or Paytm",
        submitVerification: "Submit Verification",
        publicDbTitle: "📋 Public Database", yearLbl: "Year:",
        welcomeBack: "Welcome back", userDashDesc: "Your personal dashboard allows you to track your donations and activities.",
        userLoginTitle: "User Login", closeBtn: "Close", newUserTxt: "New user?", signupLink: "Sign up here",
        userSignupTitle: "User Sign Up", createAccBtn: "Create Account", hasAccTxt: "Already have an account?", loginLink: "Login here",
        adminLoginTitle: "Admin Access", secureLoginBtn: "Secure Login",
        adminPortalTitle: "Admin Portal", dashboardBtn: "Dashboard", financialDashBtn: "Financial Dashboard",
        allTablesLbl: "All Tables Database", sysOverviewLbl: "System Overview & Database Engine",
        financialDashTitle: "Yearly Financial Accounting", addRecordBtn: "Add Record", recordMgmtTitle: "Record Management",
        cancelBtn: "Cancel", saveRecordBtn: "Save Record",
        mooshikaBrain: "Mooshika AI (GPT-Brain)", aiGreeting: "🙏 Jai Ganesha! I am your Mooshika Advanced GPT Brain. Ask me about 2025 donations, yearly comparisons, growth, expenses, or any database records."
    },
    te: {
        navBanners: "బ్యానర్లు", navEvents: "కార్యక్రమాలు", navWork: "సేవా కేటాయింపులు", navDonations: "విరాళాలు",
        navFood: "అన్నదానం", navFinances: "ఆర్థిక లెక్కలు", navFlipbook: "ఫ్లిప్‌బుక్", navAdmin: "అడ్మిన్",
        loginBtn: "లాగిన్", adminBtn: "అడ్మిన్", logoutBtn: "లాగౌట్",
        drumRat: "డోలు (🥁)", fluteRat: "వేణువు (🪈)", prayRat: "నమస్కారం 🙏",
        appTitle: "స్వర్ణ గణపతి స్వామి వారి - ఉత్సవాల వేదిక",
        tagline: "శ్రీ వినాయక చవితి మహోత్సవాల ప్రత్యక్ష సమాచార వేదిక", tagline2: "శ్రీ వినాయక చవితి మహోత్సవాల ప్రత్యక్ష సమాచార వేదిక",
        loading: "సమాచారం లోడ్ అవుతోంది...",
        onlineDonation: "ఆన్‌లైన్ విరాళం (Direct UPI Checkout)",
        devoteeName: "భక్తుని పేరు", phoneNumber: "ఫోన్ నంబర్", amountLbl: "మొత్తం (₹)",
        genQR: "QR కోడ్ రూపొందించండి", scanLbl: "PhonePe, Google Pay, లేదా Paytm తో స్కాన్ చేయండి",
        submitVerification: "చెల్లింపును ధృవీకరించండి",
        publicDbTitle: "📋 పబ్లిక్ రికార్డులు (Public Database)", yearLbl: "సంవత్సరం (Year):",
        welcomeBack: "స్వాగతం", userDashDesc: "మీ వ్యక్తిగత డాష్‌బోర్డ్ ద్వారా మీ విరాళాలు మరియు కార్యకలాపాలను ట్రాక్ చేయవచ్చు.",
        userLoginTitle: "యూజర్ లాగిన్", closeBtn: "మూసివేయు (Close)", newUserTxt: "కొత్త వారా?", signupLink: "ఇక్కడ సైన్ అప్ చేయండి",
        userSignupTitle: "యూజర్ సైన్ అప్", createAccBtn: "ఖాతా సృష్టించండి", hasAccTxt: "ఖాతా ఉందా?", loginLink: "ఇక్కడ లాగిన్ అవ్వండి",
        adminLoginTitle: "అడ్మిన్ లాగిన్", secureLoginBtn: "సురక్షిత లాగిన్",
        adminPortalTitle: "అడ్మిన్ పోర్టల్", dashboardBtn: "డాష్‌బోర్డ్", financialDashBtn: "ఆర్థిక డాష్‌బోర్డ్",
        allTablesLbl: "అన్ని డేటాబేస్ పట్టికలు", sysOverviewLbl: "సిస్టమ్ స్థూలదృష్టి & డేటాబేస్ ఇంజిన్",
        financialDashTitle: "వార్షిక ఆర్థిక లెక్కలు (Yearly Accounting)", addRecordBtn: "కొత్త రికార్డు", recordMgmtTitle: "రికార్డు నిర్వహణ",
        cancelBtn: "రద్దు చేయి", saveRecordBtn: "భద్రపరచు",
        mooshikaBrain: "మూషిక AI (అడ్వాన్స్‌డ్ బ్రెయిన్)", aiGreeting: "🙏 జై గణేశా! నేను మీ మూషిక అడ్వాన్స్‌డ్ AI. 2025 విరాళాలు, దాతలు, వార్షిక పోలికలు, పెరుగుదల మరియు ఖర్చుల గురించి నన్ను అడగండి."
    }
};

/* ============================================================
   EVENT DELEGATION
============================================================ */
document.addEventListener("DOMContentLoaded", function() {
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('service-worker.js').catch(err => console.log('SW Reg failed:', err));
    }

    const aiInput = document.getElementById("chat-input");
    if (aiInput) {
        aiInput.addEventListener("keydown", function(event) {
            if (event.key === "Enter") { event.preventDefault(); sendChatMessage(); }
        });
    }

    mooshikaRat = document.getElementById("mooshika-rat-btn");
    mooshikaChat = document.getElementById("chat-box");
    mooshikaInput = document.getElementById("chat-input");
    mooshikaMessages = document.getElementById("chat-messages");
    mooshikaTyping = document.getElementById("typing-indicator");
    mooshikaSend = document.getElementById("btn-chat-send");

    document.addEventListener("click", function(e) {
        const btn = e.target.closest('[data-action]');
        if(!btn) return;
        
        const action = btn.getAttribute('data-action');
        const target = btn.getAttribute('data-target');
        
        if(action === 'showModal') showModal(target);
        if(action === 'hideModal') hideModal(target);
        if(action === 'switchModal') { hideModal(btn.getAttribute('data-from')); showModal(btn.getAttribute('data-to')); }
        if(action === 'handleLogin') handleLogin(btn.getAttribute('data-type'));
        if(action === 'handleSignup') handleSignup();
        if(action === 'logout') logout();
        if(action === 'setLangTe') setLanguage('te');
        if(action === 'setLangEn') setLanguage('en');
        if(action === 'generateUPI') generateUPIQRCode();
        if(action === 'confirmUPI') confirmUPIPayment();
        if(action === 'showAdminSection') showAdminSection(btn.getAttribute('data-section'));
        if(action === 'openRecordModal') openRecordModal();
        if(action === 'saveRecord') saveRecord();
        if(action === 'toggleChat') toggleChat();
        if(action === 'clearChat') clearChatHistory();
        if(action === 'sendChat') sendChatMessage();
        if(action === 'startVoice') startVoiceRecognition();
        if(action === 'stopVoice') stopAIaudio();
        if(action === 'openFlipbook') openFlipbook();
        if(action === 'closeFlipbook') closeFlipbook();
        if(action === 'flipbookNext') turnPage(1);
        if(action === 'flipbookPrev') turnPage(-1);
        if(action === 'prevSlide') prevSlide();
        if(action === 'nextSlide') nextSlide();
        if(action === 'calculateInterest') calculateInterest();
    });

    document.addEventListener("change", function(e) {
        const action = e.target.getAttribute('data-action');
        if(action === 'renderPublicTable' || e.target.id === 'public-table-selector') {
            e.preventDefault();
            renderPublicTable();
        }
        if(action === 'filterPublicTable' || e.target.id === 'public-year-filter') {
            e.preventDefault();
            renderPublicTable();
        }
        if(action === 'filterFlipbookSection' || e.target.id === 'section-flipbook-year') {
            e.preventDefault();
            filterFlipbookSection();
        }
        if(action === 'handleAdminYearChange' || e.target.id === 'global-year-filter') {
            e.preventDefault();
            handleYearChange();
        }
    });

    document.addEventListener("keyup", function(e) {
        if(e.target.getAttribute('data-action') === 'filterCurrentTable') filterCurrentTable();
    });

    generateYears(2000, new Date().getFullYear());
    setLanguage(appState.lang);
    initializeApp();
});

function initializeApp() {
    updateRouting();
    if (appState.role === 'public' || appState.role === 'user') {
        loadPublicData();
        if(appState.role === 'user') loadUserDashboard();
    } else if (appState.role === 'admin') {
        loadAdminDashboard();
    }
}

function updateRouting() {
    document.getElementById('public-view')?.classList.add('hidden');
    document.getElementById('user-view')?.classList.add('hidden');
    document.getElementById('admin-view')?.classList.add('hidden');
    
    document.getElementById('btn-login')?.classList.toggle('hidden', appState.token !== null);
    document.getElementById('btn-admin-login')?.classList.toggle('hidden', appState.token !== null);
    document.getElementById('btn-logout')?.classList.toggle('hidden', appState.token === null);

    document.getElementById(`${appState.role}-view`)?.classList.remove('hidden');
    if(appState.role === 'user') document.getElementById('public-view')?.classList.remove('hidden');
}

function setLanguage(lang) {
    appState.lang = lang;
    const isTe = lang === 'te';
    document.getElementById('lang-btn-te').className = isTe ? 'px-2.5 py-1 rounded-lg bg-amber-500 text-amber-950 transition' : 'px-2.5 py-1 rounded-lg text-amber-200 hover:text-white transition';
    document.getElementById('lang-btn-en').className = !isTe ? 'px-2.5 py-1 rounded-lg bg-amber-500 text-amber-950 transition' : 'px-2.5 py-1 rounded-lg text-amber-200 hover:text-white transition';
    
    document.querySelectorAll('[data-i18n]').forEach(el => {
        const key = el.getAttribute('data-i18n');
        if(i18n[lang] && i18n[lang][key]) {
            if(el.innerHTML.includes('<svg') || el.innerHTML.includes('<i')) {
                const icon = el.innerHTML.match(/<(svg|i)[^>]*>.*?<\/(svg|i)>/)?.[0] || '';
                el.innerHTML = icon + ' ' + i18n[lang][key];
            } else {
                el.innerText = i18n[lang][key];
            }
        }
    });
    renderPublicTable();
    renderFlipbookArchiveSection();
    showToast(`Language changed to ${isTe ? 'Telugu' : 'English'}`, 'info');
}

function showToast(message, type = 'success') {
    const container = document.getElementById("toast-container");
    if(!container) return;
    const toast = document.createElement("div");
    const bg = type === 'success' ? 'bg-green-600' : type === 'error' ? 'bg-red-600' : 'bg-blue-600';
    const icon = type === 'success' ? 'fa-check-circle' : type === 'error' ? 'fa-exclamation-circle' : 'fa-info-circle';
    toast.className = `toast-enter flex items-center gap-3 ${bg} text-white px-4 py-3 rounded-lg shadow-xl border border-white/20`;
    toast.innerHTML = `<i class="fas ${icon} text-lg"></i><span class="font-bold text-sm">${message}</span>`;
    container.appendChild(toast);
    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateX(100%)';
        setTimeout(() => toast.remove(), 300);
    }, 4000);
}

function showModal(id) { document.getElementById(id)?.classList.remove('hidden'); }
function hideModal(id) { document.getElementById(id)?.classList.add('hidden'); }

function generateYears(startYear, endYear) {
    let yearHTML = '<option value="all">All Years</option>';
    for(let y = endYear; y >= startYear; y--) {
        yearHTML += `<option value="${y}">${y}</option>`;
    }
    const adminFilter = document.getElementById('global-year-filter');
    const publicFilter = document.getElementById('public-year-filter');
    const sectionFlipbookYear = document.getElementById('section-flipbook-year');
    
    if(adminFilter) adminFilter.innerHTML = yearHTML;
    if(publicFilter) publicFilter.innerHTML = yearHTML;
    if(sectionFlipbookYear) sectionFlipbookYear.innerHTML = yearHTML;
}

/* ============================================================
   AUTHENTICATION
============================================================ */
async function handleLogin(type) {
    const modalId = type === 'admin' ? 'admin-login-modal' : 'login-modal';
    const btn = document.querySelector(`#${modalId} button`);
    const originalText = btn.innerText;
    btn.innerText = "Verifying...";
    btn.disabled = true;

    const payload = type === 'admin' 
        ? { action: 'adminLogin', secret: document.getElementById('admin-secret').value }
        : { action: 'login', identifier: document.getElementById('login-id').value, password: document.getElementById('login-pass').value };
    
    try {
        const res = await fetch(API_URL, { method: 'POST', body: JSON.stringify(payload) }).then(r => r.json());
        if (res.status === 'success') {
            sessionStorage.setItem('sessionToken', res.sessionToken);
            sessionStorage.setItem('userRole', res.user.role);
            sessionStorage.setItem('userName', res.user.name);
            appState = { token: res.sessionToken, role: res.user.role, userName: res.user.name, currentYear: appState.currentYear, lang: appState.lang };
            hideModal(modalId);
            showToast(`Welcome back, ${res.user.name}!`);
            initializeApp();
        } else { showToast(res.message || "Invalid credentials", "error"); }
    } catch (err) { showToast("Network error during login.", "error"); } 
    finally { btn.innerText = originalText; btn.disabled = false; }
}

async function handleSignup() {
    const name = document.getElementById('signup-name').value.trim();
    const phone = document.getElementById('signup-phone').value.trim();
    const email = document.getElementById('signup-email').value.trim();
    const pass = document.getElementById('signup-pass').value;
    const confirm = document.getElementById('signup-confirm').value;

    if (!name || !phone || !pass) return showToast("Please fill all required fields", "error");
    if (pass !== confirm) return showToast("Passwords do not match", "error");

    const btn = document.querySelector('#signup-modal button[data-action="handleSignup"]');
    btn.innerText = "Creating Account...";
    btn.disabled = true;

    try {
        const res = await fetch(API_URL, { 
            method: 'POST', body: JSON.stringify({ action: 'signup', data: { name, phone, email, password: pass } }) 
        }).then(r => r.json());

        if (res.status === 'success') {
            showToast("Account created successfully! Please log in.");
            hideModal('signup-modal'); showModal('login-modal');
        } else { showToast(res.message || "Signup failed", "error"); }
    } catch (err) { showToast("Network error during signup.", "error"); } 
    finally { btn.innerText = "Create Account"; btn.disabled = false; }
}

function logout() {
    sessionStorage.clear();
    appState = { token: null, role: 'public', userName: null, currentYear: new Date().getFullYear().toString(), lang: appState.lang };
    showToast("Logged out securely.", "info");
    initializeApp();
}

/* ============================================================
   DATA LOADING & FINANCIAL BRIDGE
============================================================ */
async function loadPublicData() {
    try {
        const res = await fetch(API_URL, { method: 'POST', body: JSON.stringify({ action: 'getPublicData' }) }).then(r => r.json());
        if (res.status === 'success') {
            publicDataCache = res.data;
            populatePublicTableDropdown();
            renderPublicTable();
            renderCarousel(publicDataCache.Banners || []);
            renderFlipbookArchiveSection();
            feedFinancialData(); // Feed Financial Calculator
        }
    } catch (err) { console.error("Failed to load public data", err); }
}

async function loadAdminDashboard() {
    const adminUserEl = document.getElementById('admin-user-name');
    if (adminUserEl) adminUserEl.textContent = appState.userName;
    
    renderAdminSidebar();

    try {
        const res = await fetch(API_URL, { method: 'POST', body: JSON.stringify({ action: 'getAdminData', sessionToken: appState.token }) }).then(r => r.json());
        if (res.status === 'success') {
            adminDataCache = res.data;
            appState.currentYear = "all";
            const yearFilterEl = document.getElementById('global-year-filter');
            if (yearFilterEl) yearFilterEl.value = "all";

            renderDashboardMetrics();
            renderFinancialDashboard();
            feedFinancialData(); // Feed Financial Calculator
        } else { showToast(res.message, "error"); logout(); }
    } catch (err) { showToast("Failed to load admin data", "error"); }
}

function loadUserDashboard() {
    const userDisplay = document.getElementById('user-display-name');
    const panel = document.getElementById('user-greeting-panel');
    if (userDisplay && panel) {
        userDisplay.textContent = appState.userName || 'Devotee';
        panel.classList.remove('hidden');
    }
}

function feedFinancialData() {
    const cache = (appState.role === 'admin') ? adminDataCache : publicDataCache;
    const donations = cache["Donations"] || [];
    const tracker = cache["FinancialTracker"] || [];
    const assistance = cache["FinancialAssistance"] || [];
    const repayments = cache["Repayments"] || [];

    const allTransactions = [
        ...donations.filter(d => d.status === 'Verified').map(d => ({ ...d, transactionType: 'donation', amount: d.amount, date: d.createdAt || d.date || d.donationDate })),
        ...tracker.map(t => ({ ...t, transactionType: t.type || 'expense', amount: t.amount, date: t.date || t.createdAt })),
        ...assistance.map(a => ({ ...a, transactionType: 'expense', amount: a.amount, date: a.issueDate || a.createdAt })),
        ...repayments.map(r => ({ ...r, transactionType: 'income', amount: r.amountPaid || r.amount, date: r.paymentDate || r.createdAt }))
    ];

    if (typeof window.setFinancialTransactions === 'function') {
        window.setFinancialTransactions(allTransactions);
    }
}

/* ============================================================
   PUBLIC VIEWER & CAROUSEL
============================================================ */
function populatePublicTableDropdown() {
    const selector = document.getElementById("public-table-selector");
    if (!selector) return;
    
    // Strict 16-table limit for Public/User views
    const availableTables = SAFE_PUBLIC_TABLES.filter(t => publicDataCache[t]);
    
    if (availableTables.length === 0) {
        selector.innerHTML = `<option value="Donations">Donations</option><option value="Events">Events</option>`;
    } else {
        selector.innerHTML = availableTables.map(t => `<option value="${t}">${t}</option>`).join('');
    }
    
    if (selector.querySelector('option[value="Donations"]')) {
        selector.value = "Donations";
    }
}

function renderPublicTable() {
    const selector = document.getElementById("public-table-selector");
    const yearFilter = document.getElementById("public-year-filter");
    if (!selector || !yearFilter) return;
    
    const tableKey = selector.value;
    const selectedYear = yearFilter.value;
    let records = publicDataCache[tableKey] || [];
    
    const dateField = DATE_FIELDS[tableKey] || "createdAt";
    if (selectedYear !== "all") {
        records = records.filter(item => (item[dateField] || "").toString().includes(selectedYear));
    }

    const thead = document.getElementById("public-table-head");
    const tbody = document.getElementById("public-table-body");
    
    if (records.length === 0) {
        thead.innerHTML = `<tr><th class="p-4 text-center">Notice</th></tr>`;
        tbody.innerHTML = `<tr><td class="p-6 text-center text-amber-300">No public records available for ${selectedYear === 'all' ? 'any year' : selectedYear}.</td></tr>`;
        return;
    }

    const keys = Object.keys(records[0]).filter(k => !["id", "passwordHash", "sessionToken", "updatedAt", "password"].includes(k));
    
    thead.innerHTML = `<tr>${keys.map(k => `<th class="p-4 border-b border-amber-500/30">${k}</th>`).join('')}</tr>`;
    tbody.innerHTML = records.map(r => `
        <tr class="hover:bg-amber-900/30 transition border-b border-amber-800/30">
            ${keys.map(k => {
                let val = r[k] || '-';
                if(k.toLowerCase().includes('date') || k.toLowerCase().includes('at')) val = formatDate(val);
                return `<td class="p-4 whitespace-nowrap">${val}</td>`;
            }).join('')}
        </tr>
    `).join('');
}

let slideIndex = 0;
let carouselTimer = null;
function renderCarousel(banners) {
    const track = document.getElementById('carousel-track');
    if (!track) return;
    const activeBanners = banners.filter(b => b.status === "Active");
    if (activeBanners.length === 0) return track.innerHTML = `<div class="min-w-full h-full flex items-center justify-center bg-amber-900/40 text-amber-200 font-bold">No active announcements</div>`;
    
    track.innerHTML = activeBanners.map(b => `
        <div class="min-w-full h-full relative flex-shrink-0">
            <img src="${b.imageUrl}" class="w-full h-full object-cover opacity-80" alt="${b.title}" onerror="this.src='https://images.unsplash.com/photo-1628744448840-55bdb2497bd4?w=800&q=80'">
            <div class="absolute inset-0 bg-gradient-to-t from-amber-950 via-transparent to-transparent flex flex-col justify-end p-8">
                <h3 class="text-3xl font-black text-amber-300 drop-shadow-md">${b.title}</h3>
                <p class="text-white font-bold drop-shadow-md">${b.description}</p>
            </div>
        </div>
    `).join('');
    if (carouselTimer) clearInterval(carouselTimer);
    carouselTimer = setInterval(nextSlide, 5000);
}
function nextSlide() { const track = document.getElementById('carousel-track'); if (track) { slideIndex = (slideIndex + 1) % track.children.length; track.style.transform = `translateX(-${slideIndex * 100}%)`; } }
function prevSlide() { const track = document.getElementById('carousel-track'); if (track) { slideIndex = (slideIndex - 1 + track.children.length) % track.children.length; track.style.transform = `translateX(-${slideIndex * 100}%)`; } }

/* ============================================================
   PUBLIC UPI
============================================================ */
function generateUPIQRCode() {
    const name = document.getElementById("upi-name")?.value.trim();
    const amount = document.getElementById("upi-amount")?.value.trim();
    if (!name || !amount || Number(amount) <= 0) return showToast("Please enter Name and a valid Amount", "error");
    const upiUrl = `upi://pay?pa=9390198031@ybl&pn=VinayakaSeva&tn=Donation_${encodeURIComponent(name)}&am=${amount}&cu=INR`;
    document.getElementById("upi-qr-image").src = `https://quickchart.io/qr?text=${encodeURIComponent(upiUrl)}&size=250&margin=2`;
    document.getElementById("upi-qr-box").classList.remove("hidden");
    document.getElementById("upi-qr-box").classList.add("flex");
    showToast("QR Code Generated! Please scan.");
}

async function confirmUPIPayment() {
    const name = document.getElementById("upi-name").value.trim();
    const phone = document.getElementById("upi-phone").value.trim();
    const amount = document.getElementById("upi-amount").value.trim();
    const utr = document.getElementById("upi-utr").value.trim();
    if (!utr || utr.length < 6) return showToast("Enter a valid UTR/Reference number", "error");

    const btn = document.getElementById("btn-confirm-upi");
    btn.disabled = true; btn.innerText = "Submitting...";
    try {
        const payload = { action: 'add', sessionToken: 'public_submission', sheetName: 'Donations', data: { donorName: name, phone: phone, amount: amount, paymentMethod: 'UPI', utrNumber: utr, status: 'Pending' } };
        const res = await fetch(API_URL, { method: "POST", body: JSON.stringify(payload) }).then(r => r.json());
        if (res.status === 'success') {
            showToast("Payment details submitted! Pending admin verification.");
            document.getElementById("upi-qr-box").classList.replace("flex", "hidden");
            document.getElementById("upi-name").value = ""; document.getElementById("upi-phone").value = ""; document.getElementById("upi-amount").value = ""; document.getElementById("upi-utr").value = "";
        } else { showToast(res.message, "error"); }
    } catch(e) { showToast("Submission failed", "error"); } finally { btn.disabled = false; btn.innerText = "Submit Verification"; }
}

/* ============================================================
   ADMIN DASHBOARD ENGINE
============================================================ */
function renderAdminSidebar() {
    const container = document.getElementById('admin-table-buttons');
    if(!container) return;
    const tables = Object.keys(TABLE_SCHEMAS);
    container.innerHTML = tables.map(t => `<button onclick="renderTableView('${t}')" class="text-left px-3 py-1.5 rounded-lg hover:bg-amber-900 text-amber-100 font-bold text-xs transition"><i class="fas fa-table w-4 text-amber-500"></i> ${t}</button>`).join('');
}

function handleYearChange() {
    appState.currentYear = document.getElementById('global-year-filter').value;
    renderDashboardMetrics();
    renderFinancialDashboard();
    if (currentTableName) renderTableView(currentTableName);
}

function renderDashboardMetrics() {
    showAdminSection('dashboard');
    const year = appState.currentYear;
    const dashSection = document.getElementById('admin-dashboard-section');
    if (!dashSection) return;
    
    const filterByYear = (arr, dateField) => {
        if (!arr) return [];
        if (year === "all") return arr;
        return arr.filter(item => (item[dateField] || "").toString().includes(year));
    };

    const yrDonations = filterByYear(adminDataCache["Donations"], DATE_FIELDS["Donations"]);
    const yrExpenses = filterByYear(adminDataCache["FinancialTracker"], DATE_FIELDS["FinancialTracker"]);
    
    let totalDonors = adminDataCache["Donors"] ? filterByYear(adminDataCache["Donors"], "createdAt").length : 0;
    let verifiedDonations = yrDonations ? yrDonations.filter(d => d.status === "Verified").reduce((acc, curr) => acc + (parseFloat(curr.amount) || 0), 0) : 0;
    let totalExpenses = yrExpenses ? yrExpenses.reduce((acc, curr) => acc + (parseFloat(curr.amount) || 0), 0) : 0;
    let eventCount = adminDataCache["Events"] ? filterByYear(adminDataCache["Events"], DATE_FIELDS["Events"]).length : 0;

    dashSection.innerHTML = `
        <div class="bg-amber-900/60 p-5 rounded-xl border border-amber-500/30 flex flex-col justify-center shadow-lg hover:bg-amber-800/80 transition">
            <span class="text-amber-200 text-xs font-bold uppercase tracking-wider mb-1"><i class="fas fa-users"></i> Total Donors</span>
            <span class="text-3xl font-black text-white">${totalDonors}</span>
        </div>
        <div class="bg-green-900/60 p-5 rounded-xl border border-green-500/30 flex flex-col justify-center shadow-lg hover:bg-green-800/80 transition">
            <span class="text-green-200 text-xs font-bold uppercase tracking-wider mb-1"><i class="fas fa-check-circle"></i> Verified Donations</span>
            <span class="text-3xl font-black text-white">₹${verifiedDonations.toLocaleString('en-IN')}</span>
        </div>
        <div class="bg-red-900/60 p-5 rounded-xl border border-red-500/30 flex flex-col justify-center shadow-lg hover:bg-red-800/80 transition">
            <span class="text-red-200 text-xs font-bold uppercase tracking-wider mb-1"><i class="fas fa-wallet"></i> Total Expenses</span>
            <span class="text-3xl font-black text-white">₹${totalExpenses.toLocaleString('en-IN')}</span>
        </div>
        <div class="bg-blue-900/60 p-5 rounded-xl border border-blue-500/30 flex flex-col justify-center shadow-lg hover:bg-blue-800/80 transition">
            <span class="text-blue-200 text-xs font-bold uppercase tracking-wider mb-1"><i class="fas fa-calendar-alt"></i> Events</span>
            <span class="text-3xl font-black text-white">${eventCount}</span>
        </div>
    `;
}

function renderFinancialDashboard() {
    const container = document.getElementById('financial-metrics-container');
    if (!container) return;

    if (appState.currentYear === "all") {
        container.innerHTML = `<p class="text-amber-200 col-span-3 text-center bg-amber-900/40 p-4 rounded-xl border border-amber-500/30">Please select a specific year to view detailed carry-forward accounting.</p>`;
        return;
    }

    const targetYear = parseInt(appState.currentYear);
    
    let openingBalance = 0;
    if (adminDataCache["Donations"] && adminDataCache["FinancialTracker"] && adminDataCache["Repayments"] && adminDataCache["FinancialAssistance"]) {
        const pastDonations = adminDataCache["Donations"].filter(d => d.status === "Verified" && parseInt((d.createdAt||"").substring(0,4)) < targetYear).reduce((acc, curr) => acc + (parseFloat(curr.amount) || 0), 0);
        const pastRepayments = adminDataCache["Repayments"].filter(d => parseInt((d.paymentDate||d.createdAt||"").substring(0,4)) < targetYear).reduce((acc, curr) => acc + (parseFloat(curr.amountPaid) || 0), 0);
        const pastExpenses = adminDataCache["FinancialTracker"].filter(d => parseInt((d.date||"").substring(0,4)) < targetYear).reduce((acc, curr) => acc + (parseFloat(curr.amount) || 0), 0);
        const pastAssistance = adminDataCache["FinancialAssistance"].filter(d => parseInt((d.issueDate||"").substring(0,4)) < targetYear).reduce((acc, curr) => acc + (parseFloat(curr.amount) || 0), 0);

        openingBalance = (pastDonations + pastRepayments) - (pastExpenses + pastAssistance);
    }

    let cyDonations = 0, cyRepayments = 0, cyExpenses = 0, cyAssistance = 0;
    if (adminDataCache["Donations"]) cyDonations = adminDataCache["Donations"].filter(d => d.status === "Verified" && parseInt((d.createdAt||"").substring(0,4)) === targetYear).reduce((acc, curr) => acc + (parseFloat(curr.amount) || 0), 0);
    if (adminDataCache["Repayments"]) cyRepayments = adminDataCache["Repayments"].filter(d => parseInt((d.paymentDate||d.createdAt||"").substring(0,4)) === targetYear).reduce((acc, curr) => acc + (parseFloat(curr.amountPaid) || 0), 0);
    if (adminDataCache["FinancialTracker"]) cyExpenses = adminDataCache["FinancialTracker"].filter(d => parseInt((d.date||"").substring(0,4)) === targetYear).reduce((acc, curr) => acc + (parseFloat(curr.amount) || 0), 0);
    if (adminDataCache["FinancialAssistance"]) cyAssistance = adminDataCache["FinancialAssistance"].filter(d => parseInt((d.issueDate||"").substring(0,4)) === targetYear).reduce((acc, curr) => acc + (parseFloat(curr.amount) || 0), 0);

    const totalIncome = cyDonations + cyRepayments;
    const totalOutflow = cyExpenses + cyAssistance;
    const closingBalance = openingBalance + totalIncome - totalOutflow;

    container.innerHTML = `
        <div class="bg-amber-950 p-5 rounded-xl border border-amber-500/50 shadow-md">
            <p class="text-xs font-bold text-amber-400 uppercase tracking-widest mb-2"><i class="fas fa-piggy-bank"></i> Opening Balance</p>
            <p class="text-2xl font-black text-white">₹${openingBalance.toLocaleString('en-IN')}</p>
        </div>
        <div class="bg-green-950 p-5 rounded-xl border border-green-500/50 shadow-md">
            <p class="text-xs font-bold text-green-400 uppercase tracking-widest mb-2"><i class="fas fa-arrow-down"></i> Income (Donations+Repay)</p>
            <p class="text-2xl font-black text-green-300">+ ₹${totalIncome.toLocaleString('en-IN')}</p>
        </div>
        <div class="bg-red-950 p-5 rounded-xl border border-red-500/50 shadow-md">
            <p class="text-xs font-bold text-red-400 uppercase tracking-widest mb-2"><i class="fas fa-arrow-up"></i> Outflow (Exp+Assist)</p>
            <p class="text-2xl font-black text-red-300">- ₹${totalOutflow.toLocaleString('en-IN')}</p>
        </div>
        <div class="col-span-1 sm:col-span-3 bg-gradient-to-r from-amber-500 to-amber-600 p-6 rounded-xl border-2 border-amber-300 shadow-[0_10px_25px_rgba(245,158,11,0.4)] flex justify-between items-center text-amber-950 mt-2">
            <span class="font-black text-xl uppercase tracking-widest">Closing Balance (${targetYear})</span>
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
    const dateField = DATE_FIELDS[tableName] || "createdAt";
    
    if (appState.currentYear && appState.currentYear !== "all") {
        data = data.filter(item => {
            const rowDate = (item[dateField] || item.createdAt || item.date || item.eventDate || item.year || "").toString();
            if (!rowDate || rowDate === '-') return true;
            return rowDate.includes(appState.currentYear);
        });
    }

    const thead = document.getElementById('dynamic-table-head');
    const tbody = document.getElementById('dynamic-table-body');
    if (!thead || !tbody) return;
    
    thead.innerHTML = ""; tbody.innerHTML = "";

    const schemaFields = TABLE_SCHEMAS[tableName] || [];
    const keys = schemaFields.filter(k => k !== "id");
    
    let headerRow = "<tr>";
    keys.forEach(k => { headerRow += `<th class="px-4 py-3">${k}</th>`; });
    headerRow += `<th class="px-4 py-3 text-right">Actions</th></tr>`;
    thead.innerHTML = headerRow;

    if (data.length === 0) {
        tbody.innerHTML = `<tr><td class="p-4 text-center text-amber-300/80" colspan="100%">No records found in ${tableName}. Click 'Add Record' above to insert data.</td></tr>`;
        return;
    }

    data.forEach(row => {
        let tr = document.createElement('tr');
        tr.className = "hover:bg-amber-900/40 transition border-b border-amber-800/30";
        
        keys.forEach(k => {
            let val = row[k] !== undefined && row[k] !== "" ? row[k] : '-';
            
            if((k.toLowerCase().includes('date') || k.toLowerCase().includes('at')) && val !== '-') {
                val = formatDate(val);
            }
            
            if(k === "status") {
                if(val === "Verified" || val === "Active" || val === "Published") val = `<span class="bg-green-600/30 text-green-400 px-2 py-0.5 rounded text-xs font-bold">${val}</span>`;
                else if(val === "Pending" || val === "Unverified") val = `<span class="bg-yellow-600/30 text-yellow-400 px-2 py-0.5 rounded text-xs font-bold">${val}</span>`;
                else val = `<span class="bg-red-600/30 text-red-400 px-2 py-0.5 rounded text-xs font-bold">${val}</span>`;
            } else if(k === "imageUrl" && val && val !== '-') {
                val = `<img src="${val}" class="h-8 w-16 object-cover rounded border border-amber-500" onerror="this.src='https://images.unsplash.com/photo-1628744448840-55bdb2497bd4?w=200&q=80'">`;
            }
            tr.innerHTML += `<td class="px-4 py-3 whitespace-nowrap max-w-[200px] truncate" title="${val}">${val}</td>`;
        });

        let actions = `<td class="px-4 py-3 text-right space-x-3 whitespace-nowrap">`;
        if(tableName === "Donations" && row.status !== "Verified") {
            actions += `<button onclick="verifyDonation('${row.id}')" class="text-green-400 hover:text-green-300 font-bold text-xs" title="Verify Payment"><i class="fas fa-check-circle"></i> Verify</button>`;
        }
        actions += `
            <button onclick="openRecordModal('${row.id}')" class="text-blue-400 hover:text-blue-300 font-bold text-xs" title="Edit"><i class="fas fa-edit"></i> Edit</button>
            <button onclick="deleteRecord('${tableName}', '${row.id}')" class="text-red-400 hover:text-red-300 font-bold text-xs" title="Delete"><i class="fas fa-trash"></i> Delete</button>
        </td>`;
        tr.innerHTML += actions;
        tbody.appendChild(tr);
    });
}

function filterCurrentTable() {
    const input = document.getElementById('table-search').value.toLowerCase();
    const rows = document.getElementById('dynamic-table-body').getElementsByTagName('tr');
    for (let i = 0; i < rows.length; i++) {
        const text = rows[i].textContent.toLowerCase();
        rows[i].style.display = text.includes(input) ? "" : "none";
    }
}

/* ============================================================
   ADMIN CRUD ENGINE (ADD, EDIT, DELETE)
============================================================ */
function openRecordModal(id = null) {
    currentEditId = id;
    document.getElementById('crud-modal-title').textContent = id ? `Edit Record - ${currentTableName}` : `New Record - ${currentTableName}`;
    const container = document.getElementById('crud-form-fields');
    container.innerHTML = "";
    
    let schema = TABLE_SCHEMAS[currentTableName] || [];
    let recordData = {};

    if (id && adminDataCache[currentTableName]) {
        recordData = adminDataCache[currentTableName].find(r => r.id === id) || {};
    }

    schema.forEach(field => {
        if (["id", "createdAt", "updatedAt"].includes(field)) return;
        
        let inputType = "text";
        if (field.toLowerCase().includes("date")) inputType = "date";
        if (field.toLowerCase().includes("amount") || field.toLowerCase().includes("quantity")) inputType = "number";

        let val = recordData[field] !== undefined ? recordData[field] : "";
        if(inputType === 'date' && val) {
            try { val = new Date(val).toISOString().split('T')[0]; } catch(e){}
        }
        
        if (field === "status") {
            container.innerHTML += `
                <div class="flex flex-col gap-1">
                    <label class="text-xs font-bold text-amber-400 uppercase tracking-wider">${field}</label>
                    <select id="crud-field-${field}" class="bg-amber-900 border border-amber-500 text-white p-2 rounded focus:outline-none focus:border-amber-300">
                        <option value="Active" ${val === 'Active' ? 'selected' : ''}>Active / Published</option>
                        <option value="Pending" ${val === 'Pending' ? 'selected' : ''}>Pending</option>
                        <option value="Verified" ${val === 'Verified' ? 'selected' : ''}>Verified</option>
                        <option value="Unverified" ${val === 'Unverified' ? 'selected' : ''}>Unverified</option>
                        <option value="Inactive" ${val === 'Inactive' ? 'selected' : ''}>Inactive / Draft</option>
                        <option value="Cancelled" ${val === 'Cancelled' ? 'selected' : ''}>Cancelled</option>
                    </select>
                </div>
            `;
        } else if (field.toLowerCase().includes("desc") || field.toLowerCase().includes("note") || field.toLowerCase().includes("story")) {
            container.innerHTML += `
                <div class="flex flex-col gap-1 md:col-span-2">
                    <label class="text-xs font-bold text-amber-400 uppercase tracking-wider">${field}</label>
                    <textarea id="crud-field-${field}" rows="3" class="bg-amber-900 border border-amber-500 text-white p-2 rounded focus:outline-none focus:border-amber-300">${val}</textarea>
                </div>
            `;
        } else {
            container.innerHTML += `
                <div class="flex flex-col gap-1">
                    <label class="text-xs font-bold text-amber-400 uppercase tracking-wider">${field}</label>
                    <input type="${inputType}" id="crud-field-${field}" value="${val}" class="bg-amber-900 border border-amber-500 text-white p-2 rounded focus:outline-none focus:border-amber-300">
                </div>
            `;
        }
    });

    showModal('crud-modal');
}

async function saveRecord() {
    const btn = document.getElementById('crud-save-btn');
    btn.innerText = "Saving...";
    btn.disabled = true;

    let schema = TABLE_SCHEMAS[currentTableName].filter(f => !["id", "createdAt", "updatedAt"].includes(f));
    let payloadData = {};
    if (currentEditId) payloadData.id = currentEditId;

    schema.forEach(field => {
        let el = document.getElementById(`crud-field-${field}`);
        if (el) payloadData[field] = el.value;
    });

    const action = currentEditId ? "update" : "add";
    const reqBody = { action: action, sessionToken: appState.token, sheetName: currentTableName, data: payloadData };

    try {
        const res = await fetch(API_URL, { method: 'POST', body: JSON.stringify(reqBody) }).then(r => r.json());
        if (res.status === 'success') {
            showToast("Record saved successfully!");
            hideModal('crud-modal');
            await loadAdminDashboard();
            renderTableView(currentTableName);
        } else { showToast(res.message, "error"); }
    } catch (err) { showToast("Network error while saving.", "error"); } 
    finally { btn.innerText = "Save Record"; btn.disabled = false; }
}

async function deleteRecord(tableName, id) {
    if (!confirm(`Are you sure you want to permanently delete record ${id} from ${tableName}?`)) return;
    try {
        const res = await fetch(API_URL, { method: 'POST', body: JSON.stringify({ action: 'delete', sessionToken: appState.token, sheetName: tableName, id: id }) }).then(r => r.json());
        if (res.status === 'success') {
            showToast("Record deleted.");
            await loadAdminDashboard();
            renderTableView(tableName);
        } else { showToast(res.message, "error"); }
    } catch (err) { showToast("Network error while deleting.", "error"); }
}

async function verifyDonation(id) {
    const record = adminDataCache["Donations"].find(d => d.id === id);
    if (!record) return showToast("Record not found", "error");

    let utr = prompt(`Verify UTR\nUser claimed UTR: ${record.utrNumber}\n\nPlease type the verified UTR to confirm:`);
    if (utr === null) return; 

    let amount = prompt(`Verify Amount\nUser claimed Amount: ${record.amount}\n\nPlease type the exact amount received:`);
    if (amount === null) return;

    let newStatus = "Unverified";
    if (utr.trim() === String(record.utrNumber).trim() && amount.trim() === String(record.amount).trim()) {
        newStatus = "Verified";
    } else {
        alert(`Mismatch Detected!\n\nUser entered:\nUTR: ${record.utrNumber}\nAmount: ${record.amount}\n\nYou entered:\nUTR: ${utr}\nAmount: ${amount}\n\nStatus marked as 'Unverified'.`);
    }

    try {
        const res = await fetch(API_URL, { 
            method: 'POST', body: JSON.stringify({ action: 'verifyDonation', sessionToken: appState.token, id: id, status: newStatus, utrNumber: utr, amount: amount }) 
        }).then(r => r.json());
        if (res.status === 'success') {
            showToast(`Donation marked as ${newStatus}!`);
            await loadAdminDashboard();
            renderTableView(currentTableName);
        } else { showToast(res.message, "error"); }
    } catch (err) { showToast("Network error while verifying.", "error"); }
}

/* ============================================================
   DATABASE-DRIVEN 3D TURN.JS FLIPBOOK ENGINE
============================================================ */
function openFlipbook() {
    const yearFilter = document.getElementById('public-year-filter');
    const targetYear = (yearFilter && yearFilter.value !== "all") ? yearFilter.value : appState.currentYear;
    
    const cacheSource = (appState.role === 'admin') ? adminDataCache : publicDataCache;
    const allPages = cacheSource["FlipBook"] || [];
    
    flipbookPages = allPages
        .filter(p => {
            const matchesYear = (p.createdAt || "").toString().includes(targetYear) || (p.year || "").toString().includes(targetYear);
            const isVisible = (appState.role === 'admin') ? true : (p.status === "Active" || p.status === "Published");
            return matchesYear && isVisible;
        })
        .sort((a, b) => parseInt(a.pageNumber || 0) - parseInt(b.pageNumber || 0));
        
    if (flipbookPages.length === 0) {
        showToast(`No FlipBook available for ${targetYear}`, "error");
        return;
    }
    
    showModal('flipbook-modal');
    renderTurnJsBook();
}

function closeFlipbook() { 
    try { $("#flipbook").turn("destroy"); } catch(e){}
    hideModal('flipbook-modal'); 
}

function renderTurnJsBook() {
    const book = $("#flipbook");
    if(!book.length) return;
    
    try { if (book.turn("is")) book.turn("destroy"); } catch(e){}
    book.html("");
    
    book.append(`
        <div class="hard bg-gradient-to-br from-amber-950 to-amber-900 text-amber-200 flex flex-col items-center justify-center p-6 border-4 border-amber-500 text-center shadow-2xl">
            <img src="logo.png" class="w-16 h-16 object-cover rounded-full mb-4 border-2 border-amber-400 shadow-md" alt="Vinayaka Seva Logo" onerror="this.style.display='none'">
            <h1 class="text-2xl font-black text-amber-400 mb-2 drop-shadow">Vinayaka Seva</h1>
            <p class="text-xs text-amber-300 font-bold uppercase tracking-widest">Festival Chronicle & Archive</p>
        </div>
    `);
    
    book.append(`<div class="hard bg-amber-100/90 shadow-inner"></div>`);

    flipbookPages.forEach((page) => {
        let pageHtml = `
            <div class="bg-amber-50/95 text-amber-950 p-6 flex flex-col justify-between border-2 border-amber-300 h-full shadow-md">
                <div class="overflow-y-auto custom-scrollbar pr-1 flex-1">
                    <h3 class="text-lg font-black text-amber-900 mb-2 border-b-2 border-amber-400 pb-1">${page.title || 'Chapter'}</h3>
                    ${page.imageUrl && page.imageUrl !== '-' ? `
                        <div class="my-3 rounded-lg overflow-hidden border border-amber-500 shadow h-40 bg-amber-950/10 flex items-center justify-center">
                            <img src="${page.imageUrl}" class="w-full h-full object-cover" loading="lazy" onerror="this.parentElement.innerHTML='<div class=\'text-xs text-red-600 p-4 font-bold text-center\'>Unable to load this page image.</div>'">
                        </div>
                    ` : ''}
                    <p class="text-xs text-slate-800 leading-relaxed whitespace-pre-wrap font-medium">${page.storyText || page.content || ''}</p>
                </div>
                <div class="text-right text-[10px] font-black text-amber-700 pt-2 border-t border-amber-300/60 mt-2">
                    - Page ${page.pageNumber || ''} -
                </div>
            </div>
        `;
        book.append(pageHtml);
    });

    book.append(`<div class="hard bg-amber-100/90 shadow-inner"></div>`);
    book.append(`
        <div class="hard bg-gradient-to-br from-amber-900 to-amber-950 text-amber-300 flex flex-col items-center justify-center font-black text-sm border-4 border-amber-500 text-center p-6 shadow-2xl">
            <p class="text-amber-400 text-base mb-1">शुभं భవతు</p>
            <p class="text-[10px] text-amber-200 font-normal">Sri Vinayaka Seva Samiti</p>
        </div>
    `);

    setTimeout(() => {
        let bookWidth = Math.min(window.innerWidth * 0.85, 800);
        let bookHeight = Math.min(window.innerHeight * 0.65, 480);
        
        try {
            book.turn({
                width: bookWidth,
                height: bookHeight,
                autoCenter: true,
                elevation: 60,
                gradients: true,
                when: {
                    turned: function(e, page) {
                        const totalPages = book.turn("pages");
                        document.getElementById('flipbook-indicator').textContent = `Page ${page} of ${totalPages}`;
                    }
                }
            });
            document.getElementById('flipbook-indicator').textContent = `Page 1 of ${book.turn("pages")}`;
        } catch (err) {
            console.error("Turn.js binding error:", err);
        }
    }, 150);
}

function turnPage(direction) {
    const book = $("#flipbook");
    try {
        if (direction > 0) book.turn("next");
        else book.turn("previous");
    } catch(e){}
}

/* ============================================================
   FLIPBOOK ARCHIVE SECTION RENDERER
============================================================ */
function renderFlipbookArchiveSection() {
    const grid = document.getElementById("flipbook-cards-grid");
    const yearSelect = document.getElementById("section-flipbook-year");
    if (!grid) return;

    const selectedYear = yearSelect ? yearSelect.value : "all";
    const cacheSource = (appState.role === 'admin') ? adminDataCache : publicDataCache;
    const allPages = cacheSource["FlipBook"] || [];

    if (allPages.length === 0) {
        grid.innerHTML = `<div class="col-span-full text-center py-10 text-amber-200 font-semibold bg-amber-950/40 rounded-xl border border-amber-500/20">No FlipBook records found in the database.</div>`;
        return;
    }

    let filteredPages = allPages.filter(p => {
        const status = (p.status || "Active").toString().toLowerCase();
        if (appState.role === 'admin') return true;
        return status !== "inactive" && status !== "draft" && status !== "unpublished" && status !== "deleted";
    });

    if (selectedYear !== "all") {
        filteredPages = filteredPages.filter(p => {
            const dateStr = (p.createdAt || p.date || p.year || "").toString();
            return dateStr.includes(selectedYear);
        });
    }

    filteredPages.sort((a, b) => parseInt(a.pageNumber || 0) - parseInt(b.pageNumber || 0));

    if (filteredPages.length === 0) {
        grid.innerHTML = `<div class="col-span-full text-center py-10 text-amber-200 font-semibold bg-amber-950/40 rounded-xl border border-amber-500/20">No FlipBook pages available for the year ${selectedYear}.</div>`;
        return;
    }

    grid.innerHTML = filteredPages.map(page => `
        <div class="bg-amber-950/80 border-2 border-amber-500/40 rounded-2xl overflow-hidden shadow-xl flex flex-col justify-between glass-hover transition-all duration-300">
            <div>
                ${page.imageUrl && page.imageUrl !== '-' ? `
                    <div class="h-48 w-full overflow-hidden relative border-b border-amber-500/30 bg-black/40">
                        <img src="${page.imageUrl}" class="w-full h-full object-cover transform hover:scale-105 transition duration-500" alt="${page.title || 'Page'}" onerror="this.src='https://images.unsplash.com/photo-1628744448840-55bdb2497bd4?w=600&q=80'">
                        <span class="absolute top-3 right-3 bg-amber-600 text-amber-950 font-black text-xs px-2.5 py-1 rounded-full shadow">Page ${page.pageNumber || 1}</span>
                    </div>
                ` : `
                    <div class="h-20 bg-amber-900/40 flex items-center justify-center border-b border-amber-500/30">
                        <span class="bg-amber-600 text-amber-950 font-black text-xs px-2.5 py-1 rounded-full">Page ${page.pageNumber || 1}</span>
                    </div>
                `}
                <div class="p-5 space-y-2">
                    <h3 class="text-lg font-black text-amber-300 line-clamp-1">${page.title || 'Untitled Page'}</h3>
                    <p class="text-amber-100 text-xs leading-relaxed line-clamp-3">${page.storyText || page.content || 'No description provided.'}</p>
                </div>
            </div>
            <div class="p-5 pt-0">
                <button data-action="openFlipbook" class="w-full bg-amber-600 hover:bg-amber-500 text-amber-950 font-black py-2.5 rounded-xl text-xs shadow transition flex items-center justify-center gap-2">
                    <i class="fas fa-book-reader"></i> Open in 3D Book Viewer
                </button>
            </div>
        </div>
    `).join('');
}

function filterFlipbookSection() {
    renderFlipbookArchiveSection();
}

/* ============================================================
   COMMUNITY INTEREST CALCULATOR ENGINE
============================================================ */
function calculateInterest() {
    const p = parseFloat(document.getElementById("calc-principal")?.value) || 0;
    const r = parseFloat(document.getElementById("calc-rate")?.value) || 0;
    const t = parseFloat(document.getElementById("calc-time")?.value) || 0;

    if (p <= 0 || r <= 0 || t <= 0) {
        showToast("Please enter valid positive numbers for Principal, Rate, and Time.", "error");
        return;
    }

    const simpleInterest = (p * r * t) / 100;
    const totalSimpleAmount = p + simpleInterest;
    const compoundInterest = p * Math.pow((1 + (r / 100)), t) - p;

    document.getElementById("res-si").textContent = `₹${simpleInterest.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
    document.getElementById("res-ci").textContent = `₹${compoundInterest.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
    document.getElementById("res-total").textContent = `₹${totalSimpleAmount.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;

    const resultBox = document.getElementById("calc-result-box");
    if (resultBox) {
        resultBox.classList.remove("hidden");
        resultBox.classList.add("grid");
    }

    showToast("Interest calculated successfully!");
}

/* ============================================================
   ADVANCED GPT-LIKE MOOSHIKA AI BRAIN (All Tables, 2025 Donations, Yearly Growth)
============================================================ */
function toggleChat() {
    if (!mooshikaChat) return;
    const isClosed = mooshikaChat.classList.contains("hidden");
    if (isClosed) {
        mooshikaChat.classList.remove("hidden");
        mooshikaRat.classList.add("listening");
        setTimeout(() => { if (mooshikaInput) mooshikaInput.focus(); }, 150);
    } else {
        mooshikaChat.classList.add("hidden");
        mooshikaRat.classList.remove("listening");
        mooshikaRat.classList.remove("speaking");
    }
}

function addMooshikaMessage(message, type = "ai") {
    if (!mooshikaMessages) return;
    const messageBox = document.createElement("div");
    if (type === "user") { messageBox.className = "bg-amber-500 text-amber-950 p-3 rounded-xl ml-8 shadow-sm font-semibold"; } 
    else { messageBox.className = "bg-amber-900/80 text-white p-3 rounded-xl mr-4 border border-amber-500/30 shadow-sm"; }
    messageBox.style.whiteSpace = "pre-line";
    messageBox.innerHTML = message; 
    mooshikaMessages.appendChild(messageBox);
    requestAnimationFrame(() => { mooshikaMessages.scrollTop = mooshikaMessages.scrollHeight; });
}

function clearChatHistory() {
    if (!mooshikaMessages) return;
    const greeting = i18n[appState.lang].aiGreeting || i18n['en'].aiGreeting;
    mooshikaMessages.innerHTML = `<div class="bg-amber-900/80 p-3 rounded-xl border border-amber-500/30 shadow-sm">${greeting}</div>`;
    showToast("AI Memory Cleared", "info");
}

/* ============================================================
   ADVANCED MOOSHIKA AI BRAIN (DYNAMIC YEAR DONOR & SPEECH ENGINE)
============================================================ */
async function sendChatMessage() {
    if (!mooshikaInput) return;
    const question = mooshikaInput.value.trim();
    if (!question) return;

    addMooshikaMessage(question, "user");
    mooshikaInput.value = "";
    mooshikaRat.classList.add("listening");
    mooshikaTyping.classList.remove("hidden");
    if (mooshikaSend) mooshikaSend.disabled = true;

    try {
        const qLower = question.toLowerCase();
        const activeCache = (appState.role === 'admin') ? adminDataCache : publicDataCache;
        let localResponseHtml = null;
        let spokenText = "";

        // Detect any 4-digit year (e.g., 2023, 2024, 2025, 2026)
        const yearMatch = qLower.match(/\b(19\d{2}|20\d{2})\b/);
        const queryYear = yearMatch ? yearMatch[0] : null;

        // Check if query is asking for donations or donors
        const isDonationQuery = qLower.includes('donat') || 
                                qLower.includes('విరాళ') || 
                                qLower.includes('donor') || 
                                qLower.includes('దాత');

        // ============================================================
        // 1. DYNAMIC ANY-YEAR DONATIONS & DONORS INTENT (TEXT + VOICE)
        // ============================================================
        if (isDonationQuery) {
            const donations = activeCache["Donations"] || [];
            let filtered = donations;
            
            // Filter dynamically by requested year if specified
            if (queryYear) {
                filtered = donations.filter(d => {
                    const dateStr = (d.createdAt || d.date || d.donationDate || "").toString();
                    return dateStr.includes(queryYear);
                });
            }

            if (filtered.length === 0) {
                const yrLabel = queryYear ? queryYear : (appState.lang === 'te' ? 'డేటాబేస్' : 'the database');
                localResponseHtml = appState.lang === 'te' 
                    ? `⚠️ **${yrLabel}** సంవత్సరానికి సంబంధించి ఎటువంటి విరాళాల రికార్డులు లభించలేదు.` 
                    : `⚠️ No donation records found for **${yrLabel}**.`;
                
                spokenText = appState.lang === 'te' 
                    ? `${yrLabel} లో ఎటువంటి విరాళాలు నమోదు కాలేదు.` 
                    : `No donations found for ${yrLabel}.`;
            } else {
                const yrTitle = queryYear ? queryYear : (appState.lang === 'te' ? 'అన్ని సంవత్సరాలు' : 'All Years');
                let spokenParts = [];
                let totalAmt = 0;

                localResponseHtml = `📋 **${yrTitle} ${appState.lang === 'te' ? 'విరాళాలు మరియు దాతల వివరాలు' : 'Donations & Donors List'}** (${filtered.length} ${appState.lang === 'te' ? 'రికార్డులు' : 'records'}):<br><ul class="list-disc pl-5 mt-2 space-y-1">`;

                filtered.forEach(d => {
                    const name = d.donorName || d.name || (appState.lang === 'te' ? 'పేరులేని భక్తుడు' : 'Anonymous');
                    const amt = parseFloat(d.amount) || 0;
                    totalAmt += amt;

                    localResponseHtml += `<li><span class="font-bold text-amber-300">${name}</span>: <span class="text-green-300 font-black">₹${amt.toLocaleString('en-IN')}</span></li>`;

                    // Format natural speech based on selected language
                    if (appState.lang === 'te') {
                        spokenParts.push(`${name} గారు ${amt} రూపాయలు`);
                    } else {
                        spokenParts.push(`${name} donated ${amt} rupees`);
                    }
                });

                localResponseHtml += `</ul><div class="mt-2 pt-2 border-t border-amber-500/30 font-bold text-amber-200">Total: ₹${totalAmt.toLocaleString('en-IN')}</div>`;

                if (appState.lang === 'te') {
                    spokenText = `${yrTitle} విరాళాల వివరాలు: ` + spokenParts.join(', ') + `. మొత్తం విరాళాలు ${totalAmt} రూపాయలు.`;
                } else {
                    spokenText = `Here are the donations for ${yrTitle}: ` + spokenParts.join(', ') + `. Total donations amount to ${totalAmt} rupees.`;
                }
            }
        }
        // ============================================================
        // 2. YEARLY COMPARISON, EXPENSES, BALANCE & GROWTH INTENT
        // ============================================================
        else if (qLower.includes('comparison') || qLower.includes('yearly') || qLower.includes('growth') || 
                 qLower.includes('పోలిక') || qLower.includes('వార్షిక') || qLower.includes('పెరుగుదల') || 
                 qLower.includes('balance') || qLower.includes('నిల్వ') || qLower.includes('budget')) {
            
            const donations = activeCache["Donations"] || [];
            const tracker = activeCache["FinancialTracker"] || [];
            
            let yearlyData = {};
            donations.forEach(d => {
                let yr = (d.createdAt || d.date || "").substring(0, 4) || "";
                if (yr.length === 4) {
                    if (!yearlyData[yr]) yearlyData[yr] = { income: 0, expense: 0 };
                    yearlyData[yr].income += parseFloat(d.amount) || 0;
                }
            });
            tracker.forEach(e => {
                let yr = (e.date || e.createdAt || "").substring(0, 4) || "";
                if (yr.length === 4) {
                    if (!yearlyData[yr]) yearlyData[yr] = { income: 0, expense: 0 };
                    yearlyData[yr].expense += parseFloat(e.amount) || 0;
                }
            });

            let yearsSorted = Object.keys(yearlyData).sort();
            if (yearsSorted.length === 0) {
                localResponseHtml = `No financial records found for comparison.`;
                spokenText = `No financial records found for comparison.`;
            } else {
                let summaryText = `📈 **Yearly Financial Comparison & Growth**:<br>`;
                let prevIncome = 0;
                let spokenParts = [];
                
                yearsSorted.forEach(yr => {
                    let inc = yearlyData[yr].income;
                    let exp = yearlyData[yr].expense;
                    let bal = inc - exp;
                    let growth = prevIncome > 0 ? (((inc - prevIncome) / prevIncome) * 100).toFixed(1) : 0;
                    summaryText += `<br>• <b>Year ${yr}</b>: Income ₹${inc.toLocaleString('en-IN')}, Expenses ₹${exp.toLocaleString('en-IN')}, Balance ₹${bal.toLocaleString('en-IN')}, Growth: ${growth}%`;
                    spokenParts.push(`In ${yr}, income was ${inc} rupees, expenses ${exp} rupees, balance ${bal} rupees, with a growth of ${growth} percent`);
                    prevIncome = inc;
                });
                localResponseHtml = summaryText;
                spokenText = `Here is the yearly financial comparison: ` + spokenParts.join('. ');
            }
        }
        // ============================================================
        // 3. ALL OTHER TABLES LOOKUP
        // ============================================================
        else {
            let matchedTable = SAFE_PUBLIC_TABLES.find(t => qLower.includes(t.toLowerCase()) || qLower.includes(t.toLowerCase().slice(0, -1)));
            if (!matchedTable && appState.role === 'admin') {
                matchedTable = Object.keys(TABLE_SCHEMAS).find(t => qLower.includes(t.toLowerCase()));
            }

            if (matchedTable) {
                let recs = activeCache[matchedTable] || [];
                localResponseHtml = `📂 **Table Data: ${matchedTable}** (${recs.length} records found):`;
                if (recs.length > 0) {
                    localResponseHtml += `<div class="mt-2 overflow-x-auto"><table class="w-full text-[10px] text-amber-100 border border-amber-500/30"><tbody>`;
                    recs.slice(0, 6).forEach(r => {
                        localResponseHtml += `<tr><td class="p-1 border-b border-amber-800/40">${JSON.stringify(r).substring(0, 100)}...</td></tr>`;
                    });
                    localResponseHtml += `</tbody></table></div>`;
                }
                spokenText = `Found ${recs.length} records in the ${matchedTable} table.`;
            }
        }

        // Output local result and trigger speech
        if (localResponseHtml) {
            mooshikaTyping.classList.add("hidden");
            mooshikaRat.classList.remove("listening");
            addMooshikaMessage(localResponseHtml, "ai");
            speakAIResponse(spokenText || "Here is the requested information.");
            if (mooshikaSend) mooshikaSend.disabled = false;
            return;
        }

        // Fallback to Backend AI Brain if no local pattern matches
        const payload = { action: 'askAI', question: question, sessionToken: appState.token, lang: appState.lang };
        const res = await fetch(API_URL, { method: "POST", body: JSON.stringify(payload) }).then(r => r.json());

        mooshikaTyping.classList.add("hidden");
        mooshikaRat.classList.remove("listening");

        if (res && res.status === "success") {
            let finalAnswerHtml = res.answer || "🙏";
            
            if (res.data && res.data.length > 0 && res.columns) {
                let tableHtml = `<div class="mt-3 overflow-x-auto rounded-lg border border-amber-500/30 shadow-inner bg-amber-950/50"><table class="w-full text-left text-[10px] text-amber-100"><thead class="bg-amber-900/80 uppercase text-amber-400"><tr>`;
                res.columns.forEach(col => tableHtml += `<th class="p-2 border-b border-amber-600/50">${col}</th>`);
                tableHtml += `</tr></thead><tbody class="divide-y divide-amber-800/50">`;
                
                res.data.forEach(row => {
                    tableHtml += `<tr class="hover:bg-amber-800/40">`;
                    res.columns.forEach(col => {
                        let val = row[col] !== undefined ? row[col] : '-';
                        if ((col.toLowerCase().includes('date') || col.toLowerCase().includes('at')) && val !== '-') val = formatDate(val);
                        tableHtml += `<td class="p-2 whitespace-nowrap">${val}</td>`;
                    });
                    tableHtml += `</tr>`;
                });
                tableHtml += `</tbody></table></div>`;
                finalAnswerHtml += tableHtml;
            }

            finalAnswerHtml = typeof DOMPurify !== 'undefined' && typeof marked !== 'undefined' ? DOMPurify.sanitize(marked.parse(finalAnswerHtml)) : finalAnswerHtml;
            addMooshikaMessage(finalAnswerHtml, "ai");
            speakAIResponse(res.answer); 
        } else {
            addMooshikaMessage(res.message || "Server Error", "ai");
        }
    } catch (error) {
        mooshikaTyping.classList.add("hidden");
        mooshikaRat.classList.remove("listening");
        addMooshikaMessage("⚠️ Connection error with Mooshika Brain.", "ai");
    } finally {
        if (mooshikaSend) mooshikaSend.disabled = false;
    }
}

const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
let recognition = null;

if (SpeechRecognition) {
    recognition = new SpeechRecognition();
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;
    
    recognition.onstart = function() {
        document.getElementById('voice-pulse')?.classList.remove('hidden');
        if (mooshikaInput) mooshikaInput.placeholder = "Listening...";
    };
    recognition.onresult = function(event) {
        if (mooshikaInput) mooshikaInput.value = event.results[0][0].transcript;
        sendChatMessage(); 
    };
    recognition.onerror = function() { showToast("Voice recognition failed", "error"); };
    recognition.onend = function() {
        document.getElementById('voice-pulse')?.classList.add('hidden');
        if (mooshikaInput) mooshikaInput.placeholder = "Ask here...";
    };
}

function startVoiceRecognition() {
    if (!recognition) return showToast("Your browser does not support Voice Recognition.", "error");
    recognition.lang = appState.lang === 'te' ? 'te-IN' : 'en-US';
    recognition.start();
}

let currentAudioUtterance = null;
function speakAIResponse(text) {
    if (!('speechSynthesis' in window)) return;
    window.speechSynthesis.cancel(); 
    
    let cleanText = text.replace(/[\u{1F600}-\u{1F6FF}]/gu, '').replace(/[#*]/g, '');
    cleanText = cleanText.replace(/[₹]/g, appState.lang === 'te' ? 'రూపాయలు ' : 'rupees ');

    currentAudioUtterance = new SpeechSynthesisUtterance(cleanText);
    
    const voices = window.speechSynthesis.getVoices();
    let targetLang = appState.lang === 'te' ? 'te-IN' : 'en-';
    let preferredVoice = voices.find(v => v.lang.startsWith(targetLang));
    
    if (!preferredVoice && appState.lang === 'te') preferredVoice = voices.find(v => v.lang.includes('hi-IN'));
    if (!preferredVoice) preferredVoice = voices[0];

    if (preferredVoice) currentAudioUtterance.voice = preferredVoice;

    currentAudioUtterance.rate = 0.95; 
    currentAudioUtterance.pitch = 1.1;

    currentAudioUtterance.onstart = () => {
        document.getElementById('btn-stop-audio')?.classList.remove('hidden');
        mooshikaRat?.classList.add('speaking');
    };
    currentAudioUtterance.onend = () => {
        document.getElementById('btn-stop-audio')?.classList.add('hidden');
        mooshikaRat?.classList.remove('speaking');
    };

    window.speechSynthesis.speak(currentAudioUtterance);
}

function stopAIaudio() {
    if ('speechSynthesis' in window) window.speechSynthesis.cancel();
    document.getElementById('btn-stop-audio')?.classList.add('hidden');
    mooshikaRat?.classList.remove('speaking');
}
/* ============================================================
   FINANCIAL CALCULATOR & MANAGEMENT LOGIC ENGINE
============================================================ */
(function () {
    "use strict";

    const state = {
        transactions: [],
        filteredTransactions: []
    };

    const money = (value) => {
        const amount = Number(value) || 0;
        return new Intl.NumberFormat("en-IN", {
            style: "currency",
            currency: "INR",
            maximumFractionDigits: 2
        }).format(amount);
    };

    const getDate = (transaction) => {
        return (
            transaction.transactionDate ||
            transaction.date ||
            transaction.donationDate ||
            transaction.expenseDate ||
            transaction.createdAt ||
            ""
        );
    };

    const getAmount = (transaction) => {
        return Number(
            transaction.amount ??
            transaction.totalAmount ??
            transaction.value ??
            0
        ) || 0;
    };

    const getType = (transaction) => {
        const type = String(
            transaction.transactionType ||
            transaction.type ||
            transaction.categoryType ||
            ""
        ).toLowerCase();

        if (type.includes("donat") || type.includes("income") || type.includes("credit")) return "income";
        if (type.includes("expense") || type.includes("debit") || type.includes("payment")) return "expense";
        return "income";
    };

    function calculateFinancialData() {
        const startDate = document.getElementById("finance-start-date")?.value || "";
        const endDate = document.getElementById("finance-end-date")?.value || "";
        const year = document.getElementById("finance-year")?.value || "all";
        const type = document.getElementById("finance-type")?.value || "all";

        state.filteredTransactions = state.transactions.filter((transaction) => {
            const date = getDate(transaction).substring(0, 10);
            if (!date) return false;

            if (startDate && date < startDate) return false;
            if (endDate && date > endDate) return false;
            if (year !== "all" && !date.startsWith(String(year))) return false;

            if (type !== "all") {
                const transactionType = getType(transaction);
                if (type === "donation") {
                    const rawType = String(transaction.transactionType || transaction.type || "").toLowerCase();
                    if (!rawType.includes("donat")) return false;
                } else if (transactionType !== type) {
                    return false;
                }
            }
            return true;
        });

        renderFinancialSummary();
        renderTransactions();
        renderMonthlySummary();
    }

    function renderFinancialSummary() {
        let income = 0;
        let donations = 0;
        let expenses = 0;

        state.filteredTransactions.forEach((transaction) => {
            const amount = getAmount(transaction);
            const type = getType(transaction);
            const rawType = String(transaction.transactionType || transaction.type || "").toLowerCase();

            if (rawType.includes("donat")) {
                donations += amount;
                income += amount;
            } else if (type === "income") {
                income += amount;
            } else if (type === "expense") {
                expenses += amount;
            }
        });

        const balance = income - expenses;

        setText("finance-total-income", money(income));
        setText("finance-total-donations", money(donations));
        setText("finance-total-expenses", money(expenses));
        setText("finance-net-balance", money(balance));

        setText("finance-opening-balance", money(0));
        setText("finance-balance-income", money(income));
        setText("finance-balance-expense", money(expenses));
        setText("finance-closing-balance", money(balance));
    }

    function renderTransactions() {
        const tbody = document.getElementById("finance-transactions-body");
        if (!tbody) return;

        const search = document.getElementById("finance-search")?.value?.toLowerCase().trim() || "";

        const records = state.filteredTransactions.filter((transaction) => {
            if (!search) return true;
            return JSON.stringify(transaction).toLowerCase().includes(search);
        });

        tbody.innerHTML = "";

        if (!records.length) {
            tbody.innerHTML = `<tr><td colspan="7" class="finance-empty">No financial records found.</td></tr>`;
            setText("finance-record-count", "0 transactions");
            return;
        }

        let runningBalance = 0;

        records.slice().sort((a, b) => getDate(a).localeCompare(getDate(b))).forEach((transaction) => {
            const amount = getAmount(transaction);
            const type = getType(transaction);

            const income = type === "income" ? amount : 0;
            const expense = type === "expense" ? amount : 0;

            runningBalance += income - expense;

            const reference = transaction.transactionCode || transaction.donationCode || transaction.referenceNumber || transaction.id || "-";
            const description = transaction.description || transaction.purpose || transaction.notes || "-";

            const row = document.createElement("tr");

            row.innerHTML = `
                <td>${formatDate(getDate(transaction))}</td>
                <td>${escapeHtml(reference)}</td>
                <td>${escapeHtml(description)}</td>
                <td><span class="${type === "income" ? "finance-type-income" : "finance-type-expense"}">${type.toUpperCase()}</span></td>
                <td>${income ? money(income) : "-"}</td>
                <td>${expense ? money(expense) : "-"}</td>
                <td>${money(runningBalance)}</td>
            `;

            tbody.appendChild(row);
        });

        setText("finance-record-count", `${records.length} transaction${records.length === 1 ? "" : "s"}`);
    }

    function renderMonthlySummary() {
        const container = document.getElementById("monthly-financial-summary");
        if (!container) return;

        const months = {};

        state.filteredTransactions.forEach((transaction) => {
            const date = getDate(transaction);
            if (!date) return;

            const month = date.substring(0, 7);
            if (!months[month]) {
                months[month] = { income: 0, expense: 0 };
            }

            const amount = getAmount(transaction);
            if (getType(transaction) === "income") {
                months[month].income += amount;
            } else {
                months[month].expense += amount;
            }
        });

        container.innerHTML = "";

        Object.keys(months).sort().forEach((month) => {
            const data = months[month];
            const balance = data.income - data.expense;
            const card = document.createElement("div");

            card.className = "monthly-card";
            card.innerHTML = `
                <h4>${formatMonth(month)}</h4>
                <div class="monthly-card-row"><span>Income</span><strong>${money(data.income)}</strong></div>
                <div class="monthly-card-row"><span>Expense</span><strong>${money(data.expense)}</strong></div>
                <div class="monthly-card-row"><span>Balance</span><strong>${money(balance)}</strong></div>
            `;
            container.appendChild(card);
        });
    }

    function populateYears() {
        const select = document.getElementById("finance-year");
        if (!select) return;

        const years = new Set();
        state.transactions.forEach((transaction) => {
            const date = getDate(transaction);
            if (date) years.add(date.substring(0, 4));
        });

        Array.from(years).sort((a, b) => Number(b) - Number(a)).forEach((year) => {
            const option = document.createElement("option");
            option.value = year;
            option.textContent = year;
            select.appendChild(option);
        });
    }

    function setTransactions(data) {
        state.transactions = Array.isArray(data) ? data : [];
        populateYears();
        calculateFinancialData();
    }

    function setText(id, value) {
        const element = document.getElementById(id);
        if (element) element.textContent = value;
    }

    function formatMonth(value) {
        const date = new Date(`${value}-01`);
        return new Intl.DateTimeFormat("en-IN", { month: "long", year: "numeric" }).format(date);
    }

    function escapeHtml(value) {
        const div = document.createElement("div");
        div.textContent = String(value ?? "");
        return div.innerHTML;
    }

    function resetFinancialCalculator() {
        document.getElementById("finance-start-date").value = "";
        document.getElementById("finance-end-date").value = "";
        document.getElementById("finance-year").value = "all";
        document.getElementById("finance-type").value = "all";
        document.getElementById("finance-search").value = "";
        calculateFinancialData();
    }

    document.addEventListener("DOMContentLoaded", () => {
        document.getElementById("finance-calculate-btn")?.addEventListener("click", calculateFinancialData);
        document.getElementById("finance-reset-btn")?.addEventListener("click", resetFinancialCalculator);
        document.getElementById("finance-search")?.addEventListener("input", renderTransactions);

        window.setFinancialTransactions = setTransactions;
    });
})();