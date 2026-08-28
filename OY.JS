/* ============================================================
   1. SAFE STORAGE WRAPPERS (Prevents browser security crashes)
============================================================ */
function safeGetSession(key, def) { try { return sessionStorage.getItem(key) || def; } catch (e) { return def; } }
function safeGetLocal(key, def) { try { return localStorage.getItem(key) || def; } catch (e) { return def; } }
function safeSetSession(key, val) { try { sessionStorage.setItem(key, val); } catch (e) {} }
function safeSetLocal(key, val) { try { localStorage.setItem(key, val); } catch (e) {} }

/* ============================================================
   2. GLOBAL CONFIGURATION & STATE
============================================================ */
const API_URL = "https://script.google.com/macros/s/AKfycbxwt7d5UGIteCu2PSm85JMr-NHCgt2Sm1KPHsTeMylgBiRCjvaUHTFiU0eP7x2lsIoH/exec";

let appState = {
    token: safeGetSession('sessionToken', null),
    role: safeGetSession('userRole', 'public'),
    userName: safeGetSession('userName', null),
    currentYear: new Date().getFullYear().toString(),
    lang: safeGetLocal('appLang', 'te'), // Language Persistence
    aiContextYear: new Date().getFullYear().toString()
};

let adminDataCache = {};
let publicDataCache = {};
let currentTableName = "";
let currentEditId = null;
let flipbookPages = [];

// UPGRADED 22 TABLES DEFINED FOR ADMIN
const TABLE_SCHEMAS = {
  "Users": ["id", "name", "phone", "email", "role", "passwordHash", "sessionToken", "status", "createdAt", "updatedAt"],
  "Banners": ["id", "title", "description", "imageUrl", "financialYear", "status", "createdAt", "updatedAt"],
  "Donors": ["id", "name", "phone", "village", "email", "status", "createdAt", "updatedAt"],
  "Donations": ["id", "donorName", "phone", "amount", "paymentMethod", "utrNumber", "category", "financialYear", "status", "notes", "verifiedBy", "createdAt", "updatedAt"],
  "Events": ["id", "title", "eventDate", "financialYear", "time", "location", "description", "status", "createdAt", "updatedAt"],
  "WorkAllocations": ["id", "taskName", "assignedTo", "phone", "financialYear", "dueDate", "priority", "status", "createdAt", "updatedAt"],
  "FoodDistribution": ["id", "distributionDate", "financialYear", "mealType", "foodItem", "estimatedServings", "totalDishCost", "costPerServing", "sponsorName", "notes", "createdAt", "updatedAt"],
  "FinancialTracker": ["id", "date", "financialYear", "type", "category", "subCategory", "vendorName", "invoiceNumber", "amount", "paymentMode", "description", "createdAt", "updatedAt"],
  "FinancialAssistance": ["id", "personName", "phone", "amount", "financialYear", "issueDate", "dueDate", "status", "notes", "createdAt", "updatedAt"],
  "Repayments": ["id", "assistanceId", "personName", "amountPaid", "financialYear", "paymentDate", "paymentMode", "createdAt", "updatedAt"],
  "PoojaItems": ["id", "financialYear", "dayNumber", "itemName", "quantity", "unit", "estimatedCost", "actualCost", "vendorName", "isPurchased", "createdAt", "updatedAt"],
  "GroceryList": ["id", "financialYear", "itemName", "category", "usedForDish", "quantity", "unit", "unitPrice", "totalAmount", "vendor", "isPurchased", "createdAt", "updatedAt"],
  "Notes": ["id", "financialYear", "title", "content", "category", "pinned", "author", "createdAt", "updatedAt"],
  "Reminders": ["id", "financialYear", "title", "reminderDate", "reminderTime", "isCompleted", "createdAt", "updatedAt"],
  "CulturalStories": ["id", "title", "storyText", "summary", "language", "createdAt", "updatedAt"],
  "AIKnowledge": ["id", "category", "question", "answer", "keywords", "createdAt", "updatedAt"],
  "FestivalHistory": ["id", "financialYear", "title", "openingBalance", "totalDonations", "totalExpenses", "closingBalance", "status", "createdAt", "updatedAt"],
  "FlipBook": ["id", "financialYear", "pageNumber", "title", "storyText", "imageUrl", "status", "createdAt", "updatedAt"],
  "AIConversations": ["id", "sessionId", "financialYear", "question", "answer", "createdAt", "updatedAt"],
  "AISettings": ["id", "settingKey", "settingValue", "description", "createdAt", "updatedAt"],
  "AuditLogs": ["id", "timestamp", "financialYear", "action", "sheetName", "recordId", "details", "createdAt"],
  "Announcements": ["id", "financialYear", "title", "message", "priority", "startDate", "endDate", "status", "createdAt", "updatedAt"]
};

const SAFE_PUBLIC_TABLES = [
  "Banners", "Donors", "Donations", "Events", "WorkAllocations", "FoodDistribution", 
  "FinancialTracker", "FinancialAssistance", "Repayments", "PoojaItems", "GroceryList", 
  "Notes", "Reminders", "CulturalStories", "FestivalHistory", "Announcements"
];

const DATE_FIELDS = {
    "Donations": "createdAt", "Events": "eventDate", "FinancialTracker": "date",
    "FoodDistribution": "distributionDate", "FestivalHistory": "financialYear", "FinancialAssistance": "issueDate",
    "Repayments": "paymentDate", "Reminders": "reminderDate"
};

