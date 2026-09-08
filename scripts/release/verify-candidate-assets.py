"""Verify exact candidate bytes using one authenticated Vercel/curl session.
No credentials are read, printed or retained by this script. Every configured
URL is on the single approved candidate host. Curl files are temporary.
"""
import hashlib, json, subprocess, sys, tempfile
from pathlib import Path
from urllib.parse import urlparse
url, output = sys.argv[1:]
parsed = urlparse(url)
if parsed.scheme != 'https' or not parsed.hostname or not parsed.hostname.endswith('.vercel.app') or parsed.path not in ('','/'):
    raise SystemExit('Expected one HTTPS Vercel deployment origin')
url=url.rstrip('/')
manifest=json.loads(Path('docs/remediation/compatible-assets.json').read_text())['assets']
with tempfile.TemporaryDirectory(prefix='spas-assets-') as directory:
    root=Path(directory)
    lines=[]
    for index,(name,meta) in enumerate(manifest.items()):
        if any(c not in 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789._-' for c in name):
            raise SystemExit('Unexpected asset path')
        lines.extend([f'url = "{url}/assets/{name}"',f'output = "{root/str(index)}"'])
    config=root/'requests.conf';config.write_text('\n'.join(lines)+'\n')
    result=subprocess.run(['vercel','curl','/version.json','--deployment',url,'--scope','nd-ai','--','--silent','--show-error','--fail','--parallel','--parallel-max','12','--connect-timeout','15','--max-time','45','--output',str(root/'version.json'),'--config',str(config)],capture_output=True)
    outcomes=[]
    for index,(name,meta) in enumerate(manifest.items()):
        path=root/str(index);data=path.read_bytes() if path.exists() else b''
        outcomes.append({'name':name,'pass':hashlib.sha256(data).hexdigest()==meta['sha256'],'bytes':len(data)})
    try: version=json.loads((root/'version.json').read_text())
    except (ValueError,OSError): version=None
    Path(output).write_text(json.dumps(outcomes,indent=2))
    failures=[row for row in outcomes if not row['pass']]
    print(json.dumps({'checked':len(outcomes),'passed':len(outcomes)-len(failures),'failures':failures,'version':version,'curl_exit':result.returncode}))
    if failures or not version or result.returncode:raise SystemExit(1)
