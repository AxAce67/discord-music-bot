# Kanade Resolver Service

FastAPI + `yt-dlp` based metadata resolver for Kanade.

## Endpoints

- `GET /health`
- `POST /v1/search`
- `POST /v1/resolve`
- `POST /v1/resolve-playlist`

## Local Run

```bash
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn app:app --host 127.0.0.1 --port 8080
```

Windows:

```powershell
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
uvicorn app:app --host 127.0.0.1 --port 8080
```

## Environment

Copy `.env.example` and set:

- `RESOLVER_HOST`
- `RESOLVER_PORT`
- `RESOLVER_LOG_LEVEL`
- `YTDLP_BINARY`

`yt-dlp` must be available on PATH or explicitly configured with `YTDLP_BINARY`.

## systemd

```ini
[Unit]
Description=Kanade Resolver Service
After=network.target

[Service]
Type=simple
WorkingDirectory=/opt/music-bot/resolver-service
ExecStart=/usr/bin/python3 -m uvicorn app:app --host 127.0.0.1 --port 8080
Restart=always
User=musicbot

[Install]
WantedBy=multi-user.target
```
