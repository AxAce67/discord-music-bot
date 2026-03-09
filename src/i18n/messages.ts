import type { LanguageCode } from "../types/music.js";

export const languages = ["ja", "en"] as const;

export function isLanguageCode(value: string): value is LanguageCode {
  return (languages as readonly string[]).includes(value);
}

export const messages = {
  ja: {
    languageName: "日本語",
    slashLangDescription: "bot の表示言語を切り替えます。",
    slashLangOption: "language",
    slashLangChoiceJa: "日本語",
    slashLangChoiceEn: "英語",
    vcJoined: "VC に参加しました",
    trackSkipped: "現在の曲をスキップしました",
    resumedFromQueue: "キューの先頭から再開しました",
    paused: "一時停止しました",
    resumed: "再生を再開しました",
    repeatOn: "現在の曲をリピートします",
    repeatOff: "リピートをオフにしました",
    shuffled: "キューをシャッフルしました",
    shuffleInsufficient: "シャッフルできる曲が足りません",
    stopped: "再生を停止し、キューを消去しました",
    queueShown: "キューUIを表示しました",
    leftVoice: "VC から退出しました",
    autoLeftIdle: "ほかのユーザーが3分間いなかったため、VC から自動退出しました",
    restartedQueueKept: "Botが再起動しました",
    playStarted: "再生開始しました",
    queued: "キューに追加しました",
    playlistStarted: "プレイリストの再生を開始しました",
    playlistQueued: "プレイリストをキューに追加しました",
    tracksCount: (count: number) => `${count} 曲`,
    languageSet: (name: string) => `表示言語を ${name} に変更しました。`,
    invalidLanguage: "言語は ja または en を指定してください",
    helpTitle: "📘 ヘルプ",
    helpDescription: "Kanade で使える主なコマンドです",
    helpSectionPlay: "再生",
    helpSectionPlaylist: "プレイリスト",
    helpSectionControls: "操作",
    helpSectionUtility: "その他",
    statsTitle: "📊 利用状況",
    statsServers: "サーバー数",
    statsUsers: "利用人数",
    statsTotalPlays: "総再生回数",
    statsUniqueTracks: "ユニーク曲数",
    helpPlay: "`/play <query>` / `!play <query>`\n曲名で検索するか URL を入れて再生・追加します",
    helpPlaylist: "`/playlist <url>` / `!playlist <url>`\nYouTube プレイリストをまとめてキューに追加します",
    helpControls: "`/pause` ` /skip` ` /stop` ` /queue` ` /leave`\n再生中の曲やキューを操作します",
    helpUtility: "`/repeat` ` /shuffle` ` /lang <ja|en>`\nリピート、シャッフル、表示言語の切り替えです",
    helpMixNote:
      "※ YouTube Mix / Radio (`RD...`) は動的プレイリストのため、ブラウザ表示と曲順・内容が完全一致しない場合があります",
    playlistMixNote:
      "※ YouTube Mix / Radio は動的プレイリストのため、ブラウザ表示と曲順・内容が完全一致しない場合があります",
    controlStopped: "⏹ 停止中",
    controlIdle: "🎶 待機中",
    controlPaused: "⏸ 一時停止中",
    controlPlaying: "🎵 再生中",
    controlRepeating: "🔁 リピート中",
    controlStoppedDescription: "前回のキューを保持しています。Botがオンラインの場合はボイスチャンネルに参加して `再開` ボタンで続きから再生できます。",
    controlIdleDescription: "ボイスチャンネルに参加して `!play 曲名` または `!play URL` で再生を開始できます",
    controlUsage: "使い方",
    controlUsageValue: "`!play 曲名` または `/play 曲名`",
    controlUpNext: "次の曲",
    controlNoNext: "次の曲はありません",
    controlProgress: "再生位置",
    controlRequestedBy: "リクエスト",
    controlButtonResume: "再開",
    controlButtonPause: "一時停止",
    controlButtonSkip: "スキップ",
    controlButtonStop: "停止",
    controlButtonLeave: "退出",
    controlButtonRepeat: "リピート",
    controlButtonRepeating: "リピート中",
    controlButtonShuffle: "シャッフル",
    controlButtonQueue: "キュー",
    queueTitle: "📜 キュー",
    queueNowPlaying: "再生中",
    queueNoCurrent: "現在の曲はありません",
    queuePage: (page: number, total: number) => `次の曲 ${page}/${total}`,
    queueSelected: (index: number) => `削除対象: ${index}曲目`,
    queueTotal: (count: number) => `合計 ${count} 曲`,
    queuePrev: "前へ",
    queueNext: "次へ",
    queueRemove: "削除",
    queueClose: "閉じる",
    queueSelectPlaceholder: "削除する曲を選択",
    queueExpired: "このキュービューは期限切れです",
    queueOwnerOnly: "このキュービューは作成者のみ操作できます",
    queueSelectRequired: "削除する曲を選択してください",
    queueRemovedTitle: "削除しました",
    searchTitle: "🔎 検索結果",
    searchDescription: "再生する曲を選んでください",
    searchResults: (count: number) => `候補 ${count} 件`,
    searchPlaceholder: "再生する曲を選択",
    searchClose: "閉じる",
    searchExpired: "この検索結果は期限切れです",
    searchOwnerOnly: "この検索結果は実行した本人のみ操作できます",
    errorFallback: "処理に失敗しました"
  },
  en: {
    languageName: "English",
    slashLangDescription: "Change the bot display language.",
    slashLangOption: "language",
    slashLangChoiceJa: "Japanese",
    slashLangChoiceEn: "English",
    vcJoined: "Joined the voice channel",
    trackSkipped: "Skipped the current track",
    resumedFromQueue: "Resumed from the front of the queue",
    paused: "Paused playback",
    resumed: "Resumed playback",
    repeatOn: "Repeat for the current track is now on",
    repeatOff: "Repeat is now off",
    shuffled: "Shuffled the queue",
    shuffleInsufficient: "Not enough tracks to shuffle",
    stopped: "Stopped playback and cleared the queue",
    queueShown: "Displayed the queue UI",
    leftVoice: "Left the voice channel",
    autoLeftIdle: "Left the voice channel automatically because no other users were present for 3 minutes",
    restartedQueueKept: "The bot restarted",
    playStarted: "Started playback",
    queued: "Added to queue",
    playlistStarted: "Started playlist playback",
    playlistQueued: "Added playlist to queue",
    tracksCount: (count: number) => `${count} tracks`,
    languageSet: (name: string) => `Changed the display language to ${name}.`,
    invalidLanguage: "Language must be ja or en",
    helpTitle: "📘 Help",
    helpDescription: "Main commands you can use in Kanade",
    helpSectionPlay: "Play",
    helpSectionPlaylist: "Playlist",
    helpSectionControls: "Controls",
    helpSectionUtility: "Utility",
    statsTitle: "📊 Stats",
    statsServers: "Servers",
    statsUsers: "Users",
    statsTotalPlays: "Total plays",
    statsUniqueTracks: "Unique tracks",
    helpPlay: "`/play <query>` / `!play <query>`\nSearch by title or enter a URL to play or enqueue",
    helpPlaylist: "`/playlist <url>` / `!playlist <url>`\nAdd a YouTube playlist to the queue",
    helpControls: "`/pause` ` /skip` ` /stop` ` /queue` ` /leave`\nControl the current track and queue",
    helpUtility: "`/repeat` ` /shuffle` ` /lang <ja|en>`\nToggle repeat, shuffle the queue, and switch language",
    helpMixNote:
      "Note: YouTube Mix / Radio (`RD...`) is dynamic, so track order and contents may not exactly match what you see in the browser",
    playlistMixNote:
      "Note: YouTube Mix / Radio is dynamic, so track order and contents may not exactly match what you see in the browser",
    controlStopped: "⏹ Stopped",
    controlIdle: "🎶 Idle",
    controlPaused: "⏸ Paused",
    controlPlaying: "🎵 Now Playing",
    controlRepeating: "🔁 Repeating",
    controlStoppedDescription: "Your previous queue is still saved. If the bot is online, join a voice channel and press `Resume` to continue",
    controlIdleDescription: "Join a voice channel and use `!play <song>` or `!play <url>` to start playback",
    controlUsage: "Get started",
    controlUsageValue: "`!play <song>` or `/play <song>`",
    controlUpNext: "Up next",
    controlNoNext: "No upcoming tracks",
    controlProgress: "Progress",
    controlRequestedBy: "Requested by",
    controlButtonResume: "Resume",
    controlButtonPause: "Pause",
    controlButtonSkip: "Skip",
    controlButtonStop: "Stop",
    controlButtonLeave: "Leave",
    controlButtonRepeat: "Repeat",
    controlButtonRepeating: "Repeating",
    controlButtonShuffle: "Shuffle",
    controlButtonQueue: "Queue",
    queueTitle: "📜 Queue",
    queueNowPlaying: "Now playing",
    queueNoCurrent: "Nothing is currently playing",
    queuePage: (page: number, total: number) => `Up next ${page}/${total}`,
    queueSelected: (index: number) => `Selected for removal: #${index}`,
    queueTotal: (count: number) => `${count} tracks total`,
    queuePrev: "Prev",
    queueNext: "Next",
    queueRemove: "Remove",
    queueClose: "Close",
    queueSelectPlaceholder: "Select a track to remove",
    queueExpired: "This queue view has expired",
    queueOwnerOnly: "Only the person who opened this queue can use it",
    queueSelectRequired: "Select a track to remove",
    queueRemovedTitle: "Removed",
    searchTitle: "🔎 Search Results",
    searchDescription: "Choose a track to play",
    searchResults: (count: number) => `${count} matches`,
    searchPlaceholder: "Choose a track to play",
    searchClose: "Close",
    searchExpired: "This search result has expired",
    searchOwnerOnly: "Only the person who ran this search can use it",
    errorFallback: "The operation failed"
  }
} as const;

