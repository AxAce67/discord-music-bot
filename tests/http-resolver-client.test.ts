import { afterEach, describe, expect, it, vi } from "vitest";
import pino from "pino";
import { HttpResolverClient } from "../src/resolver/http-resolver-client.js";
import { MusicBotError } from "../src/errors/music-error.js";

describe("HttpResolverClient", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns tracks from the resolver", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          tracks: [
            {
              trackId: "youtube:abc",
              title: "Track",
              url: "https://www.youtube.com/watch?v=abc",
              durationMs: 120000,
              artworkUrl: "https://i.ytimg.com/vi/abc/hqdefault.jpg",
              source: "youtube"
            }
          ]
        })
      })
    );

    const client = new HttpResolverClient("http://127.0.0.1:8080", 5000, pino({ enabled: false }));
    const results = await client.search("test");

    expect(results).toHaveLength(1);
    expect(results[0]?.trackId).toBe("youtube:abc");
  });

  it("maps resolver 404 errors to MusicBotError codes", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 404,
        json: async () => ({
          error: {
            code: "PLAYLIST_NOT_FOUND",
            message: "No playlist entries"
          }
        })
      })
    );

    const client = new HttpResolverClient("http://127.0.0.1:8080", 5000, pino({ enabled: false }));
    await expect(client.resolvePlaylist("https://www.youtube.com/playlist?list=abc")).rejects.toMatchObject({
      code: "PLAYLIST_NOT_FOUND"
    } satisfies Partial<MusicBotError>);
  });

  it("returns playlist metadata from the resolver", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          tracks: [
            {
              trackId: "youtube:abc",
              title: "Track",
              url: "https://www.youtube.com/watch?v=abc",
              durationMs: 120000,
              source: "youtube"
            }
          ],
          totalCount: 42,
          nextOffset: 1
        })
      })
    );

    const client = new HttpResolverClient("http://127.0.0.1:8080", 5000, pino({ enabled: false }));
    const result = await client.resolvePlaylist("https://www.youtube.com/playlist?list=abc", { offset: 0, limit: 1 });

    expect(result.totalCount).toBe(42);
    expect(result.nextOffset).toBe(1);
    expect(result.tracks).toHaveLength(1);
  });

  it("maps aborts to resolver unavailable", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(Object.assign(new Error("aborted"), { name: "AbortError" }))
    );

    const client = new HttpResolverClient("http://127.0.0.1:8080", 1, pino({ enabled: false }));
    await expect(client.resolveTrack("https://www.youtube.com/watch?v=abc")).rejects.toMatchObject({
      code: "RESOLVER_UNAVAILABLE"
    } satisfies Partial<MusicBotError>);
  });
});