/* ============================================================
   3. TRANSLATION DICTIONARY (I18N)
============================================================ */
const i18n = {
    en: {
        pageTitle: "Swarna Ganapathi Swami - Community",
        navBanners: "Banners", navEvents: "Events", navDonations: "Donations", navFlipbook: "FlipBook",
        loginBtn: "Login", adminBtn: "Admin", logoutBtn: "Logout",
        drumRat: "Drum (🥁)", fluteRat: "Flute (🪈)", prayRat: "Pray 🙏",
        appTitle: "Vinayaka Seva - Festival Portal",
        tagline2: "Live Information Portal for Sri Vinayaka Chavithi",
        onlineDonation: "Online Donation (Direct UPI Checkout)",
        devoteeName: "Devotee Name", phoneNumber: "Phone Number", amountLbl: "Amount (₹)",
        genQR: "Generate QR Code", scanLbl: "Scan using PhonePe, Google Pay, or Paytm",
        submitVerification: "Submit Verification",
        publicDbTitle: "📋 Public Database", yearLbl: "Financial Year:",
        welcomeBack: "Welcome", userDashDesc: "Track your donations and activities.",
        userLoginTitle: "User Login", closeBtn: "Close", newUserTxt: "New user?", signupLink: "Sign up here",
        userSignupTitle: "User Sign Up", createAccBtn: "Create Account", hasAccTxt: "Already have an account?", loginLink: "Login here",
        adminLoginTitle: "Admin Access", secureLoginBtn: "Secure Login",
        adminPortalTitle: "Admin Portal", dashboardBtn: "Dashboard", financialDashBtn: "Financial Dashboard",
        allTablesLbl: "All Tables Database", sysOverviewLbl: "System Overview & Year-Wise Ledger Engine",
        financialDashTitle: "Yearly Financial Accounting", addRecordBtn: "Add Record", recordMgmtTitle: "Record Management",
        cancelBtn: "Cancel", saveRecordBtn: "Save Record", flipbookArchiveTitle: "Digital FlipBook Archive",
        mooshikaBrain: "Musika AI", aiGreeting: "🙏 Jai Ganesha! I am Musika AI. Ask me about donations, year-wise comparisons, expenses, or current balance.",
        listening: "Listening...", askHere: "Ask here...", offlineMsg: "You're offline. Voice commands will use browser defaults.",
        delConfirm: "Are you sure you want to permanently delete this record?"
    },
    te: {
        pageTitle: "స్వర్ణ గణపతి స్వామి - కమ్యూనిటీ",
        navBanners: "బ్యానర్లు", navEvents: "కార్యక్రమాలు", navDonations: "విరాళాలు", navFlipbook: "ఫ్లిప్‌బుక్",
        loginBtn: "లాగిన్", adminBtn: "అడ్మిన్", logoutBtn: "లాగౌట్",
        drumRat: "డోలు (🥁)", fluteRat: "వేణువు (🪈)", prayRat: "నమస్కారం 🙏",
        appTitle: "స్వర్ణ గణపతి స్వామి వారి - ఉత్సవాల వేదిక",
        tagline2: "శ్రీ వినాయక చవితి మహోత్సవాల ప్రత్యక్ష సమాచార వేదిక",
        onlineDonation: "ఆన్‌లైన్ విరాళం (Direct UPI Checkout)",
        devoteeName: "భక్తుని పేరు", phoneNumber: "ఫోన్ నంబర్", amountLbl: "మొత్తం (₹)",
        genQR: "QR కోడ్ రూపొందించండి", scanLbl: "PhonePe, Google Pay, లేదా Paytm తో స్కాన్ చేయండి",
        submitVerification: "చెల్లింపును ధృవీకరించండి",
        publicDbTitle: "📋 పబ్లిక్ రికార్డులు (Public Database)", yearLbl: "ఆర్థిక సంవత్సరం:",
        welcomeBack: "స్వాగతం", userDashDesc: "మీ విరాళాలు మరియు కార్యకలాపాలను ట్రాక్ చేయండి.",
        userLoginTitle: "యూజర్ లాగిన్", closeBtn: "మూసివేయు", newUserTxt: "కొత్త వారా?", signupLink: "సైన్ అప్ చేయండి",
        userSignupTitle: "యూజర్ సైన్ అప్", createAccBtn: "ఖాతా సృష్టించండి", hasAccTxt: "ఖాతా ఉందా?", loginLink: "లాగిన్ అవ్వండి",
        adminLoginTitle: "అడ్మిన్ లాగిన్", secureLoginBtn: "సురక్షిత లాగిన్",
        adminPortalTitle: "అడ్మిన్ పోర్టల్", dashboardBtn: "డాష్‌బోర్డ్", financialDashBtn: "ఆర్థిక డాష్‌బోర్డ్",
        allTablesLbl: "అన్ని పట్టికలు", sysOverviewLbl: "సిస్టమ్ స్థూలదృష్టి & వార్షిక లెడ్జర్ ఇంజిన్",
        financialDashTitle: "వార్షిక ఆర్థిక లెక్కలు", addRecordBtn: "కొత్త రికార్డు", recordMgmtTitle: "రికార్డు నిర్వహణ",
        cancelBtn: "రద్దు చేయి", saveRecordBtn: "భద్రపరచు", flipbookArchiveTitle: "డిజిటల్ ఫ్లిప్‌బుక్ ఆర్కైవ్",
        mooshikaBrain: "మూషిక AI", aiGreeting: "🙏 జై గణేశా! నేను మీ మూషిక AI ని. విరాళాలు, దాతలు, కిరాణా ఖర్చులు, లేదా ప్రస్తుత నిల్వ గురించి నన్ను అడగండి.",
        listening: "వింటున్నాను...", askHere: "ఇక్కడ అడగండి...", offlineMsg: "మీరు ఆఫ్‌లైన్‌లో ఉన్నారు.",
        delConfirm: "మీరు ఖచ్చితంగా ఈ రికార్డును తొలగించాలనుకుంటున్నారా?"
    }
};

function setLanguage(lang) {
    appState.lang = lang;
    safeSetLocal('appLang', lang); 
    
    document.getElementById('lang-btn-te').className = lang === 'te' ? 'px-2.5 py-1 rounded-lg bg-amber-500 text-amber-950 transition' : 'px-2.5 py-1 rounded-lg text-amber-200 hover:text-white transition';
    document.getElementById('lang-btn-en').className = lang === 'en' ? 'px-2.5 py-1 rounded-lg bg-amber-500 text-amber-950 transition' : 'px-2.5 py-1 rounded-lg text-amber-200 hover:text-white transition';
    
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
    showToast(lang === 'te' ? "భాష తెలుగుకు మార్చబడింది" : "Language changed to English", "info");
}

/* ============================================================
   4. EVENT DELEGATION & UI HELPERS
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

    document.addEventListener("click", function(e) {
        let btn = e.target;
        while (btn && btn !== document && (!btn.getAttribute || !btn.getAttribute('data-action'))) {
            btn = btn.parentNode;
        }
        if (!btn || btn === document) return;
        
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
        if(action === 'toggleChat') window.toggleChat();
        if(action === 'clearChat') clearChatHistory();
        if(action === 'sendChat') sendChatMessage();
        if(action === 'startVoice') window.startVoiceRecognition();
        if(action === 'stopVoice') window.stopAIaudio();
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
        if(action === 'renderPublicTable' || e.target.id === 'public-table-selector') { e.preventDefault(); renderPublicTable(); }
        if(action === 'filterPublicTable' || e.target.id === 'public-year-filter') { e.preventDefault(); renderPublicTable(); }
        if(action === 'filterFlipbookSection' || e.target.id === 'section-flipbook-year') { e.preventDefault(); filterFlipbookSection(); }
        if(action === 'handleAdminYearChange' || e.target.id === 'global-year-filter') { e.preventDefault(); handleYearChange(); }
    });

    document.addEventListener("keyup", function(e) {
        if(e.target.getAttribute('data-action') === 'filterCurrentTable') filterCurrentTable();
    });

    generateYears(2000, new Date().getFullYear());
    setLanguage(appState.lang); // Auto-load translation
    initializeApp();
});

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

function showToast(message, type = 'success', duration = 4000) {
    const container = document.getElementById("toast-container");
    if(!container) return;
    const toast = document.createElement("div");
    let bg = type === 'success' ? 'bg-green-600' : type === 'error' ? 'bg-red-600' : type === 'warning' ? 'bg-yellow-600' : 'bg-blue-600';
    let icon = type === 'success' ? 'fa-check-circle' : type === 'error' ? 'fa-exclamation-circle' : type === 'warning' ? 'fa-wifi' : 'fa-info-circle';
    
    toast.className = `toast-enter flex items-center gap-3 ${bg} text-white px-4 py-3 rounded-lg shadow-xl border border-white/20`;
    toast.innerHTML = `<i class="fas ${icon} text-lg"></i><span class="font-bold text-sm">${message}</span>`;
    container.appendChild(toast);
    
    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateX(100%)';
        setTimeout(() => toast.remove(), 300);
    }, duration);
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

window.addEventListener('offline', () => {
    showToast(i18n[appState.lang].offlineMsg, "warning");
    document.body.classList.add('offline-mode');
});
window.addEventListener('online', () => {
    showToast(appState.lang === 'te' ? "ఆన్‌లైన్‌కు తిరిగి వచ్చారు!" : "Back online! Refreshing...", "success");
    document.body.classList.remove('offline-mode');
    initializeApp();
});

/* ============================================================
   5. INDIAN NUMBER & VOICE NORMALIZER ENGINE
============================================================ */
function numberToIndianWords(num, lang) {
    if (num === 0) return lang === 'te' ? 'సున్నా' : 'zero';
    const aEn = ['','one ','two ','three ','four ', 'five ','six ','seven ','eight ','nine ','ten ','eleven ','twelve ','thirteen ','fourteen ','fifteen ','sixteen ','seventeen ','eighteen ','nineteen '];
    const bEn = ['', '', 'twenty','thirty','forty','fifty', 'sixty','seventy','eighty','ninety'];
    
    const aTe = ['','ఒక ','రెండు ','మూడు ','నాలుగు ', 'ఐదు ','ఆరు ','ఏడు ','ఎనిమిది ','తొమ్మిది ','పది ','పదకొండు ','పన్నెండు ','పదమూడు ','పద్నాలుగు ','పదిహేను ','పదహారు ','పదిహేడు ','పద్దెనిమిది ','పంతొమ్మిది '];
    const bTe = ['', '', 'ఇరవై','ముప్పై','నలభై','యాభై', 'అరవై','డెబ్భై','ఎనభై','తొంభై'];

    const a = lang === 'te' ? aTe : aEn;
    const b = lang === 'te' ? bTe : bEn;
    
    const croreText = lang === 'te' ? 'కోట్ల ' : 'crore ';
    const lakhText = lang === 'te' ? 'లక్షల ' : 'lakh ';
    const thousandText = lang === 'te' ? 'వేల ' : 'thousand ';
    const hundredText = lang === 'te' ? 'వందల ' : 'hundred ';

    if ((num = num.toString()).length > 9) return 'overflow';
    let n = ('000000000' + num).substr(-9).match(/^(\d{2})(\d{2})(\d{2})(\d{1})(\d{2})$/);
    if (!n) return ''; 
    
    let str = '';
    str += (n[1] != 0) ? (a[Number(n[1])] || b[n[1][0]] + ' ' + a[n[1][1]]) + croreText : '';
    str += (n[2] != 0) ? (a[Number(n[2])] || b[n[2][0]] + ' ' + a[n[2][1]]) + lakhText : '';
    str += (n[3] != 0) ? (a[Number(n[3])] || b[n[3][0]] + ' ' + a[n[3][1]]) + thousandText : '';
    str += (n[4] != 0) ? (a[Number(n[4])] || b[n[4][0]] + ' ' + a[n[4][1]]) + hundredText : '';
    str += (n[5] != 0) ? ((str != '') ? (lang==='te'?'మరియు ':'and ') : '') + (a[Number(n[5])] || b[n[5][0]] + ' ' + a[n[5][1]]) : '';
    return str.trim();
}

