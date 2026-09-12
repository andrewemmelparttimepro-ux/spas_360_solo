"""Rehearse and apply detailed history without overwriting native customer data."""
import argparse
import collections
import concurrent.futures
import datetime
import json
import os
import runpy
from pathlib import Path
import urllib.parse
import urllib.request

from import_summaries import Destination, ORG, PROJECT, save
from matching import checksum, stable_id, source_url, address_text
from full_matching import source_id, decisions

ACCOUNTS = {
    'magic_city': dict(name='Magic City Home Leisure', location='00000000-0000-0000-0000-000000000010', account_id='Z2lkOi8vSm9iYmVyL0FjY291bnQvNDMzNTAw'),
    'spas_etc': dict(name='Spas Etc', location='00000000-0000-0000-0000-000000000011', account_id='Z2lkOi8vSm9iYmVyL0FjY291bnQvODI1NTIz'),
}
KINDS = {'clients':'client','jobs':'job','properties':'property','quotes':'quote','requests':'request','invoices':'invoice','visits':'visit','paymentRecords':'payment','expenses':'expense','products':'product','taxRates':'tax_rate'}
SUPPLEMENTAL_KINDS = {'users':'user','tasks':'task','timeSheetEntries':'timesheet','customFieldConfigurations':'custom_field','vehicles':'vehicle','payoutRecords':'payout','expenseUploadDocuments':'expense_document','expenseUploads':'expense_upload','marketingTasks':'marketing_task','socialMarketingItems':'marketing_item'}
now = lambda: datetime.datetime.now(datetime.timezone.utc).isoformat()
nodes = lambda value: (value or {}).get('nodes', []) if isinstance(value, dict) else value or []


