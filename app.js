let scores = { 1: 0, 2: 0 }, turn = 1, totalInnings = 1, highRuns = { 1: { hr1: 0, hr2: 0, hr3: 0 }, 2: { hr1: 0, hr2: 0, hr3: 0 } }, currentRun = 0;
let matchSecs = 0, currentShot, isPaused = true, shotClockPaused = false, timerInt, equalizingTurn = false;
let isPenaltyMode = false, penaltyScores = { 1: 0, 2: 0 }, penaltyRound = 1;
let historyStack = [];
const MAX_HISTORY = 50;
let prevRenderedScores = { s1: null, s2: null };
let flapCleanupTimers = {};
let flapSoundTimers = {};
let config = { mode: 'standard', standardTarget: 40, maxInnings: 45, targets: { 1: 40, 2: 40 }, shotActive: true, viewMode: 'flap' };
const VIEW_MODE_KEY = 'bilardo_gorunum_modu';
const CIRC = 471.2;
const isTouchDevice = ('ontouchstart' in window) || (navigator.maxTouchPoints > 0);
let lastActionTime = 0;
let turnLockUntil = 0;

const CORE_PLAYERS = ['TANER', 'ONUR', 'SÜHEYL', 'MELİH', 'ESİN', 'MİSAFİR'];
const EXTRA_PLAYERS_KEY = 'bilardo_ekstra_oyuncular_v1';
const STATS_STORAGE_KEY = 'bilardo_oyuncu_stats_v1';
const LAST_MATCH_STATS_KEY = 'bilardo_son_mac_yedek_v1';
const ACTIVE_MATCH_KEY = 'bilardo_aktif_mac_v1';
const MATCH_HISTORY_KEY = 'bilardo_mac_gecmisi_v1';
const MUTE_KEY = 'bilardo_sessiz_v1';
let extraPlayers = [];
let playerStats = {};
let matchHistory = [];
let isMuted = false;
let matchStatsRecorded = false;

