import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {ImageGenerator} from '../public/image-generator.mjs';
import {imageRequest,mulberry32,IMAGE_REVISION,IMAGE_DTYPE,IMAGE_DEVICE} from '../public/image-model.mjs';
function fixture(){
 const workers=[];
 const images=new ImageGenerator({createWorker:()=>{const w={terminated:false,postMessage(m){this.request=m;},terminate(){this.terminated=true;},reply(result){this.onmessage({data:{id:this.request.id,result}});}};workers.push(w);return w;}});
 return {images,workers};
}
test('no worker or image runtime before affirmative consent; reset terminates and rejects load',async()=>{
 const {images,workers}=fixture();assert.equal(workers.length,0);
 await assert.rejects(images.load(false),/consent/);assert.equal(workers.length,0);
 const load=images.load(true);assert.equal(images.state,'loading');images.reset('Canceled');await assert.rejects(load,/Canceled/);assert.equal(workers[0].terminated,true);assert.equal(images.state,'off');
});
test('image generation serializes, preserves metadata, unloads on failure and can reload',async()=>{
 const {images,workers}=fixture();let load=images.load(true);workers[0].reply({ready:true});await load;
 const job=images.generate({prompt:'a pelican',seed:1});assert.equal(images.state,'generating');await assert.rejects(images.generate({prompt:'another'}),/enable Janus/);
 workers[0].reply({prompt:'a pelican',seed:1,blob:new Blob()});assert.equal((await job).seed,1);assert.equal(images.state,'ready');
 const failed=images.generate({prompt:'a pelican'});workers[0].onmessage({data:{id:workers[0].request.id,error:'GPU lost'}});await assert.rejects(failed,/GPU lost/);assert.equal(images.state,'off');assert.ok(workers[0].terminated);
 load=images.load(true);workers[1].reply({ready:true});await load;images.reset();
});
test('stale canceled load does not reset a new worker',async()=>{
 const {images,workers}=fixture();const old=images.load(true);images.reset();const next=images.load(true);await assert.rejects(old);assert.equal(workers[1].terminated,false);workers[1].reply({ready:true});await next;images.reset();
});
test('seed bounds and proven configuration are explicit',()=>{
 for(const seed of [-1,4294967296,1.2,'1'])assert.throws(()=>imageRequest({prompt:'x',seed}),/Seed/);
 assert.throws(()=>imageRequest({prompt:' '}));assert.throws(()=>imageRequest({prompt:'x'.repeat(2001)}));
 assert.equal(imageRequest({prompt:' x ',seed:0}).prompt,'x');const a=mulberry32(1),b=mulberry32(1);assert.deepEqual(Array.from({length:576},a),Array.from({length:576},b));
 assert.match(IMAGE_REVISION,/^[a-f0-9]{40}$/);assert.equal(IMAGE_DTYPE.language_model,'q4');assert.equal(IMAGE_DEVICE.prepare_inputs_embeds,'wasm');
});
test('license consent and separate canned command are present; pinned runtime is lazy',async()=>{
 const html=await readFile('public/index.html','utf8');assert.match(html,/§5 and all Attachment A/);assert.match(html,/href="\/" class="wordmark"/);assert.match(html,/term-llm image cat/);
 const worker=await readFile('public/image-worker.mjs','utf8');assert.match(worker,/await import\('\.\/image-runtime\/transformers.min.js'\)/);assert.doesNotMatch(worker,/transformers.web|revision:'main'/);
 const build=await readFile('scripts/build.mjs','utf8');assert.match(build,/external:\['\.\/image-runtime/);
});
