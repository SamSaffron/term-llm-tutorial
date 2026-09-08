// Choices stay fixed for a session. Only GPU residency changes; requests never
// switch providers or fall back to a different model.
export class SessionModels {
 constructor(backends){this.backends=backends;this.active=null;this.epoch=0;this.queue=Promise.resolve();}
 run(kind,work){
  const epoch=this.epoch;
  const current=()=>{if(epoch!==this.epoch)throw Error('Session stopped');};
  const result=this.queue.then(async()=>{
   current();const backend=this.backends[kind];
   if(!backend)throw Error('Provider not selected at boot');
   if(this.active!==kind||!backend.ready()){
    for(const provider of Object.values(this.backends))provider.unload();
    this.active=null;
    try{await backend.load();}catch(error){if(epoch===this.epoch)backend.unload();throw error;}
    current();this.active=kind;
   }
   const value=await work();current();return value;
  });
  this.queue=result.catch(()=>{});return result;
 }
 reset(){++this.epoch;this.active=null;this.queue=Promise.resolve();for(const provider of Object.values(this.backends))provider.unload();}
}
