# 🎬 TikTok Media Downloader (HD Video & Audio MP3)

A modern, high-performance web application designed to extract and download TikTok videos and isolated audio tracks with **no watermarks**, **original resolution**, and **authentic FPS (frame rate)**.

Built with **FastAPI**, **yt-dlp**, and a sleek, dark-themed responsive frontend powered by **Tailwind CSS**.

---

## ✨ Features

- 📐 **True Video Metadata Extraction**: Automatically detects and displays:
  - Original resolution (e.g., `1080 × 1920 (FHD)`, `720 × 1280 (HD)`, `4K`)
  - Original frame rate (e.g., `60 FPS`, `30 FPS`)
  - Creator handle (`@username`) & avatar
  - Video title and description
  - High-resolution thumbnail and duration
- 🎬 **Two High-Fidelity Download Modes**:
  1. **Download Video (MP4)**: Native stream pass-through preserving maximum clarity and original FPS without lossy re-encoding.
  2. **Download Audio (MP3)**: Isolates the sound track and encodes to high-bitrate **320kbps MP3** audio.
- 🧹 **Automatic Server Cleanup**: Temporary files are deleted immediately after delivery using asynchronous background tasks. Periodic sweeper cleans any orphaned files older than 15 minutes.
- 💎 **Modern Dark UI/UX**:
  - Glassmorphic translucent cards and neon TikTok accents.
  - One-click clipboard paste button and automatic link detection.
  - Interactive loading spinners and download status feedback.
  - Fully responsive for mobile phones, tablets, and desktop displays.
- 🛡️ **Robust Error Handling**: Catches private videos, deleted content, rate limits, and invalid URLs with clear error messages.

---

## 📁 Project Structure

```
├── main.py               # FastAPI backend with yt-dlp extraction and cleanup logic
├── requirements.txt      # Python dependencies (FastAPI, yt-dlp, imageio-ffmpeg, etc.)
├── Dockerfile            # Container definition with Python 3.11 & FFmpeg
├── render.yaml           # One-click Render.com deployment blueprint
├── run.bat               # Windows batch launcher (1-click run)
├── setup.ps1             # PowerShell automated setup script
├── static/
│   ├── index.html        # Modern Tailwind CSS single-page web UI
│   └── app.js            # Client-side state, API calls, and animations
└── README.md             # Documentation and deployment guides
```

---

## 🚀 Quick Start (Local Setup)

### Option 1: Automatic Windows Launcher (Easiest)
Double-click `run.bat` or run:
```cmd
run.bat
```
This will automatically verify Python, install dependencies into a virtual environment, launch the server, and open your default browser at `http://127.0.0.1:8000`.

---

### Option 2: PowerShell
Run the setup script:
```powershell
.\setup.ps1
```

---

### Option 3: Manual Installation (Windows / macOS / Linux)

1. **Clone or Navigate to the directory**:
   ```bash
   cd "tiktok-downloader"
   ```

2. **Create and activate a virtual environment**:
   ```bash
   # On Windows
   python -m venv venv
   venv\Scripts\activate

   # On macOS / Linux
   python3 -m venv venv
   source venv/bin/activate
   ```

3. **Install dependencies**:
   ```bash
   pip install -r requirements.txt
   ```

   > **Note on FFmpeg**: `imageio-ffmpeg` is included in `requirements.txt` to provide an FFmpeg binary automatically. If you have system FFmpeg installed (`apt install ffmpeg` or `brew install ffmpeg`), the app will automatically detect and prioritize it.

4. **Start the application**:
   ```bash
   uvicorn main:app --reload --host 0.0.0.0 --port 8000
   ```

5. Open your browser at **`http://localhost:8000`**.
   - Interactive API documentation is available at **`http://localhost:8000/docs`**.

---

## 🌐 Cloud Deployment Guide

### Deploying to Render.com (Recommended - Free & Easy)

Because this app uses `yt-dlp` and `FFmpeg`, deploying with **Docker** is the most reliable option:

1. Push your repository to **GitHub** or **GitLab**.
2. Log into [Render.com](https://render.com) and click **New +** -> **Web Service**.
3. Connect your repository.
4. Select **Docker** as the environment (Render will automatically detect the included `Dockerfile`).
5. Choose the **Free** instance type.
6. Click **Create Web Service**. Render will build the container, install FFmpeg, and launch the app with an HTTPS URL.

*(Alternatively, use `render.yaml` via Render Blueprints).*

---

### Deploying to Railway.app

1. Go to [Railway.app](https://railway.app) and create a **New Project**.
2. Select **Deploy from GitHub repo**.
3. Railway automatically detects the `Dockerfile` and builds the service with all system dependencies and FFmpeg configured.

---

### Notes for Vercel / Serverless Functions

> **Important**: Standard Vercel Serverless Functions have a 250MB execution limit and do not include system FFmpeg binaries. If you wish to use Vercel for the frontend, you can deploy `static/index.html` on Vercel and point `app.js` API calls to your FastAPI backend hosted on Render, Railway, or Fly.io.

---

## 📡 API Endpoints

### 1. Analyze TikTok URL
- **Endpoint**: `POST /api/analyze`
- **Request Body**:
  ```json
  {
    "url": "https://www.tiktok.com/@username/video/1234567890123456789"
  }
  ```
- **Response**:
  ```json
  {
    "status": "success",
    "id": "1234567890123456789",
    "title": "Creative TikTok Video Title",
    "uploader": "creator_username",
    "uploader_id": "creator_id",
    "duration": 42,
    "duration_formatted": "00:42",
    "thumbnail": "https://p16-sign-va.tiktokcdn.com/...",
    "width": 1080,
    "height": 1920,
    "resolution_label": "1080 × 1920 (1080p FHD)",
    "fps": 60.0,
    "fps_label": "60 FPS",
    "original_url": "https://www.tiktok.com/@username/video/..."
  }
  ```

### 2. Download Media Stream
- **Endpoint**: `GET /api/download?url={url}&format={format}`
- **Query Parameters**:
  - `url` (required): URL-encoded TikTok link.
  - `format` (optional): `mp4` for original video or `mp3` for audio only.
- **Behavior**:
  - Streams the file with `Content-Disposition: attachment`.
  - Dispatches an asynchronous `BackgroundTask` to safely delete the file from the server immediately after transfer.

---

## 🔒 Privacy & Terms

- **Zero Logging**: Videos are not stored permanently.
- **Fair Use**: Intended for personal backups and educational purposes. Always respect creator rights and platform terms.
