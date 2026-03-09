from __future__ import annotations

import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from youtube import normalize_playlist_url


class NormalizePlaylistUrlTest(unittest.TestCase):
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


if __name__ == "__main__":
    unittest.main()
