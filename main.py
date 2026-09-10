import os
import sys
import re
import time
import glob
import asyncio
import logging
import tempfile
import shutil
import subprocess
from pathlib import Path
from typing import Optional, Dict, Any, List
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
import httpx
import yt_dlp
import instaloader

try:
    from yt_dlp.networking.impersonate import ImpersonateTarget
    DEFAULT_IMPERSONATE = ImpersonateTarget.from_str("chrome-110:windows-10")
except Exception:
    DEFAULT_IMPERSONATE = None

logging.basicConfig(level=logging.INFO,
                    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s")
logger = logging.getLogger("media-downloader")

BASE_DIR     = Path(__file__).resolve().parent
STATIC_DIR   = BASE_DIR / "static"
DOWNLOAD_DIR = Path(tempfile.gettempdir()) / "media_downloads"
DOWNLOAD_DIR.mkdir(parents=True, exist_ok=True)

app = FastAPI(title="Media Downloader - TikTok, Instagram & YouTube", version="5.1.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["Content-Disposition"],
)

_insta_loader: Optional[instaloader.Instaloader] = None

def get_instaloader() -> instaloader.Instaloader:
    global _insta_loader
    if _insta_loader is None:
        _insta_loader = instaloader.Instaloader(
            download_pictures=False,
            download_videos=False,
            download_video_thumbnails=False,
            download_geotags=False,
            download_comments=False,
            save_metadata=False,
            compress_json=False,
            quiet=True,
        )
    return _insta_loader


# ── Helpers ───────────────────────────────────────────────────────────────────

def get_ffmpeg() -> Optional[str]:
    """
    Finds ffmpeg executable or safely copies it to temp directory on read-only filesystems (like Vercel AWS Lambda).
    """
    try:
        import imageio_ffmpeg
        exe = imageio_ffmpeg.get_ffmpeg_exe()
        if os.path.isfile(exe):
            # Check if already executable
            if os.access(exe, os.X_OK):
                return exe
            # Try chmod directly
            try:
                os.chmod(exe, 0o755)
                return exe
            except Exception:
                pass
            # Read-only filesystem (Vercel Lambda) -> copy to /tmp/ffmpeg_bin and chmod there
            tmp_ffmpeg = os.path.join(tempfile.gettempdir(), "ffmpeg_bin")
            if sys.platform == "win32":
                tmp_ffmpeg += ".exe"
            try:
                if not os.path.isfile(tmp_ffmpeg) or os.path.getsize(tmp_ffmpeg) != os.path.getsize(exe):
                    shutil.copy2(exe, tmp_ffmpeg)
                os.chmod(tmp_ffmpeg, 0o755)
                return tmp_ffmpeg
            except Exception as e:
                logger.warning(f"Copy ffmpeg to tmp failed: {e}")
                return exe
    except Exception as e:
        logger.warning(f"get_ffmpeg error: {e}")
    return None

def sanitize(name: str) -> str:
    cleaned = re.sub(r'[\\/*?:"<>|]', "", name).strip()
    return cleaned[:80] if cleaned else "media_download"

def detect_platform(url: str) -> Optional[str]:
    raw = url.strip().lower()
    if re.search(r"https?://(?:[a-zA-Z0-9-]+\.)?tiktok\.com/", raw):
        return "tiktok"
    if re.search(r"https?://(?:www\.)?(?:instagram\.com|instagr\.am)/", raw):
        return "instagram"
    if re.search(r"https?://(?:[a-zA-Z0-9-]+\.)?(?:youtube\.com|youtu\.be)/", raw):
        return "youtube"
    return None

def is_youtube_playlist(url: str) -> bool:
    raw = url.strip().lower()
    return ("list=" in raw or "/playlist" in raw) and ("youtube.com" in raw or "youtu.be" in raw)

def extract_instagram_shortcode(url: str) -> Optional[str]:
    m = re.search(r"(?:instagram\.com|instagr\.am)/(?:reel|reels|p|tv)/([a-zA-Z0-9_-]+)", url)
    return m.group(1) if m else None

def fmt_duration(s) -> str:
    if not s:
        return "00:00"
    try:
        s = int(s)
        hrs, rem = divmod(s, 3600)
        m, sec = divmod(rem, 60)
        if hrs > 0:
            return f"{hrs}:{m:02d}:{sec:02d}"
        return f"{m:02d}:{sec:02d}"
    except Exception:
        return "00:00"

def sweep_old_files(max_age_seconds=1800):
    try:
        now = time.time()
        for f in DOWNLOAD_DIR.glob("dl_*"):
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
    return {
        "status": "ok",
        "version": "5.1.0",
        "platforms": ["tiktok", "instagram", "youtube"],
        "features": ["quality_selection", "playlists"]
    }


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
        raise HTTPException(400, "أدخل رابط فيديو أو قائمة تشغيل.")
    platform = detect_platform(raw)
    if not platform:
        raise HTTPException(400, "رابط غير مدعوم. يُرجى إدخال رابط TikTok أو Instagram أو YouTube.")

    loop = asyncio.get_running_loop()

    # ── 1. YouTube Playlist ──────────────────────────────────────────────────
    if platform == "youtube" and is_youtube_playlist(raw):
        opts: Dict[str, Any] = {
            "extract_flat": "in_playlist",
            "skip_download": True,
            "quiet": True,
            "no_warnings": True,
            "socket_timeout": 20,
        }
        try:
            info = await loop.run_in_executor(None, lambda: _ydl_extract(raw, opts))
        except Exception as e:
            logger.error(f"Playlist analyze error: {e}")
            raise HTTPException(500, f"فشل قراءة قائمة التشغيل: {e}")

        raw_entries = info.get("entries") or []
        entries: List[Dict[str, Any]] = []
        for e in raw_entries[:80]:  # Limit to first 80 for fast responsive UI
            vid_id = e.get("id") or e.get("url")
            thumb = e.get("thumbnail")
            thumbs = e.get("thumbnails")
            if thumbs and isinstance(thumbs, list):
                thumb = thumbs[-1].get("url") or thumb
            if not thumb and vid_id:
                thumb = f"https://i.ytimg.com/vi/{vid_id}/hqdefault.jpg"

            entries.append({
                "id": vid_id,
                "title": e.get("title") or "YouTube Video",
                "uploader": e.get("uploader") or e.get("channel") or info.get("uploader") or "YouTube",
                "duration": e.get("duration"),
                "duration_formatted": fmt_duration(e.get("duration")),
                "thumbnail": thumb,
                "url": f"https://www.youtube.com/watch?v={vid_id}" if vid_id and not str(vid_id).startswith("http") else e.get("url"),
            })

        return {
            "status": "success",
            "type": "playlist",
            "platform": "youtube",
            "id": info.get("id") or "playlist",
            "title": info.get("title") or "YouTube Playlist",
            "uploader": info.get("uploader") or info.get("channel") or "Creator",
            "count": len(raw_entries),
            "entries": entries,
            "original_url": raw,
        }

    # ── 2. Instagram Video / Reel ────────────────────────────────────────────
    if platform == "instagram":
        shortcode = extract_instagram_shortcode(raw)
        if not shortcode:
            raise HTTPException(400, "تعذّر استخراج كود المنشور من رابط Instagram.")
        try:
            loader = get_instaloader()
            post = await loop.run_in_executor(
                None, lambda: instaloader.Post.from_shortcode(loader.context, shortcode)
            )
        except Exception as e:
            logger.error(f"Instagram analyze error: {e}")
            raise HTTPException(404, "تعذّر الوصول لمنشور Instagram. تأكد من أن الحساب عام والمنشور متاح.")

        if not post.is_video:
            raise HTTPException(400, "الرابط المحدد هو صورة وليس فيديو. الأداة مخصصة للفيديوهات (Reels / Videos).")

        caption = (post.caption or "").strip()
        first_line = caption.split("\n")[0] if caption else "Instagram Reel"
        title = first_line[:100] if first_line else "Instagram Reel"
        duration = getattr(post, "video_duration", None)
        uploader = post.owner_username or "instagram_user"

        return {
            "status": "success",
            "type": "video",
            "platform": "instagram",
            "id": shortcode,
            "title": title,
            "uploader": f"@{uploader}",
            "uploader_id": uploader,
            "duration": duration,
            "duration_formatted": fmt_duration(duration),
            "thumbnail": post.url,
            "width": None,
            "height": None,
            "resolution_label": "Original Quality (HD)",
            "fps": None,
            "fps_label": "Original FPS",
            "view_count": getattr(post, "video_view_count", None),
            "like_count": getattr(post, "likes", None),
            "comment_count": getattr(post, "comments", None),
            "original_url": raw,
            "qualities": [
                {"quality": "best", "label": "Original Quality (HD)"}
            ],
        }

    # ── 3. YouTube Single Video or TikTok ────────────────────────────────────
    opts: Dict[str, Any] = {
        "skip_download": True,
        "quiet":         True,
        "no_warnings":   True,
        "socket_timeout": 20,
    }
    if DEFAULT_IMPERSONATE and platform == "tiktok":
        opts["impersonate"] = DEFAULT_IMPERSONATE

    try:
        info = await loop.run_in_executor(None, lambda: _ydl_extract(raw, opts))
    except Exception as e:
        msg = str(e)
        logger.error(f"{platform} analyze error: {msg}")
        if "Private" in msg: raise HTTPException(403, "الفيديو خاص.")
        if "blocked" in msg: raise HTTPException(403, "الـ IP محظور مؤقتاً.")
        if "not found" in msg.lower(): raise HTTPException(404, "الفيديو غير موجود أو محذوف.")
        raise HTTPException(500, f"فشل جلب المعلومات: {msg}")

    if not info:
        raise HTTPException(404, "لم يُعثر على بيانات الفيديو.")

    formats = info.get("formats") or []
    w = info.get("width")
    h = info.get("height")
    fps = info.get("fps")

    # Determine qualities
    qualities = []
    if platform == "youtube":
        avail_heights = sorted(list(set(
            f.get("height") for f in formats if f.get("height") and f.get("vcodec") != "none"
        )), reverse=True)
        for q in [2160, 1440, 1080, 720, 480, 360]:
            if any(ah >= q for ah in avail_heights):
                suffix = " (4K)" if q == 2160 else " (2K)" if q == 1440 else " (1080p FHD)" if q == 1080 else " (720p HD)" if q == 720 else ""
                qualities.append({"quality": str(q), "label": f"{q}p{suffix}"})
        if not qualities:
            qualities.append({"quality": "best", "label": "Best Available (HD)"})
    else:
        qualities.append({"quality": "best", "label": "Original Quality (HD)"})

    # Find highest res for preview
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
        "type": "video",
        "platform": platform,
        "id":     str(info.get("id", "video")),
        "title":  info.get("title") or f"{platform.capitalize()} Video",
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
        "qualities": qualities,
    }


