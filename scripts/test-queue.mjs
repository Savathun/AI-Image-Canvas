import assert from 'node:assert/strict';
import {TaskQueue} from '../web/task-queue.js';
import {Board} from '../web/canvas.js';
const tick=()=>new Promise(r=>setImmediate(r));const started=[],cancelled=[],done=new Map();
const queue=new TaskQueue({limit:3,run:item=>{started.push(item.id);return new Promise((resolve,reject)=>done.set(item.id,{resolve,reject}));},onCancel:i=>cancelled.push(i.id)});
const batch={id:'a'},b={id:'b'};queue.add([1,2,3,4].map(id=>({id,batch})));await tick();assert.deepEqual(started,[1,2,3]);queue.add([{id:5,batch:b}]);assert.equal(queue.pending.length,2);done.get(1).resolve();await tick();assert.deepEqual(started,[1,2,3,4]);assert.equal(queue.running.size,3);assert.equal(queue.cancel('b'),1);assert.deepEqual(cancelled,[5]);for(const id of [2,3,4])done.get(id).resolve();await tick();assert.equal(queue.size,0);
queue.add([{id:6,batch:b}]);await tick();assert.ok(started.includes(6));done.get(6).resolve();await tick();assert.equal(queue.size,0);
// Clicks must remain targeted to the image card; capture starts only on an actual drag.
let captured=0;const fake={el:{focus(){},setPointerCapture(){captured++;}},point:(x,y)=>({x,y}),selected:new Set(),items:[{id:'image',x:0,y:0}],paintSelection(){},snapshot(){},position(){},mode:'select',space:false};
const event={button:0,pointerId:1,clientX:10,clientY:10,preventDefault(){},target:{closest:()=>({dataset:{id:'image'}})}};
Board.prototype.down.call(fake,event);assert.equal(captured,0);Board.prototype.move.call(fake,{...event,clientX:12});assert.equal(captured,0);Board.prototype.move.call(fake,{...event,clientX:30});assert.equal(captured,1);
console.log('PASS: concurrent task queue accepts new work, advances and releases slots, cancels only waiting work; click preserves image target until drag threshold. No browser / billing.');
