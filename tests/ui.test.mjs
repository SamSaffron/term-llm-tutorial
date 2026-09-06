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
test('CLI is the only chat composer and Ghostty owns terminal rendering',async()=>{
 const html=await readFile('public/index.html','utf8'),js=await readFile('public/app.mjs','utf8'),css=await readFile('public/app.css','utf8');
 assert.doesNotMatch(html,/<textarea|<form|id="(?:send|prompt|chat)"/);
 assert.doesNotMatch(js,/\$\('(?:send|prompt|chat)'\)/);
 assert.match(html,/role="progressbar" aria-labelledby="status"/);
 assert.match(await readFile('public/terminal.mjs','utf8'),/from '@wterm\/ghostty'/);assert.doesNotMatch(js,/@xterm/);
 assert.match(css,/prefers-reduced-motion:reduce/);
 assert.match(js,/fit\.fit\(\)/);assert.match(js,/create_file\('geometry.json'/);
});
test('tutorial has thirteen lessons, shell-first boot, prompt approvals and Qwen8B default',async()=>{
 const {lessons}=await import('../public/tutorial.mjs');assert.equal(lessons.length,13);
 assert.match(lessons[1].tasks[0][1],/config completion zsh --install/);
 // The CLI tells the reader to restart the shell, so the lesson must show how.
 assert.ok(lessons[1].tasks.some(t=>t[1]==='exec $SHELL'));
 assert.match(lessons[1].tasks[1][1],/>> ~\/\.zshrc/);
 assert.match(lessons[2].tasks[0][1],/alias tl=term-llm/);
 assert.ok(lessons[2].tasks.some(t=>t[1]==='compdef _term-llm tl'));
 assert.ok(lessons[7].tasks.some(t=>t[1]==='tl mcp run picnic checklist guests=4'));
 assert.ok(lessons[9].tasks.some(t=>t[1]==='tl chat --resume'));
 const html=await readFile('public/index.html','utf8'),js=await readFile('public/app.mjs','utf8'),config=await readFile('public/guest-config.yaml','utf8');
 assert.match(html,/id="lesson"/);assert.doesNotMatch(html,/<iframe|Live artifact/);
 assert.match(config,/default_mode: prompt/);assert.match(config,/Qwen3-8B/);
 assert.doesNotMatch(js,/serial0_send\('chat\\n'\)/);
 // The guest must ship WITHOUT term-llm completions so lesson 2 installs them for real.
 const boot=await readFile('public/boot.sh','utf8');
 assert.doesNotMatch(boot,/compdef _term-llm tl|term-llm-completion\.zsh|compinit/);
 assert.match(boot,/bindkey '\^I' expand-or-complete/);
});

test('guest runtime uses stock CLI without obsolete artifact agent or preview watcher',async()=>{
 const boot=await readFile('public/boot.sh','utf8'),bridge=await readFile('guest/main.go','utf8'),app=await readFile('public/app.mjs','utf8'),build=await readFile('scripts/build-guest.sh','utf8');
 assert.doesNotMatch(boot+bridge+app,/write-artifact|watchArtifact|TERM_LLM_BROWSER_WORKSPACE_FILE|active-cwd|tool-result.json/);
 assert.match(boot,/ln -s \/mnt\/workspace \/workspace/);
 assert.match(build,/6f79d50988f33d890b85c66df1168fa371e700a9/);
 assert.match(build,/git status --porcelain/);
 assert.match(await readFile('public/terminal.mjs','utf8'),/wasmPath:'assets\/ghostty-vt.wasm'/);
});
