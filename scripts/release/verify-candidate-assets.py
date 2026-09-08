import json,subprocess,hashlib,concurrent.futures,os,sys
from pathlib import Path
url,output=sys.argv[1:]
env=os.environ.copy();# Use the caller's installed Vercel CLI and Node runtime.
manifest=json.loads(Path('docs/remediation/compatible-assets.json').read_text())['assets']
def verify(entry):
 name,meta=entry
 r=subprocess.run(['vercel','curl','/assets/'+name,'--deployment',url,'--scope','nd-ai','--','--silent','--show-error'],env=env,capture_output=True)
 return {'name':name,'pass':r.returncode==0 and hashlib.sha256(r.stdout).hexdigest()==meta['sha256'],'bytes':len(r.stdout)}
with concurrent.futures.ThreadPoolExecutor(max_workers=8) as pool: result=list(pool.map(verify,manifest.items()))
Path(output).write_text(json.dumps(result,indent=2))
print({'checked':len(result),'passed':sum(r['pass'] for r in result),'failures':[r for r in result if not r['pass']]})
if not all(r['pass'] for r in result): raise SystemExit(1)
