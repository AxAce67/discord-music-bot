import { describe, expect, it } from "vitest";
import { parseMusicButtonId } from "../src/ui/custom-ids.js";
import { buildControlButtons, buildControlEmbed } from "../src/ui/control-panel.js";
import { createEmptyQueueState } from "../src/types/music.js";

describe("parseMusicButtonId", () => {
  it("parses valid custom ids", () => {
    expect(parseMusicButtonId("music:skip:guild-1")).toEqual({
      action: "skip",
      guildId: "guild-1"
    });
  });

  it("parses pause custom ids", () => {
    expect(parseMusicButtonId("music:pause:guild-1")).toEqual({
      action: "pause",
      guildId: "guild-1"
    });
  });

  it("parses repeat custom ids", () => {
    expect(parseMusicButtonId("music:repeat:guild-1")).toEqual({
      action: "repeat",
      guildId: "guild-1"
    });
  });

  it("rejects invalid custom ids", () => {
    expect(parseMusicButtonId("invalid")).toBeNull();
  });
});

describe("buildControlEmbed", () => {
  it("renders the current track", () => {
    const state = createEmptyQueueState("guild-1");
    state.currentTrack = {
      trackId: "track-1",
      title: "Track Title",
      url: "https://example.com",
      durationMs: 90000,
      artworkUrl: "https://example.com/art.jpg",
      requestedBy: "user-1",
      source: "youtube",
      encodedTrack: "encoded"
    };
    state.isPlaying = true;

    const embed = buildControlEmbed(state, "ja").toJSON();
    expect(String(embed.description)).toContain("Track Title");
    expect(embed.thumbnail?.url).toBe("https://example.com/art.jpg");
    expect(embed.fields?.some((field) => field.name === "再生位置")).toBe(true);
  });
});

describe("buildControlButtons", () => {
  it("includes the pause button", () => {
    const state = createEmptyQueueState("guild-1");
    state.currentTrack = {
      trackId: "track-1",
      title: "Track Title",
      url: "https://example.com",
      durationMs: 90000,
      artworkUrl: "https://example.com/art.jpg",
      requestedBy: "user-1",
      source: "youtube",
      encodedTrack: "encoded"
    };

    const rows = buildControlButtons(state, "ja").map((row) => row.toJSON());
    expect(
      rows.some((row) =>
        row.components.some(
          (component) =>
            "custom_id" in component && component.custom_id === "music:pause:guild-1"
        )
      )
    ).toBe(true);
    expect(
      rows.some((row) =>
        row.components.some(
          (component) =>
            "custom_id" in component && component.custom_id === "music:repeat:guild-1"
        )
      )
    ).toBe(true);
  });
});
