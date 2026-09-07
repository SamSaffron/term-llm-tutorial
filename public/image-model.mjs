// Exact proven six-session configuration; do not select f16 based on adapter features.
export const IMAGE_MODEL = 'onnx-community/Janus-Pro-1B-ONNX';
export const IMAGE_REVISION = '04efdf2e36cb07a034b0d94f7322356b292f0418';
export const IMAGE_BYTES = 2996215163;
export const IMAGE_DTYPE = {prepare_inputs_embeds:'q4',language_model:'q4',lm_head:'fp32',gen_head:'fp32',gen_img_embeds:'fp32',image_decode:'fp32'};
export const IMAGE_DEVICE = {prepare_inputs_embeds:'wasm',language_model:'webgpu',lm_head:'webgpu',gen_head:'webgpu',gen_img_embeds:'webgpu',image_decode:'webgpu'};
export function imageRequest(request) {
 if(typeof request?.prompt!=='string'||!request.prompt.trim()||request.prompt.length>2000)throw Error('Use a prompt of 1–2000 characters.');
 const seed=request.seed??crypto.getRandomValues(new Uint32Array(1))[0];
 if(!Number.isInteger(seed)||seed<0||seed>4294967295)throw Error('Seed must be an integer from 0 to 4294967295.');
 return {prompt:request.prompt.trim(),seed};
}
export function mulberry32(seed) {
 let a=seed>>>0;
 return ()=>{a=(a+0x6D2B79F5)|0;let t=a;t=Math.imul(t^(t>>>15),t|1);t^=t+Math.imul(t^(t>>>7),t|61);return ((t^(t>>>14))>>>0)/4294967296;};
}
