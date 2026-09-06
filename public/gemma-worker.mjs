import {modelDownloadProgress} from './model-download-progress.mjs';
import {env,AutoTokenizer,AutoModelForCausalLM} from '@huggingface/transformers';
import {functionMessages,parseFunctionGemma} from './functiongemma.mjs';
let MODEL='onnx-community/gemma-3-270m-it-ONNX',REVISION='2dbbfdb1b59bd034eb959428c6a7da9dd7ea27f0',functionMode=false;
env.allowLocalModels=false;
env.backends.onnx.wasm.numThreads=1;
env.backends.onnx.wasm.proxy=false;
env.backends.onnx.wasm.wasmPaths=new URL('./ort/',self.location.href).href;
let model,tokenizer,context=16384,busy=false;
self.onmessage=async({data:{id,type,request}})=>{
 if(busy){self.postMessage({id,error:'Model worker busy'});return;}busy=true;
 try{
  if(type==='load'){
   functionMode=request?.backend==='functiongemma';
   if(functionMode){MODEL='onnx-community/functiongemma-270m-it-ONNX';REVISION='ba3c872ede162a5c4ab753f509b2260af5587143';}
   context=request?.context||16384;if(![4096,8192,16384].includes(context))throw Error('Unsupported context');
   const adapter=await self.navigator.gpu?.requestAdapter({powerPreference:'high-performance'});if(!adapter)throw Error('No WebGPU adapter; no cloud fallback');
   const options={revision:REVISION,progress_callback:modelDownloadProgress(progress=>self.postMessage({progress}),functionMode?'FunctionGemma':'Gemma')};
   tokenizer=await AutoTokenizer.from_pretrained(MODEL,options);
   model=await AutoModelForCausalLM.from_pretrained(MODEL,{...options,device:'webgpu',dtype:functionMode?'fp32':'q4'});
   if(model.config.max_position_embeddings<context)throw Error('Model context limit is smaller than requested');
   self.postMessage({id,result:{loaded:true,model:MODEL,context,precision:functionMode?'fp32':'q4 / float32',runtime:'Transformers.js / ONNX WebGPU',memoryScope:'Context is a token limit; KV cache grows dynamically. Not a preallocated-memory measurement.'}});
  }else if(type==='complete'){
   if(!model)throw Error('Boot Gemma first');
   if(!functionMode&&(request.tools?.length||request.messages?.some(m=>m.role==='tool'||m.tool_calls?.length)))throw Error('Select FunctionGemma for tool calling; regular Gemma is text chat only');
   if(!request.messages?.length)throw Error('Messages required');
   const prepared=functionMode?functionMessages(request):{messages:request.messages.map(m=>({role:m.role==='developer'?'system':m.role,content:m.content??''}))};
   const messages=prepared.messages;
   if(functionMode)self.postMessage({diagnostic:{model:MODEL,renderedPrompt:tokenizer.apply_chat_template(messages,{tools:prepared.tools,add_generation_prompt:true,tokenize:false}),phase:'rendered prompt'}});
   const inputs=tokenizer.apply_chat_template(messages,{tools:prepared.tools,add_generation_prompt:true,return_dict:true});
   const promptTokens=inputs.input_ids.dims[1],maxNew=request.max_completion_tokens??request.max_tokens??2048;
   if(!Number.isInteger(maxNew)||maxNew<1||promptTokens+maxNew>context)throw Error(`Context limit ${context}: ${promptTokens} input + ${maxNew} requested output tokens`);
   const start=performance.now();
   const output=await model.generate({...inputs,max_new_tokens:maxNew,do_sample:(request.temperature??0)>0,...((request.temperature??0)>0?{temperature:request.temperature,top_p:request.top_p??1}:{})});
   const generated=output.slice(null,[promptTokens,null]);
   const content=tokenizer.batch_decode(generated,{skip_special_tokens:!functionMode})[0];
   const finishReason=generated.dims[1]>=maxNew?'length':'stop';
   if(functionMode)self.postMessage({diagnostic:{model:MODEL,request:{messages,tools:prepared.tools,max_new_tokens:maxNew},raw:content,phase:'before parsing'}});
   const message=functionMode?parseFunctionGemma(content,request,finishReason):{role:'assistant',content};
   const usage={prompt_tokens:promptTokens,completion_tokens:generated.dims[1],total_tokens:promptTokens+generated.dims[1]};
   const result={id:'chatcmpl-'+crypto.randomUUID(),object:'chat.completion',created:Math.floor(Date.now()/1000),model:MODEL,choices:[{index:0,message,finish_reason:message.tool_calls?.length?'tool_calls':finishReason}],usage};
   self.postMessage({diagnostic:{model:MODEL,request:{messages,max_new_tokens:maxNew},raw:content,usage,elapsed_ms:performance.now()-start}});self.postMessage({id,result});
  }else throw Error('Unknown worker operation');
 }catch(e){self.postMessage({id,error:(functionMode?'FunctionGemma 270M: ':'Gemma 3 270M: ')+e.message});}finally{busy=false;}
};
