"""Preserve the verified quote product images captured through Jobber's UI."""
import argparse
import base64
import hashlib
import json
import os
from pathlib import Path
import runpy

from import_summaries import Destination, ORG, save

parser = argparse.ArgumentParser()
parser.add_argument('--staging', type=Path, required=True)
parser.add_argument('--source', type=Path, required=True)
parser.add_argument('--env-file', type=Path, required=True)
args = parser.parse_args()
os.umask(0o077)
upload = runpy.run_path(str(Path(__file__).with_name('archive-files.py')))['upload']
destination = Destination(args.env_file)
manifest = {}
for item in json.loads((args.source/'spas_etc-quote-image-manifest.json').read_text()):
    source = item['source']
    data = (args.source/item['local_path']).read_bytes()
    sha = hashlib.sha256(data).hexdigest()
    if item['status'] != 'downloaded' or sha != item['sha256'] or len(data) != item['bytes'] or len(data) != source['fileSize']:
        raise ValueError('Legacy source file verification failed')
    identity = 'quote-image:' + hashlib.sha256(source['key'].encode()).hexdigest()
    path = f'{ORG}/spas_etc/quote-images/{sha}{Path(source["fileName"]).suffix.lower()}'
    upload(destination, path, data, source['contentType'])
    associations = []
    for ref in item['references']:
        number = base64.b64decode(ref['quote_id'], validate=True).decode()
        if not number.isdigit(): raise ValueError('Unexpected quote identity')
        gid = base64.b64encode(f'gid://Jobber/Quote/{number}'.encode()).decode()
        associations.append(dict(collection='quotes', source_id=gid, line_item_id=ref['line_item_id'], line_item_name=ref['line_item_name']))
    manifest['spas_etc:'+identity] = dict(account='spas_etc', id=identity, file_name=source['fileName'], file_size=len(data), content_type=source['contentType'], sha256=sha, storage_path=path, status='copied', local_path=str(args.source/item['local_path']), associations=associations, source=source, capture_method='Jobber quote UI on 2026-09-11')
save(args.staging/'quote-images-manifest.json', manifest)
print(json.dumps(dict(copied=len(manifest), bytes=sum(x['file_size'] for x in manifest.values()), verified=True)))
