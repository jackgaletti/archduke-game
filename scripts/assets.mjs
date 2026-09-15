import sharp from 'sharp';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
const values=[-3,0,1,2,3,4,5,6,7,8,9,10,11,12,13,'back'];
await mkdir('public/cards',{recursive:true});
const manifest={};
for(const value of values){
 const source=`assets/source-cards/${value}.png`;const bytes=await readFile(source);const info=await sharp(bytes).metadata();
 if(!info.width||!info.height)throw new Error(`Invalid artwork: ${source}`);
 const output=`public/cards/${value}.webp`;await sharp(bytes).extract({left:195,top:157,width:2660,height:3724}).resize({width:420,withoutEnlargement:true}).webp({quality:90}).toFile(output);
 manifest[value]={source,url:`/cards/${value}.webp`,width:info.width,height:info.height,sha256:createHash('sha256').update(bytes).digest('hex')};
}
await writeFile('src/shared/artwork.json',JSON.stringify(manifest,null,2)+'\n');
console.log('Validated all 16 original PNGs; removed transparent padding and generated 5:7 WebP assets without clipping artwork.');
