import React,{useState,useEffect} from 'react';
import {createRoot} from 'react-dom/client';
import * as Popover from '@radix-ui/react-popover';
import {HexColorPicker} from 'react-colorful';
import {icon} from './icons.js';

export function bindScrubber(label,input){
 let drag=null;
 const limits=()=>({min:Number(input.min),max:Number(input.max),step:Number(input.step)||1});
 const emit=type=>input.dispatchEvent(new Event(type,{bubbles:true}));
 const write=value=>{const {min,max,step}=limits();const next=Math.max(min,Math.min(max,Math.round(value/step)*step));if(String(next)!==input.value){input.value=String(next);emit('input');}return next;};
 const finish=(cancel=false)=>{if(!drag)return;const old=drag;drag=null;if(cancel)write(old.start);if(input.value!==String(old.start)||cancel)emit('change');label.classList.remove('scrubbing');document.documentElement.classList.remove('numeric-scrubbing');if(label.hasPointerCapture?.(old.id))label.releasePointerCapture(old.id);};
 label.addEventListener('pointerdown',e=>{if(e.button!==0||e.isPrimary===false||drag||input.disabled)return;e.preventDefault();label.focus();const {min,max}=limits(),n=Number(input.value);drag={id:e.pointerId,x:e.clientX,start:Number.isFinite(n)?Math.max(min,Math.min(max,n)):min,value:Number.isFinite(n)?Math.max(min,Math.min(max,n)):min};label.setPointerCapture(e.pointerId);label.classList.add('scrubbing');document.documentElement.classList.add('numeric-scrubbing');});
 label.addEventListener('pointermove',e=>{if(!drag||e.pointerId!==drag.id)return;e.preventDefault();const {min,max,step}=limits();drag.value=Math.max(min,Math.min(max,drag.value+(e.clientX-drag.x)/4*step*(e.shiftKey?10:e.altKey?0.1:1)));drag.x=e.clientX;write(drag.value);});
 label.addEventListener('pointerup',e=>{if(e.pointerId===drag?.id)finish();});
 label.addEventListener('pointercancel',()=>finish(true));label.addEventListener('lostpointercapture',()=>finish());
 // Capture Escape before the native editing dialog can close or apply its own shortcuts.
 label.addEventListener('keydown',e=>{if(e.key==='Escape'&&drag){e.preventDefault();e.stopPropagation();finish(true);return;}const {min,max,step}=limits();let value;if(e.key==='ArrowLeft'||e.key==='ArrowDown')value=Number(input.value)-step*(e.shiftKey?10:1);if(e.key==='ArrowRight'||e.key==='ArrowUp')value=Number(input.value)+step*(e.shiftKey?10:1);if(e.key==='Home')value=min;if(e.key==='End')value=max;if(value!==undefined){e.preventDefault();e.stopPropagation();write(value);emit('change');}});
 window.addEventListener('blur',()=>finish());label.closest('dialog')?.addEventListener('close',()=>finish());
}

export function mountEditorControls(){
 document.querySelectorAll('[data-scrub]').forEach(label=>bindScrubber(label,document.getElementById(label.dataset.scrub)));
 const field=document.getElementById('edit-color'),dialog=document.getElementById('editor'),h=React.createElement;
 function ColorControl(){
  const [color,setColor]=useState(field.value),[hex,setHex]=useState(field.value),[open,setOpen]=useState(false),[error,setError]=useState('');
  const update=value=>{if(!/^#[0-9a-f]{6}$/i.test(value))return;const next=value.toLowerCase();setColor(next);setHex(next);field.value=next;field.dispatchEvent(new Event('input',{bubbles:true}));field.dispatchEvent(new Event('change',{bubbles:true}));setError('');};
  useEffect(()=>{const close=()=>setOpen(false);dialog.addEventListener('close',close);return()=>dialog.removeEventListener('close',close);},[]);
  const changeOpen=value=>{setOpen(value);setHex(field.value);setColor(field.value);setError('');};
  const eyedropper=async()=>{try{const result=await new window.EyeDropper().open();update(result.sRGBHex);}catch(e){if(e.name!=='AbortError')setError('无法取色，请在色板中选择。');}};
  return h(Popover.Root,{open,onOpenChange:changeOpen},
   h(Popover.Trigger,{className:'color-trigger','aria-label':'标注颜色 '+color,title:'标注颜色'},h('span',{className:'color-swatch',style:{backgroundColor:color}})),
   h(Popover.Portal,{container:dialog},h(Popover.Content,{className:'color-popover','data-color-picker':'',side:'bottom',align:'start',sideOffset:8,collisionPadding:16,'aria-label':'选择标注颜色',onEscapeKeyDown:e=>e.stopPropagation()},
    h('div',{className:'color-heading'},h('h3',null,'标注颜色'),h(Popover.Close,{className:'icon-button ghost','aria-label':'关闭颜色面板',title:'关闭'},h('span',{ref:n=>{if(n&&!n.firstChild)n.append(icon('x'));}}))),
    h(HexColorPicker,{color,onChange:update,'aria-label':'选择色域与色相'}),
    h('div',{className:'color-hex-row'},h('label',{htmlFor:'edit-color-hex'},'HEX'),h('input',{id:'edit-color-hex',className:'mono',value:hex,maxLength:7,spellCheck:false,autoComplete:'off',onChange:e=>{const text=e.target.value;setHex(text);update(text);},onBlur:()=>setHex(color),onKeyDown:e=>{if(e.key==='Enter'){e.preventDefault();setHex(color);}}}),window.EyeDropper?h('button',{className:'icon-button ghost',type:'button',title:'吸取屏幕颜色','aria-label':'吸取屏幕颜色',onClick:eyedropper},h('span',{ref:n=>{if(n&&!n.firstChild)n.append(icon('pipette'));}})):null),
    error?h('p',{className:'hint',role:'status'},error):null
   )));
 }
 createRoot(document.getElementById('color-control')).render(h(ColorControl));
}
