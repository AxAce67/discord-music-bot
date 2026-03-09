import { describe, expect, it, vi } from "vitest";
import { DefaultMusicService } from "../src/queue/music-service.js";
import { InMemoryQueueRepository, InMemoryStatsRepository } from "../src/storage/repositories.js";
import type { JoinVoiceRequest, ResolvedTrack } from "../src/audio/audio-backend.js";
import { AudioBackend } from "../src/audio/audio-backend.js";
import pino from "pino";
import { BotStatsService } from "../src/stats/bot-stats-service.js";

class FakeAudioBackend extends AudioBackend {
  public readonly plays: Array<{ encodedTrack?: string; playbackIdentifier?: string }> = [];
  public readonly joins: JoinVoiceRequest[] = [];
  public readonly resolveCalls: string[] = [];
  public stopCalls = 0;
  public connected = false;
  public playbackPosition = 0;

  hasConnection(): boolean {
    return this.connected;
  }

  async join(request: JoinVoiceRequest): Promise<void> {
    this.joins.push(request);
    this.connected = true;
  }

  async leave(): Promise<void> {
    this.connected = false;
  }

  async resolve(query: string): Promise<ResolvedTrack[]> {
    const suffix = String(query);
    this.resolveCalls.push(suffix);
    if (suffix.endsWith("/playlist-1")) {
      return [
        {
          trackId: "track-playlist-1",
          title: "Playlist Track 1",
          url: "https://example.com/playlist-1",
          durationMs: 120000,
          artworkUrl: "https://example.com/art.jpg",
          encodedTrack: "encoded-playlist-1",
          source: "youtube"
        }
      ];
    }

    if (suffix.endsWith("/playlist-2")) {
      return [
        {
          trackId: "track-playlist-2",
          title: "Playlist Track 2",
          url: "https://example.com/playlist-2",
          durationMs: 180000,
          artworkUrl: "https://example.com/art.jpg",
          encodedTrack: "encoded-playlist-2",
          source: "youtube"
        }
      ];
    }

    if (suffix.includes("playlist")) {
      return [
        {
          trackId: "track-playlist-1",
          title: "Playlist Track 1",
          url: "https://example.com/playlist-1",
          durationMs: 120000,
          artworkUrl: "https://example.com/art.jpg",
          encodedTrack: "encoded-playlist-1",
          source: "youtube"
        },
        {
          trackId: "track-playlist-2",
          title: "Playlist Track 2",
          url: "https://example.com/playlist-2",
          durationMs: 180000,
          artworkUrl: "https://example.com/art.jpg",
          encodedTrack: "encoded-playlist-2",
          source: "youtube"
        }
      ];
    }

    return [
      {
        trackId: `track-${suffix}`,
        title: `Test Track ${suffix}`,
        url: `https://example.com/${suffix}`,
        durationMs: 120000,
        artworkUrl: "https://example.com/art.jpg",
        encodedTrack: `encoded-${suffix}`,
        source: "youtube"
      }
    ];
  }

  async resolvePlaylist(query: string): Promise<ResolvedTrack[]> {
    if (String(query).includes("playlist")) {
      return [
        {
          trackId: "track-playlist-1",
          title: "Playlist Track 1",
          url: "https://example.com/playlist-1",
          durationMs: 120000,
          artworkUrl: "https://example.com/art.jpg",
          source: "youtube"
        },
        {
          trackId: "track-playlist-2",
          title: "Playlist Track 2",
          url: "https://example.com/playlist-2",
          durationMs: 180000,
          artworkUrl: "https://example.com/art.jpg",
          source: "youtube"
        }
      ];
    }

    return this.resolve(query);
  }

  async play(
    _guildId: string,
    track: { encodedTrack?: string; playbackIdentifier?: string }
  ): Promise<void> {
    this.plays.push(track);
  }

  getPlaybackPosition(): number {
    return this.playbackPosition;
  }

  getConnectedGuildIds(): string[] {
    return this.connected ? ["guild-1"] : [];
  }

  async stop(guildId: string): Promise<void> {
    this.stopCalls += 1;
    this.emit("trackEnd", guildId);
  }

  async pause(): Promise<void> {}