function normalizePlayerName(name) {
    if (!name) return '';
    const trimmed = String(name).trim().replace(/\s+/g, ' ');
    try {
        return trimmed.toLocaleUpperCase('tr-TR');
    } catch (e) {
        return trimmed.toUpperCase();
    }
}
function isCorePlayer(name) {
    return CORE_PLAYERS.indexOf(name) !== -1;
}
function getRegisteredPlayers() {
    return CORE_PLAYERS.concat(extraPlayers);
}
function createEmptyProfile() {
    return { matches: 0, wins: 0, losses: 0, totalPoints: 0, totalInnings: 0, bestAvg: 0, hr1: 0, hr2: 0, hr3: 0, h2h: {} };
}
function loadExtraPlayers() {
    try {
        const raw = localStorage.getItem(EXTRA_PLAYERS_KEY);
        const parsed = raw ? JSON.parse(raw) : [];
        if (Array.isArray(parsed)) {
            extraPlayers = parsed.map(normalizePlayerName).filter((n, idx, arr) => n && !isCorePlayer(n) && arr.indexOf(n) === idx);
        } else {
            extraPlayers = [];
        }
    } catch (e) {
        extraPlayers = [];
    }
}
function saveExtraPlayers() {
    try { localStorage.setItem(EXTRA_PLAYERS_KEY, JSON.stringify(extraPlayers)); } catch (e) {}
}
function ensureAllProfiles() {
    const roster = getRegisteredPlayers();
    roster.forEach(name => {
        if (!playerStats[name] || typeof playerStats[name] !== 'object') {
            playerStats[name] = createEmptyProfile();
        } else {
            const p = playerStats[name];
            if (typeof p.matches !== 'number') p.matches = 0;
            if (typeof p.wins !== 'number') p.wins = 0;
            if (typeof p.losses !== 'number') p.losses = 0;
            if (typeof p.totalPoints !== 'number') p.totalPoints = 0;
            if (typeof p.totalInnings !== 'number') p.totalInnings = 0;
            if (typeof p.bestAvg !== 'number') p.bestAvg = 0;
            if (typeof p.hr1 !== 'number') p.hr1 = (typeof p.maxHr === 'number') ? p.maxHr : 0;
            if (typeof p.hr2 !== 'number') p.hr2 = 0;
            if (typeof p.hr3 !== 'number') p.hr3 = 0;
            if (!p.h2h || typeof p.h2h !== 'object') p.h2h = {};
        }
    });
}
function insertProfileHighRun(prof, runVal) {
    if (!runVal || runVal <= 0) return;
    if (runVal > prof.hr1) {
        prof.hr3 = prof.hr2;
        prof.hr2 = prof.hr1;
        prof.hr1 = runVal;
    } else if (runVal > prof.hr2) {
        prof.hr3 = prof.hr2;
        prof.hr2 = runVal;
    } else if (runVal > prof.hr3) {
        prof.hr3 = runVal;
    }
}
function loadPlayerStats() {
    try {
        const raw = localStorage.getItem(STATS_STORAGE_KEY);
        const parsed = raw ? JSON.parse(raw) : {};
        playerStats = (parsed && typeof parsed === 'object') ? parsed : {};
    } catch (e) {
        playerStats = {};
    }
    ensureAllProfiles();
}
function savePlayerStats() {
    try { localStorage.setItem(STATS_STORAGE_KEY, JSON.stringify(playerStats)); } catch (e) {}
}
function loadMatchHistory() {
    try {
        const raw = localStorage.getItem(MATCH_HISTORY_KEY);
        const parsed = raw ? JSON.parse(raw) : [];
        matchHistory = Array.isArray(parsed) ? parsed.slice(0, 30) : [];
    } catch (e) {
        matchHistory = [];
    }
}
function saveMatchHistory() {
    try { localStorage.setItem(MATCH_HISTORY_KEY, JSON.stringify(matchHistory.slice(0, 30))); } catch (e) {}
}
function loadMuteState() {
    try {
        isMuted = localStorage.getItem(MUTE_KEY) === '1';
    } catch (e) {
        isMuted = false;
    }
    updateMuteBtn();
}
function updateMuteBtn() {
    const btn = document.getElementById('btn-mute');
    if (btn) btn.innerText = isMuted ? '🔇' : '🔊';
}
function toggleMute(e) {
    if (!guardTouchEvent(e)) return;
    isMuted = !isMuted;
    try { localStorage.setItem(MUTE_KEY, isMuted ? '1' : '0'); } catch (err) {}
    if (isMuted && 'speechSynthesis' in window) {
        try { window.speechSynthesis.cancel(); } catch (err) {}
    }
    updateMuteBtn();
}
function saveActiveMatch() {
    if (isPaused) return;
    try {
        const payload = {
            scores: scores,
            turn: turn,
            totalInnings: totalInnings,
            highRuns: highRuns,
            currentRun: currentRun,
            matchSecs: matchSecs,
            currentShot: currentShot,
            shotClockPaused: shotClockPaused,
            config: config,
            equalizingTurn: equalizingTurn,
            isPenaltyMode: isPenaltyMode,
            penaltyScores: penaltyScores,
            penaltyRound: penaltyRound,
            historyStack: historyStack
        };
        localStorage.setItem(ACTIVE_MATCH_KEY, JSON.stringify(payload));
    } catch (e) {}
}
function clearActiveMatch() {
    try { localStorage.removeItem(ACTIVE_MATCH_KEY); } catch (e) {}
    const btn = document.getElementById('btn-resume-match');
    if (btn) btn.style.display = 'none';
}
function checkActiveMatchButton() {
    const btn = document.getElementById('btn-resume-match');
    if (!btn) return;
    let hasSaved = false;
    try {
        const raw = localStorage.getItem(ACTIVE_MATCH_KEY);
        if (raw) {
            const parsed = JSON.parse(raw);
            if (parsed && parsed.scores && parsed.config) hasSaved = true;
        }
    } catch (e) {}
    btn.style.display = hasSaved ? 'block' : 'none';
}
function resumeActiveMatch() {
    let saved = null;
    try {
        const raw = localStorage.getItem(ACTIVE_MATCH_KEY);
        if (raw) saved = JSON.parse(raw);
    } catch (e) {}
    if (!saved || !saved.scores || !saved.config) {
        checkActiveMatchButton();
        return;
    }
    scores = saved.scores;
    turn = saved.turn || 1;
    totalInnings = saved.totalInnings || 1;
    highRuns = saved.highRuns || { 1: { hr1: 0, hr2: 0, hr3: 0 }, 2: { hr1: 0, hr2: 0, hr3: 0 } };
    currentRun = saved.currentRun || 0;
    matchSecs = saved.matchSecs || 0;
    config = saved.config;
    currentShot = typeof saved.currentShot === 'number' ? saved.currentShot : (config.shotTime || 30);
    shotClockPaused = !!saved.shotClockPaused;
    equalizingTurn = !!saved.equalizingTurn;
    isPenaltyMode = !!saved.isPenaltyMode;
    penaltyScores = saved.penaltyScores || { 1: 0, 2: 0 };
    penaltyRound = saved.penaltyRound || 1;
    historyStack = Array.isArray(saved.historyStack) ? saved.historyStack : [];
    matchStatsRecorded = false;
    prevRenderedScores = { s1: null, s2: null };

    document.getElementById('disp-name1').innerText = config.name1 || 'BEYAZ';
    document.getElementById('disp-name2').innerText = config.name2 || 'SARI';
    document.getElementById('target-badge-1').innerText = `(${config.targets[1]})`;
    document.getElementById('target-badge-2').innerText = `(${config.targets[2]})`;
    document.getElementById('clock-box').style.visibility = config.shotActive ? 'visible' : 'hidden';

    const m = Math.floor(matchSecs / 60), s = matchSecs % 60;
    document.getElementById('timer-display').innerText = `${m.toString().padStart(2,'0')}:${s.toString().padStart(2,'0')}`;

    document.getElementById('settings-overlay').style.display = 'none';
    isPaused = false;
    unlockSpeechEngine();
    if (audioCtx.state === 'suspended') audioCtx.resume();
    if (timerInt) clearInterval(timerInt);
    timerInt = setInterval(tick, 1000);
    updatePauseBtn();
    updateUI();
}
function escapeAttr(str) {
    return String(str).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/'/g, '&#39;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
function renderPlayerChips() {
    const n1 = normalizePlayerName(document.getElementById('name1').value);
    const n2 = normalizePlayerName(document.getElementById('name2').value);
    const fixedFive = CORE_PLAYERS.slice(0, 5);
    const ordered = fixedFive.concat(extraPlayers).concat(['MİSAFİR']);

    [1, 2].forEach(side => {
        const container = document.getElementById('chips-' + side);
        if (!container) return;
        const myName = side === 1 ? n1 : n2;
        const otherName = side === 1 ? n2 : n1;
        container.innerHTML = '';

        ordered.forEach(name => {
            const isExtra = !isCorePlayer(name);
            const isGuest = name === 'MİSAFİR';
            const isActive = myName === name;
            const isLocked = otherName === name;

            const chip = document.createElement('button');
            chip.type = 'button';
            chip.className = 'player-chip' + (isGuest ? ' guest-chip' : '') + (isActive ? ' active' : '') + (isLocked ? ' locked' : '');
            chip.disabled = isLocked;
            chip.onclick = function() { selectPlayerChip(side, name); };

            const labelSpan = document.createElement('span');
            labelSpan.innerText = name;
            chip.appendChild(labelSpan);

            if (isExtra) {
                const delSpan = document.createElement('span');
                delSpan.className = 'chip-del';
                delSpan.innerText = '×';
                delSpan.title = name + ' sil';
                delSpan.onclick = function(ev) { deleteExtraPlayer(name, ev); };
                chip.appendChild(delSpan);
            }
            container.appendChild(chip);
        });

        const addBtn = document.createElement('button');
        addBtn.type = 'button';
        addBtn.className = 'player-chip add-chip';
        addBtn.innerText = '+ OYUNCU EKLE';
        addBtn.onclick = function() { addExtraPlayer(side); };
        container.appendChild(addBtn);
    });
}
function selectPlayerChip(side, playerName) {
    const otherSide = side === 1 ? 2 : 1;
    const otherName = normalizePlayerName(document.getElementById('name' + otherSide).value);
    if (otherName === playerName) return;
    document.getElementById('name' + side).value = playerName;
    renderPlayerChips();
}
function onNameInputChange() {
    renderPlayerChips();
}
let pendingPromptSide = null;
let statsStatusTimer = null;

function checkTwoTapConfirm(btn, confirmLabel) {
    if (!btn) return true;
    if (btn.getAttribute('data-armed') === '1') {
        clearTimeout(parseInt(btn.getAttribute('data-arm-timer'), 10));
        btn.removeAttribute('data-armed');
        btn.classList.remove('armed-confirm');
        const orig = btn.getAttribute('data-orig-text');
        if (orig !== null) btn.innerText = orig;
        return true;
    }
    btn.setAttribute('data-orig-text', btn.innerText);
    btn.setAttribute('data-armed', '1');
    btn.innerText = confirmLabel || 'Emin misin? Tekrar Dokun';
    btn.classList.add('armed-confirm');
    const timerId = setTimeout(function() {
        btn.removeAttribute('data-armed');
        btn.classList.remove('armed-confirm');
        const orig = btn.getAttribute('data-orig-text');
        if (orig !== null) btn.innerText = orig;
    }, 3500);
    btn.setAttribute('data-arm-timer', String(timerId));
    return false;
}
function addExtraPlayer(side) {
    pendingPromptSide = (side === 1 || side === 2) ? side : null;
    const overlay = document.getElementById('custom-prompt-overlay');
    const input = document.getElementById('custom-prompt-input');
    const errEl = document.getElementById('custom-prompt-error');
    if (!overlay || !input) return;
    if (errEl) errEl.innerText = '';
    input.value = '';
    overlay.style.display = 'flex';
    setTimeout(function() {
        try { input.focus(); } catch (e) {}
    }, 50);
}
function closeCustomPrompt() {
    const overlay = document.getElementById('custom-prompt-overlay');
    if (overlay) overlay.style.display = 'none';
    pendingPromptSide = null;
}
function submitCustomPrompt() {
    const input = document.getElementById('custom-prompt-input');
    const errEl = document.getElementById('custom-prompt-error');
    if (!input) return;
    const clean = normalizePlayerName(input.value);
    if (!clean) {
        if (errEl) errEl.innerText = 'Lütfen bir oyuncu adı girin.';
        return;
    }
    if (isCorePlayer(clean) || extraPlayers.indexOf(clean) !== -1) {
        if (errEl) errEl.innerText = 'Bu oyuncu zaten kayıtlı!';
        return;
    }
    extraPlayers.push(clean);
    saveExtraPlayers();
    ensureAllProfiles();
    savePlayerStats();
    if (pendingPromptSide === 1 || pendingPromptSide === 2) {
        const otherSide = pendingPromptSide === 1 ? 2 : 1;
        const otherName = normalizePlayerName(document.getElementById('name' + otherSide).value);
        if (otherName !== clean) {
            document.getElementById('name' + pendingPromptSide).value = clean;
        }
    }
    closeCustomPrompt();
    renderPlayerChips();
}
(function bindCustomPromptEnter() {
    const input = document.getElementById('custom-prompt-input');
    if (input) {
        input.addEventListener('keydown', function(ev) {
            if (ev.key === 'Enter' || ev.keyCode === 13) {
                ev.preventDefault();
                submitCustomPrompt();
            } else if (ev.key === 'Escape' || ev.keyCode === 27) {
                closeCustomPrompt();
            }
        });
    }
})();
function deleteExtraPlayer(name, e) {
    if (e && e.stopPropagation) e.stopPropagation();
    if (isCorePlayer(name)) return;
    const btn = (e && (e.currentTarget || e.target)) ? (e.currentTarget || e.target) : null;
    const label = (btn && btn.classList && btn.classList.contains('chip-del')) ? 'Sil?' : 'Emin misin? Tekrar Dokun';
    if (!checkTwoTapConfirm(btn, label)) return;
    extraPlayers = extraPlayers.filter(p => p !== name);
    saveExtraPlayers();
    const inp1 = document.getElementById('name1');
    const inp2 = document.getElementById('name2');
    if (inp1 && normalizePlayerName(inp1.value) === name) inp1.value = 'BEYAZ';
    if (inp2 && normalizePlayerName(inp2.value) === name) inp2.value = 'SARI';
    renderPlayerChips();
    const statsOverlay = document.getElementById('stats-overlay');
    if (statsOverlay && statsOverlay.style.display === 'flex') {
        renderStatsOverlay();
    }
}
loadExtraPlayers();
loadPlayerStats();
loadMatchHistory();
loadMuteState();
checkActiveMatchButton();
renderPlayerChips();

function guardTouchEvent(e) {
    if (e) {
        if (e.stopPropagation) e.stopPropagation();
        if (isTouchDevice && e.type === 'click') {
            return false;
        }
        if (e.type === 'touchend' || e.type === 'touchstart') {
            if (e.preventDefault) e.preventDefault();
        }
    }
    const now = Date.now();
    if (now - lastActionTime < 450) return false;
    lastActionTime = now;
    return true;
}

// Ses Sentezleyici
const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
function playBeep(freq, dur) {
    if (isMuted) return;
    if (audioCtx.state === 'suspended') audioCtx.resume();
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(freq, audioCtx.currentTime);
    gain.gain.setValueAtTime(0.1, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + dur);
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.start();
    osc.stop(audioCtx.currentTime + dur);
}
function playFlapSound() {
    if (isMuted) return;
    if (audioCtx.state === 'suspended') audioCtx.resume();
    const now = audioCtx.currentTime;
    // Mekanik plastik/metal yaprak çarpma sesi (filtreli kısa darbe + tok gövde vuruşu)
    const bufferSize = Math.floor(audioCtx.sampleRate * 0.03);
    const buffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
        data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (bufferSize * 0.28));
    }
    const noise = audioCtx.createBufferSource();
    noise.buffer = buffer;
    const filter = audioCtx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(1850, now);
    filter.Q.setValueAtTime(1.6, now);
    const noiseGain = audioCtx.createGain();
    noiseGain.gain.setValueAtTime(0.28, now);
    noiseGain.gain.exponentialRampToValueAtTime(0.01, now + 0.03);
    noise.connect(filter);
    filter.connect(noiseGain);
    noiseGain.connect(audioCtx.destination);
    noise.start(now);

    const thud = audioCtx.createOscillator();
    const thudGain = audioCtx.createGain();
    thud.type = 'triangle';
    thud.frequency.setValueAtTime(220, now);
    thud.frequency.exponentialRampToValueAtTime(80, now + 0.032);
    thudGain.gain.setValueAtTime(0.18, now);
    thudGain.gain.exponentialRampToValueAtTime(0.005, now + 0.032);
    thud.connect(thudGain);
    thudGain.connect(audioCtx.destination);
    thud.start(now);
    thud.stop(now + 0.035);
}

