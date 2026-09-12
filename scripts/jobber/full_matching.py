"""Identity evidence for enriching the existing store-qualified import."""
import base64
import collections
import re

from matching import normalize, names, emails, match_clients, stable_id


def source_id(value):
    decoded = base64.b64decode(value + '=' * (-len(value) % 4)).decode()
    numeric = decoded.rsplit('/', 1)[-1]
    if not re.fullmatch(r'\d+', numeric):
        raise ValueError('Expected a numeric Jobber source identity')
    return base64.b64encode(numeric.encode()).decode()


def phone_key(value):
    # Extensions belong in the saved source value, not in the identity key.
    number = re.split(r'\b(?:ext|extension|x)\b', value or '', flags=re.I)[0]
    digits = re.sub(r'\D', '', number)
    if len(digits) == 11 and digits[0] == '1': digits = digits[1:]
    return digits if len(digits) == 10 else ''


def phones(client):
    return {key for p in client.get('phones', []) if (key := phone_key(p.get('number')))}


def decisions(clients, contacts, previous, org, account, location):
    """Keep established links and only resolve new ones with independent evidence."""
    by_contact = {c['id']: c for c in contacts if c['org_id'] == org and c.get('location_id') == location}
    indexes = [collections.defaultdict(set) for _ in range(3)]
    by_name, by_email, by_phone = indexes
    for c in by_contact.values():
        by_name[normalize(c['first_name'] + ' ' + c['last_name'])].add(c['id'])
        if c.get('email'): by_email[c['email'].strip().lower()].add(c['id'])
        if key := phone_key(c.get('phone')): by_phone[key].add(c['id'])
    source_emails, source_phones = collections.defaultdict(set), collections.defaultdict(set)
    for c in clients:
        for email in emails(c): source_emails[email].add(c['id'])
        for phone in phones(c): source_phones[phone].add(c['id'])
    owned = {row['contact_id']: row['source_id'] for row in previous if row.get('contact_id')}
    prior = {row['source_id']: row for row in previous}
    fallback = match_clients(clients, contacts, org, account, location)
    result = {}
    for c in clients:
        old = prior.get(c['id'])
        if old and old.get('contact_id'):
            if old['contact_id'] not in by_contact: raise ValueError('Established contact changed store or disappeared')
            result[c['id']] = dict(status=old['match_status'], contact_id=old['contact_id'], reason=old['match_reason'], candidates=[])
            continue
        ns = set().union(*(by_name[n] for n in names(c)))
        es = set().union(*(by_email[e] for e in emails(c)))
        ps = set().union(*(by_phone[p] for p in phones(c)))
        candidates = ns | es | ps | set((old or {}).get('candidate_contact_ids') or [])
        unique_phone = bool(phones(c)) and all(len(source_phones[p]) == 1 for p in phones(c))
        unique_email = bool(emails(c)) and all(len(source_emails[e]) == 1 for e in emails(c))
        target = None
        if len(ps) == 1 and unique_phone and ((ns == ps and len(ns) == 1) or (es == ps and unique_email)):
            target = next(iter(ps))
        if target and (candidates != {target} or (target in owned and owned[target] != c['id'])): target = None
        if target:
            result[c['id']] = dict(status='matched', contact_id=target, reason='Unique matching phone and name or email in this store', candidates=[])
        elif old or candidates:
            result[c['id']] = dict(status='review', contact_id=None, reason='Conflicting or incomplete identity evidence remains; no forced merge', candidates=sorted(candidates))
        else:
            result[c['id']] = fallback[c['id']]
    reverse = collections.defaultdict(list)
    for sid, item in result.items():
        if item['contact_id']: reverse[item['contact_id']].append(sid)
    for cid, ids in reverse.items():
        if len(ids) <= 1: continue
        for sid in ids:
            if prior.get(sid, {}).get('contact_id') == cid: continue
            result[sid] = dict(status='review', contact_id=None, reason='Another Jobber customer already owns this SPAS match', candidates=[cid])
    return result
