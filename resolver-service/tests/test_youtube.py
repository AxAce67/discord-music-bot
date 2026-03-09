from __future__ import annotations

import sys
import unittest
from unittest.mock import patch
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from youtube import (
    clear_resolver_caches,
    extract_playback_source,
    get_playlist_track_limit,
    get_yt_dlp_timeout_seconds,
    is_mix_playlist_url,
    map_track,
    normalize_playlist_url,
    resolve_playlist,
    resolve_track,
)


class NormalizePlaylistUrlTest(unittest.TestCase):
    def test_detects_mix_playlist_urls(self) -> None:
        self.assertTrue(is_mix_playlist_url("https://www.youtube.com/watch?v=M-Eyhjkepy0&list=RDATgx&index=9&start_radio=1"))
        self.assertFalse(is_mix_playlist_url("https://www.youtube.com/playlist?list=PL12345"))
        self.assertEqual(
            get_playlist_track_limit("https://www.youtube.com/watch?v=M-Eyhjkepy0&list=RDATgx&index=9&start_radio=1"),
            25,
        )
        self.assertEqual(get_playlist_track_limit("https://www.youtube.com/playlist?list=PL12345"), 100)

    def test_preserves_mix_watch_context(self) -> None:
        url = "https://www.youtube.com/watch?v=M-Eyhjkepy0&list=RDATgx&index=9&start_radio=1"
        self.assertEqual(
            normalize_playlist_url(url),
            "https://www.youtube.com/watch?v=M-Eyhjkepy0&list=RDATgx&index=9&start_radio=1",
        )

    def test_preserves_playlist_index(self) -> None:
        url = "https://www.youtube.com/playlist?list=PL12345&index=4"
        self.assertEqual(
            normalize_playlist_url(url),
            "https://www.youtube.com/playlist?list=PL12345&index=4",
        )


class YtDlpTimeoutTest(unittest.TestCase):
    def test_uses_default_timeout_when_env_missing(self) -> None:
        with patch.dict("os.environ", {}, clear=True):
            self.assertEqual(get_yt_dlp_timeout_seconds(), 30)

    def test_uses_timeout_from_env(self) -> None:
        with patch.dict("os.environ", {"YTDLP_TIMEOUT_SECONDS": "45"}, clear=True):
            self.assertEqual(get_yt_dlp_timeout_seconds(), 45)


class PlaylistEntryMappingTest(unittest.TestCase):
    def setUp(self) -> None:
        clear_resolver_caches()

    def test_maps_flat_playlist_entries_to_watch_urls(self) -> None:
        track = map_track({"id": "abc123", "title": "Flat Entry"})
        self.assertIsNotNone(track)
        self.assertEqual(track.url, "https://www.youtube.com/watch?v=abc123")
        self.assertIsNone(track.playbackUrl)
        self.assertEqual(track.durationMs, 0)
        self.assertEqual(track.artworkUrl, "https://i.ytimg.com/vi/abc123/hqdefault.jpg")

    def test_does_not_treat_youtube_watch_url_as_playback_source(self) -> None:
        playback_url, headers = extract_playback_source(
            {"url": "https://www.youtube.com/watch?v=abc123", "http_headers": {"User-Agent": "test"}}
        )
        self.assertIsNone(playback_url)
        self.assertEqual(headers, {})

    @patch("youtube.register_playback_source", return_value="http://resolver/v1/stream/token-1")
    @patch("youtube.run_yt_dlp")
    def test_resolve_playlist_enriches_first_track_for_faster_start(self, run_yt_dlp, _register_playback_source) -> None:
        run_yt_dlp.side_effect = [
            {
                "entries": [
                    {"id": "abc123", "title": "Flat Entry 1"},
                    {"id": "def456", "title": "Flat Entry 2"},
                ]
            },
            {
                "id": "abc123",
                "title": "Detailed Entry 1",
                "duration": 123,
                "requested_downloads": [{"url": "https://cdn.example.com/audio.webm"}],
            },
        ]

        tracks, total_count, next_offset = resolve_playlist("https://www.youtube.com/playlist?list=PL12345", limit=1)

        self.assertEqual(len(tracks), 1)
        self.assertEqual(total_count, 2)
        self.assertEqual(next_offset, 1)
        self.assertEqual(tracks[0].title, "Detailed Entry 1")
        self.assertEqual(tracks[0].playbackUrl, "http://resolver/v1/stream/token-1")
        self.assertEqual(run_yt_dlp.call_count, 2)

    @patch("youtube.run_yt_dlp")
    def test_resolve_track_uses_short_term_cache(self, run_yt_dlp) -> None:
        run_yt_dlp.return_value = {"id": "abc123", "title": "Cached Track", "duration": 120}

        first = resolve_track("https://www.youtube.com/watch?v=abc123")
        second = resolve_track("https://www.youtube.com/watch?v=abc123&list=PL12345")

        self.assertEqual(first[0].title, "Cached Track")
        self.assertEqual(second[0].title, "Cached Track")
        self.assertEqual(run_yt_dlp.call_count, 1)

    @patch("youtube.run_yt_dlp")
    def test_resolve_playlist_caps_mix_urls_to_mix_limit(self, run_yt_dlp) -> None:
        run_yt_dlp.return_value = {
            "entries": [{"id": f"id{index}", "title": f"Entry {index}"} for index in range(40)]
        }

        tracks, total_count, next_offset = resolve_playlist(
            "https://www.youtube.com/watch?v=M-Eyhjkepy0&list=RDATgx&index=9&start_radio=1",
            limit=50,
        )

        self.assertEqual(len(tracks), 25)
        self.assertEqual(total_count, 25)
        self.assertIsNone(next_offset)


if __name__ == "__main__":
    unittest.main()
