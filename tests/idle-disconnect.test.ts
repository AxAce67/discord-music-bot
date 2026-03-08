import { describe, expect, it } from "vitest";
import { countHumanMembers } from "../src/events/idle-disconnect.js";

describe("idle disconnect member counting", () => {
  it("ignores bot accounts when checking whether a voice channel is empty", () => {
    const members = {
      *[Symbol.iterator]() {
        yield { user: { bot: true } };
        yield { user: { bot: false } };
      },
    };

    expect(countHumanMembers(members)).toBe(1);
  });
});
