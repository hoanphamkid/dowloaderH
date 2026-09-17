import base64
import json
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from yt_dlp import YoutubeDL
from yt_dlp.utils import ExtractorError
from yt_dlp_plugins.extractor.threads import ThreadsIE


def video_post(code, title):
    efg = base64.urlsafe_b64encode(json.dumps({'duration_s': 12}).encode()).decode().rstrip('=')
    return {
        'code': code,
        'video_versions': [{'type': 101, 'url': f'https://scontent.cdninstagram.com/video.mp4?efg={efg}'}],
        'original_width': 640,
        'original_height': 360,
        'caption': {'text': title},
        'user': {'username': 'alice', 'full_name': 'Alice'},
    }


class ThreadsExtractorTests(unittest.TestCase):
    def setUp(self):
        self.ie = ThreadsIE(YoutubeDL({'quiet': True}))

    def extract_from(self, posts, url='https://www.threads.com/@alice/post/target123'):
        page = '<script type="application/json">' + json.dumps({'data': posts}) + '</script>'
        self.ie._download_webpage = lambda *args, **kwargs: page
        return self.ie._real_extract(url)

    def test_selects_exact_shortcode_not_a_recommended_video(self):
        result = self.extract_from([
            video_post('recommended', 'Unrelated recommendation'),
            video_post('target123', 'Requested clip'),
        ])
        self.assertEqual(result['id'], 'target123')
        self.assertEqual(result['title'], 'Requested clip')
        self.assertEqual(result['duration'], 12)
        self.assertEqual(result['formats'][0]['format_id'], '101')
        self.assertEqual(result['formats'][0]['ext'], 'mp4')

    def test_does_not_fall_back_to_an_unrelated_video(self):
        with self.assertRaises(ExtractorError):
            self.extract_from([video_post('different123', 'Unrelated recommendation')])


if __name__ == '__main__':
    unittest.main()
