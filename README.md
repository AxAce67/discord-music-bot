# Discord Music Bot

TypeScript + `discord.js` + Lavalink で構成した Discord 音楽 bot です。  
スラッシュコマンド、プレフィックスコマンド、埋め込み + ボタン UI を同じサービス層で扱います。

## Features

- `/join`, `/play`, `/skip`, `/stop`, `/queue`, `/leave`
- `!join`, `!play`, `!skip`, `!stop`, `!queue`, `!leave`
- ギルド単位のキュー管理
- SQLite 永続化
- Discord 内の再生操作 UI
- Lavalink ベースの音声再生

## Setup

1. `.env.example` を `.env` にコピーして値を設定します。
2. `npm install`
3. Lavalink を起動します。

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\start-lavalink.ps1
```

4. 別ターミナルでスラッシュコマンドを登録します。

```powershell
npm run register:commands
```

5. bot を起動します。

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\start-bot.ps1
```

## Environment Variables

`.env.example` を参照してください。

## VPS Operation

### PM2

```bash
npm run build
pm2 start dist/index.js --name music-bot
pm2 save
```

### systemd

```ini
[Unit]
Description=Discord Music Bot
After=network.target

[Service]
Type=simple
WorkingDirectory=/opt/music-bot
ExecStart=/usr/bin/node /opt/music-bot/dist/index.js
Restart=always
User=musicbot
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
```

## Notes

- YouTube 再生は Lavalink 側の source/plugin 構成に依存します。
- Spotify の直接再生は未対応です。
- ローカル検証用に `lavalink/Lavalink.jar` と `lavalink/application.yml` を同梱する前提です。
# discord-music-bot
