"""Preserve originals above the storage limit as verified, ordered private parts."""
import argparse
import concurrent.futures
import hashlib
import json
import mimetypes
import os
from pathlib import Path
import re
import runpy
import time
import urllib.parse
import urllib.request

from import_summaries import Destination, ORG, PROJECT, save

archive_helpers = runpy.run_path(str(Path(__file__).with_name('archive-files.py')))
get, inventory, upload = (archive_helpers[name] for name in ['get', 'inventory', 'upload'])

PART_BYTES = 40 * 1024 * 1024
GLOBAL_LIMIT = 50_000_000


def cloud_bytes(destination, path):
    url = f'https://{PROJECT}.supabase.co/storage/v1/object/jobber-history/{urllib.parse.quote(path, safe="/")}'
    request = urllib.request.Request(url, headers={'apikey': destination.key, 'Authorization': f'Bearer {destination.key}'})
    with urllib.request.urlopen(request, timeout=120) as response:
        return response.read()


def archive_one(stage, destination, item):
    source, account = item['source'], item['account']
    record = dict(account=account, id=source['id'], file_name=source['fileName'], file_size=source['fileSize'],
        source_identity={k: source.get(k) for k in ['id', 'fileSize', 'updatedAt', 'status']}, source=source, associations=item['associations'])
    file_key = hashlib.sha256(source['id'].encode()).hexdigest()[:24]
    folder = stage/'attachments'/account/file_key
    try:
        if source.get('status') != 'READY': raise ValueError('Source file is not ready')
        candidates = [p for p in folder.glob('*') if p.is_file() and p.stat().st_size == source['fileSize'] and re.fullmatch(r'[a-f0-9]{64}\.[a-z0-9]{1,10}', p.name)]
        response_type = source.get('downloadContentType') or mimetypes.guess_type(source['fileName'])[0] or 'application/octet-stream'
        data = candidates[0].read_bytes() if len(candidates) == 1 else get(source['downloadUrl'])[0]
        if len(data) != source['fileSize']: raise ValueError('Original file size differs')
        sha = hashlib.sha256(data).hexdigest()
        if len(candidates) == 1 and candidates[0].stem != sha: raise ValueError('Cached original checksum differs')
        extension = Path(source['fileName']).suffix.lower()
        if not re.fullmatch(r'\.[a-z0-9]{1,10}', extension): extension = '.bin'
        local = folder/(sha+extension)
        folder.mkdir(parents=True, exist_ok=True, mode=0o700)
        if not local.exists(): local.write_bytes(data); local.chmod(0o600)
        record.update(sha256=sha, local_path=str(local), content_type=response_type)
        parts, restored_hash = [], hashlib.sha256()
        for offset in range(0, len(data), PART_BYTES):
            part = data[offset:offset+PART_BYTES]
            part_sha = hashlib.sha256(part).hexdigest()
            path = f'{ORG}/{account}/{file_key}/{sha}/part-{len(parts):04d}-{part_sha}.bin'
            for attempt in range(3):
                try:
                    upload(destination, path, part, 'application/octet-stream')
                    restored = cloud_bytes(destination, path)
                    if len(restored) != len(part) or hashlib.sha256(restored).hexdigest() != part_sha: raise ValueError('Cloud part checksum differs')
                    restored_hash.update(restored)
                    break
                except Exception:
                    if attempt == 2: raise
                    time.sleep(2 ** attempt)
            parts.append(dict(storage_path=path, size=len(part), sha256=part_sha))
        if restored_hash.hexdigest() != sha: raise ValueError('Reassembled cloud original checksum differs')
        record.update(status='copied', storage_parts=parts, cloud_sha256=sha, copied_at=time.strftime('%Y-%m-%dT%H:%M:%SZ',time.gmtime()))
        if source.get('previewUrl'):
            try:
                preview, preview_type = get(source['previewUrl'])
                preview_sha = hashlib.sha256(preview).hexdigest()
                path = f'{ORG}/{account}/{file_key}/preview-{preview_sha}{mimetypes.guess_extension(preview_type) or ".bin"}'
                upload(destination, path, preview, preview_type)
                record.update(preview_storage_path=path, preview_sha256=preview_sha, preview_size=len(preview))
            except Exception as error: record['preview_error'] = str(error)
    except Exception as error:
        record.update(status='failed', error=str(error))
    return account+':'+source['id'], record


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--staging',type=Path,required=True)
    parser.add_argument('--env-file',type=Path,required=True)
    args=parser.parse_args(); os.umask(0o077)
    destination=Destination(args.env_file)
    path=args.staging/'large-files-manifest.json'
    manifest=json.loads(path.read_text()) if path.exists() else {}
    pending=[v for k,v in inventory(args.staging).items() if v['source']['fileSize']>GLOBAL_LIMIT and manifest.get(k,{}).get('status')!='copied']
    with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
        for key, record in pool.map(lambda item: archive_one(args.staging,destination,item), pending):
            manifest[key]=record
            temporary=path.with_suffix('.tmp'); save(temporary,manifest); temporary.replace(path)
            print(json.dumps({'completed':sum(v.get('status')=='copied' for v in manifest.values()),'failed':sum(v.get('status')=='failed' for v in manifest.values()),'current_status':record['status']}),flush=True)
