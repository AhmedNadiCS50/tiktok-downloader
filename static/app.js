/**
 * Ahmed Nadi Media Downloader — v6.0.0
 * Full feature JS: Ripple, Dark Mode, Stats, History, Batch, QR, Progress Bar, Stream URL, Social Theme, PWA
 */

// ── PWA: Service Worker Registration ─────────────────────────────────────────
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js', { scope: '/' })
      .then((reg) => {
        console.log('[PWA] Service Worker registered, scope:', reg.scope);
        // Check for updates periodically
        setInterval(() => reg.update(), 60 * 60 * 1000); // every hour
      })
      .catch((err) => console.warn('[PWA] SW registration failed:', err));
  });
}

// ── PWA: Install Prompt ──────────────────────────────────────────────────────
let deferredInstallPrompt = null;
let pwaInstallShownOnce = false;

window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredInstallPrompt = e;
  console.log('[PWA] Install prompt captured');

  // Show the header install button
  const headerBtn = document.getElementById('pwaInstallHeaderBtn');
  if (headerBtn) headerBtn.classList.add('show');

  // Show the banner (only once per session, and not if user dismissed before)
  const dismissed = sessionStorage.getItem('pwa_banner_dismissed');
  if (!dismissed && !pwaInstallShownOnce) {
    pwaInstallShownOnce = true;
    setTimeout(() => {
      const banner = document.getElementById('pwaInstallBanner');
      if (banner) banner.classList.add('show');
    }, 3000); // Show after 3 seconds
  }
});

window.addEventListener('appinstalled', () => {
  console.log('[PWA] App installed successfully');
  deferredInstallPrompt = null;
  const banner = document.getElementById('pwaInstallBanner');
  if (banner) banner.classList.remove('show');
  const headerBtn = document.getElementById('pwaInstallHeaderBtn');
  if (headerBtn) headerBtn.classList.remove('show');
  // Show success toast
  setTimeout(() => {
    if (typeof showToast === 'function') showToast('تم تثبيت التطبيق بنجاح! 🎉', '📲');
  }, 500);
});

// PWA install trigger function
function triggerPWAInstall() {
  if (!deferredInstallPrompt) {
    // Fallback: show manual instructions
    if (typeof showToast === 'function') {
      const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
      if (isIOS) {
        showToast('اضغط على زر المشاركة ثم "إضافة إلى الشاشة الرئيسية"', 'ℹ️', 5000);
      } else {
        showToast('افتح القائمة في المتصفح واختر "تثبيت التطبيق"', 'ℹ️', 5000);
      }
    }
    return;
  }
  deferredInstallPrompt.prompt();
  deferredInstallPrompt.userChoice.then((choice) => {
    console.log('[PWA] User choice:', choice.outcome);
    deferredInstallPrompt = null;
  });
}

// ── URL Extractor (Cleans text shared from TikTok / IG) ───────────────────────
function extractUrlFromText(text) {
  if (!text) return '';
  const match = text.match(/(https?:\/\/[^\s]+)/i);
  return match ? match[0] : text.trim();
}

// ── Quick Notification Action (Method 3) ──────────────────────────────────────
async function setupQuickNotification() {
  if (!('Notification' in window)) {
    if (typeof showToast === 'function') showToast('المتصفح لا يدعم الإشعارات في هذا الوضع', '⚠️');
    return;
  }
  if (Notification.permission === 'denied') {
    if (typeof showToast === 'function') showToast('يرجى تمكين إذن الإشعارات من إعدادات المتصفح', '⚠️');
    return;
  }

  let permission = Notification.permission;
  if (permission !== 'granted') {
    permission = await Notification.requestPermission();
  }
  if (permission !== 'granted') {
    if (typeof showToast === 'function') showToast('تم رفض إذن الإشعارات', 'ℹ️');
    return;
  }

  if ('serviceWorker' in navigator) {
    try {
      const reg = await navigator.serviceWorker.ready;
      reg.showNotification('Ahmed Nadi Downloader ⚡', {
        body: 'انسخ رابط تيك توك ثم اضغط هنا لتحميله فوراً بدون فتح المتصفح',
        icon: '/static/icons/icon-192.png',
        badge: '/static/icons/icon-192.png',
        tag: 'quick-download-notification',
        renotify: false,
        silent: true,
        requireInteraction: true,
        actions: [
          { action: 'paste_download', title: '📥 تحميل الرابط المنسوخ' },
          { action: 'open_app', title: '📱 فتح التطبيق' }
        ]
      });
      if (typeof showToast === 'function') showToast('تم تفعيل إشعار التنزيل السريع بشريط المهام! 🔔', '✅');
    } catch (err) {
      console.warn('Quick notification setup failed:', err);
      if (typeof showToast === 'function') showToast('تعذر إظهار الإشعار', '⚠️');
    }
  }
}

