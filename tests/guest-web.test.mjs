import test from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';import vm from 'node:vm';
test('guest web storage does not read or overwrite normal origin preferences',async()=>{
 const map=new Map([['term_llm_selected_provider','host-provider'],['term_llm_token','host-secret']]);
 const store={get length(){return map.size},key(i){return [...map.keys()][i]??null},getItem(k){return map.get(k)??null},setItem(k,v){map.set(k,v)},removeItem(k){map.delete(k)}};
 const window={localStorage:store,sessionStorage:store};
 const source=await readFile('public/guest-web/sw.js','utf8');vm.runInNewContext(source.slice(source.indexOf('function isolateStorage'))+'\nisolateStorage("guest-1");',{window,navigator:{}});
 assert.equal(window.localStorage.getItem('term_llm_token'),null);window.localStorage.setItem('term_llm_selected_provider','browser');
 assert.equal(map.get('term_llm_selected_provider'),'host-provider');assert.equal(window.localStorage.getItem('term_llm_selected_provider'),'browser');window.localStorage.clear();assert.equal(map.get('term_llm_token'),'host-secret');
});
test('final lesson launches actual serve web with isolated guest port and link',async()=>{
 const {lessons}=await import('../public/tutorial.mjs');assert.equal(lessons.length,13);assert.equal(lessons[12].tasks[0][1],'tl serve web --port 8081 --auth none');
 const source=await readFile('public/guest-web.mjs','utf8');assert.match(source,/scope:base\(\)\+'\/'/);assert.match(source,/registration\?\.unregister/);
});
