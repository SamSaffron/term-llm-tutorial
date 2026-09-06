import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const base='https://term-llm.com/learn/';
const page=await fetch(base,{cache:'no-store'});
assert.equal(page.status,200);
assert.equal(page.headers.get('cross-origin-opener-policy'),'same-origin');
assert.equal(page.headers.get('cross-origin-embedder-policy'),'require-corp');
const html=await page.text();
const assets=JSON.parse(await readFile('hosting/asset-manifest.json','utf8'));
assert.ok(html.includes(assets.find(e=>e.name==='app.js').target),'HTML must reference this release');
for(const name of ['app.js','assets/ghostty-vt.wasm','assets/term-llm']){
 const asset=assets.find(e=>e.name===name),r=await fetch(new URL(asset.target,base));
 assert.equal(r.status,200,name);
 assert.equal(r.headers.get('content-type')?.split(';')[0],asset.mime,name);
 assert.equal(r.headers.get('cross-origin-embedder-policy'),'require-corp',name);
 const bytes=Buffer.from(await r.arrayBuffer());
 assert.equal(createHash('sha256').update(bytes).digest('hex'),asset.sha256,name);
}
const sw=await fetch(new URL('guest-web/sw.js',base),{cache:'no-store'});
assert.equal(sw.status,200);
assert.match(sw.headers.get('content-type'),/javascript/);
console.log('PASS learn HTML, isolation, service worker and deployed asset hashes');
