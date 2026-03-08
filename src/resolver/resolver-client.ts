import type { ResolverSearchResult } from "../audio/audio-backend.js";

export interface ResolverClient {
  search(query: string, limit?: number): Promise<ResolverSearchResult[]>;
  resolveTrack(url: string): Promise<ResolverSearchResult[]>;
  resolvePlaylist(url: string): Promise<ResolverSearchResult[]>;
}
