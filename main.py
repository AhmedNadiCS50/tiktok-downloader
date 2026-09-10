import os
import sys
import re
import glob
import time
import shutil
import asyncio
import logging
import tempfile
from pathlib import Path
from typing import Optional, Dict, Any

if sys.platform == "win32":
    try:
        sys.stdout.reconfigure(encoding="utf-8")
        sys.stderr.reconfigure(encoding="utf-8")
    except Exception:
        pass

# Fix SSL cert path for Arabic folder names on Windows
try:
    import certifi
    _tmp = os.path.join(tempfile.gettempdir(), "cacert.pem")
    if not os.path.isfile(_tmp) or os.path.getsize(_tmp) == 0:
        shutil.copy(certifi.where(), _tmp)
    os.environ["CURL_CA_BUNDLE"]    = _tmp
    os.environ["SSL_CERT_FILE"]     = _tmp
    os.environ["REQUESTS_CA_BUNDLE"] = _tmp
except Exception:
    pass

from fastapi import FastAPI, HTTPException, BackgroundTasks, Query
from fastapi.responses import FileResponse, HTMLResponse
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

import yt_dlp

try:
    from yt_dlp.networking.impersonate import ImpersonateTarget
    DEFAULT_IMPERSONATE = ImpersonateTarget.from_str("chrome-110:windows-10")
except Exception:
    DEFAULT_IMPERSONATE = None

try:
    import imageio_ffmpeg
    BUNDLED_FFMPEG = imageio_ffmpeg.get_ffmpeg_exe()
except Exception:
    BUNDLED_FFMPEG = None

