export function guestWebBridge(getVM){
 let key=crypto.randomUUID(),registration;const pending=new Map();const encoder=new TextEncoder();let polling=false;let lastResponse='';
 const base=()=>new URL(`./guest-web/${key}`,location.href).pathname;
 const cancel=async(id)=>{const item=pending.get(id);pending.delete(id);if(item)try{await item.vm.create_file('web-cancel-'+id,new Uint8Array());}catch{}};
 navigator.serviceWorker?.addEventListener('message',async e=>{
  if(!e.source?.scriptURL||new URL(e.source.scriptURL).origin!==location.origin||new URL(e.source.scriptURL).pathname!==new URL('./guest-web/sw.js',location.href).pathname)return;
  const d=e.data,port=e.ports[0];if(!port)return;
  if(d.type==='guest-web-probe'){port.postMessage(d.key===key&&!!getVM());return;}
  if(d.type!=='guest-web-request')return;
  const vm=getVM();if(d.key!==key||!vm){port.postMessage({status:410,headers:{'content-type':'text/plain'}});port.postMessage({end:true});return;}
  if(!/^[a-f0-9-]{36}$/.test(d.id)||!d.path.startsWith(base()+'/')||pending.size>=32){port.postMessage({status:400});port.postMessage({end:true});return;}
  const bytes=new Uint8Array(d.body);let binary='';for(let i=0;i<bytes.length;i+=8192)binary+=String.fromCharCode(...bytes.subarray(i,i+8192));
  pending.set(d.id,{port,vm,offset:0,trace:d.path.includes('/v1/responses')});if(d.path.endsWith('/v1/responses'))lastResponse='';port.onmessage=event=>{if(event.data.cancel)cancel(d.id)};
  try{await vm.create_file('web-req-'+d.id+'.json',encoder.encode(JSON.stringify({method:d.method,path:d.path,headers:d.headers,body:btoa(binary)})));}
  catch(error){port.postMessage({error:error.message});cancel(d.id);}
 });
 setInterval(async()=>{
  if(polling)return;polling=true;
  try{await Promise.all([...pending].map(async([id,item])=>{
   try{
    const raw=new TextDecoder().decode(await item.vm.read_file('web-res-'+id+'.jsonl'));
    const end=raw.lastIndexOf('\n')+1;if(end<=item.offset)return;
    const lines=raw.slice(item.offset,end).trim().split('\n');item.offset=end;
    for(const line of lines){const event=JSON.parse(line);if(item.trace&&event.body)lastResponse=(lastResponse+atob(event.body)).slice(-100000);item.port.postMessage(event);if(event.end||event.error){await cancel(id);break;}}
   }catch{}
  }));}finally{polling=false;}
 },60);
 return {get lastResponse(){return lastResponse;},get base(){return base();},reset(){registration?.unregister();registration=null;for(const [id,item]of pending){item.port.postMessage({error:'Tutorial guest stopped'});cancel(id);}key=crypto.randomUUID();},async open(){
  if(!getVM())throw Error('Start the tutorial first');if(!navigator.serviceWorker)throw Error('This browser needs service-worker support to open the guest web interface');
  const tab=window.open('about:blank','tutorial-web-'+key);if(!tab)throw Error('Allow popups for this tutorial to open the web interface');tab.opener=null;
  try{
   registration=await navigator.serviceWorker.register('./guest-web/sw.js?v='+__GUEST_WEB_SW_HASH__,{scope:base()+'/',updateViaCache:'none'});
   const worker=registration.installing||registration.waiting||registration.active;
   if(worker.state!=='activated')await new Promise((resolve,reject)=>{const timeout=setTimeout(()=>reject(Error('Guest web bridge activation timed out')),15000);worker.addEventListener('statechange',()=>{if(worker.state==='activated'){clearTimeout(timeout);resolve();}});});
   tab.location.href=base()+'/';
  }catch(e){tab.close();throw e;}
 }};
}
