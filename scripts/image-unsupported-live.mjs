// Controlled capability failures in dedicated shared-browser tabs, not host flags.
import {connect} from './shared-connect.mjs';
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
const b=await connect();const proof=[];
try{
 for(const mode of ['absent','no-adapter']){
  const p=await b.contexts()[0].newPage();const requests=[];
  try{
   await p.route('https://term-llm.com/learn/**',async r=>{
    const name=new URL(r.request().url()).pathname.slice('/learn/'.length);
    if(!name){await r.fulfill({contentType:'text/html',body:'<!doctype html><title>Isolated Janus capability boundary test</title>'});return;}
    assert.ok(!name.includes('..'));let body=await fs.readFile('public/'+name,'utf8');
    if(name==='image-worker.js')body=`Object.defineProperty(navigator,'gpu',{value:${mode==='absent'?'undefined':'{requestAdapter:async()=>null}'}});\n`+body;
    await r.fulfill({contentType:'application/javascript',body});
   });
   p.on('request',r=>requests.push(r.url()));await p.goto('https://term-llm.com/learn/');
   const result=await p.evaluate(async()=>{
    const {ImageGenerator}=await import('./image-generator.mjs');const images=new ImageGenerator();
    try{await images.load(true);return {unexpected:true};}catch(e){return {error:e.message,state:images.state,worker:images.worker};}
   });
   assert.equal(result.state,'off');assert.equal(result.worker,null);assert.match(result.error,mode==='absent'?/WebGPU unavailable/:/No WebGPU adapter/);
   assert.equal(requests.some(u=>/image-runtime|huggingface/.test(u)),false);
   proof.push({mode,result,noRuntimeOrModelRequests:true});
  }finally{await p.close();}
 }
 await fs.mkdir('evidence/optional-janus',{recursive:true});await fs.writeFile('evidence/optional-janus/unsupported.json',JSON.stringify(proof,null,2));console.log(JSON.stringify(proof));
}finally{await b.close();}
