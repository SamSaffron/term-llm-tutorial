// Scoped exclusively to guest-web/. Every guest HTTP request is routed to its
// owning tutorial tab, never to the public server or another browser's guest.
self.addEventListener('install',()=>self.skipWaiting());
self.addEventListener('activate',e=>e.waitUntil(self.clients.claim()));
const owners=new Map();
async function owner(key){
 const known=owners.get(key),client=known&&await self.clients.get(known);if(client)return client;
 const candidates=await self.clients.matchAll({type:'window',includeUncontrolled:true});
 for(const c of candidates){
  const u=new URL(c.url),root=new URL('../',self.location.href);
  if(u.origin!==root.origin||u.pathname!==root.pathname)continue;
  const ok=await new Promise(resolve=>{const ch=new MessageChannel(),timer=setTimeout(()=>{ch.port1.close();resolve(false)},1000);ch.port1.onmessage=e=>{clearTimeout(timer);ch.port1.close();resolve(e.data===true)};c.postMessage({type:'guest-web-probe',key},[ch.port2]);});
  if(ok){owners.set(key,c.id);return c;}
 }
}
self.addEventListener('fetch',e=>{
 const url=new URL(e.request.url),base=new URL(self.registration.scope);
 if(url.origin!==base.origin||!url.pathname.startsWith(base.pathname))return;
 e.respondWith((async()=>{
  const scopeKey=base.pathname.split('/').filter(Boolean).at(-1);const key=/^[a-f0-9-]{36}$/.test(scopeKey)?scopeKey:url.pathname.slice(base.pathname.length).split('/')[0];
  if(!/^[a-f0-9-]{36}$/.test(key))return new Response('Invalid tutorial session',{status:404});
  const client=await owner(key);if(!client)return new Response('This temporary Linux guest is gone. Open the tutorial, start it, and open its web interface again.',{status:410});
  const data=await e.request.arrayBuffer();if(data.byteLength>1024*1024)return new Response('Request exceeds tutorial limit',{status:413});
  return new Promise(resolve=>{
   const channel=new MessageChannel();let streamController,started=false,html=false,statusCode=200;const htmlChunks=[];
   const timer=setTimeout(()=>{channel.port1.postMessage({cancel:true});if(!started)resolve(new Response('Guest web request timed out',{status:504}));else streamController.error(Error('Guest timeout'));channel.port1.close();},300000);
   const headers=new Headers();headers.set('Cross-Origin-Opener-Policy','same-origin');headers.set('Cross-Origin-Embedder-Policy','require-corp');headers.set('Cross-Origin-Resource-Policy','same-origin');headers.set('X-Content-Type-Options','nosniff');
   channel.port1.onmessage=event=>{
    const msg=event.data;
    if(msg.status){started=true;statusCode=msg.status;for(const [k,v]of Object.entries(msg.headers||{}))headers.set(k,v);html=(headers.get('content-type')||'').includes('text/html');if(html)return;const body=new ReadableStream({start(c){streamController=c},cancel(){channel.port1.postMessage({cancel:true});clearTimeout(timer);channel.port1.close();}});resolve(new Response([204,205,304].includes(msg.status)||e.request.method==='HEAD'?null:body,{status:msg.status,headers}));}
    if(msg.body){const chunk=Uint8Array.from(atob(msg.body),c=>c.charCodeAt(0));if(html)htmlChunks.push(chunk);else streamController?.enqueue(chunk);}
    if(msg.error){if(!started)resolve(new Response(msg.error,{status:502}));else streamController?.error(Error(msg.error));}
    if(msg.end||msg.error){clearTimeout(timer);if(html&&!msg.error){const decoder=new TextDecoder();const markup=htmlChunks.map(b=>decoder.decode(b,{stream:true})).join('')+decoder.decode();const shim='<script>('+isolateStorage.toString()+')('+JSON.stringify(key)+');</script>';resolve(new Response(markup.replace(/<head[^>]*>/i,m=>m+shim),{status:statusCode,headers}));}if(!msg.error)streamController?.close();channel.port1.close();}
   };
   client.postMessage({type:'guest-web-request',key,id:crypto.randomUUID(),path:url.pathname+url.search,method:e.request.method,headers:Object.fromEntries([...e.request.headers].filter(([k])=>['content-type','accept','last-event-id','session_id','idempotency-key'].includes(k)||k.startsWith('x-term-llm-'))),body:data},[channel.port2]);
  });
 })());
});

// Native web UI preferences are origin-global outside Hub mode. Keep this
// temporary guest away from any real wasnotwas chat settings, tokens or drafts.
function isolateStorage(key){
 // The transport worker already owns this path. Native PWA installation cannot
 // replace it inside an ephemeral guest; report unsupported without a failing fetch.
 if(navigator.serviceWorker){const register=navigator.serviceWorker.register.bind(navigator.serviceWorker);navigator.serviceWorker.register=(url,options)=>new URL(url,location.href).pathname.startsWith(location.pathname.split(key)[0]+key+'/')?Promise.reject(new DOMException('PWA installation is unavailable in the temporary tutorial guest','NotSupportedError')):register(url,options);}

 for(const name of ['localStorage','sessionStorage']){
  const real=window[name],prefix='tutorial-guest:'+key+':';
  const keys=()=>Array.from({length:real.length},(_,i)=>real.key(i)).filter(k=>k?.startsWith(prefix));
  Object.defineProperty(window,name,{value:{get length(){return keys().length},key(i){return keys()[i]?.slice(prefix.length)||null},getItem(k){return real.getItem(prefix+k)},setItem(k,v){real.setItem(prefix+k,String(v))},removeItem(k){real.removeItem(prefix+k)},clear(){keys().forEach(k=>real.removeItem(k))}}});
 }
}
