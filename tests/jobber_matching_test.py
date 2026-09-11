import sys
from pathlib import Path
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'scripts' / 'jobber'))
from matching import address_key, match_clients, source_url, stable_id


def client(id='1', name='Jane Smith', email='jane@example.test', street='123 12th Street Northeast'):
    return dict(id=id, name=name, firstName=name.split()[0], lastName=' '.join(name.split()[1:]),
        emails=[dict(address=email)] if email else [],
        clientProperties=dict(edges=[dict(node=dict(address=dict(street=street, city='Minot', province='North Dakota', postalCode='58701')))] if street else []))


def contact(id='native', name='Jane Smith', email='jane@example.test', address='123 12th St NE, Minot ND 58701 United States', location='minot'):
    return dict(id=id, org_id='org', location_id=location, first_name=name.split()[0], last_name=' '.join(name.split()[1:]), email=email, mailing_address=address)


class MatchingTests(unittest.TestCase):
    def run_match(self, clients, contacts):
        return match_clients(clients, contacts, 'org', 'magic_city', 'minot')

    def test_numeric_street_and_country_normalization(self):
        self.assertEqual(address_key('123 12th Street Northeast, Minot, North Dakota, 58701'), address_key('123 12th St NE Minot ND 58701 United States'))
        self.assertEqual(address_key('Minot ND 58701'), '')

    def test_unique_name_plus_address_without_email(self):
        d = self.run_match([client(email=None)], [contact(email=None)])['1']
        self.assertEqual((d['status'], d['contact_id']), ('matched', 'native'))

    def test_name_alone_never_merges_or_creates_duplicate(self):
        self.assertEqual(self.run_match([client(email=None, street=None)], [contact()])['1']['status'], 'review')

    def test_family_email_does_not_merge_different_names(self):
        self.assertEqual(self.run_match([client(name='John Smith')], [contact()])['1']['status'], 'review')

    def test_conflicting_email_and_address_needs_review(self):
        rows = [contact(), contact(id='second', name='Jane Smith', email='second@example.test', address='987 Elm Ave Minot ND')]
        self.assertEqual(self.run_match([client()], rows)['1']['status'], 'review')

    def test_source_duplicate_names_and_emails_held(self):
        result = self.run_match([client(id='1'), client(id='2')], [])
        self.assertEqual({d['status'] for d in result.values()}, {'review'})

    def test_store_scope_and_stable_identity(self):
        d = self.run_match([client()], [contact(location='bismarck')])['1']
        self.assertEqual(d['status'], 'created')
        self.assertEqual(d['contact_id'], stable_id('org', 'magic_city', 'contact', '1'))
        self.assertNotEqual(d['contact_id'], stable_id('org', 'spas_etc', 'contact', '1'))

    def test_no_multiple_sources_collapsed_to_same_native_contact(self):
        rows = [client('1'), client('2', email='second@example.test')]
        result = self.run_match(rows, [contact()])
        self.assertLessEqual(sum(d['contact_id'] == 'native' for d in result.values()), 1)

    def test_only_observed_numeric_source_link_format(self):
        self.assertEqual(source_url('job', 'Nzc2Njk4NTE='), 'https://secure.getjobber.com/jobs/77669851')
        self.assertIsNone(source_url('job', 'not-a-valid-id'))


if __name__ == '__main__': unittest.main()
