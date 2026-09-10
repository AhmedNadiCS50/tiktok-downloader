import os
import sys
import re
import time
import glob
import asyncio
import logging
import tempfile
import shutil
from pathlib import Path
from typing import Optional, Dict, Any
from urllib.parse import quote

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

from fastapi import FastAPI, HTTPException, Query, BackgroundTasks
from fastapi.responses import HTMLResponse, FileResponse
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

BASE_DIR     = Path(__file__).resolve().parent
STATIC_DIR   = BASE_DIR / "static"
DOWNLOAD_DIR = Path(tempfile.gettempdir()) / "tiktok_downloads"
DOWNLOAD_DIR.mkdir(parents=True, exist_ok=True)

app = FastAPI(title="TikTok Downloader", version="3.1.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ── Helpers ───────────────────────────────────────────────────────────────────

def get_ffmpeg() -> Optional[str]:
    try:
        import imageio_ffmpeg
        exe = imageio_ffmpeg.get_ffmpeg_exe()
        if os.path.isfile(exe):
            try:
                os.chmod(exe, 0o755)
            except Exception:
                pass
            return exe
    except Exception:
        pass
    return None

def sanitize(name: str) -> str:
    cleaned = re.sub(r'[\\/*?:"<>|]', "", name).strip()
    return cleaned[:80] if cleaned else "tiktok_media"

def valid_tiktok(url: str) -> bool:
    return bool(re.search(r"https?://(?:[a-zA-Z0-9-]+\.)?tiktok\.com/", url.strip()))

def fmt_duration(s) -> str:
    if not s:
        return "00:00"
    m, sec = divmod(int(s), 60)
    return f"{m:02d}:{sec:02d}"

def sweep_old_files(max_age_seconds=1800):
    try:
        now = time.time()
        for f in DOWNLOAD_DIR.glob("tk_*"):
            if f.is_file() and (now - f.stat().st_mtime > max_age_seconds):
                try:
                    f.unlink(missing_ok=True)
                except Exception:
                    pass
    except Exception:
        pass

def _del(path: str):
    try:
        if os.path.isfile(path):
            os.remove(path)
            logger.info(f"Deleted temp file: {path}")
    except Exception as e:
        logger.warning(f"Delete temp file failed: {e}")


# ── Health ─────────────────────────────────────────────────────────────────────

@app.get("/api/health")
async def health():
    return {"status": "ok", "version": "3.1.0"}


# ── Analyze ────────────────────────────────────────────────────────────────────

class AnalyzeRequest(BaseModel):
    url: str

def _ydl_extract(url: str, opts: dict):
    with yt_dlp.YoutubeDL(opts) as ydl:
        return ydl.extract_info(url, download=False)

@app.post("/api/analyze")
async def analyze(req: AnalyzeRequest):
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

    best_vid = None
    max_res = 0
    for f in formats:
        fw = f.get("width")  or 0
        fh = f.get("height") or 0
        fu = f.get("url")
        if not fu:
            continue
        if fw and fh and (fw * fh > max_res):
            max_res = fw * fh
            best_vid = f

    if best_vid:
        w   = w   or best_vid.get("width")
        h   = h   or best_vid.get("height")
        fps = fps or best_vid.get("fps")

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
    }


# ── Download ───────────────────────────────────────────────────────────────────

def _ydl_download(url: str, opts: dict):
    with yt_dlp.YoutubeDL(opts) as ydl:
        return ydl.extract_info(url, download=True)

@app.get("/api/download")
async def download(
    background_tasks: BackgroundTasks,
    url: str    = Query(...),
    format: str = Query("mp4", pattern="^(mp4|mp3)$"),
):
    """
    Downloads via yt-dlp and serves as attachment so the browser saves it directly.
    """
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
            "format": "bestvideo[ext=mp4]+bestaudio[ext=m4a]/bestvideo+bestaudio/best[ext=mp4]/best",
            "merge_output_format": "mp4",
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
