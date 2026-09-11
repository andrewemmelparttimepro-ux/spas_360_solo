import copy
import json
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'scripts' / 'jobber'))
from import_summaries import apply, PROJECT, ORG, BATCH


class Destination:
    def __init__(self):
        self.tables = {'contacts': [{'id': 'existing', 'first_name': 'Original'}], 'jobber_history': []}
        self.fail_history_once = False

    def rows(self, table, select='*'):
        return copy.deepcopy(self.tables[table])

    def insert(self, table, rows):
        if table == 'jobber_history' and self.fail_history_once:
            self.fail_history_once = False
            raise RuntimeError('Interrupted import')
        ids = {r['id'] for r in self.tables[table]}
        self.tables[table].extend(copy.deepcopy(r) for r in rows if r['id'] not in ids)


class ImportTests(unittest.TestCase):
    def setUp(self):
        self.destination = Destination()
        self.plan = dict(project_id=PROJECT, org_id=ORG, import_batch=BATCH, source_files={'source': 'hash'},
            baseline_contacts=copy.deepcopy(self.destination.tables['contacts']),
            contacts=[{'id': 'new', 'first_name': 'Imported'}],
            history=[{'id': 'history', 'contact_id': 'new', 'import_batch': BATCH, 'source_checksum': 'hash'}], counts={})

    def test_resume_partial_import_then_repeat_has_no_duplicates(self):
        with tempfile.TemporaryDirectory() as directory, patch('import_summaries.source_records', return_value=({}, {'source': 'hash'})):
            self.destination.fail_history_once = True
            with self.assertRaisesRegex(RuntimeError, 'Interrupted'):
                apply(self.plan, self.destination, Path(directory))
            apply(self.plan, self.destination, Path(directory))
            first = copy.deepcopy(self.destination.tables)
            apply(self.plan, self.destination, Path(directory))
            self.assertEqual(first, self.destination.tables)
            receipt = json.loads((Path(directory) / 'import-receipt.json').read_text())
            self.assertTrue(receipt['original_contacts_unchanged'])

    def test_concurrent_customer_edit_stops_before_writes(self):
        self.destination.tables['contacts'][0]['first_name'] = 'Edited by staff'
        original = copy.deepcopy(self.destination.tables)
        with tempfile.TemporaryDirectory() as directory, patch('import_summaries.source_records', return_value=({}, {'source': 'hash'})):
            with self.assertRaisesRegex(ValueError, 'Existing customer changed'):
                apply(self.plan, self.destination, Path(directory))
        self.assertEqual(original, self.destination.tables)

    def test_changed_source_requires_new_rehearsal(self):
        with tempfile.TemporaryDirectory() as directory, patch('import_summaries.source_records', return_value=({}, {'source': 'changed'})):
            with self.assertRaisesRegex(ValueError, 'Source files changed'):
                apply(self.plan, self.destination, Path(directory))
        self.assertEqual(len(self.destination.tables['contacts']), 1)


if __name__ == '__main__': unittest.main()
