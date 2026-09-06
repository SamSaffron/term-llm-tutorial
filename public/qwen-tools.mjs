const namePattern=/^[a-zA-Z0-9_-]+$/;
export const TOOL_INSTRUCTIONS=`If you choose to call a function ONLY reply in the following format with NO suffix:

<tool_call>
<function=example_function_name>
<parameter=example_parameter_1>
value_1
</parameter>
<parameter=example_parameter_2>
This is the value for the second parameter
that can span
multiple lines
</parameter>
</function>
</tool_call>

<IMPORTANT>
- Function calls MUST follow the specified format: an inner <function=...></function> block must be nested within <tool_call></tool_call> XML tags
- Required parameters MUST be specified
- You may provide optional reasoning for your function call in natural language BEFORE the function call, but NOT after
- If there is no function call available, answer the question like normal with your current knowledge and do not tell the user about function calls
</IMPORTANT>`;
export function toolPolicy(request){
 const tools=request.tools||[];const byName=new Map();
 for(const t of tools){
  if(t.type!=='function'||!namePattern.test(t.function?.name)||byName.has(t.function.name))throw Error('Invalid or duplicate function tool');
  const schema=t.function.parameters||{type:'object',properties:{}};
  byName.set(t.function.name,{tool:t,schema});
 }
 const choice=request.tool_choice??(tools.length?'auto':'none');
 let forced;
 if(typeof choice==='object'&&choice?.type==='function'){forced=choice.function?.name;if(!byName.has(forced))throw Error('tool_choice names an unavailable tool');}
 else if(!['auto','none','required'].includes(choice))throw Error('Unsupported tool_choice');
 if(choice==='required'&&!tools.length)throw Error('tool_choice required needs tools');
 return {byName,choice,forced,available:choice==='none'?[]:forced?tools.filter(t=>t.function.name===forced):tools};
}
function withoutThinking(s){return s.replace(/^\s*<think>[\s\S]*?<\/think>\s*/,'');}
function callText(call,format){
 const f=call.function; if(!namePattern.test(f?.name))throw Error('Invalid historical tool name');
 const args=typeof f.arguments==='string'?JSON.parse(f.arguments):f.arguments;
 if(!args||typeof args!=='object'||Array.isArray(args))throw Error('Historical tool arguments must be an object');
 if(format==='json')return '<tool_call>\n'+JSON.stringify({name:f.name,arguments:args})+'\n</tool_call>';
 return '<tool_call>\n<function='+f.name+'>\n'+Object.entries(args).map(([k,v])=>{
  if(!namePattern.test(k))throw Error('Unsupported parameter name');
  return '<parameter='+k+'>\n'+(typeof v==='string'?v:JSON.stringify(v))+'\n</parameter>\n';
 }).join('')+'</function>\n</tool_call>';
}
export function renderMessages(request,text,format='xml'){
 const policy=toolPolicy(request),messages=[],systems=[],pending=new Set();let seenConversation=false;
 for(const m of request.messages){
  if(m.role==='system'||m.role==='developer'){
   if(seenConversation)throw Error('System/developer messages must precede the conversation');
   systems.push(text(m.content));continue;
  }
  seenConversation=true;
  if(m.role==='assistant'){
   let content=withoutThinking(text(m.content));
   if(m.tool_calls?.length){
    for(const c of m.tool_calls){if(!c.id||pending.has(c.id))throw Error('Invalid historical tool call ID');pending.add(c.id);}
    content+=(content?'\n\n':'')+m.tool_calls.map(c=>callText(c,format)).join('\n');
   }
   messages.push({role:'assistant',content});
  }else if(m.role==='tool'){
   if(!pending.delete(m.tool_call_id))throw Error('Tool result does not match an outstanding call');
   const content='<tool_response>\n'+text(m.content)+'\n</tool_response>';
   if(messages.at(-1)?._tool)messages.at(-1).content+='\n'+content;
   else messages.push({role:'user',content,_tool:true});
  }else if(m.role==='user'){
   if(pending.size)throw Error('Missing tool result before user message');
   messages.push({role:'user',content:text(m.content)});
  }else throw Error('Unsupported message role');
 }
 if(pending.size)throw Error('Missing tool results');
 let system='';
 if(policy.available.length)system='# Tools\n\nYou have access to the following functions:\n\n<tools>\n'+policy.available.map(t=>JSON.stringify(t)).join('\n')+'\n</tools>\n\n'+(format==='json'?'For each function call, return a JSON object with the function name and arguments within <tool_call></tool_call> tags:\n<tool_call>\n{"name": <function-name>, "arguments": <args-json-object>}\n</tool_call>':TOOL_INSTRUCTIONS)+'\n\n';
 system+=systems.join('\n\n');
 if(policy.forced)system+='\nFor this response, call '+policy.forced+'.';
 else if(policy.choice==='required')system+='\nFor this response, call one of the available tools.';
 if(system)messages.unshift({role:'system',content:system});
 return messages.map(({role,content})=>({role,content}));
}
export function parseToolResponse(raw,request){
 const policy=toolPolicy(request),choice=raw.choices?.[0];
 if(!choice)throw Error('Model returned no completion');
 const content=withoutThinking(choice.message?.content||'');
 const start=content.indexOf('<tool_call>');
 if(start<0){
  if(/<\/?(?:tool_call|function=|parameter=)/.test(content))throw Error('Malformed tool-call output; nothing executed');
  if(policy.forced||policy.choice==='required')throw Error('Model did not produce the required tool call');
  return {...raw,choices:[{...choice,message:{...choice.message,content}}]};
 }
 if(policy.choice==='none'||!policy.available.length)throw Error('Model emitted a tool call with no tools enabled');
 if(choice.finish_reason==='length')throw Error('Truncated tool call; nothing executed');
 const calls=[];let rest=content.slice(start);
 while(rest.trim()){
  if(/^\s*<tool_call>\s*\{/.test(rest)){
   const block=/^\s*<tool_call>\s*([\s\S]*?)\s*<\/tool_call>/.exec(rest);
   if(!block)throw Error('Malformed JSON tool call; nothing executed');
   let parsed;try{parsed=JSON.parse(block[1]);}catch{throw Error('Malformed JSON tool arguments');}
   const {name,arguments:args}=parsed;
   if(!policy.byName.has(name)||(policy.forced&&name!==policy.forced))throw Error('Model selected an unavailable tool');
   if(!args||typeof args!=='object'||Array.isArray(args))throw Error('Tool arguments must be an object');
   calls.push({id:'call_'+crypto.randomUUID(),type:'function',function:{name,arguments:JSON.stringify(args)}});rest=rest.slice(block[0].length);continue;
  }
  const match=/^\s*<tool_call>\s*<function=([a-zA-Z0-9_-]+)>\s*([\s\S]*?)<\/function>\s*<\/tool_call>/.exec(rest);
  if(!match)throw Error('Malformed tool-call output or trailing text; nothing executed');
  const [,name,body]=match,entry=policy.byName.get(name);
  if(!entry||(policy.forced&&name!==policy.forced))throw Error('Model selected an unavailable tool');
  const args=Object.create(null);let tail=body;
  while(tail.trim()){
   const p=/^\s*<parameter=([a-zA-Z0-9_-]+)>([\s\S]*?)<\/parameter>/.exec(tail);
   if(!p||Object.hasOwn(args,p[1]))throw Error('Malformed or duplicate tool parameter');
   const key=p[1],value=p[2].replace(/^\r?\n/,'').replace(/\r?\n$/,'');
   const schema=entry.schema.properties?.[key];
   // Translate values, don't reimplement the CLI's tool validation. Preserve
   // unknown parameters and invalid typed values so the actual tool can respond.
   if(schema?.type==='string')args[key]=value;
   else {try{args[key]=JSON.parse(value);}catch{args[key]=value;}}
   tail=tail.slice(p[0].length);
  }
  calls.push({id:'call_'+crypto.randomUUID(),type:'function',function:{name,arguments:JSON.stringify(args)}});
  rest=rest.slice(match[0].length);
 }
 if(request.parallel_tool_calls===false&&calls.length>1)throw Error('Model produced multiple calls with parallel_tool_calls disabled');
 return {...raw,choices:[{...choice,message:{role:'assistant',content:content.slice(0,start).trim()||null,tool_calls:calls},finish_reason:'tool_calls'}]};
}
