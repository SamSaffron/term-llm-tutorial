import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mountLaunchChoice,startProvider} from '../public/launch-choice.mjs';
import {mountImagePanel} from '../public/image-panel.mjs';

// DOM/worker fixtures test control flow only; real inference is verified by the
// shared-browser harness, never by these synthetic worker replies.
function fixture(){
 const elements=new Map();
 const $=id=>{
  if(!elements.has(id))elements.set(id,{value:id==='launch-mode'?'text':'',checked:false,hidden:false,disabled:false,
   listeners:{},addEventListener(name,fn){this.listeners[name]=fn;},append(child){child.parent=this;},removeAttribute(){}});
  return elements.get(id);
 };
 const change=id=>$(id).listeners.change?.();
 return {$,change};
}
test('default text launch is unchanged and neither selection nor consent downloads images',async()=>{
 const {$,change}=fixture(),choice=mountLaunchChoice($),calls=[];
 assert.equal(choice.mode,'text');assert.equal(choice.allowed,true);assert.equal($('boot').disabled,false);
 await startProvider(choice.mode,{startText:()=>calls.push('text'),startImages:()=>calls.push('images')});
 assert.deepEqual(calls,['text']);
 $('launch-mode').value='images';change('launch-mode');
 assert.equal(choice.allowed,false);assert.equal($('boot').disabled,true);
 assert.equal($('image-consent-label').parent,$('launch-image-consent'));
 $('image-consent').checked=true;change('image-consent');
 assert.equal(choice.allowed,true);assert.deepEqual(calls,['text']);
});
test('images-first skips all text providers and retains the single consent through boot',async()=>{
 const {$,change}=fixture(),choice=mountLaunchChoice($);
 $('launch-mode').value='images';change('launch-mode');$('image-consent').checked=true;change('image-consent');
 choice.start();assert.equal(choice.allowed,false);assert.equal($('launch-mode').disabled,true);
 assert.equal($('image-consent-label').parent,$('panel-image-consent'));
 let images=0;
 await startProvider(choice.mode,{startText:()=>assert.fail('No Qwen or Simulator load'),startImages:()=>images++});
 assert.equal(images,1);assert.equal($('image-consent').checked,true);
 // Shutdown resets consent in the panel before resetting the gate.
 $('image-consent').checked=false;choice.reset();assert.equal(choice.allowed,false);
 assert.equal($('image-consent-label').parent,$('launch-image-consent'));
 $('launch-mode').value='text';change('launch-mode');assert.equal(choice.allowed,true);
 assert.equal($('image-consent-label').parent,$('panel-image-consent'));
});
test('panel refuses unconsented/duplicate enables; releases images before text and resets consent',async()=>{
 const {$}=fixture(),order=[];const oldDocument=globalThis.document,oldWorker=globalThis.Worker;
 globalThis.document={getElementById:$};
 globalThis.Worker=class {
  constructor(){order.push('image worker');}
  postMessage(m){queueMicrotask(()=>this.onmessage({data:{id:m.id,result:{ready:true}}}));}
  terminate(){order.push('terminate image');}
 };
 try{
  const panel=mountImagePanel({textBusy:()=>false,suspendText:()=>order.push('suspend text'),resumeText:async()=>order.push('load selected text'),textLabel:()=> 'Qwen3 8B'});
  await panel.enable();assert.deepEqual(order,[]);
  $('image-consent').checked=true;await Promise.all([panel.enable(),panel.enable()]);
  assert.deepEqual(order,['suspend text','image worker']);assert.equal(panel.blocksText,true);
  await $('image-text').onclick();assert.deepEqual(order.slice(-2),['terminate image','load selected text']);
  assert.equal(panel.blocksText,false);panel.reset();assert.equal($('image-consent').checked,false);
 }finally{globalThis.document=oldDocument;globalThis.Worker=oldWorker;}
});