// ── Handle Web Share Target & Auto-Paste on Launch ────────────────────────────
function handleSharedLinkOrAction() {
  const params = new URLSearchParams(window.location.search);
  const sharedUrl = params.get('url');
  const sharedText = params.get('text');
  const sharedTitle = params.get('title');
  const action = params.get('action');

  let candidate = '';
  if (sharedUrl) candidate = extractUrlFromText(sharedUrl);
  else if (sharedText) candidate = extractUrlFromText(sharedText);
  else if (sharedTitle) candidate = extractUrlFromText(sharedTitle);

  if (candidate && candidate.startsWith('http')) {
    const input = document.getElementById('urlInput');
    const clear = document.getElementById('clearBtn');
    const form = document.getElementById('analyzeForm');
    if (input) {
      input.value = candidate;
      if (clear) clear.classList.remove('hidden');
      if (typeof showToast === 'function') showToast('تم استلام الرابط بنجاح، جاري التحليل... 🚀', '📲');
      setTimeout(() => {
        if (form) form.dispatchEvent(new Event('submit'));
      }, 500);
      window.history.replaceState({}, document.title, '/');
    }
  } else if (action === 'paste_auto' || action === 'paste') {
    setTimeout(async () => {
      try {
        const text = await navigator.clipboard.readText();
        const extracted = extractUrlFromText(text);
        if (extracted && extracted.startsWith('http')) {
          const input = document.getElementById('urlInput');
          const clear = document.getElementById('clearBtn');
          const form = document.getElementById('analyzeForm');
          if (input) {
            input.value = extracted;
            if (clear) clear.classList.remove('hidden');
            if (typeof showToast === 'function') showToast('تم التقاط الرابط من الحافظة! ⚡', '📥');
            if (form) form.dispatchEvent(new Event('submit'));
          }
        } else {
          if (typeof showToast === 'function') showToast('الصق الرابط في المربع للتحميل', '📋');
        }
      } catch (err) {
        if (typeof showToast === 'function') showToast('الصق الرابط في المربع للتحميل', '📋');
      }
      window.history.replaceState({}, document.title, '/');
    }, 400);
  }
}

// Bind PWA install & Quick Notify buttons (after DOM ready)
document.addEventListener('DOMContentLoaded', () => {
  const headerBtn = document.getElementById('pwaInstallHeaderBtn');
  const bannerAccept = document.getElementById('pwaInstallBannerAccept');
  const bannerDismiss = document.getElementById('pwaInstallBannerDismiss');
  const bannerClose = document.getElementById('pwaInstallBannerClose');
  const banner = document.getElementById('pwaInstallBanner');

  const quickNotifyBtn = document.getElementById('quickNotifyBtn');
  const quickNotifyBannerBtn = document.getElementById('enableQuickNotifyBannerBtn');

  if (headerBtn) headerBtn.addEventListener('click', triggerPWAInstall);
  if (bannerAccept) bannerAccept.addEventListener('click', triggerPWAInstall);

  if (quickNotifyBtn) quickNotifyBtn.addEventListener('click', setupQuickNotification);
  if (quickNotifyBannerBtn) quickNotifyBannerBtn.addEventListener('click', setupQuickNotification);

  const dismissBanner = () => {
    if (banner) banner.classList.remove('show');
    sessionStorage.setItem('pwa_banner_dismissed', '1');
  };
  if (bannerDismiss) bannerDismiss.addEventListener('click', dismissBanner);
  if (bannerClose) bannerClose.addEventListener('click', dismissBanner);

  // Check for shared links or quick action clicks
  handleSharedLinkOrAction();
});

// ── API Base ─────────────────────────────────────────────────────────────────
const getApiBase = () => {
  const { protocol, port } = window.location;
  if (protocol === 'file:' || (port && port !== '8000')) return 'http://127.0.0.1:8000';
  return '';
};
const API_BASE = getApiBase();

// ── State ────────────────────────────────────────────────────────────────────
let currentVideoData = null;
let currentStreamUrl = null;
let isAnalyzing = false;

