import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {build} from 'esbuild';
import {Window} from 'happy-dom';
const html=await readFile('web/index.html','utf8');
const source=await build({entryPoints:['web/app.js'],bundle:true,write:false,format:'iife',define:{'process.env.NODE_ENV':'"production"'}});
const w=new Window({url:'https://workspace.test',settings:{enableJavaScriptEvaluation:true,disableJavaScriptFileLoading:true,disableCSSFileLoading:true}});
w.structuredClone=structuredClone;w.TextEncoder=TextEncoder;w.TextDecoder=TextDecoder;
w.document.write(html.replace(/<script[^>]*><\/script>/g,''));
const $=id=>w.document.getElementById(id),errors=[],requests=[],pending=[];
w.addEventListener('error',e=>errors.push(e.message));w.addEventListener('unhandledrejection',e=>errors.push(String(e.reason)));
w.HTMLCanvasElement.prototype.getContext=()=>({});w.HTMLElement.prototype.setPointerCapture=()=>{};
w.HTMLDialogElement.prototype.showModal=function(){this.setAttribute('open','');};w.HTMLDialogElement.prototype.close=function(){this.removeAttribute('open');this.dispatchEvent(new w.Event('close'));};
w.HTMLElement.prototype.getBoundingClientRect=function(){return{left:0,top:0,width:this.id==='board'?1000:240,height:this.id==='board'?700:242,right:1000,bottom:700};};
const fixture={id:'asset-1',width:6336,height:2688,mime:'image/png',thumbnail_url:'/thumb.png',metadata:{prompt:'A quiet coast\nBlue hour',model:'gemini-3-pro-image-preview',image_size:'2K',aspect_ratio:'21:9'}};
let revision=1,taskRecords=[];
w.fetch=async(path,opts={})=>{requests.push({path:String(path),opts});if(String(path).startsWith('https://'))throw Error('External network forbidden in UI test');if(path==='/api/workspace')return new Response(JSON.stringify(opts.method?{revision:++revision}:{revision,google_client_id:'',state:{items:[{id:'card-1',asset_id:fixture.id,x:80,y:80,label:'生成完成'}],view:{x:40,y:40,z:1}}}));if(path==='/api/assets')return new Response(JSON.stringify({assets:[fixture]}));if(path==='/api/preflight')return new Response(JSON.stringify({ready:true,key_valid:true}));if(String(path).startsWith('/api/tasks?'))return new Response(JSON.stringify({tasks:taskRecords,more:false,usage:{bytes:0}}));if(String(path).startsWith('/api/tasks/')){const task=taskRecords.find(t=>String(path).endsWith(t.id));return new Response(JSON.stringify(task?{task}:{error:'missing'}),{status:task?200:404,headers:{'Content-Type':'application/json'}});}if(path==='/api/generate')return new Promise(resolve=>pending.push(resolve));throw Error('Unexpected request '+path);};
const flush=()=>new Promise(r=>setTimeout(r,60));
try{
 w.eval(source.outputFiles[0].text);await flush();
 assert.equal(errors.length,0,errors.join('\n'));
 // Every historical binding survives the layout move.
 const app=await readFile('web/app.js','utf8');for(const [,id]of app.matchAll(/\$\('([^']+)'\)/g))assert.ok($(id),'missing binding '+id);
 const ids=[...w.document.querySelectorAll('[id]')].map(n=>n.id);assert.equal(new Set(ids).size,ids.length);
 assert.equal($('board').getAttribute('aria-busy'),'false');assert.equal(w.document.querySelectorAll('.card').length,1);
 assert.ok($('key').closest('#settings'));assert.ok($('google-client').closest('#settings'));assert.ok($('storage').closest('#settings'));assert.ok($('export-layout').closest('#settings'));
 assert.equal($('model').value,'gemini-3-pro-image-preview');assert.equal($('batch-count').value,'1');assert.equal($('key').value,'');
 taskRecords=[{id:'orphan-task',created_at:Date.now(),status:'succeeded',prompt:'Delivered stream was lost',model:'gemini-3-pro-image-preview',image_size:'1K',aspect_ratio:'1:1',request_id:'provider-request-1',recovery_url:'/api/tasks/orphan-task/recovery'}];$('history-open').click();await flush();assert.match($('history').textContent,/生成成功 · 可重新拉取/);assert.match($('history').textContent,/重新拉取图片/);assert.match($('history').textContent,/provider-request-1/);$('history-dialog').close();taskRecords=[];
 $('settings-open').click();assert.ok($('settings').open);$('tab-storage').click();assert.equal($('settings-storage').hidden,false);assert.equal($('settings-connections').hidden,true);
 $('tab-storage').dispatchEvent(new w.KeyboardEvent('keydown',{key:'ArrowRight',bubbles:true}));assert.equal($('tab-workspace').getAttribute('aria-selected'),'true');$('settings').close();
 $('panel-toggle').click();assert.equal($('panel-toggle').getAttribute('aria-expanded'),'false');$('panel-toggle').click();assert.equal($('panel-toggle').getAttribute('aria-expanded'),'true');
 const card=w.document.querySelector('.card');assert.equal(card.style.width,'260px');assert.equal(card.style.height,'110.3px');const brutal=await readFile('web/neo-brutal.css','utf8');assert.match(brutal,/\.card-image img\s*\{[^}]*object-fit:\s*cover/s);assert.match(brutal,/\.card-caption\s*\{[^}]*calc\(100% \+ 10px\)/s);assert.match(brutal,/\.card-tools\s*\{[^}]*calc\(100% \+ 10px\)/s);assert.match(brutal,/\.composer\s*\{[^}]*position:\s*absolute[^}]*left:\s*50%[^}]*bottom:\s*24px[^}]*translateX\(-50%\)/s);assert.match(brutal,/\/\* Prompt-first bottom dock[^]*?\.composer\s*\{[^}]*height:\s*auto[^}]*max-height:\s*none/s);assert.match(brutal,/#prompt\s*\{[^}]*resize:\s*vertical/s);assert.match(brutal,/#ref-preview\s*\{[^}]*display:\s*flex[^}]*flex-wrap:\s*wrap/s);assert.match(brutal,/@media \(max-width: 700px\)[\s\S]*\.composer\s*\{[^}]*position:\s*static/s);assert.ok($('generation-options'));assert.equal(w.document.querySelector('label[for=reference]'),null);assert.match($('empty-description').textContent,/在下方输入提示词/);$('size').value='4K';$('ratio').value='16:9';$('batch-count').value='3';$('size').dispatchEvent(new w.Event('input',{bubbles:true}));assert.equal($('parameter-summary').textContent,'4K · 16:9 · 3 张');card.dispatchEvent(new w.MouseEvent('dblclick',{button:0,bubbles:true}));await flush();assert.ok($('viewer').open);assert.equal($('editor').open,false);assert.match($('viewer-info').textContent,/缺少原图/);$('viewer').close();
 const more=card.querySelector('.card-tools button:last-child');more.dispatchEvent(new w.PointerEvent('pointerdown',{button:0,bubbles:true}));more.click();assert.equal($('context-menu').hidden,false);assert.equal(w.document.querySelector('.selection-actions').hidden,false);
 const reuse=[...$('context-menu').querySelectorAll('button')].find(b=>b.textContent.includes('载入生成参数'));reuse.click();await flush();assert.equal($('prompt').value,fixture.metadata.prompt);assert.equal($('size').value,'2K');assert.equal($('ratio').value,'21:9');
 // The Radix overflow menu remains keyboard-operable alongside the native canvas.
 const overflow=$('selection-more').querySelector('button');assert.ok(overflow);overflow.dispatchEvent(new w.KeyboardEvent('keydown',{key:'ArrowDown',bubbles:true}));await flush();assert.ok(w.document.querySelector('.dropdown-content'));const menuItem=w.document.querySelector('.dropdown-content [role=menuitem]');assert.ok(menuItem);menuItem.dispatchEvent(new w.KeyboardEvent('keydown',{key:'Escape',bubbles:true}));await flush();
 // The replacement color picker lives inside the native editor top layer.
 $('editor').showModal();const colorTrigger=$('color-control').querySelector('button');assert.ok(colorTrigger);colorTrigger.click();await flush();const colorPanel=$('editor').querySelector('[data-color-picker]');assert.ok(colorPanel);assert.equal($('edit-color').type,'hidden');const priorColor=$('edit-color').value;const hue=colorPanel.querySelector('.react-colorful__hue [role=slider]');assert.ok(hue);hue.dispatchEvent(new w.KeyboardEvent('keydown',{key:'ArrowRight',keyCode:39,bubbles:true}));await flush();assert.match($('edit-color').value,/^#[0-9a-f]{6}$/i);assert.notEqual($('edit-color').value,priorColor);colorPanel.querySelector('[aria-label="关闭颜色面板"]').click();await flush();
 // Real pointer handlers: direction, bounds, precision modifiers, cancellation and keyboard.
 const widthLabel=w.document.querySelector('[data-scrub="edit-width"]'),fontLabel=w.document.querySelector('[data-scrub="edit-font"]');
 const pointer=(el,type,x,extra={})=>el.dispatchEvent(new w.PointerEvent(type,{pointerId:7,isPrimary:true,button:0,clientX:x,bubbles:true,cancelable:true,...extra}));
 pointer(widthLabel,'pointerdown',100);pointer(widthLabel,'pointermove',140);assert.equal($('edit-width').value,'16');pointer(widthLabel,'pointerup',140);assert.equal(w.document.documentElement.classList.contains('numeric-scrubbing'),false);
 pointer(widthLabel,'pointerdown',100);pointer(widthLabel,'pointermove',104,{shiftKey:true});assert.equal($('edit-width').value,'26');pointer(widthLabel,'pointerup',104);
 pointer(widthLabel,'pointerdown',100);pointer(widthLabel,'pointermove',140,{altKey:true});assert.equal($('edit-width').value,'27');widthLabel.dispatchEvent(new w.KeyboardEvent('keydown',{key:'Escape',bubbles:true,cancelable:true}));assert.equal($('edit-width').value,'26');assert.ok($('editor').open);
 pointer(fontLabel,'pointerdown',100);pointer(fontLabel,'pointermove',-10000);assert.equal($('edit-font').value,'8');pointer(fontLabel,'pointermove',-9996);assert.equal($('edit-font').value,'9');pointer(fontLabel,'pointercancel',-9996);assert.equal($('edit-font').value,'48');
 fontLabel.dispatchEvent(new w.KeyboardEvent('keydown',{key:'End',bubbles:true}));assert.equal($('edit-font').value,'300');fontLabel.dispatchEvent(new w.KeyboardEvent('keydown',{key:'Home',bubbles:true}));assert.equal($('edit-font').value,'8');$('editor').close();assert.equal(w.document.documentElement.classList.contains('numeric-scrubbing'),false);
 // Drive shortcut opens the connection panel rather than sending an unauthenticated upload.
 card.querySelector('.card-tools button:nth-child(2)').click();await flush();assert.ok($('settings').open);assert.equal($('settings-connections').hidden,false);$('settings').close();
 assert.match($('drive-picker').textContent,/drive\.file/);$('drive-reference').click();await flush();assert.ok($('settings').open);assert.equal($('drive-picker').open,false);assert.match($('notice').textContent,/先连接 Google Drive/);$('settings').close();
 await $('form').onsubmit(new w.Event('submit',{cancelable:true}));await flush();assert.ok($('settings').open);assert.equal(pending.length,0);$('key').value='test-only-session-key';$('key').dispatchEvent(new w.Event('input',{bubbles:true}));await flush();assert.match($('key-state').textContent,/已填写/);$('settings').close();
 // The real submit/queue handlers accept a new batch while three original requests wait.
 $('batch-count').value='3';await $('form').onsubmit(new w.Event('submit',{cancelable:true}));await flush();assert.equal(pending.length,3,$('notice').textContent);assert.equal($('controls').disabled,false);
 $('prompt').value='Second batch';$('batch-count').value='1';await $('form').onsubmit(new w.Event('submit',{cancelable:true}));await flush();assert.equal(pending.length,3,$('notice').textContent);assert.match($('queue-status').textContent,/等待 1/);assert.equal($('controls').disabled,false);
 $('stop').click();await flush();assert.match($('queue-status').textContent,/等待 0/);assert.equal(pending.length,3,$('notice').textContent);
 for(const resolve of pending)resolve(new Response(JSON.stringify({task:{status:'failed',error_message:'Simulated failure'}}),{headers:{'Content-Type':'application/json'}}));await flush();await flush();assert.match($('queue-status').textContent,/最多 3/);
 assert.equal(errors.length,0,errors.join('\n'));
 assert.equal(requests.filter(r=>r.path==='/api/generate').length,3);
 assert.equal(requests.filter(r=>r.path==='/api/preflight').length,2);for(const r of requests.filter(r=>!['/api/generate','/api/preflight'].includes(r.path)))assert.ok(!String(r.opts.body||'').includes('test-only-session-key'));
 $('clear-key').click();assert.equal($('key').value,'');
 console.log('PASS: full frontend DOM smoke: stable bindings, delivery-aware history, settings tabs, collapse, double-click viewer, card actions, parameter reuse, ephemeral key, concurrent submission and pending cancellation. Simulated DOM/API only; no network or billing.');
}finally{await w.happyDOM.abort();w.close();}
