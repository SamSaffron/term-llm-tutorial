import {test} from 'node:test';
import assert from 'node:assert/strict';
import {modelDownloadProgress} from '../public/model-download-progress.mjs';
test('parallel file events cannot reset the active weight download or animate at completion',()=>{
 let clock=0;const events=[];const report=modelDownloadProgress(e=>events.push(e),'FunctionGemma',()=>clock);
 report({file:'model.onnx_data',total:1140000000,progress:20});
 report({file:'config.json',total:500,status:'done'});
 report({file:'model.onnx',total:500000,progress:100});
 for(let i=0;i<100;i++){clock++;report({file:'model.onnx_data',total:1140000000,progress:21+i/100});}
 assert.equal(events.length,1);
 clock=160;report({file:'model.onnx_data',total:1140000000,progress:30});
 clock=320;report({file:'model.onnx_data',total:1140000000,progress:25});
 report({file:'model.onnx_data',total:1140000000,progress:100});
 report({file:'model.onnx_data',status:'done'});
 assert.deepEqual(events.map(e=>e.progress),[.2,.3,.3,1]);
 assert.ok(events.every(e=>e.text==='Loading FunctionGemma · model.onnx_data'));
});
