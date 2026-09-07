// The same consent element lives at the gate or in the post-boot panel.
// Selecting images alone never creates a worker or starts a download.
export function mountLaunchChoice($) {
 let booting=false;
 const update=()=>{
  const images=$('launch-mode').value==='images';
  $('launch-image-consent').hidden=!images;
  $(images&&!booting?'launch-image-consent':'panel-image-consent').append($('image-consent-label'));
  $('model-label').textContent=images?'Text provider for Reload text (not loaded at launch)':'Text provider';
  $('mode-note').hidden=images;
  $('boot').textContent=images?'Accept & start images (~3 GB) ↗':'Start tutorial ↗';
  $('boot').disabled=booting||(images&&!$('image-consent').checked);
  $('launch-mode').disabled=booting;
 };
 $('launch-mode').addEventListener('change',update);
 $('image-consent').addEventListener('change',update);
 update();
 return {
  get mode(){return $('launch-mode').value;},
  get allowed(){return !booting&&(this.mode==='text'||$('image-consent').checked);},
  start(){booting=true;update();},
  reset(){booting=false;update();},
 };
}

export async function startProvider(mode,{startText,startImages}) {
 // Keep the selected text provider for a later explicit Reload text, but never
 // load it as a prerequisite for images (not even the scripted simulator).
 if(mode==='images')await startImages();
 else await startText();
}
