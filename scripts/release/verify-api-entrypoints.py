"""Cold-start read probes: must reach each handler's method/auth guard."""
import json,subprocess,sys
url,output=sys.argv[1:]
if not url.startswith('https://spas360solo-') or not url.endswith('.vercel.app'):raise SystemExit('Expected immutable SPAS360 deployment')
results=[]
for endpoint in ['/api/agent/run','/api/chat','/api/sms-inbound','/api/owners/email-events','/api/owners/morning-email','/api/agent/status']:
 r=subprocess.run(['vercel','curl',endpoint,'--deployment',url,'--scope','nd-ai','--','--silent','--show-error','--max-time','30','--write-out','\\n%{http_code}'],capture_output=True,text=True)
 body,_,status=r.stdout.rpartition('\n');ok=r.returncode==0 and status in ('401','405')
 results.append({'path':endpoint,'status':status,'passed':ok,'body':body[:250]})
Path=__import__('pathlib').Path
Path(output).write_text(json.dumps(results,indent=2));print(json.dumps(results))
if not all(r['passed'] for r in results):raise SystemExit(1)
