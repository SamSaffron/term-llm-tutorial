import {mountLaunchChoice} from './launch-choice.mjs';
import {ImageGenerator} from './image-generator.mjs';
import {SessionModels} from './session-models.mjs';
import {confirmJanus} from './janus-consent.mjs';
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
const modelNames={simulator:'Simulator',qwen:'Qwen3 8B',bonsai:'Bonsai 8B Q1',gemma:'Gemma 270M',functiongemma:'FunctionGemma 270M'};
const modelIds={simulator:'tutorial-simulator',qwen:'Qwen3-8B-q4f32_1-MLC',bonsai:'prism-ml/Bonsai-8B-Q1_0',gemma:'onnx-community/gemma-3-270m-it-ONNX',functiongemma:'onnx-community/functiongemma-270m-it-ONNX'};
const web=guestWebBridge(()=>vm);
const tutorial=mountTutorial($('lesson'),{openWeb:()=>web.open().catch(e=>status(e.message)),saveChecklist:async()=>{try{const data=await vm.read_file('workspace/checklist.txt');const url=URL.createObjectURL(new Blob([data],{type:'text/plain'}));const a=document.createElement('a');a.href=url;a.download='checklist.txt';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}catch{status('No checklist.txt yet. Run the final lesson command first.');}}});
let modeChosen=false;
function updateLaunchSettings(){
 const sim=$('model').value==='simulator';
 $('launch-config-summary').textContent=sim?'Simulator · no GPU':`${modelNames[$('model').value]} · ${Number($('context').value)/1024}K`;
 $('context').disabled=sim||booting;
 $('mode-note').textContent=sim?'Scripted tutorial responses; the terminal, files, approvals and MCP tools are real. No model download or WebGPU required. Linux and CLI still download (~100 MB).':$('model').value==='bonsai'?'Real Bonsai Q1 inference on your GPU. First launch downloads 1.16 GB of weights plus tokenizer/runtime. Uses f32 activation and q8 KV; larger contexts need more GPU memory. Cache is best effort; no CPU or cloud fallback.':'Real Qwen inference on your GPU. First launch downloads ~4.6 GB of weights plus runtime; the tested 16K runtime allocates roughly 10 GB of GPU buffers. Downloads are cached when possible.';
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
async function fail(kind,error){if(failing)return;failing=true;clearTimeout(bootTimer);started=false;terminalLive=false;models.reset();janusConsent=false;lastImageRequest='';web.reset();await vm?.destroy();vm=null;ready=false;booting=false;phase='failed';document.body.dataset.phase=phase;$('workspace').hidden=true;$('launch').hidden=false;$('boot').disabled=false;$('boot').textContent=kind==='Stopped'?'Start again':'Try again';$('context').disabled=false;$('model').disabled=false;launchChoice.reset();loadingLine($('progress'),false);status(`${kind}: ${error.message}. ${kind.includes('Model')?'Choose Simulator for a no-GPU tutorial, or use desktop Chrome with WebGPU and a smaller context. ':''}Retry starts a fresh Linux guest; guest files are lost.`);failing=false;}
function workerCall(type,request){
 if(!worker){worker=new Worker(selectedModel==='simulator'?'simulator-worker.js':selectedModel==='qwen'?'inference-worker.js':selectedModel==='bonsai'?'bonsai-worker.js':'gemma-worker.js',{type:'module'});worker.onmessage=({data})=>{
  if(data.fatal){resetWorker(data.fatal);$('effective').textContent=`${modelNames[selectedModel]} unavailable · GPU device lost`;status(data.fatal);return;}
  if(data.diagnostic){$('model-raw').textContent=JSON.stringify(data.diagnostic,null,2);return;}
  if(data.progress){if(phase==='model'||started){status(data.progress.text);loadingLine($('progress'),true,data.progress.progress);}return;}
  const p=pending.get(data.id);if(!p)return;clearTimeout(p.timer);pending.delete(data.id);data.error?p.reject(Error(data.error)):p.resolve(data.result);
 };worker.onerror=e=>{resetWorker('Worker crashed: '+e.message+'; existing guest file preserved.');};}
 const id=++seq;return new Promise((resolve,reject)=>{const timer=setTimeout(()=>{resetWorker('Hard model deadline reached; existing guest file preserved. Download your checklist before restarting.');},type==='load'?600000:180000);pending.set(id,{resolve,reject,timer});worker.postMessage({id,type,request});controls();});
}
let janusConsent=false,lastImageRequest='';
const images=new ImageGenerator({progress:p=>{
 if(p.status==='progress'||p.status==='initiate')status(`Loading Janus · ${p.file}`);
}});
const models=new SessionModels({
 text:{ready:()=>loaded,unload:()=>resetWorker('Model released'),load:async()=>{
  status(`Loading ${modelNames[selectedModel]}`);
  try{const result=await workerCall('load',{context:selectedContext,backend:selectedModel});loaded=true;
   $('allocation').textContent=JSON.stringify(result,null,2);
  }finally{loadingLine($('progress'),false);}
 }},
 images:{ready:()=>images.state==='ready',unload:()=>images.reset(),load:async()=>{
  if(selectedImageSupport!=='janus'||!janusConsent)throw Error('Janus was not selected and accepted at boot');
  status('Loading Janus · cached weights used when available');await images.load(true);
 }},
});
const launchChoice=mountLaunchChoice($);
$('stop').onclick=()=>fail('Stopped',Error('GPU and Linux released'));
terminal.onData(data=>{if(terminalLive)vm?.serial0_send(data);});
$('boot').onclick=async()=>{
 if(!launchChoice.allowed)return;
 selectedImageSupport=launchChoice.imageSupport;selectedModel=$('model').value;selectedContext=Number($('context').value);
 launchChoice.start();booting=true;$('context').disabled=true;$('model').disabled=true;
 if(selectedImageSupport==='janus'){
  janusConsent=await confirmJanus($('janus-consent'));
  if(!janusConsent){booting=false;$('model').disabled=false;launchChoice.reset();updateLaunchSettings();return;}
 }
 $('launch-settings').open=false;window.scrollTo({top:0,behavior:'instant'});serial='';cliSerial='';lastRequest='';tutorial.reset();web.reset();$('model-raw').textContent='';terminal.reset();
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
 try{stage('model','Loading selected models');await models.run(selectedImageSupport==='janus'?'images':'text',async()=>{});}
 catch(e){await fail('Model unavailable',e);return;}
 $('effective').textContent=`${selectedModel==='simulator'?'SIMULATOR · scripted text':modelNames[selectedModel]} · images: ${selectedImageSupport==='janus'?'Janus':selectedImageSupport==='demo'?'Demo (canned)':'off'}`;
 terminal.reset();terminalLive=true;cliSerial='';started=true;phase='ready';document.body.dataset.phase=phase;loadingLine($('progress'),false);$('launch').hidden=true;$('workspace').hidden=false;status('Linux shell · start with the lesson on the right');controls();resizeTerminal();vm.serial0_send('\n');terminal.focus();
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
  let image;try{const bytes=await target.read_file('image-request.json');if(bytes.length<=8192)image=JSON.parse(dec.decode(bytes));}catch{}
  if(typeof image?.id==='string'&&image.id!==lastImageRequest){
   lastImageRequest=image.id;
   (async()=>{let reply;try{reply={id:image.id,...await models.run('images',async()=>{status('Generating Janus image locally');const result=await images.generate(image);const png=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=reject;reader.readAsDataURL(result.blob);});const {blob,...metadata}=result;return {...metadata,png:png.split(',')[1]};})};if(vm===target&&terminalLive)status('Image ready');}catch(e){reply={id:image.id,error:e.message};if(vm===target&&terminalLive){status(`Image request failed: ${e.message}`);}}if(vm===target&&ready)await target.create_file('image-response.json',enc.encode(JSON.stringify(reply)));})().catch(e=>status(`Image bridge write failed: ${e.message}`));
  }
  let envelope;try{const bytes=await target.read_file('request.json');if(bytes.length<=256*1024)envelope=JSON.parse(dec.decode(bytes));}catch{}
  if(envelope?.id&&envelope.id!==lastRequest){
   lastRequest=envelope.id;controls();status('Generating locally');event(`Guest HTTP request ${envelope.id}: ${envelope.request.messages?.length} messages, ${(envelope.request.tools||[]).length} tools`);
   // Keep terminal/lesson UI responsive while inference runs.
   (async()=>{let reply;try{reply={id:envelope.id,response:await models.run('text',()=>workerCall('complete',envelope.request))};event(`Local inference returned ${reply.response.choices[0].finish_reason}`);status(`Response ready · local ${modelNames[selectedModel]}`);}catch(e){reply={id:envelope.id,error:e.message};status(`Inference failed: ${e.message}`);}if(vm===target&&ready){await target.create_file('response.json',enc.encode(JSON.stringify(reply)));controls();}})().catch(e=>status(`Bridge write failed: ${e.message}`));
  }
 }finally{polling=false;}
}
setInterval(()=>poll().catch(e=>event(`Poll error: ${e.message}`)),400);
window.addEventListener('beforeunload',()=>{models.reset();web.reset();vm?.destroy();});
event(`crossOriginIsolated=${crossOriginIsolated}; SharedArrayBuffer=${typeof SharedArrayBuffer}; WebGPU=${!!navigator.gpu}`);
// Read-only diagnostics plus genuine serial/file APIs for reproducible isolated tests.
window.lab={get imageState(){return images.state;},get graphics(){return terminal.graphics;},get resources(){return terminal.resources;},get webResponse(){return web.lastResponse;},get vm(){return vm;},get serial(){return serial;},get ready(){return ready;},get loaded(){return loaded;},get phase(){return phase;},get started(){return started;},get screen(){return terminal.screen;},get geometry(){return {cols:terminal.cols,rows:terminal.rows};}};

updateLaunchSettings();
(async()=>{
 let available=false;try{available=!!(await navigator.gpu?.requestAdapter({powerPreference:'high-performance'}));}catch{}
 if(!available&&!booting&&!modeChosen){$('model').value='simulator';updateLaunchSettings();$('capability-note').textContent='No WebGPU adapter detected. Simulator is ready for you.';}
})();

launchChoice.reset();