// ── DOM ───────────────────────────────────────────────────────────────────────
const analyzeForm        = document.getElementById('analyzeForm');
const urlInput           = document.getElementById('urlInput');
const clearBtn           = document.getElementById('clearBtn');
const pasteBtn           = document.getElementById('pasteBtn');
const submitBtn          = document.getElementById('submitBtn');
const btnText            = document.getElementById('btnText');
const btnSpinner         = document.getElementById('btnSpinner');
const errorBox           = document.getElementById('errorBox');
const errorTitle         = document.getElementById('errorTitle');
const errorMessage       = document.getElementById('errorMessage');
const previewCard        = document.getElementById('previewCard');
const skeletonCard       = document.getElementById('skeletonCard');
const videoThumbnail     = document.getElementById('videoThumbnail');
const videoDuration      = document.getElementById('videoDuration');
const videoTitle         = document.getElementById('videoTitle');
const videoUploader      = document.getElementById('videoUploader');
const authorAvatarChar   = document.getElementById('authorAvatarChar');
const videoResolution    = document.getElementById('videoResolution');
const videoFps           = document.getElementById('videoFps');
const qualitySelectorGroup = document.getElementById('qualitySelectorGroup');
const qualitySelect      = document.getElementById('qualitySelect');
const audioQualitySelect = document.getElementById('audioQualitySelect');
const audioQualityLabel  = document.getElementById('audioQualityLabel');
const downloadVideoBtn   = document.getElementById('downloadVideoBtn');
const downloadAudioBtn   = document.getElementById('downloadAudioBtn');
const downloadStatus     = document.getElementById('downloadStatus');
const downloadStatusText = document.getElementById('downloadStatusText');
const progressBarInner   = document.getElementById('progressBarInner');
const progressPercent    = document.getElementById('progressPercent');
const platformBadge      = document.getElementById('platformBadge');
const miniPlayerWrapper  = document.getElementById('miniPlayerWrapper');
const miniPlayerEl       = document.getElementById('miniPlayer');
const miniPlayerSrc      = document.getElementById('miniPlayerSrc');
const copyLinkBtn        = document.getElementById('copyLinkBtn');
const qrCodeBtn          = document.getElementById('qrCodeBtn');
const qrModal            = document.getElementById('qrModal');
const qrBox              = document.getElementById('qrBox');
const qrModalClose       = document.getElementById('qrModalClose');
const toast              = document.getElementById('toast');
const toastMessage       = document.getElementById('toastMessage');
const toastIcon          = document.getElementById('toastIcon');
const statsCounter       = document.getElementById('statsCounter');
const downloadsCounter   = document.getElementById('downloadsCounter');
const historyPanel       = document.getElementById('historyPanel');
const historyPanelWrapper= document.getElementById('historyPanelWrapper');
const historyBadge       = document.getElementById('historyBadge');
const historyToggleBtn   = document.getElementById('historyToggleBtn');
const clearHistoryBtn    = document.getElementById('clearHistoryBtn');
const batchToggleBtn     = document.getElementById('batchToggleBtn');
const batchPanel         = document.getElementById('batchPanel');
const batchChevron       = document.getElementById('batchChevron');
const batchUrls          = document.getElementById('batchUrls');
const batchFormat        = document.getElementById('batchFormat');
const batchStartBtn      = document.getElementById('batchStartBtn');
const batchQueueList     = document.getElementById('batchQueueList');
const themeToggle        = document.getElementById('themeToggle');
const themeIconDark      = document.getElementById('themeIconDark');
const themeIconLight     = document.getElementById('themeIconLight');


// ── RIPPLE EFFECT ─────────────────────────────────────────────────────────────
function createRipple(e) {
  const btn = e.currentTarget;
  const circle = document.createElement('span');
  const diameter = Math.max(btn.clientWidth, btn.clientHeight);
  const radius = diameter / 2;
  const rect = btn.getBoundingClientRect();
  circle.classList.add('ripple');
  circle.style.width = circle.style.height = `${diameter}px`;
  circle.style.left = `${e.clientX - rect.left - radius}px`;
  circle.style.top  = `${e.clientY - rect.top  - radius}px`;
  btn.querySelector('.ripple')?.remove();
  btn.appendChild(circle);
}
document.querySelectorAll('.ripple-container').forEach(el => el.addEventListener('click', createRipple));


// ── CURSOR PARTICLE EFFECT (Desktop only) ─────────────────────────────────────
const isTouchDevice = ('ontouchstart' in window) || (navigator.maxTouchPoints > 0);
let lastParticleTime = 0;

if (!isTouchDevice) {
  document.addEventListener('mousemove', (e) => {
    const now = performance.now();
    if (now - lastParticleTime < 50) return;
    lastParticleTime = now;
    const p = document.createElement('div');
    p.classList.add('cursor-particle');
    p.style.left = e.clientX + 'px';
    p.style.top  = e.clientY + 'px';
    p.style.background = `radial-gradient(circle, ${Math.random() > 0.5 ? '#00F2FE' : '#FE2C55'}, transparent)`;
    document.body.appendChild(p);
    setTimeout(() => p.remove(), 800);
  }, { passive: true });
}


