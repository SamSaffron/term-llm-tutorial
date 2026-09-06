import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import { build } from 'esbuild';
import { copyFile, mkdir, readFile } from 'node:fs/promises';
await mkdir('public/assets',{recursive:true});
await build({entryPoints:['public/app.mjs'],outfile:'public/app.js',bundle:true,format:'esm',external:['./assets/libv86.mjs'],minify:true,define:{__GUEST_WEB_SW_HASH__:JSON.stringify(createHash('sha256').update(await readFile('public/guest-web/sw.js')).digest('hex').slice(0,20))}});
await build({entryPoints:['public/inference-worker.mjs'],outfile:'public/inference-worker.js',bundle:true,format:'esm',minify:true});
await build({entryPoints:['public/gemma-worker.mjs'],outfile:'public/gemma-worker.js',bundle:true,format:'esm',platform:'browser',minify:true});
await build({entryPoints:['public/simulator-worker.mjs'],outfile:'public/simulator-worker.js',bundle:true,format:'esm',platform:'browser',minify:true});
await mkdir('public/ort',{recursive:true});
for(const suffix of ['mjs','wasm','jsep.mjs','jsep.wasm','asyncify.mjs','asyncify.wasm'])await copyFile(`node_modules/onnxruntime-web/dist/ort-wasm-simd-threaded.${suffix}`,`public/ort/ort-wasm-simd-threaded.${suffix}`);
await copyFile('node_modules/@wterm/ghostty/wasm/ghostty-vt.wasm','public/assets/ghostty-vt.wasm');
execFileSync('go',['build','-trimpath','-ldflags=-s -w','-o','../public/assets/guest-bridge','.'],{cwd:'guest',env:{...process.env,CGO_ENABLED:'0',GOOS:'linux',GOARCH:'386',GO386:'softfloat'},stdio:'inherit'});
execFileSync('go',['build','-trimpath','-ldflags=-s -w','-o','../public/assets/picnic-mcp','./picnic-mcp'],{cwd:'guest',env:{...process.env,CGO_ENABLED:'0',GOOS:'linux',GOARCH:'386',GO386:'softfloat'},stdio:'inherit'});
console.log('Browser bundles built; guest binaries built separately by scripts/build-guest.sh');

await copyFile('node_modules/@wterm/dom/src/terminal.css','public/assets/wterm.css');
