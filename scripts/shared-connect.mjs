import { chromium } from 'playwright-core';
export async function connect(){
 const base=process.env.JARVIS_BROWSER_BASE_URL||'http://host.docker.internal:8787',token=process.env.JARVIS_BROWSER_TOKEN;
 const v=await (await fetch(base+'/jarvis-browser/json/version',{headers:{Authorization:`Bearer ${token}`}})).json();
 const u=new URL(v.webSocketDebuggerUrl); const b=new URL(base);u.host=b.host;u.protocol=b.protocol==='https:'?'wss:':'ws:';if(!u.pathname.startsWith('/jarvis-browser/'))u.pathname='/jarvis-browser'+u.pathname;u.searchParams.set('token',token);
 return chromium.connectOverCDP(u.toString());
}
