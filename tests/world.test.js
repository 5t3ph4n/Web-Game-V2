import test from 'node:test';
import assert from 'node:assert/strict';
import {regions,regionAt,land,landmarks,makeWorld,movePlayer} from '../src/world.js';
test('all twelve discoveries are reachable land in their intended regions',()=>{
 assert.equal(landmarks.length,12);assert.equal(new Set(landmarks.map(l=>l.id)).size,12);
 for(const l of landmarks){assert.ok(land(l.x,l.z),l.id);assert.equal(regionAt(l.x,l.z).name,regions[l.region].name);}
});
test('world generation is deterministic and leaves landmark approaches clear',()=>{
 const a=makeWorld();assert.deepEqual(a,makeWorld());assert.ok(a.length>700);
 for(const l of landmarks)assert.ok(!a.some(o=>o.solid&&Math.hypot(o.x-l.x,o.z-l.z)<2.5),l.id);
});
test('movement blocks coast and solid objects but permits open ground',()=>{
 const p={x:0,z:0};movePlayer(p,1,0,[]);assert.equal(p.x,1);
 movePlayer(p,1,0,[{x:2,z:0,solid:true,type:'house'}]);assert.equal(p.x,1);
 movePlayer(p,100,0,[]);assert.equal(p.x,1);
 movePlayer(p,0,1,[]);assert.equal(p.z,1);
});
