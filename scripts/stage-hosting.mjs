// Public runtime allowlist only. Never recursively copy public/assets or workspace.
import {copyFile,mkdir,cp,rm} from 'node:fs/promises';
const root='hosting/site/learn';
await mkdir(`${root}/assets`,{recursive:true});
// Remove exact retired paths from reused staging directories; preserve hashed releases.
for(const name of ['agent.yaml','system.md','term-llm-artifact.patch','assets/xterm.css','licenses/xterm.txt','licenses/xterm-addon-fit-LICENSE'])await rm(`${root}/${name}`,{force:true});
for(const name of ['index.html','app.css','app.js','inference-worker.js','gemma-worker.js','simulator-worker.js','boot.sh','guest-config.yaml','assets/term-llm','assets/guest-bridge','assets/git','assets/picnic-mcp','assets/zsh-root.tar.gz','zsh-source.tar.gz','assets/v86.wasm','assets/libv86.mjs','assets/ghostty-vt.wasm'])await copyFile(`public/${name}`,`${root}/${name}`);
for(const name of ['LICENSE','SOURCES.md'])await copyFile(name,`${root}/${name}`);
await mkdir(`${root}/sources/git`,{recursive:true});
for(const name of ['git-2.50.1.tar.xz','zlib-1.3.1.tar.gz'])await copyFile(`sources/git/${name}`,`${root}/sources/git/${name}`);
await copyFile('scripts/build-git.sh',`${root}/sources/git/build-git.sh`);
await cp('licenses',`${root}/licenses`,{recursive:true});
console.log('Staged explicit public runtime allowlist; no firmware, model, evidence or private configuration.');

await mkdir(`${root}/ort`,{recursive:true});
for(const suffix of ['mjs','wasm','jsep.mjs','jsep.wasm','asyncify.mjs','asyncify.wasm'])await copyFile(`public/ort/ort-wasm-simd-threaded.${suffix}`,`${root}/ort/ort-wasm-simd-threaded.${suffix}`);

await import('./stage-cdn.mjs');

await mkdir(`${root}/sources/picnic-mcp`,{recursive:true});
await copyFile('guest/picnic-mcp/main.go',`${root}/sources/picnic-mcp/main.go`);

await mkdir(`${root}/guest-web`,{recursive:true});
await copyFile('public/guest-web/sw.js',`${root}/guest-web/sw.js`);
