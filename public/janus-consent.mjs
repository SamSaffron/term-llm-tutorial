// One decision on the launch screen, never an in-tutorial prompt.
export function confirmJanus(dialog){
 return new Promise(resolve=>{
  const finish=accepted=>{dialog.close();dialog.oncancel=null;dialog.querySelector('[data-accept]').onclick=null;dialog.querySelector('[data-back]').onclick=null;resolve(accepted);};
  dialog.querySelector('[data-accept]').onclick=()=>finish(true);
  dialog.querySelector('[data-back]').onclick=()=>finish(false);
  dialog.oncancel=event=>{event.preventDefault();finish(false);};
  dialog.showModal();dialog.querySelector('[data-back]').focus();
 });
}