// Türkçe Sesli Anons Sistemi (Web Speech API)
let trVoice = null;
let speechUnlocked = false;
let speakTimer = null;
function loadTurkishVoice() {
    if (!('speechSynthesis' in window)) return;
    const voices = window.speechSynthesis.getVoices();
    if (!voices || voices.length === 0) return;
    const trVoices = voices.filter(v => v.lang === 'tr-TR' || (v.lang && v.lang.toLowerCase().indexOf('tr') === 0));
    if (trVoices.length === 0) {
        trVoice = null;
        return;
    }
    const matchName = (v, kw) => v.name && v.name.toLowerCase().indexOf(kw) !== -1;
    trVoice =
        trVoices.find(v => matchName(v, 'google türkçe') || matchName(v, 'google turkce') || matchName(v, 'natural') || matchName(v, 'online')) ||
        trVoices.find(v => matchName(v, 'emel') || matchName(v, 'seda')) ||
        trVoices.find(v => matchName(v, 'yelda')) ||
        trVoices.find(v => matchName(v, 'female') || matchName(v, 'kadın') || matchName(v, 'kadin')) ||
        trVoices.find(v => v.lang === 'tr-TR') ||
        trVoices[0];
}
if ('speechSynthesis' in window) {
    loadTurkishVoice();
    if (typeof window.speechSynthesis.onvoiceschanged !== 'undefined') {
        window.speechSynthesis.onvoiceschanged = loadTurkishVoice;
    }
    if (typeof window.speechSynthesis.addEventListener === 'function') {
        window.speechSynthesis.addEventListener('voiceschanged', loadTurkishVoice);
    }
}
function unlockSpeechEngine() {
    if (speechUnlocked) return;
    speechUnlocked = true;
    if (audioCtx) {
        if (audioCtx.state === 'suspended') {
            audioCtx.resume();
        }
        try {
            const silentBuf = audioCtx.createBuffer(1, 1, 22050);
            const src = audioCtx.createBufferSource();
            src.buffer = silentBuf;
            src.connect(audioCtx.destination);
            src.start(0);
        } catch (e) {}
    }
    if ('speechSynthesis' in window) {
        try {
            loadTurkishVoice();
            const silent = new SpeechSynthesisUtterance('');
            silent.lang = 'tr-TR';
            silent.volume = 0;
            silent.rate = 0.78;
            silent.pitch = 1.12;
            if (trVoice) silent.voice = trVoice;
            window.speechSynthesis.speak(silent);
        } catch (e) {}
    }
}
document.addEventListener('touchstart', unlockSpeechEngine, { once: true });
document.addEventListener('click', unlockSpeechEngine, { once: true });

function numberToTurkish(n) {
    const num = Math.max(0, Math.floor(n));
    const ones = ['sıfır', 'bir', 'iki', 'üç', 'dört', 'beş', 'altı', 'yedi', 'sekiz', 'dokuz'];
    const tens = ['', 'on', 'yirmi', 'otuz', 'kırk', 'elli', 'altmış', 'yetmiş', 'seksen', 'doksan'];
    if (num < 10) return ones[num];
    if (num < 100) {
        const t = tens[Math.floor(num / 10)];
        const o = num % 10;
        return o === 0 ? t : `${t} ${ones[o]}`;
    }
    if (num < 1000) {
        const h = Math.floor(num / 100);
        const rem = num % 100;
        const hStr = h === 1 ? 'yüz' : `${ones[h]} yüz`;
        return rem === 0 ? hStr : `${hStr} ${numberToTurkish(rem)}`;
    }
    return String(num);
}
function speakText(text, opts) {
    if (isMuted) return;
    if (!('speechSynthesis' in window) || !text) return;
    try {
        if (!trVoice) loadTurkishVoice();
        window.speechSynthesis.cancel();
        if (typeof window.speechSynthesis.resume === 'function') {
            window.speechSynthesis.resume();
        }
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.lang = 'tr-TR';
        utterance.volume = 1.0;
        utterance.rate = (opts && opts.rate) ? opts.rate : 0.78;
        utterance.pitch = (opts && opts.pitch) ? opts.pitch : 1.12;
        if (trVoice) utterance.voice = trVoice;
        window.speechSynthesis.speak(utterance);
    } catch (e) {}
}
function getRunPitch(run) {
    return Math.min(1.22, 1.12 + Math.max(0, run - 1) * 0.015);
}

