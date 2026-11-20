import {createHash} from 'node:crypto';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {guideAssets} from '../src/guide-assets.js';
import {quickWalkthrough,shouldAutoplayGuide} from '../src/quick-walkthrough.js';
const kinds=['fields','ai','data','mapping','format','json'];
test('six real GIF guides have embedded posters and verified animation metadata',()=>{
 const manifest=JSON.parse(fs.readFileSync(new URL('../assets/guides/manifest.json',import.meta.url)));
 assert.deepEqual(Object.keys(guideAssets),kinds);
 for(const key of kinds){
  const bytes=Buffer.from(guideAssets[key].gif.split(',')[1],'base64');
  assert.equal(bytes.subarray(0,6).toString(),'GIF89a');
  assert.equal(bytes.readUInt16LE(6),720);assert.equal(bytes.readUInt16LE(8),420);
  assert.equal(bytes.length,manifest[key].bytes);assert.equal(manifest[key].duration_ms,manifest[key].captures.length*3000);assert.ok(manifest[key].frames>=60);
  assert.equal(Buffer.from(guideAssets[key].poster.split(',')[1],'base64').subarray(1,4).toString(),'PNG');
 }
});
test('closed guides use posters but expose pause instead of a required play step',()=>{
 for(const key of kinds){const html=quickWalkthrough(key);assert.ok(html.includes('aria-pressed="false"'));assert.ok(!html.includes('Phát GIF'));assert.ok(html.includes('Tạm dừng'));assert.ok(html.includes('Tự chạy khi mở'));assert.ok(html.includes('data:image/png;base64,'));assert.ok(!html.includes('data:image/gif;base64,'));assert.ok(!html.includes('<details open'));assert.equal((html.match(/<li>/g)||[]).length,3);assert.ok(html.includes('dữ liệu giả'));}
});

test('automatic playback starts on opening and respects hidden panels and reduced motion',()=>{assert.equal(shouldAutoplayGuide({open:true}),true);assert.equal(shouldAutoplayGuide({open:false}),false);assert.equal(shouldAutoplayGuide({open:true,ancestorsOpen:false}),false);assert.equal(shouldAutoplayGuide({open:true,hidden:true}),false);assert.equal(shouldAutoplayGuide({open:true,reducedMotion:true}),false);});
test('tutorial captures retain a reviewed renderer signature independent of checkout line endings',()=>{const root=new URL('../',import.meta.url),manifest=JSON.parse(fs.readFileSync(new URL('assets/guides/manifest.json',root))),hash=createHash('sha256').update(manifest._ui_files.map(file=>fs.readFileSync(new URL(file,root),'utf8').replace(/\r\n?/g,'\n')).join('')).digest('hex');for(const key of kinds){assert.equal(manifest[key].source,'real-ui-capture');assert.equal(manifest[key].ui_hash,hash,'UI changed: recapture relevant guide steps');for(const file of manifest[key].captures){const png=fs.readFileSync(new URL('assets/guide-captures/'+file,root));assert.equal(png.subarray(1,4).toString(),'PNG');}}});
