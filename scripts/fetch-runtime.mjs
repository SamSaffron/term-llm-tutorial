// Download existing public runtime artifacts with exact hashes. No model weights,
// firmware, credentials, private files or auto-execution of downloaded programs.
import {readFile,mkdir,writeFile,rename} from 'node:fs/promises';
import {dirname} from 'node:path';
import {createHash} from 'node:crypto';
const hash=b=>createHash('sha256').update(b).digest('hex');
for(const item of JSON.parse(await readFile('sources/runtime-manifest.json','utf8'))){
 try{if(hash(await readFile(item.path))===item.sha256){console.log('Verified',item.path);continue;}}catch{}
 console.log('Fetching',item.path);
 const response=await fetch(item.url,{signal:AbortSignal.timeout(180000)});
 if(!response.ok)throw Error(`${item.path}: HTTP ${response.status}`);
 const bytes=Buffer.from(await response.arrayBuffer());
 if(bytes.length!==item.bytes||hash(bytes)!==item.sha256)throw Error(`${item.path}: size/hash mismatch`);
 await mkdir(dirname(item.path),{recursive:true});await writeFile(item.path+'.tmp',bytes);await rename(item.path+'.tmp',item.path);
}
