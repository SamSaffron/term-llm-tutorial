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
const demoOnly=process.env.IMAGE_TEST_DEMO==='1';
const imagesFirst=process.env.IMAGE_TEST_LAUNCH==='1';
const consentOnly=process.env.IMAGE_TEST_CONSENT_ONLY==='1';
const bonsai=process.env.IMAGE_TEST_BONSAI==='1';
const qwen=process.env.IMAGE_TEST_QWEN==='1'||(imagesFirst&&!consentOnly&&!bonsai);
assert.ok(!(qwen&&bonsai),'Select only one real text model');
const model=bonsai?'bonsai':qwen?'qwen':'simulator',textPattern=bonsai?/Bonsai 8B Q1/:qwen?/Qwen3 8B/:/SIMULATOR/;
const dir='evidence/boot-consent'+(imagesFirst?'-launch':'')+(bonsai?'-bonsai':qwen?'-qwen':'')+(staged?'-staged':'');await fs.mkdir(dir,{recursive:true});
const b=await connect(),p=await b.contexts()[0].newPage();
console.log('TARGET',(await (await p.context().newCDPSession(p)).send('Target.getTargetInfo')).targetInfo.targetId);
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
  constructor(url,options){super(url,options);this.testURL=String(url);if(!/simulator-worker|image-worker|inference-worker|bonsai-worker/.test(this.testURL))return;imageTestWorkers.push(this);if(imageTestWorkers.filter(w=>!w.testTerminated).length>1)imageTestOverlap=true;this.addEventListener('message',({data})=>{const clean={...data};if(clean.result?.blob)clean.result={...clean.result,blob:{size:clean.result.blob.size,type:clean.result.blob.type}};imageTestEvent({url:this.testURL,...clean});});}
  terminate(){this.testTerminated=true;if(/simulator-worker|image-worker|inference-worker|bonsai-worker/.test(this.testURL))imageTestEvent({url:this.testURL,terminated:true});return super.terminate();}
 };
});
async function shell(command,tag,code='0'){
 console.log('COMMAND',tag);
 await sendCLI(p,`${command}; printf '\\nIMAGE_${tag}_DONE:%s\\n' "$?"`);
 await p.waitForFunction(t=>lab.serial.includes('\r\nIMAGE_'+t+'_DONE:'),tag,{timeout:200000});
 const serial=await p.evaluate(()=>lab.serial);assert.ok(serial.includes('\r\nIMAGE_'+tag+'_DONE:'+code),serial.slice(-3000));return serial;
}
async function inlinePixels(){
 await p.waitForFunction(()=>lab.graphics?.placements.some(p=>p.virtual)&&document.querySelector('#terminal canvas.term-image'));
 assert.equal(await p.locator('#image-panel,#image-start-guide,#image-enable,#image-text').count(),0);
}
try{
 await p.setViewportSize({width:1440,height:1000});await p.goto(origin+'/learn/');
 await p.locator('#model').selectOption(model);if(process.env.IMAGE_TEST_CONTEXT){await p.locator('#launch-settings summary').click();await p.locator('#context').selectOption(process.env.IMAGE_TEST_CONTEXT);}
 const support=process.env.IMAGE_TEST_OFF==='1'?'off':demoOnly?'demo':'janus';
 await p.locator('#image-support').selectOption(support);
 assert.equal(await p.locator('#janus-consent').isVisible(),false);
 await p.locator('#boot').click();
 if(support==='janus'){
  await p.locator('#janus-consent').waitFor({state:'visible'});
  assert.equal(await p.evaluate(()=>lab.vm==null),true);
  assert.deepEqual(requests.filter(r=>/image-worker|image-runtime|Janus/.test(r.url)),[]);
  await p.screenshot({path:dir+'/boot-consent.png',fullPage:true});
  await p.locator('[data-back]').click();assert.equal(await p.locator('#boot').isEnabled(),true);
  assert.equal(await p.evaluate(()=>lab.vm==null),true);
  await p.locator('#boot').click();await p.locator('#janus-consent').waitFor({state:'visible'});
  opted=true;await p.locator('[data-accept]').click();
 }
 await p.waitForFunction(()=>['ready','failed'].includes(lab.phase),null,{timeout:900000});
 assert.equal(await p.evaluate(()=>lab.phase),'ready',await p.locator('#status').textContent());
 assert.equal(await p.locator('#janus-consent').isVisible(),false);
 assert.equal(await p.locator('#image-support').isDisabled(),true);
 assert.equal(await p.locator('#model').isDisabled(),true);
 assert.equal(await p.locator('#image-panel,#image-enable,#image-text').count(),0);
 await shell('cmp /tmp/term-llm /mnt/term-llm','stock');
 const lesson=await p.locator('#lesson .lesson-count').textContent();
 if(support==='off'){
  await shell('term-llm image cat --no-clipboard','off','1');
 }else{
  await shell('term-llm image "an illustration of a cat" --no-clipboard -o cat.png','first-image');
  await inlinePixels();
  const bytes=Buffer.from(await p.evaluate(async()=>Array.from(await lab.vm.read_file('workspace/cat.png'))));
  assert.deepEqual([...bytes.subarray(0,8)],[137,80,78,71,13,10,26,10]);
  await fs.writeFile(dir+'/boot-image.png',bytes);
 }
 // Ordinary text remains usable without buttons, even after an image request.
 await shell('term-llm ask "What are three useful things to bring to a picnic?"','text');
 assert.equal(await p.locator('#janus-consent').isVisible(),false);
 if(support==='janus'){
  await shell('term-llm image "an illustration of a dog" --no-clipboard -o dog.png','second-image');
  await inlinePixels();
  assert.match(await shell('term-llm config get image.provider','fixed-provider'),/janus/);
 }
 assert.equal(await p.locator('#lesson .lesson-count').textContent(),lesson);
 assert.equal(await p.locator('#janus-consent').isVisible(),false);
 assert.equal(await p.evaluate(()=>imageTestOverlap),false);
 assert.deepEqual(requests.filter(r=>!r.opted&&/image-worker|image-runtime|Janus/.test(r.url)),[]);
 await p.screenshot({path:dir+'/fixed-session.png',fullPage:true});
 await p.locator('#stop').click();await p.waitForFunction(()=>lab.vm===null);
 assert.equal(await p.evaluate(()=>imageTestWorkers.every(w=>w.testTerminated)),true);
 log('passed',{support,model,bootConsentOnly:true,fixedProviders:true,automaticResidency:true,noControls:true});
 await fs.writeFile(dir+'/proof.json',JSON.stringify({requests,events,errors,passed:true},null,2));
}catch(e){log('failure',e.message);await p.screenshot({path:dir+'/failure.png',fullPage:true}).catch(()=>{});await p.locator('#stop').click().catch(()=>{});process.exitCode=1;}
finally{await p.close();await b.close();}