# ── Download ───────────────────────────────────────────────────────────────────

def _ydl_download(url: str, opts: dict):
    with yt_dlp.YoutubeDL(opts) as ydl:
        return ydl.extract_info(url, download=True)

@app.get("/api/download")
async def download(
    background_tasks: BackgroundTasks,
    url: str               = Query(...),
    format: str            = Query("mp4", pattern="^(mp4|mp3)$"),
    quality: Optional[str] = Query("best"),
):
    raw = url.strip()
    platform = detect_platform(raw)
    if not platform:
        raise HTTPException(400, "رابط غير مدعوم.")

    sweep_old_files()
    loop = asyncio.get_running_loop()
    ffmpeg = get_ffmpeg()
    sid    = f"{int(time.time())}_{os.urandom(4).hex()}"

    # ── Instagram Download ───────────────────────────────────────────────────
    if platform == "instagram":
        shortcode = extract_instagram_shortcode(raw)
        if not shortcode:
            raise HTTPException(400, "رابط Instagram غير صالح.")

        loader = get_instaloader()
        try:
            post = await loop.run_in_executor(
                None, lambda: instaloader.Post.from_shortcode(loader.context, shortcode)
            )
        except Exception as e:
            logger.error(f"Instagram download info error: {e}")
            raise HTTPException(404, "تعذّر جلب فيديو Instagram.")

        if not post.video_url:
            raise HTTPException(400, "لا يحتوي المنشور على رابط فيديو قابل للتنزيل.")

        mp4_path = str(DOWNLOAD_DIR / f"dl_{sid}.mp4")

        try:
            async with httpx.AsyncClient(timeout=40, follow_redirects=True) as client:
                async with client.stream("GET", post.video_url) as resp:
                    if resp.status_code != 200:
                        raise HTTPException(502, "فشل جلب ملف الفيديو من سيرفرات Instagram.")
                    with open(mp4_path, "wb") as f:
                        async for chunk in resp.aiter_bytes(chunk_size=65536):
                            f.write(chunk)
        except Exception as e:
            logger.error(f"Download IG stream error: {e}")
            raise HTTPException(500, f"فشل تحميل الفيديو: {e}")

        caption = (post.caption or "").strip()
        first_line = caption.split("\n")[0] if caption else "Instagram"
        title = sanitize(f"{first_line[:40]} - {post.owner_username}")

        if format == "mp3" and ffmpeg:
            mp3_path = str(DOWNLOAD_DIR / f"dl_{sid}.mp3")
            try:
                cmd = [ffmpeg, "-y", "-i", mp4_path, "-vn", "-b:a", "320k", mp3_path]
                await loop.run_in_executor(None, lambda: subprocess.run(cmd, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, check=True))
                background_tasks.add_task(_del, mp4_path)
                background_tasks.add_task(_del, mp3_path)
                filename = f"{title}.mp3"
                ascii_fn = re.sub(r"[^\x00-\x7F]+", "_", filename).strip("_") or "media_audio"
                return FileResponse(
                    path=mp3_path,
                    media_type="audio/mpeg",
                    filename=filename,
                    headers={
                        "Content-Disposition": f'attachment; filename="{ascii_fn}"; filename*=UTF-8\'\'{quote(filename)}',
                        "Cache-Control": "no-cache",
                    },
                )
            except Exception as e:
                logger.warning(f"Audio conversion failed: {e}")

        background_tasks.add_task(_del, mp4_path)
        filename = f"{title}.mp4"
        ascii_fn = re.sub(r"[^\x00-\x7F]+", "_", filename).strip("_") or "media_video"
        return FileResponse(
            path=mp4_path,
            media_type="video/mp4",
            filename=filename,
            headers={
                "Content-Disposition": f'attachment; filename="{ascii_fn}"; filename*=UTF-8\'\'{quote(filename)}',
                "Cache-Control": "no-cache",
            },
        )

    # ── TikTok & YouTube Download ────────────────────────────────────────────
    out = str(DOWNLOAD_DIR / f"dl_{sid}")
    opts: Dict[str, Any] = {
        "quiet":          True,
        "no_warnings":    True,
        "outtmpl":        f"{out}.%(ext)s",
        "socket_timeout": 35,
    }
    if DEFAULT_IMPERSONATE and platform == "tiktok":
        opts["impersonate"] = DEFAULT_IMPERSONATE
    if ffmpeg:
        opts["ffmpeg_location"] = ffmpeg

    if format == "mp4":
        if platform == "youtube" and quality and quality.isdigit():
            h = int(quality)
            opts["format"] = f"bestvideo[height<={h}][ext=mp4]+bestaudio[ext=m4a]/bestvideo[height<={h}]+bestaudio/b[height<={h}]/b/best"
        else:
            opts["format"] = "bestvideo[ext=mp4]+bestaudio[ext=m4a]/bestvideo+bestaudio/b/best"
        opts["merge_output_format"] = "mp4"
    else:
        opts["format"] = "bestaudio/best"
        if ffmpeg:
            opts["postprocessors"] = [{
                "key":              "FFmpegExtractAudio",
                "preferredcodec":   "mp3",
                "preferredquality": "320",
            }]

    try:
        info = await loop.run_in_executor(None, lambda: _ydl_download(raw, opts))
    except Exception as e:
        msg = str(e)
        logger.error(f"Download error: {msg}")
        if "blocked" in msg:
            raise HTTPException(403, "الـ IP محظور مؤقتاً من السيرفر.")
        if "Private" in msg:
            raise HTTPException(403, "الفيديو خاص.")
        raise HTTPException(500, f"فشل التحميل: {msg}")

    matches = glob.glob(f"{out}.*")
    if not matches:
        raise HTTPException(500, "لم يُعثر على الملف بعد التحميل.")

    file_path = matches[0]
    ext       = os.path.splitext(file_path)[1].lstrip(".")
    title     = info.get("title") or f"{platform}_media"
    uploader  = info.get("uploader") or ""
    name      = sanitize(f"{title} - {uploader}" if uploader else title)
    filename  = f"{name}.{ext}"

    ascii_fn  = re.sub(r"[^\x00-\x7F]+", "_", filename).strip("_") or "media_file"
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
        else "<h1>TikTok, Instagram & YouTube Downloader</h1>"
    )

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
