import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {loadingLine} from '../public/loading-line.mjs';

function element() {
 const attrs = new Map(), styles = new Map();
 return {hidden:true,dataset:{},attrs,styles,setAttribute:(k,v)=>attrs.set(k,v),removeAttribute:k=>attrs.delete(k),style:{setProperty:(k,v)=>styles.set(k,v),removeProperty:k=>styles.delete(k)}};
}
test('loading line stays indeterminate without real fractions; clears on completion/error/cancel',()=>{
 const el=element();
 for(const value of [undefined,NaN,-1,2]){
  loadingLine(el,true,value);assert.equal(el.hidden,false);assert.equal(el.dataset.determinate,'false');assert.equal(el.attrs.has('aria-valuenow'),false);
 }
 loadingLine(el,true,.42);assert.equal(el.attrs.get('aria-valuenow'),'0.42');assert.equal(el.styles.get('--progress'),'42%');
 loadingLine(el,true,1);assert.equal(el.dataset.determinate,'true');assert.equal(el.styles.get('--progress'),'100%');
 loadingLine(el,true);assert.equal(el.attrs.has('aria-valuenow'),false);assert.equal(el.styles.has('--progress'),false);
 loadingLine(el,false);assert.equal(el.hidden,true);
});
test('CLI is the only chat composer and FitAddon sizing parent has no padding',async()=>{
 const html=await readFile('public/index.html','utf8'),js=await readFile('public/app.mjs','utf8'),css=await readFile('public/app.css','utf8');
 assert.doesNotMatch(html,/<textarea|<form|id="(?:send|prompt|chat)"/);
 assert.doesNotMatch(js,/\$\('(?:send|prompt|chat)'\)/);
 assert.match(html,/role="progressbar" aria-labelledby="status"/);
 assert.match(css,/#terminal>\.xterm\{height:100%;padding:12px\}/);
 assert.match(css,/prefers-reduced-motion:reduce/);
 assert.match(js,/fit\.fit\(\)/);assert.match(js,/create_file\('geometry.json'/);
});
test('tutorial has eleven lessons, shell-first boot, prompt approvals and Qwen8B default',async()=>{
 const {lessons}=await import('../public/tutorial.mjs');assert.equal(lessons.length,11);
 assert.match(lessons[1].tasks[0][1],/alias tl=term-llm/);
 assert.ok(lessons[6].tasks.some(t=>t[1]==='tl mcp run picnic checklist guests=4'));
 assert.ok(lessons[8].tasks.some(t=>t[1]==='tl chat --resume'));
 const html=await readFile('public/index.html','utf8'),js=await readFile('public/app.mjs','utf8'),config=await readFile('public/guest-config.yaml','utf8');
 assert.match(html,/id="lesson"/);assert.doesNotMatch(html,/<iframe|Live artifact/);
 assert.match(config,/default_mode: prompt/);assert.match(config,/Qwen3-8B/);
 assert.doesNotMatch(js,/serial0_send\('chat\\n'\)/);
 assert.match(await readFile('public/boot.sh','utf8'),/compdef _term-llm tl/);
});
