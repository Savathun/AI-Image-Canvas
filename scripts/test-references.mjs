import assert from 'node:assert/strict';
import {parseInput} from '../worker/provider.js';
import {MAX_INLINE_BYTES,requestBytes} from '../shared/references.js';
const pic='iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/l9sAAAAASUVORK5CYII=';
const refs=Array.from({length:14},(_,i)=>'data:image/png;base64,'+Buffer.concat([Buffer.from(pic,'base64'),Buffer.alloc(i)]).toString('base64'));
const args={prompt:'保持图 1 的构图，参考其余图片的颜色。',reference_images:refs};
const parsed=parseInput(args);assert.deepEqual(parsed.body.contents[0].parts.slice(1).map(p=>p.inlineData.data),refs.map(s=>s.split(',')[1]));
assert.throws(()=>parseInput({...args,reference_images:[...refs,refs[0]]}),/14/);
assert.throws(()=>parseInput({...args,reference_image:refs[0]}),/不能同时/);
// A PNG with harmless trailing bytes proves the removed 4 MiB gate stays removed.
const large='data:image/png;base64,'+Buffer.concat([Buffer.from(pic,'base64'),Buffer.alloc(5*1024*1024)]).toString('base64');
assert.equal(parseInput({prompt:'test',reference_images:[large]}).body.contents[0].parts.length,2);
assert.throws(()=>parseInput({prompt:'test',reference_images:[large,large,large]}),/20 MB/);
// Measure UTF-8 JSON bytes including Base64 and prompt, not raw file byte totals.
assert.equal(requestBytes(args,refs),Buffer.byteLength(JSON.stringify(parsed.body)));
const baseline=requestBytes({prompt:'边界'},['data:image/png;base64,']);
const rawBytes=Math.floor((MAX_INLINE_BYTES-baseline)/4)*3;
const close='data:image/png;base64,'+Buffer.concat([Buffer.from(pic,'base64'),Buffer.alloc(rawBytes-Buffer.from(pic,'base64').length)]).toString('base64');
assert.ok(requestBytes({prompt:'边界'},[close])<=MAX_INLINE_BYTES);
assert.ok(requestBytes({prompt:'边界😀'},[close])>MAX_INLINE_BYTES);
console.log('PASS: 14 ordered references; reject 15 and ambiguous inputs; >4 MiB accepted; 20 MB full UTF-8 request boundary enforced. No API requests.');
