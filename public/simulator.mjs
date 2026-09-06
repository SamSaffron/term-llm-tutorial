// Explicitly scripted tutorial provider. No model, network, GPU or filesystem access.
// The real CLI executes any returned tool calls; answers use only supplied context.
export const SIMULATOR_MODEL='tutorial-simulator';
const text=c=>typeof c==='string'?c:Array.isArray(c)?c.filter(p=>p.type==='text').map(p=>p.text).join('\n'):'';
export function simulate(request){
 if(!Array.isArray(request.messages)||!request.messages.length)throw Error('Messages required');
 const messages=request.messages,lastUser=messages.findLastIndex(m=>m.role==='user');
 const input=text(messages[lastUser]?.content),question=input.replace(/<<<<< (?:FILE:[\s\S]*?|STDIN) >>>>>[\s\S]*?<<<<< END (?:FILE|STDIN) >>>>>/g,'').trim();
 const q=question.toLowerCase();
 const supplied=[...input.matchAll(/<<<<< (?:FILE:[^\n]+|STDIN) >>>>>\n([\s\S]*?)<<<<< END (?:FILE|STDIN) >>>>>/g)].map(m=>m[1]);
 const results=messages.slice(lastUser+1).filter(m=>m.role==='tool');
 let context=results.length?results.map(m=>text(m.content).replace(/^\d+: ?/gm,'')).join('\n'):supplied.join('\n');
 const tools=request.tool_choice==='none'?[]:(request.tools||[]);
 const forced=typeof request.tool_choice==='object'?request.tool_choice.function?.name:null;
 const tool=name=>tools.some(t=>t.type==='function'&&t.function?.name===name)&&(!forced||forced===name);
 const call=(name,args)=>({role:'assistant',content:null,tool_calls:[{id:'call_'+crypto.randomUUID(),type:'function',function:{name,arguments:JSON.stringify(args)}}]});
 let message;
 if(tool('suggest_commands')){
  let commands;
  if(/list|files|directory contents/.test(q))commands=[['ls','List visible files.'],['ls -la','Include hidden files and details.'],['find . -maxdepth 1 -type f','List regular files in this directory.']];
  else if(/where|current directory|working directory/.test(q))commands=[['pwd','Show the current directory.'],['pwd -P','Show its physical path.'],['printf "%s\\n" "$PWD"','Print the shell’s current directory.']];
  else if(/disk|space|storage/.test(q))commands=[['df -h','Show filesystem space.'],['du -sh .','Show this directory’s total size.'],['du -h .','Show directory sizes.']];
  if(commands)message=call('suggest_commands',{suggestions:commands.map(([command,explanation],i)=>({command,explanation,likelihood:10-i}))});
 }else if(tool('read_file')&&!results.length&&/read|file|notes|rain/.test(q)){
  const path=question.match(/(?:\.?\.?\/|\/)?[\w./-]+\.(?:txt|md|log|csv)\b/)?.[0];
  if(path)message=call('read_file',{path});
 }
 if(!message){
  let answer;
  if(results.length&&/permission denied|denied|no such file|not found|\berror\b/i.test(context))answer='The real file tool could not complete the read:\n\n'+context+'\n\nCheck the filename with ls, or review the permission request. I have not read the file successfully.';
  else if(context){
   const lines=context.trim().split(/\n/).filter(Boolean),rain=context.match(/(?:If|When)[^.\n]*rain[^.\n]*[.?!]?/i)?.[0];
   const bring=context.match(/\bBring\s+([^.!\n]+)/i)?.[1];
   if(/rain|weather/.test(q))answer=rain||'The supplied text does not specify a rain plan. Here is what it actually says:\n\n'+context.trim();
   else if(/checklist|pack/.test(q)){
    const items=bring?bring.split(/,\s*|\s+and\s+/).filter(Boolean):lines;
    answer=items.slice(0,5).map(x=>'- '+x.trim()).join('\n');
    if(rain&&items.length<5)answer+='\n- '+rain;
   }else if(/summari|bullet/.test(q))answer=lines.slice(0,3).map(x=>'- '+x).join('\n')+(lines.length>3?'\n  '+lines.slice(3).join(' '):'');
   else answer='From the text you supplied:\n\n'+context.trim();
  }else if(/remind|remember|dietary|restriction/.test(q)){
   const prior=messages.slice(0,lastUser).filter(m=>m.role==='user').map(m=>text(m.content)).join('\n');
   const diet=prior.match(/\b(?:vegan|vegetarian|gluten[- ]free|nut[- ]free)\b/i)?.[0];
   answer=diet?`You said one guest is ${diet}. Keep that requirement in mind when choosing food.`:'You have not supplied a dietary requirement in this conversation yet. Try “One person is vegetarian.” Then ask me to remember it.';
  }else if(/vegetarian|vegan|gluten[- ]free|nut[- ]free/.test(q)){
   answer=/vegan|vegetarian/.test(q)?'Here are three meat-free options:\n\n1. Hummus and roasted-vegetable sandwiches.\n2. A fresh fruit platter.\n3. A chickpea salad with cucumber and lemon dressing.\n\nKeep the vegetarian portions separate from any meat dishes.':/gluten/.test(q)?'Try rice salad, fruit and sandwiches made with certified gluten-free bread. Check ingredient labels and avoid cross-contact.':'Try sandwiches, fresh fruit and vegetable sticks. Check all ingredient labels for nuts and avoid cross-contact.';
  }else if(/picnic|three foods|bring|sandwich/.test(q))answer=/food|meal/.test(q)?'Three easy picnic foods:\n\n1. Sandwiches with fillings your guests enjoy.\n2. A fresh fruit platter.\n3. A pasta or chickpea salad.\n\nTell me about a dietary requirement to practise a follow-up.':'Three useful picnic essentials:\n\n1. A blanket to sit on.\n2. Water in refillable bottles.\n3. A cooler bag to keep food fresh.';
  else if(/^(hi|hello|hey)[!. ]*$/.test(q))answer='Hello! This is the tutorial simulator, not a language model. Try a picnic question, supply notes.txt, or ask for a shell command with tl exec.';
  else if(/\b(pipe|stdin)\b/.test(q))answer='A pipe (|) sends one command’s output into another command. Try:\n\ncat notes.txt | tl ask "What should we do if it rains?"';
  else if(/\bpwd\b/.test(q))answer='pwd prints the current working directory: the folder your shell commands run in. It does not change directories or modify files. I have not run it; type pwd in the terminal to try it yourself.';
  else if(/\bmcp\b/.test(q))answer='MCP connects term-llm to tools. Try tl mcp list, then tl mcp info picnic. tl mcp run picnic checklist guests=4 calls the real local tool directly—no simulated answer is involved.';
  else answer='This is a scripted tutorial simulator, not a general AI. I can practise picnic questions and dietary follow-ups, summarize supplied notes, and demonstrate file tools and basic shell suggestions.\n\nTry: tl ask -f notes.txt "Summarize our picnic plan in three bullets."\n\nFor open-ended questions, restart with Qwen selected on a WebGPU-capable device.';
  if(forced||request.tool_choice==='required')throw Error('Simulator does not support this required tool request. Try the lesson’s file-listing example, or use Qwen for open-ended requests.');
  message={role:'assistant',content:answer};
 }
 return {id:'sim-'+crypto.randomUUID(),object:'chat.completion',created:Math.floor(Date.now()/1000),model:SIMULATOR_MODEL,choices:[{index:0,message,finish_reason:message.tool_calls?'tool_calls':'stop'}],usage:{prompt_tokens:0,completion_tokens:0,total_tokens:0}};
}
