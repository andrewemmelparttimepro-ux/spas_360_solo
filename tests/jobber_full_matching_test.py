import base64
import sys
from pathlib import Path
import unittest
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'scripts/jobber'))
from full_matching import source_id, phone_key, decisions


class FullMatchingTests(unittest.TestCase):
    def test_public_api_and_previous_browser_ids_reconcile(self):
        self.assertEqual(source_id(base64.b64encode(b'gid://Jobber/Client/123').decode()), 'MTIz')
        self.assertEqual(source_id('MTIz'), 'MTIz')
        with self.assertRaises(ValueError): source_id(base64.b64encode(b'gid://Jobber/Client/wrong').decode())

    def test_phone_requires_full_number_and_preserves_store(self):
        self.assertEqual(phone_key('+1 (701) 555-0123 ext 7'), '7015550123')
        self.assertEqual(phone_key('555-0123'), '')
        clients=[dict(id='source',name='Jane Doe',firstName='Jane',lastName='Doe',emails=[],phones=[dict(number='7015550123')])]
        contacts=[dict(id='local',org_id='o',location_id='a',first_name='Jane',last_name='Doe',phone='7015550123',email=None)]
        old=[dict(source_id='source',contact_id=None,match_status='review',candidate_contact_ids=['local'])]
        self.assertEqual(decisions(clients,contacts,old,'o','jobber','a')['source']['contact_id'],'local')
        self.assertIsNone(decisions(clients,contacts,old,'o','jobber','b')['source']['contact_id'])

    def test_shared_phone_cannot_merge_two_source_customers(self):
        clients=[dict(id=sid,name='Jane Doe',firstName='Jane',lastName='Doe',emails=[],phones=[dict(number='7015550123')]) for sid in ['a','b']]
        contacts=[dict(id='local',org_id='o',location_id='a',first_name='Jane',last_name='Doe',phone='7015550123',email=None)]
        actual=decisions(clients,contacts,[], 'o','jobber','a')
        self.assertTrue(all(d['contact_id'] is None for d in actual.values()))

if __name__ == '__main__': unittest.main()
