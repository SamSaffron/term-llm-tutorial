import test from 'node:test';import assert from 'node:assert/strict';import {simulate} from '../public/simulator.mjs';
const ask=(content,extra={})=>simulate({messages:[{role:'user',content}],...extra}).choices[0].message;
const tool=name=>({type:'function',function:{name,parameters:{type:'object'}}});
test('simulator answers all text lessons using supplied content, never a preseeded rain answer',()=>{
 assert.match(ask('What are three useful things to bring to a picnic?').content,/blanket/i);
 const data='<<<<< FILE: notes.txt >>>>>\nPicnic: Monday, Library Garden.\nTwo people.\nBring towels and apples.\nIf it rains, meet at the museum.\n<<<<< END FILE >>>>>\n\n';
 assert.match(ask(data+'Summarize our picnic plan in three bullets.').content,/Monday/);
 assert.match(ask(data+'What should we do if it rains?').content,/museum/);
 assert.doesNotMatch(ask(data+'What should we do if it rains?').content,/community hall/);
 assert.match(ask(data+'Make a picnic checklist of at most five items.').content,/towels/);
 assert.match(ask(data.replace('FILE: notes.txt','STDIN').replace('END FILE','END STDIN')+'rain?').content,/museum/);
});
test('simulator requests real read_file then answers actual tool result, including errors',()=>{
 const request={messages:[{role:'user',content:'Read custom.txt and tell me our rain plan.'}],tools:[tool('read_file')]};const call=simulate(request).choices[0].message;
 assert.deepEqual(JSON.parse(call.tool_calls[0].function.arguments),{path:'custom.txt'});
 const result={role:'tool',tool_call_id:call.tool_calls[0].id,content:'1: If it rains, go to the library.'};
 const follow=simulate({...request,messages:[...request.messages,call,result]}).choices[0].message;
 assert.equal(follow.tool_calls,undefined);assert.match(follow.content,/library/);
 const failed=simulate({...request,messages:[...request.messages,call,{...result,content:'Error: permission denied'}]}).choices[0].message;assert.match(failed.content,/not read the file successfully/);
 assert.equal(ask('Read custom.txt',{tools:[tool('read_file')],tool_choice:'none'}).tool_calls,undefined);
});
test('simulator preserves conversation-only memory and discloses unsupported scope',()=>{
 const message=simulate({messages:[{role:'user',content:'One person is vegan.'},{role:'assistant',content:'Sample'},{role:'user',content:'Remind me of the dietary requirement.'}]}).choices[0].message;
 assert.match(message.content,/vegan/);assert.match(ask('Remind me of the dietary requirement.').content,/not supplied/);
 assert.match(ask('Explain quantum chromodynamics.').content,/scripted tutorial simulator, not a general AI/);
});
test('simulator emits valid native exec suggestions, respects required tool scope and no fake tokens',()=>{
 const r=simulate({messages:[{role:'user',content:'List files in the current directory'}],tools:[tool('suggest_commands')],tool_choice:{type:'function',function:{name:'suggest_commands'}}});
 assert.equal(JSON.parse(r.choices[0].message.tool_calls[0].function.arguments).suggestions.length,3);assert.equal(r.usage.total_tokens,0);
 assert.throws(()=>ask('do something unsupported',{tools:[tool('different')],tool_choice:'required'}),/does not support/);
});
