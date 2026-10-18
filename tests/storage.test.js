import test from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
process.env.SUPABASE_URL='https://project.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY='test-server-key';
const { saveImage, removeImage }=await import('../server/images.js');
test('cloud covers are WebP, stored remotely and only owned files can be deleted',async()=>{
 const original=globalThis.fetch;const calls=[];
 globalThis.fetch=async(url,options)=>{calls.push({url,options});return new Response('{}',{status:200});};
 try{
  const image=await saveImage({buffer:await sharp({create:{width:100,height:60,channels:3,background:'#ffffff'}}).png().toBuffer()});
  assert.match(image,/^https:\/\/project\.supabase\.co\/storage\/v1\/object\/public\/script-covers\/[a-f0-9-]+\.webp$/);
  assert.equal((await sharp(calls[0].options.body).metadata()).format,'webp');
  assert.equal(calls[0].options.headers.Authorization,'Bearer test-server-key');
  await removeImage(image.replace('project.supabase.co','other.supabase.co'));assert.equal(calls.length,1);
  await removeImage(image);assert.equal(calls[1].options.method,'DELETE');
  globalThis.fetch=async()=>new Response('{}',{status:503});
  await assert.rejects(saveImage({buffer:await sharp({create:{width:2,height:2,channels:3,background:'#ffffff'}}).png().toBuffer()}),/storage is unavailable/);
 }finally{globalThis.fetch=original;}
});
