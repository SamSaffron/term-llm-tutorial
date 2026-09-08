import {BONSAI_ASSETS as assets, BONSAI_MODEL, verifyBonsaiCapabilities} from './bonsai-model.mjs';
import {bitgpuRequest, bitgpuResponse, checkBonsaiBudget} from './bonsai-adapter.mjs';
// Injectable runtime boundary permits protocol/lifecycle tests without fake browser inference.
export function bonsaiWorker({createEngine,createChat,validateTools,downloads,post,gpuAvailable=async()=>!!(await globalThis.navigator?.gpu?.requestAdapter({powerPreference:'high-performance'}))}) {
 let engine,chat,busy=false,context=16384,lost='';
 return async ({data})=>{
  const {id,type,request}=data;
  if(busy){post({id,error:'Bonsai model worker busy'});return;}
  busy=true;
  try{
   if(type==='load'){
    if(engine)throw Error('Bonsai already loaded');
    context=request?.context??16384;
    if(![4096,8192,16384].includes(context))throw Error('Unsupported context selection');
    if(!await gpuAvailable())throw Error('WebGPU unavailable or no adapter; no CPU/native/server fallback is configured');
    lost='';
    engine=await createEngine({manifestUrl:assets.manifest.url,dataUrl:assets.data.url,auxUrl:assets.aux.url,
     activation:'f32',kvCache:'q8',maxSeqLen:context,overflow:'error',
     fetchJson:downloads.fetchJson,fetchArrayBuffer:downloads.fetchArrayBuffer,fetchStream:downloads.fetchStream,
     onProgress:p=>{if(p.phase!=='weights')post({progress:{text:`Loading Bonsai · ${p.phase}`}});},
     onDeviceLost:info=>{lost=`Bonsai GPU device lost: ${info.message||info.reason}. GPU worker released; guest files are retained. Save your files before restarting.`;chat=null;post({diagnostic:{model:BONSAI_MODEL,deviceLost:info}});post({fatal:lost});},
    });
    verifyBonsaiCapabilities(engine.capabilities,context);
    chat=await createChat(engine,{tokenizerJsonUrl:assets.tokenizer.url,tokenizerConfigUrl:assets.tokenizerConfig.url,fetchJson:downloads.fetchJson});
    await downloads.settled();
    if(lost)throw Error(lost);
    post({id,result:{loaded:true,model:BONSAI_MODEL,context,precision:'Q1_0 · f32 activation · q8 KV',activeGPUCaps:engine.capabilities,memoryScope:'Runtime does not report total GPU allocation; context increases KV memory. No universal 16K memory estimate.'}});
   }else if(type==='complete'){
    if(lost)throw Error(lost);
    if(!chat)throw Error('Boot the model first');
    const adapted=bitgpuRequest(request,context);
    if(adapted.options.tools)validateTools(adapted.options.tools,adapted.options.toolChoice);
    const promptTokens=checkBonsaiBudget(chat,adapted,context);
    chat.reset();
    const raw=await chat.send(adapted.messages,adapted.options);
    if(lost)throw Error(lost);
    post({diagnostic:{model:BONSAI_MODEL,request,adapted,promptTokens,context,activeGPUCaps:engine.capabilities,raw}});
    post({id,result:bitgpuResponse(raw,BONSAI_MODEL,id,request)});
   }else throw Error('Unknown worker operation');
  }catch(e){
   if(type==='load'){engine?.dispose();engine=null;chat=null;}
   post({id,error:`Bonsai 8B: ${e.message||e}`});
  }finally{busy=false;}
 };
}
