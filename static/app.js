const getApiBase = () => {
  const { protocol, port } = window.location;
  if (protocol === 'file:' || (port && port !== '8000')) {
    return 'http://127.0.0.1:8000';
  }
  return '';
};
const API_BASE = getApiBase();

let currentVideoData = null;
let isAnalyzing = false;

// DOM Elements
const analyzeForm      = document.getElementById('analyzeForm');
const urlInput         = document.getElementById('urlInput');
const clearBtn         = document.getElementById('clearBtn');
const pasteBtn         = document.getElementById('pasteBtn');
const submitBtn        = document.getElementById('submitBtn');
const btnText          = document.getElementById('btnText');
const btnSpinner       = document.getElementById('btnSpinner');
const errorBox         = document.getElementById('errorBox');
const errorTitle       = document.getElementById('errorTitle');
const errorMessage     = document.getElementById('errorMessage');
const previewCard      = document.getElementById('previewCard');
const videoThumbnail   = document.getElementById('videoThumbnail');
const videoDuration    = document.getElementById('videoDuration');
const videoTitle       = document.getElementById('videoTitle');
const videoUploader    = document.getElementById('videoUploader');
const authorAvatarChar = document.getElementById('authorAvatarChar');
const videoResolution  = document.getElementById('videoResolution');
const videoFps         = document.getElementById('videoFps');
const downloadVideoBtn = document.getElementById('downloadVideoBtn');
const downloadAudioBtn = document.getElementById('downloadAudioBtn');
const downloadStatus   = document.getElementById('downloadStatus');
const downloadStatusText = document.getElementById('downloadStatusText');
const toast            = document.getElementById('toast');
const toastMessage     = document.getElementById('toastMessage');
const toastIcon        = document.getElementById('toastIcon');

// ── Health ──────────────────────────────────────────────────────────────────
async function checkBackendHealth() {
  const dot  = document.getElementById('serverStatusDot');
  const text = document.getElementById('serverStatusText');
  if (!dot || !text) return;
  try {
    const ctrl = new AbortController();
    setTimeout(() => ctrl.abort(), 4000);
    const res = await fetch(`${API_BASE}/api/health`, { signal: ctrl.signal });
    if (res.ok) {
      dot.className    = 'w-2 h-2 rounded-full bg-emerald-400 animate-pulse';
      text.textContent = 'Backend Online';
      text.className   = 'text-xs text-emerald-400 font-medium';
      return;
    }
  } catch (_) {}
  dot.className    = 'w-2 h-2 rounded-full bg-rose-500';
  text.textContent = 'Backend Offline';
  text.className   = 'text-xs text-rose-400 font-medium';
}
checkBackendHealth();
setInterval(checkBackendHealth, 15000);

// ── Toast ───────────────────────────────────────────────────────────────────
function showToast(message, icon = '✨', duration = 3500) {
  toastMessage.textContent = message;
  toastIcon.textContent = icon;
  toast.classList.remove('translate-y-24', 'opacity-0');
  toast.classList.add('translate-y-0', 'opacity-100');
  setTimeout(() => {
    toast.classList.remove('translate-y-0', 'opacity-100');
    toast.classList.add('translate-y-24', 'opacity-0');
  }, duration);
}

// ── Error ───────────────────────────────────────────────────────────────────
function showError(title, msg) {
  errorTitle.textContent   = title;
  errorMessage.textContent = msg;
  errorBox.classList.remove('hidden');
  errorBox.scrollIntoView({ behavior: 'smooth', block: 'center' });
}
function hideError() { errorBox.classList.add('hidden'); }

// ── Input helpers ───────────────────────────────────────────────────────────
urlInput.addEventListener('input', () => {
  clearBtn.classList.toggle('hidden', !urlInput.value.trim());
});
clearBtn.addEventListener('click', () => {
  urlInput.value = '';
  clearBtn.classList.add('hidden');
  urlInput.focus();
});
pasteBtn.addEventListener('click', async () => {
  try {
    const text = await navigator.clipboard.readText();
    if (text?.trim()) {
      urlInput.value = text.trim();
      clearBtn.classList.remove('hidden');
      showToast('تم اللصق!', '📋');
      if (text.includes('tiktok.com')) analyzeForm.dispatchEvent(new Event('submit'));
    } else {
      showToast('الحافظة فارغة', '⚠️');
    }
  } catch (_) {
    urlInput.focus();
    showToast('اضغط Ctrl+V للصق', 'ℹ️');
  }
});

