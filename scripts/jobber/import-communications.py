"""Archive communication dialogs captured through Jobber's authorized report UI."""
import argparse
import base64
import collections
import datetime
import hashlib
import json
import os
from pathlib import Path
import re
import runpy
import urllib.parse
import urllib.request
from zoneinfo import ZoneInfo

from import_summaries import Destination, ORG, PROJECT, save
from matching import checksum, normalize, stable_id
from full_matching import phone_key, source_id

helpers=runpy.run_path(str(Path(__file__).with_name('archive-files.py')))
ACCOUNTS={'magic_city':('Magic City Home Leisure','00000000-0000-0000-0000-000000000010'),'spas_etc':('Spas Etc','00000000-0000-0000-0000-000000000011')}
now=lambda:datetime.datetime.now(datetime.timezone.utc).isoformat()


def archive_files(stage,destination):
    path=stage/'communication-files-manifest.json'
    manifest=json.loads(path.read_text()) if path.exists() else {}
    for account in ACCOUNTS:
        for file in (stage/account/'communications-details-ui').glob('*.json'):
            capture=json.loads(file.read_text())
            for link in capture['links']:
                name=link['text'].strip()
                if not re.search(r'\.(pdf|docx?|xlsx?|csv|txt|jpe?g|png|heic|webp|mp4|mov|zip)$',name,re.I):continue
                url=urllib.parse.urlparse(link['href'])
                if url.scheme!='https' or url.hostname not in helpers['ALLOWED_HOSTS']:raise ValueError('An attachment uses a different origin and needs review')
                identity=hashlib.sha256((url.hostname+url.path).encode()).hexdigest()
                key=account+':'+identity
                reference={'communication_id':file.stem}
                if key not in manifest:
                    data,content_type=helpers['get'](link['href'])
                    if len(data)>50_000_000:raise ValueError('A communication attachment needs the large original archive path')
                    sha=hashlib.sha256(data).hexdigest()
                    extension=Path(name).suffix.lower()
                    local=stage/'communication-attachments'/account/(sha+extension)
                    local.parent.mkdir(parents=True,exist_ok=True,mode=0o700);local.write_bytes(data);local.chmod(0o600)
                    storage_path=f'{ORG}/{account}/communications/{identity}/{sha}{extension}'
                    helpers['upload'](destination,storage_path,data,content_type)
                    request=urllib.request.Request(f'https://{PROJECT}.supabase.co/storage/v1/object/jobber-history/{storage_path}',headers={'apikey':destination.key,'Authorization':'Bearer '+destination.key})
                    with urllib.request.urlopen(request,timeout=90) as response:cloud=response.read()
                    if hashlib.sha256(cloud).hexdigest()!=sha:raise ValueError('Communication attachment cloud checksum differs')
                    manifest[key]=dict(id='communication-file:'+identity,account=account,file_name=name,file_size=len(data),sha256=sha,cloud_sha256=sha,local_path=str(local),storage_path=storage_path,content_type=content_type,source_url=link['href'],status='copied',associations=[],copied_at=now())
                if reference not in manifest[key]['associations']:manifest[key]['associations'].append(reference)
    save(path,manifest)
    return manifest


