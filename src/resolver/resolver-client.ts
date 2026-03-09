import type { PlaylistResolveOptions, ResolverSearchResult } from "../audio/audio-backend.js";

export interface ResolverPlaylistResult {
  tracks: ResolverSearchResult[];
  totalCount: number;
  nextOffset?: number;
}

export interface ResolverClient {
  search(query: string, limit?: number): Promise<ResolverSearchResult[]>;
  resolveTrack(url: string): Promise<ResolverSearchResult[]>;
  resolvePlaylist(url: string, options?: PlaylistResolveOptions): Promise<ResolverPlaylistResult>;
}
