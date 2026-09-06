// Show one real transfer at a time: smaller parallel config/tokenizer events
// must not replace progress for the weight file. No invented overall percentage.
export function modelDownloadProgress(emit, label, now=()=>performance.now()) {
 let file='',size=0,value=0,last=-Infinity;
 return p=>{
  if(!Number.isFinite(p.progress)||!p.file)return;
  const total=Number(p.total)||0;
  if(file&&p.file!==file&&total<=size)return;
  const changed=p.file!==file;
  if(changed){file=p.file;size=total;value=0;}
  value=Math.max(value,Math.min(1,Math.max(0,p.progress/100)));
  const time=now();
  if(!changed&&time-last<150&&value<1)return;
  last=time;
  emit({text:`Loading ${label} · ${file}`,progress:value});
 };
}
