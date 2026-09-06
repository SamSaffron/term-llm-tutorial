import { MLCEngine, prebuiltAppConfig } from '@mlc-ai/web-llm';
import { MODEL, adaptRequest, adaptResponse } from './protocol.mjs';
let engine,busy=false,context=16384;
const modelRecord={...prebuiltAppConfig.model_list.find(m=>m.model_id===MODEL),model:'https://huggingface.co/mlc-ai/Qwen3-8B-q4f32_1-MLC/resolve/34026572351006ba1865d11319309b151d9ccf16/',model_lib:'https://raw.githubusercontent.com/mlc-ai/binary-mlc-llm-libs/025bcaf3780fa8254f5e5efd3bfea0a5397248f4/web-llm-models/v0_2_84/base/Qwen3-8B-q4f32_1_cs1k-webgpu.wasm'};
self.onmessage=async({data})=>{
 const {id,type,request}=data;
 if(busy){self.postMessage({id,error:'Model worker busy'});return;}
 busy=true;
 try{
  if(type==='load'){
   context=request?.context||16384;
   if(![4096,8192,16384].includes(context))throw Error('Unsupported context selection');
   if(!self.navigator.gpu)throw Error('WebGPU unavailable in this browser');
   const adapter=await self.navigator.gpu.requestAdapter({powerPreference:'high-performance'});
   if(!adapter)throw Error('No WebGPU adapter; no CPU/cloud/model fallback is configured');
   engine=new MLCEngine({appConfig:{...prebuiltAppConfig,model_list:[modelRecord]},initProgressCallback:p=>self.postMessage({progress:p})});
   await engine.reload(MODEL,{context_window_size:context,max_history_size:1,conv_config:{stop_token_ids:[151643,151645]}});
   // Pinned WebLLM 0.2.84 pipeline allocates its KV cache using this exact value.
   const pipeline=engine.loadedModelIdToPipeline.get(MODEL);
   const effective=pipeline?.contextWindowSize;
   if(effective!==context)throw Error(`Requested ${context} context, runtime reports ${effective}; refusing silent fallback`);
   const gpu=pipeline?.tvm?.lib?.webGPUContext;
   if(!gpu)throw Error('Cannot verify allocated GPU buffers');
   await gpu.sync();
   if(!Number.isFinite(gpu.currAllocatedBytes)||gpu.currAllocatedBytes<=0)throw Error('Runtime reports no allocated GPU buffers');
   self.postMessage({id,result:{loaded:true,model:MODEL,context,precision:'q4f32',gpu:adapter.info.vendor,gpuBufferBytes:gpu.currAllocatedBytes,peakGPUBufferBytes:gpu.peakAllocatedBytes,memoryScope:'Tracked runtime GPU buffers, not total browser/device memory'}});
  }else if(type==='complete'){
   if(!engine)throw Error('Boot the model first');
    const req=adaptRequest(request,context,MODEL);
    await engine.resetChat(); // Each HTTP request supplies its actual conversation history.
    const raw=await engine.chat.completions.create(req);
    self.postMessage({diagnostic:{model:MODEL,request:req,raw:raw.choices?.[0]?.message?.content,finish:raw.choices?.[0]?.finish_reason,usage:raw.usage}});
     self.postMessage({id,result:adaptResponse(raw,request)});
   }else throw Error('Unknown worker operation');
  }catch(e){self.postMessage({id,error:`Qwen3 8B: ${String(e.message||e)}`});}finally{busy=false;}
};
