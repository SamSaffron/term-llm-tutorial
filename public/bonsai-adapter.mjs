// Transport only, derived from the evaluated adapter. No prompt rewriting,
// invented tool calls, history truncation, or host tool execution.
const require = (ok, message) => {if(!ok)throw Error(message);};
const object = x => x!==null&&typeof x==='object'&&!Array.isArray(x);
export function bitgpuRequest(request, context=16384) {
 require([4096,8192,16384].includes(context),'Unsupported context selection');
 require(Array.isArray(request.messages)&&request.messages.length,'messages must be a nonempty array');
 // stream is handled by the existing guest bridge from this complete response.
 const supported=new Set(['model','messages','tools','tool_choice','max_tokens','max_completion_tokens','temperature','seed','top_p','presence_penalty','stop','stream','stream_options','think','chat_template_kwargs','n','parallel_tool_calls']);
 for(const key of Object.keys(request))require(supported.has(key),`Unsupported Bonsai request field: ${key}`);
 require(request.n==null||request.n===1,'Bonsai supports one completion');
 require(request.stream==null||typeof request.stream==='boolean','Invalid stream option');
 if(request.stream_options!=null)require(object(request.stream_options)&&Object.keys(request.stream_options).every(k=>k==='include_usage')&&(request.stream_options.include_usage==null||typeof request.stream_options.include_usage==='boolean'),'Unsupported stream options');
 require(request.parallel_tool_calls!==false,'Bonsai cannot enforce parallel_tool_calls:false');
 if(request.chat_template_kwargs)require(Object.keys(request.chat_template_kwargs).every(k=>k==='enable_thinking'),'Unsupported chat template options');
 const tools=structuredClone(request.tools??[]);
 require(Array.isArray(tools),'tools must be an array');
 for(const tool of tools)require(tool?.type==='function'&&typeof tool.function?.name==='string'&&tool.function.name.length,'Invalid function tool');
 let toolChoice=request.tool_choice??'auto';
 if(object(toolChoice)){
  require(toolChoice.type==='function'&&typeof toolChoice.function?.name==='string','Invalid named tool choice');
  toolChoice={name:toolChoice.function.name};
 }else if(toolChoice==='required'){
  require(tools.length===1,'bitgpu cannot enforce required-any among multiple tools (exactly one tool required)');
  toolChoice={name:tools[0].function.name};
 }else require(['auto','none'].includes(toolChoice),'Unsupported tool choice');
 if(object(toolChoice))require(tools.some(t=>t.function.name===toolChoice.name),'Forced tool is not declared');
 const maxTokens=request.max_completion_tokens??request.max_tokens??2048;
 require(Number.isInteger(maxTokens)&&maxTokens>0&&maxTokens<context,'Invalid output token limit');
 const temperature=request.temperature??0, seed=request.seed??42, topP=request.top_p??0.9, presencePenalty=request.presence_penalty??0;
 require(Number.isFinite(temperature)&&temperature>=0,'Invalid temperature');
 require(Number.isInteger(seed)&&seed>=0&&seed<=0xffffffff,'Invalid seed');
 require(Number.isFinite(topP)&&topP>0&&topP<=1,'Invalid top_p');
 require(Number.isFinite(presencePenalty)&&presencePenalty>=-2&&presencePenalty<=2,'Invalid presence_penalty');
 const think=request.think??request.chat_template_kwargs?.enable_thinking??false;
 require(typeof think==='boolean','Invalid thinking option');
 require(!(think&&object(toolChoice)),'Named tool choice cannot honor thinking mode');
 const stop=request.stop==null?undefined:typeof request.stop==='string'?[request.stop]:structuredClone(request.stop);
 require(stop===undefined||(Array.isArray(stop)&&stop.every(s=>typeof s==='string'&&s.length)),'Invalid stop sequences');
 const messages=request.messages.map(m=>{
  require(['system','user','assistant','tool'].includes(m.role),'Unsupported message role');
  require(m.content==null||typeof m.content==='string','Bonsai supports text-only string content; multimodal messages are unsupported');
  for(const key of Object.keys(m))require(['role','content','tool_calls','tool_call_id'].includes(key),`Unsupported message field: ${key}`);
  if(m.tool_calls!=null)require(m.role==='assistant'&&Array.isArray(m.tool_calls),'Invalid tool history');
  return {role:m.role,content:m.content??'',...(m.tool_calls?.length?{tool_calls:m.tool_calls.map(call=>{
   require(call?.type==='function'&&typeof call.function?.name==='string','Invalid history function call');
   const args=call.function.arguments;
   require(typeof args==='string'||object(args),'Invalid history tool arguments');
   if(typeof args==='string'){let parsed;try{parsed=JSON.parse(args);}catch{throw Error('Invalid history tool arguments JSON');}require(object(parsed),'Tool arguments must be an object');}
   return {name:call.function.name,arguments:structuredClone(args)};
  })}:{})};
 });
 return {messages,options:{maxTokens,temperature,seed,topK:20,topP,minP:0,repetitionPenalty:1,presencePenalty,think,reuseCache:false,...(tools.length?{tools,toolChoice}:{}),...(stop?{stopSequences:stop}:{})}};
}
export function checkBonsaiBudget(chat, adapted, context) {
 const {messages,options}=adapted;
 const promptTokens=chat.countTokens(messages,{think:options.think,tools:options.toolChoice==='none'?undefined:options.tools});
 require(Number.isInteger(promptTokens)&&promptTokens>0,'Invalid native prompt token count');
 require(promptTokens+options.maxTokens<=context,`Bonsai prompt (${promptTokens}) + output (${options.maxTokens}) exceeds ${context} context; no history was truncated`);
 return promptTokens;
}
export function bitgpuResponse(raw, model, id, request={}) {
 require(typeof raw.text==='string','Missing native result text');
 require(Array.isArray(raw.tokens)&&Array.isArray(raw.inputTokenIds),'Missing native token counts');
 require(['stop','length','tool_calls'].includes(raw.finishReason),'Browser inference aborted or invalid finish reason');
 require(Array.isArray(raw.toolCalls),'Missing native tool calls');
 const calls=raw.toolCalls.map((call,i)=>{
  require(typeof call.name==='string'&&call.name.length,'Truncated or unparsed tool call (see diagnostics)');
  require(object(call.arguments),'Invalid native tool arguments');
  require(request.tool_choice!=='none'&&request.tools?.some(t=>t.function?.name===call.name),'Undeclared or forbidden native tool call');
  const forced=object(request.tool_choice)?request.tool_choice.function?.name:request.tool_choice==='required'&&request.tools?.length===1?request.tools[0].function.name:null;
  require(!forced||forced===call.name,'Native call differs from named choice');
  return {id:`call_${id}_${i}`,type:'function',function:{name:call.name,arguments:JSON.stringify(call.arguments)}};
 });
 require(calls.length||(!object(request.tool_choice)&&request.tool_choice!=='required'),'Native model did not complete the required tool call');
 require(raw.finishReason!=='tool_calls'||calls.length,'Missing calls for native tool_calls finish');
 require(!/<\/?tool_call\b/.test(raw.text),'Unparsed tool call markup in native text');
 return {id:`bitgpu_${id}`,object:'chat.completion',created:Math.floor(Date.now()/1000),model,choices:[{index:0,finish_reason:calls.length?'tool_calls':raw.finishReason,message:{role:'assistant',content:raw.text,...(calls.length?{tool_calls:calls}:{})}}],usage:{prompt_tokens:raw.inputTokenIds.length,completion_tokens:raw.tokens.length,total_tokens:raw.inputTokenIds.length+raw.tokens.length}};
}