function resetMatch(btn) {
    if (!checkTwoTapConfirm(btn, 'Emin misin? Tekrar Dokun')) return;
    clearActiveMatch();
    location.reload();
}
function setMode(m) {
    config.mode = m;
    document.getElementById('btn-mode-standard').classList.toggle('active', m === 'standard');
    document.getElementById('btn-mode-handicap').classList.toggle('active', m === 'handicap');
    document.getElementById('standard-options').style.display = m === 'standard' ? 'flex' : 'none';
    document.getElementById('handicap-options').style.display = m === 'handicap' ? 'flex' : 'none';
}
function setStandardTarget(val) {
    config.standardTarget = val;
    document.getElementById('btn-target-30').classList.toggle('active', val === 30);
    document.getElementById('btn-target-40').classList.toggle('active', val === 40);
}
function setViewMode(mode) {
    config.viewMode = mode === 'segment' ? 'segment' : 'flap';
    try { localStorage.setItem(VIEW_MODE_KEY, config.viewMode); } catch (e) {}
    const flapBtn = document.getElementById('btn-view-flap');
    const segBtn = document.getElementById('btn-view-seg');
    if (flapBtn) flapBtn.classList.toggle('active', config.viewMode === 'flap');
    if (segBtn) segBtn.classList.toggle('active', config.viewMode === 'segment');
    prevRenderedScores = { s1: null, s2: null };
}
(function initViewMode() {
    let saved = 'flap';
    try { saved = localStorage.getItem(VIEW_MODE_KEY) || 'flap'; } catch (e) {}
    setViewMode(saved);
})();
function toggleShotActive() {
    config.shotActive = !config.shotActive;
    const btn = document.getElementById('btn-shot-toggle');
    btn.innerText = config.shotActive ? "SÜRE SİSTEMİ: AKTİF" : "SÜRE SİSTEMİ: PASİF";
    btn.classList.toggle('active', config.shotActive);
    document.getElementById('shot-settings-area').style.opacity = config.shotActive ? "1" : "0.3";
}
function startMatch() {
    config.name1 = document.getElementById('name1').value || "BEYAZ";
    config.name2 = document.getElementById('name2').value || "SARI";
    if (config.mode === 'standard') {
        config.targets = { 1: config.standardTarget, 2: config.standardTarget };
        config.maxInnings = 45;
    } else {
        const t1 = parseInt(document.getElementById('input-target-1').value);
        const t2 = parseInt(document.getElementById('input-target-2').value);
        config.targets = { 1: t1 > 0 ? t1 : 40, 2: t2 > 0 ? t2 : 30 };
        config.maxInnings = null;
    }
    equalizingTurn = false;
    isPenaltyMode = false;
    matchStatsRecorded = false;
    penaltyScores = { 1: 0, 2: 0 };
    penaltyRound = 1;
    historyStack = [];
    prevRenderedScores = { s1: null, s2: null };
    config.shotTime = parseInt(document.getElementById('input-shot-time').value);
    config.toCount = parseInt(document.getElementById('input-to-count').value);
    config.warnTime = parseInt(document.getElementById('input-warn-time').value) || 10;
    config.timeouts = { 1: config.toCount, 2: config.toCount };
    
    document.getElementById('disp-name1').innerText = config.name1;
    document.getElementById('disp-name2').innerText = config.name2;
    document.getElementById('target-badge-1').innerText = `(${config.targets[1]})`;
    document.getElementById('target-badge-2').innerText = `(${config.targets[2]})`;
    document.getElementById('clock-box').style.visibility = config.shotActive ? "visible" : "hidden";
    
    currentShot = config.shotTime;
    document.getElementById('settings-overlay').style.display = 'none';
    isPaused = false;
    unlockSpeechEngine();
    if(audioCtx.state === 'suspended') audioCtx.resume();
    timerInt = setInterval(tick, 1000);
    updateUI();
    saveActiveMatch();
}
function tick() {
    if (isPaused) return;
    matchSecs++;
    let m = Math.floor(matchSecs / 60), s = matchSecs % 60;
    document.getElementById('timer-display').innerText = `${m.toString().padStart(2,'0')}:${s.toString().padStart(2,'0')}`;
    
    if (config.shotActive && !shotClockPaused && currentShot > 0) {
        currentShot--; 
        updateClockUI();
        
        if (currentShot === 15) {
            speakText('Son, ... on beş saniye', { pitch: 1.16, rate: 0.78 });
        }
        
        // SESLİ UYARI MANTIĞI
        if (currentShot <= config.warnTime && currentShot > 0) {
            playBeep(880, 0.1); // Kısa Bip
        }
        
        if (currentShot === 0) {
            turnLockUntil = Date.now() + 500;
            playBeep(440, 0.5); // Süre bitti kalın bip
            changeTurn(false, false);
            return;
        }
    }
    saveActiveMatch();
}
function commitRun(p, run) {
    if (run <= 0) return;
    if (run > highRuns[p].hr1) {
        highRuns[p].hr3 = highRuns[p].hr2;
        highRuns[p].hr2 = highRuns[p].hr1;
        highRuns[p].hr1 = run;
    } else if (run > highRuns[p].hr2) {
        highRuns[p].hr3 = highRuns[p].hr2;
        highRuns[p].hr2 = run;
    } else if (run > highRuns[p].hr3) {
        highRuns[p].hr3 = run;
    }
}
function getPlayerHighRuns(p) {
    let { hr1, hr2, hr3 } = highRuns[p];
    if (!isPenaltyMode && p === turn && currentRun > 0) {
        if (currentRun > hr1) {
            hr3 = hr2;
            hr2 = hr1;
            hr1 = currentRun;
        } else if (currentRun > hr2) {
            hr3 = hr2;
            hr2 = currentRun;
        } else if (currentRun > hr3) {
            hr3 = currentRun;
        }
    }
    return { hr1, hr2, hr3 };
}
function saveSnapshot() {
    historyStack.push({
        scores: { 1: scores[1], 2: scores[2] },
        turn: turn,
        totalInnings: totalInnings,
        highRuns: {
            1: { hr1: highRuns[1].hr1, hr2: highRuns[1].hr2, hr3: highRuns[1].hr3 },
            2: { hr1: highRuns[2].hr1, hr2: highRuns[2].hr2, hr3: highRuns[2].hr3 }
        },
        currentRun: currentRun,
        timeouts: { 1: config.timeouts[1], 2: config.timeouts[2] },
        equalizingTurn: equalizingTurn,
        isPenaltyMode: isPenaltyMode,
        penaltyScores: { 1: penaltyScores[1], 2: penaltyScores[2] },
        penaltyRound: penaltyRound
    });
    if (historyStack.length > MAX_HISTORY) historyStack.shift();
}
function undoLastAction(e) {
    if (!guardTouchEvent(e)) return;
    if (historyStack.length === 0 || isPaused) return;
    const prev = historyStack.pop();
    const hadScoreDecrease = isPenaltyMode && prev.isPenaltyMode
        ? (prev.penaltyScores[prev.turn] < penaltyScores[prev.turn] || (prev.turn === turn && prev.currentRun < currentRun))
        : (prev.scores[prev.turn] < scores[prev.turn] || (prev.turn === turn && prev.currentRun < currentRun));
    scores = prev.scores;
    turn = prev.turn;
    totalInnings = prev.totalInnings;
    highRuns = prev.highRuns;
    currentRun = prev.currentRun;
    config.timeouts = prev.timeouts;
    equalizingTurn = prev.equalizingTurn;
    isPenaltyMode = prev.isPenaltyMode;
    penaltyScores = prev.penaltyScores;
    penaltyRound = prev.penaltyRound;
    currentShot = config.shotTime;
    shotClockPaused = false;
    updatePauseBtn();
    updateUI();
    saveActiveMatch();
    if (hadScoreDecrease) {
        speakText(`Eksi bir, ... ${numberToTurkish(currentRun)}`, { pitch: 1.08, rate: 0.76 });
    }
}
function startPenaltyMode() {
    commitRun(turn, currentRun);
    isPenaltyMode = true;
    equalizingTurn = false;
    penaltyScores = { 1: 0, 2: 0 };
    penaltyRound = 1;
    turn = 1;
    currentRun = 0;
    currentShot = config.shotTime;
    shotClockPaused = false;
    updatePauseBtn();
    speakText('Maç berabere, ... Penaltı atışları başlıyor', { pitch: 1.16, rate: 0.78 });
    updateUI();
}
function handleInteraction(p, type, e) {
    if (!guardTouchEvent(e)) return;
    if (isPaused) return;
    if (type === 'add') {
        if (turn !== p) changeTurn();
        else {
            if (Date.now() < turnLockUntil) return;
            saveSnapshot();
            if (isPenaltyMode) {
                penaltyScores[p]++; currentRun++;
                currentShot = config.shotTime;
                if (config.shotActive) { shotClockPaused = false; updatePauseBtn(); }
                if (turn === 2 && penaltyScores[2] > penaltyScores[1]) {
                    updateUI();
                    speakText('Oyun bitti, ... Sarı kazandı', { pitch: 1.18, rate: 0.78 });
                    endMatch(`TEBRİKLER ${config.name2} KAZANDI! (PENALTI)`, 2);
                    return;
                }
                speakText(numberToTurkish(currentRun), { pitch: getRunPitch(currentRun), rate: 0.78 });
            } else {
                scores[p]++; currentRun++;
                currentShot = config.shotTime;
                if (config.shotActive) { shotClockPaused = false; updatePauseBtn(); }
                const endedOrSwitched = checkMatchEnd();
                if (!endedOrSwitched) {
                    speakText(numberToTurkish(currentRun), { pitch: getRunPitch(currentRun), rate: 0.78 });
                }
            }
        }
    } else if (type === 'sub' && turn === p && currentRun > 0) {
        if (Date.now() < turnLockUntil) return;
        saveSnapshot();
        if (isPenaltyMode) penaltyScores[p]--;
        else scores[p]--;
        currentRun--;
        speakText(`Eksi bir, ... ${numberToTurkish(currentRun)}`, { pitch: 1.08, rate: 0.76 });
    }
    updateUI();
    saveActiveMatch();
}
function checkMatchEnd() {
    if (scores[turn] >= config.targets[turn]) {
        if (turn === 1) {
            equalizingTurn = true;
            changeTurn(true, true);
            return true;
        } else {
            if (equalizingTurn) {
                startPenaltyMode();
            } else {
                endMatch(`TEBRİKLER ${config.name2} KAZANDI!`, 2);
            }
            return true;
        }
    }
    return false;
}
function endMatch(msg, winnerSide) {
    if (!isPenaltyMode) commitRun(turn, currentRun);
    currentRun = 0;
    isPaused = true; clearInterval(timerInt);
    document.getElementById('winner-text').innerText = msg;
    const tbody = document.getElementById('end-stats-body');
    const p1HR = getPlayerHighRuns(1);
    const p2HR = getPlayerHighRuns(2);
    tbody.innerHTML = `
        <tr><td>${escapeAttr(config.name1)}</td><td>${scores[1]}</td><td>${p1HR.hr1}</td><td>${p1HR.hr2}</td><td>${p1HR.hr3}</td><td>${(scores[1]/totalInnings).toFixed(3)}</td></tr>
        <tr><td>${escapeAttr(config.name2)}</td><td>${scores[2]}</td><td>${p2HR.hr1}</td><td>${p2HR.hr2}</td><td>${p2HR.hr3}</td><td>${(scores[2]/(turn===1?Math.max(1,totalInnings-1):totalInnings)).toFixed(3)}</td></tr>
    `;
    recordCompletedMatchStats(winnerSide, p1HR, p2HR);
    clearActiveMatch();
    document.getElementById('end-match-overlay').style.display = 'flex';
}
function changeTurn(skipSnapshot = false, isEqualizingStart = false, e = null) {
    if (e && !guardTouchEvent(e)) return;
    if (!skipSnapshot) saveSnapshot();
    if (isPenaltyMode) {
        if (turn === 1) {
            speakText(`Beyaz, ... ${numberToTurkish(currentRun)}`, { pitch: 1.10, rate: 0.76 });
            turn = 2;
            turnLockUntil = Date.now() + 500;
            currentRun = 0; currentShot = config.shotTime;
            shotClockPaused = false;
            updatePauseBtn();
            updateUI();
            return;
        } else {
            if (penaltyScores[2] > penaltyScores[1]) {
                speakText('Oyun bitti, ... Sarı kazandı', { pitch: 1.18, rate: 0.78 });
                endMatch(`TEBRİKLER ${config.name2} KAZANDI! (PENALTI)`, 2);
            } else if (penaltyScores[2] < penaltyScores[1]) {
                speakText('Oyun bitti, ... Beyaz kazandı', { pitch: 1.18, rate: 0.78 });
                endMatch(`TEBRİKLER ${config.name1} KAZANDI! (PENALTI)`, 1);
            } else {
                penaltyRound++;
                penaltyScores = { 1: 0, 2: 0 };
                turn = 1;
                turnLockUntil = Date.now() + 500;
                currentRun = 0; currentShot = config.shotTime;
                shotClockPaused = false;
                updatePauseBtn();
                speakText(penaltyRound === 2 ? 'Penaltıda eşitlik, ... İkinci penaltı başlıyor' : 'Penaltıda eşitlik, ... Yeni penaltı turu başlıyor', { pitch: 1.14, rate: 0.78 });
                updateUI();
            }
            return;
        }
    }
    if (isEqualizingStart) {
        speakText('Sarı, ... masa açma hakkı', { pitch: 1.15, rate: 0.78 });
    } else {
        const outgoingColor = turn === 1 ? 'Beyaz' : 'Sarı';
        speakText(`${outgoingColor}, ... ${numberToTurkish(currentRun)}`, { pitch: 1.10, rate: 0.76 });
    }
    if (turn === 2) {
        if (equalizingTurn) {
            endMatch(`TEBRİKLER ${config.name1} KAZANDI!`, 1);
            return;
        }
        if (config.maxInnings !== null && totalInnings >= config.maxInnings) {
            if (scores[1] > scores[2]) endMatch(`TEBRİKLER ${config.name1} KAZANDI!`, 1);
            else if (scores[2] > scores[1]) endMatch(`TEBRİKLER ${config.name2} KAZANDI!`, 2);
            else startPenaltyMode();
            return;
        }
    }
    commitRun(turn, currentRun);
    turn = (turn === 1) ? 2 : 1;
    turnLockUntil = Date.now() + 500;
    if (turn === 1) totalInnings++;
    currentRun = 0; currentShot = config.shotTime;
    shotClockPaused = false;
    updatePauseBtn();
    updateUI();
    saveActiveMatch();
}
function buildFlapDigitHTML(oldD, newD, isFlipping) {
    if (!isFlipping) {
        return `<span class="flap-digit"><span class="flap-sizer">${newD}</span><span class="flap-top"><span class="flap-num">${newD}</span></span><span class="flap-bottom"><span class="flap-num">${newD}</span></span></span>`;
    }
    return `<span class="flap-digit flipping"><span class="flap-sizer">${newD}</span><span class="flap-top"><span class="flap-num">${newD}</span></span><span class="flap-bottom"><span class="flap-num">${oldD}</span><span class="flap-shadow"></span></span><span class="flap-leaf"><span class="flap-leaf-front"><span class="flap-num">${oldD}</span></span><span class="flap-leaf-back"><span class="flap-num">${newD}</span></span></span></span>`;
}
function renderSplitFlap(elId, value) {
    const container = document.getElementById(elId);
    const prevVal = prevRenderedScores[elId];
    if (prevVal === value && container.children.length > 0) return;

    if (flapCleanupTimers[elId]) {
        clearTimeout(flapCleanupTimers[elId]);
        flapCleanupTimers[elId] = null;
    }
    if (flapSoundTimers[elId]) {
        flapSoundTimers[elId].forEach(t => clearTimeout(t));
        flapSoundTimers[elId] = [];
    }

    const newDigits = String(value).split('');
    if (prevVal === null) {
        container.innerHTML = newDigits.map(d => buildFlapDigitHTML(d, d, false)).join('');
        prevRenderedScores[elId] = value;
        return;
    }

    const oldDigits = String(prevVal).split('');
    const sameLen = oldDigits.length === newDigits.length;
    let flipCount = 0;

    container.innerHTML = '';
    void container.offsetWidth;

    container.innerHTML = newDigits.map((newD, idx) => {
        const oldD = sameLen ? oldDigits[idx] : (oldDigits[idx] !== undefined ? oldDigits[idx] : '0');
        const changed = !sameLen || oldD !== newD;
        if (changed) flipCount++;
        return buildFlapDigitHTML(oldD, newD, changed);
    }).join('');

    flapSoundTimers[elId] = [];
    for (let k = 0; k < flipCount; k++) {
        flapSoundTimers[elId].push(setTimeout(playFlapSound, 380 + k * 30));
    }

    prevRenderedScores[elId] = value;
    if (flipCount > 0) {
        flapCleanupTimers[elId] = setTimeout(() => {
            container.innerHTML = newDigits.map(d => buildFlapDigitHTML(d, d, false)).join('');
            flapCleanupTimers[elId] = null;
        }, 720);
    }
}
const SEG_MAP = {
    '0': [1,1,1,1,1,1,0],
    '1': [0,1,1,0,0,0,0],
    '2': [1,1,0,1,1,0,1],
    '3': [1,1,1,1,0,0,1],
    '4': [0,1,1,0,0,1,1],
    '5': [1,0,1,1,0,1,1],
    '6': [1,0,1,1,1,1,1],
    '7': [1,1,1,0,0,0,0],
    '8': [1,1,1,1,1,1,1],
    '9': [1,1,1,1,0,1,1]
};
const SEG_PATHS = [
    'M 20 12 L 80 12 L 72 26 L 28 26 Z',
    'M 83 15 L 91 23 L 88 83 L 76 77 Z',
    'M 88 97 L 91 157 L 83 165 L 76 103 Z',
    'M 28 154 L 72 154 L 80 168 L 20 168 Z',
    'M 12 97 L 24 103 L 17 165 L 9 157 Z',
    'M 17 15 L 24 77 L 12 83 L 9 23 Z',
    'M 18 90 L 26 82 L 74 82 L 82 90 L 74 98 L 26 98 Z'
];
function buildSegDigitHTML(digitChar, isSmall) {
    const segs = SEG_MAP[digitChar] || SEG_MAP['0'];
    const paths = SEG_PATHS.map((d, i) => `<path class="seg-vane${segs[i] ? ' on' : ''}" d="${d}"></path>`).join('');
    return `<span class="seg-digit${isSmall ? ' seg-sm' : ''}"><svg class="seg-svg" viewBox="0 0 100 180">${paths}</svg></span>`;
}
function renderSevenSegment(elId, value, isSmall) {
    const container = document.getElementById(elId);
    const digits = String(value).split('');
    const existing = container.querySelectorAll('.seg-digit');
    const prevVal = prevRenderedScores[elId];

    if (existing.length === digits.length) {
        let changedDigits = 0;
        const oldDigits = prevVal !== null && prevVal !== undefined ? String(prevVal).split('') : null;
        digits.forEach((d, idx) => {
            if (!oldDigits || oldDigits[idx] !== d) changedDigits++;
            const segs = SEG_MAP[d] || SEG_MAP['0'];
            const vanes = existing[idx].querySelectorAll('.seg-vane');
            for (let i = 0; i < 7; i++) {
                if (vanes[i]) vanes[i].classList.toggle('on', !!segs[i]);
            }
        });
        if (!isSmall && prevVal !== null && prevVal !== undefined && changedDigits > 0) {
            for (let k = 0; k < changedDigits; k++) {
                setTimeout(playFlapSound, 90 + k * 30);
            }
        }
    } else {
        container.innerHTML = digits.map(d => buildSegDigitHTML(d, isSmall)).join('');
        if (!isSmall && prevVal !== null && prevVal !== undefined) {
            for (let k = 0; k < digits.length; k++) {
                setTimeout(playFlapSound, 90 + k * 30);
            }
        }
    }
    if (!isSmall) prevRenderedScores[elId] = value;
}
function updateUI() {
    const s1Val = isPenaltyMode ? penaltyScores[1] : scores[1];
    const s2Val = isPenaltyMode ? penaltyScores[2] : scores[2];
    if (config.viewMode === 'segment') {
        renderSevenSegment('s1', s1Val, false);
        renderSevenSegment('s2', s2Val, false);
        renderSevenSegment('run-display', currentRun, true);
        renderSevenSegment('inn-display', totalInnings, true);
    } else {
        renderSplitFlap('s1', s1Val);
        renderSplitFlap('s2', s2Val);
        document.getElementById('run-display').innerText = currentRun;
        document.getElementById('inn-display').innerText = totalInnings;
    }
    const penaltyBadge = document.getElementById('penalty-badge');
    if (penaltyBadge) {
        penaltyBadge.style.display = isPenaltyMode ? 'inline-block' : 'none';
        if (isPenaltyMode) penaltyBadge.innerText = penaltyRound > 1 ? `PENALTI - TUR ${penaltyRound}` : 'PENALTI';
    }
    const p1HR = getPlayerHighRuns(1);
    const p2HR = getPlayerHighRuns(2);
    document.getElementById('hr1-1').innerText = p1HR.hr1;
    document.getElementById('hr1-2').innerText = p1HR.hr2;
    document.getElementById('hr1-3').innerText = p1HR.hr3;
    document.getElementById('hr2-1').innerText = p2HR.hr1;
    document.getElementById('hr2-2').innerText = p2HR.hr2;
    document.getElementById('hr2-3').innerText = p2HR.hr3;
    document.getElementById('avg1').innerText = (scores[1] / totalInnings).toFixed(3);
    let p2Inn = (turn === 1) ? Math.max(1, totalInnings - 1) : totalInnings;
    document.getElementById('avg2').innerText = (scores[2] / p2Inn).toFixed(3);
    document.getElementById('card-1').className = `score-card p1-card ${turn===1?'active-turn':'inactive-turn'}`;
    document.getElementById('card-2').className = `score-card p2-card ${turn===2?'active-turn':'inactive-turn'}`;
    [1,2].forEach(p => {
        const dots = document.getElementById(`to-dots-${p}`); dots.innerHTML = '';
        for(let i=0; i<config.toCount; i++) {
            let d = document.createElement('div');
            d.className = 'timeout-dot' + (i < config.timeouts[p] ? ' active' : '');
            dots.appendChild(d);
        }
    });
    const undoBtn = document.getElementById('btn-undo');
    if (undoBtn) undoBtn.disabled = historyStack.length === 0;
    updateClockUI();
}
function updateClockUI() {
    const sd = document.getElementById('shot-clock-display');
    const circle = document.getElementById('progress-circle');
    sd.innerText = currentShot;
    const ratio = config.shotTime > 0 ? Math.min(1, Math.max(0, currentShot / config.shotTime)) : 0;
    let offset = CIRC - ratio * CIRC;
    circle.style.strokeDashoffset = offset;
    circle.style.stroke = currentShot <= config.warnTime ? "red" : "#00ff00";
}
function togglePause(e) {
    if (!guardTouchEvent(e)) return;
    shotClockPaused = !shotClockPaused;
    updatePauseBtn();
}
function updatePauseBtn() {
    const btn = document.getElementById('shot-clock-pause-btn');
    btn.innerText = shotClockPaused ? "DEVAM" : "PAUSE";
    btn.style.background = shotClockPaused ? "rgba(255,0,0,0.3)" : "rgba(0,0,0,0.5)";
}
function useTimeout(p, e) {
    if (!guardTouchEvent(e)) return;
    if (turn === p && config.timeouts[p] > 0) {
        saveSnapshot();
        config.timeouts[p]--; currentShot += 30;
        updateUI();
        saveActiveMatch();
    }
}

