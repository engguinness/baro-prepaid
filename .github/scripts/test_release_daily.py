import contextlib
import io
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
import release_daily as app


class ReleaseTests(unittest.TestCase):
    def test_daily_limit_resume_and_preserve_sitemap(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / '지역').mkdir()
            paths = ['지역/test%d.html' % i for i in range(7)]
            for path in paths:
                (root / path).write_text(app.TAG + '\n<link rel="canonical" href="' + app.SITE + '/' + path + '">')
            old_url = '<url><loc>https://1mintelecom.com/</loc><lastmod>2026-09-23</lastmod></url>'
            (root / 'sitemap.xml').write_text('<urlset>' + old_url + '</urlset>')
            (root / '.release-plan.json').write_text('{"released": 0}')
            state_path = root / '.daily-release.json'
            state_path.write_text(json.dumps({'last_release_date': '2000-01-01', 'pending': [], 'order': paths, 'history': []}))
            with patch.object(app, 'ROOT', root), patch.object(app, 'STATE', state_path), contextlib.redirect_stdout(io.StringIO()):
                app.prepare()
                state = json.loads(state_path.read_text())
                self.assertEqual(len(state['pending']), 5)
                self.assertEqual(state['remaining'], 2)
                self.assertIn(old_url, (root / 'sitemap.xml').read_text())
                state['last_release_date'] = '2000-01-01'
                state_path.write_text(json.dumps(state))
                app.prepare()  # An unfinished batch blocks the next day's batch.
                self.assertEqual(json.loads(state_path.read_text())['remaining'], 2)
                state['pending'] = []
                state['last_release_date'] = app.dt.datetime.now(app.ZoneInfo('Asia/Seoul')).date().isoformat()
                state_path.write_text(json.dumps(state))
                app.prepare()  # Successful retries do not release more on the same day.
                self.assertEqual(json.loads(state_path.read_text())['remaining'], 2)
                state['last_release_date'] = '2000-01-01'
                state_path.write_text(json.dumps(state))
                app.prepare()
                self.assertEqual(len(json.loads(state_path.read_text())['pending']), 2)
                state = json.loads(state_path.read_text())
                state['pending'] = []
                state_path.write_text(json.dumps(state))
                app.prepare()
                self.assertTrue(json.loads(state_path.read_text())['complete'])


if __name__ == '__main__':
    unittest.main()
