import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mountLaunchChoice} from '../public/launch-choice.mjs';
import {confirmJanus} from '../public/janus-consent.mjs';
import {SessionModels} from '../public/session-models.mjs';

test('launch choice locks until shutdown, without treating selection as consent',()=>{
 const elements=new Map();const $=id=>{if(!elements.has(id))elements.set(id,{value:'off',addEventListener(){}});return elements.get(id);};
 const choice=mountLaunchChoice($);$('image-support').value='janus';assert.equal(choice.imageSupport,'janus');
 choice.start();assert.equal(choice.allowed,false);assert.equal($('image-support').disabled,true);
 choice.reset();assert.equal(choice.allowed,true);
});
test('consent modal explicitly accepts or goes back; Escape never consents',async()=>{
 const accept={},back={},dialog={querySelector:s=>s==='[data-accept]'?accept:back,showModal(){this.open=true;},close(){this.open=false;}};back.focus=()=>{};
 let promise=confirmJanus(dialog);assert.equal(dialog.open,true);back.onclick();assert.equal(await promise,false);
 promise=confirmJanus(dialog);dialog.oncancel({preventDefault(){}});assert.equal(await promise,false);
 promise=confirmJanus(dialog);accept.onclick();assert.equal(await promise,true);assert.equal(dialog.open,false);
});
test('fixed providers serialize residency and automatically restore the same selected models',async()=>{
 const events=[],resident=new Set();
 const backend=name=>({ready:()=>resident.has(name),unload:()=>{resident.delete(name);},load:async()=>{assert.equal(resident.size,0);resident.add(name);events.push('load '+name);}});
 const models=new SessionModels({text:backend('Bonsai'),images:backend('Janus')});
 await Promise.all([models.run('images',async()=>events.push('image 1')),models.run('text',async()=>events.push('text')),models.run('images',async()=>events.push('image 2'))]);
 assert.deepEqual(events,['load Janus','image 1','load Bonsai','text','load Janus','image 2']);
 await models.run('images',async()=>events.push('image 3'));assert.equal(events.filter(e=>e==='load Janus').length,2);
 models.reset();assert.equal(resident.size,0);
});
test('shutdown invalidates queued requests and does not revive an old session',async()=>{
 let finish;const loading=new Promise(resolve=>finish=resolve);let called=false;
 const models=new SessionModels({images:{ready:()=>false,unload(){},load:()=>loading}});
 const first=models.run('images',async()=>{called=true;});const queued=models.run('images',async()=>{called=true;});
 await Promise.resolve();models.reset();finish();
 await assert.rejects(first,/Session stopped/);await assert.rejects(queued,/Session stopped/);assert.equal(called,false);
});
test('failed requests never substitute providers; the same backend can retry',async()=>{
 let count=0;const models=new SessionModels({images:{ready:()=>false,unload(){},load:async()=>{count++;throw Error('Janus unavailable');}}});
 await assert.rejects(models.run('images',()=>assert.fail()),/Janus unavailable/);
 await assert.rejects(models.run('images',()=>assert.fail()),/Janus unavailable/);assert.equal(count,2);
});
