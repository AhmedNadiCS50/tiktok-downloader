# Use official lightweight Python image
FROM python:3.11-slim

# Set working directory
WORKDIR /app

# Install system dependencies including FFmpeg for audio/video muxing
RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg \
    ca-certificates \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Copy requirements and install Python dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy application code
COPY . .

# Create temp downloads directory with proper permissions
RUN mkdir -p /app/temp_downloads

# Expose default port
EXPOSE 8000

# Default environment variables
ENV PYTHONUNBUFFERED=1
ENV PORT=8000

# Run Uvicorn server binding to dynamic port for Render / Fly / Railway compatibility
CMD ["sh", "-c", "uvicorn main:app --host 0.0.0.0 --port ${PORT:-8000}"]
