import {createEngine} from 'bitgpu';
import {createChat,validateTools} from 'bitgpu/chat';
import {bonsaiDownloads} from './bonsai-downloads.mjs';
import {bonsaiWorker} from './bonsai-runtime.mjs';
const post=data=>self.postMessage(data);
self.onmessage=bonsaiWorker({createEngine,createChat,validateTools,post,downloads:bonsaiDownloads(progress=>post({progress}))});
