import {test} from 'node:test';
import assert from 'node:assert/strict';
import {fetchBootAssets} from '../public/boot-assets.mjs';

test('boot refuses modified upstream bytes and omits credentials',async()=>{
 const original=globalThis.fetch;
 const requests=[];
 globalThis.fetch=async(url,options)=>{
  requests.push({url,options});
  return new Response('not the pinned boot binary');
 };
 try {
  await assert.rejects(fetchBootAssets(),/SHA-256 mismatch/);
  assert.equal(requests.length,3);
  for(const {url,options} of requests){
   assert.ok(url.startsWith('https://i.copy.sh/') || url.startsWith('https://raw.githubusercontent.com/copy/v86/'));
   assert.equal(options.credentials,'omit');
   assert.equal(options.referrerPolicy,'no-referrer');
  }
 } finally {globalThis.fetch=original;}
});

test('boot refuses unsuccessful upstream responses',async()=>{
 const original=globalThis.fetch;
 globalThis.fetch=async()=>new Response('',{status:503});
 try {await assert.rejects(fetchBootAssets(),/upstream HTTP 503/);}
 finally {globalThis.fetch=original;}
});
