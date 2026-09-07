// Immutable upstream assets. No fetch occurs until the Bonsai worker is loaded.
export const BONSAI_MODEL = 'prism-ml/Bonsai-8B-Q1_0';
const aux = 'https://raw.githubusercontent.com/stfurkan/bitgpu/20dbb9b21ae427bdddaa332d11a33a14702652d0/models/bonsai-8b-gguf/';
const tokenizer = 'https://huggingface.co/onnx-community/Bonsai-8B-ONNX/resolve/a5694a132e4050cef2dc335528016ce7e56504c9/';
export const BONSAI_ASSETS = {
 manifest: {url: aux+'manifest.json', bytes:104294, sha256:'1ee07d35cf91d551875159be35de689edcf690d219e03f69c3fc52c4eb6bb1d3'},
 aux: {url:aux+'Bonsai-8B-Q1_0.aux.bin', bytes:1536, sha256:'0d6b0343095642b26ea9a7cbfff224782cd0e23fe25a008e639289fb241aabf4'},
 data: {url:'https://huggingface.co/prism-ml/Bonsai-8B-gguf/resolve/48516770dd04643643e9f9019a2a349cf26c5dbd/Bonsai-8B-Q1_0.gguf', bytes:1158654496, sha256:'284a335aa3fb2ced3b1b01fcb40b08aa783e3b70832767f0dd2e3fdfa134bd54'},
 tokenizer: {url:tokenizer+'tokenizer.json', bytes:9117036, sha256:'40ae5d1ee027b985684a3bbeef4ee16b2b5697d1d90658bec5bc5d2a73018bd7'},
 tokenizerConfig: {url:tokenizer+'tokenizer_config.json', bytes:4598, sha256:'a8342e0e0e791a478f628dd1adf825ab1f9afe4a1075959ad32d77f1318b9841'},
};
export function verifyBonsaiCapabilities(caps, context) {
 if(![4096,8192,16384].includes(context))throw Error('Unsupported context selection');
 if(caps?.activation!=='f32'||caps?.kvCache!=='q8'||caps?.maxSeqLen!==context||caps?.overflow!=='error')throw Error('Bonsai runtime capabilities differ from requested f32/q8/context/error settings; refusing fallback');
 return caps;
}
