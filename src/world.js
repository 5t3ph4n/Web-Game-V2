export const SIZE = 68;
export const regions = [
 {name:'Sunbeam Commons',sub:'A little beginning. A very big elsewhere.',color:'#a8c77d',x:0,z:0},
 {name:'Peachwood Grove',sub:'Even the trees have stories to tell.',color:'#c4c38b',x:-30,z:-25},
 {name:'The Blue Quiet',sub:'Stay a while. The water doesn’t mind.',color:'#8fbfa4',x:30,z:-26},
 {name:'Honeyhill Village',sub:'Good company, questionable directions.',color:'#c5c582',x:-30,z:29},
 {name:'Lavender Outlands',sub:'Where the wild things take their time.',color:'#b0b3a5',x:30,z:29},
 {name:'Cloudwatch Ridge',sub:'Nothing to do but look up.',color:'#b1c29b',x:0,z:-48}
];
export function regionAt(x,z) { return regions.reduce((a,b)=>Math.hypot(x-a.x,z-a.z)<Math.hypot(x-b.x,z-b.z)?a:b); }
export function land(x,z){return (x/66)**2+(z/62)**2 < 1 + .045*Math.sin(x*.3)*Math.cos(z*.22);}
export function height(x,z){return .5+Math.sin(x*.065)*1.8+Math.cos(z*.075)*1.4+Math.sin((x+z)*.12)*.45;}
export function rng(seed=28){return ()=>{seed=(seed*1664525+1013904223)>>>0;return seed/4294967296;};}
export const landmarks=[
 {id:'bell',name:'The wishing bell',x:4,z:3,type:'bell',region:0,action:'Ring the wishing bell',note:'A tiny sound that makes the whole island feel a little closer.',kind:'bell'},
 {id:'picnic',name:'A table for everyone',x:-9,z:8,type:'picnic',region:0,action:'Share a picnic with Pip',note:'Pip packed enough sandwiches for a stranger. You are glad it was you.',kind:'friend',speaker:'Pip',dialog:'Oh, hello! I packed six sandwiches and invited absolutely nobody. A flawless plan, really. Help yourself. If you follow the yellow path west, you’ll find Honeyhill. Ask about the windmill!'},
 {id:'orchard',name:'The generous tree',x:-29,z:-20,type:'tree',region:1,action:'Shake the peach tree',note:'Three peaches, a sleepy bird, and a very pleasant surprise.',kind:'fruit'},
 {id:'fox',name:'An unlikely guide',x:-40,z:-29,type:'fox',region:1,action:'Befriend the fox',note:'You made a friend who communicates entirely in little hops.',kind:'fox'},
 {id:'pond',name:'Skipping a little time',x:29,z:-23,type:'pond',region:2,action:'Skip a stone',note:'Five skips! Or was it six? The pond is keeping your secret.',kind:'pond'},
 {id:'boat',name:'Messages to nowhere',x:39,z:-13,type:'boat',region:2,action:'Launch a paper boat',note:'A paper boat has somewhere to be. You, happily, do not.',kind:'boat'},
 {id:'windmill',name:'Whatever the wind brings',x:-31,z:25,type:'windmill',region:3,action:'Turn the windmill',note:'The old mill still has a little dance left in it.',kind:'windmill'},
 {id:'moss',name:'A very slow conversation',x:-22,z:36,type:'npc',region:3,action:'Say hello to Moss',note:'Moss taught you the art of having absolutely no plans.',kind:'friend',speaker:'Moss',dialog:'I came here for an afternoon, forty-three afternoons ago. The trick is to never make a to-do list. Although… the flowers in the southeast do glow when you touch them. That’s worth a detour.'},
 {id:'flowers',name:'A field full of stars',x:30,z:25,type:'flowers',region:4,action:'Wake the wildflowers',note:'For a moment, the meadow became its own little galaxy.',kind:'flowers'},
 {id:'stones',name:'The earth hums back',x:40,z:35,type:'stones',region:4,action:'Play the singing stones',note:'An old song, patiently waiting for someone to press play.',kind:'stones'},
 {id:'telescope',name:'A different perspective',x:4,z:-48,type:'telescope',region:5,action:'Watch the clouds',note:'One looks like a whale. One looks like tomorrow.',kind:'cloud'},
 {id:'camp',name:'A place to come back to',x:-10,z:-43,type:'camp',region:5,action:'Rest by the campfire',note:'Warm hands, a full heart, and a sky that goes on forever.',kind:'camp'}
];
export function makeWorld(){
 const random=rng(), objects=[];
 for(let i=0;i<1300;i++){
  const x=(random()-.5)*130,z=(random()-.5)*124;
  if(!land(x,z)||landmarks.some(l=>Math.hypot(x-l.x,z-l.z)<5)||Math.abs(z-Math.sin(x*.065)*5)<2.1||Math.abs(x-Math.sin(z*.09)*7)<2.1)continue;
  const r=regions.indexOf(regionAt(x,z)),v=random();
  objects.push({x,z,type:v<.48?'tree':v<.62?'rock':v<.81?'grass':'flower',s:.6+random()*.8,r,variant:random(),solid:v<.48||v<.62});
 }
 for(const h of [{x:-6,z:-5},{x:8,z:-9},{x:-35,z:33},{x:-23,z:24},{x:-39,z:22},{x:-28,z:39}])objects.push({...h,type:'house',s:1.2,solid:true,r:3});
 return objects;
}
export function movePlayer(p,dx,dz,objects){
 const valid=(x,z)=>land(x,z)&&!objects.some(o=>o.solid&&!(o.type==='rock'&&p.y>.65)&&Math.hypot(x-o.x,z-o.z)<(o.type==='house'?2.3:o.type==='tree'?.48:.65));
 if(valid(p.x+dx,p.z))p.x+=dx;
 if(valid(p.x,p.z+dz))p.z+=dz;
}
