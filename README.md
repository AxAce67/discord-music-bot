# Discord Music Bot

TypeScript + `discord.js` + Lavalink で構成した Discord 音楽 bot です。  
スラッシュコマンド、プレフィックスコマンド、埋め込み + ボタン UI を同じサービス層で扱います。  
YouTube の検索と URL 解決は、必要に応じて別の resolver-service へ切り出せます。

## Features

- `/join`, `/play`, `/skip`, `/stop`, `/queue`, `/leave`
- `!join`, `!play`, `!skip`, `!stop`, `!queue`, `!leave`
- ギルド単位のキュー管理
- SQLite 永続化
- Discord 内の再生操作 UI
- Lavalink ベースの音声再生
- Optional resolver-service (`FastAPI + yt-dlp`)

## Setup

1. `.env.example` を `.env` にコピーして値を設定します。
2. `npm install`
3. 必要なら resolver-service を起動します。

```bash
cd resolver-service
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
uvicorn app:app --host 127.0.0.1 --port 8080
```

4. Lavalink を起動します。

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\start-lavalink.ps1
```

5. 別ターミナルでスラッシュコマンドを登録します。

```powershell
npm run register:commands
```

6. bot を起動します。

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\start-bot.ps1
```

## Environment Variables

`.env.example` を参照してください。

Resolver を使う場合は以下も設定します。

- `RESOLVER_ENABLED=true`
- `RESOLVER_BASE_URL=http://127.0.0.1:8080`
- `RESOLVER_TIMEOUT_MS=8000`

Resolver 側の設定は `resolver-service/.env.example` を参照してください。

## VPS Operation

### Boot order

同一 VPS では以下の順で起動するのが前提です。

1. `lavalink`
2. `resolver-service`
3. `music-bot`

### PM2

```bash
npm run build
pm2 start dist/src/index.js --name music-bot
pm2 save
```

### systemd

```ini
[Unit]
Description=Discord Music Bot
After=network.target lavalink.service resolver-service.service
Requires=lavalink.service resolver-service.service

[Service]
Type=simple
WorkingDirectory=/opt/music-bot
ExecStart=/usr/bin/node /opt/music-bot/dist/src/index.js
Restart=always
User=musicbot
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
```

Resolver service:

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

Lavalink と resolver-service を使う bot 側の例:

```ini
[Unit]
Description=Discord Music Bot
After=network.target lavalink.service resolver-service.service
Requires=lavalink.service resolver-service.service

[Service]
Type=simple
WorkingDirectory=/opt/music-bot
ExecStart=/usr/bin/node /opt/music-bot/dist/src/index.js
Restart=always
User=musicbot
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
```

## Notes

- YouTube 再生は Lavalink 側の source/plugin 構成に依存します。
- Resolver を有効にすると、曲名検索と YouTube URL 解決は `FastAPI + yt-dlp` 側で処理します。
- `RESOLVER_ENABLED=false` にすると旧 Lavalink resolve 経路へ戻せます。
- Spotify の直接再生は未対応です。
- ローカル検証用に `lavalink/Lavalink.jar` と `lavalink/application.yml` を同梱する前提です。