def prepare(stage, phase):
    baseline_path = stage/('before-detailed-import.json' if phase == 'full' else 'before-full-history.json')
    baseline = json.loads(baseline_path.read_text())
    if baseline['project_id'] != PROJECT: raise ValueError('Wrong baseline')
    old_history = {(r['source_account_key'],r['record_kind'],r['source_id']):r for r in baseline['history']}
    contacts = {r['id']:r for r in baseline['contacts']}
    file_manifest = json.loads((stage/'files-manifest.json').read_text()) if (stage/'files-manifest.json').exists() else {}
    if (stage/'large-files-manifest.json').exists(): file_manifest.update(json.loads((stage/'large-files-manifest.json').read_text()))
    if (stage/'quote-images-manifest.json').exists(): file_manifest.update(json.loads((stage/'quote-images-manifest.json').read_text()))
    if phase == 'full' and any(f.get('status') != 'copied' for f in file_manifest.values()): raise ValueError('Original file copies are incomplete')
    plan = dict(project_id=PROJECT,org_id=ORG,phase=phase,prepared_at=now(),source_checksums={},history=[],new_contacts=[],contact_updates=[],counts={})
    if phase == 'full':
        inventory = runpy.run_path(str(Path(__file__).with_name('archive-files.py')))['inventory'](stage)
        if set(inventory) != {key for key in file_manifest if not file_manifest[key]['id'].startswith('quote-image:')}: raise ValueError('Attachment manifest and complete source inventory differ')
        for key, item in inventory.items():
            saved=file_manifest[key];source=item['source']
            if saved['file_size']!=source['fileSize'] or not saved.get('sha256'):raise ValueError('Attachment size or checksum missing')
            if saved.get('storage_parts'):
                if sum(part['size'] for part in saved['storage_parts'])!=saved['file_size'] or saved.get('cloud_sha256')!=saved['sha256']:raise ValueError('Large original cloud verification incomplete')
            elif not saved.get('storage_path'):raise ValueError('Original storage path missing')
        for name in ['files-manifest.json','large-files-manifest.json','quote-images-manifest.json']:
            if (stage/name).exists():plan['source_checksums'][name]=checksum(json.loads((stage/name).read_text()))
    all_kinds={**KINDS,**SUPPLEMENTAL_KINDS,'account':'account','events':'event','assessments':'assessment'}
    for account, settings in ACCOUNTS.items():
        folder = stage/account
        records = {}
        capture_times = {}
        detailed = set()
        relations_report = json.loads((folder/'relations-report.json').read_text()) if (folder/'relations-report.json').exists() else {'collections':{}}
        for collection in KINDS:
            if phase == 'customers' and collection != 'clients': continue
            path = folder/f'{collection}-details.json'
            if phase == 'full' and collection in ['clients','jobs','properties','quotes','requests','invoices','visits','paymentRecords']:
                if not path.exists() or not relations_report['collections'].get(collection,{}).get('complete'): raise ValueError(f'{account} {collection} relations are incomplete')
            if path.exists(): detailed.add(collection)
            else: path=folder/f'{collection}.json'
            if not path.exists():
                if phase == 'full': raise ValueError(f'{account} {collection} not captured')
                continue
            plan['source_checksums'][str(path.relative_to(stage))] = checksum(json.loads(path.read_text()))
            records[collection]=json.loads(path.read_text())
            for page_path in folder.glob(f'{collection}-base-*.json'):
                page=json.loads(page_path.read_text())
                for item in page['result']['data'][collection]['nodes']:
                    capture_times.setdefault(item['id'],{})['base']=page['capturedAt']
            if collection in detailed:
                for page_path in (folder/f'{collection}-relations').glob('*.json'):
                    page=json.loads(page_path.read_text())
                    for item in page['records']:capture_times.setdefault(item['id'],{})['relations']=page['capturedAt']
        if phase == 'full':
            supplemental=folder/'supplemental'
            supplemental_report=json.loads((supplemental/'base-report.json').read_text())
            for collection in SUPPLEMENTAL_KINDS:
                path=supplemental/f'{collection}.json'
                if collection in ['expenseUploadDocuments','expenseUploads','marketingTasks','socialMarketingItems'] and supplemental_report['collections'].get(collection,{}).get('unavailable'):continue
                if not supplemental_report['collections'].get(collection,{}).get('complete') or not path.exists():raise ValueError(f'{account} {collection} supplementary capture incomplete')
                records[collection]=json.loads(path.read_text());plan['source_checksums'][str(path.relative_to(stage))]=checksum(records[collection]);detailed.add(collection)
                for page_path in supplemental.glob(f'{collection}-base-*.json'):
                    page=json.loads(page_path.read_text())
                    for item in page['result']['data'][collection]['nodes']:capture_times.setdefault(item['id'],{})['base']=page['capturedAt']
            for path in (folder/'delta').glob('*.json'):
                delta=json.loads(path.read_text());collection=delta['collection']
                plan['source_checksums'][str(path.relative_to(stage))]=checksum(delta)
                merged={r['id']:r for r in records[collection]};merged.update({r['id']:r for r in delta['records']});records[collection]=list(merged.values())
                for item in delta['records']:capture_times.setdefault(item['id'],{})['delta']=delta['capturedAt']
            staff_folder=folder/'staff-associations'
            staff_report=json.loads((staff_folder/'report.json').read_text())
            author_notes={}
            for collection in ['clients','jobs','quotes','requests','invoices']:
                if not staff_report['collections'].get(collection+'-authors',{}).get('complete'):raise ValueError('Note author capture incomplete')
                path=staff_folder/f'{collection}-authors.json';items=json.loads(path.read_text());plan['source_checksums'][str(path.relative_to(stage))]=checksum(items)
                for row in items:
                    for note in nodes(row.get('notes')):author_notes[note['id']]=note
            for collection in ['jobs','quotes','requests','visits','tasks']:
                if not staff_report['collections'].get(collection,{}).get('complete'):raise ValueError('Staff assignment capture incomplete')
                path=staff_folder/f'{collection}.json';items=json.loads(path.read_text());plan['source_checksums'][str(path.relative_to(stage))]=checksum(items)
                assignments={r['id']:r for r in items}
                if set(assignments)!={r['id'] for r in records[collection]}:raise ValueError(f'{account} {collection} changed during extraction; capture the delta')
                for row in records[collection]:
                    row.update({key:value for key,value in assignments[row['id']].items() if key in ['createdBy','assignedUsers','salesperson']})
            for path in staff_folder.glob('*.json'):
                if path.name=='report.json' or '-authors.json' in path.name:continue
                page=json.loads(path.read_text())
                if not isinstance(page,dict) or not page.get('capturedAt'):continue
                items=page.get('records',[]) or [row for value in (page.get('result',{}).get('data') or {}).values() for row in nodes(value)]
                for item in items:capture_times.setdefault(item['id'],{})['staff']=max(capture_times.get(item['id'],{}).get('staff',''),page['capturedAt'])
            staff={r['id']:r for r in records['users']}
            def enrich(value):
                if isinstance(value,list):return [enrich(item) for item in value]
                if not isinstance(value,dict):return value
                value=dict(value)
                if value.get('id') in author_notes and value.get('__typename','').endswith('Note'):value.update(author_notes[value['id']])
                if value.get('id') in staff and value.get('__typename')=='User':value['name']=staff[value['id']]['name']
                return {key:enrich(item) for key,item in value.items()}
            records={collection:[enrich(row) for row in rows] for collection,rows in records.items()}
            calendar_report=json.loads((folder/'calendar/report.json').read_text())
            for collection in ['events','assessments']:
                if not calendar_report['collections'].get(collection,{}).get('complete'):raise ValueError('Calendar capture incomplete')
                path=folder/'calendar'/f'{collection}.json';records[collection]=json.loads(path.read_text());detailed.add(collection)
                plan['source_checksums'][str(path.relative_to(stage))]=checksum(records[collection])
                for page_path in (folder/'calendar').glob(f'{collection}-*.json'):
                    page=json.loads(page_path.read_text())
                    for item in page['result']['data']['scheduledItems']['nodes']:capture_times.setdefault(item['id'],{})['calendar']=page['capturedAt']
            account_capture=json.loads((folder/'account-inventory.json').read_text())
            records['account']=[dict(account_capture['account']['data']['account'])]
            records['account'][0]['migrationAvailability']={key:value for key,value in supplemental_report['collections'].items() if value.get('unavailable')}
            records['account'][0]['calendarCapture']={key:calendar_report[key] for key in ['from','through','collections']}
            capture_times[records['account'][0]['id']]={'base':account_capture['capturedAt']}
            plan['source_checksums'][str((folder/'account-inventory.json').relative_to(stage))]=checksum(account_capture)
        clients=[]
        for raw in records['clients']:
            clients.append({**raw,'api_id':raw['id'],'id':source_id(raw['id'])})
        prior=[r for r in baseline['history'] if r['source_account_key']==account and r['record_kind']=='client']
        matches=decisions(clients,list(contacts.values()),prior,ORG,account,settings['location'])
        client_names={c['api_id']:c['name'] for c in clients}
        for client in clients:
            match=matches[client['id']]
            if not match['contact_id']: continue
            phone=client.get('phone') or next((p['number'] for p in client.get('phones',[]) if p.get('primary')),None)
            email=client.get('email') or next((p['address'] for p in client.get('emails',[]) if p.get('primary')),None)
            billing=address_text(client.get('billingAddress') or {}) or None
            if match['contact_id'] not in contacts:
                if match['status']!='created': raise ValueError('Matched contact missing')
                new=dict(id=match['contact_id'],org_id=ORG,location_id=settings['location'],first_name=client['name'] if client.get('isCompany') else client.get('firstName') or client['name'],last_name='' if client.get('isCompany') else client.get('lastName') or '',phone=phone or '',email=email,mailing_address=billing,lead_source='Other',customer_type='Lead' if client.get('isLead') else 'Customer',tags=['Jobber import','jobber-api-20260912',f'Jobber account: {account}',f'Jobber client: {client["id"]}'])
                plan['new_contacts'].append(new);contacts[new['id']]=new
            else:
                existing=contacts[match['contact_id']]
                patch={k:v for k,v in dict(phone=phone,email=email,mailing_address=billing).items() if v and not str(existing.get(k) or '').strip()}
                if patch: plan['contact_updates'].append(dict(id=existing['id'],location_id=settings['location'],expected_updated_at=existing['updated_at'],before={k:existing.get(k) for k in patch},patch=patch))
        note_files=collections.defaultdict(dict)
        parent_files=collections.defaultdict(dict)
        for file in file_manifest.values():
            if file['account']!=account: continue
            public={k:file.get(k) for k in ['id','file_name','file_size','content_type','sha256','storage_path','storage_parts','preview_storage_path','status']}
            for ref in file['associations']:
                parent_files[(ref['collection'],ref['source_id'])][file['id']]=public
                if ref.get('note_id'): note_files[ref['note_id']][file['id']]=public
        visits_by_job=collections.defaultdict(list)
        for visit in records.get('visits',[]):
            job_id=(visit.get('job') or {}).get('id')
            visits_by_job[job_id].append({**visit,'history_id':stable_id(ORG,account,'visit',source_id(visit['id']))})
        properties={p['id']:p for p in records.get('properties',[])}
        available_history_ids={stable_id(ORG,account,all_kinds[c],source_id(r['id'])) for c,rows in records.items() for r in rows}
        for collection, rows in records.items():
            kind=all_kinds[collection]
            for raw in rows:
                sid=source_id(raw['id'])
                old=old_history.get((account,kind,sid))
                client_gid=raw['id'] if kind=='client' else (raw.get('client') or {}).get('id')
                client_sid=source_id(client_gid) if client_gid else None
                match=matches.get(client_sid) if client_sid else dict(status='not_applicable',contact_id=None,reason='Store record without a customer relationship',candidates=[])
                if client_sid and not match: raise ValueError(f'{account} {collection} has missing customer')
                name=raw['name'] if kind=='client' else client_names.get(client_gid,settings['name'])
                number=raw.get({'job':'jobNumber','quote':'quoteNumber','invoice':'invoiceNumber'}.get(kind,''))
                title=raw.get('title') or raw.get('subject') or raw.get('name') or f'{kind.replace("_"," ").title()} {number or sid}'
                if isinstance(title,dict):title=title.get('full') or ' '.join(str(value) for value in title.values() if value)
                if kind=='timesheet':title=f'{(raw.get("user") or {}).get("name",{}).get("full","Team member")} · {raw.get("label") or "Timesheet"}'
                summary=dict((old or {}).get('summary') or {})
                props=nodes(raw.get('clientProperties')) if kind=='client' else [raw['property']] if raw.get('property') else [raw] if kind=='property' else []
                props=[properties.get(p['id'],p) for p in props]
                addresses=[address_text(p.get('address') or p) for p in props]
                addresses=[a for a in addresses if a]
                if addresses: summary['addresses']=addresses
                elif 'addresses' not in summary:summary['addresses']=[]
                if kind=='client':
                    summary.update(emails=raw.get('emails',[]),phones=raw.get('phones',[]),billing_address=address_text(raw.get('billingAddress') or {}),company_name=raw.get('companyName'),property_count=len(nodes(raw.get('clientProperties') or raw.get('properties'))),tags=nodes(raw.get('tags')),is_lead=raw.get('isLead'),is_archived=raw.get('isArchived'),is_company=raw.get('isCompany'))
                else:
                    summary.update(total=raw.get('total', (raw.get('amounts') or {}).get('total')),job_type=raw.get('jobType'),start_at=raw.get('startAt'),completed_at=raw.get('completedAt'))
                notes=nodes(raw.get('notes'));files=dict(parent_files[(collection,raw['id'])])
                for note in notes:files.update(note_files[note['id']])
                visits=visits_by_job.get(raw['id'],[]) if kind=='job' else []
                summary.update(note_count=len(notes),file_count=len(files),visit_count=len(visits))
                links=[]
                for related,plural in [('job','jobs'),('client','clients'),('property','properties'),('quote','quotes'),('invoice','invoices'),('request','requests')]:
                    ref=raw.get(related)
                    if not isinstance(ref,dict) or not ref.get('id'):continue
                    rid=stable_id(ORG,account,related,source_id(ref['id']))
                    if rid==((old or {}).get('id') or stable_id(ORG,account,kind,sid)):continue
                    if rid not in available_history_ids:continue
                    links.append(dict(id=rid,label=f'{related.title()}: {ref.get("name") or ref.get("title") or ref.get("jobNumber") or ref.get("quoteNumber") or "Open record"}'))
                old_raw=(old or {}).get('raw')
                previous=old_raw.get('summary_capture') if isinstance(old_raw,dict) and 'jobber_api' in old_raw else old_raw
                archive=dict(jobber_api=raw,files=list(files.values()),visits=visits,links=links,extraction_times=capture_times.get(raw['id'],{}))
                if previous is not None:archive['summary_capture']=previous
                source_status='Archived' if raw.get('isArchived') else 'Lead' if raw.get('isLead') else 'Customer' if kind=='client' else next((raw[k] for k in ['jobStatus','quoteStatus','invoiceStatus','requestStatus','visitStatus','status'] if raw.get(k)),None)
                words=[title,name,str(number or ''),*summary['addresses'],*[e.get('address','') for e in raw.get('emails',[])],*[p.get('number','') for p in raw.get('phones',[])],*[n.get('message','') for n in notes],raw.get('note','')]
                row=dict(id=(old or {}).get('id') or stable_id(ORG,account,kind,sid),org_id=ORG,location_id=settings['location'],contact_id=match['contact_id'],source_account_key=account,source_account_name=settings['name'],source_account_id=settings['account_id'],record_kind=kind,source_id=sid,source_url=(old or {}).get('source_url') or (source_url(kind,sid) if kind in ['client','job','quote','request','invoice'] else None),source_client_id=client_sid,source_number=str(number) if number is not None else None,title=title,client_name=name,source_status=source_status,occurred_at=raw.get('startAt') or raw.get('issuedDate') or raw.get('entryDate') or raw.get('createdAt'),source_updated_at=raw.get('updatedAt'),captured_at=plan['prepared_at'],summary=summary,raw=archive,coverage='detail' if collection in detailed or collection not in ['clients','jobs','quotes','requests','invoices','visits','properties'] else 'summary',match_status=match['status'],match_reason=match['reason'],candidate_contact_ids=match['candidates'],source_checksum=checksum(raw),import_batch='jobber-api-20260912',search_text=' '.join(str(w) for w in words if w))
                plan['history'].append(row)
                row['captured_at']=max(archive['extraction_times'].values()) if archive['extraction_times'] else plan['prepared_at']
        plan['counts'][account]=dict(customers=len(clients),matching=dict(collections.Counter(m['status'] for m in matches.values())),records=dict(collections.Counter(r['record_kind'] for r in plan['history'] if r['source_account_key']==account)))
    # A customer can receive only one guarded patch in this batch.
    if len({u['id'] for u in plan['contact_updates']})!=len(plan['contact_updates']):raise ValueError('Multiple source identities would update one contact')
    if len({r['id'] for r in plan['history']})!=len(plan['history']):raise ValueError('Duplicate destination history identities')
    return plan


