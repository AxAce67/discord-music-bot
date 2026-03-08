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
- `YTDLP_COOKIES_FILE` (optional)
- `YTDLP_EXTRACTOR_ARGS` (optional)
- `YTDLP_SLEEP_INTERVAL_SECONDS` (optional)

`yt-dlp` must be available on PATH or explicitly configured with `YTDLP_BINARY`.

If YouTube starts returning `Sign in to confirm you're not a bot`, export a `cookies.txt`
file from a browser session and point `YTDLP_COOKIES_FILE` at it.

Example:

```env
YTDLP_COOKIES_FILE=/opt/music-bot/resolver-service/cookies.txt
```

File permissions should be restricted because the cookies file is effectively a login session.

## VPS hardening

If plain cookies still fail on a VPS, the next realistic `yt-dlp` path is:

1. install a PO Token provider plugin
2. switch the YouTube extractor to an mweb client
3. keep the cookies file enabled

Example `.env`:

```env
YTDLP_COOKIES_FILE=/opt/music-bot/resolver-service/cookies.txt
YTDLP_EXTRACTOR_ARGS=youtube:player_client=mweb;po_token=mweb.gvs+PO_TOKEN_HERE
YTDLP_SLEEP_INTERVAL_SECONDS=1
```

The exact `po_token` flow depends on the provider/plugin you install on the VPS.
This resolver only forwards the extractor args to `yt-dlp`; it does not generate PO Tokens itself.

## systemd

```ini
[Unit]
Description=Kanade Resolver Service
After=network.target

[Service]
Type=simple
WorkingDirectory=/opt/music-bot/resolver-service
EnvironmentFile=-/opt/music-bot/resolver-service/.env
ExecStart=/usr/bin/python3 -m uvicorn app:app --host 127.0.0.1 --port 8080
Restart=always
User=musicbot

[Install]
WantedBy=multi-user.target
```

## Quick VPS check

After placing `cookies.txt`, verify `yt-dlp` directly before testing Kanade:

```bash
cd /opt/music-bot/resolver-service
source .venv/bin/activate
export YTDLP_COOKIES_FILE=/opt/music-bot/resolver-service/cookies.txt
yt-dlp --dump-single-json --skip-download --format bestaudio/best --no-warnings "https://www.youtube.com/watch?v=dQw4w9WgXcQ"
```
