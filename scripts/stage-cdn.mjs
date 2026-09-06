// Fingerprint large public payloads so Cloudflare can cache them without account-wide rules.
// .bin is a default Cloudflare cacheable extension; retain each original MIME type.
import {readFile,writeFile,copyFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const root='hosting/site/learn';
const names=['app.css','inference-worker.js','gemma-worker.js','simulator-worker.js','assets/term-llm','assets/guest-bridge','assets/git','assets/picnic-mcp','assets/v86.wasm','assets/ghostty-vt.wasm','assets/zsh-root.tar.gz','zsh-source.tar.gz','sources/git/git-2.50.1.tar.xz','sources/git/zlib-1.3.1.tar.gz',...['wasm','jsep.wasm','asyncify.wasm'].map(s=>`ort/ort-wasm-simd-threaded.${s}`),'app.js'];
const entries=[];
for(const name of names){
 if(name==='app.js'){
  let app=await readFile(`${root}/${name}`,'utf8');
  for(const e of entries)app=app.replaceAll(e.name,e.target);
  await writeFile(`${root}/${name}`,app);
 }
 const data=await readFile(`${root}/${name}`),hash=createHash('sha256').update(data).digest('hex');
 const target=`${name}.${hash.slice(0,20)}.bin`;
 await copyFile(`${root}/${name}`,`${root}/${target}`);
 const mime=name.endsWith('.css')?'text/css':name.endsWith('.js')?'application/javascript':name.endsWith('.wasm')?'application/wasm':'application/octet-stream';
 entries.push({name,target,sha256:hash,bytes:data.length,mime});
}
await writeFile('hosting/browser-linux-lab-assets.conf',entries.map(e=>`location = /learn/${e.name} { return 302 /learn/${e.target}; }
location = /learn/${e.target} {
    default_type ${e.mime};
    try_files $uri =404;
    include /etc/nginx/term-llm-tutorial/headers.conf;
    add_header Cache-Control "public, max-age=31536000, immutable";
}`).join('\n')+'\n');
await writeFile('hosting/asset-manifest.json',JSON.stringify(entries,null,2)+'\n');
console.log(`Fingerprinted ${entries.length} allowlisted payloads for Cloudflare caching.`);

const app=entries.find(e=>e.name==='app.js');
const index=await readFile(`${root}/index.html`,'utf8');
await writeFile(`${root}/index.html`,index.replace('src="app.js"',`src="${app.target}"`));

const css=entries.find(e=>e.name==='app.css');
await writeFile(`${root}/index.html`,(await readFile(`${root}/index.html`,'utf8')).replace('href="app.css"',`href="${css.target}"`));