def apply(stage, plan, destination):
    if plan['project_id']!=PROJECT or plan['org_id']!=ORG:raise ValueError('Unexpected destination')
    for path,expected in plan['source_checksums'].items():
        if checksum(json.loads((stage/path).read_text()))!=expected:raise ValueError('Source changed since rehearsal')
    destination.insert('contacts',plan['new_contacts'])
    def update(item):
        params=urllib.parse.urlencode(dict(id='eq.'+item['id'],org_id='eq.'+ORG,location_id='eq.'+item['location_id'],updated_at='eq.'+item['expected_updated_at']))
        request=urllib.request.Request(destination.url+'contacts?'+params,method='PATCH',data=json.dumps(item['patch']).encode(),headers={'apikey':destination.key,'Authorization':'Bearer '+destination.key,'Content-Type':'application/json','Prefer':'return=representation'})
        with urllib.request.urlopen(request,timeout=90) as response:rows=json.loads(response.read())
        if not rows:return dict(id=item['id'],status='skipped_concurrent_change')
        if len(rows)!=1 or any(rows[0].get(k)!=v for k,v in item['patch'].items()):raise ValueError('Contact update verification failed')
        return dict(id=item['id'],status='updated',fields=list(item['patch']))
    receipts=[]
    with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:
        for receipt in pool.map(update,plan['contact_updates']):
            receipts.append(receipt)
            if len(receipts)%200==0:
                save(stage/f'{plan["phase"]}-contact-receipts.json',receipts)
                print('Customer fields processed',len(receipts),'/',len(plan['contact_updates']),flush=True)
    save(stage/f'{plan["phase"]}-contact-receipts.json',receipts)
    for offset in range(0,len(plan['history']),100):
        rows=plan['history'][offset:offset+100]
        request=urllib.request.Request(destination.url+'jobber_history?on_conflict=id',method='POST',data=json.dumps(rows).encode(),headers={'apikey':destination.key,'Authorization':'Bearer '+destination.key,'Content-Type':'application/json','Prefer':'resolution=merge-duplicates,return=minimal'})
        with urllib.request.urlopen(request,timeout=90) as response:response.read()
        if offset%1000==0:print('History records processed',offset+len(rows),'/',len(plan['history']),flush=True)
    actual={r['id']:r for r in destination.rows('jobber_history','id,source_checksum,source_account_key,location_id,record_kind,source_id,source_client_id,contact_id,match_status,coverage')}
    for expected in plan['history']:
        row=actual.get(expected['id'])
        if not row or any(row[k]!=expected[k] for k in row):raise ValueError('History reconciliation failed')
    result=dict(completed_at=now(),phase=plan['phase'],counts=plan['counts'],new_contacts=len(plan['new_contacts']),contact_updates=dict(collections.Counter(r['status'] for r in receipts)),history_records=len(plan['history']),verified=True)
    save(stage/f'{plan["phase"]}-import-receipt.json',result);print(json.dumps(result),flush=True)


if __name__=='__main__':
    parser=argparse.ArgumentParser();parser.add_argument('--staging',type=Path,required=True);parser.add_argument('--phase',choices=['customers','full'],default='customers');parser.add_argument('--env-file',type=Path);parser.add_argument('--apply',action='store_true');args=parser.parse_args();os.umask(0o077)
    path=args.staging/f'{args.phase}-import-plan.json'
    if args.apply:apply(args.staging,json.loads(path.read_text()),Destination(args.env_file))
    else:
        plan=prepare(args.staging,args.phase);save(path,plan)
        print(json.dumps(dict(counts=plan['counts'],new_contacts=len(plan['new_contacts']),contact_updates=len(plan['contact_updates']),history_records=len(plan['history']))))
