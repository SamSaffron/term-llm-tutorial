import {sha256} from '@noble/hashes/sha2.js';
import {BONSAI_ASSETS} from './bonsai-model.mjs';
export const BONSAI_CACHE = 'learn-bonsai-pinned-v1';
// Hash incrementally, never buffer the 1.16 GB GGUF in a JS ArrayBuffer.
// Cache writes are best effort; a failed hash/size check errors BOTH tee branches.
export function bonsaiDownloads(emit, {fetchImpl=fetch, storage=globalThis.caches, assets=BONSAI_ASSETS}={}) {
 const writes=[],integrityFailures=[];
 async function fetchStream(url) {
  const asset=Object.values(assets).find(a=>a.url===url);
  if(!asset)throw Error('Unpinned Bonsai asset request');
  let cache, response, hit=false;
  try{cache=await storage?.open(BONSAI_CACHE);response=await cache?.match(url);hit=!!response;}catch{emit({text:'Bonsai cache unavailable; downloading without persistent cache'});}
  if(!response)response=await fetchImpl(url);
  if(!response.ok||!response.body)throw Error(`Bonsai asset HTTP ${response.status}: ${url}`);
  let loaded=0,last=-Infinity;const hash=sha256.create(),file=url.split('/').at(-1);
  const stream=response.body.pipeThrough(new TransformStream({
   async transform(chunk,controller){
    loaded+=chunk.byteLength;
    if(loaded>asset.bytes){const error=Error(`Bonsai size mismatch: ${file}`);integrityFailures.push(error);try{await cache?.delete(url);}catch{}throw error;}
    hash.update(chunk);controller.enqueue(chunk);
    const now=performance.now();
    if(now-last>150||loaded===asset.bytes){emit({text:`${hit?'Reading cache':'Downloading'} Bonsai · ${file} · ${loaded.toLocaleString()} / ${asset.bytes.toLocaleString()} bytes`,progress:loaded/asset.bytes});last=now;}
   },
   async flush(){
    if(loaded!==asset.bytes||hash.digest().reduce((s,b)=>s+b.toString(16).padStart(2,'0'),'')!==asset.sha256){
     try{await cache?.delete(url);}catch{}
     const error=Error(`Bonsai size/SHA-256 mismatch: ${file}; retry to download again`);
     integrityFailures.push(error);
     throw error;
    }
   },
  }));
  if(!hit&&cache){
   const [runtime,stored]=stream.tee();
   writes.push(cache.put(url,new Response(stored)).catch(()=>emit({text:`Bonsai cache write failed · ${file}; next load may download again`})));
   return runtime;
  }
  return stream;
 }
 return {fetchStream,fetchArrayBuffer:async url=>new Response(await fetchStream(url)).arrayBuffer(),fetchJson:async url=>new Response(await fetchStream(url)).json(),settled:async()=>{await Promise.all(writes);if(integrityFailures.length)throw integrityFailures[0];}};
}
