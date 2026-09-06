import {renderMessages,parseToolResponse} from './qwen-tools.mjs';
export const MODEL = 'Qwen3-8B-q4f32_1-MLC';
export const MAX_OUTPUT = 2048;
function text(content) {
 if (typeof content === 'string') return content;
 if (content == null) return '';
 if (Array.isArray(content) && content.every(c=>c.type==='text')) return content.map(c=>c.text).join('\n');
 throw Error('Only text messages are supported');
}
export function adaptRequest(request,context=16384,model=MODEL) {
 if (!Array.isArray(request.messages)||!request.messages.length) throw Error('Messages required');
 const messages=renderMessages(request,text,/^Qwen3-/.test(model)?'json':'xml');
 const max_tokens=request.max_completion_tokens??request.max_tokens??MAX_OUTPUT;
 if(!Number.isInteger(max_tokens)||max_tokens<1||max_tokens>=context)throw Error('Invalid output token limit');
 const budget=messages.reduce((n,m)=>n+new TextEncoder().encode(m.content).length+32,128);
 if(budget>context-max_tokens)throw Error('Messages exceed the input safety budget; no history was truncated');
 return {model,messages,stream:false,max_tokens,temperature:request.temperature??0.7,top_p:request.top_p??0.8,presence_penalty:request.presence_penalty??0,extra_body:{enable_thinking:false},...(request.stop!=null?{stop:request.stop}:{}),...(request.seed!=null?{seed:request.seed}:{})};
}
export function adaptResponse(raw,request={}) { return parseToolResponse(raw,request); }
