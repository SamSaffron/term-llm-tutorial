import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mountLaunchChoice,startProvider} from '../public/launch-choice.mjs';
import {mountImagePanel} from '../public/image-panel.mjs';

// DOM/worker fixtures test control flow only; real inference is verified by the
// shared-browser harness, never by these synthetic worker replies.
function fixture(){
 const elements=new Map();
 const $=id=>{
  if(!elements.has(id))elements.set(id,{value:id==='image-support'?'off':id==='model'?'qwen':'',checked:false,hidden:false,disabled:false,
   listeners:{},addEventListener(name,fn){this.listeners[name]=fn;},append(child){child.parent=this;},removeAttribute(){}});
  return elements.get(id);
 };
 const change=id=>$(id).listeners.change?.();
 return {$,change};
}
test('independent selections: default text boot and Janus preparation never imply consent',async()=>{
 const {$,change}=fixture(),choice=mountLaunchChoice($),calls=[];
 assert.equal(choice.imageSupport,'off');assert.equal(choice.allowed,true);
 assert.equal($('image-size-hint').hidden,true);
 for(const model of ['qwen','bonsai','simulator']){
  $('model').value=model;
  for(const support of ['off','demo','janus']){
   $('image-support').value=support;change('image-support');
   assert.equal($('model').value,model);assert.equal(choice.allowed,true);
   assert.equal($('image-consent').checked,false);
   await startProvider(choice.imageSupport,{startText:()=>calls.push(model),prepareImages:()=>calls.push('prepare')});
   assert.equal($('image-size-hint').hidden,support!=='janus');
  }
 }
 assert.deepEqual(calls,['qwen','qwen','prepare','bonsai','bonsai','prepare','simulator','simulator','prepare']);
 choice.start();assert.equal(choice.allowed,false);assert.equal($('image-support').disabled,true);
 assert.equal(choice.imageSupport,'janus');assert.equal($('model').value,'simulator');
 choice.reset();assert.equal(choice.allowed,true);assert.equal($('image-support').disabled,false);
});
test('Janus preparation opens existing consent controls without a worker and permits Reload text',async()=>{
 const {$}=fixture(),order=[],oldDocument=globalThis.document;
 globalThis.document={getElementById:$};
 try{
  const panel=mountImagePanel({textBusy:()=>false,suspendText:()=>assert.fail('no model to release'),resumeText:async()=>order.push('selected LLM'),textLabel:()=> 'Qwen3 8B',selectProvider:async()=>{}});
  panel.prepare();assert.equal(panel.state,'off');assert.equal(panel.blocksText,true);
  assert.equal($('image-panel').open,true);assert.equal($('image-enable').disabled,true);
  assert.equal($('image-text').disabled,false);
  await panel.enable();assert.equal(panel.state,'off');
  await $('image-text').onclick();assert.deepEqual(order,['selected LLM']);assert.equal(panel.blocksText,false);
 }finally{globalThis.document=oldDocument;}
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
  const panel=mountImagePanel({textBusy:()=>false,suspendText:()=>order.push('suspend text'),resumeText:async()=>order.push('load selected text'),textLabel:()=> 'Qwen3 8B',selectProvider:async provider=>{assert.equal(provider,'janus');order.push('configure Janus');}});
  await panel.enable();assert.deepEqual(order,[]);
  $('image-consent').checked=true;await Promise.all([panel.enable(),panel.enable()]);
  assert.deepEqual(order,['suspend text','configure Janus','image worker']);assert.equal(panel.blocksText,true);
  await $('image-text').onclick();assert.deepEqual(order.slice(-2),['terminate image','load selected text']);
  assert.equal(panel.blocksText,false);panel.reset();assert.equal($('image-consent').checked,false);
 }finally{globalThis.document=oldDocument;globalThis.Worker=oldWorker;}
});
