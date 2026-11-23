'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {imageCrop}=require('../src/capture/crop');
const {decodePracticeImage}=require('../src/capture/image');
test('crop maps reversed drags and Retina preview coordinates to image pixels',()=>{
 assert.deepEqual(imageCrop({x:90,y:80},{x:10,y:20},{width:100,height:100},{width:200,height:200}),{x:20,y:40,width:160,height:120});
 assert.deepEqual(imageCrop({x:-20,y:-10},{x:200,y:200},{width:100,height:100},{width:201,height:200}),{x:0,y:0,width:201,height:200});
});
test('tiny or invalid selections do not create a misleading crop',()=>{
 assert.equal(imageCrop({x:1,y:1},{x:2,y:2},{width:100,height:100},{width:200,height:200}),null);
 assert.throws(()=>imageCrop({x:NaN,y:0},{x:20,y:20},{width:100,height:100},{width:200,height:200}),/dimensions/);
});
test('image IPC rejects active content, oversized PNG dimensions and unreadable image bytes',()=>{
 const native={createFromBuffer:()=>({isEmpty:()=>true})};
 assert.throws(()=>decodePracticeImage(native,'data:image/svg+xml;base64,PHN2Zz4='),/PNG/);
 assert.throws(()=>decodePracticeImage(native,'file:///tmp/image.png'),/PNG/);
 const png=Buffer.alloc(24);Buffer.from('89504e470d0a1a0a','hex').copy(png);png.writeUInt32BE(100000,16);png.writeUInt32BE(100000,20);
 assert.throws(()=>decodePracticeImage(native,'data:image/png;base64,'+png.toString('base64')),/megapixels/);
 assert.throws(()=>decodePracticeImage(native,'data:image/jpeg;base64,YQ=='),/read/);
});