// ── Analyze ─────────────────────────────────────────────────────────────────
analyzeForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const url = urlInput.value.trim();
  if (!url) { showError('رابط فارغ', 'أدخل رابط TikTok أولاً.'); return; }
  if (!url.toLowerCase().includes('tiktok.com')) {
    showError('رابط غير صالح', 'الرابط لا يبدو من TikTok.'); return;
  }
  hideError();
  setAnalyzeLoading(true);

  try {
    const res = await fetch(`${API_BASE}/api/analyze`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url }),
    });
    const rawText = await res.text();
    let data = {};
    try { if (rawText) data = JSON.parse(rawText); } catch (_) {}
    if (!res.ok) throw new Error(data.detail || `خطأ (${res.status})`);

    currentVideoData = data;
    renderPreview(data);
    showToast('تم تحليل الفيديو!', '🎉');
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
  submitBtn.classList.toggle('cursor-not-allowed', on);
  btnText.textContent = on ? 'جارٍ التحليل...' : 'تحليل / جلب';
  btnSpinner.classList.toggle('hidden', !on);
}

// ── Preview ─────────────────────────────────────────────────────────────────
function renderPreview(data) {
  videoThumbnail.src = data.thumbnail || 'https://via.placeholder.com/400x600?text=No+Thumbnail';
  videoDuration.textContent = data.duration_formatted || '00:00';
  videoTitle.textContent    = data.title || 'TikTok Video';
  const creator = data.uploader || 'creator';
  videoUploader.textContent  = creator.startsWith('@') ? creator : `@${creator}`;
  authorAvatarChar.textContent = (creator.replace('@', '')[0] || 'T').toUpperCase();
  videoResolution.textContent = data.resolution_label || 'Original HD';
  videoFps.textContent        = data.fps_label || 'Original FPS';
  previewCard.classList.remove('hidden');
  previewCard.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

// ── Download ─────────────────────────────────────────────────────────────────
// Strategy:
//   1. Try opening the CDN URL directly (fast, no server needed).
//   2. If no CDN URL available → fallback to server /api/download.
//
// Note: TikTok CDN URLs sometimes have IP/referer restrictions.
// The browser will either download the file or show it — both are fine.

function triggerDownload(format) {
  if (!currentVideoData || !currentVideoData.original_url) {
    showError('لا يوجد فيديو', 'حلّل رابط TikTok أولاً.');
    return;
  }

  const label = format === 'mp4' ? 'الفيديو (MP4)' : 'الصوت (MP3)';
  showToast(`جارٍ تجهيز ${label} وسيبدأ التحميل بجهازك مباشرة... ⏳`, '📥', 10000);

  const downloadUrl = `${API_BASE}/api/download?url=${encodeURIComponent(currentVideoData.original_url)}&format=${format}`;

  // Start file download directly in browser
  const a = document.createElement('a');
  a.href = downloadUrl;
  a.setAttribute('download', '');
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    try { document.body.removeChild(a); } catch (_) {}
  }, 1000);
}

// ── Button listeners ─────────────────────────────────────────────────────────
downloadVideoBtn.addEventListener('click', () => triggerDownload('mp4'));
downloadAudioBtn.addEventListener('click', () => triggerDownload('mp3'));

function setDownloadLoading(on, statusText = '') {
  downloadStatusText.textContent = statusText;
  downloadStatus.classList.toggle('hidden', !on);
  downloadVideoBtn.disabled = on;
  downloadAudioBtn.disabled = on;
  downloadVideoBtn.classList.toggle('opacity-75', on);
  downloadAudioBtn.classList.toggle('opacity-75', on);
}
