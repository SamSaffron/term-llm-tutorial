import {IMAGE_MODEL,IMAGE_REVISION,IMAGE_DTYPE,IMAGE_DEVICE,imageRequest,mulberry32} from './image-model.mjs';
let processor,model,busy=false;
self.onmessage=async({data:{id,type,request}})=>{
 if(busy){self.postMessage({id,error:'Image worker busy'});return;}
 busy=true;
 try {
  if(type==='load') {
   if(!navigator.gpu)throw Error('WebGPU unavailable. Use desktop Chrome with a compatible GPU. Simulator text still works.');
   if(!await navigator.gpu.requestAdapter())throw Error('No WebGPU adapter available. Simulator text still works.');
   // This import, ONNX runtime and all model fetches occur only after consent.
   const {AutoProcessor,MultiModalityCausalLM,env}=await import('./image-runtime/transformers.min.js');
   env.allowLocalModels=false;
   // Match the non-isolated proof harness; avoid an extra WASM pthread pool.
   env.backends.onnx.wasm.numThreads=1;
   env.backends.onnx.wasm.wasmPaths=new URL('./image-runtime/',self.location.href).href;
   const options={revision:IMAGE_REVISION,progress_callback:progress=>self.postMessage({id,progress})};
   [processor,model]=await Promise.all([AutoProcessor.from_pretrained(IMAGE_MODEL,options),MultiModalityCausalLM.from_pretrained(IMAGE_MODEL,{...options,dtype:IMAGE_DTYPE,device:IMAGE_DEVICE})]);
   self.postMessage({id,result:{ready:true}});
  }else if(type==='generate') {
   if(!model)throw Error('Enable the image model first.');
   const {prompt,seed}=imageRequest(request);
   const inputs=await processor([{role:'<|User|>',content:prompt}],{chat_template:'text_to_image'});
   let count=-1;const total=processor.num_image_tokens;
   const streamer={put(){if(++count>0)self.postMessage({id,progress:{status:'tokens',count,total}});},end(){}};
   // Transformers.js 3.8.1's multinomial sampler uses worker-local Math.random.
   const random=Math.random;let outputs;
   try{Math.random=mulberry32(seed);outputs=await model.generate_images({...inputs,min_new_tokens:total,max_new_tokens:total,do_sample:true,streamer});}finally{Math.random=random;}
   const blob=await outputs[0].toBlob();
   if(blob.type!=='image/png')throw Error('Model did not return PNG.');
   self.postMessage({id,result:{blob,prompt,seed,model:IMAGE_MODEL,revision:IMAGE_REVISION}});
  }else throw Error('Unknown image operation');
 }catch(e){self.postMessage({id,error:typeof e==='number'?`Janus runtime failed (code ${e}). GPU or system memory may be insufficient; unload other models and retry explicitly.`:e.message||String(e)});}finally{busy=false;}
};
