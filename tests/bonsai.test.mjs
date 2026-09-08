import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {validateTools,parseToolCall} from 'bitgpu/chat';
import {sha256} from '@noble/hashes/sha2.js';
import {bitgpuRequest,bitgpuResponse,checkBonsaiBudget} from '../public/bonsai-adapter.mjs';
import {BONSAI_MODEL,BONSAI_ASSETS,verifyBonsaiCapabilities} from '../public/bonsai-model.mjs';
import {bonsaiDownloads} from '../public/bonsai-downloads.mjs';
import {bonsaiWorker} from '../public/bonsai-runtime.mjs';
const tool={type:'function',function:{name:'read_file',description:'Read a guest file',parameters:{type:'object',properties:{path:{type:'string'}},required:['path'],additionalProperties:false}}};
const req={messages:[{role:'user',content:'Read notes.txt'}],tools:[tool]};
const raw={text:'',toolCalls:[{name:'read_file',arguments:{path:'notes.txt'}}],tokens:[1,2],inputTokenIds:[3,4,5],finishReason:'tool_calls'};
const caps=context=>({activation:'f32',kvCache:'q8',maxSeqLen:context,overflow:'error'});
test('Bonsai preserves request, native schemas and full function history; production defaults match eval',()=>{
 const request={...req,tool_choice:{type:'function',function:{name:'read_file'}},messages:[...req.messages,{role:'assistant',content:null,tool_calls:[{id:'old',type:'function',function:{name:'read_file',arguments:'{"path":"notes.txt"}'}}]},{role:'tool',tool_call_id:'old',content:'Museum'}]};
 const original=structuredClone(request),a=bitgpuRequest(request);
 assert.deepEqual(a.options,{maxTokens:2048,temperature:0,seed:42,topK:20,topP:.9,minP:0,repetitionPenalty:1,presencePenalty:0,think:false,reuseCache:false,tools:[tool],toolChoice:{name:'read_file'}});
 assert.deepEqual(a.messages[1],{role:'assistant',content:'',tool_calls:[{name:'read_file',arguments:'{"path":"notes.txt"}'}]});
 validateTools(a.options.tools,a.options.toolChoice);a.options.tools[0].function.name='changed';assert.deepEqual(request,original);
 assert.equal(bitgpuRequest({...req,max_completion_tokens:33,max_tokens:99,temperature:.2,seed:9,top_p:.8,stop:'END'}).options.maxTokens,33);
 assert.deepEqual(bitgpuRequest({...req,tool_choice:'required'}).options.toolChoice,{name:'read_file'});
});
test('Bonsai fails closed on unsupported choices, schemas, multimodal, request controls and limits',()=>{
 for(const request of [
  {...req,tools:[tool,{...tool,function:{...tool.function,name:'other'}}],tool_choice:'required'},
  {...req,tools:[],tool_choice:'required'}, {...req,tool_choice:{type:'function',function:{name:'missing'}}},
  {...req,tool_choice:'bogus'}, {...req,messages:[{role:'user',content:[{type:'image_url',image_url:{url:'x'}}]}]},
  {...req,messages:[{role:'user',content:'hi',audio:{}}]}, {...req,response_format:{type:'json_object'}},
  {...req,parallel_tool_calls:false}, {...req,n:2}, {...req,max_tokens:0}, {...req,max_tokens:16384}, {...req,max_tokens:1.5},
  {...req,stop:[5]}, {...req,chat_template_kwargs:{other:true}}, {...req,temperature:NaN},
 ])assert.throws(()=>bitgpuRequest(request));
 const unsupported=structuredClone(tool);unsupported.function.parameters.properties.path.pattern='abc';
 assert.throws(()=>validateTools([unsupported],'auto'),/pattern/);
});
test('Bonsai native tool parsing returns only complete declared calls with OpenAI usage',()=>{
 const native=parseToolCall('{"name":"read_file","arguments":{"path":"notes.txt"}}');
 const out=bitgpuResponse({...raw,toolCalls:[native]},BONSAI_MODEL,7,req);
 assert.deepEqual(out.choices[0].message.tool_calls,[{id:'call_7_0',type:'function',function:{name:'read_file',arguments:'{"path":"notes.txt"}'}}]);
 assert.deepEqual(out.usage,{prompt_tokens:3,completion_tokens:2,total_tokens:5});
 for(const bad of [{...raw,toolCalls:[parseToolCall('{"name":')]},{...raw,finishReason:'abort'},{...raw,toolCalls:[{name:'exec',arguments:{}}]},{...raw,text:'<tool_call>bad'},{...raw,toolCalls:[]}])assert.throws(()=>bitgpuResponse(bad,BONSAI_MODEL,1,req));
 assert.throws(()=>bitgpuResponse(raw,BONSAI_MODEL,1,{...req,tool_choice:'none'}));
 assert.throws(()=>bitgpuResponse({...raw,toolCalls:[],finishReason:'length'},BONSAI_MODEL,1,{...req,tool_choice:'required'}));
});
test('Bonsai verifies active GPU settings and exact native token budget for every context',()=>{
 for(const context of [4096,8192,16384]){
  assert.deepEqual(verifyBonsaiCapabilities(caps(context),context),caps(context));
  for(const c of [{...caps(context),activation:'f16'},{...caps(context),kvCache:'f32'},{...caps(context),maxSeqLen:1},{...caps(context),overflow:'sinks'}])assert.throws(()=>verifyBonsaiCapabilities(c,context));
  const a=bitgpuRequest(req,context);
  assert.equal(checkBonsaiBudget({countTokens:()=>context-2048},a,context),context-2048);
  assert.throws(()=>checkBonsaiBudget({countTokens:()=>context-2047},a,context),/no history was truncated/);
 }
});
test('Bonsai worker load/complete/busy/device-loss/errors and no-GPU no-download protocol',async()=>{
 const events=[];let opts,resets=0,sends=0,disposed=0;
 const downloads={fetchJson(){},fetchArrayBuffer(){},fetchStream(){},settled:async()=>{}};
 const worker=bonsaiWorker({downloads,post:e=>events.push(e),gpuAvailable:()=>true,validateTools,createEngine:async o=>{opts=o;return {capabilities:caps(o.maxSeqLen),dispose(){disposed++;}};},createChat:async()=>({countTokens:()=>20,reset(){resets++;},send:async()=>{sends++;return raw;}})});
 const call=(id,type,request)=>worker({data:{id,type,request}});
 await call(1,'complete',req);assert.match(events.at(-1).error,/Boot/);
 const loading=call(2,'load',{context:8192});await call(3,'load',{});await loading;
 assert.ok(events.some(e=>e.id===3&&/busy/.test(e.error)));assert.equal(events.at(-1).result.context,8192);
 assert.equal(opts.activation,'f32');assert.equal(opts.kvCache,'q8');assert.equal(opts.overflow,'error');
 await call(4,'complete',req);assert.equal(resets,1);assert.equal(sends,1);assert.ok(events.some(e=>e.diagnostic?.request===req));
 await call(5,'complete',{...req,tool_choice:'required',tools:[]});assert.equal(sends,1);
 opts.onDeviceLost({reason:'unknown',message:'driver reset'});assert.match(events.at(-1).fatal,/device lost/);await call(6,'complete',req);assert.match(events.at(-1).error,/device lost/);
 const unavailable=bonsaiWorker({downloads,post:e=>events.push(e),gpuAvailable:()=>false,createEngine:()=>assert.fail('must not allocate or download')});
 await unavailable({data:{id:7,type:'load'}});assert.match(events.at(-1).error,/no CPU\/native\/server fallback/);assert.equal(disposed,0);
});
test('Bonsai failed loads dispose the engine and never report ready',async()=>{
 for(const failure of ['capabilities','tokenizer']){
  let disposed=0;const events=[];
  const worker=bonsaiWorker({post:e=>events.push(e),gpuAvailable:()=>true,downloads:{},createEngine:async()=>({capabilities:failure==='capabilities'?{...caps(4096),kvCache:'f16'}:caps(4096),dispose(){disposed++;}}),createChat:async()=>{throw Error('tokenizer hash mismatch');}});
  await worker({data:{id:1,type:'load',request:{context:4096}}});
  assert.equal(disposed,1);assert.ok(events.at(-1).error);assert.equal(events.some(e=>e.result?.loaded),false);
 }
});
test('Bonsai cache streams real progress, verifies bytes/hash, reuses cache and fails closed',async()=>{
 const bytes=new TextEncoder().encode('pinned data'),url='https://example.test/weights';
 const digest=Array.from(sha256(bytes),x=>x.toString(16).padStart(2,'0')).join('');
 const assets={data:{url,bytes:bytes.length,sha256:digest}},entries=new Map(),events=[];let fetches=0;
 const cache={match:async u=>entries.get(u)?.clone(),put:async(u,r)=>{entries.set(u,new Response(await r.arrayBuffer()));},delete:async u=>entries.delete(u)};
 const d=bonsaiDownloads(p=>events.push(p),{assets,storage:{open:async()=>cache},fetchImpl:async()=>{fetches++;return new Response(bytes);}});
 assert.equal(fetches,0);assert.deepEqual(new Uint8Array(await d.fetchArrayBuffer(url)),bytes);await d.settled();
 await d.fetchArrayBuffer(url);assert.equal(fetches,1);assert.ok(events.some(p=>p.text.startsWith('Reading cache')));assert.equal(events.at(-1).progress,1);
 for(const bad of ['bad','PINNED DATA','too much pinned data']){
  entries.set(url,new Response(bad));await assert.rejects(d.fetchArrayBuffer(url),/mismatch/);assert.equal(entries.has(url),false);
 }
 await assert.rejects(d.fetchArrayBuffer('https://untrusted.test'),/Unpinned/);
 const noCache=bonsaiDownloads(()=>{},{assets,storage:{open:async()=>{throw Error('denied');}},fetchImpl:async()=>new Response(bytes)});
 assert.deepEqual(new Uint8Array(await noCache.fetchArrayBuffer(url)),bytes);
});
test('built module graphs keep Bonsai dependencies out of the page and Simulator',async()=>{
 const {build}=await import('esbuild');
 for(const entry of ['app','simulator-worker','bonsai-worker']){
  const result=await build({entryPoints:[`public/${entry}.mjs`],bundle:true,format:'esm',platform:'browser',write:false,metafile:true,external:['./assets/libv86.mjs'],define:{__GUEST_WEB_SW_HASH__:'"test"'}});
  const inputs=Object.keys(result.metafile.inputs).join('\n');
  if(entry==='bonsai-worker'){assert.match(inputs,/node_modules\/bitgpu\//);assert.match(inputs,/node_modules\/@noble\/hashes\//);}
  else assert.doesNotMatch(inputs,/node_modules\/(?:bitgpu|@noble\/hashes)\//);
  if(entry==='simulator-worker')assert.doesNotMatch(inputs,/node_modules/);
 }
});
test('three modes preserve Qwen default and fixed model residency, dedicated staging and dependency boundary',async()=>{
 const html=await readFile('public/index.html','utf8'),app=await readFile('public/app.mjs','utf8');
 assert.deepEqual([...html.matchAll(/<option value="(qwen|bonsai|simulator)"/g)].map(m=>m[1]),['qwen','bonsai','simulator']);
 assert.match(html,/<option value="qwen" selected>/);assert.match(app,/bonsai:'prism-ml\/Bonsai-8B-Q1_0'/);
 assert.match(app,/selectedModel==='bonsai'\?'bonsai-worker.js'/);assert.match(app,/unload:.*resetWorker/);assert.match(app,/backend:selectedModel/);
 assert.doesNotMatch(app,/from ['"](?:bitgpu|@noble|\.\/bonsai)/);
 for(const f of ['scripts/build.mjs','scripts/stage-hosting.mjs','scripts/stage-cdn.mjs'])assert.match(await readFile(f,'utf8'),/bonsai-worker/);
 assert.equal(JSON.parse(await readFile('package.json','utf8')).dependencies.bitgpu,'0.19.1');
 assert.equal(BONSAI_ASSETS.data.bytes,1158654496);
});
test('Bonsai cache write errors cannot hide an integrity failure from load settlement',async()=>{
 const expected=new TextEncoder().encode('good'),url='https://example.test/weights';
 const assets={data:{url,bytes:4,sha256:Array.from(sha256(expected),x=>x.toString(16).padStart(2,'0')).join('')}};
 const cache={match:async()=>undefined,delete:async()=>true,put:async(u,r)=>{await r.arrayBuffer();}};
 const d=bonsaiDownloads(()=>{},{assets,storage:{open:async()=>cache},fetchImpl:async()=>new Response('evil')});
 const reader=(await d.fetchStream(url)).getReader();
 // A consumer can finish its tensor reads before checking stream EOF. Cache settlement
 // must still reject corruption instead of classifying it as an optional cache failure.
 await reader.read();
 await assert.rejects(d.settled(),/mismatch/);
 await reader.cancel().catch(()=>{});
});
