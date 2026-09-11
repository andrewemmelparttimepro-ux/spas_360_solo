"""Rehearse and apply the account-qualified Jobber summary import.

The staging directory and destination snapshot contain customer data. Keep them
outside git. This importer creates contacts and immutable source history only.
It never updates existing contacts, schedules jobs, or posts financial balances.
"""
import argparse
import collections
import datetime
import json
import os
from pathlib import Path
import urllib.error
import urllib.parse
import urllib.request

from matching import address_text, checksum, emails, match_clients, source_url, stable_id

PROJECT = 'kxyqgkimcdxvfkceoixs'
ORG = '00000000-0000-0000-0000-000000000001'
BATCH = 'jobber-ui-20260911-customers-jobs'
ACCOUNTS = {
    'spas_etc': dict(name='Spas Etc', id='ODI1NTIz', location='00000000-0000-0000-0000-000000000011', clients=5403, jobs=3242),
    'magic_city': dict(name='Magic City Home Leisure', id=None, location='00000000-0000-0000-0000-000000000010', clients=2248, jobs=4380),
}


def save(path, value):
    path.write_text(json.dumps(value, ensure_ascii=False, separators=(',', ':')))
    path.chmod(0o600)


def source_records(staging):
    records, files = {}, {}
    for path in sorted(staging.glob('jobber-*-20260911.json')):
        payload = json.loads(path.read_text())
        if not isinstance(payload, dict) or 'pages' not in payload: continue
        files[path.name] = checksum(payload)
        for page in payload['pages']:
            account = page['account']
            if account not in ACCOUNTS: raise ValueError('Unknown source account')
            for plural in ['clients', 'jobs']:
                for edge in page['data'].get(plural, {}).get('edges', []):
                    node = edge['node']
                    key = (account, plural, node['id'])
                    captured = page['capturedAt']
                    if key not in records or records[key]['captured_at'] < captured:
                        records[key] = dict(raw=node, captured_at=captured)
    for account, settings in ACCOUNTS.items():
        for plural in ['clients', 'jobs']:
            actual = sum(k[0] == account and k[1] == plural for k in records)
            if actual != settings[plural]: raise ValueError(f'Incomplete {account} {plural}: {actual}')
    return records, files


