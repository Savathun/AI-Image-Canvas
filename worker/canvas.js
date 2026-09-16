import {imageDimensions} from './provider.js';
const json=(v,s=200)=>new Response(JSON.stringify(v),{status:s,headers:{'Content-Type':'application/json','Cache-Control':'no-store'}});
const bad=(m,s=400)=>{throw Object.assign(new Error(m),{status:s});};
const uuid=s=>typeof s==='string'&&/^[a-f0-9-]{36}$/.test(s);
const cleanText=(s,n)=>typeof s==='string'?s.slice(0,n):'';
export async function asset(env,owner,id){return env.DB.prepare('SELECT * FROM assets WHERE id=? AND owner=?').bind(id,owner).first();}
export function exposed(r){return {...r,metadata:JSON.parse(r.metadata),thumbnail_url:r.thumb_bytes?'/api/assets/'+r.id+'/thumbnail':null,original_url:r.legacy_task_id?'/api/tasks/'+r.legacy_task_id+'/image':null};}
export async function recordAsset(env,owner,input){
 await env.DB.prepare('INSERT INTO assets (id,owner,created_at,mime,width,height,sha256,metadata,legacy_task_id) VALUES (?,?,?,?,?,?,?,?,?)').bind(input.id,owner,Date.now(),input.mime,input.width,input.height,input.sha256||'',JSON.stringify(input.metadata||{}),input.legacy_task_id||null).run();
 return exposed(await asset(env,owner,input.id));
}
export async function canvasRoutes(req,env,owner,url,readBody){
 const p=url.pathname;
 if(p==='/api/workspace'){
  if(req.method==='GET'){const r=await env.DB.prepare('SELECT * FROM workspaces WHERE owner=?').bind(owner).first();return json(r?{revision:r.revision,state:JSON.parse(r.state),google_client_id:r.google_client_id}:{revision:0,state:{items:[],view:{x:40,y:40,z:1}},google_client_id:''});}
  if(req.method==='PUT'){
   const d=await readBody(req);if(!Number.isInteger(d.revision)||!d.state||!Array.isArray(d.state.items)||d.state.items.length>2000)bad('画布内容无效或超过 2000 项');
   const items=d.state.items.map(i=>{if(!uuid(i.id)||!Number.isFinite(i.x)||!Number.isFinite(i.y)||Math.abs(i.x)>1e7||Math.abs(i.y)>1e7)bad('画布坐标无效');return {id:i.id,asset_id:uuid(i.asset_id)?i.asset_id:null,x:i.x,y:i.y,label:cleanText(i.label,160)};});
   if(new Set(items.map(i=>i.id)).size!==items.length)bad('画布项重复');
   const v=d.state.view;if(!v||![v.x,v.y,v.z].every(Number.isFinite)||v.z<.08||v.z>5)bad('缩放参数无效');
   const client=cleanText(d.google_client_id,200);if(client&&!/^[a-zA-Z0-9-]+\.apps\.googleusercontent\.com$/.test(client))bad('Google OAuth Client ID 格式无效');
   const s=JSON.stringify({items,view:v});
   await env.DB.prepare('INSERT OR IGNORE INTO workspaces (owner,revision,state,google_client_id) VALUES (?,0,?,?)').bind(owner,'{}','').run();
   const r=await env.DB.prepare('UPDATE workspaces SET state=?,google_client_id=?,revision=revision+1 WHERE owner=? AND revision=?').bind(s,client,owner,d.revision).run();
   if(!r.meta.changes)return json({error:'另一页面更新了画布。请导出本页布局后重新载入，避免覆盖。',conflict:true},409);
   return json({revision:d.revision+1});
  }
 }
 if(p==='/api/assets'&&req.method==='GET'){
  const r=await env.DB.prepare('SELECT * FROM assets WHERE owner=? ORDER BY created_at DESC LIMIT 2001').bind(owner).all();return json({assets:r.results.map(exposed)});
 }
 if(p==='/api/assets'&&req.method==='POST'){
  const d=await readBody(req);if(!uuid(d.id))bad('图片编号无效');const exists=await asset(env,owner,d.id);if(exists)return json({asset:exposed(exists)});
  const count=await env.DB.prepare('SELECT COUNT(*) AS n FROM assets WHERE owner=?').bind(owner).first();if(count.n>=2000)bad('图片档案达到 2000 项上限，请先整理',409);
  if(d.legacy_task_id){const t=await env.DB.prepare('SELECT * FROM jobs WHERE id=? AND owner=?').bind(d.legacy_task_id,owner).first();if(!t?.image_key)bad('旧原图不可用',404);const obj=await env.BUCKET.get(t.image_key);if(!obj)bad('旧原图文件不存在',404);const digest=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',await obj.arrayBuffer())),v=>v.toString(16).padStart(2,'0')).join('');return json({asset:await recordAsset(env,owner,{id:d.id,sha256:digest,mime:t.image_mime,width:t.width,height:t.height,legacy_task_id:t.id,metadata:{task_id:t.id,prompt:t.prompt,model:t.model,image_size:t.image_size,aspect_ratio:t.aspect_ratio}})});}
  if(!['image/png','image/jpeg','image/webp'].includes(d.mime)||!Number.isInteger(d.width)||!Number.isInteger(d.height)||d.width<1||d.height<1||d.width*d.height>80000000||!/^[a-f0-9]{64}$/.test(d.sha256))bad('图片元数据无效');
  const parent=d.parent_asset_id?await asset(env,owner,d.parent_asset_id):null;if(d.parent_asset_id&&!parent)bad('来源图片不存在');
  const metadata={kind:parent?'edit':'import',parent_asset_id:parent?.id||null,name:cleanText(d.name,200),recipe:d.recipe||null};if(JSON.stringify(metadata).length>750000)bad('编辑记录过大');
  return json({asset:await recordAsset(env,owner,{...d,metadata})});
 }
 const m=/^\/api\/assets\/([a-f0-9-]{36})(?:\/(thumbnail|drive))?$/.exec(p);
 if(m){const a=await asset(env,owner,m[1]);if(!a)bad('图片不存在',404);
  if(m[2]==='thumbnail'&&req.method==='GET'){const o=await env.BUCKET.get('thumbs/'+a.id);if(!o)bad('缩略图尚未保存',404);return new Response(o.body,{headers:{'Content-Type':o.httpMetadata.contentType,'Cache-Control':'private, max-age=3600','X-Content-Type-Options':'nosniff'}});}
  if(m[2]==='thumbnail'&&req.method==='PUT'){
   const d=await readBody(req);if(typeof d.data!=='string'||d.data.length>180000)bad('缩略图超过 128 KiB');let b;try{b=Uint8Array.from(atob(d.data),c=>c.charCodeAt(0));}catch{bad('缩略图无效');}
   const dim=imageDimensions(b);if(!dim||Math.max(dim.width,dim.height)>512||b.length>131072)bad('缩略图最多 512 像素 / 128 KiB');
   const u=await env.DB.prepare('SELECT (SELECT COALESCE(SUM(bytes),0) FROM jobs WHERE owner=?) + (SELECT COALESCE(SUM(thumb_bytes),0) FROM assets WHERE owner=?) AS bytes').bind(owner,owner).first();if(u.bytes+b.length-a.thumb_bytes>256*1024*1024)bad('云端图片空间不足',409);
   await env.BUCKET.put('thumbs/'+a.id,b,{httpMetadata:{contentType:dim.mime}});await env.DB.prepare('UPDATE assets SET thumb_bytes=? WHERE id=? AND owner=?').bind(b.length,a.id,owner).run();return json({asset:exposed(await asset(env,owner,a.id))});
  }
  if(m[2]==='drive'&&req.method==='PUT'){
   const d=await readBody(req);if(!/^[a-zA-Z0-9_-]{8,200}$/.test(d.file_id)||d.sha256!==a.sha256||!Number.isSafeInteger(d.size)||d.size<1)bad('Drive 校验记录无效');
   const meta=JSON.parse(a.metadata);meta.drive={file_id:d.file_id,sha256:d.sha256,size:d.size,verified_at:Date.now()};await env.DB.prepare('UPDATE assets SET metadata=? WHERE id=? AND owner=?').bind(JSON.stringify(meta),a.id,owner).run();return json({asset:exposed(await asset(env,owner,a.id))});
  }
  if(!m[2]&&req.method==='DELETE'){
   const w=await env.DB.prepare('SELECT state FROM workspaces WHERE owner=?').bind(owner).first();if(w&&JSON.parse(w.state).items?.some(i=>i.asset_id===a.id))bad('请先从画布移除此图片',409);
   await env.BUCKET.delete('thumbs/'+a.id);await env.DB.prepare('DELETE FROM assets WHERE id=? AND owner=?').bind(a.id,owner).run();return json({success:true});
  }
 }
 return null;
}
