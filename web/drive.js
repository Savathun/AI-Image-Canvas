import {driveError,safeMessage} from './drive-errors.js';
import {hash,filename} from './storage.js';
let token=null,expires=0,client=null,loaded,lastDiagnostic=null;const uploading=new Map(),sessions=new Map();
export const connected=()=>!!token&&Date.now()<expires;
export function disconnect(){token=null;expires=0;client=null;sessions.clear();}
export function prepare(clientId){if(!clientId)return Promise.resolve();return loaded??=new Promise((resolve,reject)=>{const s=document.createElement('script');s.src='https://accounts.google.com/gsi/client';s.onload=resolve;s.onerror=()=>{loaded=null;reject(new Error('Google 授权组件未加载，请检查网络后重试'));};document.head.append(s);});}
export function connect(clientId){if(!clientId)throw new Error('请先在设置中填写 Google OAuth Client ID');if(!window.google?.accounts?.oauth2)throw new Error('Google 授权组件尚未就绪，请稍后再点击连接');return new Promise((resolve,reject)=>{client=google.accounts.oauth2.initTokenClient({client_id:clientId,scope:'https://www.googleapis.com/auth/drive.file',callback:r=>{if(r.error||!google.accounts.oauth2.hasGrantedAllScopes(r,'https://www.googleapis.com/auth/drive.file')){reject(new Error('Google Drive 授权未完成'));return;}sessions.clear();token=r.access_token;expires=Date.now()+(Number(r.expires_in)-60)*1000;resolve();},error_callback:()=>reject(new Error('Google 授权窗口已关闭或被拦截'))});client.requestAccessToken({prompt:''});});}
export function diagnostic(){return lastDiagnostic?JSON.stringify(lastDiagnostic,null,2):'尚无 Drive 错误。';}
function remember(e){lastDiagnostic=e.detail||{stage:'Drive 请求',status:0,reason:'CLIENT_ERROR',message:safeMessage(e.message,token)};return e;}
async function request(url,options={},stage='Drive 请求'){
 if(!connected())throw remember(Object.assign(new Error('请点击连接 Google Drive，授权仅在本次页面中有效'),{detail:{stage,status:401,reason:'NOT_CONNECTED'}}));
 const u=new URL(url);if(u.origin!=='https://www.googleapis.com')throw remember(new Error('Drive 请求地址不受支持'));
 let r;try{r=await fetch(url,{...options,redirect:'error',signal:AbortSignal.timeout(120000),headers:{Authorization:'Bearer '+token,...options.headers}});}catch(e){throw remember(Object.assign(new Error(`${stage}未能连接 Google。请检查当前浏览器的网络连接或代理；尚不能确认请求是否到达。`),{status:0,detail:{stage,status:0,reason:e.name==='TimeoutError'?'TIMEOUT':'NETWORK_ERROR',message:'浏览器未收到可读取的 Google 响应'}}));}
 if(!r.ok&&r.status!==308){let data;try{data=await r.json();}catch{data={};}const e=driveError(r.status,data,stage,token);if(r.status===401)disconnect();throw remember(e);}return r;
}
export async function checkAccess(){await request('https://www.googleapis.com/drive/v3/files?pageSize=1&fields=files(id)',{},'检查 Drive API');lastDiagnostic=null;return true;}
export async function listImages(){const q="trashed = false and (mimeType = 'image/png' or mimeType = 'image/jpeg' or mimeType = 'image/webp')",params=new URLSearchParams({q,spaces:'drive',orderBy:'modifiedTime desc',pageSize:'100',fields:'files(id,name,mimeType,size,modifiedTime,description,appProperties)'});const data=await(await request('https://www.googleapis.com/drive/v3/files?'+params,{},'读取 Drive 图片列表')).json();lastDiagnostic=null;return(data.files||[]).filter(f=>f?.id&&['image/png','image/jpeg','image/webp'].includes(f.mimeType));}
export async function downloadImage(file){if(!file?.id||!['image/png','image/jpeg','image/webp'].includes(file.mimeType))throw new Error('Drive 图片格式不受支持');const expected=Number(file.size);if(!Number.isSafeInteger(expected)||expected<1)throw new Error('Drive 图片大小无效');if(expected>20*1024*1024)throw new Error('Drive 图片超过 20 MiB，无法导入');const raw=await(await request('https://www.googleapis.com/drive/v3/files/'+encodeURIComponent(file.id)+'?alt=media',{},'下载 Drive 图片')).blob();if(raw.size!==expected)throw new Error('Drive 图片下载不完整，请重试');lastDiagnostic=null;return new Blob([raw],{type:file.mimeType});}
async function verify(id,blob,digest){const metadata=await(await request('https://www.googleapis.com/drive/v3/files/'+encodeURIComponent(id)+'?fields=id,size,trashed,appProperties,description',{},'校验文件信息')).json();if(metadata.trashed||Number(metadata.size)!==blob.size||metadata.appProperties?.sha256!==digest)throw new Error('Drive 文件元数据校验失败');const stored=await(await request('https://www.googleapis.com/drive/v3/files/'+encodeURIComponent(id)+'?alt=media',{},'读取云端原图')).blob();if(await hash(stored)!==digest)throw new Error('Drive 原图校验失败');return{id,size:blob.size,sha256:digest,description:metadata.description||''};}
async function fillDescription(verified,description){
 if(!description.trim()||verified.description.trim())return verified;
 try{const r=await request('https://www.googleapis.com/drive/v3/files/'+encodeURIComponent(verified.id)+'?fields=id,description',{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({description})},'写入文件说明');const updated=await r.json();if(updated.description!==description)throw new Error('Google 未确认文件说明内容');return{...verified,description:updated.description};}
 catch(e){e.message='原图已在 Drive，但文件说明尚未写入。'+e.message;throw e;}
}
export async function upload(a,blob){if(uploading.has(a.id))return uploading.get(a.id);const task=performUpload(a,blob);uploading.set(a.id,task);try{return await task;}finally{uploading.delete(a.id);}}
async function performUpload(a,blob){const description=typeof a.metadata?.prompt==='string'?a.metadata.prompt:'';const digest=await hash(blob);if(a.sha256&&a.sha256!==digest)throw new Error('本地原图与档案哈希不符');
 const q="trashed = false and appProperties has { key='ctmoai_asset' and value='"+a.id+"' }";
 const found=await(await request('https://www.googleapis.com/drive/v3/files?q='+encodeURIComponent(q)+'&fields=files(id)&pageSize=10',{},'检查已有归档')).json();
 // Resolve previously completed uploads before creating another file.
 if(found.files?.length)return fillDescription(await verify(found.files[0].id,blob,digest),description);
 let url=sessions.get(a.id),fresh=!url;if(!url){const init=await request('https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&fields=id',{method:'POST',headers:{'Content-Type':'application/json; charset=UTF-8','X-Upload-Content-Type':blob.type,'X-Upload-Content-Length':String(blob.size)},body:JSON.stringify({name:filename(a),mimeType:blob.type,...(description.trim()?{description}:{}),appProperties:{ctmoai_asset:a.id,sha256:digest}})},'创建上传会话');
 url=init.headers.get('Location');if(!url)throw new Error('Drive 未返回上传地址');sessions.set(a.id,url);}let r;
 try{
  let start=0;
  if(!fresh){const status=await request(url,{method:'PUT',headers:{'Content-Range':`bytes */${blob.size}`},body:new Blob([])},'查询上传进度');if(status.status!==308)r=status;else{const range=status.headers.get('Range');if(range&&!/^bytes=0-\d+$/.test(range))throw new Error('Google 返回了无效上传范围');start=range?Number(range.split('-')[1])+1:0;}}
  if(!r){if(start>=blob.size)throw new Error('上传结果尚未确认，请稍后再次检查');r=await request(url,{method:'PUT',headers:{'Content-Type':blob.type,'Content-Range':`bytes ${start}-${blob.size-1}/${blob.size}`},body:blob.slice(start)},'上传原图');}
 }catch(e){
  if(e.status===404||e.status===410)sessions.delete(a.id);
  // Permission/configuration errors must retain their real Google reason.
  if(e.status!==0&&!(e.status>=500))throw e;
  try{r=await request(url,{method:'PUT',headers:{'Content-Range':`bytes */${blob.size}`},body:new Blob([])},'确认上传结果');}catch(statusError){throw statusError;}
  if(r.status===308)throw e;
 }
 if(r.status===308)throw new Error('上传未完成，请保持本地原图并稍后重试');const meta=await r.json();if(!meta.id)throw new Error('Drive 文件编号未返回');const verified=await fillDescription(await verify(meta.id,blob,digest),description);sessions.delete(a.id);lastDiagnostic=null;return verified;
}
export async function restore(a){if(!a.metadata.drive?.file_id)throw new Error('此图片没有 Drive 归档');const blob=await(await request('https://www.googleapis.com/drive/v3/files/'+encodeURIComponent(a.metadata.drive.file_id)+'?alt=media',{},'读取云端原图')).blob();if(await hash(blob)!==a.sha256)throw new Error('Drive 原图与档案哈希不符');return new Blob([blob],{type:a.mime});}
window.addEventListener('pagehide',disconnect);