def build_plan(staging, snapshot):
    if snapshot['project_id'] != PROJECT: raise ValueError('Wrong destination project')
    sources, files = source_records(staging)
    contacts, history, decisions_by_account = [], [], {}
    for account, settings in ACCOUNTS.items():
        clients = [v['raw'] for k, v in sources.items() if k[:2] == (account, 'clients')]
        decisions = match_clients(clients, snapshot['contacts'], ORG, account, settings['location'])
        decisions_by_account[account] = decisions
        for c in clients:
            d = decisions[c['id']]
            if d['status'] != 'created': continue
            # Jobber display name can be a business. Preserve it without treating
            # arbitrary companyName bookkeeping text as the customer's identity.
            first = (c.get('firstName') or '').strip()
            last = (c.get('lastName') or '').strip()
            if c.get('isCompany') or not first: first, last = c['name'], ''
            primary = next((e['address'].strip() for e in c.get('emails', []) if e.get('primary') and e.get('address')), None)
            primary = primary or next(iter(sorted(emails(c))), None)
            contacts.append(dict(id=d['contact_id'], org_id=ORG, location_id=settings['location'],
                first_name=first, last_name=last, email=primary, phone='', mailing_address=None,
                lead_source='Other', customer_type='Past Customer' if c.get('isArchived') else 'Lead' if c.get('isLead') else 'Customer',
                tags=['Jobber import', BATCH, f'Jobber account: {account}', f'Jobber client: {c["id"]}']))
        for (a, plural, source_id), source in sources.items():
            if a != account: continue
            raw, captured = source['raw'], source['captured_at']
            kind = 'client' if plural == 'clients' else 'job'
            client_id = source_id if kind == 'client' else raw['client']['id']
            if client_id not in decisions: raise ValueError('Job has a missing source customer')
            d = decisions[client_id]
            client_name = raw['name'] if kind == 'client' else raw['client']['name']
            properties = [e['node'] for e in raw.get('clientProperties', {}).get('edges', [])] if kind == 'client' else [raw['property']] if raw.get('property') else []
            addresses = [address_text(p.get('address') or {}) for p in properties]
            summary = dict(addresses=[a for a in addresses if a], properties=properties)
            if kind == 'client':
                summary.update(emails=raw.get('emails', []), company_name=raw.get('companyName'),
                    is_lead=raw.get('isLead'), is_archived=raw.get('isArchived'), is_company=raw.get('isCompany'),
                    property_count=len(raw.get('clientPropertiesCount', {}).get('edges', [])), tags=raw.get('tags', {}).get('nodes', []))
                status = 'Archived' if raw.get('isArchived') else 'Lead' if raw.get('isLead') else 'Customer'
                title, occurred = client_name, None
            else:
                summary.update(total=raw.get('total'), job_type=raw.get('jobType'), start_at=raw.get('startAt'),
                    completed_at=raw.get('completedAt'), next_visit=(raw.get('visitSchedule') or {}).get('next'))
                status, title, occurred = raw.get('jobStatus'), raw.get('title') or f'Job {raw.get("jobNumber", "")}', raw.get('startAt')
            history.append(dict(id=stable_id(ORG, account, kind, source_id), org_id=ORG, location_id=settings['location'],
                contact_id=d['contact_id'], source_account_key=account, source_account_name=settings['name'], source_account_id=settings['id'],
                record_kind=kind, source_id=source_id, source_url=source_url(kind, source_id), source_client_id=client_id,
                source_number=str(raw['jobNumber']) if kind == 'job' else None, title=title, client_name=client_name,
                source_status=status, occurred_at=occurred, source_updated_at=raw.get('updatedAt'), captured_at=captured,
                summary=summary, raw=raw, coverage='summary', match_status=d['status'], match_reason=d['reason'],
                candidate_contact_ids=d['candidates'], source_checksum=checksum(raw), import_batch=BATCH,
                search_text=' '.join([title, client_name, str(raw.get('jobNumber') or ''), *addresses,
                    *([e.get('address', '') for e in raw.get('emails', [])] if kind == 'client' else [])])))
    counts = {account: dict(collections.Counter(d['status'] for d in decisions.values())) for account, decisions in decisions_by_account.items()}
    return dict(project_id=PROJECT, org_id=ORG, import_batch=BATCH, prepared_at=datetime.datetime.now(datetime.timezone.utc).isoformat(),
        source_files=files, baseline_contacts=snapshot['contacts'], contacts=contacts, history=history, counts=counts)


class Destination:
    def __init__(self, env_path):
        env = {}
        for line in Path(env_path).read_text().splitlines():
            if not line or line.startswith('#') or '=' not in line: continue
            k, v = line.split('=', 1)
            env[k] = v.strip().strip('"').strip("'").replace('\\n', '').strip()
        url = env.get('VITE_SUPABASE_URL') or env.get('SUPABASE_URL')
        if (url or '').rstrip('/') != f'https://{PROJECT}.supabase.co': raise ValueError('Unexpected Supabase destination')
        self.key = env.get('SUPABASE_SERVICE_ROLE_KEY')
        if not self.key: raise ValueError('Destination service credential missing')
        self.url = url.rstrip('/') + '/rest/v1/'

    def request(self, route, data=None):
        headers = {'apikey': self.key, 'Authorization': f'Bearer {self.key}'}
        if data is not None: headers.update({'Content-Type': 'application/json', 'Prefer': 'resolution=ignore-duplicates,return=minimal'})
        req = urllib.request.Request(self.url + route, headers=headers, data=json.dumps(data).encode() if data is not None else None)
        try:
            with urllib.request.urlopen(req, timeout=90) as response:
                body = response.read()
                return json.loads(body) if body else None
        except urllib.error.HTTPError as error:
            # Preserve the provider error privately, without printing customer data.
            self.last_error = error.read().decode()
            raise RuntimeError(f'Destination request failed (HTTP {error.code})') from None

    def rows(self, table, select='*'):
        result = []
        for offset in range(0, 1000000, 1000):
            page = self.request(f'{table}?select={urllib.parse.quote(select)}&org_id=eq.{ORG}&order=id&limit=1000&offset={offset}')
            result.extend(page)
            if len(page) < 1000: return result
        raise RuntimeError('Unexpected destination size')

    def insert(self, table, rows):
        for start in range(0, len(rows), 200):
            self.request(table + '?on_conflict=id', rows[start:start + 200])
            print(json.dumps(dict(table=table, processed=min(start + 200, len(rows)), total=len(rows))), flush=True)