  async resume(): Promise<void> {}
}

describe("DefaultMusicService", () => {
  function createService(audio: FakeAudioBackend) {
    return new DefaultMusicService(
      new InMemoryQueueRepository(),
      audio,
      new BotStatsService(new InMemoryStatsRepository()),
      pino({ enabled: false })
    );
  }

  it("plays immediately when the queue is empty", async () => {
    const service = createService(new FakeAudioBackend());

    const track = await service.enqueue(
      { guildId: "guild-1", voiceChannelId: "voice-1", textChannelId: "text-1", shardId: 0 },
      { query: "song", requestedBy: "user-1", requestedAt: Date.now() }
    );

    const queue = await service.getQueue("guild-1");
    expect(track.title).toBe("Test Track song");
    expect(track.artworkUrl).toBe("https://example.com/art.jpg");
    expect(queue.currentTrack?.title).toBe("Test Track song");
    expect(queue.upcomingTracks).toHaveLength(0);
  });

  it("queues a second track while a track is already playing", async () => {
    const audio = new FakeAudioBackend();
    const service = createService(audio);

    await service.enqueue(
      { guildId: "guild-1", voiceChannelId: "voice-1", textChannelId: "text-1", shardId: 0 },
      { query: "song-1", requestedBy: "user-1", requestedAt: Date.now() }
    );
    await service.enqueue(
      { guildId: "guild-1", voiceChannelId: "voice-1", textChannelId: "text-1", shardId: 0 },
      { query: "song-2", requestedBy: "user-2", requestedAt: Date.now() }
    );

    const queue = await service.getQueue("guild-1");
    expect(queue.currentTrack?.title).toBe("Test Track song-1");
    expect(queue.upcomingTracks).toHaveLength(1);
    expect(audio.plays).toHaveLength(1);
  });

  it("enqueues all tracks from a playlist", async () => {
    const audio = new FakeAudioBackend();
    const service = createService(audio);

    await service.enqueuePlaylist(
      { guildId: "guild-1", voiceChannelId: "voice-1", textChannelId: "text-1", shardId: 0 },
      { query: "https://www.youtube.com/playlist?list=abc", requestedBy: "user-1", requestedAt: Date.now() }
    );

    const queue = await service.getQueue("guild-1");
    expect(queue.currentTrack?.title).toBe("Playlist Track 1");
    expect(queue.upcomingTracks).toHaveLength(1);
    expect(queue.upcomingTracks[0]?.title).toBe("Playlist Track 2");
    expect(audio.plays).toHaveLength(1);
  });

  it("prefetches upcoming playlist tracks so skip can advance without another resolve", async () => {
    const audio = new FakeAudioBackend();
    const service = createService(audio);

    await service.enqueuePlaylist(
      { guildId: "guild-1", voiceChannelId: "voice-1", textChannelId: "text-1", shardId: 0 },
      { query: "https://www.youtube.com/playlist?list=abc", requestedBy: "user-1", requestedAt: Date.now() }
    );

    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(audio.resolveCalls.filter((query) => query.endsWith("/playlist-1"))).toHaveLength(1);
    expect(audio.resolveCalls.filter((query) => query.endsWith("/playlist-2"))).toHaveLength(1);

    await service.skip("guild-1");

    const queue = await service.getQueue("guild-1");
    expect(queue.currentTrack?.title).toBe("Playlist Track 2");
    expect(audio.resolveCalls.filter((query) => query.endsWith("/playlist-2"))).toHaveLength(1);
  });

  it("advances to the next track on skip", async () => {
    const service = createService(new FakeAudioBackend());

    await service.enqueue(
      { guildId: "guild-1", voiceChannelId: "voice-1", textChannelId: "text-1", shardId: 0 },
      { query: "song-1", requestedBy: "user-1", requestedAt: Date.now() }
    );
    await service.enqueue(
      { guildId: "guild-1", voiceChannelId: "voice-1", textChannelId: "text-1", shardId: 0 },
      { query: "song-2", requestedBy: "user-2", requestedAt: Date.now() }
    );

    await service.skip("guild-1");
    const queue = await service.getQueue("guild-1");
    expect(queue.currentTrack?.title).toBe("Test Track song-2");
    expect(queue.upcomingTracks).toHaveLength(0);
  });

  it("clears the queue on stop", async () => {
    const service = createService(new FakeAudioBackend());

    await service.enqueue(
      { guildId: "guild-1", voiceChannelId: "voice-1", textChannelId: "text-1", shardId: 0 },
      { query: "song-1", requestedBy: "user-1", requestedAt: Date.now() }
    );

    await service.stop("guild-1");
    const queue = await service.getQueue("guild-1");
    expect(queue.currentTrack).toBeNull();
    expect(queue.upcomingTracks).toHaveLength(0);
    expect(queue.isStopped).toBe(true);
  });

  it("returns to idle after the last track ends and clears the player", async () => {
    const audio = new FakeAudioBackend();
    const service = createService(audio);

    await service.enqueue(
      { guildId: "guild-1", voiceChannelId: "voice-1", textChannelId: "text-1", shardId: 0 },
      { query: "song-1", requestedBy: "user-1", requestedAt: Date.now() }
    );

    audio.emit("trackEnd", "guild-1");
    await new Promise((resolve) => setTimeout(resolve, 0));

    const queue = await service.getQueue("guild-1");
    expect(queue.currentTrack).toBeNull();
    expect(queue.upcomingTracks).toHaveLength(0);
    expect(queue.isPlaying).toBe(false);
    expect(queue.isStopped).toBe(true);
    expect(audio.stopCalls).toBe(1);
  });

  it("disconnects while keeping the queue", async () => {
    const audio = new FakeAudioBackend();
    const service = createService(audio);

    await service.enqueue(
      { guildId: "guild-1", voiceChannelId: "voice-1", textChannelId: "text-1", shardId: 0 },
      { query: "song-1", requestedBy: "user-1", requestedAt: Date.now() }
    );
    await service.enqueue(
      { guildId: "guild-1", voiceChannelId: "voice-1", textChannelId: "text-1", shardId: 0 },
      { query: "song-2", requestedBy: "user-2", requestedAt: Date.now() }
    );

    const state = await service.disconnectKeepingQueue("guild-1");

    expect(state.currentTrack).toBeNull();
    expect(state.upcomingTracks).toHaveLength(2);
    expect(state.upcomingTracks[0]?.title).toBe("Test Track song-1");
    expect(state.voiceChannelId).toBeNull();
    expect(state.isStopped).toBe(true);
    expect(audio.connected).toBe(false);
  });

  it("ignores manual voice disconnect normalization while leaving", async () => {
    const audio = new FakeAudioBackend();
    const service = createService(audio);

    await service.enqueue(
      { guildId: "guild-1", voiceChannelId: "voice-1", textChannelId: "text-1", shardId: 0 },
      { query: "song-1", requestedBy: "user-1", requestedAt: Date.now() }
    );

    const leavePromise = service.leave("guild-1");
    audio.emit("voiceDisconnected", "guild-1");
    await leavePromise;

    const queue = await service.getQueue("guild-1");
    expect(queue.currentTrack).toBeNull();
    expect(queue.upcomingTracks).toHaveLength(0);
    expect(queue.voiceChannelId).toBeNull();
  });

  it("toggles pause state", async () => {
    const service = createService(new FakeAudioBackend());

    await service.enqueue(
      { guildId: "guild-1", voiceChannelId: "voice-1", textChannelId: "text-1", shardId: 0 },
      { query: "song-1", requestedBy: "user-1", requestedAt: Date.now() }
    );

    const paused = await service.togglePause("guild-1");
    expect(paused.isPaused).toBe(true);

    const resumed = await service.togglePause("guild-1");
    expect(resumed.isPaused).toBe(false);
  });

  it("toggles repeat mode", async () => {
    const service = createService(new FakeAudioBackend());

    await service.enqueue(
      { guildId: "guild-1", voiceChannelId: "voice-1", textChannelId: "text-1", shardId: 0 },
      { query: "song-1", requestedBy: "user-1", requestedAt: Date.now() }
    );

    const enabled = await service.toggleRepeat("guild-1");
    expect(enabled.repeatMode).toBe("track");

    const disabled = await service.toggleRepeat("guild-1");
    expect(disabled.repeatMode).toBe("off");
  });

  it("shuffles only upcoming tracks", async () => {
    const service = createService(new FakeAudioBackend());

    await service.enqueue(
      { guildId: "guild-1", voiceChannelId: "voice-1", textChannelId: "text-1", shardId: 0 },
      { query: "song-1", requestedBy: "user-1", requestedAt: Date.now() }
    );
    await service.enqueue(
      { guildId: "guild-1", voiceChannelId: "voice-1", textChannelId: "text-1", shardId: 0 },
      { query: "song-2", requestedBy: "user-2", requestedAt: Date.now() }
    );
    await service.enqueue(
      { guildId: "guild-1", voiceChannelId: "voice-1", textChannelId: "text-1", shardId: 0 },
      { query: "song-3", requestedBy: "user-3", requestedAt: Date.now() }
    );

    const before = await service.getQueue("guild-1");
    const currentTitle = before.currentTrack?.title;
    const originalUpcoming = before.upcomingTracks.map((track) => track.trackId).sort();

    const shuffled = await service.shuffleUpcoming("guild-1");
    expect(shuffled.currentTrack?.title).toBe(currentTitle);
    expect(shuffled.upcomingTracks.map((track) => track.trackId).sort()).toEqual(originalUpcoming);
  });

  it("turns repeat off when skipping", async () => {
    const service = createService(new FakeAudioBackend());

    await service.enqueue(
      { guildId: "guild-1", voiceChannelId: "voice-1", textChannelId: "text-1", shardId: 0 },
      { query: "song-1", requestedBy: "user-1", requestedAt: Date.now() }
    );
    await service.enqueue(
      { guildId: "guild-1", voiceChannelId: "voice-1", textChannelId: "text-1", shardId: 0 },
      { query: "song-2", requestedBy: "user-2", requestedAt: Date.now() }
    );
    await service.toggleRepeat("guild-1");

    await service.skip("guild-1");

    const queue = await service.getQueue("guild-1");
    expect(queue.repeatMode).toBe("off");
    expect(queue.currentTrack?.title).toBe("Test Track song-2");
  });

  it("recovers to the next track after a track exception", async () => {
    vi.useFakeTimers();
    const audio = new FakeAudioBackend();
    const service = createService(audio);

    await service.enqueue(
      { guildId: "guild-1", voiceChannelId: "voice-1", textChannelId: "text-1", shardId: 0 },
      { query: "song-1", requestedBy: "user-1", requestedAt: Date.now() }
    );
    await service.enqueue(
      { guildId: "guild-1", voiceChannelId: "voice-1", textChannelId: "text-1", shardId: 0 },
      { query: "song-2", requestedBy: "user-2", requestedAt: Date.now() }
    );

    audio.emit("trackException", "guild-1");
    await vi.advanceTimersByTimeAsync(1600);

    const queue = await service.getQueue("guild-1");
    expect(queue.currentTrack?.title).toBe("Test Track song-2");
    expect(queue.upcomingTracks).toHaveLength(0);
    expect(queue.repeatMode).toBe("off");

    vi.useRealTimers();
  });

  it("records total and unique track stats when tracks start", async () => {
    const statsRepository = new InMemoryStatsRepository();
    const service = new DefaultMusicService(
      new InMemoryQueueRepository(),
      new FakeAudioBackend(),
      new BotStatsService(statsRepository),
      pino({ enabled: false })
    );

    await service.enqueue(
      { guildId: "guild-1", voiceChannelId: "voice-1", textChannelId: "text-1", shardId: 0 },
      { query: "song-1", requestedBy: "user-1", requestedAt: Date.now() }
    );
    await service.enqueue(
      { guildId: "guild-1", voiceChannelId: "voice-1", textChannelId: "text-1", shardId: 0 },
      { query: "song-2", requestedBy: "user-2", requestedAt: Date.now() }
    );
    await service.skip("guild-1");

    const stats = await statsRepository.getStats();
    expect(stats.totalPlayCount).toBe(2);
    expect(stats.uniqueTrackCount).toBe(2);
  });
});
