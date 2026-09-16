import {generateImage, parseInput, imageDimensions} from './provider.js';
import {canvasRoutes,recordAsset} from './canvas.js';
import page from '../web/index.html';
import script from '../web/app.js';
import style from '../web/style.css';
import brutalStyle from '../web/neo-brutal.css';

const DAY=86400000, RECOVERY_TTL=DAY, LIMIT=256*1024*1024, MAX_REF=20_000_000;
const PROVIDER_ORIGIN='https://video.ctmoai.com', STALE_RUNNING_MS=12*60*1000, BREAKER_WINDOW_MS=5*60*1000, BREAKER_COOLDOWN_MS=60*1000;
const UNCERTAIN_CODES=['REQUEST_INTERRUPTED','NETWORK_ERROR','INVALID_UPSTREAM_RESPONSE','RESPONSE_TOO_LARGE','UNSUPPORTED_ASYNC_RESPONSE','STORAGE_OR_CONNECTION_ERROR'];
const json=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
const fail=(message,status=400)=>{throw Object.assign(new Error(message),{status});};
const bytes=b64=>Uint8Array.from(atob(b64),c=>c.charCodeAt(0));
function b64(b){let s='';for(let i=0;i<b.length;i+=32768)s+=String.fromCharCode(...b.subarray(i,i+32768));return btoa(s);}
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
function validKey(key){if(typeof key!=='string'||key.trim().length<12||key.length>512||/[\r\n]/.test(key))fail('请先输入有效的 API Key');return key.trim();}
async function readSmallJson(response,limit=512*1024){
  if(Number(response.headers.get('content-length'))>limit)throw new Error('response too large');
  const reader=response.body?.getReader();if(!reader)return null;const decoder=new TextDecoder();let size=0,text='';
  try{for(;;){const{done,value}=await reader.read();if(done)break;size+=value.length;if(size>limit)throw new Error('response too large');text+=decoder.decode(value,{stream:true});}text+=decoder.decode();return text?JSON.parse(text):null;}
  finally{await reader.cancel().catch(()=>{});reader.releaseLock();}
}
async function providerGet(path,key,{attempts=3,jsonBody=true}={}){
  let last;
  for(let attempt=0;attempt<attempts;attempt++)try{
    const response=await fetch(PROVIDER_ORIGIN+path,{method:'GET',headers:key?{Authorization:'Bearer '+key}:{},redirect:'manual',signal:AbortSignal.timeout(15000)});
    if([429,502,503,504].includes(response.status)&&attempt+1<attempts){const retry=Math.min(3000,Math.max(300,Number(response.headers.get('retry-after'))*1000||400*2**attempt));await response.body?.cancel();await sleep(retry);continue;}
    let data=null;if(jsonBody)try{data=await readSmallJson(response);}catch(e){last=e;}
    else await response.body?.cancel();
    return{response,data,parse_error:jsonBody&&!data?last:null};
  }catch(e){last=e;if(attempt+1<attempts){await sleep(400*2**attempt);continue;}}
  throw last||new Error('provider unavailable');
}
function logRows(data){
  const choices=[data?.data?.items,data?.data?.logs,data?.data,data?.items,data?.logs,data];
  return choices.find(Array.isArray)||[];
}
function logTime(log){const value=Number(log.request_at??log.created_at??log.createdAt??log.timestamp);return value>1e12?value:value>0?value*1000:0;}
function logRequestId(log){return String(log.upstream_request_id||log.request_id||log.requestId||'')||null;}
async function checkBilling(key,row){
  const start=Math.floor((row.created_at-60000)/1000),end=Math.ceil((Date.now()+60000)/1000),query=new URLSearchParams({start_timestamp:String(start),end_timestamp:String(end),model_name:row.model||'',p:'0',page_size:'50'});
  let result;try{result=await providerGet('/api/log/token?'+query,key,{attempts:3});}catch{return{checked:false,match:null,message:'暂时无法读取供应商消费记录，可稍后重新核对。'};}
  if([401,403].includes(result.response.status))return{checked:false,auth_error:true,match:null,message:'当前 API Key 无法查询消费记录，请确认 Key 仍然有效。'};
  if(!result.response.ok||!result.data)return{checked:false,match:null,message:'供应商暂未提供可读取的消费记录。'};
  const exact=[];const possible=[];
  for(const log of logRows(result.data)){
    const model=String(log.model_name||log.model||''),time=logTime(log),requestId=logRequestId(log),content=String(log.content||log.type_name||'');
    const charged=Number(log.quota||log.used_quota||0)>0||Number(log.type)===2||/消费|consume/i.test(content);
    if(!charged||model&&model!==row.model||time&&Math.abs(time-row.created_at)>30*60*1000)continue;
    const normalized={request_id:requestId,created_at:time||null,quota:Number(log.quota||log.used_quota||0)||null,model:model||row.model};
    if(row.request_id&&requestId===row.request_id)exact.push(normalized);else possible.push(normalized);
  }
  if(exact.length)return{checked:true,confirmed:true,match:exact[0],message:'已按供应商请求编号确认扣费，但本站没有收到图片。请勿直接重新生成。'};
  if(possible.length===1)return{checked:true,confirmed:false,match:possible[0],message:'在同一时间段查到一条对应模型的消费记录，疑似已扣费但图片未取回。请勿直接重新生成。'};
  if(possible.length>1)return{checked:true,confirmed:false,match:possible[0],message:'同一时间段存在多条对应模型的消费记录，无法精确对应本任务；为避免重复扣费，请勿直接重新生成。'};
  return{checked:true,match:null,message:'暂未查到对应消费记录；供应商日志可能延迟，可稍后重新核对。'};
}
async function applyBillingCheck(env,row,key){
  const check=await checkBilling(key,row);if(!check.match)return check;
  const requestId=row.request_id||check.match.request_id||null,base=String(row.error_message||'').split(' 自动核账：')[0],message=(base?base+' ':'')+'自动核账：'+check.message;
  await env.DB.prepare("UPDATE jobs SET status='charged_unknown',request_id=?,error_message=? WHERE id=? AND owner=? AND status IN ('unknown','charged_unknown')").bind(requestId,message,row.id,row.owner).run();return check;
}
async function breaker(env,owner){
  const marks=UNCERTAIN_CODES.map(()=>'?').join(','),rows=await env.DB.prepare(`SELECT completed_at FROM jobs WHERE owner=? AND status IN ('unknown','charged_unknown') AND error_code IN (${marks}) AND completed_at>? ORDER BY completed_at DESC LIMIT 2`).bind(owner,...UNCERTAIN_CODES,Date.now()-BREAKER_WINDOW_MS).all();
  if(rows.results.length<2)return null;const until=Number(rows.results[0].completed_at)+BREAKER_COOLDOWN_MS;return until>Date.now()?until:null;
}
async function preflight(req,env,owner){
  const data=await body(req),key=validKey(data?.key);if(await breaker(env,owner))fail('供应商刚刚连续出现异常，保护机制已暂停新请求约 1 分钟，避免重复扣费。',503);
  let usage;try{usage=await providerGet('/api/usage/token',key,{attempts:2});}catch{
    try{const reach=await providerGet('/api/pricing',null,{attempts:2,jsonBody:false});if(reach.response.status>=500)fail('供应商连接自检未通过，尚未发送生图请求。请稍后再试。',503);}
    catch{fail('供应商连接自检未通过，尚未发送生图请求。请检查网络后重试。',503);}
    return json({ready:true,key_valid:null,warning:'供应商可访问，但暂时无法读取 Key 状态；生图请求尚未发送。'});
  }
  if([401,403].includes(usage.response.status))fail('API Key 无效、已过期或无权查询额度，尚未发送生图请求。',401);
  if(usage.response.ok&&usage.data){const d=usage.data.data||usage.data;return json({ready:true,key_valid:true,available:Number.isFinite(Number(d.total_available))?Number(d.total_available):null,warning:null});}
  if(usage.response.status>=500)fail('供应商连接自检未通过，尚未发送生图请求。请稍后再试。',503);
  return json({ready:true,key_valid:null,warning:'供应商可访问，但未返回可识别的 Key 状态；生图请求尚未发送。'});
}
function task(r){if(!r)return null;const{id,created_at,expires_at,completed_at,status,prompt,model,image_size,aspect_ratio,parent_id,width,height,error_code,error_message,request_id}=r,recovery=typeof r.image_key==='string'&&r.image_key.startsWith('recoveries/');return{id,created_at,expires_at,completed_at,status,prompt,model,image_size,aspect_ratio,parent_id,width,height,error_code,error_message,request_id,provider:'ctmoai',has_reference:!!r.ref_key,image_url:r.image_key&&!recovery?'/api/tasks/'+id+'/image':null,recovery_url:recovery?'/api/tasks/'+id+'/recovery':null,recovery_expires_at:recovery&&completed_at?completed_at+RECOVERY_TTL:null,reference_url:r.ref_key?'/api/tasks/'+id+'/reference':null};}
async function owned(env,owner,id){return env.DB.prepare('SELECT * FROM jobs WHERE id = ? AND owner = ? AND (expires_at > ? OR EXISTS (SELECT 1 FROM assets WHERE legacy_task_id=jobs.id AND owner=jobs.owner))').bind(id,owner,Date.now()).first();}
async function erase(env,row){for(const k of [row.ref_key,row.image_key])if(k)await env.BUCKET.delete(k);await env.DB.prepare('DELETE FROM jobs WHERE id = ? AND owner = ?').bind(row.id,row.owner).run();}
async function cleanup(env,owner){
  const recoveries=await env.DB.prepare("SELECT id,image_key FROM jobs WHERE owner=? AND image_key LIKE 'recoveries/%' AND completed_at IS NOT NULL AND completed_at < ? LIMIT 30").bind(owner,Date.now()-RECOVERY_TTL).all();
  for(const r of recoveries.results){await env.BUCKET.delete(r.image_key);await env.DB.prepare('UPDATE jobs SET image_key=NULL,image_mime=NULL,bytes=0 WHERE id=? AND owner=?').bind(r.id,owner).run();}
  await env.DB.prepare("UPDATE jobs SET status = 'unknown', error_code = 'INTERRUPTED', error_message = '连接中断或执行超时，结果未确认；请先核对供应商消费记录，勿直接重复提交。', completed_at = ? WHERE owner = ? AND status = 'running' AND created_at < ?").bind(Date.now(),owner,Date.now()-STALE_RUNNING_MS).run();
  const old=await env.DB.prepare('SELECT * FROM jobs WHERE owner = ? AND expires_at <= ? AND NOT EXISTS (SELECT 1 FROM assets WHERE legacy_task_id=jobs.id AND owner=jobs.owner) LIMIT 30').bind(owner,Date.now()).all();
  for(const r of old.results)await erase(env,r);
}
async function body(req){if(!req.headers.get('content-type')?.startsWith('application/json'))fail('请求格式错误',415);const reader=req.body?.getReader();if(!reader)fail('缺少请求内容');let count=0,out='',dec=new TextDecoder();try{for(;;){const{done,value}=await reader.read();if(done)break;count+=value.length;if(count>21_000_000)fail('请求过大：参考图编码后的整次请求上限为 20 MB',413);out+=dec.decode(value,{stream:true});}return JSON.parse(out+dec.decode());}catch(e){if(e.status)throw e;fail('请求内容无效');}finally{await reader.cancel().catch(()=>{});}}
async function generate(req,env,owner,ctx){
  const data=await body(req);
  if(!data||typeof data!=='object'||Array.isArray(data))fail('请求内容无效');
  const allowed=['id','key','prompt','model','image_size','aspect_ratio','reference_image','reference_task_id','reference_kind','parent_id','delivery','reference_asset_id','source_asset_id','reference_images','reference_asset_ids','reference_preparation'];
  if(Object.keys(data).some(k=>!allowed.includes(k)))fail('包含不支持的参数');
  const local=data.delivery==='local';
  if(data.delivery&&!local)fail('结果交付方式无效');
  let key=validKey(data.key);delete data.key;
  if(typeof data.id!=='string'||!/^[a-f0-9-]{36}$/.test(data.id))fail('任务编号无效');
  if(typeof data.prompt==='string'&&data.prompt.includes(key))fail('提示词中包含 API Key，请移除后再提交');
  const existing=await env.DB.prepare('SELECT * FROM jobs WHERE id = ? AND owner = ?').bind(data.id,owner).first();
  if(existing)return json({task:task(existing),duplicate:true});
  await cleanup(env,owner);
  const blockedUntil=await breaker(env,owner);if(blockedUntil)fail(`供应商刚刚连续出现异常，保护机制已暂停新请求 ${Math.max(1,Math.ceil((blockedUntil-Date.now())/1000))} 秒，避免重复扣费。`,503);
  if(local){const count=await env.DB.prepare('SELECT COUNT(*) AS n FROM assets WHERE owner=?').bind(owner).first();if(count.n>=2000)fail('图片档案已达到 2000 项，请先整理',409);}
  const usage=await env.DB.prepare('SELECT COALESCE(SUM(bytes),0) AS bytes FROM jobs WHERE owner = ?').bind(owner).first();
  if(!local&&usage.bytes+24*1024*1024>LIMIT)fail('存储空间不足，请先下载并删除部分历史任务',409);
  if(data.reference_asset_id&&!await env.DB.prepare('SELECT id FROM assets WHERE id=? AND owner=?').bind(data.reference_asset_id,owner).first())fail('参考图片不存在');
  if(data.source_asset_id&&!await env.DB.prepare('SELECT id FROM assets WHERE id=? AND owner=?').bind(data.source_asset_id,owner).first())fail('来源图片档案已删除，请重新载入参数');
  if(data.reference_images!==undefined&&(!Array.isArray(data.reference_images)||data.reference_images.length>14))fail('参考图最多 14 张');
  if(data.reference_images!==undefined&&(data.reference_image||data.reference_task_id))fail('不能同时使用多图和旧版参考图参数');
  if(data.reference_images!==undefined&&!local)fail('多图参考请使用当前画布的本地交付流程');
  const refIds=data.reference_asset_ids||[];if(!Array.isArray(refIds)||refIds.length>14||refIds.some(id=>typeof id!=='string'))fail('参考图档案列表无效');
  if(refIds.length&&refIds.length!==data.reference_images?.length)fail('参考图与档案数量不一致');
  for(const refId of refIds)if(!await env.DB.prepare('SELECT id FROM assets WHERE id=? AND owner=?').bind(refId,owner).first())fail('参考图档案已删除');
  let preparation=[];
  if(data.reference_preparation!==undefined){
    if(!Array.isArray(data.reference_preparation)||data.reference_preparation.length!==(data.reference_images||[]).length)fail('参考图处理记录无效');
    preparation=data.reference_preparation.map(r=>{if(!r||![r.original_bytes,r.sent_bytes,r.width,r.height].every(n=>Number.isInteger(n)&&n>0&&n<=100000000)||!['image/png','image/jpeg','image/webp'].includes(r.mime)||typeof r.compressed!=='boolean'||(r.quality!==undefined&&(!Number.isFinite(r.quality)||r.quality<0||r.quality>1)))fail('参考图处理记录无效');return{original_bytes:r.original_bytes,sent_bytes:r.sent_bytes,width:r.width,height:r.height,mime:r.mime,compressed:r.compressed,...(r.quality===undefined?{}:{quality:r.quality})};});
  }
  let reference=data.reference_image;
  if(reference&&data.reference_task_id)fail('请选择一种参考图来源');
  if(data.reference_task_id){
    const source=await owned(env,owner,data.reference_task_id);if(!source)fail('参考任务不存在或已经到期',404);
    if(!['image','reference'].includes(data.reference_kind))fail('参考图来源无效');
    const k=data.reference_kind==='image'?source.image_key:source.ref_key;
    if(!k)fail('该任务没有可用的参考图');
    const obj=await env.BUCKET.get(k);if(!obj)fail('参考图已不可用',404);if(obj.size>MAX_REF)fail('参考图超过内嵌请求限制，请下载并调整后重新上传');
    const buf=new Uint8Array(await obj.arrayBuffer()),dims=imageDimensions(buf);if(!dims)fail('参考图格式无效');reference='data:'+dims.mime+';base64,'+b64(buf);
  }
  const args={prompt:data.prompt,model:data.model,image_size:data.image_size,aspect_ratio:data.aspect_ratio,...(data.reference_images!==undefined?{reference_images:data.reference_images}:reference?{reference_image:reference}:{})};
  try{parseInput(args);}catch(e){fail(e.message);}
  if(data.parent_id&&!await owned(env,owner,data.parent_id))fail('原任务已不可用，请清空后重新创建');
  const now=Date.now(),id=data.id,prefix='tasks/'+id;
  let inserted;
  try{inserted=await env.DB.prepare("INSERT INTO jobs (id,owner,created_at,expires_at,status,prompt,model,image_size,aspect_ratio,parent_id) SELECT ?,?,?,?,'running',?,?,?,?,? WHERE (SELECT COUNT(*) FROM jobs WHERE owner=? AND status='running') < 3").bind(id,owner,now,now+30*DAY,args.prompt,args.model||'gemini-3-pro-image-preview',args.image_size||'1K',args.aspect_ratio||'1:1',data.parent_id||null,owner).run();}
  catch(e){const duplicate=await owned(env,owner,id);if(duplicate)return json({task:task(duplicate),duplicate:true});fail('任务登记失败，尚未提交供应商，请稍后重试',503);}
  if(!inserted.meta.changes)fail('当前账号已有 3 个任务运行中，请等待其中一个完成后再提交',409);
  let refBytes=0;
  try{if(reference&&!local){const m=/^data:([^;]+);base64,(.+)$/.exec(reference),buf=bytes(m[2]);refBytes=buf.length;await env.DB.prepare('UPDATE jobs SET ref_key = ?, ref_mime = ?, bytes = ? WHERE id = ?').bind(prefix+'/reference',m[1],refBytes,id).run();await env.BUCKET.put(prefix+'/reference',buf,{httpMetadata:{contentType:m[1]}});}}
  catch{await env.DB.prepare("UPDATE jobs SET status = 'failed', error_code = 'REFERENCE_STORAGE_FAILED', error_message = '参考图保存失败，尚未调用生图 API。', completed_at = ? WHERE id = ?").bind(Date.now(),id).run();key=null;return json({task:task(await owned(env,owner,id))},503);}
  const encoder=new TextEncoder();let timer,closed=false;
  const stream=new ReadableStream({start(controller){
    const send=obj=>{if(!closed)try{controller.enqueue(encoder.encode(JSON.stringify(obj)+'\n'));}catch{closed=true;}};
    send({type:'started',id});timer=setInterval(()=>send({type:'waiting',elapsed_ms:Date.now()-now}),12000);
    const work=(async()=>{let fallback=null,output=null,newAsset=null;
      try{
        const result=await generateImage(args,{IMAGE_API_KEY:key},fetch);
        const meta=result.structuredContent;
        if(meta.success){const pic=result.content.find(x=>x.type==='image'),buf=bytes(pic.data),imageKey=prefix+'/image';fallback={mime:pic.mimeType,data:pic.data};
          if(local){
          output=fallback;
          const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',buf)),v=>v.toString(16).padStart(2,'0')).join('');
          const recoveryKey='recoveries/'+id+'/image';let recoveryStored=false;
          try{const current=await env.DB.prepare('SELECT COALESCE(SUM(bytes),0) AS bytes FROM jobs WHERE owner=?').bind(owner).first();if(current.bytes+buf.length<=LIMIT){await env.BUCKET.put(recoveryKey,buf,{httpMetadata:{contentType:pic.mimeType}});await env.DB.prepare('UPDATE jobs SET image_key=?,image_mime=?,bytes=?,request_id=? WHERE id=?').bind(recoveryKey,pic.mimeType,buf.length,meta.request_id,id).run();recoveryStored=true;}}catch{if(!recoveryStored)await env.BUCKET.delete(recoveryKey).catch(()=>{});}
          newAsset=await recordAsset(env,owner,{id,mime:pic.mimeType,width:meta.width,height:meta.height,sha256:hash,metadata:{kind:'generation',task_id:id,prompt:args.prompt,model:args.model,image_size:args.image_size,aspect_ratio:args.aspect_ratio,parent_id:data.parent_id||null,reference_asset_id:data.reference_asset_id||refIds[0]||null,reference_asset_ids:refIds.length?refIds:data.reference_asset_id?[data.reference_asset_id]:[],source_asset_id:data.source_asset_id||null,reference_preparation:preparation}});
          await env.DB.prepare("UPDATE jobs SET status='succeeded',completed_at=?,width=?,height=?,request_id=? WHERE id=?").bind(Date.now(),meta.width,meta.height,meta.request_id,id).run();fallback=null;
          }else{
          // Legacy cloud originals remain supported for old clients.

          await env.DB.prepare('UPDATE jobs SET image_key = ?, image_mime = ?, width = ?, height = ?, bytes = ?, request_id = ? WHERE id = ?').bind(imageKey,pic.mimeType,meta.width,meta.height,refBytes+buf.length,meta.request_id,id).run();
          await env.BUCKET.put(imageKey,buf,{httpMetadata:{contentType:pic.mimeType}});
          await env.DB.prepare("UPDATE jobs SET status = 'succeeded', completed_at = ? WHERE id = ?").bind(Date.now(),id).run();fallback=null;}
        }else{
          const uncertain=UNCERTAIN_CODES.includes(meta.error.code);
          const messages={AUTHENTICATION_FAILED:'API Key 无效或无权使用该模型，请检查后手动重试。',RATE_LIMITED:'供应商限流或额度不足，请检查账户。',UPSTREAM_REQUEST_TOO_LARGE:'中转站拒绝了请求大小，请减少参考图或缩小后再手动提交。',UPSTREAM_REDIRECT:'供应商要求跳转到其他地址，请检查接口配置。Key 未转发到跳转地址。',REQUEST_INTERRUPTED:'等待超时或连接中断，结果未确认；请先检查供应商记录。',NETWORK_ERROR:'与供应商的连接中断，结果未确认；请先检查供应商记录。',NO_IMAGE:'供应商未返回图片，请检查提示词和供应商记录。'};
          await env.DB.prepare('UPDATE jobs SET status = ?, completed_at = ?, request_id = ?, error_code = ?, error_message = ? WHERE id = ?').bind(uncertain?'unknown':'failed',Date.now(),meta.request_id,meta.error.code,(messages[meta.error.code]||'供应商未能返回可用结果，请检查账户和请求记录。')+(meta.error.diagnostic?' 诊断：'+meta.error.diagnostic:''),id).run();
          if(uncertain){const row=await owned(env,owner,id);try{const checked=await applyBillingCheck(env,row,key);if(!checked.match){await sleep(6000);await applyBillingCheck(env,await owned(env,owner,id),key);}}catch{} }
        }
        send({type:'complete',task:task(await owned(env,owner,id)),output,asset:newAsset});
      }catch{
        const state=fallback?'save_failed':'unknown',message=fallback?'图片已生成，但云端保存未完成。请立即下载下方原图，勿重复生成。':'任务结果未确认，请查看供应商记录后再决定是否重试。';
        try{await env.DB.prepare('UPDATE jobs SET status = ?, error_code = ?, error_message = ?, completed_at = ? WHERE id = ?').bind(state,'STORAGE_OR_CONNECTION_ERROR',message,Date.now(),id).run();}catch{}
        send({type:'complete',task:{id,status:state,error_message:message},fallback});
      }finally{key=null;clearInterval(timer);if(!closed){closed=true;try{controller.close();}catch{}}}
    })();
    ctx?.waitUntil(work);
  },cancel(){closed=true;clearInterval(timer);}});
  return new Response(stream,{headers:{'Content-Type':'application/x-ndjson','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
}

export default{async fetch(req,env,ctx){
  try{
    const url=new URL(req.url),path=url.pathname;
    // The Sites dispatcher enforces owner-private access before reaching this Worker.
    if(req.method==='GET'&&path==='/health/provider'){
      // Owner-private dispatch is required. Fixed URL, no credentials, no generation request.
      const started=Date.now();
      try{const r=await fetch('https://video.ctmoai.com/api/pricing',{method:'GET',redirect:'manual',signal:AbortSignal.timeout(15000)});await r.body?.cancel();return json({reachable:true,status:r.status,elapsed_ms:Date.now()-started});}
      catch(e){return json({reachable:false,error_name:e.name,error:String(e.message).slice(0,300),elapsed_ms:Date.now()-started});}
    }
    if(req.method==='GET'&&path==='/health')return json({version:'3.2.1',key_storage:'none',database:!!env.DB,files:!!env.BUCKET,legacy_key_present:!!env.IMAGE_API_KEY,provider_timeout_minutes:10,safe_generation_retries:0});
    if(req.method==='GET'&&['/','/app.js','/style.css','/neo-brutal.css'].includes(path))return new Response(path==='/'?page:path==='/app.js'?script:path==='/neo-brutal.css'?brutalStyle:style,{headers:{'Content-Type':path==='/'?'text/html; charset=utf-8':path==='/app.js'?'text/javascript; charset=utf-8':'text/css; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer','Content-Security-Policy':"default-src 'self'; script-src 'self' https://accounts.google.com/gsi/client; style-src 'self' 'unsafe-inline'; font-src 'self' data:; img-src 'self' blob: data:; connect-src 'self' https://accounts.google.com https://www.googleapis.com https://*.googleapis.com; frame-src https://accounts.google.com; object-src 'none'; base-uri 'none'; form-action 'self'"}});
    if(!path.startsWith('/api/'))return json({error:'Not found'},404);
    const owner=req.headers.get('oai-authenticated-user-id');if(!owner)return json({error:'请使用你的 ChatGPT 账号登录此私有站点'},401);
    if(!env.DB||!env.BUCKET)return json({error:'云端存储尚不可用，请稍后再试'},503);
    if(!['GET','HEAD'].includes(req.method)&&(req.headers.get('origin')!==url.origin||req.headers.get('x-workbench-request')!=='1'))return json({error:'请求来源验证失败，请重新打开站点'},403);
    const canvasResponse=await canvasRoutes(req,env,owner,url,body);if(canvasResponse)return canvasResponse;
    if(path==='/api/preflight'&&req.method==='POST')return await preflight(req,env,owner);
    if(path==='/api/generate'&&req.method==='POST')return await generate(req,env,owner,ctx);
    if(path==='/api/tasks'&&req.method==='GET'){
      await cleanup(env,owner);
      const offset=Math.max(0,Math.min(10000,Number(url.searchParams.get('offset'))||0));
      const rows=await env.DB.prepare('SELECT * FROM jobs WHERE owner = ? AND (expires_at > ? OR EXISTS (SELECT 1 FROM assets WHERE legacy_task_id=jobs.id AND owner=jobs.owner)) ORDER BY created_at DESC LIMIT 41 OFFSET ?').bind(owner,Date.now(),offset).all();
      const usage=await env.DB.prepare('SELECT COALESCE(SUM(bytes),0) AS bytes, COUNT(*) AS count FROM jobs WHERE owner = ?').bind(owner).first();
      const thumbs=await env.DB.prepare('SELECT COALESCE(SUM(thumb_bytes),0) AS bytes FROM assets WHERE owner=?').bind(owner).first();usage.bytes+=thumbs.bytes;
      return json({tasks:rows.results.slice(0,40).map(task),more:rows.results.length>40,usage:{...usage,limit:LIMIT},retention_days:30});
    }
    const match=/^\/api\/tasks\/([a-f0-9-]{36})(?:\/(image|reference|recovery|reconcile))?$/.exec(path);
    if(match){const row=await owned(env,owner,match[1]);if(!row)return json({error:'任务不存在或已到期'},404);
      if(!match[2]&&req.method==='GET')return json({task:task(row)});
      if(!match[2]&&req.method==='DELETE'){if(await env.DB.prepare('SELECT id FROM assets WHERE legacy_task_id=? AND owner=?').bind(row.id,owner).first())return json({error:'此原图已加入画布档案，请先在档案中移除'},409);if(row.status==='running')return json({error:'请等待任务结束后再删除'},409);await erase(env,row);return json({success:true});}
      if(match[2]==='reconcile'&&req.method==='POST'){
        if(!['unknown','charged_unknown'].includes(row.status))return json({task:task(row),checked:false,message:'当前任务状态不需要核对供应商消费记录。'});
        const data=await body(req),key=validKey(data?.key),check=await applyBillingCheck(env,row,key),updated=await owned(env,owner,row.id);
        return json({task:task(updated),...check});
      }
      if(match[2]==='recovery'&&req.method==='DELETE'){if(!row.image_key?.startsWith('recoveries/'))return json({success:true});await env.BUCKET.delete(row.image_key);await env.DB.prepare('UPDATE jobs SET image_key=NULL,image_mime=NULL,bytes=0 WHERE id=? AND owner=?').bind(row.id,owner).run();return json({success:true});}
      if(match[2]&&req.method==='GET'){const recovery=match[2]==='recovery';if(recovery&&!row.image_key?.startsWith('recoveries/'))return json({error:'没有可重新拉取的恢复副本'},404);const k=match[2]==='reference'?row.ref_key:row.image_key;if(!k)return json({error:'没有该图片'},404);const obj=await env.BUCKET.get(k);if(!obj)return json({error:'图片未保存成功或已移除'},404);const mime=match[2]==='reference'?row.ref_mime:row.image_mime,ext={'image/png':'png','image/jpeg':'jpg','image/webp':'webp'}[mime]||'bin';return new Response(obj.body,{headers:{'Content-Type':mime,'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff',...(url.searchParams.has('download')?{'Content-Disposition':`attachment; filename="${row.id}-${match[2]}.${ext}"`}:{})}});}
    }
    return json({error:'Not found'},404);
  }catch(e){return json({error:e.status?e.message:'云端暂时不可用。输入仍在页面中，请勿重复提交生图请求。'},e.status||503);}
}};
