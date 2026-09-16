import {mountEditorControls} from './editor-controls.js';
import React from 'react';
import {createRoot} from 'react-dom/client';
import * as Menu from '@radix-ui/react-dropdown-menu';
import {icon,iconButton,hydrateIcons,actionIcons,stateIcons} from './icons.js';
const $=id=>document.getElementById(id);
export function mountOverflow(onAction){
 const root=createRoot($('selection-more')),h=React.createElement;
 const items=[['裁切 / 标注','edit'],['载入生成参数','params'],['恢复原图','restore'],['移出画布','remove']];
 function MenuIcon({name}){return h('span',{ref:node=>{if(node&&!node.firstChild)node.append(icon(name));},className:'status-icon'});}
 root.render(h(Menu.Root,null,h(Menu.Trigger,{className:'icon-button ghost','aria-label':'更多图片操作',title:'更多操作'},h(MenuIcon,{name:'more'})),h(Menu.Portal,null,h(Menu.Content,{className:'dropdown-content',side:'top',align:'end',sideOffset:8,collisionPadding:8,onCloseAutoFocus:e=>{if(document.querySelector('dialog[open]'))e.preventDefault();}},...items.map(([label,key])=>h(Menu.Item,{key,className:'menu-item'+(key==='remove'?' danger':''),onSelect:()=>onAction(key)},h(MenuIcon,{name:actionIcons[key]}),label))))));
}
export function revealComposer(){if(document.querySelector('.workspace').classList.contains('panel-collapsed'))$('panel-toggle').click();}
export function settingsTab(name){document.querySelectorAll('[data-settings-tab]').forEach(b=>{const active=b.dataset.settingsTab===name;b.setAttribute('aria-selected',String(active));b.tabIndex=active?0:-1;$('settings-'+b.dataset.settingsTab).hidden=!active;});}
export function setupUI({onAction,isDriveConnected}){
 hydrateIcons();mountOverflow(onAction);mountEditorControls();
 $('panel-toggle').onclick=()=>{const collapsed=document.querySelector('.workspace').classList.toggle('panel-collapsed');$('panel-toggle').setAttribute('aria-expanded',String(!collapsed));$('panel-toggle').setAttribute('aria-label',collapsed?'展开生成面板':'收起生成面板');};
 $('connection-open').onclick=()=>{settingsTab('connections');$('settings-open').click();};
 document.querySelectorAll('[data-settings-tab]').forEach((b,n,all)=>{b.onclick=()=>settingsTab(b.dataset.settingsTab);b.onkeydown=e=>{let index;if(e.key==='ArrowRight')index=(n+1)%all.length;if(e.key==='ArrowLeft')index=(n+all.length-1)%all.length;if(e.key==='Home')index=0;if(e.key==='End')index=all.length-1;if(index!==undefined){e.preventDefault();all[index].click();all[index].focus();}};});
 document.querySelectorAll('label[role=button]').forEach(label=>label.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();$(label.htmlFor).click();}});
 $('notice-close').onclick=()=>{$('notice-wrap').hidden=true;};
 let noticeTimer;new MutationObserver(()=>{if(!$('notice').textContent)return;$('notice-wrap').hidden=false;clearTimeout(noticeTimer);if(!$('notice').classList.contains('error'))noticeTimer=setTimeout(()=>{$('notice-wrap').hidden=true;},9000);}).observe($('notice'),{childList:true,subtree:true,attributes:true,attributeFilter:['class']});
 const updateConnection=()=>{const key=!!$('key').value.trim(),connected=isDriveConnected(),error=!$('drive-diagnostic').hidden;$('key-state').textContent=key?'已填写 · 本次页面':'未设置';$('key-state').dataset.state=key?'connected':'idle';$('drive-badge').textContent=error?'连接异常':connected?'Connected':'未连接';$('drive-badge').dataset.state=error?'error':connected?'connected':'idle';$('connection-summary').textContent=error?'连接异常':key&&connected?'Connected':key?'API 已填写':connected?'Drive 已连接':'设置连接';$('connection-open').dataset.state=error?'error':connected?'connected':'idle';$('drive-check').disabled=!connected;$('drive-disconnect').disabled=!connected;};
 $('key').addEventListener('input',updateConnection);$('clear-key').addEventListener('click',updateConnection);window.addEventListener('pageshow',updateConnection);$('settings').addEventListener('close',updateConnection);
 new MutationObserver(updateConnection).observe($('drive-status'),{childList:true,subtree:true});new MutationObserver(updateConnection).observe($('drive-diagnostic'),{attributes:true,attributeFilter:['hidden']});
 window.addEventListener('focus',updateConnection);setInterval(updateConnection,30000);updateConnection();
 new MutationObserver(()=>{$('sync-state').dataset.state=/冲突|未同步/.test($('sync-state').textContent)?'error':'idle';}).observe($('sync-state'),{childList:true});
 const menu=$('context-menu');menu.addEventListener('keydown',e=>{const buttons=[...menu.querySelectorAll('button')],n=buttons.indexOf(document.activeElement);if(e.key==='Escape'){menu.hidden=true;$('board').focus();}if(['ArrowDown','ArrowUp','Home','End'].includes(e.key)){e.preventDefault();const next=e.key==='Home'?0:e.key==='End'?buttons.length-1:(n+(e.key==='ArrowDown'?1:-1)+buttons.length)%buttons.length;buttons[next]?.focus();}});
 document.querySelectorAll('.editor-tools [data-tool]').forEach(b=>b.prepend(icon(b.dataset.tool)));$('edit-undo').prepend(icon('undo'));$('edit-redo').prepend(icon('redo'));
 for(const [id,name] of [['viewer-fit','maximize'],['viewer-actual','view'],['viewer-close','x'],['edit-close','x']])$(id).prepend(icon(name));
 $('empty-retry').onclick=()=>$('reload').click();
}
export function renderQueue(items,focus){const list=$('queue-list');list.replaceChildren();if(!items.length){const empty=document.createElement('div');empty.className='queue-empty';empty.append(icon('inbox'),document.createTextNode('暂无任务'));list.append(empty);return;}
 for(const item of items){const row=document.createElement('div');row.className='queue-item';row.dataset.state=item.state;const s=document.createElement('span');s.className='status-icon';s.append(icon(stateIcons[item.state],item.state==='generating'?'spin':''));const copy=document.createElement('div');copy.className='queue-copy';const title=document.createElement('p');title.className='queue-prompt';title.textContent=item.prompt||'图片任务';title.title=title.textContent;const meta=document.createElement('p');meta.className='metadata';meta.textContent=item.label;copy.append(title,meta);const show=iconButton('view','定位图片',()=>focus(item.id));show.className='icon-button ghost';row.append(s,copy,show);list.append(row);}}
export function setEmpty(state){$('board').setAttribute('aria-busy',String(state==='loading'));$('empty-title').textContent=state==='error'?'画布暂时无法载入':state==='loading'?'正在载入画布':'从一张图片开始';$('empty-description').textContent=state==='error'?'检查连接后重新载入':state==='loading'?'同步图片与布局':'在下方输入提示词，或将图片拖入画布';$('empty-retry').hidden=state!=='error';}