logging.basicConfig(level=logging.INFO,
                    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s")
logger = logging.getLogger("tiktok-downloader")

BASE_DIR     = Path(__file__).resolve().parent
STATIC_DIR   = BASE_DIR / "static"
DOWNLOAD_DIR = BASE_DIR / "temp_downloads"
DOWNLOAD_DIR.mkdir(parents=True, exist_ok=True)

app = FastAPI(title="TikTok Downloader", version="2.0.0")
app.add_middleware(CORSMiddleware, allow_origins=["*"],
                   allow_credentials=True, allow_methods=["*"], allow_headers=["*"])


# ── Helpers ──────────────────────────────────────────────────────────────────

def get_ffmpeg():
    if shutil.which("ffmpeg"):
        return "ffmpeg"
    if BUNDLED_FFMPEG and os.path.isfile(BUNDLED_FFMPEG):
        return BUNDLED_FFMPEG
    return None

def sanitize(name: str) -> str:
    return (re.sub(r'[\\/\*\?:"<>|]', "", name).strip() or "tiktok_media")[:80]

def valid_tiktok(url: str) -> bool:
    return bool(re.search(r"https?://(?:[a-zA-Z0-9-]+\.)?tiktok\.com/", url.strip()))

def fmt_duration(s):
    if not s: return "00:00"
    m, sec = divmod(int(s), 60)
    return f"{m:02d}:{sec:02d}"

def sweep_old_files():
    now = time.time()
    for f in DOWNLOAD_DIR.glob("*"):
        try:
            if f.is_file() and now - f.stat().st_mtime > 900:
                f.unlink()
        except Exception:
            pass


# ── Startup ───────────────────────────────────────────────────────────────────

@app.on_event("startup")
async def on_start():
    sweep_old_files()
    ffmpeg = get_ffmpeg()
    if ffmpeg:
        logger.info(f"FFmpeg: {ffmpeg}")
    else:
        logger.warning("FFmpeg not found – audio conversion limited.")


# ── Health ────────────────────────────────────────────────────────────────────

@app.get("/api/health")
async def health():
    return {"status": "ok", "version": "2.0.0"}


# ── Analyze ───────────────────────────────────────────────────────────────────

class AnalyzeRequest(BaseModel):
    url: str

@app.post("/api/analyze")
async def analyze(req: AnalyzeRequest):
    raw = req.url.strip()
    if not raw:
        raise HTTPException(400, "أدخل رابط TikTok.")
    if not valid_tiktok(raw):
        raise HTTPException(400, "رابط TikTok غير صالح.")

    opts: Dict[str, Any] = {
        "skip_download": True,
        "quiet": True,
        "no_warnings": True,
        "socket_timeout": 15,
    }
    if DEFAULT_IMPERSONATE:
        opts["impersonate"] = DEFAULT_IMPERSONATE
    ffmpeg = get_ffmpeg()
    if ffmpeg:
        opts["ffmpeg_location"] = ffmpeg

    try:
        loop = asyncio.get_running_loop()
        info = await loop.run_in_executor(None, lambda: _ydl_extract(raw, opts))
    except Exception as e:
        msg = str(e)
        logger.error(f"Analyze error: {msg}")
        if "Private"   in msg: raise HTTPException(403, "الفيديو خاص.")
        if "blocked"   in msg: raise HTTPException(403, "IP محظور مؤقتاً من TikTok. جرّب رابطاً آخر.")
        if "not found" in msg.lower(): raise HTTPException(404, "الفيديو غير موجود أو محذوف.")
        raise HTTPException(500, f"فشل جلب المعلومات: {msg}")

    if not info:
        raise HTTPException(404, "لم يُعثر على بيانات الفيديو.")

    w, h, fps = info.get("width"), info.get("height"), info.get("fps")
    formats = info.get("formats") or []

    # Best video + audio CDN URLs
    best_vid, best_aud, max_res, max_abr = None, None, 0, 0
    for f in formats:
        fw, fh, fu = f.get("width") or 0, f.get("height") or 0, f.get("url")
        if not fu: continue
        if fw and fh and fw * fh > max_res:
            max_res = fw * fh; best_vid = f
        elif not fw and f.get("vcodec") in (None, "none") and f.get("acodec") not in (None, "none"):
            abr = f.get("abr") or 0
            if abr > max_abr: max_abr = abr; best_aud = f

    direct_video = best_vid.get("url") if best_vid else None
    direct_audio = (best_aud.get("url") if best_aud else None) or direct_video
    video_ext    = (best_vid.get("ext") if best_vid else None) or "mp4"
    audio_ext    = (best_aud.get("ext") if best_aud else None) or "m4a"

    if best_vid:
        w = w or best_vid.get("width"); h = h or best_vid.get("height"); fps = fps or best_vid.get("fps")

    if w and h:
        tag = ("4K" if h >= 2160 else "2K" if h >= 1440 else "1080p FHD"
               if h >= 1080 else "720p HD" if h >= 720 else "480p SD" if h >= 480 else f"{min(w,h)}p")
        res_label = f"{w} × {h} ({tag})"
    else:
        res_label = "Original Quality (HD)"

    fps_label  = f"{round(fps)} FPS" if fps else "Original FPS"
    thumb      = info.get("thumbnail")
    thumbs     = info.get("thumbnails")
    if thumbs: thumb = thumbs[-1].get("url") or thumb
    duration   = info.get("duration")

    return {
        "status": "success",
        "id": str(info.get("id", "tiktok")),
        "title": info.get("title") or "TikTok Video",
        "uploader": info.get("uploader") or info.get("channel") or "Creator",
        "uploader_id": info.get("uploader_id"),
        "duration": duration,
        "duration_formatted": fmt_duration(duration),
        "thumbnail": thumb,
        "width": w, "height": h,
        "resolution_label": res_label,
        "fps": fps, "fps_label": fps_label,
        "view_count":    info.get("view_count"),
        "like_count":    info.get("like_count"),
        "comment_count": info.get("comment_count"),
        "original_url":  raw,
        "direct_video_url": direct_video,
        "direct_audio_url": direct_audio,
        "video_ext": video_ext,
        "audio_ext": audio_ext,
    }


def _ydl_extract(url, opts):
    with yt_dlp.YoutubeDL(opts) as ydl:
        return ydl.extract_info(url, download=False)


# ── Download ───────────────────────────────────────────────────────────────────

@app.get("/api/download")
async def download(
    background_tasks: BackgroundTasks,
    url: str    = Query(...),
    format: str = Query("mp4", pattern="^(mp4|mp3)$"),
):
    """
    نفس منطق Colab: yt-dlp يحمّل الملف على السيرفر ثم يُرسله للمتصفح.
    """
    from urllib.parse import quote

    raw = url.strip()
    if not valid_tiktok(raw):
        raise HTTPException(400, "رابط غير صالح.")

    sweep_old_files()
    ffmpeg = get_ffmpeg()
    sid    = f"{int(time.time())}_{os.urandom(4).hex()}"
    out    = str(DOWNLOAD_DIR / f"tk_{sid}")

    opts: Dict[str, Any] = {
        "quiet":          True,
        "no_warnings":    True,
        "outtmpl":        f"{out}.%(ext)s",
        "socket_timeout": 30,
    }
    if DEFAULT_IMPERSONATE:
        opts["impersonate"] = DEFAULT_IMPERSONATE
    if ffmpeg:
        opts["ffmpeg_location"] = ffmpeg

    if format == "mp4":
        opts.update({
            "format":               "bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best",
            "merge_output_format":  "mp4",
        })
    else:
        opts.update({
            "format": "bestaudio/best",
            "postprocessors": [{
                "key":              "FFmpegExtractAudio",
                "preferredcodec":   "mp3",
                "preferredquality": "320",
            }],
        })

    try:
        loop = asyncio.get_running_loop()
        info = await loop.run_in_executor(None, lambda: _ydl_download(raw, opts))
    except Exception as e:
        msg = str(e)
        logger.error(f"Download error: {msg}")
        if "blocked" in msg:
            raise HTTPException(403, "IP محظور مؤقتاً من TikTok.")
        if "Private" in msg:
            raise HTTPException(403, "الفيديو خاص.")
        raise HTTPException(500, f"فشل التحميل: {msg}")

    matches = glob.glob(f"{out}.*")
    if not matches:
        raise HTTPException(500, "لم يُعثر على الملف بعد التحميل.")

    file_path = matches[0]
    ext       = os.path.splitext(file_path)[1].lstrip(".")
    title     = info.get("title") or "TikTok"
    uploader  = info.get("uploader") or ""
    name      = sanitize(f"{title} - {uploader}" if uploader else title)
    filename  = f"{name}.{ext}"

    ascii_fn  = re.sub(r"[^\x00-\x7F]+", "_", filename).strip("_") or "tiktok_media"
    enc_fn    = quote(filename)

    background_tasks.add_task(_del, file_path)

    return FileResponse(
        path=file_path,
        media_type="video/mp4" if ext == "mp4" else "audio/mpeg",
        filename=filename,
        headers={
            "Content-Disposition": f'attachment; filename="{ascii_fn}"; filename*=UTF-8\'\'{enc_fn}',
            "Cache-Control": "no-cache",
        },
    )


def _ydl_download(url, opts):
    with yt_dlp.YoutubeDL(opts) as ydl:
        return ydl.extract_info(url, download=True)

def _del(path):
    try:
        if os.path.isfile(path):
            os.remove(path)
            logger.info(f"Deleted: {path}")
    except Exception as e:
        logger.warning(f"Delete failed: {e}")


# ── Static / Frontend ─────────────────────────────────────────────────────────

if STATIC_DIR.exists():
    app.mount("/static", StaticFiles(directory=str(STATIC_DIR)), name="static")

@app.get("/", response_class=HTMLResponse)
async def index():
    f = STATIC_DIR / "index.html"
    return HTMLResponse(f.read_text(encoding="utf-8") if f.exists()
                        else "<h1>TikTok Downloader – missing index.html</h1>")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
