import {WTerm} from '@wterm/dom';
import {GhosttyCore} from '@wterm/ghostty';

export async function createTerminal(element){
 const core=await GhosttyCore.load({wasmPath:'assets/ghostty-vt.wasm',scrollbackLimit:2*1024*1024,backgroundColor:'#060a10',foregroundColor:'#e5edf6',imageStorageLimit:32*1024*1024});
 // app.fit owns geometry and the guest TTY size; do not race a second observer.
 const term=new WTerm(element,{core,cols:90,rows:26,autoResize:false,cursorBlink:false});
 // wterm measures cell pixels during init. A display:none ancestor prevents
 // its cell measurements and Kitty pixel geometry from being initialized.
 const hidden=element.closest('[hidden]'),visibility=hidden?.style.visibility;
 if(hidden){hidden.style.visibility='hidden';hidden.hidden=false;}
 try{await term.init();}finally{if(hidden){hidden.hidden=true;hidden.style.visibility=visibility;}}
 const cellText=cell=>cell.width===0?'':cell.chars||(cell.char?String.fromCodePoint(cell.char):' ');
 return {
  write:bytes=>term.write(bytes),reset:()=>term.write('\x1bc'),focus:()=>term.focus(),
  onData:callback=>{term.onData=callback;},resize:(cols,rows)=>term.resize(cols,rows),
  get cols(){return term.cols;},get rows(){return term.rows;},
  fit(){
   const probe=document.createElement('div');probe.className='term-row';probe.style.cssText='position:absolute;visibility:hidden;width:max-content';probe.textContent='W';element.append(probe);
   const size=probe.getBoundingClientRect();probe.remove();if(!size.width||!size.height)return;
   const css=getComputedStyle(element),width=element.clientWidth-parseFloat(css.paddingLeft)-parseFloat(css.paddingRight),height=element.clientHeight-parseFloat(css.paddingTop)-parseFloat(css.paddingBottom);
   term.resize(Math.min(240,Math.max(20,Math.floor(width/size.width))),Math.min(80,Math.max(8,Math.floor(height/size.height))));
  },
  get screen(){
   const history=core.usingAltScreen()?0:core.getScrollbackCount(),lines=[];
   for(let y=0;y<history+term.rows;y++){
    const cols=y<history?core.getScrollbackLineLen(y):term.cols;let line='';
    for(let x=0;x<cols;x++)line+=cellText(y<history?core.getScrollbackCell(y,x):core.getCell(y-history,x));
    lines.push(line.trimEnd());
   }
   return lines.join('\n');
  },
  get graphics(){return core.getGraphicsState();},get resources(){return core.getResourceState();},
  dispose(){term.destroy();core.dispose();}
 };
}