// ── DARK / LIGHT MODE ─────────────────────────────────────────────────────────
function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  localStorage.setItem('ah_theme', theme);
  if (theme === 'light') {
    themeIconDark.classList.add('hidden');
    themeIconLight.classList.remove('hidden');
  } else {
    themeIconDark.classList.remove('hidden');
    themeIconLight.classList.add('hidden');
  }
}
const savedTheme = localStorage.getItem('ah_theme') || 'dark';
applyTheme(savedTheme);
themeToggle.addEventListener('click', () => {
  const current = document.documentElement.getAttribute('data-theme') || 'dark';
  applyTheme(current === 'dark' ? 'light' : 'dark');
});


// ── STATS COUNTER (localStorage) ─────────────────────────────────────────────
function loadStats() {
  const localAnalyses  = parseInt(localStorage.getItem('ah_analyses')  || '0', 10);
  const localDownloads = parseInt(localStorage.getItem('ah_downloads') || '0', 10);
  animateCounter(statsCounter,     0, localAnalyses,  800);
  animateCounter(downloadsCounter, 0, localDownloads, 800);
}

function animateCounter(el, from, to, duration) {
  if (!el) return;
  const start = performance.now();
  function step(now) {
    const pct = Math.min((now - start) / duration, 1);
    el.textContent = Math.floor(from + (to - from) * pct).toLocaleString();
    if (pct < 1) requestAnimationFrame(step);
  }
  requestAnimationFrame(step);
}

function incrementAnalyses() {
  const v = parseInt(localStorage.getItem('ah_analyses') || '0', 10) + 1;
  localStorage.setItem('ah_analyses', v);
  animateCounter(statsCounter, v - 1, v, 400);
}
function incrementDownloads() {
  const v = parseInt(localStorage.getItem('ah_downloads') || '0', 10) + 1;
  localStorage.setItem('ah_downloads', v);
  animateCounter(downloadsCounter, v - 1, v, 400);
}

loadStats();


// ── BACKEND HEALTH ────────────────────────────────────────────────────────────
async function checkBackendHealth() {
  const dot  = document.getElementById('serverStatusDot');
  const text = document.getElementById('serverStatusText');
  if (!dot || !text) return;
  try {
    const ctrl = new AbortController();
    setTimeout(() => ctrl.abort(), 4000);
    const res = await fetch(`${API_BASE}/api/health`, { signal: ctrl.signal });
    if (res.ok) {
      dot.className    = 'w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse';
      text.textContent = 'Engine Online';
      text.style.color = '#34D399';
      return;
    }
  } catch (_) {}
  dot.className    = 'w-2.5 h-2.5 rounded-full bg-rose-500';
  text.textContent = 'Backend Offline';
  text.style.color = '#F87171';
}
document.getElementById('serverStatusContainer')?.classList.remove('hidden');
checkBackendHealth();
setInterval(checkBackendHealth, 20000);


// ── TOAST ──────────────────────────────────────────────────────────────────────
function showToast(msg, icon = '✨', duration = 3500) {
  toastMessage.textContent = msg;
  toastIcon.textContent    = icon;
  toast.classList.remove('translate-y-24', 'opacity-0');
  toast.classList.add('translate-y-0', 'opacity-100');
  clearTimeout(toast._timer);
  toast._timer = setTimeout(() => {
    toast.classList.remove('translate-y-0', 'opacity-100');
    toast.classList.add('translate-y-24', 'opacity-0');
  }, duration);
}


// ── ERROR ─────────────────────────────────────────────────────────────────────
function showError(title, msg) {
  errorTitle.textContent   = title;
  errorMessage.textContent = msg;
  errorBox.classList.remove('hidden');
  errorBox.scrollIntoView({ behavior: 'smooth', block: 'center' });
}
function hideError() { errorBox.classList.add('hidden'); }


// ── URL INPUT HELPERS ─────────────────────────────────────────────────────────
urlInput.addEventListener('input', () => {
  clearBtn.classList.toggle('hidden', !urlInput.value.trim());
});
clearBtn.addEventListener('click', () => {
  urlInput.value = ''; clearBtn.classList.add('hidden'); urlInput.focus();
});

const isSupportedUrl = (u) => {
  const l = (u || '').toLowerCase();
  return l.includes('tiktok.com') || l.includes('instagram.com') || l.includes('instagr.am') || l.includes('youtube.com') || l.includes('youtu.be');
};

