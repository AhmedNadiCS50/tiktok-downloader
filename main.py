import os
import sys
import re
import asyncio
import logging
import tempfile
import shutil
from pathlib import Path
from typing import Optional, Dict, Any

if sys.platform == "win32":
    try:
        sys.stdout.reconfigure(encoding="utf-8")
        sys.stderr.reconfigure(encoding="utf-8")
    except Exception:
        pass

# Fix SSL cert path (needed on Windows with Arabic folder names)
try:
    import certifi
    _tmp = os.path.join(tempfile.gettempdir(), "cacert.pem")
    if not os.path.isfile(_tmp) or os.path.getsize(_tmp) == 0:
        shutil.copy(certifi.where(), _tmp)
    os.environ["CURL_CA_BUNDLE"]     = _tmp
    os.environ["SSL_CERT_FILE"]      = _tmp
    os.environ["REQUESTS_CA_BUNDLE"] = _tmp
except Exception:
    pass

from fastapi import FastAPI, HTTPException
from fastapi.responses import HTMLResponse, RedirectResponse
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

import yt_dlp

try:
    from yt_dlp.networking.impersonate import ImpersonateTarget
    DEFAULT_IMPERSONATE = ImpersonateTarget.from_str("chrome-110:windows-10")
except Exception:
    DEFAULT_IMPERSONATE = None

logging.basicConfig(level=logging.INFO,
                    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s")
logger = logging.getLogger("tiktok-downloader")

BASE_DIR   = Path(__file__).resolve().parent
STATIC_DIR = BASE_DIR / "static"

app = FastAPI(title="TikTok Downloader", version="3.0.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ── Helpers ───────────────────────────────────────────────────────────────────

def valid_tiktok(url: str) -> bool:
    return bool(re.search(r"https?://(?:[a-zA-Z0-9-]+\.)?tiktok\.com/", url.strip()))

def fmt_duration(s) -> str:
    if not s:
        return "00:00"
    m, sec = divmod(int(s), 60)
    return f"{m:02d}:{sec:02d}"

def _ydl_extract(url: str, opts: dict):
    with yt_dlp.YoutubeDL(opts) as ydl:
        return ydl.extract_info(url, download=False)


# ── Health ─────────────────────────────────────────────────────────────────────

@app.get("/api/health")
async def health():
    return {"status": "ok", "version": "3.0.0"}


# ── Analyze ────────────────────────────────────────────────────────────────────

class AnalyzeRequest(BaseModel):
    url: str

@app.post("/api/analyze")
async def analyze(req: AnalyzeRequest):
    """
    Extract video metadata + direct CDN download URLs from TikTok.
    No file is saved on the server — download happens in the browser directly.
    """
    raw = req.url.strip()
    if not raw:
        raise HTTPException(400, "أدخل رابط TikTok.")
    if not valid_tiktok(raw):
        raise HTTPException(400, "رابط TikTok غير صالح.")

    opts: Dict[str, Any] = {
        "skip_download": True,
        "quiet":         True,
        "no_warnings":   True,
        "socket_timeout": 20,
    }
    if DEFAULT_IMPERSONATE:
        opts["impersonate"] = DEFAULT_IMPERSONATE

    try:
        loop = asyncio.get_running_loop()
        info = await loop.run_in_executor(None, lambda: _ydl_extract(raw, opts))
    except Exception as e:
        msg = str(e)
        logger.error(f"Analyze error: {msg}")
        if "Private"    in msg: raise HTTPException(403, "الفيديو خاص.")
        if "blocked"    in msg: raise HTTPException(403, "الـ IP محظور مؤقتاً من TikTok.")
        if "not found"  in msg.lower(): raise HTTPException(404, "الفيديو غير موجود أو محذوف.")
        raise HTTPException(500, f"فشل جلب المعلومات: {msg}")

    if not info:
        raise HTTPException(404, "لم يُعثر على بيانات الفيديو.")

    formats = info.get("formats") or []
    w = info.get("width")
    h = info.get("height")
    fps = info.get("fps")

    # Pick best video and audio formats with direct CDN URLs
    best_vid, best_aud = None, None
    max_res = max_abr = 0

    for f in formats:
        fw  = f.get("width")  or 0
        fh  = f.get("height") or 0
        fu  = f.get("url")
        if not fu:
            continue
        if fw and fh:
            if fw * fh > max_res:
                max_res = fw * fh
                best_vid = f
        elif f.get("vcodec") in (None, "none") and f.get("acodec") not in (None, "none"):
            abr = f.get("abr") or 0
            if abr > max_abr:
                max_abr = abr
                best_aud = f

    direct_video = best_vid.get("url") if best_vid else None
    direct_audio = (best_aud.get("url") if best_aud else None) or direct_video
    video_ext    = (best_vid.get("ext") if best_vid else None) or "mp4"
    audio_ext    = (best_aud.get("ext") if best_aud else None) or "m4a"

    # Also grab http_headers from yt-dlp (needed to access CDN)
    video_headers = best_vid.get("http_headers", {}) if best_vid else {}
    audio_headers = best_aud.get("http_headers", {}) if best_aud else video_headers

    if best_vid:
        w   = w   or best_vid.get("width")
        h   = h   or best_vid.get("height")
        fps = fps or best_vid.get("fps")

    # Resolution label
    if w and h:
        tag = ("4K" if h >= 2160 else "2K" if h >= 1440 else
               "1080p FHD" if h >= 1080 else "720p HD" if h >= 720 else
               "480p SD" if h >= 480 else f"{min(w, h)}p")
        res_label = f"{w} × {h} ({tag})"
    else:
        res_label = "Original Quality (HD)"

    fps_label = f"{round(fps)} FPS" if fps else "Original FPS"

    thumb  = info.get("thumbnail")
    thumbs = info.get("thumbnails")
    if thumbs and isinstance(thumbs, list):
        thumb = thumbs[-1].get("url") or thumb

    duration = info.get("duration")

    return {
        "status": "success",
        "id":     str(info.get("id", "tiktok")),
        "title":  info.get("title") or "TikTok Video",
        "uploader":   info.get("uploader") or info.get("channel") or "Creator",
        "uploader_id": info.get("uploader_id"),
        "duration":          duration,
        "duration_formatted": fmt_duration(duration),
        "thumbnail":   thumb,
        "width":  w,
        "height": h,
        "resolution_label": res_label,
        "fps":      fps,
        "fps_label": fps_label,
        "view_count":    info.get("view_count"),
        "like_count":    info.get("like_count"),
        "comment_count": info.get("comment_count"),
        "original_url":  raw,
        # ── Direct CDN URLs (browser downloads from TikTok directly) ──
        "direct_video_url":  direct_video,
        "direct_audio_url":  direct_audio,
        "video_ext":  video_ext,
        "audio_ext":  audio_ext,
        "video_headers": video_headers,
        "audio_headers": audio_headers,
    }


# ── Static / Frontend ─────────────────────────────────────────────────────────

if STATIC_DIR.exists():
    app.mount("/static", StaticFiles(directory=str(STATIC_DIR)), name="static")

@app.get("/", response_class=HTMLResponse)
async def index():
    f = STATIC_DIR / "index.html"
    return HTMLResponse(
        f.read_text(encoding="utf-8") if f.exists()
        else "<h1>TikTok Downloader</h1>"
    )

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
