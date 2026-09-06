// FunctionGemma transport only. Argument meaning/validation belongs to term-llm.
export function functionMessages(request){
 const calls=new Map(),messages=[];const systems=[];
 for(const message of request.messages||[]){
  const m={...message};
  if(m.role==='system'||m.role==='developer'){systems.push(typeof m.content==='string'?m.content:'');continue;}
  if(m.tool_calls)m.tool_calls=m.tool_calls.map(c=>{calls.set(c.id,c.function.name);return {...c,function:{...c.function,arguments:typeof c.function.arguments==='string'?JSON.parse(c.function.arguments):c.function.arguments}};});
  if(m.role==='tool'){m.name=m.name||calls.get(m.tool_call_id);if(!m.name)throw Error('Tool result has no matching call name');}
  messages.push(m);
 }
 const choice=request.tool_choice??'auto';let tools=request.tools||[];
 if(choice==='none')tools=[];
 else if(typeof choice==='object'){tools=tools.filter(t=>t.function.name===choice.function?.name);if(!tools.length)throw Error('Unknown tool_choice function');}
 else if(!['auto','required'].includes(choice))throw Error('Unsupported tool_choice');
 const prefix=tools.length?'You are a model that can do function calling with the following functions':'';
 let system=systems.filter(Boolean).join('\n');
 if(choice==='required'||typeof choice==='object')system+='\nCall one of the provided functions for this response.';
 // Keep Google's trigger immediately adjacent to the function declarations.
 system=[system,prefix].filter(Boolean).join('\n');
 if(system)messages.unshift({role:'developer',content:system});
 return {messages,tools};
}
export function parseFunctionGemma(text,request,finishReason='stop'){
 const START='<start_function_call>',END='<end_function_call>';
 const clean=text.replace(/(?:<eos>|<end_of_turn>|<start_function_response>)\s*$/g,'').trim();
 if(!clean.includes(START)){
  if(request.tool_choice==='required'||typeof request.tool_choice==='object')throw Error('Model did not return the required function call');
  return {role:'assistant',content:clean};
 }
 if(finishReason==='length')throw Error('Truncated function call; not executable');
 const allowed=new Set(request.tool_choice==='none'?[]:(request.tools||[]).map(t=>t.function.name));
 const named=typeof request.tool_choice==='object'?request.tool_choice.function?.name:null;
 const first=clean.indexOf(START),content=clean.slice(0,first).trim()||null,calls=[];let offset=first;
 while(offset<clean.length){
  while(/\s/.test(clean[offset]||'')&&offset<clean.length)offset++;
  if(offset===clean.length)break;
  if(!clean.startsWith(START,offset))throw Error('Unexpected suffix after function call');
  offset+=START.length;
  if(clean.startsWith('error:',offset))throw Error('FunctionGemma reported: '+clean.slice(offset).replace(/<[^>]+>/g,'').slice(0,500));
  const name=/^call:([\w.-]+)/.exec(clean.slice(offset));if(!name)throw Error('Malformed function name');offset+=name[0].length;
  if(!allowed.has(name[1])||(named&&named!==name[1]))throw Error('Function not offered by caller');
  const parser=new Values(clean,offset);const args=parser.value();offset=parser.i;
  if(!args||typeof args!=='object'||Array.isArray(args))throw Error('Function arguments must be an object');
  parser.ws();offset=parser.i;if(!clean.startsWith(END,offset))throw Error('Incomplete function call');offset+=END.length;
  calls.push({id:'call_'+crypto.randomUUID(),type:'function',function:{name:name[1],arguments:JSON.stringify(args)}});
 }
 if(request.parallel_tool_calls===false&&calls.length>1)throw Error('Multiple function calls with parallel_tool_calls disabled');
 return {role:'assistant',content,tool_calls:calls};
}
class Values{
 constructor(s,i){this.s=s;this.i=i;this.depth=0;}
 ws(){while(this.i<this.s.length&&/\s/.test(this.s[this.i]))this.i++;}
 value(){
  if(++this.depth>64)throw Error('Function argument nesting too deep');this.ws();let v;
  if(this.s.startsWith('<escape>',this.i)){this.i+=8;const end=this.s.indexOf('<escape>',this.i);if(end<0)throw Error('Unclosed function string');v=this.s.slice(this.i,end);this.i=end+8;}
  else if(this.s[this.i]==='{'){
   v=Object.create(null);this.i++;this.ws();
   while(this.s[this.i]!=='}'){
    let key;if(this.s.startsWith('<escape>',this.i))key=this.value();else{const m=/^[^\s:{}\[\],]+/.exec(this.s.slice(this.i));if(!m)throw Error('Malformed argument key');key=m[0];this.i+=key.length;}
    this.ws();if(this.s[this.i++]!==':'||Object.hasOwn(v,key))throw Error('Malformed or duplicate argument key');v[key]=this.value();this.ws();if(this.s[this.i]!==',')break;this.i++;this.ws();
   }
   if(this.s[this.i++]!=='}')throw Error('Unclosed argument object');
  }else if(this.s[this.i]==='['){v=[];this.i++;this.ws();while(this.s[this.i]!==']'){v.push(this.value());this.ws();if(this.s[this.i]!==',')break;this.i++;this.ws();}if(this.s[this.i++]!==']')throw Error('Unclosed argument array');}
  else {const m=/^(?:true|false|null|-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?)/.exec(this.s.slice(this.i));if(!m)throw Error('Malformed argument value');v=JSON.parse(m[0]);this.i+=m[0].length;}
  this.depth--;return v;
 }
}