pasteBtn.addEventListener('click', async () => {
  try {
    const text = await navigator.clipboard.readText();
    if (text?.trim()) {
      urlInput.value = text.trim();
      clearBtn.classList.remove('hidden');
      showToast('تم اللصق!', '📋');
      if (isSupportedUrl(text)) analyzeForm.dispatchEvent(new Event('submit'));
    } else {
      showToast('الحافظة فارغة', '⚠️');
    }
  } catch (_) {
    urlInput.focus();
    showToast('اضغط Ctrl+V للصق', 'ℹ️');
  }
});


// ── AUDIO QUALITY LABEL UPDATE ─────────────────────────────────────────────────
audioQualitySelect.addEventListener('change', () => {
  const q = audioQualitySelect.value;
  audioQualityLabel.textContent = q === '320' ? '320kbps Studio Quality' : q === '192' ? '192kbps High Quality' : '128kbps Standard';
});


// ── ANALYZE ───────────────────────────────────────────────────────────────────
analyzeForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const url = urlInput.value.trim();
  if (!url)             { showError('رابط فارغ',        'أدخل رابط فيديو أولاً.'); return; }
  if (!isSupportedUrl(url)) { showError('رابط غير مدعوم', 'يُرجى إدخال رابط TikTok أو Instagram.'); return; }

  hideError();
  previewCard.classList.add('hidden');
  currentStreamUrl = null;
  miniPlayerWrapper.classList.add('hidden');
  setAnalyzeLoading(true);

  try {
    const res = await fetch(`${API_BASE}/api/analyze`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url }),
    });
    const text = await res.text();
    let data = {};
    try { if (text) data = JSON.parse(text); } catch (_) {}
    if (!res.ok) throw new Error(data.detail || `خطأ (${res.status})`);

    currentVideoData = data;
    incrementAnalyses();
    renderPreview(data);
    addToHistory(data);
    window._triggerMorph?.();

    const platName = data.platform === 'instagram' ? 'Instagram' : data.platform === 'youtube' ? 'YouTube' : 'TikTok';
    showToast(`✅ تم تحليل فيديو ${platName}!`, '🎉');

    // Fetch stream URL for mini player (best effort)
    fetchStreamUrl(url, data.platform);

  } catch (err) {
    let msg = err.message || 'تعذّر جلب التفاصيل.';
    if (err.name === 'TypeError' && msg.includes('fetch'))
      msg = 'السيرفر غير مشغّل! شغّل run.bat أو افتح http://localhost:8000';
    showError('فشل التحليل', msg);
    previewCard.classList.add('hidden');
  } finally {
    setAnalyzeLoading(false);
  }
});

function setAnalyzeLoading(on) {
  isAnalyzing = on;
  submitBtn.disabled = on;
  submitBtn.classList.toggle('opacity-80', on);
  btnText.textContent = on ? 'جارٍ التحليل...' : 'Analyze / Fetch';
  btnSpinner.classList.toggle('hidden', !on);
  skeletonCard.classList.toggle('hidden', !on);
  if (on) skeletonCard.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}


// ── PLATFORM SOCIAL THEME ─────────────────────────────────────────────────────
function applyPlatformTheme(platform) {
  previewCard.classList.remove('platform-tiktok', 'platform-instagram', 'platform-youtube');
  if (platform === 'tiktok') {
    previewCard.classList.add('platform-tiktok');
    platformBadge.className = 'absolute top-3 right-3 px-2.5 py-0.5 rounded-full backdrop-blur-md text-[10px] font-extrabold tracking-wider uppercase border border-cyan-500/50 bg-cyan-500/25 text-cyan-300';
    platformBadge.textContent = '⚡ TikTok Original';
  } else if (platform === 'instagram') {
    previewCard.classList.add('platform-instagram');
    platformBadge.className = 'absolute top-3 right-3 px-2.5 py-0.5 rounded-full backdrop-blur-md text-[10px] font-extrabold tracking-wider uppercase border border-rose-500/50 bg-rose-500/25 text-rose-300';
    platformBadge.textContent = '📸 Instagram Original';
  } else if (platform === 'youtube') {
    previewCard.classList.add('platform-youtube');
    platformBadge.className = 'absolute top-3 right-3 px-2.5 py-0.5 rounded-full backdrop-blur-md text-[10px] font-extrabold tracking-wider uppercase border border-red-500/50 bg-red-500/25 text-red-300';
    platformBadge.textContent = '▶ YouTube Original';
  }
}


