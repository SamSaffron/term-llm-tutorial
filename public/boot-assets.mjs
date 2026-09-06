// Fetch excluded firmware/Linux directly from upstream, never from our host.
// Verify all bytes before passing them to v86. No weights or credentials involved.
const assets = [
 ['bios','https://raw.githubusercontent.com/copy/v86/d96be774e549a83371b038b86e819804c96b921f/bios/seabios.bin','73e3f359102e3a9982c35fce98eb7cd08f18303ac7f1ba6ebfbe6cdc1c244d98'],
 ['vga_bios','https://raw.githubusercontent.com/copy/v86/d96be774e549a83371b038b86e819804c96b921f/bios/vgabios.bin','a4bc0d80cc3ca028c73dafa8fee396b8d054ce87ebd8abfbd31b06b437607880'],
 ['bzimage','https://i.copy.sh/buildroot-bzimage68.bin','507a759c70ab7a490a233be454d0b5b88bc667956a410b531cb4edc091e2eb1c'],
];
export async function fetchBootAssets() {
 return Object.fromEntries(await Promise.all(assets.map(async ([name,url,expected])=>{
  const response=await fetch(url,{credentials:'omit',referrerPolicy:'no-referrer',signal:AbortSignal.timeout(120000)});
  if(!response.ok)throw Error(`${name}: upstream HTTP ${response.status}`);
  const buffer=await response.arrayBuffer();
  const actual=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',buffer))).map(b=>b.toString(16).padStart(2,'0')).join('');
  if(actual!==expected)throw Error(`${name}: upstream SHA-256 mismatch; refusing to boot`);
  return [name,{buffer}];
 })));
}
