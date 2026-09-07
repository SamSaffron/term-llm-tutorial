// Local static integration in a NEW shared-browser tab; no remote publication.
// Never restart the browser or close unrelated tabs. Inference is not mocked.
import {connect} from './shared-connect.mjs';
import {sendCLI} from './cli-input.mjs';
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
const staged=process.env.IMAGE_TEST_STAGED==='1';
const assetRoot=staged?'hosting/site/learn':'public';
const manifest=staged?JSON.parse(await fs.readFile('hosting/asset-manifest.json','utf8')):[];
const imagesFirst=process.env.IMAGE_TEST_LAUNCH==='1';
const qwen=imagesFirst||process.env.IMAGE_TEST_QWEN==='1';
const dir='evidence/optional-janus'+(imagesFirst?'-launch':'')+(qwen?'-qwen':'')+(staged?'-staged':'');await fs.mkdir(dir,{recursive:true});
const b=await connect(),p=await b.contexts()[0].newPage();
const origin=process.env.IMAGE_TEST_ORIGIN||'https://term-llm.com';
const requests=[],events=[],errors=[];let opted=false;
const log=(type,data)=>{console.log(JSON.stringify({type,data}));};
const policy=(await fs.readFile('hosting/browser-linux-lab-headers.conf','utf8')).match(/Content-Security-Policy "([^"]+)"/)[1];
await p.route(origin+'/learn/**',async r=>{
 const name=decodeURIComponent(new URL(r.request().url()).pathname.slice('/learn/'.length))||'index.html';assert.ok(!name.includes('..'));
 const mime=manifest.find(e=>e.target===name)?.mime||{'.html':'text/html','.js':'application/javascript','.mjs':'application/javascript','.css':'text/css','.wasm':'application/wasm','.txt':'text/plain'}[path.extname(name)]||'application/octet-stream';
 try{await r.fulfill({body:await fs.readFile(assetRoot+'/'+name),contentType:mime,headers:{'Cross-Origin-Embedder-Policy':'require-corp','Cross-Origin-Opener-Policy':'same-origin','Cross-Origin-Resource-Policy':'same-origin','Content-Security-Policy':policy}});}catch{await r.fulfill({status:404,body:'Missing '+name});}
});
p.on('request',r=>requests.push({url:r.url().split('?')[0],opted}));
p.on('pageerror',e=>{errors.push(e.message);log('pageerror',e.message);});
p.on('console',m=>{if(m.type()==='error')log('console',m.text().slice(0,500));});
await p.exposeFunction('imageTestEvent',data=>{if(data.progress?.status==='progress'||data.progress?.text)return;events.push(data);if(data.error||data.result||data.terminated)log('worker',data);});
await p.addInitScript(()=>{
 window.imageTestWorkers=[];window.imageTestOverlap=false;const W=Worker;
 window.Worker=class extends W{
  constructor(url,options){super(url,options);this.testURL=String(url);if(!/simulator-worker|image-worker|inference-worker/.test(this.testURL))return;imageTestWorkers.push(this);if(imageTestWorkers.filter(w=>!w.testTerminated).length>1)imageTestOverlap=true;this.addEventListener('message',({data})=>{const clean={...data};if(clean.result?.blob)clean.result={...clean.result,blob:{size:clean.result.blob.size,type:clean.result.blob.type}};imageTestEvent({url:this.testURL,...clean});});}
  terminate(){this.testTerminated=true;if(/simulator-worker|image-worker|inference-worker/.test(this.testURL))imageTestEvent({url:this.testURL,terminated:true});return super.terminate();}
 };
});
async function shell(command,tag,code='0'){
 await sendCLI(p,`${command}; printf '\\nIMAGE_${tag}_DONE:%s\\n' "$?"`);
 await p.waitForFunction(t=>lab.serial.includes('\r\nIMAGE_'+t+'_DONE:'),tag,{timeout:200000});
 const serial=await p.evaluate(()=>lab.serial);assert.ok(serial.includes('\r\nIMAGE_'+tag+'_DONE:'+code),serial.slice(-3000));return serial;
}
try{
 await p.setViewportSize({width:1440,height:1000});await p.goto(origin+'/learn/');
 assert.equal(await p.locator('#launch-mode').inputValue(),'text');
 assert.equal(await p.locator('#model').inputValue(),'qwen');
 const imageRequests=()=>requests.filter(r=>/image-worker|image-runtime|Janus|transformers@3\.8/.test(r.url));
 const textRequests=()=>requests.filter(r=>/inference-worker|simulator-worker|Qwen|qwen|web-llm/.test(r.url));
 await p.screenshot({path:dir+'/front-gate.png'});
 if(imagesFirst){
  await p.locator('#launch-mode').selectOption('images');
  assert.equal(await p.locator('#boot').isDisabled(),true);
  await p.screenshot({path:dir+'/front-gate-images.png'});
  assert.deepEqual(imageRequests(),[]);assert.deepEqual(textRequests(),[]);
  await p.locator('#image-consent').check();opted=true;
 }else await p.locator('#model').selectOption(qwen?'qwen':'simulator');
 await p.locator('#boot').click();
 await p.waitForFunction(()=>['ready','failed'].includes(lab.phase),null,{timeout:240000});assert.equal(await p.evaluate(()=>lab.phase),'ready',await p.locator('#status').textContent());
 assert.equal(await p.locator('.wordmark').getAttribute('href'),'/');
 await p.locator('.lesson-nav button').last().click();
 const lesson=await p.locator('#lesson .lesson-count').textContent();
 if(imagesFirst){
  assert.deepEqual(textRequests(),[],'images-first must not request Qwen or Simulator');
  assert.equal(await p.locator('#image-start-guide').isVisible(),true);
  await p.locator('#image-controls-link').click();
 }else{
  assert.match(await p.locator('#effective').textContent(),qwen?/Qwen3 8B/:/SIMULATOR/);
  await shell('term-llm image --generate "a pelican"','off','1');
  await shell('term-llm image cat -o canned.png --no-display','canned');
  await shell('term-llm ask "What are three useful things to bring to a picnic?"','text-before');
  assert.deepEqual(imageRequests(),[]);
  log('default',{zeroImageRequests:true,simulator:!qwen});
  await p.locator('#image-panel summary').click();await p.locator('#image-consent').check();opted=true;
  await p.locator('#image-enable').click();
 }
 assert.equal(await p.evaluate(()=>lab.loaded),false);
 await p.waitForFunction(()=>['ready','off'].includes(lab.imageState),null,{timeout:900000});
 assert.equal(await p.evaluate(()=>lab.imageState),'ready',await p.locator('#image-status').textContent());
 if(imagesFirst)assert.deepEqual(textRequests(),[]);
 log('loaded',await p.locator('#image-status').textContent());
 await shell('term-llm ask "What should I bring?"','text-paused','1');
 const start=Date.now();await shell('term-llm image --generate "A pelican riding a bike." --seed 1 -o pelican.png','generated');
 const bytes=Buffer.from(await p.evaluate(async()=>Array.from(await lab.vm.read_file('workspace/pelican.png'))));
 await fs.writeFile(dir+'/pelican.png',bytes);
 assert.equal(await p.locator('#image-result').isVisible(),true);
 assert.equal(await p.locator('#image-preview').evaluate(img=>img.complete&&img.naturalWidth===384),true);
 const download=await p.locator('#image-download').getAttribute('href');
 assert.deepEqual(Buffer.from(download.split(',')[1],'base64'),bytes);
 const metadata=JSON.parse(await p.evaluate(async()=>new TextDecoder().decode(await lab.vm.read_file('workspace/pelican.png.json'))));
 assert.equal(metadata.seed,1);assert.equal(metadata.prompt,'A pelican riding a bike.');
 await p.waitForFunction(()=>lab.graphics?.placements?.length>0,null,{timeout:30000});
 const graphics=await p.evaluate(()=>lab.graphics);log('generated',{seconds:(Date.now()-start)/1000,bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex'),metadata,graphics});
 await fs.writeFile(dir+'/generated.json',JSON.stringify({metadata,graphics,seconds:(Date.now()-start)/1000,sha256:createHash('sha256').update(bytes).digest('hex')},null,2));
 await p.screenshot({path:dir+'/generated.png',fullPage:true});
 await shell('term-llm image --generate "A pelican riding a bike." --seed 1 -o repeat.png --no-display','repeat');
 const repeat=Buffer.from(await p.evaluate(async()=>Array.from(await lab.vm.read_file('workspace/repeat.png'))));assert.deepEqual(bytes,repeat);
 await sendCLI(p,'term-llm image --generate "A blue robot." --seed 2 -o canceled.png; printf "\\nIMAGE_cancel_DONE:%s\\n" "$?"');
 await p.waitForFunction(()=>lab.imageState==='generating');
 await p.locator('#image-cancel').click();
 await p.waitForFunction(()=>lab.serial.includes('\r\nIMAGE_cancel_DONE:1'),null,{timeout:30000});
 assert.equal(await p.evaluate(async()=>{try{await lab.vm.read_file('workspace/canceled.png');return true;}catch{return false;}}),false);
 assert.equal(await p.evaluate(()=>lab.imageState),'off');
 assert.ok(await p.evaluate(()=>imageTestWorkers.filter(w=>w.testURL.includes('image-worker')).every(w=>w.testTerminated)));
 await p.locator('#image-text').click();await p.waitForFunction(()=>lab.loaded,null,{timeout:120000});assert.match(await p.locator('#effective').textContent(),qwen?/Qwen3 8B/:/SIMULATOR/);
 await shell('term-llm ask "What are three useful things to bring to a picnic?"','text-after');
 assert.equal(await p.locator('#lesson .lesson-count').textContent(),lesson,'switching must preserve tutorial progress');
 await shell('term-llm config completion zsh --install','completion');
 const readyCount=await p.evaluate(()=>(lab.serial.match(/LAB_READY/g)||[]).length);
 await sendCLI(p,'exec $SHELL');await p.waitForFunction(n=>(lab.serial.match(/LAB_READY/g)||[]).length>n,readyCount,{timeout:30000});
 await p.waitForTimeout(1000);await p.keyboard.type('term-llm ch');await p.keyboard.press('Tab');
 await p.waitForFunction(()=>/term-llm chat\s*$/.test(lab.screen.trimEnd()),null,{timeout:15000});await p.keyboard.press('Control+c');await p.waitForTimeout(350);
 assert.deepEqual(Buffer.from(await p.evaluate(async()=>Array.from(await lab.vm.read_file('workspace/pelican.png')))),bytes);
 // Cached load can be canceled immediately without leaving an orphan worker.
 await p.locator('#image-enable').click();await p.locator('#image-cancel').click();assert.equal(await p.evaluate(()=>lab.imageState),'off');
 await p.locator('#image-text').click();await p.waitForFunction(()=>lab.loaded,null,{timeout:120000});
 await p.locator('#stop').click();await p.waitForFunction(()=>lab.vm===null);assert.equal(await p.locator('#image-consent').isChecked(),false);
 assert.ok(await p.evaluate(()=>imageTestWorkers.every(w=>w.testTerminated)));
 assert.equal(await p.locator('#boot').isDisabled(),imagesFirst);
 assert.deepEqual(requests.filter(r=>!r.opted&&/image-worker|image-runtime|Janus/.test(r.url)),[]);
 assert.equal(await p.evaluate(()=>imageTestOverlap),false,'text and image workers must never be resident together');
 log('passed',{noImageDownloadsBeforeConsent:true,realPNGInGuestAndKitty:true,seedRepeatIdentical:true,textRestored:true,cancelAndShutdownReleaseWorkers:true});
 await fs.writeFile(dir+'/proof.json',JSON.stringify({requests,events,errors,passed:true},null,2));
}catch(e){log('failure',e.message);await fs.writeFile(dir+'/failure.json',JSON.stringify({error:e.message,status:await p.locator('#image-status').textContent().catch(()=>''),screen:await p.evaluate(()=>window.lab?.screen),events,requests,errors},null,2));await p.screenshot({path:dir+'/failure.png',fullPage:true}).catch(()=>{});await p.locator('#stop').click().catch(()=>{});process.exitCode=1;}
finally{await p.close();await b.close();}