// ── RENDER PREVIEW ────────────────────────────────────────────────────────────
function renderPreview(data) {
  videoThumbnail.src        = data.thumbnail || '';
  videoDuration.textContent = data.duration_formatted || '00:00';
  videoTitle.textContent    = data.title || 'Video Title';
  const creator = data.uploader || 'creator';
  videoUploader.textContent = creator.startsWith('@') ? creator : `@${creator}`;
  authorAvatarChar.textContent = (creator.replace('@', '')[0] || 'V').toUpperCase();
  videoResolution.textContent = data.resolution_label || 'Original HD';
  videoFps.textContent        = data.fps_label || 'Original FPS';

  if (data.qualities && data.qualities.length > 0) {
    qualitySelectorGroup.classList.remove('hidden');
    qualitySelect.innerHTML = data.qualities.map(q =>
      `<option value="${q.quality}">${q.label}</option>`
    ).join('');
  } else {
    qualitySelectorGroup.classList.add('hidden');
  }

  applyPlatformTheme(data.platform);
  previewCard.classList.remove('hidden');
  previewCard.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}


// ── STREAM URL + MINI PLAYER ─────────────────────────────────────────────────
async function fetchStreamUrl(url, platform) {
  try {
    const res = await fetch(`${API_BASE}/api/streamurl?url=${encodeURIComponent(url)}`);
    if (!res.ok) return;
    const data = await res.json();
    if (data.stream_url) {
      currentStreamUrl = data.stream_url;
      miniPlayerSrc.src = data.stream_url;
      miniPlayerEl.load();
      miniPlayerEl.style.display = 'block';
      miniPlayerWrapper.classList.remove('hidden');
    }
  } catch (_) { /* best effort */ }
}


// ── COPY STREAM URL ───────────────────────────────────────────────────────────
copyLinkBtn.addEventListener('click', async () => {
  const url = currentStreamUrl || (currentVideoData?.original_url);
  if (!url) { showToast('ما فيش رابط متاح للنسخ', '⚠️'); return; }
  try {
    await navigator.clipboard.writeText(url);
    showToast('تم نسخ رابط البث! 🔗', '✅');
  } catch (_) {
    prompt('انسخ الرابط يدوياً:', url);
  }
});


// ── QR CODE ───────────────────────────────────────────────────────────────────
qrCodeBtn.addEventListener('click', () => {
  const url = currentVideoData?.original_url;
  if (!url) { showToast('حلّل فيديو أولاً!', '⚠️'); return; }
  qrBox.innerHTML = '';
  try {
    new QRCode(qrBox, {
      text: url,
      width: 200, height: 200,
      colorDark: '#000000',
      colorLight: '#ffffff',
      correctLevel: QRCode.CorrectLevel.H,
    });
  } catch (_) {
    qrBox.innerHTML = `<img src="https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(url)}" alt="QR Code">`;
  }
  qrModal.classList.add('open');
});
qrModalClose.addEventListener('click', () => qrModal.classList.remove('open'));
qrModal.addEventListener('click', (e) => { if (e.target === qrModal) qrModal.classList.remove('open'); });


// ── PROGRESS BAR (simulated) ──────────────────────────────────────────────────
let progressTimer = null;
let currentProgress = 0;

function startProgress() {
  currentProgress = 0;
  progressBarInner.style.width = '0%';
  progressPercent.textContent = '0%';
  downloadStatus.classList.remove('hidden');

  // Simulate: 0→70% in ~8 seconds, then stall
  progressTimer = setInterval(() => {
    if (currentProgress < 70) {
      currentProgress += (70 - currentProgress) * 0.04 + 0.5;
      setProgress(Math.min(currentProgress, 70));
    }
  }, 200);
}

function setProgress(pct) {
  pct = Math.round(pct);
  progressBarInner.style.width = pct + '%';
  progressPercent.textContent  = pct + '%';
}

function completeProgress() {
  clearInterval(progressTimer);
  setProgress(100);
  progressPercent.textContent = '100%';
  downloadStatusText.textContent = '✅ Download Complete!';
  setTimeout(() => downloadStatus.classList.add('hidden'), 2500);
}

function failProgress() {
  clearInterval(progressTimer);
  setProgress(0);
  downloadStatus.classList.add('hidden');
}


