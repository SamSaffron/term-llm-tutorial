// Image support is configuration, not consent to download or load a model.
export function mountLaunchChoice($) {
 let booting=false;
 const update=()=>{
  $('image-size-hint').hidden=$('image-support').value!=='janus';
  $('boot').disabled=booting;
  $('image-support').disabled=booting;
 };
 $('image-support').addEventListener('change',update);
 update();
 return {
  get imageSupport(){return $('image-support').value;},
  get allowed(){return !booting;},
  start(){booting=true;update();},
  reset(){booting=false;update();},
 };
}

export async function startProvider(imageSupport,{startText,prepareImages}) {
 // Preserve the selected LLM for Reload text without downloading it only to
 // discard it. The existing panel still requires consent and explicit enable.
 if(imageSupport==='janus')await prepareImages();
 else await startText();
}
