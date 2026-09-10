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
const analyzeForm          = document.getElementById('analyzeForm');
const urlInput             = document.getElementById('urlInput');
const clearBtn             = document.getElementById('clearBtn');
const pasteBtn             = document.getElementById('pasteBtn');
const submitBtn            = document.getElementById('submitBtn');
const btnText              = document.getElementById('btnText');
const btnSpinner           = document.getElementById('btnSpinner');
const errorBox             = document.getElementById('errorBox');
const errorTitle           = document.getElementById('errorTitle');
const errorMessage         = document.getElementById('errorMessage');

// Single Video Card Elements
const previewCard          = document.getElementById('previewCard');
const videoThumbnail       = document.getElementById('videoThumbnail');
const videoDuration        = document.getElementById('videoDuration');
const videoTitle           = document.getElementById('videoTitle');
const videoUploader        = document.getElementById('videoUploader');
const authorAvatarChar     = document.getElementById('authorAvatarChar');
const videoResolution      = document.getElementById('videoResolution');
const videoFps             = document.getElementById('videoFps');
const qualitySelectorGroup = document.getElementById('qualitySelectorGroup');
const qualitySelect        = document.getElementById('qualitySelect');
const downloadVideoBtn     = document.getElementById('downloadVideoBtn');
const downloadAudioBtn     = document.getElementById('downloadAudioBtn');
const downloadStatus       = document.getElementById('downloadStatus');
const downloadStatusText   = document.getElementById('downloadStatusText');

// Playlist Card Elements
const playlistCard         = document.getElementById('playlistCard');
const playlistTitle        = document.getElementById('playlistTitle');
const playlistUploaderName = document.getElementById('playlistUploaderName');
const playlistCountBadge   = document.getElementById('playlistCountBadge');
const playlistEntries      = document.getElementById('playlistEntries');

// Toast Elements
const toast                = document.getElementById('toast');
const toastMessage         = document.getElementById('toastMessage');
const toastIcon            = document.getElementById('toastIcon');

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

