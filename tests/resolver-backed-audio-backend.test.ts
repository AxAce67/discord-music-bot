import { describe, expect, it } from "vitest";
import pino from "pino";
import {
  AudioBackend,
  type JoinVoiceRequest,
  type PlaylistResolveOptions,
  type ResolvedPlaylist,
  type ResolvedTrack,
  type ResolverSearchResult
} from "../src/audio/audio-backend.js";
import { ResolverBackedAudioBackend } from "../src/audio/resolver-backed-audio-backend.js";
import type { ResolverClient, ResolverPlaylistResult } from "../src/resolver/resolver-client.js";

class FakePlaybackBackend extends AudioBackend {
  public readonly resolveCalls: string[] = [];
  public readonly playCalls: Array<{ encodedTrack?: string; playbackIdentifier?: string }> = [];

  hasConnection(): boolean {
    return true;
  }

  getConnectedGuildIds(): string[] {
    return ["guild-1"];
  }

  async join(_request: JoinVoiceRequest): Promise<void> {}

  async leave(_guildId: string): Promise<void> {}

  async resolve(query: string): Promise<ResolvedTrack[]> {
    this.resolveCalls.push(query);
    return [
      {
        trackId: `hydrated:${query}`,
        title: `Hydrated ${query}`,
        url: query,
        durationMs: 1000,
        encodedTrack: `encoded:${query}`,
        source: "youtube"
      }
    ];
  }

  async resolvePlaylist(_query: string, _options?: PlaylistResolveOptions): Promise<ResolvedPlaylist> {
    return { tracks: [], totalCount: 0 };
  }

  async play(
    _guildId: string,
    track: { encodedTrack?: string; playbackIdentifier?: string }
  ): Promise<void> {
    this.playCalls.push(track);
  }

  getPlaybackPosition(): number {
    return 0;
  }

  async pause(_guildId: string): Promise<void> {}

  async resume(_guildId: string): Promise<void> {}

  async stop(_guildId: string): Promise<void> {}
}

class FakeResolverClient implements ResolverClient {
  public readonly resolveTrackCalls: string[] = [];

  constructor(
    private readonly searchResults: ResolverSearchResult[],
    private readonly trackResults: ResolverSearchResult[],
    private readonly playlistResults: ResolverPlaylistResult
  ) {}

  async search(_query?: string): Promise<ResolverSearchResult[]> {
    return this.searchResults;
  }

  async resolveTrack(url?: string): Promise<ResolverSearchResult[]> {
    if (url) {
      this.resolveTrackCalls.push(url);
    }
    return this.trackResults;
  }

  async resolvePlaylist(_url?: string, _options?: PlaylistResolveOptions): Promise<ResolverPlaylistResult> {
    return this.playlistResults;
  }
}

describe("ResolverBackedAudioBackend", () => {
  it("hydrates search results through the playback backend", async () => {
    const playback = new FakePlaybackBackend();
    const resolver = new FakeResolverClient(
      [
        {
          trackId: "youtube:abc",
          title: "Track ABC",
          url: "https://www.youtube.com/watch?v=abc",
          playbackUrl: "https://rr.example.com/audio-abc",
          durationMs: 120000,
          artworkUrl: "https://i.ytimg.com/vi/abc/hqdefault.jpg",
          source: "youtube"
        }
      ],
      [],
      { tracks: [], totalCount: 0 }
    );
    const backend = new ResolverBackedAudioBackend(resolver, playback, pino({ enabled: false }));

    const results = await backend.resolve("hello");

    expect(results).toHaveLength(1);
    expect(results[0]?.playbackIdentifier).toBe("https://rr.example.com/audio-abc");
    expect(results[0]?.encodedTrack).toBeUndefined();
    expect(playback.resolveCalls).toEqual([]);
  });

  it("returns lightweight playlist entries without hydrating them eagerly", async () => {
    const playback = new FakePlaybackBackend();
    const resolver = new FakeResolverClient(
      [],
      [],
      {
        tracks: [
          {
            trackId: "youtube:one",
            title: "One",
            url: "https://www.youtube.com/watch?v=one",
            durationMs: 1000,
            source: "youtube"
          },
          {
            trackId: "youtube:two",
            title: "Two",
            url: "https://www.youtube.com/watch?v=two",
            durationMs: 2000,
            source: "youtube"
          }
        ],
        totalCount: 2
      }
    );
    const backend = new ResolverBackedAudioBackend(resolver, playback, pino({ enabled: false }));

    const results = await backend.resolvePlaylist("https://www.youtube.com/playlist?list=abc");

    expect(results.tracks).toHaveLength(2);
    expect(results.totalCount).toBe(2);
    expect(results.tracks.map((track) => track.encodedTrack)).toEqual([undefined, undefined]);
    expect(results.tracks.map((track) => track.playbackIdentifier)).toEqual([undefined, undefined]);
    expect(playback.resolveCalls).toEqual([]);
  });

  it("prefers resolver track playback urls while hydrating a direct track url", async () => {
    const playback = new FakePlaybackBackend();
    const resolver = new FakeResolverClient(
      [],
      [
        {
          trackId: "youtube:one",
          title: "One",
          url: "https://www.youtube.com/watch?v=one",
          playbackUrl: "https://resolver.example/stream/one",
          durationMs: 1000,
          source: "youtube"
        }
      ],
      { tracks: [], totalCount: 0 }
    );
    const backend = new ResolverBackedAudioBackend(resolver, playback, pino({ enabled: false }));

    const results = await backend.resolve("https://www.youtube.com/watch?v=one");

    expect(results).toHaveLength(1);
    expect(results[0]?.playbackIdentifier).toBe("https://resolver.example/stream/one");
    expect(playback.resolveCalls).toEqual([]);
    expect(resolver.resolveTrackCalls).toEqual(["https://www.youtube.com/watch?v=one"]);
  });

  it("delegates playback operations", async () => {
    const playback = new FakePlaybackBackend();
    const resolver = new FakeResolverClient([], [], { tracks: [], totalCount: 0 });
    const backend = new ResolverBackedAudioBackend(resolver, playback, pino({ enabled: false }));

    await backend.play("guild-1", { encodedTrack: "encoded-track" });

    expect(playback.playCalls).toEqual([{ encodedTrack: "encoded-track" }]);
  });
});
