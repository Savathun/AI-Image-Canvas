// Gemini inline-image requests: 20 MB total, at most 14 references for Gemini 3 image models.
// https://ai.google.dev/gemini-api/docs/image-understanding
// https://ai.google.dev/gemini-api/docs/image-generation
export const MAX_REFERENCES=14,MAX_INLINE_BYTES=20_000_000;
export function imageBody({prompt,image_size='1K',aspect_ratio='1:1'},references=[]){return{contents:[{role:'user',parts:[{text:prompt},...references.map(ref=>{const split=ref.indexOf(',');return{inlineData:{mimeType:ref.slice(5,ref.indexOf(';')),data:ref.slice(split+1)}};})]}],generationConfig:{responseModalities:['TEXT','IMAGE'],imageConfig:{aspectRatio:aspect_ratio,imageSize:image_size}}};}
export function requestBytes(args,references=[]){return new TextEncoder().encode(JSON.stringify(imageBody(args,references))).byteLength;}