function normalizeTextForSpeech(text, lang) {
    let t = text.replace(/[\u{1F600}-\u{1F6FF}\u{1F300}-\u{1F5FF}\u{2600}-\u{26FF}]/gu, ''); // Remove emojis
    t = t.replace(/[#*]/g, ''); // Remove markdown formatting
    
    // Symbols
    t = t.replace(/%/g, lang === 'te' ? " శాతం" : " percent");
    t = t.replace(/\+/g, lang === 'te' ? " ప్లస్ " : " plus ");
    
    // Currency & Number (₹8,50,000 -> Words)
    t = t.replace(/₹\s*([\d,]+)/g, (match, p1) => {
        let cleanNum = parseInt(p1.replace(/,/g, ''));
        let words = numberToIndianWords(cleanNum, lang);
        return words + (lang === 'te' ? " రూపాయలు " : " rupees ");
    });

    return t;
}

/* ============================================================
   6. MUSIKA AI ENGINE (UI & VOICE INTERCEPTOR)
============================================================ */
window.toggleChat = function() {
    const chatBox = document.getElementById("chat-box");
    const ratBtn = document.getElementById("mooshika-rat-btn");
    if (!chatBox) return;

    if (chatBox.classList.contains("hidden")) {
        chatBox.classList.remove("hidden");
        if (ratBtn) ratBtn.classList.add("listening");
        setTimeout(() => { 
            const input = document.getElementById("chat-input");
            if (input) input.focus(); 
        }, 150);
    } else {
        chatBox.classList.add("hidden");
        if (ratBtn) {
            ratBtn.classList.remove("listening");
            ratBtn.classList.remove("speaking");
        }
    }
};

function addMooshikaMessage(message, type = "ai") {
    const chatBox = document.getElementById("chat-messages");
    if (!chatBox) return;
    const msgDiv = document.createElement("div");
    msgDiv.className = type === "user" 
        ? "bg-amber-500 text-amber-950 p-3 rounded-xl ml-8 shadow-sm font-semibold" 
        : "bg-amber-900/80 text-white p-3 rounded-xl mr-4 border border-amber-500/30 shadow-sm markdown-content";
    
    msgDiv.innerHTML = type === "ai" && typeof marked !== 'undefined' ? DOMPurify.sanitize(marked.parse(message)) : message; 
    chatBox.appendChild(msgDiv);
    requestAnimationFrame(() => { chatBox.scrollTop = chatBox.scrollHeight; });
}

function clearChatHistory() {
    const chatBox = document.getElementById("chat-messages");
    if (!chatBox) return;
    chatBox.innerHTML = `<div class="bg-amber-900/80 p-3 rounded-xl border border-amber-500/30 shadow-sm">${i18n[appState.lang].aiGreeting}</div>`;
    showToast(appState.lang === 'te' ? "మెమరీ క్లియర్ చేయబడింది" : "Memory Cleared", "info");
}

function processVoiceCommands(cmd) {
    const c = cmd.toLowerCase();
    
    if (c.includes("తెలుగు") || c.includes("telugu") || c.includes("change to telugu")) {
        setLanguage('te');
        addMooshikaMessage("భాష తెలుగుకు మార్చబడింది.", "ai");
        window.speakAIResponse("భాష తెలుగుకు మార్చబడింది.");
        return true;
    }
    if (c.includes("english") || c.includes("change to english")) {
        setLanguage('en');
        addMooshikaMessage("Language changed to English.", "ai");
        window.speakAIResponse("Language changed to English.");
        return true;
    }
    if (c.includes("open dashboard") || c.includes("డ్యాష్‌బోర్డ్ తెరువు")) {
        if(appState.role === 'admin') showAdminSection('dashboard');
        addMooshikaMessage(appState.lang==='te'?"డాష్బోర్డ్ తెరుస్తున్నాను.":"Opening dashboard.", "ai");
        return true;
    }

    const yearMatch = c.match(/\b(20\d{2})\b/);
    if (yearMatch) appState.aiContextYear = yearMatch[0]; 

    return false; // Not a UI command, send to backend
}

/* ============================================================
   ADVANCED MUSIKA AI BRAIN (DYNAMIC YEAR DONOR & SPEECH ENGINE)
============================================================ */
async function sendChatMessage() {
    const input = document.getElementById("chat-input");
    const sendBtn = document.getElementById("btn-chat-send");
    const typing = document.getElementById("typing-indicator");
    const ratBtn = document.getElementById("mooshika-rat-btn");

    if (!input || !input.value.trim()) return;
    const question = input.value.trim();

    addMooshikaMessage(question, "user");
    input.value = "";

    if (processVoiceCommands(question)) return;

    if (!navigator.onLine) {
        addMooshikaMessage(i18n[appState.lang].offlineMsg, "ai");
        window.speakAIResponse(i18n[appState.lang].offlineMsg);
        return;
    }

    if(ratBtn) ratBtn.classList.add("listening");
    if(typing) typing.classList.remove("hidden");
    if(sendBtn) sendBtn.disabled = true;

    try {
        const qLower = question.toLowerCase();
        const activeCache = (appState.role === 'admin') ? adminDataCache : publicDataCache;
        let localResponseHtml = null;
        let spokenText = "";

        const yearMatch = qLower.match(/\b(19\d{2}|20\d{2})\b/);
        const queryYear = yearMatch ? yearMatch[0] : null;

        const isDonationQuery = qLower.includes('donat') || qLower.includes('విరాళ') || qLower.includes('donor') || qLower.includes('దాత');

        if (isDonationQuery) {
            const donations = activeCache["Donations"] || [];
            let filtered = donations;
            
            if (queryYear) {
                filtered = donations.filter(d => (d.financialYear || d.createdAt || "").toString().includes(queryYear));
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

                // Sort to show/speak the highest donations first
                filtered.sort((a, b) => {
                    let amtA = parseFloat(String(a.amount || "0").replace(/,/g, '')) || 0;
                    let amtB = parseFloat(String(b.amount || "0").replace(/,/g, '')) || 0;
                    return amtB - amtA;
                });

                filtered.forEach((d, index) => {
                    const name = d.donorName || d.name || (appState.lang === 'te' ? 'పేరులేని భక్తుడు' : 'Anonymous');
                    const amtString = String(d.amount || "0").replace(/,/g, '');
                    const amt = parseFloat(amtString) || 0;
                    totalAmt += amt;

                    localResponseHtml += `<li><span class="font-bold text-amber-300">${name}</span>: <span class="text-green-300 font-black">₹${amt.toLocaleString('en-IN')}</span></li>`;

                    // FIX: Speak names clearly, limit to Top 5 so voice engine doesn't crash
                    if (index < 5) {
                        if (appState.lang === 'te') {
                            spokenParts.push(`${name} ${amt} రూపాయలు`);
                        } else {
                            spokenParts.push(`${name} donated ${amt} rupees`);
                        }
                    }
                });

                localResponseHtml += `</ul><div class="mt-2 pt-2 border-t border-amber-500/30 font-bold text-amber-200">Total: ₹${totalAmt.toLocaleString('en-IN')}</div>`;

                let andOthers = "";
                if (filtered.length > 5) {
                    andOthers = appState.lang === 'te' ? `, మరియు ఇతరులు` : `, and others`;
                }

                if (appState.lang === 'te') {
                    spokenText = `${yrTitle} విరాళాల వివరాలు: ` + spokenParts.join(', ') + `${andOthers}. మొత్తం విరాళాలు ${totalAmt} రూపాయలు.`;
                } else {
                    spokenText = `Here are the donations for ${yrTitle}: ` + spokenParts.join(', ') + `${andOthers}. Total donations amount to ${totalAmt} rupees.`;
                }
            }
        }
        else if (qLower.includes('comparison') || qLower.includes('yearly') || qLower.includes('growth') || 
                 qLower.includes('పోలిక') || qLower.includes('వార్షిక') || qLower.includes('పెరుగుదల') || 
                 qLower.includes('balance') || qLower.includes('నిల్వ') || qLower.includes('budget')) {
            
            const donations = activeCache["Donations"] || [];
            const tracker = activeCache["FinancialTracker"] || [];
            
            let yearlyData = {};
            donations.forEach(d => {
                let yr = (d.financialYear || d.createdAt || "").substring(0, 4) || "";
                if (yr.length === 4) {
                    if (!yearlyData[yr]) yearlyData[yr] = { income: 0, expense: 0 };
                    yearlyData[yr].income += parseFloat(String(d.amount).replace(/,/g, '')) || 0;
                }
            });
            tracker.forEach(e => {
                let yr = (e.financialYear || e.date || "").substring(0, 4) || "";
                if (yr.length === 4) {
                    if (!yearlyData[yr]) yearlyData[yr] = { income: 0, expense: 0 };
                    yearlyData[yr].expense += parseFloat(String(e.amount).replace(/,/g, '')) || 0;
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
                    
                    if(appState.lang === 'te') {
                        spokenParts.push(`${yr} లో, ఆదాయం ${inc} రూపాయలు, ఖర్చులు ${exp} రూపాయలు, నిల్వ ${bal} రూపాయలు`);
                    } else {
                        spokenParts.push(`In ${yr}, income was ${inc} rupees, expenses ${exp} rupees, balance ${bal} rupees`);
                    }
                    prevIncome = inc;
                });
                localResponseHtml = summaryText;
                spokenText = (appState.lang === 'te' ? "వార్షిక ఆర్థిక పోలిక ఇక్కడ ఉంది: " : "Here is the yearly financial comparison: ") + spokenParts.join('. ');
            }
        }
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
                spokenText = appState.lang === 'te' ? `${matchedTable} పట్టికలో ${recs.length} రికార్డులు కనుగొనబడ్డాయి.` : `Found ${recs.length} records in the ${matchedTable} table.`;
            }
        }

        if (localResponseHtml) {
            if(typing) typing.classList.add("hidden");
            if(ratBtn) ratBtn.classList.remove("listening");
            addMooshikaMessage(localResponseHtml, "ai");
            window.speakAIResponse(spokenText || "Here is the requested information.");
            if(sendBtn) sendBtn.disabled = false;
            return;
        }

        const payload = { action: 'askAI', question: question, sessionToken: appState.token, lang: appState.lang, contextYear: appState.aiContextYear };
        const res = await fetch(API_URL, { method: "POST", body: JSON.stringify(payload) }).then(r => r.json());

        if(typing) typing.classList.add("hidden");
        if(ratBtn) ratBtn.classList.remove("listening");

        if (res && res.status === "success") {
            if(res.year) appState.aiContextYear = res.year;

            let finalHtml = res.answerHtml || res.speechText;
            
            if (res.data && res.data.length > 0 && res.columns) {
                let tbl = `<div class="mt-2 overflow-x-auto rounded border border-amber-500/30"><table class="w-full text-[10px]"><thead class="bg-amber-900/80 text-amber-400"><tr>`;
                res.columns.forEach(col => tbl += `<th class="p-1">${col}</th>`);
                tbl += `</tr></thead><tbody class="divide-y divide-amber-800/50">`;
                res.data.forEach(row => {
                    tbl += `<tr>`;
                    res.columns.forEach(col => tbl += `<td class="p-1">${row[col]||'-'}</td>`);
                    tbl += `</tr>`;
                });
                tbl += `</tbody></table></div>`;
                finalHtml += tbl;
            }

            addMooshikaMessage(finalHtml, "ai");
            window.speakAIResponse(res.speechText); 
        } else {
            addMooshikaMessage(res.message || "Server Error", "ai");
        }
    } catch (error) {
        if(typing) typing.classList.add("hidden");
        if(ratBtn) ratBtn.classList.remove("listening");
        addMooshikaMessage("⚠️ Connection error.", "ai");
    } finally {
        if (sendBtn) sendBtn.disabled = false;
    }
}

