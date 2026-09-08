import {connect} from './shared-connect.mjs';
import {sendCLI} from './cli-input.mjs';
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
const b=await connect(),p=await b.contexts()[0].newPage();
console.log('TARGET',(await (await p.context().newCDPSession(p)).send('Target.getTargetInfo')).targetInfo.targetId);
p.on('pageerror',e=>console.log('PAGEERROR',e.message));p.on('console',m=>{if(m.type()==='error')console.log('CONSOLE',m.text());});
const manifest=JSON.parse(await fs.readFile('hosting/asset-manifest.json','utf8'));
await p.route('https://term-llm.com/learn/**',async r=>{
 const name=new URL(r.request().url()).pathname.slice('/learn/'.length)||'index.html';
 const mime=manifest.find(e=>e.target===name)?.mime||{'.html':'text/html','.js':'application/javascript','.mjs':'application/javascript','.css':'text/css','.wasm':'application/wasm'}[path.extname(name)]||'application/octet-stream';
 try{await r.fulfill({body:await fs.readFile('hosting/site/learn/'+name),contentType:mime,headers:{'Cross-Origin-Embedder-Policy':'require-corp','Cross-Origin-Opener-Policy':'same-origin'}});}catch{console.log('MISSING',name);await r.fulfill({status:404,body:'missing'});}
});
try{
 await p.setViewportSize({width:1440,height:1000});await p.goto('https://term-llm.com/learn/');
 await p.locator('#model').selectOption('simulator');await p.locator('#image-support').selectOption('demo');await p.locator('#boot').click();
 await p.waitForFunction(()=>lab.phase==='ready',null,{timeout:180000});await p.waitForTimeout(500);
 await p.evaluate(()=>{window.inputTrace=[];const send=lab.vm.serial0_send.bind(lab.vm);lab.vm.serial0_send=data=>{inputTrace.push([...data].map(c=>c.charCodeAt(0)));return send(data);};});
 const metrics=()=>p.evaluate(()=>{
  const terminal=document.querySelector('#terminal').getBoundingClientRect(),pane=document.querySelector('#chat-pane').getBoundingClientRect(),lesson=document.querySelector('#guide-pane').getBoundingClientRect();
  const cell=document.querySelector('#terminal .term-row').getBoundingClientRect();
  return {terminal:{top:terminal.top,bottom:terminal.bottom,height:terminal.height},pane:{top:pane.top,bottom:pane.bottom,height:pane.height},lesson:{top:lesson.top,bottom:lesson.bottom,height:lesson.height},viewport:innerHeight,geometry:lab.geometry,cellHeight:cell.height};
 });
 async function checkGeometry(){
  await p.waitForTimeout(500);const m=await metrics();
  assert.ok(Math.abs(m.terminal.bottom-m.pane.bottom)<2,JSON.stringify(m));
  assert.ok(m.pane.height<=761&&m.pane.bottom<=m.viewport-48,JSON.stringify(m));
  assert.ok(m.geometry.rows>8);
  assert.ok(Math.abs(m.geometry.rows*m.cellHeight-(m.terminal.height-24))<m.cellHeight+1,JSON.stringify(m));
  return m;
 }
 async function backspace(tag){
  const prefix=`EDIT_${tag}-`;
  await p.locator('#terminal textarea').focus();await p.keyboard.type('echo '+prefix+'abcXYZ');
  for(let i=0;i<3;i++)await p.keyboard.press('Backspace');
  await p.waitForFunction(expected=>lab.screen.trimEnd().endsWith(expected),'/workspace# echo '+prefix+'abc');
  await p.keyboard.press('ArrowLeft');await p.keyboard.press('Backspace');await p.keyboard.type('Z');
  await p.waitForFunction(expected=>lab.screen.trimEnd().endsWith(expected),'/workspace# echo '+prefix+'aZc');
 await p.keyboard.press('Enter');
  await p.waitForFunction(expected=>lab.serial.includes('\r\n'+expected+'\r\n'),prefix+'aZc');
  console.log('EDIT_PASS',tag);
 }
 const initial=await checkGeometry();
 assert.ok(Math.abs(initial.pane.bottom-initial.lesson.bottom)<2);
 assert.doesNotMatch(await p.evaluate(()=>lab.serial),/can't find terminal definition/);
 await backspace('shell');
 await sendCLI(p,"term-llm image cat -o cat.png --no-clipboard; printf '\\nIMAGE_DONE\\n'");
 await p.waitForFunction(()=>lab.serial.includes('\r\nIMAGE_DONE\r\n'));
 await p.waitForFunction(()=>lab.graphics?.placements.length>0);
 await backspace('after-image');
 await sendCLI(p,'term-llm chat');await p.waitForFunction(()=>/Type a message/.test(lab.screen));
 await p.keyboard.type('helloXYZ');for(let i=0;i<3;i++)await p.keyboard.press('Backspace');
 await p.waitForFunction(()=>lab.screen.includes('hello')&&!lab.screen.includes('helloXYZ'));
 await p.keyboard.press('Control+u');await sendCLI(p,'/quit');await p.waitForFunction(()=>/\/workspace#\s*$/.test(lab.screen.trimEnd()));
 await backspace('after-chat');
 const sizes=[];
 for(const size of [{width:1100,height:750},{width:1920,height:1400},{width:720,height:500},{width:390,height:844},{width:1440,height:1000}]){
  await p.setViewportSize(size);sizes.push({size,...await checkGeometry()});
  if(size.width<=850){await p.locator('#tab-guide').click();await p.waitForTimeout(300);assert.ok(await p.locator('#lesson').isVisible());assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);await p.locator('#tab-chat').click();}
 }
 await backspace('after-resize');
 await sendCLI(p,"stty size; printf '\\nSIZE_DONE\\n'");await p.waitForFunction(()=>lab.serial.includes('\r\nSIZE_DONE\r\n'));
 const g=await p.evaluate(()=>lab.geometry);assert.ok((await p.evaluate(()=>lab.serial)).includes(`${g.rows} ${g.cols}`));
 await fs.writeFile('evidence/terminal-input-proof.json',JSON.stringify({initial,sizes,input:await p.evaluate(()=>inputTrace),passed:true},null,2));
 await p.screenshot({path:'evidence/terminal-fixed.png',fullPage:true});
 console.log('PASS: pane fit, visible Backspace, native shell/image/chat, resize and TTY geometry');
}finally{await p.close();await b.close();}