def prepare(stage,manifest):
    full=json.loads((stage/'full-import-plan.json').read_text())
    client_history={(r['source_account_key'],r['source_id']):r for r in full['history'] if r['record_kind']=='client'}
    result=dict(project_id=PROJECT,org_id=ORG,prepared_at=now(),history=[],source_checksums={},counts={})
    for account,(account_name,location) in ACCOUNTS.items():
        folder=stage/account
        path=folder/'communications-all-columns-ui.json'
        pages=json.loads(path.read_text());result['source_checksums'][str(path.relative_to(stage))]=checksum(pages)
        clients=json.loads((folder/'clients.json').read_text())
        by_name=collections.defaultdict(list)
        for client in clients:by_name[normalize(client['name'])].append(client)
        reports={};expected=None
        for page in pages:
            match=re.search(r'Showing [\d,]+ to [\d,]+ of ([\d,]+) entries',page['pagination'])
            if not match:raise ValueError('Report count missing')
            count=int(match[1].replace(',',''))
            if expected is not None and expected!=count:raise ValueError('Communication report changed during capture')
            expected=count
            for row in page['rows']:
                if len(row['cells'])!=len(page['headers']) or len(page['headers'])!=14:raise ValueError('All communication columns are required')
                source_url=next(link['href'] for link in row['links'] if '/comms/comm.dialog' in link['href'])
                identifier=urllib.parse.parse_qs(urllib.parse.urlparse(source_url).query)['id'][0]
                if not identifier.isdigit() or identifier in reports:raise ValueError('Invalid or duplicate communication identity')
                reports[identifier]=(dict(zip(page['headers'],row['cells'])),source_url,page)
        if len(reports)!=expected:raise ValueError('Communication pages are incomplete')
        for identifier,(report,detail_url,page) in reports.items():
            path=folder/'communications-details-ui'/f'{identifier}.json'
            detail=json.loads(path.read_text())
            result['source_checksums'][str(path.relative_to(stage))]=checksum(detail)
            if detail['sourceUrl']!=detail_url or not detail['text'].strip():raise ValueError('Communication body is missing or has a different identity')
            if any(frame.get('text') is None for frame in detail.get('frames',[])):raise ValueError('A communication frame has not been captured')
            if any(image.get('src') for image in detail.get('images',[])) or any(frame.get('images') for frame in detail.get('frames',[])):raise ValueError('Inline communication images need archival')
            attached=[file for file in manifest.values() if file['account']==account and {'communication_id':identifier} in file['associations']]
            expected_files=int(report['Attachments'] or 0)
            if len(attached)!=expected_files:raise ValueError(f'{account} communication {identifier} has uncopied attachments')
            name=report['Client name'].strip()
            # Incoming texts omit the correspondent from the report's To column,
            # but the message dialog exposes it in the same labeled field.
            dialog_to=re.search(r'(?:^|\n)To:\s*\n([^\n]+)',detail['text'])
            recipient=report['To'] if report['To'].strip() not in ('','-') else dialog_to[1] if dialog_to else ''
            destinations=re.findall(r'[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}',recipient,re.I)
            addresses={value.lower() for value in destinations}
            phones={phone_key(value) for value in re.split(r'[,;]',recipient)};phones.discard('')
            candidates=[client for client in by_name[normalize(name)] if addresses.intersection(email.get('address','').lower() for email in client.get('emails',[])) or phones.intersection(phone_key(phone.get('number')) for phone in client.get('phones',[]))]
            linked=client_history.get((account,source_id(candidates[0]['id']))) if len(candidates)==1 else None
            client_id=linked['source_id'] if linked else None
            contact_id=linked.get('contact_id') if linked else None
            status='matched' if contact_id else 'not_applicable' if name in ('Unknown','-','') else 'review'
            title=report['Subject'].strip() or report['Type'].strip() or 'Communication'
            timestamp=None;ambiguous_time=False
            try:
                parsed=datetime.datetime.strptime(report['Sent date']+' '+report['~Sent time'],'%b %d, %Y %I:%M%p')
                aware=parsed.replace(tzinfo=ZoneInfo('America/Chicago'))
                ambiguous_time=aware.utcoffset()!=aware.replace(fold=1).utcoffset()
                if not ambiguous_time:timestamp=aware.astimezone(datetime.timezone.utc).isoformat()
            except ValueError:pass
            sid=base64.b64encode(identifier.encode()).decode()
            raw=dict(__typename='JobberCommunication',id=sid,message=detail['text'],report=report,source_detail_url=detail_url,links=detail['links'],frames=detail.get('frames',[]),timezone='America/Chicago',time_ambiguous=ambiguous_time)
            files=[{key:file[key] for key in ['id','file_name','file_size','content_type','sha256','storage_path','status']} for file in attached]
            links=[dict(id=linked['id'],label='Customer history')] if linked else []
            archive=dict(jobber_api=raw,files=files,links=links,extraction_times=dict(report=page['capturedAt'],detail=detail['capturedAt']))
            row=dict(id=stable_id(ORG,account,'communication',sid),org_id=ORG,location_id=location,contact_id=contact_id,source_account_key=account,source_account_name=account_name,source_account_id=next(r['source_account_id'] for r in full['history'] if r['source_account_key']==account),record_kind='communication',source_id=sid,source_url=page['sourceUrl'],source_client_id=client_id,source_number=None,title=title,client_name=name or 'Unidentified correspondent',source_status=report['Status'],occurred_at=timestamp,source_updated_at=None,captured_at=detail['capturedAt'],summary=dict(file_count=len(files),sent_date=report['Sent date'],sent_time=report['~Sent time'],communication_type=report['Type']),raw=archive,coverage='detail',match_status=status,match_reason='Linked through matching Jobber customer name and email or phone' if linked else 'Original correspondence preserved with its report identity',candidate_contact_ids=[],source_checksum=checksum(raw),import_batch='jobber-communications-20260912',search_text=' '.join([name,title,*report.values(),detail['text']]))
            result['history'].append(row)
        result['counts'][account]=dict(communications=len(reports),files=sum(len(r['raw']['files']) for r in result['history'] if r['source_account_key']==account),linked=sum(bool(r['contact_id']) for r in result['history'] if r['source_account_key']==account))
    result['source_checksums']['communication-files-manifest.json']=checksum(manifest)
    return result


if __name__=='__main__':
    parser=argparse.ArgumentParser();parser.add_argument('--staging',type=Path,required=True);parser.add_argument('--env-file',type=Path,required=True);parser.add_argument('--apply',action='store_true');args=parser.parse_args();os.umask(0o077)
    destination=Destination(args.env_file);path=args.staging/'communications-import-plan.json'
    if not args.apply:
        plan=prepare(args.staging,archive_files(args.staging,destination));save(path,plan);print(json.dumps(plan['counts']))
    else:
        plan=json.loads(path.read_text())
        if plan['project_id']!=PROJECT or plan['org_id']!=ORG:raise ValueError('Destination differs')
        for name,expected in plan['source_checksums'].items():
            if checksum(json.loads((args.staging/name).read_text()))!=expected:raise ValueError('Communication source changed after rehearsal')
        for offset in range(0,len(plan['history']),100):
            request=urllib.request.Request(destination.url+'jobber_history?on_conflict=id',data=json.dumps(plan['history'][offset:offset+100]).encode(),method='POST',headers={'apikey':destination.key,'Authorization':'Bearer '+destination.key,'Content-Type':'application/json','Prefer':'resolution=merge-duplicates,return=minimal'})
            with urllib.request.urlopen(request,timeout=90) as response:response.read()
        actual={row['id']:row for row in destination.rows('jobber_history','id,source_checksum,source_account_key,location_id,contact_id')}
        for row in plan['history']:
            if any(actual.get(row['id'],{}).get(key)!=row[key] for key in ['source_checksum','source_account_key','location_id','contact_id']):raise ValueError('Communication reconciliation failed')
        receipt=dict(completed_at=now(),counts=plan['counts'],verified=True);save(args.staging/'communications-import-receipt.json',receipt);print(json.dumps(receipt))