// ── DOWNLOAD ──────────────────────────────────────────────────────────────────
async function triggerDownload(format, targetUrl = null, customQuality = null, customAudioQuality = null) {
  const url = targetUrl || (currentVideoData ? currentVideoData.original_url : null);
  if (!url) { showError('لا يوجد رابط', 'أدخل أو حلّل رابط فيديو أولاً.'); return; }

  const quality = customQuality || (qualitySelect ? qualitySelect.value : 'best');
  const aq      = customAudioQuality || audioQualitySelect?.value || '320';
  const label   = format === 'mp4' ? `الفيديو (MP4)` : `الصوت (MP3 ${aq}kbps)`;

  hideError();
  setDownloadLoading(true, `⏳ جارٍ تجهيز ${label} على السيرفر...`);
  startProgress();

  const downloadUrl = `${API_BASE}/api/download?url=${encodeURIComponent(url)}&format=${format}&quality=${quality}&audio_quality=${aq}`;

  try {
    const res = await fetch(downloadUrl);
    if (!res.ok) {
      let data = {};
      try { const t = await res.text(); if (t) data = JSON.parse(t); } catch (_) {}
      throw new Error(data.detail || `تعذّر التنزيل (كود: ${res.status})`);
    }

    const blob = await res.blob();
    let filename = `media_${Date.now()}.${format}`;
    const cd = res.headers.get('content-disposition') || '';
    const fnMatch = cd.match(/filename\*=UTF-8''([^;]+)/i) || cd.match(/filename="?([^";]+)"?/i);
    if (fnMatch && fnMatch[1]) filename = decodeURIComponent(fnMatch[1]);

    const blobUrl = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = blobUrl; a.download = filename;
    document.body.appendChild(a); a.click();
    setTimeout(() => { document.body.removeChild(a); URL.revokeObjectURL(blobUrl); }, 2000);

    completeProgress();
    incrementDownloads();
    showToast('تم التحميل بنجاح! 🚀', '✅');

  } catch (err) {
    failProgress();
    showError('فشل التحميل', err.message || 'حدث خطأ أثناء التحميل.');
  } finally {
    setDownloadLoading(false);
  }
}

window.triggerDownload = triggerDownload;

downloadVideoBtn.addEventListener('click', () => triggerDownload('mp4'));
downloadAudioBtn.addEventListener('click', () => triggerDownload('mp3'));

function setDownloadLoading(on, statusText = '') {
  if (statusText) downloadStatusText.textContent = statusText;
  downloadVideoBtn.disabled = on;
  downloadAudioBtn.disabled = on;
  downloadVideoBtn.classList.toggle('opacity-75', on);
  downloadAudioBtn.classList.toggle('opacity-75', on);
}


// ── DOWNLOAD HISTORY ──────────────────────────────────────────────────────────
const HISTORY_KEY = 'ah_history';

function getHistory() {
  try { return JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]'); } catch (_) { return []; }
}

function addToHistory(data) {
  if (data.type === 'playlist') return;
  let history = getHistory();
  const entry = {
    url:       data.original_url,
    title:     data.title,
    thumbnail: data.thumbnail,
    platform:  data.platform,
    duration:  data.duration_formatted,
    uploader:  data.uploader,
    ts:        Date.now(),
  };
  history = [entry, ...history.filter(h => h.url !== entry.url)].slice(0, 10);
  localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
  renderHistory();
}

function renderHistory() {
  const history = getHistory();
  historyBadge.textContent = history.length;
  historyBadge.classList.toggle('hidden', history.length === 0);

  if (history.length === 0) {
    historyPanel.innerHTML = '<p class="text-sm text-gray-400 text-center py-4">لا يوجد سجل تحميلات.</p>';
    return;
  }

  historyPanel.innerHTML = history.map((h, i) => `
    <div class="flex items-center gap-3 p-3 rounded-xl bg-white/5 border border-white/10 hover:border-cyan-500/30 transition cursor-pointer group" onclick="loadHistoryItem(${i})">
      <div class="relative w-16 h-12 rounded-lg overflow-hidden shrink-0 bg-black/40 border border-white/10">
        ${h.thumbnail ? `<img src="${h.thumbnail}" alt="${h.title}" class="w-full h-full object-cover">` : '<div class="w-full h-full bg-gradient-to-br from-cyan-900 to-rose-900"></div>'}
        <span class="absolute bottom-0.5 right-0.5 px-1 py-0.5 rounded bg-black/80 text-[9px] font-mono text-white">${h.duration || ''}</span>
      </div>
      <div class="flex-1 min-w-0">
        <p class="text-xs font-bold truncate" style="color:var(--text)">${h.title || 'Video'}</p>
        <p class="text-[10px] mt-0.5 truncate" style="color:var(--text-muted)">${h.uploader || ''} • ${h.platform?.toUpperCase() || ''}</p>
      </div>
      <div class="flex items-center gap-1.5 opacity-0 group-hover:opacity-100 transition shrink-0">
        <button onclick="event.stopPropagation();triggerDownload('mp4','${h.url}')" class="px-2.5 py-1 rounded-lg bg-cyan-600/80 hover:bg-cyan-500 text-white text-[10px] font-bold transition">MP4</button>
        <button onclick="event.stopPropagation();triggerDownload('mp3','${h.url}')" class="px-2.5 py-1 rounded-lg bg-rose-600/80 hover:bg-rose-500 text-white text-[10px] font-bold transition">MP3</button>
      </div>
    </div>
  `).join('');
}

