import {simulate,SIMULATOR_MODEL} from './simulator.mjs';
self.onmessage=({data:{id,type,request}})=>{
 try{
  if(type==='load')self.postMessage({id,result:{loaded:true,model:SIMULATOR_MODEL,context:request?.context||16384,precision:'scripted · no model',runtime:'Tutorial simulator; real CLI and tools',simulated:true}});
  else if(type==='complete'){
   const result=simulate(request);
   self.postMessage({diagnostic:{model:SIMULATOR_MODEL,simulated:true,request,raw:JSON.stringify(result.choices[0].message)}});
   self.postMessage({id,result});
  }else throw Error('Unknown simulator operation');
 }catch(e){self.postMessage({id,error:'Tutorial simulator: '+e.message});}
};