/* ============================================================
   7. STT & TTS (SPEECH RECOGNITION & SYNTHESIS)
============================================================ */
const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
let recognition = null;

if (SpeechRecognition) {
    recognition = new SpeechRecognition();
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;
    
    recognition.onstart = function() {
        document.getElementById('voice-pulse')?.classList.remove('hidden');
        const input = document.getElementById("chat-input");
        if (input) input.placeholder = i18n[appState.lang].listening;
    };
    recognition.onresult = function(event) {
        const input = document.getElementById("chat-input");
        if (input) input.value = event.results[0][0].transcript;
        sendChatMessage(); 
    };
    recognition.onerror = function() { showToast("Voice recognition failed", "error"); };
    recognition.onend = function() {
        document.getElementById('voice-pulse')?.classList.add('hidden');
        const input = document.getElementById("chat-input");
        if (input) input.placeholder = i18n[appState.lang].askHere;
    };
}

window.startVoiceRecognition = function() {
    if (!recognition) return showToast("Your browser does not support Voice Recognition.", "error");
    recognition.lang = appState.lang === 'te' ? 'te-IN' : 'en-IN';
    recognition.start();
};

window.speakAIResponse = function(rawText) {
    if (!('speechSynthesis' in window)) return;
    window.speechSynthesis.cancel(); 
    
    let cleanText = normalizeTextForSpeech(rawText, appState.lang);

    currentAudioUtterance = new SpeechSynthesisUtterance(cleanText);
    
    const voices = window.speechSynthesis.getVoices();
    
    // BUG FIX: Detect if the text contains actual Telugu script
    const containsTelugu = /[\u0C00-\u0C7F]/.test(cleanText);
    
    let preferredVoice;

    // Force Telugu or Indian Voice if Telugu characters are detected
    if (containsTelugu || appState.lang === 'te') {
        preferredVoice = voices.find(v => v.lang.includes('te-IN') || v.lang.includes('te'));
        // If Telugu voice is missing, fallback to Hindi (it pronounces Indian names better than US English)
        if (!preferredVoice) preferredVoice = voices.find(v => v.lang.includes('hi-IN')); 
    } else {
        preferredVoice = voices.find(v => v.lang.includes('en-IN') || v.lang.includes('en-GB'));
    }

    // Final fallback to system default
    if (!preferredVoice) preferredVoice = voices[0];

    if (preferredVoice) currentAudioUtterance.voice = preferredVoice;

    currentAudioUtterance.rate = 0.85; // Slightly slower so names are pronounced clearly
    currentAudioUtterance.pitch = 1.0;

    currentAudioUtterance.onstart = () => {
        document.getElementById('btn-stop-audio')?.classList.remove('hidden');
        const rat = document.getElementById("mooshika-rat-btn");
        if(rat) rat.classList.add('speaking');
    };
    
    currentAudioUtterance.onend = () => {
        document.getElementById('btn-stop-audio')?.classList.add('hidden');
        const rat = document.getElementById("mooshika-rat-btn");
        if(rat) rat.classList.remove('speaking');
    };

    currentAudioUtterance.onerror = (e) => {
        console.warn("Speech Synthesis Error: ", e);
        document.getElementById('btn-stop-audio')?.classList.add('hidden');
        const rat = document.getElementById("mooshika-rat-btn");
        if(rat) rat.classList.remove('speaking');
    };

    window.speechSynthesis.speak(currentAudioUtterance);
};