function loadHistoryItem(index) {
  const history = getHistory();
  if (!history[index]) return;
  urlInput.value = history[index].url;
  clearBtn.classList.remove('hidden');
  analyzeForm.dispatchEvent(new Event('submit'));
  historyPanelWrapper.classList.add('hidden');
}
window.loadHistoryItem = loadHistoryItem;

historyToggleBtn.addEventListener('click', () => {
  renderHistory();
  historyPanelWrapper.classList.toggle('hidden');
  if (!historyPanelWrapper.classList.contains('hidden')) {
    historyPanelWrapper.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }
});

clearHistoryBtn.addEventListener('click', () => {
  localStorage.removeItem(HISTORY_KEY);
  renderHistory();
  showToast('تم مسح السجل ✓', '🗑️');
});

// Initialize badge
renderHistory();


// ── BATCH DOWNLOADER ──────────────────────────────────────────────────────────
batchToggleBtn.addEventListener('click', () => {
  const open = !batchPanel.classList.contains('hidden');
  batchPanel.classList.toggle('hidden', open);
  batchChevron.style.transform = open ? '' : 'rotate(180deg)';
});

batchStartBtn.addEventListener('click', async () => {
  const rawUrls = batchUrls.value.trim().split('\n').map(u => u.trim()).filter(Boolean).slice(0, 5);
  if (rawUrls.length === 0) { showToast('أدخل روابط في المربع أولاً', '⚠️'); return; }

  const format = batchFormat.value;
  batchQueueList.classList.remove('hidden');
  batchQueueList.innerHTML = rawUrls.map((url, i) => `
    <div id="batchItem_${i}" class="flex items-center gap-3 p-3 rounded-xl bg-white/5 border border-white/10 text-xs">
      <span class="batch-item-status bg-gray-500" id="batchDot_${i}"></span>
      <span class="flex-1 truncate text-gray-300">${url}</span>
      <span id="batchLabel_${i}" class="font-semibold text-gray-400">Waiting...</span>
    </div>
  `).join('');

  batchStartBtn.disabled = true;

  for (let i = 0; i < rawUrls.length; i++) {
    const url = rawUrls[i];
    const dot   = document.getElementById(`batchDot_${i}`);
    const label = document.getElementById(`batchLabel_${i}`);
    dot.className   = 'batch-item-status bg-yellow-400 animate-pulse';
    label.textContent = 'Downloading...';
    label.className = 'font-semibold text-yellow-300';

    try {
      const downloadUrl = `${API_BASE}/api/download?url=${encodeURIComponent(url)}&format=${format}&audio_quality=320`;
      const res = await fetch(downloadUrl);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const blob = await res.blob();
      const blobUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = blobUrl; a.download = `batch_${i + 1}_${Date.now()}.${format}`;
      document.body.appendChild(a); a.click();
      setTimeout(() => { document.body.removeChild(a); URL.revokeObjectURL(blobUrl); }, 2000);

      dot.className   = 'batch-item-status bg-emerald-400';
      label.textContent = '✓ Done';
      label.className = 'font-semibold text-emerald-300';
      incrementDownloads();
    } catch (err) {
      dot.className   = 'batch-item-status bg-rose-500';
      label.textContent = '✗ Failed';
      label.className = 'font-semibold text-rose-300';
    }

    if (i < rawUrls.length - 1) await new Promise(r => setTimeout(r, 2500));
  }

  batchStartBtn.disabled = false;
  showToast(`اكتمل تحميل ${rawUrls.length} ملف! 🎉`, '✅');
});


// ── INITIAL STATS from server ─────────────────────────────────────────────────
(async () => {
  try {
    const res = await fetch(`${API_BASE}/api/stats`);
    if (res.ok) {
      const data = await res.json();
      // Blend server + local counts
      const localA = parseInt(localStorage.getItem('ah_analyses')  || '0', 10);
      const localD = parseInt(localStorage.getItem('ah_downloads') || '0', 10);
      animateCounter(statsCounter,     0, Math.max(data.analyses,  localA), 1200);
      animateCounter(downloadsCounter, 0, Math.max(data.downloads, localD), 1200);
    }
  } catch (_) {}
})();
