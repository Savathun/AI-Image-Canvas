import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { Miniflare, convertV4MiniflareOptions } from 'miniflare';
const code=await readFile('dist/server/index.js','utf8');
let runtimeCalls=0,lastRuntimeBody;
const mf=new Miniflare(convertV4MiniflareOptions({workers:[{name:'test',modules:true,script:code,compatibilityDate:'2026-01-01',d1Databases:['DB'],r2Buckets:['BUCKET'],outboundService:async req=>{runtimeCalls++;lastRuntimeBody=await req.json();assert.equal(req.headers.get('authorization'),'Bearer '+key);return new Response(JSON.stringify({candidates:[{content:{parts:[{inlineData:{mimeType:'image/png',data:picture}}]}}]}),{headers:{'x-oneapi-request-id':'runtime-provider-request'}});}}]}));
const db=await mf.getD1Database('DB'),bucket=await mf.getR2Bucket('BUCKET');
const journal=JSON.parse(await readFile('drizzle/meta/_journal.json','utf8'));
const migration=(await Promise.all(journal.entries.map(e=>readFile('drizzle/'+e.tag+'.sql','utf8')))).join('--> statement-breakpoint');
for(const statement of migration.split('--> statement-breakpoint'))if(statement.trim())await db.prepare(statement).run();
const worker=(await import('../dist/server/index.js')).default;
const env={DB:db,BUCKET:bucket},origin='https://workbench.example';
const call=(path,method='GET',data,owner='test-owner',extra={})=>worker.fetch(new Request(origin+path,{method,headers:{'oai-authenticated-user-id':owner,Origin:origin,'X-Workbench-Request':'1','Content-Type':'application/json',...extra},...(data?{body:JSON.stringify(data)}:{})}),env);
const picture='iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/l9sAAAAASUVORK5CYII=';
const key='test-ephemeral-credential-123456';let calls=0,safeCalls=0,mode='image';
const realFetch=globalThis.fetch;
globalThis.fetch=async(url,init={})=>{const parsed=new URL(url);assert.equal(parsed.origin,'https://video.ctmoai.com');
 if(parsed.pathname==='/api/usage/token'){safeCalls++;assert.equal(init.headers.Authorization,'Bearer '+key);return new Response(JSON.stringify({code:true,data:{total_available:999999}}),{headers:{'Content-Type':'application/json'}});}
 if(parsed.pathname==='/api/log/token'){safeCalls++;assert.equal(init.headers.Authorization,'Bearer '+key);return new Response(JSON.stringify({data:mode==='nonjson'?[{type:2,quota:100,model_name:'gemini-3-pro-image-preview',created_at:Math.floor(Date.now()/1000),request_id:'billing-request-id'}]:[]}),{headers:{'Content-Type':'application/json'}});}
 if(parsed.pathname==='/api/pricing'){safeCalls++;return new Response('{}',{headers:{'Content-Type':'application/json'}});}
 calls++;assert.equal(init.headers.Authorization,'Bearer '+key);if(mode==='auth')return new Response(JSON.stringify({error:{message:'invalid '+key}}),{status:401,headers:{'Content-Type':'application/json'}});if(mode==='nonjson')return new Response('<html>gateway timeout</html>',{status:502,headers:{'Content-Type':'text/html','CF-Ray':'test-edge-ray'}});const body=JSON.parse(init.body);assert.equal(body.generationConfig.imageConfig.imageSize,'1K');return new Response(JSON.stringify({candidates:[{content:{parts:[{inlineData:{mimeType:'image/png',data:picture}}]}}]}),{headers:{'Content-Type':'application/json','x-oneapi-request-id':'provider-request-'+calls}});};
