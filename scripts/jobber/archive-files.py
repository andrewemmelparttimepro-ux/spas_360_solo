"""Download original Jobber attachments and copy them into private SPAS storage."""
import argparse
import concurrent.futures
import hashlib
import json
import mimetypes
import os
from pathlib import Path
import re
import threading
import time
import urllib.error
import urllib.parse
import urllib.request

from import_summaries import Destination, ORG, PROJECT, save

ALLOWED_HOSTS = {'jobber.s3.amazonaws.com', 'jobber-production-general-uploads.s3.amazonaws.com'}


def get(url):
    parsed = urllib.parse.urlparse(url)
    if parsed.scheme != 'https' or parsed.hostname not in ALLOWED_HOSTS: raise ValueError('Unrecognized Jobber attachment origin')
    with urllib.request.urlopen(urllib.request.Request(url, headers={'User-Agent': 'SPAS360-Authorized-Migration/1.0'}), timeout=90) as response:
        if urllib.parse.urlparse(response.geturl()).hostname not in ALLOWED_HOSTS: raise ValueError('Unexpected attachment redirect')
        return response.read(), response.headers.get_content_type()


def upload(destination, path, data, content_type):
    route = f'https://{PROJECT}.supabase.co/storage/v1/object/jobber-history/{urllib.parse.quote(path, safe="/")}'
    if not re.fullmatch(r'[\w.+-]+/[\w.+-]+', content_type): content_type = 'application/octet-stream'
    headers = {'apikey': destination.key, 'Authorization': f'Bearer {destination.key}', 'Content-Type': content_type, 'x-upsert': 'false'}
    try:
        with urllib.request.urlopen(urllib.request.Request(route, headers=headers, data=data, method='POST'), timeout=120) as response:
            response.read()
    except urllib.error.HTTPError as error:
        message = error.read().decode()
        if error.code not in (400, 409) or 'Duplicate' not in message: raise RuntimeError(f'Storage upload failed: HTTP {error.code}') from None
        # A content-addressed path may already exist after an interrupted receipt.
        with urllib.request.urlopen(urllib.request.Request(route, headers={'apikey': destination.key, 'Authorization': f'Bearer {destination.key}'}), timeout=120) as response:
            if hashlib.sha256(response.read()).digest() != hashlib.sha256(data).digest(): raise ValueError('Existing archive file differs')


def inventory(stage):
    files = {}
    for account in ['magic_city', 'spas_etc']:
        for path in (stage/account).glob('*-relations/*.json'):
            collection = path.parent.name.removesuffix('-relations')
            try: capture = json.loads(path.read_text())
            except json.JSONDecodeError: continue  # A writer may still be completing this checkpoint.
            for record in capture['records']:
                for source in (record.get('noteAttachments') or {}).get('nodes', []):
                    key = account + ':' + source['id']
                    entry = files.setdefault(key, dict(account=account, source=source, associations=[]))
                    ref = dict(collection=collection, source_id=record['id'], note_id=(source.get('note') or {}).get('id'))
                    if ref not in entry['associations']: entry['associations'].append(ref)
    return files


def archive(stage, destination):
    manifest_path = stage/'files-manifest.json'
    manifest = json.loads(manifest_path.read_text()) if manifest_path.exists() else {}
    discovered = inventory(stage)
    lock = threading.Lock()
    def one(pair):
        key, item = pair
        source, account = item['source'], item['account']
        old = manifest.get(key, {})
        identity = {k: source.get(k) for k in ['id', 'fileSize', 'updatedAt', 'status']}
        if old.get('status') == 'copied' and old.get('source_identity') == identity:
            old['associations'] = item['associations']; return key, old
        record = dict(account=account, id=source['id'], file_name=source['fileName'], file_size=source['fileSize'],
            source_identity=identity, source=source, associations=item['associations'])
        try:
            if source.get('status') != 'READY': raise ValueError('Jobber has not finished processing this file')
            data, response_type = get(source['downloadUrl'])
            if len(data) != source['fileSize']: raise ValueError(f'Original size mismatch: expected {source["fileSize"]}, received {len(data)}')
            sha = hashlib.sha256(data).hexdigest()
            extension = Path(source['fileName']).suffix.lower()
            if not re.fullmatch(r'\.[a-z0-9]{1,10}', extension): extension = mimetypes.guess_extension(response_type) or '.bin'
            file_key = hashlib.sha256(source['id'].encode()).hexdigest()[:24]
            local = stage/'attachments'/account/file_key/(sha+extension)
            local.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
            local.write_bytes(data); local.chmod(0o600)
            storage_path = f'{ORG}/{account}/{file_key}/{sha}{extension}'
            content_type = source.get('downloadContentType') or response_type
            upload(destination, storage_path, data, content_type)
            record.update(status='copied', sha256=sha, local_path=str(local), storage_path=storage_path, content_type=content_type, copied_at=time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime()))
            if source.get('previewUrl') and not re.fullmatch(r'image/(jpeg|png|webp|gif|avif)', content_type):
                try:
                    preview, preview_type = get(source['previewUrl'])
                    preview_sha = hashlib.sha256(preview).hexdigest()
                    preview_extension = mimetypes.guess_extension(preview_type) or '.bin'
                    preview_path = f'{ORG}/{account}/{file_key}/preview-{preview_sha}{preview_extension}'
                    upload(destination, preview_path, preview, preview_type)
                    record.update(preview_storage_path=preview_path, preview_sha256=preview_sha, preview_size=len(preview))
                except Exception as error: record['preview_error'] = str(error)
        except Exception as error:
            record.update(status='failed', error=str(error))
        return key, record
    with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:
        for key, result in pool.map(one, discovered.items()):
            with lock:
                manifest[key] = result
                save(stage/'files-manifest.tmp', manifest)
                (stage/'files-manifest.tmp').replace(manifest_path)
    result = dict(discovered=len(discovered), copied=sum(v.get('status') == 'copied' for v in manifest.values()), failed=sum(v.get('status') == 'failed' for v in manifest.values()), bytes=sum(v.get('file_size', 0) for v in manifest.values() if v.get('status') == 'copied'))
    save(stage/'files-status.json', result)
    print(json.dumps(result), flush=True)
    return result


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--staging', type=Path, required=True)
    parser.add_argument('--env-file', type=Path, required=True)
    parser.add_argument('--watch', action='store_true')
    args = parser.parse_args(); os.umask(0o077)
    destination = Destination(args.env_file)
    while True:
        archive(args.staging, destination)
        if not args.watch or (args.staging/'stop-file-copy').exists(): break
        time.sleep(20)