// ── Analyze ─────────────────────────────────────────────────────────────────
analyzeForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const url = urlInput.value.trim();
  if (!url) { showError('رابط فارغ', 'أدخل رابط فيديو TikTok, Instagram أو YouTube أولاً.'); return; }
  if (!isSupportedUrl(url)) {
    showError('رابط غير مدعوم', 'الرابط لا يبدو من TikTok, Instagram أو YouTube. يُرجى التحقق من الرابط.'); return;
  }
  hideError();
  previewCard.classList.add('hidden');
  playlistCard.classList.add('hidden');
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
    if (data.type === 'playlist') {
      renderPlaylist(data);
      showToast(`تم جلب قائمة التشغيل (${data.count} فيديو)!`, '📋');
    } else {
      renderPreview(data);
      const platName = data.platform === 'instagram' ? 'Instagram' : data.platform === 'youtube' ? 'YouTube' : 'TikTok';
      showToast(`تم تحليل فيديو ${platName}!`, '🎉');
    }
  } catch (err) {
    let msg = err.message || 'تعذّر جلب التفاصيل.';
    if (err.name === 'TypeError' && msg.includes('fetch'))
      msg = 'السيرفر غير مشغّل! شغّل run.bat أو افتح http://localhost:8000';
    showError('فشل التحليل', msg);
    previewCard.classList.add('hidden');
    playlistCard.classList.add('hidden');
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

// ── Preview Single Video ────────────────────────────────────────────────────
function renderPreview(data) {
  playlistCard.classList.add('hidden');
  videoThumbnail.src = data.thumbnail || 'https://via.placeholder.com/400x600?text=No+Thumbnail';
  videoDuration.textContent = data.duration_formatted || '00:00';
  videoTitle.textContent    = data.title || 'Video Title';
  const creator = data.uploader || 'creator';
  videoUploader.textContent  = creator.startsWith('@') ? creator : `@${creator}`;
  
  let initial = 'V';
  if (data.platform === 'youtube') initial = 'Y';
  else if (data.platform === 'instagram') initial = 'I';
  else if (data.platform === 'tiktok') initial = 'T';
  authorAvatarChar.textContent = (creator.replace('@', '')[0] || initial).toUpperCase();

  videoResolution.textContent = data.resolution_label || 'Original HD';
  videoFps.textContent        = data.fps_label || 'Original FPS';

  // Qualities Dropdown
  if (data.qualities && data.qualities.length > 0) {
    qualitySelectorGroup.classList.remove('hidden');
    qualitySelect.innerHTML = data.qualities.map(q => 
      `<option value="${q.quality}">${q.label}</option>`
    ).join('');
  } else {
    qualitySelectorGroup.classList.add('hidden');
  }

  previewCard.classList.remove('hidden');
  previewCard.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

// ── Preview Playlist ────────────────────────────────────────────────────────
function renderPlaylist(data) {
  previewCard.classList.add('hidden');
  playlistTitle.textContent = data.title || 'YouTube Playlist';
  playlistUploaderName.textContent = data.uploader || 'YouTube Channel';
  playlistCountBadge.textContent = `${data.count || data.entries.length} Videos`;

  playlistEntries.innerHTML = (data.entries || []).map((entry, idx) => {
    const thumb = entry.thumbnail || 'https://via.placeholder.com/120x90?text=Video';
    const dur = entry.duration_formatted || '00:00';
    const title = entry.title || `Video #${idx + 1}`;
    const url = entry.url;

    return `
      <div class="p-3 rounded-xl bg-white/5 border border-white/10 hover:border-cyan-500/30 transition flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div class="flex items-center gap-3 flex-1 min-w-0">
          <span class="text-xs font-mono font-bold text-gray-500 w-5 shrink-0">${idx + 1}</span>
          <div class="relative w-24 h-14 rounded-lg overflow-hidden shrink-0 bg-black/40 border border-white/10">
            <img src="${thumb}" alt="${title}" class="w-full h-full object-cover" loading="lazy">
            <span class="absolute bottom-1 right-1 px-1.5 py-0.5 rounded bg-black/80 text-[10px] font-mono text-white">${dur}</span>
          </div>
          <div class="flex-1 min-w-0">
            <h4 class="text-sm font-bold text-white line-clamp-1">${title}</h4>
            <p class="text-xs text-gray-400 mt-0.5 line-clamp-1">${entry.uploader || ''}</p>
          </div>
        </div>

        <div class="flex items-center gap-2 w-full sm:w-auto justify-end shrink-0">
          <button 
            onclick="triggerDownload('mp4', '${url}', 'best')"
            class="px-3 py-1.5 rounded-lg bg-cyan-600/80 hover:bg-cyan-500 text-white text-xs font-bold transition flex items-center gap-1 active:scale-95"
          >
            <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"/></svg>
            <span>MP4</span>
          </button>

          <button 
            onclick="triggerDownload('mp3', '${url}', 'best')"
            class="px-3 py-1.5 rounded-lg bg-rose-600/80 hover:bg-rose-500 text-white text-xs font-bold transition flex items-center gap-1 active:scale-95"
          >
            <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3"/></svg>
            <span>MP3</span>
          </button>
        </div>
      </div>
    `;
  }).join('');

  playlistCard.classList.remove('hidden');
  playlistCard.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

// ── Download Trigger ────────────────────────────────────────────────────────
function triggerDownload(format, targetUrl = null, customQuality = null) {
  const url = targetUrl || (currentVideoData ? currentVideoData.original_url : null);
  if (!url) {
    showError('لا يوجد رابط', 'أدخل أو حلّل رابط فيديو أولاً.');
    return;
  }

  const quality = customQuality || (qualitySelect ? qualitySelect.value : 'best');
  const label = format === 'mp4' ? `الفيديو (MP4 ${quality !== 'best' ? quality + 'p' : ''})` : 'الصوت (MP3)';
  
  showToast(`جارٍ تجهيز ${label} وسيبدأ التحميل بجهازك مباشرة... ⏳`, '📥', 10000);

  const downloadUrl = `${API_BASE}/api/download?url=${encodeURIComponent(url)}&format=${format}&quality=${quality}`;

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

// Make triggerDownload available globally for inline onclick handlers
window.triggerDownload = triggerDownload;

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
