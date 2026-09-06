import test from 'node:test';
import assert from 'node:assert/strict';
import {adaptRequest,adaptResponse,MODEL} from '../public/protocol.mjs';
test('plain ask requires no tools or artifact prompt',()=>{
 const r=adaptRequest({model:MODEL,messages:[{role:'user',content:'hi'}]});
 assert.deepEqual(r.messages,[{role:'user',content:'hi'}]);assert.equal(r.tools,undefined);
});
test('keeps actual system and multi-turn history, ignores guest artifact extras',()=>{
 const messages=[{role:'system',content:'Be brief.'},{role:'user',content:'My name is Ada.'},{role:'assistant',content:'Hi Ada.'},{role:'user',content:'What is my name?'}];
 assert.deepEqual(adaptRequest({messages,browser_artifact:'DO NOT INJECT'}).messages,messages);
});
test('passes normal model response unchanged, including non-HTML and length finish',()=>{
 const r={choices:[{message:{role:'assistant',content:'Hello!'},finish_reason:'length'}]};assert.deepEqual(adaptResponse(r),r);
});
test('honors sampling and output limit',()=>{
 const r=adaptRequest({messages:[{role:'user',content:'hi'}],max_tokens:50,temperature:0,top_p:1});assert.equal(r.max_tokens,50);assert.equal(r.temperature,0);
});
test('invalid tools fail honestly; oversized input is not truncated',()=>{
 assert.throws(()=>adaptRequest({messages:[{role:'user',content:'hi'}],tools:[{function:{name:'anything'}}]}),/Invalid/);
 assert.throws(()=>adaptRequest({messages:[{role:'user',content:'x'.repeat(17000)}]}),/safety budget/);
});
test('Qwen3 uses native JSON calls and preserves real nested arguments and tool history',()=>{
 const tool={type:'function',function:{name:'read_file',parameters:{type:'object',properties:{path:{type:'string'}}}}};
 const call={id:'c1',type:'function',function:{name:'read_file',arguments:'{"path":"notes.txt","extra":{"test":true}}'}};
 const req={tools:[tool],messages:[{role:'user',content:'Read notes.txt'},{role:'assistant',content:null,tool_calls:[call]},{role:'tool',tool_call_id:'c1',content:'real contents'}]};
 const adapted=adaptRequest(req,16384,'Qwen3-8B-q4f32_1-MLC');assert.match(adapted.messages[0].content,/JSON object/);assert.match(adapted.messages[2].content,/"name":"read_file"/);assert.match(adapted.messages[3].content,/real contents/);
 const raw={choices:[{message:{role:'assistant',content:'<tool_call>\n{"name":"read_file","arguments":{"path":"notes.txt","extra":{"test":true}}}\n</tool_call>'},finish_reason:'stop'}]};
 const out=adaptResponse(raw,{tools:[tool]});assert.deepEqual(JSON.parse(out.choices[0].message.tool_calls[0].function.arguments),{path:'notes.txt',extra:{test:true}});
 assert.throws(()=>adaptResponse({...raw,choices:[{...raw.choices[0],finish_reason:'length'}]},{tools:[tool]}),/Truncated/);
 assert.throws(()=>adaptResponse(raw,{tools:[]}),/no tools/);
 assert.throws(()=>adaptResponse({choices:[{message:{content:'<tool_call>{"name":"read_file","arguments":{}'},finish_reason:'stop'}]},{tools:[tool]}),/Malformed/);
});