function recordCompletedMatchStats(winnerSide, p1HR, p2HR) {
    if (matchStatsRecorded) return;
    matchStatsRecorded = true;
    loadPlayerStats();
    loadMatchHistory();
    const roster = getRegisteredPlayers();
    const p1Name = normalizePlayerName(config.name1);
    const p2Name = normalizePlayerName(config.name2);
    const p1Reg = roster.indexOf(p1Name) !== -1;
    const p2Reg = roster.indexOf(p2Name) !== -1;

    try {
        localStorage.setItem(LAST_MATCH_STATS_KEY, JSON.stringify({
            stats: playerStats,
            history: matchHistory
        }));
    } catch (e) {}

    const p1Innings = Math.max(1, totalInnings);
    const p2Innings = (turn === 1) ? Math.max(1, totalInnings - 1) : Math.max(1, totalInnings);
    const p1Points = scores[1];
    const p2Points = scores[2];
    const p1Won = winnerSide === 1;
    const p2Won = winnerSide === 2;

    if (p1Reg || p2Reg) {
        function applyPlayerResult(myName, oppName, oppReg, points, innings, hrObj, won) {
            const prof = playerStats[myName] || createEmptyProfile();
            const matchAvg = innings > 0 ? (points / innings) : 0;
            prof.matches += 1;
            if (won) prof.wins += 1;
            else prof.losses += 1;
            prof.totalPoints += points;
            prof.totalInnings += innings;
            if (matchAvg > prof.bestAvg) prof.bestAvg = matchAvg;
            if (hrObj) {
                insertProfileHighRun(prof, hrObj.hr1);
                insertProfileHighRun(prof, hrObj.hr2);
                insertProfileHighRun(prof, hrObj.hr3);
            }
            if (oppReg && oppName !== myName) {
                if (!prof.h2h[oppName] || typeof prof.h2h[oppName] !== 'object') {
                    prof.h2h[oppName] = { matches: 0, wins: 0, losses: 0, points: 0, innings: 0 };
                }
                prof.h2h[oppName].matches += 1;
                if (won) prof.h2h[oppName].wins += 1;
                else prof.h2h[oppName].losses += 1;
                prof.h2h[oppName].points += points;
                prof.h2h[oppName].innings += innings;
            }
            playerStats[myName] = prof;
        }

        if (p1Reg) applyPlayerResult(p1Name, p2Name, p2Reg, p1Points, p1Innings, p1HR, p1Won);
        if (p2Reg) applyPlayerResult(p2Name, p1Name, p1Reg, p2Points, p2Innings, p2HR, p2Won);
        savePlayerStats();
    }

    matchHistory.unshift({
        date: new Date().toISOString(),
        p1: p1Name || 'BEYAZ',
        p2: p2Name || 'SARI',
        s1: p1Points,
        s2: p2Points,
        innings: p1Innings,
        winner: winnerSide === 1 ? (p1Name || 'BEYAZ') : (p2Name || 'SARI')
    });
    if (matchHistory.length > 30) matchHistory = matchHistory.slice(0, 30);
    saveMatchHistory();
}
function openStatsOverlay() {
    loadExtraPlayers();
    loadPlayerStats();
    loadMatchHistory();
    hideRestoreBox();
    renderStatsOverlay();
    document.getElementById('stats-overlay').style.display = 'flex';
}
function closeStatsOverlay() {
    document.getElementById('stats-overlay').style.display = 'none';
}
function getSortedLeagueRows() {
    ensureAllProfiles();
    const roster = getRegisteredPlayers();
    const rows = roster.map(name => {
        const p = playerStats[name] || createEmptyProfile();
        const avg = p.totalInnings > 0 ? (p.totalPoints / p.totalInnings) : 0;
        const winPct = p.matches > 0 ? Math.round((p.wins / p.matches) * 100) : 0;
        return { name, p, avg, winPct };
    });
    rows.sort((a, b) => {
        if (b.avg !== a.avg) return b.avg - a.avg;
        if (b.p.wins !== a.p.wins) return b.p.wins - a.p.wins;
        return b.p.matches - a.p.matches;
    });
    return rows;
}
function renderRecentMatches() {
    const container = document.getElementById('recent-matches-list');
    if (!container) return;
    container.innerHTML = '';
    if (!matchHistory || matchHistory.length === 0) {
        const empty = document.createElement('div');
        empty.className = 'h2h-avg-line';
        empty.style.padding = '8px 0';
        empty.innerText = 'Henüz tamamlanmış maç kaydı yok.';
        container.appendChild(empty);
        return;
    }
    matchHistory.forEach(item => {
        const row = document.createElement('div');
        row.className = 'recent-match-row';

        let dateStr = '';
        try {
            const d = new Date(item.date);
            if (!isNaN(d.getTime())) {
                dateStr = String(d.getDate()).padStart(2, '0') + '.' + String(d.getMonth() + 1).padStart(2, '0') + ' ' + String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
            }
        } catch (e) {}

        const dSpan = document.createElement('span');
        dSpan.className = 'recent-match-date';
        dSpan.innerText = dateStr;

        const sSpan = document.createElement('span');
        sSpan.className = 'recent-match-score';
        sSpan.innerText = item.p1 + ' ' + item.s1 + ' - ' + item.s2 + ' ' + item.p2;

        const iSpan = document.createElement('span');
        iSpan.className = 'recent-match-inn';
        iSpan.innerText = item.innings + ' El (' + item.winner + ')';

        row.appendChild(dSpan);
        row.appendChild(sSpan);
        row.appendChild(iSpan);
        container.appendChild(row);
    });
}
function renderStatsOverlay() {
    const roster = getRegisteredPlayers();
    const rows = getSortedLeagueRows();

    const tbody = document.getElementById('league-stats-body');
    if (tbody) {
        tbody.innerHTML = '';
        rows.forEach(item => {
            const tr = document.createElement('tr');
            const isExtra = !isCorePlayer(item.name);
            const tdName = document.createElement('td');
            tdName.style.fontWeight = 'bold';
            tdName.style.color = item.name === 'MİSAFİR' ? '#ffd54f' : '#ffffff';
            tdName.innerText = item.name;
            tr.appendChild(tdName);

            const vals = [
                item.p.matches,
                item.p.wins,
                item.p.losses,
                item.winPct + '%',
                item.avg.toFixed(3),
                item.p.bestAvg.toFixed(3),
                item.p.hr1,
                item.p.hr2,
                item.p.hr3
            ];
            vals.forEach(v => {
                const td = document.createElement('td');
                td.innerText = v;
                tr.appendChild(td);
            });

            const tdAction = document.createElement('td');
            if (isExtra) {
                const delBtn = document.createElement('button');
                delBtn.type = 'button';
                delBtn.className = 'btn-row-del';
                delBtn.innerText = 'Sil';
                delBtn.onclick = function(ev) { deleteExtraPlayer(item.name, ev); };
                tdAction.appendChild(delBtn);
            }
            tr.appendChild(tdAction);
            tbody.appendChild(tr);
        });
    }

    const selA = document.getElementById('h2h-player-a');
    const selB = document.getElementById('h2h-player-b');
    if (selA && selB) {
        const prevA = selA.value;
        const prevB = selB.value;
        selA.innerHTML = '';
        selB.innerHTML = '';
        roster.forEach(name => {
            const optA = document.createElement('option');
            optA.value = name;
            optA.innerText = name;
            selA.appendChild(optA);

            const optB = document.createElement('option');
            optB.value = name;
            optB.innerText = name;
            selB.appendChild(optB);
        });
        selA.value = roster.indexOf(prevA) !== -1 ? prevA : (roster[0] || '');
        if (roster.indexOf(prevB) !== -1 && prevB !== selA.value) {
            selB.value = prevB;
        } else {
            selB.value = roster[1] || roster[0] || '';
        }
        renderH2H();
    }

    const undoStatBtn = document.getElementById('btn-undo-match-stat');
    if (undoStatBtn) {
        let hasBackup = false;
        try { hasBackup = !!localStorage.getItem(LAST_MATCH_STATS_KEY); } catch (e) {}
        undoStatBtn.disabled = !hasBackup;
    }
    renderRecentMatches();
}
function renderH2H() {
    const selA = document.getElementById('h2h-player-a');
    const selB = document.getElementById('h2h-player-b');
    const box = document.getElementById('h2h-result');
    if (!selA || !selB || !box) return;
    const a = selA.value;
    const b = selB.value;
    if (!a || !b || a === b) {
        box.innerHTML = '<div class="h2h-avg-line">Karşılaştırmak için iki farklı oyuncu seçin.</div>';
        return;
    }
    const profA = playerStats[a] || createEmptyProfile();
    const profB = playerStats[b] || createEmptyProfile();
    const recA = (profA.h2h && profA.h2h[b]) ? profA.h2h[b] : { matches: 0, wins: 0, losses: 0, points: 0, innings: 0 };
    const recB = (profB.h2h && profB.h2h[a]) ? profB.h2h[a] : { matches: 0, wins: 0, losses: 0, points: 0, innings: 0 };
    const avgA = recA.innings > 0 ? (recA.points / recA.innings).toFixed(3) : '0.000';
    const avgB = recB.innings > 0 ? (recB.points / recB.innings).toFixed(3) : '0.000';
    const safeA = escapeAttr(a);
    const safeB = escapeAttr(b);
    box.innerHTML = `
        <div class="h2h-score-big">${safeA} ${recA.wins} - ${recB.wins} ${safeB}</div>
        <div class="h2h-avg-line">Toplam Maç: ${recA.matches} &nbsp;|&nbsp; ${safeA} Ort: ${avgA} &nbsp;|&nbsp; ${safeB} Ort: ${avgB}</div>
    `;
}
function setStatsStatus(msg) {
    const el = document.getElementById('stats-status-msg');
    if (!el) return;
    if (statsStatusTimer) {
        clearTimeout(statsStatusTimer);
        statsStatusTimer = null;
    }
    el.innerText = msg || '';
    if (msg) {
        statsStatusTimer = setTimeout(function() {
            el.innerText = '';
            statsStatusTimer = null;
        }, 4000);
    }
}
function undoLastMatchStats(btn) {
    let raw = null;
    try { raw = localStorage.getItem(LAST_MATCH_STATS_KEY); } catch (e) {}
    if (!raw) {
        setStatsStatus('Geri alınacak son maç kaydı bulunamadı.');
        return;
    }
    if (!checkTwoTapConfirm(btn, 'Emin misin? Tekrar Dokun')) return;
    try {
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === 'object') {
            if (parsed.stats && typeof parsed.stats === 'object') {
                playerStats = parsed.stats;
                if (Array.isArray(parsed.history)) {
                    matchHistory = parsed.history.slice(0, 30);
                    saveMatchHistory();
                }
            } else {
                playerStats = parsed;
            }
            ensureAllProfiles();
            savePlayerStats();
            try { localStorage.removeItem(LAST_MATCH_STATS_KEY); } catch (err) {}
            renderStatsOverlay();
            setStatsStatus('Son maç kaydı geri alındı.');
        }
    } catch (e) {
        setStatsStatus('Son maç yedeği okunamadı.');
    }
}
function copyStatsBackup() {
    loadExtraPlayers();
    loadPlayerStats();
    loadMatchHistory();
    const payload = JSON.stringify({
        version: 2,
        extraPlayers: extraPlayers,
        playerStats: playerStats,
        matchHistory: matchHistory
    }, null, 2);

    const ta = document.getElementById('backup-json-input');
    if (ta) ta.value = payload;

    if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
        navigator.clipboard.writeText(payload).then(() => {
            setStatsStatus('Yedek JSON panoya kopyalandı.');
        }).catch(() => {
            if (fallbackCopyText(payload)) {
                setStatsStatus('Yedek JSON panoya kopyalandı.');
            } else {
                showRestoreBox();
                if (ta) { ta.focus(); ta.select(); }
                setStatsStatus('Otomatik kopyalama desteklenmiyor; kutudan kopyalayabilirsiniz.');
            }
        });
        return;
    }
    if (fallbackCopyText(payload)) {
        setStatsStatus('Yedek JSON panoya kopyalandı.');
    } else {
        showRestoreBox();
        if (ta) {
            ta.focus();
            ta.select();
        }
        setStatsStatus('Otomatik kopyalama desteklenmiyor; kutudan kopyalayabilirsiniz.');
    }
}
function fallbackCopyText(text) {
    try {
        const tmp = document.createElement('textarea');
        tmp.value = text;
        tmp.setAttribute('readonly', '');
        tmp.style.position = 'fixed';
        tmp.style.top = '0';
        tmp.style.left = '-9999px';
        document.body.appendChild(tmp);
        tmp.focus();
        tmp.select();
        tmp.setSelectionRange(0, text.length);
        const ok = document.execCommand('copy');
        document.body.removeChild(tmp);
        return !!ok;
    } catch (e) {
        return false;
    }
}
function showRestoreBox() {
    const box = document.getElementById('backup-restore-box');
    if (box) box.style.display = 'block';
}
function hideRestoreBox() {
    const box = document.getElementById('backup-restore-box');
    if (box) box.style.display = 'none';
}
function confirmRestoreBackup() {
    const ta = document.getElementById('backup-json-input');
    if (!ta || !ta.value.trim()) {
        setStatsStatus('Lütfen JSON yedek metnini yapıştırın.');
        return;
    }
    try {
        const parsed = JSON.parse(ta.value.trim());
        if (!parsed || typeof parsed !== 'object' || !parsed.playerStats || typeof parsed.playerStats !== 'object') {
            setStatsStatus('Geçersiz yedek formatı.');
            return;
        }
        if (Array.isArray(parsed.extraPlayers)) {
            extraPlayers = parsed.extraPlayers.map(normalizePlayerName).filter((n, idx, arr) => n && !isCorePlayer(n) && arr.indexOf(n) === idx);
            saveExtraPlayers();
        }
        playerStats = parsed.playerStats;
        ensureAllProfiles();
        savePlayerStats();
        if (Array.isArray(parsed.matchHistory)) {
            matchHistory = parsed.matchHistory.slice(0, 30);
            saveMatchHistory();
        }
        try { localStorage.removeItem(LAST_MATCH_STATS_KEY); } catch (e) {}
        hideRestoreBox();
        renderPlayerChips();
        renderStatsOverlay();
        setStatsStatus('Yedek başarıyla yüklendi.');
    } catch (e) {
        setStatsStatus('JSON okunamadı. Geçerli bir yedek metni girin.');
    }
}
function resetAllStats(btn) {
    if (!checkTwoTapConfirm(btn, 'Emin misin? Tekrar Dokun')) return;
    playerStats = {};
    ensureAllProfiles();
    savePlayerStats();
    matchHistory = [];
    saveMatchHistory();
    try { localStorage.removeItem(LAST_MATCH_STATS_KEY); } catch (e) {}
    renderStatsOverlay();
    setStatsStatus('Tüm istatistikler sıfırlandı.');
}
function exportLeagueCSV() {
    const rows = getSortedLeagueRows();
    const lines = ['OYUNCU;O;G;M;%;GENEL AVG;BEST AVG;HR1;HR2;HR3'];
    rows.forEach(item => {
        const safeName = '"' + String(item.name).replace(/"/g, '""') + '"';
        lines.push([
            safeName,
            item.p.matches,
            item.p.wins,
            item.p.losses,
            item.winPct + '%',
            item.avg.toFixed(3),
            item.p.bestAvg.toFixed(3),
            item.p.hr1,
            item.p.hr2,
            item.p.hr3
        ].join(';'));
    });
    const csvContent = '\uFEFF' + lines.join('\r\n');
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);

    if (!isIOS) {
        try {
            const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = 'bilardo_puan_durumu.csv';
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            setTimeout(function() { URL.revokeObjectURL(url); }, 1000);
            setStatsStatus('CSV dosyası indirildi.');
            return;
        } catch (e) {}
    }

    const ta = document.getElementById('backup-json-input');
    if (ta) ta.value = csvContent;
    if (fallbackCopyText(csvContent)) {
        setStatsStatus('CSV panoya kopyalandı.');
    } else {
        showRestoreBox();
        if (ta) {
            ta.focus();
            ta.select();
        }
        setStatsStatus('CSV hazır; aşağıdaki kutudan kopyalayabilirsiniz.');
    }
}
