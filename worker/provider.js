import {MAX_REFERENCES,MAX_INLINE_BYTES,imageBody,requestBytes} from '../shared/references.js';
// Cloudflare Worker ESM. Credentials are injected by the host, never stored here.
const PROVIDERS = { ctmoai: { origin:'https://video.ctmoai.com', endpoint:'/v1beta/models/{model}:generateContent', models:['gemini-3.1-flash-image-preview','gemini-3-pro-image-preview'] } };
const RATIOS=['1:1','2:3','3:2','3:4','4:3','4:5','5:4','9:16','16:9','21:9'];
const SIZES=['1K','2K','4K'];
const PROTOCOLS=['2024-11-05','2025-03-26','2025-06-18','2025-11-25'];
export const TOOL={
  name:'generate_image',title:'CTMOAI 生图',
  description:'Generate one image with CTMOAI / Banana. Supports native 1K, 2K, 4K, aspect ratio and up to 14 base64 reference images. Each call can incur charges; never automatically retry. Returns actual measured dimensions and MCP image content. No arbitrary pixel dimensions or quality parameter.',
  inputSchema:{type:'object',additionalProperties:false,required:['prompt'],properties:{
    prompt:{type:'string',minLength:1,maxLength:12000},provider:{type:'string',enum:['ctmoai'],default:'ctmoai'},
    model:{type:'string',enum:PROVIDERS.ctmoai.models,default:PROVIDERS.ctmoai.models[1]},
    image_size:{type:'string',enum:SIZES,default:'1K'},aspect_ratio:{type:'string',enum:RATIOS,default:'1:1'},
    reference_image:{type:'string',description:'Legacy single reference data URL. Total encoded request <=20 MB.'},
    reference_images:{type:'array',maxItems:14,items:{type:'string'},description:'Ordered PNG/JPEG/WebP data URLs. Total encoded request including text <=20 MB. Do not combine with reference_image.'}
  }},
  outputSchema:{type:'object',required:['success','provider','model','width','height','image_url','image_file','task_id','error'],properties:{
    success:{type:'boolean'},provider:{type:'string'},model:{type:['string','null']},width:{type:['integer','null']},height:{type:['integer','null']},image_url:{type:['string','null']},task_id:{type:['string','null']},request_id:{type:['string','null']},
    image_file:{type:['object','null'],properties:{filename:{type:'string'},mime_type:{type:'string'},delivery:{type:'string'}}},
    error:{type:['object','null'],properties:{code:{type:'string'},message:{type:'string'},http_status:{type:['integer','null']}}}
  }},annotations:{readOnlyHint:false,destructiveHint:false,idempotentHint:false,openWorldHint:true}
};
class APIError extends Error{constructor(code,message,status=null,diagnostic=null){super(message);this.code=code;this.status=status;this.diagnostic=diagnostic;}}
const invalid=m=>{throw new APIError('INVALID_ARGUMENT',m);};
export function imageDimensions(b){
  const v=new DataView(b.buffer,b.byteOffset,b.byteLength);
  if(b.length>=24&&v.getUint32(0)===0x89504e47&&v.getUint32(4)===0x0d0a1a0a&&v.getUint32(12)===0x49484452)return{width:v.getUint32(16),height:v.getUint32(20),mime:'image/png'};
  if(b.length>4&&b[0]===255&&b[1]===216){let p=2;while(p+4<=b.length){if(b[p++]!==255)return null;while(b[p]===255)p++;const m=b[p++];if(m===0xd9||m===0xda)break;if(m===1||(m>=0xd0&&m<=0xd8))continue;if(p+2>b.length)break;const n=v.getUint16(p);if(n<2||p+n>b.length)break;if([0xc0,0xc1,0xc2,0xc3,0xc5,0xc6,0xc7,0xc9,0xca,0xcb,0xcd,0xce,0xcf].includes(m)&&n>=8)return{width:v.getUint16(p+5),height:v.getUint16(p+3),mime:'image/jpeg'};p+=n;}}
  if(b.length>=30&&v.getUint32(0)===0x52494646&&v.getUint32(8)===0x57454250){const k=v.getUint32(12);if(k===0x56503858)return{width:1+b[24]+(b[25]<<8)+(b[26]<<16),height:1+b[27]+(b[28]<<8)+(b[29]<<16),mime:'image/webp'};if(k===0x56503820&&b[23]===0x9d&&b[24]===1&&b[25]===0x2a)return{width:v.getUint16(26,true)&0x3fff,height:v.getUint16(28,true)&0x3fff,mime:'image/webp'};if(k===0x5650384c&&b[20]===0x2f){const n=v.getUint32(21,true);return{width:(n&0x3fff)+1,height:((n>>>14)&0x3fff)+1,mime:'image/webp'};}}
  return null;
}
function decodeImage(data,mime,max){
  if(typeof data!=='string'||!data.length||data.length>Math.ceil(max/3)*4||data.length%4||!/^[A-Za-z0-9+/]*={0,2}$/.test(data))invalid('Invalid or oversized base64 image.');
  let b;try{b=Uint8Array.from(atob(data),c=>c.charCodeAt(0));}catch{invalid('Invalid base64 image.');}
  if(b.length>max)invalid('Image exceeds size limit.');const d=imageDimensions(b);if(!d||d.mime!==mime||!d.width||!d.height)invalid('Image bytes do not match PNG/JPEG/WebP.');return d;
}
export function parseInput(raw){
  if(!raw||typeof raw!=='object'||Array.isArray(raw))invalid('Arguments must be an object.');
  for(const k of Object.keys(raw))if(!Object.hasOwn(TOOL.inputSchema.properties,k))invalid('Unsupported parameter: '+k);
  const{prompt,provider='ctmoai',model=PROVIDERS.ctmoai.models[1],image_size='1K',aspect_ratio='1:1',reference_image,reference_images}=raw;
  if(typeof prompt!=='string'||!prompt.trim()||prompt.length>12000)invalid('prompt must contain 1–12000 characters.');
  if(provider!=='ctmoai')invalid('Unsupported provider.');if(!PROVIDERS[provider].models.includes(model))invalid('Unsupported model.');if(!SIZES.includes(image_size))invalid('image_size must be 1K, 2K or 4K.');if(!RATIOS.includes(aspect_ratio))invalid('Unsupported aspect_ratio.');
  if(reference_image!==undefined&&reference_images!==undefined)invalid('请选择单图或多图参数，不能同时使用');
  const refs=reference_images??(reference_image===undefined?[]:[reference_image]);
  if(!Array.isArray(refs)||refs.length>MAX_REFERENCES)invalid('参考图最多 14 张');
  if(refs.some(r=>typeof r!=='string'||!/^data:image\/(png|jpeg|webp);base64,/.test(r)))invalid('参考图必须为 PNG/JPEG/WebP data URL');
  if(requestBytes({prompt,image_size,aspect_ratio},refs)>MAX_INLINE_BYTES)invalid('编码后的整次请求超过 20 MB。请减少参考图或缩小提交图片；原文件无需删除。');
  for(const ref of refs){const m=/^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/=]+)$/.exec(ref);if(!m)invalid('参考图编码无效');decodeImage(m[2],m[1],MAX_INLINE_BYTES);}
  return{provider,model,body:imageBody({prompt,image_size,aspect_ratio},refs)};
}
async function readLimited(response,limit){
  if(Number(response.headers.get('content-length'))>limit)throw new APIError('RESPONSE_TOO_LARGE','Response exceeds size limit.');
  const r=response.body?.getReader();if(!r)return'';const dec=new TextDecoder();let n=0,text='';
  try{while(true){const{done,value}=await r.read();if(done)break;n+=value.length;if(n>limit)throw new APIError('RESPONSE_TOO_LARGE','Response exceeds size limit.');text+=dec.decode(value,{stream:true});}return text+dec.decode();}finally{await r.cancel().catch(()=>{});r.releaseLock();}
}
function redact(s,key){return String(s).split(key||'\u0000').join('[REDACTED]').replace(/sk-[A-Za-z0-9_-]+/g,'[REDACTED]').replace(/Bearer\s+\S+/gi,'Bearer [REDACTED]').slice(0,500);}
export async function generateImage(raw,env,fetcher=fetch,signal){
  const result={success:false,provider:'ctmoai',model:typeof raw?.model==='string'?raw.model:PROVIDERS.ctmoai.models[1],width:null,height:null,image_url:null,image_file:null,task_id:null,request_id:null,error:null};let stage='prepare',upstreamStatus=null;
  try{
    const a=parseInput(raw);result.model=a.model;result.provider=a.provider;
    if(!env.IMAGE_API_KEY)throw new APIError('SERVER_NOT_CONFIGURED','IMAGE_API_KEY is not configured on the server.');
    // Non-streaming image gateways may not send headers until generation finishes.
    // Keep this below the gateway's documented 30-minute header timeout while leaving
    // enough room for slow 4K jobs. The request is still never retried automatically.
    const p=PROVIDERS[a.provider],timeout=AbortSignal.timeout(10*60*1000);
    stage='connect';
    const response=await fetcher(p.origin+p.endpoint.replace('{model}',encodeURIComponent(a.model)),{method:'POST',headers:{Authorization:'Bearer '+env.IMAGE_API_KEY,'Content-Type':'application/json'},body:JSON.stringify(a.body),redirect:'manual',signal:signal?AbortSignal.any([timeout,signal]):timeout});
    result.request_id=response.headers.get('x-oneapi-request-id')||response.headers.get('x-request-id')||null;
    upstreamStatus=response.status;stage='read_response';
    if(response.status>=300&&response.status<400){await response.body?.cancel();throw new APIError('UPSTREAM_REDIRECT','Provider redirected the request. Credentials were not forwarded to the redirect target.',response.status);}
    const text=await readLimited(response,response.ok?28*1024*1024:16384);let data;
    try{data=JSON.parse(text);}catch{
      const details=[`HTTP ${response.status}`,`content-type ${response.headers.get('content-type')||'missing'}`];
      const edge=response.headers.get('cf-ray'),server=response.headers.get('server');if(edge)details.push('cf-ray '+edge);if(server)details.push('server '+server);
      const excerpt=redact(text.replace(/\s+/g,' ').trim().slice(0,240),env.IMAGE_API_KEY);if(excerpt)details.push('body '+excerpt);
      throw new APIError('INVALID_UPSTREAM_RESPONSE','Provider returned non-JSON.',response.status,details.join('; '));
    }
    if(!response.ok||data.error){const code=[401,403].includes(response.status)?'AUTHENTICATION_FAILED':response.status===429?'RATE_LIMITED':response.status===413?'UPSTREAM_REQUEST_TOO_LARGE':'UPSTREAM_ERROR';throw new APIError(code,redact(data.error?.message||data.message||'Provider rejected the request.',env.IMAGE_API_KEY),response.status);}
    if(response.status===202||(!data.candidates&&(data.task_id||data.id))){result.task_id=String(data.task_id||data.id||'')||null;throw new APIError('UNSUPPORTED_ASYNC_RESPONSE','Unexpected asynchronous task. Polling is not documented for this synchronous endpoint; no invented polling URL or resubmission was used.',response.status);}
    stage='decode_image';
    let found;for(const c of data.candidates||[])for(const part of c.content?.parts||[]){const b=part.inlineData||part.inline_data;if(!part.thought&&b?.data&&!found)found={data:b.data,mime:b.mimeType||b.mime_type};}
    if(!found)throw new APIError('NO_IMAGE','Provider returned no image. Finish reason: '+redact(data.candidates?.[0]?.finishReason||data.promptFeedback?.blockReason||'unknown',env.IMAGE_API_KEY));
    const d=decodeImage(found.data,found.mime,20*1024*1024),ext={'image/png':'png','image/jpeg':'jpg','image/webp':'webp'}[found.mime];
    Object.assign(result,{success:true,width:d.width,height:d.height,image_file:{filename:result.request_id+'.'+ext,mime_type:found.mime,delivery:'mcp_image_content'}});
    return{structuredContent:result,content:[{type:'text',text:JSON.stringify(result)},{type:'image',mimeType:found.mime,data:found.data}],isError:false};
  }catch(e){const interrupted=['TimeoutError','AbortError'].includes(e.name);result.error={code:interrupted?'REQUEST_INTERRUPTED':e.code||'NETWORK_ERROR',message:interrupted?'Request timed out or was cancelled. Generation may already have been billed; no automatic retry was made.':redact(e instanceof APIError?e.message:'Could not complete the provider request.',env.IMAGE_API_KEY),http_status:e.status||upstreamStatus,diagnostic:redact(e.diagnostic||stage+': '+e.name+': '+(e.message||'unknown'),env.IMAGE_API_KEY)};return{structuredContent:result,content:[{type:'text',text:JSON.stringify(result)}],isError:true};}finally{}
}
