export class TaskQueue{
 constructor({limit=3,run,onChange=()=>{},onCancel=()=>{},onError=()=>{}}){this.limit=limit;this.run=run;this.onChange=onChange;this.onCancel=onCancel;this.onError=onError;this.pending=[];this.running=new Map();}
 get size(){return this.pending.length+this.running.size;}
 add(items){this.pending.push(...items);this.onChange();this.drain();}
 cancel(batchId=null){const removed=this.pending.filter(i=>batchId===null||i.batch.id===batchId);this.pending=this.pending.filter(i=>!removed.includes(i));for(const i of removed)this.onCancel(i);this.onChange();return removed.length;}
 drain(){while(this.running.size<this.limit&&this.pending.length){const item=this.pending.shift();this.running.set(item.id,item);this.onChange();Promise.resolve().then(()=>this.run(item)).catch(e=>this.onError(e,item)).finally(()=>{this.running.delete(item.id);this.onChange();this.drain();});}}
}