try{
 assert.equal((await call('/api/tasks','GET',null,'')).status,401);
 assert.equal((await call('/api/generate','POST',{},'test-owner',{Origin:'https://evil.example'})).status,403);
 assert.equal((await call('/api/generate','POST',{id:crypto.randomUUID(),prompt:'test'})).status,400);assert.equal(calls,0);
 const checked=await(await call('/api/preflight','POST',{key,model:'gemini-3-pro-image-preview'})).json();assert.equal(checked.ready,true);assert.equal(checked.key_valid,true);assert.equal(calls,0);assert.equal(safeCalls,1);
 const a={id:crypto.randomUUID(),key,prompt:'a blue cup',model:'gemini-3-pro-image-preview',image_size:'1K',aspect_ratio:'1:1',reference_image:'data:image/png;base64,'+picture};
 const res=await call('/api/generate','POST',a);const events=(await res.text()).trim().split('\n').map(JSON.parse);const task=events.at(-1).task;assert.equal(task.status,'succeeded');assert.equal(task.width,1);assert.equal(calls,1);
 const duplicate=await (await call('/api/generate','POST',a)).json();assert.equal(duplicate.duplicate,true);assert.equal(calls,1);
 assert.equal((await call(task.image_url)).status,200);assert.equal((await call(task.image_url,'GET',null,'someone-else')).status,404);
 const content=await (await call(task.reference_url)).arrayBuffer();assert.ok(content.byteLength>20);
 const all=JSON.stringify(await db.prepare('SELECT * FROM jobs').all());assert.ok(!all.includes(key));assert.ok(!all.includes('Authorization'));
 const upstreamFetch=globalThis.fetch;let releaseCancelled,cancelledSignal;const cancelledBarrier=new Promise(r=>releaseCancelled=r);globalThis.fetch=async(url,init)=>{cancelledSignal=init.signal;await cancelledBarrier;return new Response(JSON.stringify({candidates:[{content:{parts:[{inlineData:{mimeType:'image/png',data:picture}}]}}]}),{headers:{'Content-Type':'application/json','x-oneapi-request-id':'cancelled-provider-request'}});};const cancelledId=crypto.randomUUID();const cancelledResponse=await call('/api/generate','POST',{...a,id:cancelledId,delivery:'local',reference_image:undefined},'cancelled-owner');const cancelledReader=cancelledResponse.body.getReader();const firstEvent=new TextDecoder().decode((await cancelledReader.read()).value);assert.match(firstEvent,/"type":"started"/);await cancelledReader.cancel();assert.equal(cancelledSignal.aborted,false);releaseCancelled();for(let i=0;i<20;i++){const row=await db.prepare('SELECT status FROM jobs WHERE id=?').bind(cancelledId).first();if(row?.status==='succeeded')break;await new Promise(r=>setTimeout(r,10));}globalThis.fetch=upstreamFetch;assert.equal((await db.prepare('SELECT status FROM jobs WHERE id=?').bind(cancelledId).first()).status,'succeeded');assert.ok(await bucket.get('recoveries/'+cancelledId+'/image'));assert.equal((await call('/api/tasks/'+cancelledId,'DELETE',null,'cancelled-owner')).status,200);
 mode='auth';const bad=await call('/api/generate','POST',{...a,id:crypto.randomUUID()});const badEvents=(await bad.text()).trim().split('\n').map(JSON.parse);assert.equal(badEvents.at(-1).task.status,'failed');assert.ok(!JSON.stringify(badEvents).includes(key));assert.equal(calls,2);
 mode='image';const id=crypto.randomUUID();const failEnv={DB:db,BUCKET:{get:k=>bucket.get(k),delete:k=>bucket.delete(k),put:()=>{throw new Error('storage failure')}}};
 const fallback=await worker.fetch(new Request(origin+'/api/generate',{method:'POST',headers:{'oai-authenticated-user-id':'test-owner',Origin:origin,'X-Workbench-Request':'1','Content-Type':'application/json'},body:JSON.stringify({id,key,prompt:'test',model:a.model,image_size:'1K'})}),failEnv);
 const last=(await fallback.text()).trim().split('\n').map(JSON.parse).at(-1);assert.equal(last.task.status,'save_failed');assert.equal(last.fallback.data,picture);
 await db.prepare("INSERT INTO jobs (id,owner,created_at,expires_at,status,prompt,model,image_size,aspect_ratio) VALUES (?,?,?,?,'running','stale','gemini-3-pro-image-preview','1K','1:1')").bind(crypto.randomUUID(),'test-owner',Date.now()-13*60000,Date.now()+86400000).run();
 const list=await (await call('/api/tasks')).json();assert.ok(list.tasks.some(x=>x.status==='unknown'));
 const blockids=Array.from({length:3},()=>crypto.randomUUID());for(const blockid of blockids)await db.prepare("INSERT INTO jobs (id,owner,created_at,expires_at,status,prompt,model,image_size,aspect_ratio) VALUES (?,?,?,?,'running','active','gemini-3-pro-image-preview','1K','1:1')").bind(blockid,'test-owner',Date.now(),Date.now()+86400000).run();
 assert.equal((await call('/api/generate','POST',{...a,id:crypto.randomUUID()})).status,409);assert.equal(calls,3);
 for(const blockid of blockids)await db.prepare('DELETE FROM jobs WHERE id = ?').bind(blockid).run();
 await db.prepare('UPDATE jobs SET expires_at = ? WHERE id = ?').bind(Date.now()-1,task.id).run();await call('/api/tasks');assert.equal(await bucket.get('tasks/'+task.id+'/image'),null);assert.equal(await bucket.get('tasks/'+task.id+'/reference'),null);
 for(const row of (await db.prepare('SELECT id FROM jobs').all()).results)assert.equal((await call('/api/tasks/'+row.id,'DELETE')).status,200);
 const health=await (await call('/health')).json();assert.equal(health.legacy_key_present,false);assert.equal(health.key_storage,'none');
 assert.equal(health.provider_timeout_minutes,10);assert.equal(health.safe_generation_retries,0);
 assert.equal((await call('/mcp')).status,404);
 // Exercise real workerd Request/fetch options, with a non-network fake provider.
 const runtimeResponse=await mf.dispatchFetch(origin+'/api/generate',{method:'POST',headers:{'oai-authenticated-user-id':'test-owner',Origin:origin,'X-Workbench-Request':'1','Content-Type':'application/json'},body:JSON.stringify({...a,id:crypto.randomUUID(),reference_image:undefined})});
 const runtimeTask=(await runtimeResponse.text()).trim().split('\n').map(JSON.parse).at(-1).task;
 assert.equal(runtimeTask.status,'succeeded');assert.equal(runtimeCalls,1);
 const localId=crypto.randomUUID();const localResponse=await mf.dispatchFetch(origin+'/api/generate',{method:'POST',headers:{'oai-authenticated-user-id':'local-owner',Origin:origin,'X-Workbench-Request':'1','Content-Type':'application/json'},body:JSON.stringify({...a,id:localId,delivery:'local'})});
 const output=(await localResponse.text()).trim().split('\n').map(JSON.parse).at(-1);assert.equal(output.task.status,'succeeded');assert.equal(output.task.request_id,'runtime-provider-request');assert.equal(output.output.data,picture);assert.equal(output.asset.sha256.length,64);assert.equal(output.task.image_url,null);assert.equal(output.task.recovery_url,'/api/tasks/'+localId+'/recovery');assert.equal(output.task.reference_url,null);assert.equal(await bucket.get('tasks/'+localId+'/image'),null);assert.ok(await bucket.get('recoveries/'+localId+'/image'));assert.equal(await bucket.get('tasks/'+localId+'/reference'),null);
 const localCall=(p,m='GET',d)=>call(p,m,d,'local-owner');
 assert.equal((await localCall(output.task.recovery_url)).status,200);assert.equal((await call(output.task.recovery_url,'GET',null,'someone-else')).status,404);assert.equal((await localCall(output.task.recovery_url,'DELETE')).status,200);assert.equal(await bucket.get('recoveries/'+localId+'/image'),null);assert.equal((await localCall(output.task.recovery_url)).status,404);
 assert.equal((await localCall('/api/assets/'+localId+'/thumbnail','PUT',{data:picture})).status,200);
 assert.equal((await localCall('/api/assets/'+localId+'/thumbnail')).status,200);
 assert.equal((await call('/api/assets/'+localId+'/thumbnail')).status,404);
 const state={items:[{id:crypto.randomUUID(),asset_id:localId,x:40,y:-25,label:'test'}],view:{x:10,y:20,z:1.2}};
 assert.equal((await localCall('/api/workspace','PUT',{revision:0,state,google_client_id:''})).status,200);
 assert.equal((await localCall('/api/workspace','PUT',{revision:0,state,google_client_id:''})).status,409);
 assert.equal((await localCall('/api/assets/'+localId,'DELETE')).status,409);
 assert.equal((await localCall('/api/assets/'+localId+'/drive','PUT',{file_id:'valid-file-id',sha256:'wrong',size:68})).status,400);
 const localRows=JSON.stringify(await db.prepare('SELECT * FROM assets').all());assert.ok(!localRows.includes(key));assert.ok(!localRows.includes(picture));
 // Legacy images explicitly archived stay readable after ordinary task expiry.
 const legacy=(await db.prepare('SELECT * FROM jobs WHERE owner=?').bind('test-owner').all()).results.find(r=>r.image_key);
 const archived=await(await call('/api/assets','POST',{id:crypto.randomUUID(),legacy_task_id:legacy.id})).json();assert.ok(archived.asset.original_url);
 await db.prepare('UPDATE jobs SET expires_at=? WHERE id=?').bind(Date.now()-1,legacy.id).run();await call('/api/tasks');assert.equal((await call(archived.asset.original_url)).status,200);assert.equal((await call('/api/tasks/'+legacy.id,'DELETE')).status,409);
 const multiId=crypto.randomUUID();const countBefore=runtimeCalls;
 const multiResponse=await mf.dispatchFetch(origin+'/api/generate',{method:'POST',headers:{'oai-authenticated-user-id':'local-owner',Origin:origin,'X-Workbench-Request':'1','Content-Type':'application/json'},body:JSON.stringify({...a,id:multiId,delivery:'local',reference_image:undefined,reference_images:['data:image/png;base64,'+picture,'data:image/png;base64,'+picture],reference_asset_ids:[localId,localId]})});
 const multi=(await multiResponse.text()).trim().split('\n').map(JSON.parse).at(-1);assert.equal(multi.task.status,'succeeded');assert.equal(lastRuntimeBody.contents[0].parts.length,3);assert.equal(runtimeCalls,countBefore+1);assert.deepEqual(multi.asset.metadata.reference_asset_ids,[localId,localId]);
 assert.ok(await bucket.get('recoveries/'+multiId+'/image'));await db.prepare('UPDATE jobs SET completed_at=? WHERE id=?').bind(Date.now()-86400001,multiId).run();await localCall('/api/tasks');assert.equal(await bucket.get('recoveries/'+multiId+'/image'),null);assert.equal((await localCall('/api/tasks/'+multiId)).status,200);assert.equal((await(await localCall('/api/tasks/'+multiId)).json()).task.recovery_url,null);
 const rejects=await call('/api/generate','POST',{...a,id:crypto.randomUUID(),delivery:'local',reference_image:undefined,reference_images:Array(15).fill('data:image/png;base64,'+picture)});assert.equal(rejects.status,400);
 assert.equal(await bucket.get('tasks/'+multiId+'/reference'),null);
 // Hold provider replies open to prove admissions are concurrent and owner-wide.
 const previousFetch=globalThis.fetch;let release;const barrier=new Promise(r=>release=r);let simultaneous=0;
 globalThis.fetch=async(...args)=>{simultaneous++;await barrier;return previousFetch(...args);};
 const requests=await Promise.all(Array.from({length:6},()=>call('/api/generate','POST',{...a,id:crypto.randomUUID(),delivery:'local'},'parallel-owner')));
 const accepted=requests.filter(r=>r.status===200),rejected=requests.filter(r=>r.status===409);
 const running=await db.prepare("SELECT COUNT(*) AS n FROM jobs WHERE owner='parallel-owner' AND status='running'").first();
 release();globalThis.fetch=previousFetch;
 assert.equal(accepted.length,3);assert.equal(rejected.length,3);assert.equal(running.n,3);assert.equal(simultaneous,3);
 const completed=await Promise.all(accepted.map(async r=>(await r.text()).trim().split('\n').map(JSON.parse).at(-1)));assert.ok(completed.every(r=>r.task.status==='succeeded'));assert.equal(new Set(completed.map(r=>r.task.id)).size,3);
 // A non-JSON gateway response is never regenerated. A read-only token-log check
 // can instead mark the result as probably charged and preserve upstream diagnostics.
 mode='nonjson';const beforeUnknown=calls,unknownId=crypto.randomUUID();const unknownResponse=await call('/api/generate','POST',{...a,id:unknownId,delivery:'local',reference_image:undefined},'uncertain-owner');const unknown=(await unknownResponse.text()).trim().split('\n').map(JSON.parse).at(-1).task;
 assert.equal(calls,beforeUnknown+1);assert.equal(unknown.status,'charged_unknown');assert.equal(unknown.request_id,'billing-request-id');assert.match(unknown.error_message,/疑似已扣费|确认扣费/);assert.match(JSON.stringify(await db.prepare('SELECT error_message FROM jobs WHERE id=?').bind(unknownId).first()),/gateway timeout|疑似已扣费/);
 const reconciled=await(await call('/api/tasks/'+unknownId+'/reconcile','POST',{key},'uncertain-owner')).json();assert.equal(reconciled.task.status,'charged_unknown');assert.equal(reconciled.checked,true);
 mode='image';const now=Date.now();for(let i=0;i<2;i++)await db.prepare("INSERT INTO jobs (id,owner,created_at,expires_at,completed_at,status,prompt,model,image_size,aspect_ratio,error_code,error_message) VALUES (?,?,?,?,?,'unknown','guard','gemini-3-pro-image-preview','1K','1:1','INVALID_UPSTREAM_RESPONSE','guard')").bind(crypto.randomUUID(),'guarded-owner',now-1000*i,now+86400000,now-1000*i).run();
 const beforeGuard=calls;const guarded=await call('/api/generate','POST',{...a,id:crypto.randomUUID(),reference_image:undefined},'guarded-owner');assert.equal(guarded.status,503);assert.equal(calls,beforeGuard);assert.match((await guarded.json()).error,/保护机制/);
 console.log('PASS: six simultaneous attempts admit exactly three independent tasks; remaining requests rejected before billing; all three results returned.');
 console.log('PASS: key preflight, non-JSON diagnostics, billing reconciliation, zero paid retries, and owner-scoped circuit breaker.');
 console.log('PASS: multiple references forwarded by workerd in one call; ordered provenance saved without reference files.');
 console.log('PASS: local delivery has a one-time recovery copy, no retained cloud original/reference after acknowledgement; thumbnail isolation; optimistic locking; pinned asset deletion; Drive hash validation; archived legacy retention.');
 console.log('PASS: generation inside actual workerd runtime with simulated outbound provider (no network / billing).');

 console.log('PASS: generation, reference, original download, ownership, CSRF, key omission, auth redaction, idempotency, concurrency, storage-failure download, stale-task recovery, expiry cleanup, deletion. No paid API requests.');
}finally{globalThis.fetch=realFetch;await mf.dispose();}
