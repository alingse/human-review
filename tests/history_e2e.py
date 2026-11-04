"""Run after cargo build: python3 tests/history_e2e.py. Uses isolated local data."""
import json
import os
from pathlib import Path
import socket
import subprocess
import tempfile
import time
import unittest
import urllib.error
import urllib.request

BINARY = Path(__file__).resolve().parents[1] / 'target/debug/hrevu'


class SavedReviewTest(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix='hrevu-e2e-')
        self.root = Path(self.temp.name)
        self.env = dict(os.environ, HREVU_DATA_DIR=str(self.root / 'data'))
        self.processes = []
        self.logs = []

    def tearDown(self):
        for process in self.processes:
            if process.poll() is None:
                process.terminate()
                process.wait(timeout=5)
        for log in self.logs:
            log.close()
        self.temp.cleanup()

    def cli(self, *args):
        return subprocess.check_output([str(BINARY), *args], env=self.env, text=True)

    def start(self, *args):
        with socket.socket() as listener:
            listener.bind(('127.0.0.1', 0))
            port = listener.getsockname()[1]
        log = (self.root / f'{port}.log').open('w+')
        self.logs.append(log)
        process = subprocess.Popen([str(BINARY), *args, '--no-open', '--port', str(port)],
                                   env=self.env, stdout=log, stderr=log)
        self.processes.append(process)
        base = f'http://127.0.0.1:{port}'
        for _ in range(100):
            try:
                self.request(base, '/api/reviews')
                return process, base, log
            except urllib.error.URLError:
                if process.poll() is not None:
                    log.seek(0)
                    self.fail(log.read())
                time.sleep(0.05)
        self.fail('Local review server did not start')

    def request(self, base, path, method='GET', body=None):
        payload = None if body is None else json.dumps(body).encode()
        request = urllib.request.Request(base + path, data=payload, method=method,
                                         headers={'Content-Type': 'application/json'})
        with urllib.request.urlopen(request, timeout=5) as response:
            data = response.read()
            if not data:
                return None
            if 'application/json' in response.headers.get('Content-Type', ''):
                return json.loads(data)
            return data.decode()

    def test_interruption_resume_completion_history_and_export(self):
        source = self.root / 'plan.md'
        source.write_text('# Original\n\nReviewed paragraph\n')
        process, base, log = self.start(str(source))
        data = self.request(base, '/api/data')
        review_id = data['review_id']
        comment = self.request(base, '/api/comments', 'POST', {
            'file': str(source), 'line': 3, 'side': 'new', 'text': 'Keep this feedback',
            'anchor': {'start_line': 3, 'end_line': 3, 'x': 0.72, 'y': 0.4, 'quote': 'Reviewed paragraph'},
        })
        live = json.loads(self.cli('show', review_id, '--json'))
        self.assertEqual(live['status'], 'in_progress')
        self.assertEqual(live['comments'][0]['id'], comment['id'])
        source.write_text('# Changed after review started\n')
        self.assertIn('Original', self.request(base, '/api/data')['files'][0]['markdown'])
        # Simulate the original agent/process going away before completion.
        process.terminate()
        process.wait(timeout=5)
        source.unlink()
        self.assertEqual(json.loads(self.cli('show', review_id))['comments'][0]['anchor']['x'], 0.72)
        listing = json.loads(self.cli('history', '--json'))
        self.assertEqual(listing[0]['id'], review_id)
        self.assertEqual(listing[0]['comment_count'], 1)
        self.assertIn('cwd', listing[0])
        log.seek(0)
        self.assertIn('Saved:', log.read())

        resumed, base, _ = self.start('resume', review_id)
        self.assertIn('Original', self.request(base, '/api/data')['files'][0]['markdown'])
        self.request(base, '/api/complete', 'POST')
        self.assertEqual(json.loads(self.cli('show', review_id))['status'], 'completed')
        self.assertIsNone(resumed.poll(), 'Default server should stay available after completion')
        archived = self.request(base, '/api/data?review=' + review_id)
        self.assertTrue(archived['read_only'])
        self.assertEqual(archived['comments'][0]['text'], 'Keep this feedback')
        text = self.request(base, f'/api/reviews/{review_id}/export?format=text')
        self.assertIn('Reviewed paragraph', text)
        self.assertIn('Keep this feedback', text)
        exported = self.request(base, f'/api/reviews/{review_id}/export?format=json')
        self.assertIn('Original', exported['files'][0]['markdown'])
        with self.assertRaises(urllib.error.HTTPError) as error:
            self.request(base, '/api/comments', 'POST', {'text': 'Late edit'})
        self.assertEqual(error.exception.code, 409)
        resumed.terminate()
        resumed.wait(timeout=5)

        _, history_base, _ = self.start('history')
        self.assertEqual(self.request(history_base, '/api/reviews')[0]['id'], review_id)
        self.assertEqual(self.request(history_base, '/api/data?review=' + review_id)['comments'][0]['anchor']['x'], 0.72)
        output = self.root / 'feedback.txt'
        self.cli('export', review_id, '--format', 'text', '--output', str(output))
        self.assertIn('Keep this feedback', output.read_text())

        source.write_text('# A new review\n')
        automatic, auto_base, _ = self.start(str(source), '--exit-on-complete')
        next_id = self.request(auto_base, '/api/data')['review_id']
        self.request(auto_base, '/api/complete', 'POST')
        self.assertEqual(automatic.wait(timeout=5), 0)
        self.assertEqual(json.loads(self.cli('show', next_id))['status'], 'completed')


if __name__ == '__main__':
    unittest.main()
