import {imageRequest} from './image-model.mjs';
// No worker or runtime is created by construction. Termination cancels downloads,
// inference and releases ONNX sessions together (including WASM memory).
export class ImageGenerator {
 constructor({changed=()=>{},progress=()=>{},createWorker=()=>new Worker('image-worker.js',{type:'module'})}={}) {
  Object.assign(this,{changed,progress,createWorker,state:'off',worker:null,pending:null,seq:0,epoch:0});
 }
 setState(state){this.state=state;this.changed(state);}
 reset(reason='Image model unloaded; cached downloads retained.') {
  ++this.epoch;this.worker?.terminate();this.worker=null;
  if(this.pending){clearTimeout(this.pending.timer);this.pending.reject(Error(reason));this.pending=null;}
  this.setState('off');
 }
 call(type,request){
  return new Promise((resolve,reject)=>{
   const id=++this.seq;
   const timer=setTimeout(()=>this.reset('Image deadline exceeded. Retry explicitly; guest files preserved.'),type==='load'?900000:180000);
   this.pending={id,resolve,reject,timer};this.worker.postMessage({id,type,request});
  });
 }
 async load(consent){
  if(consent!==true)throw Error('Explicit download and license consent required.');
  if(this.state!=='off')throw Error('Unload the image model before reloading.');
  const epoch=this.epoch;this.setState('loading');
  try{
   this.worker=this.createWorker();
   this.worker.onmessage=({data})=>{
    const p=this.pending;if(!p||data.id!==p.id)return;
    if(data.progress){this.progress(data.progress);return;}
    clearTimeout(p.timer);this.pending=null;data.error?p.reject(Error(data.error)):p.resolve(data.result);
   };
   this.worker.onerror=e=>this.reset('Image worker failed: '+e.message);
   await this.call('load');if(epoch===this.epoch)this.setState('ready');
  }catch(e){if(epoch===this.epoch)this.reset();throw e;}
 }
 async generate(request){
  if(this.state!=='ready')throw Error('Janus is not loaded. Enable it in the image controls.');
  request=imageRequest(request);const epoch=this.epoch;this.setState('generating');
  try{const result=await this.call('generate',request);if(epoch===this.epoch)this.setState('ready');return result;}
  catch(e){if(epoch===this.epoch)this.reset();throw e;}
 }
}