def apply(plan, destination, staging):
    if plan['project_id'] != PROJECT or plan['org_id'] != ORG or plan['import_batch'] != BATCH: raise ValueError('Wrong import plan')
    _, files = source_records(staging)
    if files != plan['source_files']: raise ValueError('Source files changed since rehearsal')
    live = destination.rows('contacts')
    by_id = {c['id']: c for c in live}
    baseline = {c['id']: c for c in plan['baseline_contacts']}
    new_ids = {c['id'] for c in plan['contacts']}
    # Re-running a partially applied plan is safe; unrelated destination changes
    # require a fresh rehearsal rather than silently accepting stale matches.
    if set(by_id) - new_ids != set(baseline): raise ValueError('Destination contacts changed; rehearse again')
    for key, old in baseline.items():
        if checksum(by_id[key]) != checksum(old): raise ValueError('Existing customer changed; rehearse again')
    for c in plan['contacts']:
        if c['id'] in by_id and any(by_id[c['id']].get(k) != v for k, v in c.items()):
            raise ValueError('An imported contact was edited; review before resuming')
    destination.insert('contacts', plan['contacts'])
    destination.insert('jobber_history', plan['history'])
    rows = destination.rows('jobber_history', 'id,source_account_key,record_kind,source_id,contact_id,location_id,source_checksum,import_batch,match_status,coverage')
    imported = {r['id']: r for r in rows if r['import_batch'] == BATCH}
    if set(imported) != {r['id'] for r in plan['history']}: raise ValueError('History ID reconciliation failed')
    for row in plan['history']:
        if any(imported[row['id']].get(k) != row[k] for k in imported[row['id']]): raise ValueError('History field reconciliation failed')
    final_contacts = {c['id']: c for c in destination.rows('contacts')}
    if not new_ids <= set(final_contacts): raise ValueError('New contacts missing')
    unchanged = all(checksum(final_contacts[key]) == checksum(old) for key, old in baseline.items())
    receipt = dict(completed_at=datetime.datetime.now(datetime.timezone.utc).isoformat(), project_id=PROJECT, import_batch=BATCH,
        source_counts=plan['counts'], native_contacts_created=len(new_ids), history_records=len(imported),
        original_contacts_unchanged=unchanged, record_ids_checksums_links_stores_reconciled=True,
        coverage='Customer and job list summaries only. Full notes, visits, files and financial history pending Brandon admin extraction.')
    save(staging / 'import-receipt.json', receipt)
    print(json.dumps(receipt), flush=True)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--staging', type=Path, required=True)
    parser.add_argument('--snapshot', type=Path)
    parser.add_argument('--env-file', type=Path)
    parser.add_argument('--apply', action='store_true')
    parser.add_argument('--refresh-snapshot', action='store_true')
    args = parser.parse_args()
    os.umask(0o077)
    path = args.staging / 'import-plan.json'
    if args.refresh_snapshot:
        destination = Destination(args.env_file)
        save(args.staging / 'spas-preflight.json', dict(project_id=PROJECT, contacts=destination.rows('contacts')))
        print('Fresh destination snapshot saved privately')
    elif args.apply:
        destination = Destination(args.env_file)
        try: apply(json.loads(path.read_text()), destination, args.staging)
        except Exception:
            if hasattr(destination, 'last_error'): save(args.staging / 'destination-error.json', dict(error=destination.last_error))
            raise
    else:
        plan = build_plan(args.staging, json.loads(args.snapshot.read_text()))
        save(path, plan)
        save(args.staging / 'matching-review.json', [r for r in plan['history'] if r['record_kind'] == 'client' and r['match_status'] == 'review'])
        print(json.dumps(dict(counts=plan['counts'], new_contacts=len(plan['contacts']), history_records=len(plan['history']), plan_sha256=checksum(plan))))


if __name__ == '__main__': main()
