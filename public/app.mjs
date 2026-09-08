import {mountLaunchChoice,startProvider} from './launch-choice.mjs';
import {mountImagePanel} from './image-panel.mjs';
import {guestWebBridge} from './guest-web.mjs';
import {mountTutorial} from './tutorial.mjs';
import { V86 } from './assets/libv86.mjs';
import { loadingLine } from './loading-line.mjs';
import { fetchBootAssets } from './boot-assets.mjs';
import {createTerminal} from './terminal.mjs';
const $=id=>document.getElementById(id), enc=new TextEncoder(),dec=new TextDecoder();
const terminal=await createTerminal($('terminal'));const fit={fit:()=>terminal.fit()};
let vm,worker,ready=false,loaded=false,started=false,booting=false,serial='',lastRequest='',polling=false;
let selectedContext=16384,selectedModel='qwen',selectedImageSupport='off';
const modelNames={simulator:'Simulator',qwen:'Qwen3 8B',gemma:'Gemma 270M',functiongemma:'FunctionGemma 270M'};
const modelIds={simulator:'tutorial-simulator',qwen:'Qwen3-8B-q4f32_1-MLC',gemma:'onnx-community/gemma-3-270m-it-ONNX',functiongemma:'onnx-community/functiongemma-270m-it-ONNX'};
const web=guestWebBridge(()=>vm);
const tutorial=mountTutorial($('lesson'),{openWeb:()=>web.open().catch(e=>status(e.message)),saveChecklist:async()=>{try{const data=await vm.read_file('workspace/checklist.txt');const url=URL.createObjectURL(new Blob([data],{type:'text/plain'}));const a=document.createElement('a');a.href=url;a.download='checklist.txt';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}catch{status('No checklist.txt yet. Run the final lesson command first.');}}});
let modeChosen=false;
function updateLaunchSettings(){
 const sim=$('model').value==='simulator';
 $('launch-config-summary').textContent=sim?'Simulator · no GPU':`${modelNames[$('model').value]} · ${Number($('context').value)/1024}K`;
 $('context').disabled=sim||booting;
 $('mode-note').textContent=sim?'Scripted tutorial responses; the terminal, files, approvals and MCP tools are real. No model download or WebGPU required. Linux and CLI still download (~100 MB).':'Real Qwen inference on your GPU. First launch downloads ~4.6 GB of weights plus runtime; allow roughly 7–10 GB GPU memory. Downloads are cached when possible.';
}
$('model').addEventListener('change',()=>{modeChosen=true;updateLaunchSettings();});$('context').addEventListener('change',updateLaunchSettings);
let seq=0;const pending=new Map();
function event(text){$('events').textContent+=`${new Date().toISOString()} ${text}\n`;}
function status(text){if($('status').textContent===text)return;$('status').textContent=text;$('runtime-status').textContent=text;event(text);}
let failing=false;
let phase='idle', bootTimer, cliSerial='', terminalLive=false;
function controls(){$('stop').disabled=!worker&&!vm;}
function stage(name,label){phase=name;document.body.dataset.phase=name;status(label);loadingLine($('progress'),true);}
function resetWorker(reason){worker?.terminate();worker=null;loaded=false;for(const p of pending.values()){clearTimeout(p.timer);p.reject(Error(reason));}pending.clear();controls();}
async function fail(kind,error){if(failing)return;failing=true;clearTimeout(bootTimer);started=false;terminalLive=false;resetWorker(kind);images.reset();lastImageRequest='';lastDemoImage='';web.reset();await vm?.destroy();vm=null;ready=false;booting=false;phase='failed';document.body.dataset.phase=phase;$('workspace').hidden=true;$('launch').hidden=false;$('boot').disabled=false;$('boot').textContent=kind==='Stopped'?'Start again':'Try again';$('context').disabled=false;$('model').disabled=false;launchChoice.reset();$('image-start-guide').hidden=true;loadingLine($('progress'),false);status(`${kind}: ${error.message}. ${kind.includes('Model')?'Choose Simulator for a no-GPU tutorial, or use desktop Chrome with WebGPU and a smaller context. ':''}Retry starts a fresh Linux guest; guest files are lost.`);failing=false;}
function workerCall(type,request){
 if(!worker){worker=new Worker(selectedModel==='simulator'?'simulator-worker.js':selectedModel==='qwen'?'inference-worker.js':'gemma-worker.js',{type:'module'});worker.onmessage=({data})=>{
  if(data.diagnostic){$('model-raw').textContent=JSON.stringify(data.diagnostic,null,2);return;}
  if(data.progress){if(phase==='model'){status(data.progress.text);loadingLine($('progress'),true,data.progress.progress);}return;}
  const p=pending.get(data.id);if(!p)return;clearTimeout(p.timer);pending.delete(data.id);data.error?p.reject(Error(data.error)):p.resolve(data.result);
 };worker.onerror=e=>{resetWorker('Worker crashed: '+e.message+'; existing guest file preserved.');};}
 const id=++seq;return new Promise((resolve,reject)=>{const timer=setTimeout(()=>{resetWorker('Hard model deadline reached; existing guest file preserved. Download your checklist before restarting.');},type==='load'?600000:180000);pending.set(id,{resolve,reject,timer});worker.postMessage({id,type,request});controls();});
}
async function setImageProvider(provider){
 const target=vm;if(!target||!ready)throw Error('Start the tutorial first');
 const id=crypto.randomUUID();
 await target.create_file('image-provider.json',enc.encode(JSON.stringify({id,provider})));
 const deadline=Date.now()+45000;
 while(vm===target&&Date.now()<deadline){
  let result;try{result=JSON.parse(dec.decode(await target.read_file('image-provider-status.json')));}catch{}
  if(result?.id===id){if(result.error)throw Error(result.error);return;}
  await new Promise(r=>setTimeout(r,100));
 }
 throw Error('Image provider configuration timed out');
}
const images=mountImagePanel({
 textBusy:()=>pending.size>0||textReloading,
 suspendText:()=>{resetWorker('Text paused for Janus; reload text to continue.');$('effective').textContent=`${modelNames[selectedModel]} text paused · Janus image mode`;},
 resumeText:async()=>{
  textReloading=true;
  try{const result=await workerCall('load',{context:selectedContext,backend:selectedModel});loaded=true;$('effective').textContent=selectedModel==='simulator'?'SIMULATOR · scripted responses · real terminal, files and tools':`${modelNames[selectedModel]} · ${result.precision} · ${result.context/1024}K context limit`;status('Text ready · Linux files retained');}
  finally{textReloading=false;}
  $('image-panel').append($('image-result'));$('image-start-guide').hidden=true;
 },textLabel:()=>modelNames[selectedModel],selectProvider:setImageProvider,
});
let textReloading=false,lastImageRequest='',lastDemoImage='';
const launchChoice=mountLaunchChoice($);
$('image-copy').onclick=()=>navigator.clipboard.writeText($('image-example').textContent).catch(e=>status(`Copy failed: ${e.message}`));
$('image-controls-link').onclick=()=>{$('image-panel').open=true;$('image-panel').scrollIntoView({behavior:'smooth'});};
$('stop').onclick=()=>fail('Stopped',Error('GPU and Linux released'));
terminal.onData(data=>{if(terminalLive)vm?.serial0_send(data);});
$('boot').onclick=async()=>{
 if(!launchChoice.allowed)return;selectedImageSupport=launchChoice.imageSupport;launchChoice.start();$('launch-settings').open=false;window.scrollTo({top:0,behavior:'instant'});booting=true;$('context').disabled=true;$('model').disabled=true;$('boot').disabled=true;serial='';cliSerial='';lastRequest='';tutorial.reset();web.reset();$('model-raw').textContent='';selectedContext=Number($('context').value);selectedModel=$('model').value;terminal.reset();
 stage('assets','Checking Linux assets · downloading and verifying SHA-256');
 try{
 const bootAssets=await fetchBootAssets();
 stage('linux','Starting real Linux · waiting for guest shell');
 bootTimer=setTimeout(()=>fail('Linux failed',Error('Boot/setup deadline reached')),180000);
 vm=new V86({wasm_path:'assets/v86.wasm',memory_size:512*1024*1024,vga_memory_size:8*1024*1024,...bootAssets,filesystem:{},cmdline:'console=ttyS0 tsc=reliable mitigations=off random.trust_cpu=on',autostart:true,disable_keyboard:true,disable_speaker:true});
 let injecting=false;
 vm.add_listener('serial0-output-byte',b=>{const c=String.fromCharCode(b);serial=(serial+c).slice(-24000);$('raw').textContent=serial;
  if(terminalLive && /\r?\nLAB_CLI_EXIT\r?\n$/.test(serial)){clearTimeout(bootTimer);serial='';cliSerial='';started=false;status('Linux shell · run chat to reopen term-llm');}
  if(terminalLive){terminal.write(Uint8Array.of(b));cliSerial=(cliSerial+c).slice(-16000);
   // Observe the real TUI composer, not merely a launched process or a timer.
   if(!started && /Type a message/.test(cliSerial.replace(/\x1b\[[0-?]*[ -/]*[@-~]/g,''))){clearTimeout(bootTimer);started=true;loadingLine($('progress'),false);phase='ready';document.body.dataset.phase=phase;$('launch').hidden=true;$('workspace').hidden=false;status('Ready · term-llm chat');controls();if(document.body.dataset.tab==='chat')terminal.focus();resizeTerminal();}
  }
  if(!injecting && serial.endsWith('~% ')){injecting=true;installGuest().catch(e=>fail('CLI setup failed',e));}
  if(!ready && /\r?\nLAB_READY\r?\n/.test(serial)){ready=true;clearTimeout(bootTimer);loadAndStart();}
 });
 }catch(e){await fail('Linux assets failed',e);}
};
async function loadAndStart(){
 try{await startProvider(selectedImageSupport,{startText:async()=>{
  stage('model',selectedModel==='simulator'?'Starting simulator · no model download':`Loading ${modelNames[selectedModel]} · checking local WebGPU`);
  const result=await workerCall('load',{context:selectedContext,backend:selectedModel});loaded=true;$('effective').textContent=selectedModel==='simulator'?'SIMULATOR · scripted responses · real terminal, files and tools':`${modelNames[selectedModel]} · ${result.precision} · ${result.context/1024}K context limit`;$('allocation').textContent=JSON.stringify(result,null,2);
 },prepareImages:async()=>{
  $('image-start-guide').hidden=false;
  images.prepare(); // No model load: consent stays in the existing panel.
 } });}catch(e){await fail('Model unavailable',e);return;}
 terminal.reset();terminalLive=true;cliSerial='';started=true;phase='ready';document.body.dataset.phase=phase;loadingLine($('progress'),false);$('launch').hidden=true;$('workspace').hidden=false;status(selectedImageSupport==='janus'?'Linux shell · enable Janus below':'Linux shell · start with the lesson on the right');controls();resizeTerminal();vm.serial0_send('\n');terminal.focus();
 if(selectedImageSupport==='demo'){$('image-start-guide').hidden=false;$('image-example').textContent='term-llm image cat -o cat.png';$('image-start-status').textContent='Demo provider · canned drawings';}
 if(selectedImageSupport==='janus')$('image-panel').scrollIntoView({behavior:'instant'});
}
let resizeTimer;function resizeTerminal(){clearTimeout(resizeTimer);resizeTimer=setTimeout(async()=>{const container=$('terminal');if(container.clientWidth<40||container.clientHeight<40)return;
 // Reserve the actual header/status/tab rows, including wrapping at browser zoom.
 // Document coordinates keep this stable when the user scrolls to diagnostics.
 const top=container.getBoundingClientRect().top+window.scrollY;
 container.style.maxHeight=`${Math.max(160,(window.visualViewport?.height||innerHeight)-top-16)}px`;
 fit.fit();const cols=Math.min(240,Math.max(2,terminal.cols)),rows=Math.min(80,Math.max(1,terminal.rows));terminal.resize(cols,rows);if(vm&&ready)try{await vm.create_file('geometry.json',enc.encode(JSON.stringify({cols,rows})));}catch{}},80);}
const layoutObserver=new ResizeObserver(resizeTerminal);
for(const element of [$('terminal'),document.querySelector('.workspace-bar'),document.querySelector('.tabs'),document.querySelector('#chat-pane h2')])layoutObserver.observe(element);
function selectTab(name){document.body.dataset.tab=name;for(const tab of ['chat','guide']){$('tab-'+tab).setAttribute('aria-selected',String(tab===name));}resizeTerminal();if(name==='chat')terminal.focus();}
$('tab-chat').onclick=()=>selectTab('chat');$('tab-guide').onclick=()=>selectTab('guide');
for(const name of ['chat','guide'])$('tab-'+name).onkeydown=e=>{if(['ArrowLeft','ArrowRight'].includes(e.key)){e.preventDefault();const other=name==='chat'?'guide':'chat';selectTab(other);$('tab-'+other).focus();}};

window.addEventListener('resize',resizeTerminal);
window.visualViewport?.addEventListener('resize',resizeTerminal);
document.fonts.ready.then(resizeTerminal);
async function installGuest(){
 stage('setup','Installing real CLI · transferring guest tools');
 for(const [name,url] of [['term-llm','assets/term-llm'],['guest-bridge','assets/guest-bridge'],['git','assets/git'],['picnic-mcp','assets/picnic-mcp'],['zsh-root.tar','assets/zsh-root.tar.gz'],['guest-config.yaml','guest-config.yaml'],['boot.sh','boot.sh']]){
  const target=vm;const r=await fetch(url,{signal:AbortSignal.timeout(120000)});if(vm!==target)throw Error('Guest stopped');if(!r.ok)throw Error(`${url}: HTTP ${r.status}`);let bytes=new Uint8Array(await (name==='zsh-root.tar'?new Response(r.body.pipeThrough(new DecompressionStream('gzip'))):r).arrayBuffer());if(name==='guest-config.yaml')bytes=enc.encode(dec.decode(bytes).replace('context_window: 4096',`context_window: ${selectedContext}`).replace(modelIds.qwen,modelIds[selectedModel]).replace('__WEB_BASE__',web.base).replace('__IMAGE_PROVIDER__',selectedImageSupport==='off'?'images-off':selectedImageSupport));if(vm!==target)throw Error('Guest stopped');await target.create_file(name,bytes);
 }
 await vm.create_file('web-base',enc.encode(web.base));
 vm.serial0_send('. /mnt/boot.sh\n');
}
async function poll(){
 if(!ready||polling)return;polling=true;const target=vm;
 try{
  let demo;try{const raw=await target.read_file('image-demo-result.json');if(raw.length<128*1024)demo=JSON.parse(dec.decode(raw));}catch{}
  if(demo?.id&&demo.id!==lastDemoImage){lastDemoImage=demo.id;images.preview(demo,'data:image/png;base64,'+demo.png);}
  let image;try{const bytes=await target.read_file('image-request.json');if(bytes.length<=8192)image=JSON.parse(dec.decode(bytes));}catch{}
  if(typeof image?.id==='string'&&image.id!==lastImageRequest){
   lastImageRequest=image.id;
   (async()=>{let reply;try{status('Generating Janus image locally · text paused');reply={id:image.id,...await images.generate(image)};if(vm===target&&terminalLive)status('Janus PNG ready for the guest · Reload text to continue text lessons');}catch(e){reply={id:image.id,error:e.message};if(vm===target&&terminalLive){$('image-status').textContent=`Image request failed: ${e.message}`;status(`Image request failed: ${e.message}`);}}if(vm===target&&ready)await target.create_file('image-response.json',enc.encode(JSON.stringify(reply)));})().catch(e=>status(`Image bridge write failed: ${e.message}`));
  }
  let envelope;try{const bytes=await target.read_file('request.json');if(bytes.length<=256*1024)envelope=JSON.parse(dec.decode(bytes));}catch{}
  if(envelope?.id&&envelope.id!==lastRequest){
   lastRequest=envelope.id;controls();status('Generating locally');event(`Guest HTTP request ${envelope.id}: ${envelope.request.messages?.length} messages, ${(envelope.request.tools||[]).length} tools`);
   // Keep terminal/lesson UI responsive while inference runs.
   (async()=>{let reply;try{if(images.blocksText)throw Error('Text paused for Janus. Use Reload text in Optional image generation.');if(!loaded)throw Error('Model not loaded');reply={id:envelope.id,response:await workerCall('complete',envelope.request)};event(`Local inference returned ${reply.response.choices[0].finish_reason}`);status(`Response ready · local ${modelNames[selectedModel]}`);}catch(e){reply={id:envelope.id,error:e.message};status(`Inference failed: ${e.message}`);}if(vm===target&&ready){await target.create_file('response.json',enc.encode(JSON.stringify(reply)));controls();}})().catch(e=>status(`Bridge write failed: ${e.message}`));
  }
 }finally{polling=false;}
}
setInterval(()=>poll().catch(e=>event(`Poll error: ${e.message}`)),400);
window.addEventListener('beforeunload',()=>{images.reset();web.reset();worker?.terminate();vm?.destroy();});
event(`crossOriginIsolated=${crossOriginIsolated}; SharedArrayBuffer=${typeof SharedArrayBuffer}; WebGPU=${!!navigator.gpu}`);
// Read-only diagnostics plus genuine serial/file APIs for reproducible isolated tests.
window.lab={get imageState(){return images.state;},get graphics(){return terminal.graphics;},get resources(){return terminal.resources;},get webResponse(){return web.lastResponse;},get vm(){return vm;},get serial(){return serial;},get ready(){return ready;},get loaded(){return loaded;},get phase(){return phase;},get started(){return started;},get screen(){return terminal.screen;},get geometry(){return {cols:terminal.cols,rows:terminal.rows};}};

updateLaunchSettings();
(async()=>{
 let available=false;try{available=!!(await navigator.gpu?.requestAdapter({powerPreference:'high-performance'}));}catch{}
 if(!available&&!booting&&!modeChosen){$('model').value='simulator';updateLaunchSettings();$('capability-note').textContent='No WebGPU adapter detected. Simulator is ready for you.';}
})();

launchChoice.reset();
