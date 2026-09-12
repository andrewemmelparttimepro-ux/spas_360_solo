import copy
import json
from pathlib import Path
import runpy
import sys
import tempfile
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'scripts/jobber'))
module = runpy.run_path(str(Path(__file__).resolve().parents[1] / 'scripts/jobber/import-communications.py'))
prepare = module['prepare']


class CommunicationImportTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.stage = Path(self.temp.name)
        self.headers = ['Via', 'Client name', 'Sent date', 'To', 'Sent By', 'CC', 'BCC', 'Subject', 'Status', 'Type', '~Sent time', 'Attachments', 'Opened date', 'Open']
        history = []
        for account in module['ACCOUNTS']:
            folder = self.stage / account
            (folder / 'communications-details-ui').mkdir(parents=True)
            self.write(folder / 'clients.json', [dict(id='MTIz', name='Jane Doe', emails=[], phones=[dict(number='7015550123')])])
            history.append(dict(record_kind='client', source_account_key=account, source_id='MTIz', source_account_id=account, id=account + '-history', contact_id=account + '-contact'))
            self.write(folder / 'communications-all-columns-ui.json', [dict(pagination='Showing 0 to 0 of 0 entries', rows=[], headers=self.headers)])
        self.write(self.stage / 'full-import-plan.json', dict(history=history))
        self.url = 'https://secure.getjobber.com/comms/comm.dialog?id=12345'
        self.report = dict(zip(self.headers, ['Text message', 'Jane Doe', 'Sep 11, 2026', '-', '-', '', '', '', 'Sent', 'Text from client', '2:30PM', '0', '-', 'open']))
        self.detail = dict(capturedAt='2026-09-12T20:00:00Z', sourceUrl=self.url, text='Text Message Communication\nTo:\n+17015550123\nSubject:\n\nPlease schedule service.', links=[], images=[], frames=[])
        self.capture()

    def write(self, path, value):
        path.write_text(json.dumps(value))

    def capture(self, rows=None):
        row = dict(cells=[self.report[key] for key in self.headers], links=[dict(text='open', href=self.url)])
        self.write(self.stage / 'magic_city/communications-all-columns-ui.json', [dict(sourceUrl='https://secure.getjobber.com/reports/client_communications', capturedAt='2026-09-12T20:00:00Z', pagination='Showing 1 to 1 of 1 entries', headers=self.headers, rows=rows if rows is not None else [row])])
        self.write(self.stage / 'magic_city/communications-details-ui/12345.json', self.detail)

    def test_incoming_message_links_only_to_same_store_and_converts_central_time(self):
        first = prepare(self.stage, {})['history'][0]
        second = prepare(self.stage, {})['history'][0]
        self.assertEqual(first['contact_id'], 'magic_city-contact')
        self.assertEqual(first['source_client_id'], 'MTIz')
        self.assertEqual(first['occurred_at'], '2026-09-11T19:30:00+00:00')
        self.assertEqual(first['id'], second['id'])
        self.assertIn('Please schedule service.', first['raw']['jobber_api']['message'])

    def test_duplicate_name_and_phone_remains_unmatched(self):
        clients = json.loads((self.stage / 'magic_city/clients.json').read_text())
        clients.append(dict(clients[0], id='MTI0'))
        self.write(self.stage / 'magic_city/clients.json', clients)
        result = prepare(self.stage, {})['history'][0]
        self.assertIsNone(result['contact_id'])
        self.assertEqual(result['match_status'], 'review')

    def test_missing_report_page_or_duplicate_id_is_rejected(self):
        self.capture(rows=[])
        with self.assertRaisesRegex(ValueError, 'incomplete'):
            prepare(self.stage, {})
        self.capture()
        path = self.stage / 'magic_city/communications-all-columns-ui.json'
        pages = json.loads(path.read_text())
        pages.append(copy.deepcopy(pages[0]))
        self.write(path, pages)
        with self.assertRaisesRegex(ValueError, 'duplicate'):
            prepare(self.stage, {})

    def test_uncopied_attachments_and_inline_images_block_import(self):
        self.report['Attachments'] = '1'
        self.capture()
        with self.assertRaisesRegex(ValueError, 'uncopied attachments'):
            prepare(self.stage, {})
        self.report['Attachments'] = '0'
        self.detail['images'] = [dict(src='https://example.com/photo.jpg')]
        self.capture()
        with self.assertRaisesRegex(ValueError, 'Inline communication images'):
            prepare(self.stage, {})

    def test_ambiguous_daylight_saving_time_preserves_literal_without_guess(self):
        self.report['Sent date'] = 'Nov 02, 2025'
        self.report['~Sent time'] = '1:30AM'
        self.capture()
        result = prepare(self.stage, {})['history'][0]
        self.assertIsNone(result['occurred_at'])
        self.assertTrue(result['raw']['jobber_api']['time_ambiguous'])
        self.assertEqual(result['summary']['sent_time'], '1:30AM')


if __name__ == '__main__':
    unittest.main()
