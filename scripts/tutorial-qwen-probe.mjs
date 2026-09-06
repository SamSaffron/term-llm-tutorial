import {connect} from './shared-connect.mjs';
import {sendCLI} from './cli-input.mjs';
import {build} from 'esbuild';
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
const size=process.env.SIZE||'4',family=process.env.FAMILY||'3.5',id=`Qwen${family}-${size}B-q4f32_1-MLC`;
const revisions={'0.8':'4ed017713f04c91ffe55a9dca8c7ac853c41314d','2':'d835e5c41aa56174d915e8a3940cde599d3f5a30','4':'ce39652c7b493d59331e40ef9c7a87de5a47abe3'};
const dir=`evidence/tutorial-qwen${family}-${size}B`;await fs.mkdir(dir,{recursive:true});
let src=await fs.readFile('public/inference-worker.mjs','utf8');
src=src.replace('MODEL, adaptRequest','adaptRequest').replace('let engine,busy',`const MODEL='${id}';\nlet engine,busy`).replaceAll('Qwen3-8B',`Qwen${family}-${size}B`).replace('34026572351006ba1865d11319309b151d9ccf16',family==='3'?(size==='8'?'34026572351006ba1865d11319309b151d9ccf16':'b7e4eb1ba80728187fb5df44055cc1a7c32310e0'):revisions[size]);
if(family==='3.5')src=src.replace('[151643,151645]','[248044,248046]');
const result=await build({stdin:{contents:src,resolveDir:process.cwd()+'/public'},bundle:true,format:'esm',platform:'browser',write:false,minify:true});
const b=await connect(),p=await b.contexts()[0].newPage();
try{
 await p.route('**/inference-worker.js*',r=>r.fulfill({body:result.outputFiles[0].text,contentType:'application/javascript',headers:{'Cross-Origin-Embedder-Policy':'require-corp','Cross-Origin-Resource-Policy':'same-origin'}}));
 await p.addInitScript(()=>{window.qwenEvents=[];const W=Worker;window.Worker=class extends W{constructor(...a){super(...a);this.addEventListener('message',e=>{if(e.data.diagnostic||e.data.error||e.data.result)qwenEvents.push(e.data);});}};});
 await p.goto('https://wasnotwas.com/browser-linux-lab/');await p.locator('#launch-settings').evaluate(e=>e.open=true);await p.locator('#model').selectOption('qwen');await p.locator('#boot').click();
 await p.waitForFunction(()=>['ready','failed'].includes(document.body.dataset.phase),null,{timeout:240000});
 assert.equal(await p.evaluate(()=>document.body.dataset.phase),'ready',await p.locator('#status').textContent());
 console.log('LOADED',await p.locator('#effective').textContent());

 await sendCLI(p,"printf 'Picnic: Sunday at 12:00, Harbour Park. Four people, one vegetarian. Bring sandwiches, fruit, water and a blanket. If it rains, meet at the community hall.\\n' > notes.txt");
 const tasks=[['ask','term-llm ask "What are three useful things to bring to a picnic?"'],['file','term-llm ask -f notes.txt "Summarize our picnic plan in three bullets."'],['exec','term-llm exec --print-only "List the files in the current directory"'],['read','term-llm ask --tools read_file --yolo --max-turns 3 "Read notes.txt and tell me our rain plan."']];
 tasks.push(['conversation','term-llm ask "Help me plan a picnic for four people. Suggest three foods."'],['vegetarian','term-llm ask --resume= "One person is vegetarian. Adjust your suggestions."'],['remember','term-llm ask --resume= "Remind me of the dietary requirement."']);
 for(const [name,command]of tasks){
  await p.evaluate(()=>qwenEvents=[]);await sendCLI(p,command+`; printf "\\nTUTORIAL_${name}_DONE\\n"`);
  if(name==='exec'){await p.waitForFunction(()=>qwenEvents.some(e=>e.result?.choices?.[0]?.message?.tool_calls?.length),null,{timeout:90000});await p.waitForTimeout(800);await p.keyboard.press('Enter');}
  await p.waitForFunction(n=>document.querySelector('#raw').textContent.includes('\r\nTUTORIAL_'+n+'_DONE\r\n'),name,{timeout:150000});
  const events=await p.evaluate(()=>qwenEvents);await fs.writeFile(`${dir}/${name}.json`,JSON.stringify(events,null,2));await fs.writeFile(`${dir}/${name}.log`,await p.locator('#raw').textContent());
  console.log(name,JSON.stringify(events.filter(e=>e.diagnostic||e.error).map(e=>e.error||{raw:e.diagnostic.raw,usage:e.diagnostic.usage})).slice(0,7000));
 }
}catch(e){await fs.writeFile(dir+'/failure.log',await p.locator('#raw').textContent().catch(()=>''));await fs.writeFile(dir+'/failure.json',JSON.stringify({error:e.message,status:await p.locator('#status').textContent().catch(()=>''),events:await p.evaluate(()=>window.qwenEvents).catch(()=>[])},null,2));throw e;}
finally{await p.close();await b.close();}
