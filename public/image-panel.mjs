import {ImageGenerator} from './image-generator.mjs';
export function mountImagePanel({textBusy,suspendText,resumeText,textLabel,selectProvider}) {
 const $=id=>document.getElementById(id);
 let switching=false,paused=false,reloadingText=false,epoch=0;
 const say=text=>{$('image-status').textContent=text;};
 const controls=()=>{
  $('image-enable').disabled=switching||images.state!=='off'||!$('image-consent').checked;
  $('image-cancel').disabled=reloadingText||(!switching&&images.state==='off');
  $('image-text').disabled=switching||!paused;
  $('image-consent').disabled=switching||images.state!=='off';
 };
 const images=new ImageGenerator({changed:controls,progress:p=>{
  if(p.status==='tokens')say(`Generating genuinely on your GPU · ${p.count}/${p.total} image tokens`);
  else if(p.status==='progress')say(`Loading ${p.file} · ${p.loaded!=null?(p.loaded/1e6).toFixed(1)+' MB':''}${p.total?' / '+(p.total/1e6).toFixed(1)+' MB':''} · downloads may be cached`);
  else if(p.status==='done')say(`Loaded ${p.file} · preparing remaining sessions`);
  else if(p.status==='initiate')say(`Loading ${p.file} · checking cache / download`);
 }});
 $('image-consent').onchange=controls;
 const enable=async()=>{
  if(!$('image-consent').checked||switching||images.state!=='off')return;
  if(textBusy()){say('Wait for the current text request to finish before switching.');return;}
  const current=++epoch;switching=true;controls();
  try{
   suspendText();paused=true;
   say('Text worker released. Loading Janus (~3 GB plus runtime); Cancel releases the worker.');
   await selectProvider('janus');
   if(current!==epoch)return;
   await images.load($('image-consent').checked);
   if(current===epoch)say('Janus ready · run term-llm image "A pelican riding a bike." -o pelican.png in the shell. Text is paused until you switch back.');
  }catch(e){if(current===epoch)say(`Image model unavailable: ${e.message} Use Reload text to continue the tutorial.`);}
  finally{if(current===epoch){switching=false;controls();}}
 };
 $('image-enable').onclick=enable;
 $('image-cancel').onclick=()=>{
  ++epoch;images.reset('Image operation canceled; no generated file returned.');switching=false;controls();
  say('Canceled / unloaded. GPU worker released; cached downloads and saved guest images retained. Reload text to continue.');
 };
 $('image-text').onclick=async()=>{
  ++epoch;images.reset('Switched to text; image operation canceled.');switching=true;reloadingText=true;controls();const current=epoch;
  say(`Janus released. Reloading ${textLabel()} from cache where possible…`);
  try{await resumeText();if(current===epoch){paused=false;say(`${textLabel()} ready. Janus unloaded. Guest files retained.`);}}
  catch(e){if(current===epoch)say(`Text reload failed: ${e.message}. Retry Reload text, or shut down and choose Simulator.`);}
  finally{if(current===epoch){switching=false;reloadingText=false;controls();}}
 };
 controls();
 return {
  enable,
  prepare(){paused=true;$('image-panel').open=true;controls();say('Janus selected · accept and enable below, or Reload text.');},
  get state(){return images.state;},
  get blocksText(){return paused||switching||images.state!=='off';},
  async generate(request){
   const current=epoch;
   const result=await images.generate(request);
   const png=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=reject;reader.readAsDataURL(result.blob);});
   if(current!==epoch)throw Error('Image operation canceled; result discarded.');
   say('Image generated · returning it to the terminal.');
   const {blob,...metadata}=result;return {...metadata,png:png.split(',')[1]};
  },
  reset(){++epoch;images.reset();switching=false;reloadingText=false;paused=false;$('image-consent').checked=false;controls();say('Off · no image downloads until you accept and enable.');},
 };
}