window.stopAIaudio = function() {
    if ('speechSynthesis' in window) window.speechSynthesis.cancel();
    document.getElementById('btn-stop-audio')?.classList.add('hidden');
    const rat = document.getElementById("mooshika-rat-btn");
    if(rat) rat.classList.remove('speaking');
};


/* ============================================================
   8. CORE APP LOADERS & INIT
============================================================ */
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

async function handleLogin(type) {
    const modalId = type === 'admin' ? 'admin-login-modal' : 'login-modal';
    const btn = document.querySelector(`#${modalId} button`);
    const originalText = btn.innerText;
    btn.innerText = "Verifying...";
    btn.disabled = true;

    if (!navigator.onLine) {
        showToast(i18n[appState.lang].offlineMsg, "error");
        btn.innerText = originalText; btn.disabled = false;
        return;
    }

    const payload = type === 'admin' 
        ? { action: 'adminLogin', secret: document.getElementById('admin-secret').value }
        : { action: 'login', identifier: document.getElementById('login-id').value, password: document.getElementById('login-pass').value };
    
    try {
        const res = await fetch(API_URL, { method: 'POST', body: JSON.stringify(payload) }).then(r => r.json());
        if (res.status === 'success') {
            safeSetSession('sessionToken', res.sessionToken);
            safeSetSession('userRole', res.user.role);
            safeSetSession('userName', res.user.name);
            appState = { token: res.sessionToken, role: res.user.role, userName: res.user.name, currentYear: appState.currentYear, lang: appState.lang, aiContextYear: appState.aiContextYear };
            hideModal(modalId);
            showToast(`${i18n[appState.lang].welcomeBack}, ${res.user.name}!`);
            initializeApp();
        } else { showToast(res.message || "Invalid credentials", "error"); }
    } catch (err) { showToast("Network error.", "error"); } 
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
    if (!navigator.onLine) return showToast(i18n[appState.lang].offlineMsg, "error");

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
    } catch (err) { showToast("Network error.", "error"); } 
    finally { btn.innerText = "Create Account"; btn.disabled = false; }
}

function logout() {
    sessionStorage.clear();
    appState = { token: null, role: 'public', userName: null, currentYear: new Date().getFullYear().toString(), lang: appState.lang, aiContextYear: new Date().getFullYear().toString() };
    showToast("Logged out securely.", "info");
    initializeApp();
}

async function loadPublicData() {
    try {
        if (!navigator.onLine) throw new Error("Offline");
        const res = await fetch(API_URL, { method: 'POST', body: JSON.stringify({ action: 'getPublicData' }) }).then(r => r.json());
        if (res.status === 'success') {
            publicDataCache = res.data;
            safeSetLocal('offline_public_data', JSON.stringify(publicDataCache)); 
            populatePublicTableDropdown();
            renderPublicTable();
            renderCarousel(publicDataCache.Banners || []);
            renderFlipbookArchiveSection();
            feedFinancialData(); 
        }
    } catch (err) { 
        console.warn("Using offline cached public data.");
        const offlineData = safeGetLocal('offline_public_data', null);
        if(offlineData) {
            publicDataCache = JSON.parse(offlineData);
            populatePublicTableDropdown();
            renderPublicTable();
            renderCarousel(publicDataCache.Banners || []);
            renderFlipbookArchiveSection();
            feedFinancialData();
        }
    }
}

async function loadAdminDashboard() {
    const adminUserEl = document.getElementById('admin-user-name');
    if (adminUserEl) adminUserEl.textContent = appState.userName;
    renderAdminSidebar();

    try {
        if (!navigator.onLine) throw new Error("Offline");
        const res = await fetch(API_URL, { method: 'POST', body: JSON.stringify({ action: 'getAdminData', sessionToken: appState.token }) }).then(r => r.json());
        if (res.status === 'success') {
            adminDataCache = res.data;
            safeSetLocal('offline_admin_data', JSON.stringify(adminDataCache)); 
            appState.currentYear = "all";
            const yearFilterEl = document.getElementById('global-year-filter');
            if (yearFilterEl) yearFilterEl.value = "all";

            renderDashboardMetrics();
            renderFinancialDashboard();
            feedFinancialData(); 
        } else { showToast(res.message, "error"); logout(); }
    } catch (err) { 
        console.warn("Using offline cached admin data.");
        const offlineData = safeGetLocal('offline_admin_data', null);
        if(offlineData) {
            adminDataCache = JSON.parse(offlineData);
            renderDashboardMetrics();
            renderFinancialDashboard();
            feedFinancialData();
        } else {
            showToast("Failed to load admin data (Offline).", "error");
        }
    }
}

function loadUserDashboard() {
    const userDisplay = document.getElementById('user-display-name');
    const panel = document.getElementById('user-greeting-panel');
    if (userDisplay && panel) {
        userDisplay.textContent = appState.userName || 'Devotee';
        panel.classList.remove('hidden');
    }
}


/* ============================================================
   UPDATE THIS FUNCTION (To pass financialYear properly)
============================================================ */
function feedFinancialData() {
    const cache = (appState.role === 'admin') ? adminDataCache : publicDataCache;
    const donations = cache["Donations"] || [];
    const tracker = cache["FinancialTracker"] || [];
    const assistance = cache["FinancialAssistance"] || [];
    const repayments = cache["Repayments"] || [];

    const allTransactions = [
        ...donations.filter(d => d.status === 'Verified').map(d => ({ ...d, transactionType: 'donation', amount: d.amount, date: d.createdAt || d.date || d.donationDate, financialYear: d.financialYear })),
        ...tracker.map(t => ({ ...t, transactionType: t.type || 'expense', amount: t.amount, date: t.date || t.createdAt, financialYear: t.financialYear })),
        ...assistance.map(a => ({ ...a, transactionType: 'expense', amount: a.amount, date: a.issueDate || a.createdAt, financialYear: a.financialYear })),
        ...repayments.map(r => ({ ...r, transactionType: 'income', amount: r.amountPaid || r.amount, date: r.paymentDate || r.createdAt, financialYear: r.financialYear }))
    ];

    if (typeof window.setFinancialTransactions === 'function') {
        window.setFinancialTransactions(allTransactions);
    }
}


