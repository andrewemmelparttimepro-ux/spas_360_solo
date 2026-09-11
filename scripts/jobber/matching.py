"""Conservative, store-scoped matching for a captured Jobber inventory."""
import base64
import collections
import hashlib
import json
import re
import unicodedata
import uuid

NAMESPACE = uuid.UUID('6317f6e6-6f1d-5aeb-9cb7-40b4c82a0b6b')


def stable_id(org, account, kind, source_id):
    return str(uuid.uuid5(NAMESPACE, '\0'.join([org, account, kind, source_id])))


def checksum(value):
    return hashlib.sha256(json.dumps(value, sort_keys=True, separators=(',', ':')).encode()).hexdigest()


def normalize(value):
    text = unicodedata.normalize('NFKD', value or '').encode('ascii', 'ignore').decode().lower()
    return ' '.join(re.sub(r'[^a-z0-9]+', ' ', text).split())


def names(client):
    return {n for n in [normalize(client.get('name')), normalize(' '.join([client.get('firstName') or '', client.get('lastName') or '']))] if n}


def emails(client):
    return {e['address'].strip().lower() for e in client.get('emails', []) if e.get('address') and '@' in e['address']}


def address_text(address):
    return ', '.join(str(address.get(k) or '').strip() for k in ['street', 'city', 'province', 'postalCode'] if str(address.get(k) or '').strip())


def address_key(value):
    text = normalize(value)
    text = re.sub(r'\b(united states of america|united states|usa|us)\b', '', text)
    text = re.sub(r'\bnorth dakota\b', 'nd', text)
    replacements = {'street': 'st', 'avenue': 'ave', 'road': 'rd', 'drive': 'dr', 'lane': 'ln', 'court': 'ct', 'circle': 'cir', 'place': 'pl', 'boulevard': 'blvd', 'highway': 'hwy', 'northwest': 'nw', 'northeast': 'ne', 'southwest': 'sw', 'southeast': 'se', 'north': 'n', 'south': 's', 'east': 'e', 'west': 'w'}
    text = ' '.join(replacements.get(t, t) for t in text.split())
    # Postal-code differences alone are not an identity signal. Retain the
    # street number, unit, city and state; never match a city-only address.
    text = re.sub(r'\s+\d{5}(?:\s+\d{4})?$', '', text).strip()
    return text if re.match(r'^\d+\s+\S', text) else ''


def addresses(client):
    return {k for e in client.get('clientProperties', {}).get('edges', [])
            if (k := address_key(address_text(e['node'].get('address') or {})))}


def source_url(kind, source_id):
    try:
        number = base64.b64decode(source_id, validate=True).decode('ascii')
    except (ValueError, UnicodeError):
        return None
    return f'https://secure.getjobber.com/{kind}s/{number}' if re.fullmatch(r'\d+', number) else None


def match_clients(clients, existing, org, account, location):
    scoped = [c for c in existing if c['org_id'] == org and c.get('location_id') == location]
    by_name, by_email, by_address = (collections.defaultdict(set) for _ in range(3))
    for c in scoped:
        by_name[normalize(c['first_name'] + ' ' + c['last_name'])].add(c['id'])
        if c.get('email'):
            by_email[c['email'].strip().lower()].add(c['id'])
        if key := address_key(c.get('mailing_address')):
            by_address[key].add(c['id'])
    source_names, source_emails, source_addresses = (collections.defaultdict(set) for _ in range(3))
    for c in clients:
        for value in names(c): source_names[value].add(c['id'])
        for value in emails(c): source_emails[value].add(c['id'])
        for value in addresses(c): source_addresses[value].add(c['id'])
    decisions = {}
    for c in clients:
        ns, es, ads = names(c), emails(c), addresses(c)
        name_ids = set().union(*(by_name[n] for n in ns))
        email_ids = set().union(*(by_email[e] for e in es))
        address_ids = set().union(*(by_address[a] for a in ads))
        candidates = name_ids | email_ids | address_ids
        duplicate_name = any(len(source_names[n]) > 1 for n in ns)
        duplicate_email = any(len(source_emails[e]) > 1 for e in es)
        duplicate_address = any(len(source_addresses[a]) > 1 for a in ads)
        match, reason = None, ''
        if len(name_ids) == 1 and len(email_ids) == 1 and name_ids == email_ids and not duplicate_email:
            match, reason = next(iter(name_ids)), 'Unique matching name and email in this store'
        elif len(name_ids) == 1 and len(address_ids) == 1 and name_ids == address_ids and not duplicate_name:
            match, reason = next(iter(name_ids)), 'Unique matching name and street address in this store'
        # Conflicting identifiers need a person even if one pair agrees.
        if match and candidates != {match}:
            match, reason = None, 'Contact identifiers point to different SPAS customers'
        if match:
            decision = dict(status='matched', contact_id=match, reason=reason)
        elif candidates:
            decision = dict(status='review', contact_id=None, reason=reason or 'Possible existing customer; more identity evidence needed')
        elif duplicate_name or duplicate_email or duplicate_address:
            decision = dict(status='review', contact_id=None, reason='Multiple Jobber customers share a name, email or street address')
        elif not any(len(n.split()) >= 2 for n in ns) and not es and not ads:
            decision = dict(status='review', contact_id=None, reason='Sparse customer identity; verify before creating a contact')
        elif not any(re.search('[a-z]', n) for n in ns):
            decision = dict(status='review', contact_id=None, reason='Customer name needs verification')
        else:
            decision = dict(status='created', contact_id=stable_id(org, account, 'contact', c['id']), reason='No matching customer or conflicting identifier in this store')
        decision['candidates'] = sorted(candidates)
        decisions[c['id']] = decision
    # Two source identities must not silently collapse onto one native contact.
    reverse = collections.defaultdict(list)
    for source_id, d in decisions.items():
        if d['status'] == 'matched': reverse[d['contact_id']].append(source_id)
    for target, source_ids in reverse.items():
        if len(source_ids) > 1:
            for source_id in source_ids:
                decisions[source_id] = dict(status='review', contact_id=None, reason='Multiple Jobber identities point to one SPAS customer', candidates=[target])
    return decisions
