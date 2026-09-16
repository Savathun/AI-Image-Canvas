import {MAX_REFERENCES,MAX_INLINE_BYTES,requestBytes} from '../shared/references.js';
import {dataURL} from './storage.js';
export const INLINE_TARGET=19_500_000;
const base64Size=n=>4*Math.ceil(n/3);
export function estimatedBytes(args,blobs){return requestBytes(args,blobs.map(b=>'data:'+b.type+';base64,'))+blobs.reduce((n,b)=>n+base64Size(b.size),0);}
const cancelled=check=>{if(check())throw new Error('已取消准备，尚未调用生图 API。');};
// Keep small references intact; divide the remaining budget in proportion to source sizes.
export function budgets(blobs,total){let remaining=total;const small=blobs.map(b=>b.size<=128000);for(let i=0;i<blobs.length;i++)if(small[i])remaining-=blobs[i].size;const sum=blobs.reduce((s,b,i)=>s+(small[i]?0:b.size),0);return blobs.map((b,i)=>small[i]?b.size:Math.max(1,Math.floor(remaining*b.size/sum)));}
async function encodeCopy(blob,target,check){
 const bitmap=await createImageBitmap(blob),canvas=document.createElement('canvas');let width=bitmap.width,height=bitmap.height;
 const encode=q=>new Promise((resolve,reject)=>canvas.toBlob(b=>b?resolve(b):reject(new Error('参考图处理失败，请更换图片后重试')),'image/webp',q));
 try{for(let round=0;round<8;round++){
  cancelled(check);canvas.width=width;canvas.height=height;canvas.getContext('2d').drawImage(bitmap,0,0,width,height);
  const high=await encode(.96);cancelled(check);
  // WebP keeps transparency; never flatten to JPEG if unsupported.
  if(high.type!=='image/webp')throw new Error('此浏览器无法生成保留透明度的 WebP 提交副本，请换用支持 WebP 的浏览器');
  if(high.size<=target)return{blob:high,width,height,quality:.96};
  let best=await encode(.78);cancelled(check);
  if(best.size<=target){let lo=.78,hi=.96,quality=lo;for(let i=0;i<6;i++){cancelled(check);const q=(lo+hi)/2,b=await encode(q);if(b.size<=target){best=b;quality=q;lo=q;}else hi=q;}return{blob:best,width,height,quality};}
  const scale=Math.min(.9,Math.sqrt(target/best.size)*.97),nextW=Math.max(1,Math.floor(width*scale)),nextH=Math.max(1,Math.floor(height*scale));
  if(nextW===width&&nextH===height)break;width=nextW;height=nextH;
 }
 throw new Error('参考图未能完成自动优化，尚未提交。请减少图片数量或换用其他图片。');
 }finally{bitmap.close();canvas.width=1;canvas.height=1;}
}
export async function prepareReferences(args,refs,{progress=()=>{},isCancelled=()=>false,encode=encodeCopy,read=dataURL}={}){
 if(refs.length>MAX_REFERENCES)throw new Error('参考图最多 14 张');const originals=refs.map(r=>r.blob);let output=originals.slice(),records=refs.map(r=>({original_bytes:r.blob.size,sent_bytes:r.blob.size,mime:r.blob.type,width:r.asset.width,height:r.asset.height,compressed:false}));
 cancelled(isCancelled);
 if(estimatedBytes(args,output)>INLINE_TARGET){
  // Reserve text/JSON and Base64 rounding; final exact validation is mandatory.
  const overhead=requestBytes(args,refs.map(()=>'data:image/webp;base64,'));
  const rawBudget=Math.floor((INLINE_TARGET-overhead-1024)*3/4);
  if(rawBudget<=0)throw new Error('提示词内容过长，无法准备参考图');const allocation=budgets(originals,rawBudget);
  for(let i=0;i<refs.length;i++){cancelled(isCancelled);progress(i+1,refs.length);if(originals[i].size<=allocation[i])continue;
   const result=await encode(originals[i],allocation[i],isCancelled);cancelled(isCancelled);
   if(result.blob.size>allocation[i]||result.blob.size>=originals[i].size)throw new Error('参考图优化未完成，尚未调用生图 API');output[i]=result.blob;records[i]={...records[i],sent_bytes:result.blob.size,mime:result.blob.type,width:result.width,height:result.height,quality:result.quality,compressed:true};
  }
 }
 cancelled(isCancelled);const images=[];for(const b of output){cancelled(isCancelled);images.push(await read(b));}
 const bytes=requestBytes(args,images);if(bytes>INLINE_TARGET||bytes>=MAX_INLINE_BYTES)throw new Error('参考图优化未完成，尚未调用生图 API。请减少图片后重试。');
 return{images,records,bytes,compressed:records.filter(r=>r.compressed).length};
}