/* ============================================================
   REPLACE THIS ENTIRE SECTION AT THE BOTTOM OF OY.JS
   13. FINANCIAL CALCULATOR & MANAGEMENT LOGIC ENGINE
============================================================ */
(function () {
    "use strict";

    const state = {
        transactions: [],
        filteredTransactions: [],
        openingBalance: 0
    };

    // Formats numbers to Indian Currency layout
    const money = (value) => {
        const amount = Number(value) || 0;
        return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 2 }).format(amount);
    };

    const getDate = (tx) => (tx.transactionDate || tx.date || tx.donationDate || tx.expenseDate || tx.createdAt || "");

    // Extracts amount and strips out commas to prevent NaN errors
    const getAmount = (tx) => {
        let val = tx.amount ?? tx.totalAmount ?? tx.value ?? 0;
        if (typeof val === 'string') val = val.replace(/,/g, ''); // Fixes "5,000" calculation bugs
        return parseFloat(val) || 0;
    };

    const getType = (tx) => {
        const type = String(tx.transactionType || tx.type || tx.categoryType || "").toLowerCase();
        if (type.includes("donat") || type.includes("income") || type.includes("credit")) return "income";
        if (type.includes("expense") || type.includes("debit") || type.includes("payment")) return "expense";
        return "income";
    };

    function calculateFinancialData() {
        const startDate = document.getElementById("finance-start-date")?.value || "";
        const endDate = document.getElementById("finance-end-date")?.value || "";
        const year = document.getElementById("finance-year")?.value || "all";
        const type = document.getElementById("finance-type")?.value || "all";

        let openingIncome = 0;
        let openingExpense = 0;

        state.filteredTransactions = state.transactions.filter((tx) => {
            const dateStr = getDate(tx);
            const dateOnly = dateStr.substring(0, 10);
            const txYear = (tx.financialYear || dateStr.substring(0, 4)).toString();
            
            if (!dateOnly) return false;

            // 1. Check if Transaction falls BEFORE the selected range (For Opening Balance)
            let isBeforeRange = false;
            if (year !== "all" && parseInt(txYear) < parseInt(year)) {
                isBeforeRange = true;
            } else if (year === "all" && startDate && dateOnly < startDate) {
                isBeforeRange = true;
            }

            if (isBeforeRange) {
                const amt = getAmount(tx);
                if (getType(tx) === "income") openingIncome += amt;
                else openingExpense += amt;
                return false; // Hide from current view
            }

            // 2. Normal View Filtering
            if (startDate && dateOnly < startDate) return false;
            if (endDate && dateOnly > endDate) return false;
            if (year !== "all" && txYear !== year) return false;

            if (type !== "all") {
                const txType = getType(tx);
                const rawType = String(tx.transactionType || tx.type || "").toLowerCase();
                if (type === "donation" && !rawType.includes("donat")) return false;
                else if (type !== "donation" && txType !== type) return false;
            }
            return true;
        });

        // Set the carry-forward balance
        state.openingBalance = openingIncome - openingExpense;

        renderFinancialSummary();
        renderTransactions();
    }

    function renderFinancialSummary() {
        let income = 0, donations = 0, expenses = 0;

        state.filteredTransactions.forEach((tx) => {
            const amount = getAmount(tx);
            const txType = getType(tx);
            const rawType = String(tx.transactionType || tx.type || "").toLowerCase();

            if (rawType.includes("donat")) { donations += amount; income += amount; } 
            else if (txType === "income") { income += amount; } 
            else { expenses += amount; }
        });

        const currentNet = income - expenses;
        const closing = state.openingBalance + currentNet;

        setText("finance-total-income", money(income));
        setText("finance-total-donations", money(donations));
        setText("finance-total-expenses", money(expenses));
        setText("finance-net-balance", money(currentNet));

        // Advanced Carry-Forward Display
        setText("finance-opening-balance", money(state.openingBalance));
        setText("finance-balance-income", "+ " + money(income));
        setText("finance-balance-expense", "- " + money(expenses));
        setText("finance-closing-balance", money(closing));
    }

    function renderTransactions() {
        const tbody = document.getElementById("finance-transactions-body");
        if (!tbody) return;

        const search = document.getElementById("finance-search")?.value?.toLowerCase().trim() || "";
        let records = state.filteredTransactions;
        
        if (search) {
            records = records.filter(tx => JSON.stringify(tx).toLowerCase().includes(search));
        }

        if (!records.length) {
            tbody.innerHTML = `<tr><td colspan="7" class="p-6 text-center font-bold text-amber-200/50">No financial records found for the selected period.</td></tr>`;
            setText("finance-record-count", "0 transactions");
            return;
        }

        tbody.innerHTML = "";
        let runningBalance = state.openingBalance;

        // Render Opening Balance Row
        if (state.openingBalance !== 0) {
            const openRow = document.createElement("tr");
            openRow.className = "bg-amber-900/40 border-b border-amber-600/50";
            openRow.innerHTML = `
                <td class="p-3">-</td>
                <td class="p-3 font-bold text-amber-300">Opening Balance</td>
                <td class="p-3 text-xs opacity-70">Carry-forward from previous period</td>
                <td class="p-3">-</td>
                <td class="p-3">-</td>
                <td class="p-3">-</td>
                <td class="p-3 font-black text-amber-300">${money(runningBalance)}</td>
            `;
            tbody.appendChild(openRow);
        }

        // Render Data Rows
        records.slice().sort((a, b) => getDate(a).localeCompare(getDate(b))).forEach((tx) => {
            const amount = getAmount(tx);
            const type = getType(tx);
            const income = type === "income" ? amount : 0;
            const expense = type === "expense" ? amount : 0;

            runningBalance += income - expense;

            const ref = escapeHtml(tx.transactionCode || tx.utrNumber || tx.id || "-");
            const desc = escapeHtml(tx.description || tx.purpose || tx.notes || "-");

            const row = document.createElement("tr");
            row.className = "hover:bg-amber-800/40 border-b border-amber-800/30 transition text-sm";
            row.innerHTML = `
                <td class="p-3 whitespace-nowrap">${formatDate(getDate(tx))}</td>
                <td class="p-3 truncate max-w-[120px] text-amber-200" title="${ref}">${ref}</td>
                <td class="p-3 truncate max-w-[150px]" title="${desc}">${desc}</td>
                <td class="p-3"><span class="px-2 py-1 rounded text-[10px] font-black ${type === "income" ? "bg-green-900/50 text-green-400 border border-green-500/30" : "bg-red-900/50 text-red-400 border border-red-500/30"}">${type.toUpperCase()}</span></td>
                <td class="p-3 font-bold text-green-300">${income ? "+ " + money(income) : "-"}</td>
                <td class="p-3 font-bold text-red-300">${expense ? "- " + money(expense) : "-"}</td>
                <td class="p-3 font-black text-amber-100">${money(runningBalance)}</td>
            `;
            tbody.appendChild(row);
        });

        setText("finance-record-count", `${records.length} transaction${records.length === 1 ? "" : "s"}`);
    }

    function populateYears() {
        const select = document.getElementById("finance-year");
        if (!select) return;
        
        const currentVal = select.value;
        select.innerHTML = '<option value="all">All Years</option>'; // Prevents duplicate options
        
        const years = new Set();
        state.transactions.forEach((tx) => {
            const yr = tx.financialYear || (getDate(tx) || "").substring(0, 4);
            if (yr && yr.length === 4) years.add(yr);
        });

        Array.from(years).sort((a, b) => Number(b) - Number(a)).forEach((year) => {
            const option = document.createElement("option");
            option.value = year;
            option.textContent = year;
            select.appendChild(option);
        });

        if(Array.from(select.options).some(o => o.value === currentVal)) select.value = currentVal;
    }

    function setTransactions(data) {
        state.transactions = Array.isArray(data) ? data : [];
        populateYears();
        calculateFinancialData();
    }

    function setText(id, value) { const el = document.getElementById(id); if (el) el.textContent = value; }
    function escapeHtml(value) { const div = document.createElement("div"); div.textContent = String(value ?? ""); return div.innerHTML; }

    document.addEventListener("DOMContentLoaded", () => {
        // Now automatically calculates when you change dropdown options
        document.getElementById("finance-calculate-btn")?.addEventListener("click", calculateFinancialData);
        document.getElementById("finance-year")?.addEventListener("change", calculateFinancialData);
        document.getElementById("finance-type")?.addEventListener("change", calculateFinancialData);
        document.getElementById("finance-start-date")?.addEventListener("change", calculateFinancialData);
        document.getElementById("finance-end-date")?.addEventListener("change", calculateFinancialData);
        
        document.getElementById("finance-reset-btn")?.addEventListener("click", () => {
            const sd = document.getElementById("finance-start-date"); if(sd) sd.value = "";
            const ed = document.getElementById("finance-end-date"); if(ed) ed.value = "";
            const yr = document.getElementById("finance-year"); if(yr) yr.value = "all";
            const ty = document.getElementById("finance-type"); if(ty) ty.value = "all";
            const search = document.getElementById("finance-search"); if(search) search.value = "";
            calculateFinancialData();
        });
        
        document.getElementById("finance-search")?.addEventListener("input", renderTransactions);

        window.setFinancialTransactions = setTransactions;
    });
})();
/* ============================================================
   9. PUBLIC VIEWER & CAROUSEL
============================================================ */
function populatePublicTableDropdown() {
    const selector = document.getElementById("public-table-selector");
    if (!selector) return;
    
    const availableTables = SAFE_PUBLIC_TABLES.filter(t => publicDataCache[t]);
    
    if (availableTables.length === 0) {
        selector.innerHTML = `<option value="Donations">Donations</option><option value="Events">Events</option>`;
    } else {
        selector.innerHTML = availableTables.map(t => `<option value="${t}">${t}</option>`).join('');
    }
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
    
    if (records.length === 0) {
        thead.innerHTML = `<tr><th class="p-4 text-center">Notice</th></tr>`;
        tbody.innerHTML = `<tr><td class="p-6 text-center text-amber-300">No records found.</td></tr>`;
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
   10. ADMIN DASHBOARD & CRUD
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
    
    const filterByYear = (arr) => {
        if (!arr) return [];
        if (year === "all") return arr;
        return arr.filter(item => (item.financialYear || item.createdAt || item.date || item.eventDate || "").toString().includes(year));
    };

    const yrDonations = filterByYear(adminDataCache["Donations"]);
    const yrExpenses = filterByYear(adminDataCache["FinancialTracker"]);
    
    let totalDonors = adminDataCache["Donors"] ? filterByYear(adminDataCache["Donors"]).length : 0;
    let verifiedDonations = yrDonations ? yrDonations.filter(d => d.status === "Verified").reduce((acc, curr) => acc + (parseFloat(curr.amount) || 0), 0) : 0;
    let totalExpenses = yrExpenses ? yrExpenses.reduce((acc, curr) => acc + (parseFloat(curr.amount) || 0), 0) : 0;
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
        container.innerHTML = `<p class="text-amber-200 col-span-3 text-center bg-amber-900/40 p-4 rounded-xl border border-amber-500/30">Please select a specific year to view detailed carry-forward accounting.</p>`;
        return;
    }

    const targetYear = parseInt(appState.currentYear);
    
    let openingBalance = 0;
    if (adminDataCache["Donations"] && adminDataCache["FinancialTracker"] && adminDataCache["Repayments"] && adminDataCache["FinancialAssistance"]) {
        const pastDonations = adminDataCache["Donations"].filter(d => d.status === "Verified" && parseInt((d.financialYear || d.createdAt||"").substring(0,4)) < targetYear).reduce((acc, curr) => acc + (parseFloat(curr.amount) || 0), 0);
        const pastRepayments = adminDataCache["Repayments"].filter(d => parseInt((d.financialYear || d.paymentDate||d.createdAt||"").substring(0,4)) < targetYear).reduce((acc, curr) => acc + (parseFloat(curr.amountPaid) || 0), 0);
        const pastExpenses = adminDataCache["FinancialTracker"].filter(d => parseInt((d.financialYear || d.date||"").substring(0,4)) < targetYear).reduce((acc, curr) => acc + (parseFloat(curr.amount) || 0), 0);
        const pastAssistance = adminDataCache["FinancialAssistance"].filter(d => parseInt((d.financialYear || d.issueDate||"").substring(0,4)) < targetYear).reduce((acc, curr) => acc + (parseFloat(curr.amount) || 0), 0);

        openingBalance = (pastDonations + pastRepayments) - (pastExpenses + pastAssistance);
    }

    let cyDonations = 0, cyRepayments = 0, cyExpenses = 0, cyAssistance = 0;
    if (adminDataCache["Donations"]) cyDonations = adminDataCache["Donations"].filter(d => d.status === "Verified" && parseInt((d.financialYear || d.createdAt||"").substring(0,4)) === targetYear).reduce((acc, curr) => acc + (parseFloat(curr.amount) || 0), 0);
    if (adminDataCache["Repayments"]) cyRepayments = adminDataCache["Repayments"].filter(d => parseInt((d.financialYear || d.paymentDate||d.createdAt||"").substring(0,4)) === targetYear).reduce((acc, curr) => acc + (parseFloat(curr.amountPaid) || 0), 0);
    if (adminDataCache["FinancialTracker"]) cyExpenses = adminDataCache["FinancialTracker"].filter(d => parseInt((d.financialYear || d.date||"").substring(0,4)) === targetYear).reduce((acc, curr) => acc + (parseFloat(curr.amount) || 0), 0);
    if (adminDataCache["FinancialAssistance"]) cyAssistance = adminDataCache["FinancialAssistance"].filter(d => parseInt((d.financialYear || d.issueDate||"").substring(0,4)) === targetYear).reduce((acc, curr) => acc + (parseFloat(curr.amount) || 0), 0);

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
    
    if (appState.currentYear && appState.currentYear !== "all") {
        data = data.filter(item => {
            const rowDate = (item.financialYear || item.createdAt || item.date || item.eventDate || item.year || "").toString();
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
        tbody.innerHTML = `<tr><td class="p-4 text-center text-amber-300/80" colspan="100%">No records found.</td></tr>`;
        return;
    }

    data.forEach(row => {
        let tr = document.createElement('tr');
        tr.className = "hover:bg-amber-900/40 transition border-b border-amber-800/30";
        
        keys.forEach(k => {
            let val = row[k] !== undefined && row[k] !== "" ? row[k] : '-';
            if((k.toLowerCase().includes('date') || k.toLowerCase().includes('at')) && val !== '-') val = formatDate(val);
            
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
    const input = document.getElementById('table-search').value.toLowerCase();
    const rows = document.getElementById('dynamic-table-body').getElementsByTagName('tr');
    for (let i = 0; i < rows.length; i++) {
        rows[i].style.display = rows[i].textContent.toLowerCase().includes(input) ? "" : "none";
    }
}

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
                    </select>
                </div>
            `;
        } else if (field === "financialYear") {
            container.innerHTML += `
                <div class="flex flex-col gap-1">
                    <label class="text-xs font-bold text-amber-400 uppercase tracking-wider">${field}</label>
                    <input type="number" id="crud-field-${field}" value="${val || appState.currentYear}" class="bg-amber-900 border border-amber-500 text-white p-2 rounded focus:outline-none focus:border-amber-300" placeholder="e.g. 2026">
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
    if (!navigator.onLine) return showToast(i18n[appState.lang].offlineMsg, "error");

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
    if (!navigator.onLine) return showToast(i18n[appState.lang].offlineMsg, "error");
    if (!confirm(i18n[appState.lang].delConfirm)) return;
    
    try {
        const res = await fetch(API_URL, { method: 'POST', body: JSON.stringify({ action: 'delete', sessionToken: appState.token, sheetName: tableName, id: id }) }).then(r => r.json());
        if (res.status === 'success') {
            showToast("Record deleted.");
            await loadAdminDashboard();
            renderTableView(tableName);
        } else { showToast(res.message, "error"); }
    } catch (err) { showToast("Network error.", "error"); }
}

/* ============================================================
   11. TURN.JS FLIPBOOK ENGINE
============================================================ */
function openFlipbook() {
    const yearFilter = document.getElementById('public-year-filter');
    const targetYear = (yearFilter && yearFilter.value !== "all") ? yearFilter.value : appState.currentYear;
    
    const cacheSource = (appState.role === 'admin') ? adminDataCache : publicDataCache;
    const allPages = cacheSource["FlipBook"] || [];
    
    flipbookPages = allPages
        .filter(p => {
            const matchesYear = (p.financialYear || p.createdAt || "").toString().includes(targetYear) || (p.year || "").toString().includes(targetYear);
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
                            <img src="${page.imageUrl}" class="w-full h-full object-cover">
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
            book.turn({ width: bookWidth, height: bookHeight, autoCenter: true, elevation: 60, gradients: true,
                when: {
                    turned: function(e, page) {
                        document.getElementById('flipbook-indicator').textContent = `Page ${page} of ${book.turn("pages")}`;
                    }
                }
            });
            document.getElementById('flipbook-indicator').textContent = `Page 1 of ${book.turn("pages")}`;
        } catch (err) { console.error("Turn.js binding error:", err); }
    }, 150);
}

function turnPage(direction) {
    try { if (direction > 0) $("#flipbook").turn("next"); else $("#flipbook").turn("previous"); } catch(e){}
}

/* ============================================================
   12. FLIPBOOK ARCHIVE LIST
============================================================ */
function renderFlipbookArchiveSection() {
    const grid = document.getElementById("flipbook-cards-grid");
    const yearSelect = document.getElementById("section-flipbook-year");
    if (!grid) return;

    const selectedYear = yearSelect ? yearSelect.value : "all";
    const cacheSource = (appState.role === 'admin') ? adminDataCache : publicDataCache;
    const allPages = cacheSource["FlipBook"] || [];

    let filteredPages = allPages.filter(p => {
        const status = (p.status || "Active").toString().toLowerCase();
        if (appState.role === 'admin') return true;
        return status !== "inactive" && status !== "draft" && status !== "unpublished" && status !== "deleted";
    });

    if (selectedYear !== "all") {
        filteredPages = filteredPages.filter(p => (p.financialYear || p.createdAt || p.date || p.year || "").toString().includes(selectedYear));
    }
    filteredPages.sort((a, b) => parseInt(a.pageNumber || 0) - parseInt(b.pageNumber || 0));

    if (filteredPages.length === 0) {
        grid.innerHTML = `<div class="col-span-full text-center py-10 text-amber-200 font-semibold bg-amber-950/40 rounded-xl border border-amber-500/20">No records found.</div>`;
        return;
    }

    grid.innerHTML = filteredPages.map(page => `
        <div class="bg-amber-950/80 border-2 border-amber-500/40 rounded-2xl overflow-hidden shadow-xl flex flex-col justify-between glass-hover transition-all duration-300">
            <div>
                ${page.imageUrl && page.imageUrl !== '-' ? `
                    <div class="h-48 w-full overflow-hidden relative border-b border-amber-500/30 bg-black/40">
                        <img src="${page.imageUrl}" class="w-full h-full object-cover">
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
                <button data-action="openFlipbook" class="w-full bg-amber-600 hover:bg-amber-500 text-amber-950 font-black py-2.5 rounded-xl text-xs shadow transition">
                    <i class="fas fa-book-reader"></i> Open in 3D Book
                </button>
            </div>
        </div>
    `).join('');
}
function filterFlipbookSection() { renderFlipbookArchiveSection(); }

/* ============================================================
   13. FINANCIAL CALCULATOR (IIFE)
============================================================ */
(function () {
    "use strict";
    const state = { transactions: [], filteredTransactions: [] };

    const money = (value) => new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 2 }).format(Number(value) || 0);
    const getDate = (tx) => (tx.transactionDate || tx.date || tx.donationDate || tx.expenseDate || tx.createdAt || "");
    const getAmount = (tx) => Number(tx.amount ?? tx.totalAmount ?? tx.value ?? 0) || 0;
    const getType = (tx) => {
        const type = String(tx.transactionType || tx.type || tx.categoryType || "").toLowerCase();
        if (type.includes("donat") || type.includes("income") || type.includes("credit")) return "income";
        if (type.includes("expense") || type.includes("debit") || type.includes("payment")) return "expense";
        return "income";
    };

    function calculateFinancialData() {
        const startDate = document.getElementById("finance-start-date")?.value || "";
        const endDate = document.getElementById("finance-end-date")?.value || "";
        const year = document.getElementById("finance-year")?.value || "all";
        const type = document.getElementById("finance-type")?.value || "all";

        state.filteredTransactions = state.transactions.filter((tx) => {
            const date = getDate(tx).substring(0, 10);
            if (!date) return false;
            if (startDate && date < startDate) return false;
            if (endDate && date > endDate) return false;
            if (year !== "all" && !(tx.financialYear || date).toString().includes(year)) return false;
            if (type !== "all") {
                const txType = getType(tx);
                if (type === "donation" && !String(tx.transactionType || tx.type || "").toLowerCase().includes("donat")) return false;
                else if (type !== "donation" && txType !== type) return false;
            }
            return true;
        });

        renderFinancialSummary();
        renderTransactions();
    }

    function renderFinancialSummary() {
        let income = 0, donations = 0, expenses = 0;
        state.filteredTransactions.forEach((tx) => {
            const amount = getAmount(tx);
            const rawType = String(tx.transactionType || tx.type || "").toLowerCase();
            if (rawType.includes("donat")) { donations += amount; income += amount; } 
            else if (getType(tx) === "income") { income += amount; } 
            else { expenses += amount; }
        });

        const balance = income - expenses;
        setText("finance-total-income", money(income));
        setText("finance-total-donations", money(donations));
        setText("finance-total-expenses", money(expenses));
        setText("finance-net-balance", money(balance));
        setText("finance-balance-income", money(income));
        setText("finance-balance-expense", money(expenses));
        setText("finance-closing-balance", money(balance));
    }

    function renderTransactions() {
        const tbody = document.getElementById("finance-transactions-body");
        if (!tbody) return;
        const search = document.getElementById("finance-search")?.value?.toLowerCase().trim() || "";
        const records = state.filteredTransactions.filter(tx => !search || JSON.stringify(tx).toLowerCase().includes(search));

        if (!records.length) {
            tbody.innerHTML = `<tr><td colspan="7" class="finance-empty">No financial records found.</td></tr>`;
            setText("finance-record-count", "0 transactions");
            return;
        }

        tbody.innerHTML = "";
        let runningBalance = 0;
        records.slice().sort((a, b) => getDate(a).localeCompare(getDate(b))).forEach((tx) => {
            const amount = getAmount(tx);
            const type = getType(tx);
            const income = type === "income" ? amount : 0;
            const expense = type === "expense" ? amount : 0;
            runningBalance += income - expense;

            const ref = escapeHtml(tx.transactionCode || tx.utrNumber || tx.id || "-");
            const desc = escapeHtml(tx.description || tx.purpose || tx.notes || "-");
            
            const row = document.createElement("tr");
            row.innerHTML = `<td>${formatDate(getDate(tx))}</td><td>${ref}</td><td>${desc}</td><td><span class="${type === "income" ? "finance-type-income" : "finance-type-expense"}">${type.toUpperCase()}</span></td><td>${income ? money(income) : "-"}</td><td>${expense ? money(expense) : "-"}</td><td>${money(runningBalance)}</td>`;
            tbody.appendChild(row);
        });
        setText("finance-record-count", `${records.length} transaction${records.length === 1 ? "" : "s"}`);
    }

    function populateYears() {
        const select = document.getElementById("finance-year");
        if (!select) return;
        const years = new Set();
        state.transactions.forEach((tx) => {
            const yr = tx.financialYear || (getDate(tx) || "").substring(0, 4);
            if (yr && yr.length === 4) years.add(yr);
        });
        Array.from(years).sort((a, b) => Number(b) - Number(a)).forEach((year) => {
            const option = document.createElement("option"); option.value = year; option.textContent = year; select.appendChild(option);
        });
    }

    function setTransactions(data) { state.transactions = Array.isArray(data) ? data : []; populateYears(); calculateFinancialData(); }
    function setText(id, value) { const el = document.getElementById(id); if (el) el.textContent = value; }
    function escapeHtml(value) { const div = document.createElement("div"); div.textContent = String(value ?? ""); return div.innerHTML; }

    document.addEventListener("DOMContentLoaded", () => {
        document.getElementById("finance-calculate-btn")?.addEventListener("click", calculateFinancialData);
        document.getElementById("finance-reset-btn")?.addEventListener("click", () => {
            document.getElementById("finance-start-date").value = "";
            document.getElementById("finance-end-date").value = "";
            document.getElementById("finance-year").value = "all";
            document.getElementById("finance-type").value = "all";
            document.getElementById("finance-search").value = "";
            calculateFinancialData();
        });
        document.getElementById("finance-search")?.addEventListener("input", renderTransactions);
        window.setFinancialTransactions = setTransactions;
    });
})();