export function getMessages(language: LanguageCode) {
  return messages[language];
}

export function translateErrorCode(language: LanguageCode, code: string, fallback: string): string {
  const translations: Record<string, { ja: string; en: string }> = {
    GUILD_ONLY: {
      ja: "このコマンドはサーバー内でのみ使えます\nサーバーのテキストチャンネルで使えます",
      en: "This command can only be used in a server\nRun it in a server text channel"
    },
    TEXT_CHANNEL_REQUIRED: {
      ja: "この場所では使えません\n通常のテキストチャンネルで使えます",
      en: "Run this in a text channel\nIt is not available in DMs"
    },
    MEMBER_REQUIRED: {
      ja: "メンバー情報を取得できませんでした\nしばらく待ってからもう一度試してください",
      en: "Could not load member information\nPlease try again in a moment"
    },
    RESUME_VOICE_REQUIRED: {
      ja: "まだVCに参加していません\nVCに入ってから `再開` ボタンを押すと続きから再生できます",
      en: "Join a voice channel first\nThen press `Resume` or enter !play <song> or !play <url>"
    },
    VOICE_REQUIRED: {
      ja: "まだVCに参加していません\nVCに入ってから曲名またはURLを送ると再生できます",
      en: "Join a voice channel first\nThen enter !play <song> or !play <url>"
    },
    VOICE_MISMATCH: {
      ja: "bot と別のVCに参加しています\n同じチャンネルに入ると操作できます",
      en: "Join the same voice channel as the bot before using this\nThen try again"
    },
    TRACK_NOT_FOUND: {
      ja: "該当する曲が見つかりませんでした\n曲名を変えるかURLを見直すと再生できる場合があります",
      en: "No matching track was found\nTry a different query or a valid URL"
    },
    TRACK_RESOLVE_FAILED: {
      ja: "URLから曲情報を取得できませんでした\n有効なYouTube URLだとそのまま再生できます",
      en: "Failed to resolve track information\nEnter a valid YouTube URL"
    },
    PLAYLIST_NOT_FOUND: {
      ja: "プレイリストを取得できませんでした\n公開されたYouTubeプレイリストURLで試すと解決する場合があります",
      en: "Could not load the playlist\nTry a public YouTube playlist URL"
    },
    LAVALINK_UNAVAILABLE: {
      ja: "音声サーバーにまだ接続できていません\n少し待つと使えるようになる場合があります",
      en: "The audio server is unavailable\nPlease try again in a moment"
    },
    RESOLVER_UNAVAILABLE: {
      ja: "曲情報の取得サービスに接続できませんでした\n少し待ってからもう一度試すと解決する場合があります",
      en: "The resolver service is unavailable\nPlease try again in a moment"
    },
    RESOLVER_BAD_RESPONSE: {
      ja: "曲情報の取得サービスから正しい応答を受け取れませんでした\n少し待ってからもう一度試すと解決する場合があります",
      en: "The resolver service returned an invalid response\nPlease try again in a moment"
    },
    RESOLVER_UPSTREAM_FAILED: {
      ja: "この動画は取得できませんでした\n別のURLか曲名検索で試すと再生できる場合があります",
      en: "This video could not be resolved\nTry a different URL or search by title"
    },
    BAD_REQUEST: {
      ja: "曲情報の取得に失敗しました\n入力した内容を見直すと解決する場合があります",
      en: "The request could not be resolved\nCheck the query or URL and try again"
    },
    VOICE_CONNECT_FAILED: {
      ja: "VCへの接続に失敗しました\n権限や接続先チャンネルを見直すと解決する場合があります",
      en: "Failed to connect to the voice channel\nCheck permissions and the target channel"
    },
    QUEUE_EMPTY: {
      ja: "まだ曲が入っていません\n!play 曲名 または !play URL で再生できます",
      en: "Nothing is playing right now\nAdd a track with !play <song> or !play <url>"
    },
    PLAYER_NOT_FOUND: {
      ja: "再生プレイヤーが見つかりません\nもう一度再生を始めると解決する場合があります",
      en: "The playback session could not be found\nStart playback again"
    },
    QUEUE_INDEX_INVALID: {
      ja: "削除する曲が見つかりません\nキューを開き直すと選び直せます",
      en: "That track could not be found\nReopen the queue and select it again"
    },
    SEARCH_PICK_INVALID: {
      ja: "選択した候補が見つかりません\n検索し直すともう一度選べます",
      en: "That result could not be found\nSearch again and choose it again"
    },
    SEARCH_PICKER_UNAVAILABLE: {
      ja: "このチャンネルでは検索結果を表示できません\n通常のテキストチャンネルなら使えます",
      en: "Search results cannot be shown in this channel\nTry again in a regular text channel"
    },
    QUEUE_VIEW_UNAVAILABLE: {
      ja: "このチャンネルではキューを表示できません\n通常のテキストチャンネルなら表示できます",
      en: "The queue cannot be shown in this channel\nTry again in a regular text channel"
    },
    PLAYLIST_URL_REQUIRED: {
      ja: "プレイリストURLがまだ入力されていません\n!playlist YouTubeプレイリストURL で読み込めます",
      en: "Enter !playlist <YouTube playlist URL>"
    },
    QUERY_REQUIRED: {
      ja: "曲名またはURLがまだ入力されていません\n!play 曲名 または !play URL で再生できます",
      en: "Enter !play <song> or !play <url>"
    },
    UNKNOWN_COMMAND: {
      ja: "そのコマンドにはまだ対応していません\n/help を開くと使い方を確認できます",
      en: "Unknown command\nUse /help to see available commands"
    },
    INVALID_LANGUAGE: {
      ja: "言語指定が正しくありません\n!lang ja または !lang en で切り替えできます",
      en: "Enter !lang ja or !lang en"
    }
  };

  return translations[code]?.[language] ?? fallback;
}
