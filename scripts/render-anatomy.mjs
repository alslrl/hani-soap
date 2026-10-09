// Renders the licensed GLB once at build-authoring time. The app ships PNGs only.
import { createServer } from 'node:http';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { chromium } from '@playwright/test';

const root = process.cwd();
const assetDirectory = path.join(root, 'public/demo/anatomy');
const geometryDirectory = path.join(root, 'data/anatomy');
const female = process.argv.includes('--female');
const version = female ? 'v3-female' : 'v2';
const html = `<!doctype html><html><head><style>html,body{margin:0;background:transparent}canvas{display:block}</style>
<script type="importmap">{"imports":{"three":"/three/build/three.module.js","three/addons/":"/three/examples/jsm/"}}</script></head><body><script type="module">
import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {DRACOLoader} from 'three/addons/loaders/DRACOLoader.js';
const renderer = new THREE.WebGLRenderer({antialias:true,alpha:true,preserveDrawingBuffer:true});
renderer.setSize(2000,2000);renderer.setPixelRatio(1);renderer.setClearColor(0,0);
renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.18;
document.body.append(renderer.domElement);
const draco=new DRACOLoader().setDecoderPath('/three/examples/jsm/libs/draco/gltf/');
const loader=new GLTFLoader().setDRACOLoader(draco);
const model=(await loader.loadAsync('/model.glb')).scene;
const components=[];
model.traverse(mesh=>{
 if(!mesh.isMesh)return;
 const g=mesh.geometry,position=g.attributes.position,index=g.index.array;
 const parents=Int32Array.from({length:position.count},(_,i)=>i);
 const find=i=>{while(parents[i]!==i){parents[i]=parents[parents[i]];i=parents[i]}return i};
 const join=(a,b)=>{a=find(a);b=find(b);if(a!==b)parents[a]=b};
 for(let i=0;i<index.length;i+=3){join(index[i],index[i+1]);join(index[i+1],index[i+2])}
 const groups=new Map();for(let i=0;i<index.length;i+=3){const k=find(index[i]);if(!groups.has(k))groups.set(k,[]);groups.get(k).push(index[i],index[i+1],index[i+2])}
 const ranked=[...groups.values()].sort((a,b)=>b.length-a.length);
 components.push(...ranked.map(indices=>{
  const box=new THREE.Box3();for(const i of indices)box.expandByPoint(new THREE.Vector3().fromBufferAttribute(position,i));
  return {triangles:indices.length/3,min:box.min.toArray(),max:box.max.toArray()};
 }));
 // The GLB joins its anatomical surface and a disconnected textual label.
 // Body regions are also disconnected. Keep every anatomical component, including
 // small face/hand surfaces; only the flat text to the left of the body is removed.
 const kept=ranked.filter(indices=>{
  if (${female}) return true;
  const box=new THREE.Box3();for(const i of indices)box.expandByPoint(new THREE.Vector3().fromBufferAttribute(position,i));
  return !(box.max.x < -0.35 && box.max.z-box.min.z < 0.001);
 }).flat();
 const remap=new Map(),vertices=[],normals=[],newIndex=[],groupsByPosition=new Map();
 const keyOf=old=>[position.getX(old),position.getY(old),position.getZ(old)].map(v=>Math.round(v*100000)).join(',');
 for(const old of new Set(kept)){const k=keyOf(old);if(!groupsByPosition.has(k))groupsByPosition.set(k,[]);groupsByPosition.get(k).push(old)}
 // Preserve the model's hard anatomical edges. Smoothing interior region caps
 // into the skin creates an artificial midline; average only aligned normals.
 for(const old of kept){if(!remap.has(old)){remap.set(old,remap.size);vertices.push(position.getX(old),position.getY(old),position.getZ(old));const original=new THREE.Vector3().fromBufferAttribute(g.attributes.normal,old);const smooth=new THREE.Vector3();for(const peer of groupsByPosition.get(keyOf(old))){const n=new THREE.Vector3().fromBufferAttribute(g.attributes.normal,peer);if(original.dot(n)>0.75)smooth.add(n)}smooth.normalize();normals.push(smooth.x,smooth.y,smooth.z)}newIndex.push(remap.get(old))}
 const clean=new THREE.BufferGeometry();clean.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));clean.setAttribute('normal',new THREE.Float32BufferAttribute(normals,3));clean.setIndex(newIndex);clean.computeBoundingBox();clean.computeBoundingSphere();mesh.geometry=clean;
 mesh.material=new THREE.MeshStandardMaterial({color:0xb4c5bf,roughness:0.76,metalness:0,side:THREE.DoubleSide});
 mesh.castShadow=false;mesh.receiveShadow=false;
});
const bounds=new THREE.Box3().setFromObject(model);const size=bounds.getSize(new THREE.Vector3());const center=bounds.getCenter(new THREE.Vector3());
model.position.x-=center.x;model.position.y-=bounds.min.y;model.position.z-=center.z;
const scene=new THREE.Scene();scene.add(model);
scene.add(new THREE.HemisphereLight(0xffffff,0x647b78,1.5));
const addLight=(color,intensity,x,y,z)=>{const light=new THREE.DirectionalLight(color,intensity);light.position.set(x,y,z);scene.add(light);return light};
const key=addLight(0xfff8ed,2.4,-1.8,2.5,3);const fill=addLight(0xe5f4f4,0.8,2.0,1.0,2.0);const rim=addLight(0xffffff,1.2,0,1.5,-2.0);
const scale=921/size.y;const plane=1000/scale;const cameraCenter=size.y+(42-500)/scale;
const camera=new THREE.OrthographicCamera(-plane/2,plane/2,plane/2,-plane/2,0.01,20);
const masks={};const previews={};
for(const view of ['front','back']){
 const sign=view==='front'?1:-1;
 camera.position.set(0,cameraCenter,sign*4);camera.lookAt(0,cameraCenter,0);camera.updateProjectionMatrix();
 key.position.z=sign*3;fill.position.z=sign*2;rim.position.z=-sign*2;
 renderer.render(scene,camera);
 previews[view]=renderer.domElement.toDataURL('image/png');
 const sample=document.createElement('canvas');sample.width=sample.height=1000;const c=sample.getContext('2d',{willReadFrequently:true});c.drawImage(renderer.domElement,0,0,1000,1000);const pixels=c.getImageData(0,0,1000,1000).data;
 masks[view]=Array.from({length:1000},(_,y)=>{const spans=[];let start=-1;for(let x=0;x<=1000;x++){const solid=x<1000&&pixels[(y*1000+x)*4+3]>=32;if(solid&&start<0)start=x;if(!solid&&start>=0){spans.push([start,x-1]);start=-1}}return spans});
}
window.result={previews,masks,metadata:{components,bounds:{min:bounds.min.toArray(),max:bounds.max.toArray()},plane:{width:1000,height:1000,bodyTop:42,bodyBottom:963},renderer:THREE.REVISION}};
draco.dispose();renderer.dispose();
</script></body></html>`;

const server = createServer(async (request,response) => {
  const pathname=new URL(request.url,'http://localhost').pathname;
  try {
    if(pathname==='/'){response.setHeader('Content-Type','text/html');response.end(html);return;}
    let file;
    if(pathname==='/model.glb')file=path.join(assetDirectory,female?'source/body-female.glb':'source/body-skin.glb');
    else if(pathname.startsWith('/three/')&&!pathname.includes('..'))file=path.join(root,'node_modules/three',pathname.slice(7));
    else{response.writeHead(404);response.end();return;}
    const type=file.endsWith('.js')?'text/javascript':file.endsWith('.wasm')?'application/wasm':'application/octet-stream';
    response.setHeader('Content-Type',type);response.end(await readFile(file));
  }catch{response.writeHead(404);response.end();}
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const browser=await chromium.launch({headless:true,args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']});
try {
 const page=await browser.newPage({viewport:{width:2000,height:2000}});
 page.on('pageerror',e=>console.error(e.message));
 await page.goto(`http://127.0.0.1:${server.address().port}`);
 await page.waitForFunction(()=>Boolean(window.result),{timeout:60000});
 const result=await page.evaluate(()=>window.result);
 await mkdir(assetDirectory,{recursive:true});await mkdir(geometryDirectory,{recursive:true});
 for(const [view,data]of Object.entries(result.previews))await writeFile(path.join(assetDirectory,`body-${view}-${version}.png`),Buffer.from(data.split(',')[1],'base64'));
 await writeFile(path.join(geometryDirectory,`body-map-${version}-silhouette.json`),JSON.stringify(result.masks)+'\n');
 await writeFile(path.join(geometryDirectory,female?'render-metadata-female.json':'render-metadata.json'),JSON.stringify(result.metadata,null,2)+'\n');
 console.log(JSON.stringify({bounds:result.metadata.bounds,plane:result.metadata.plane,renderer:result.metadata.renderer,components:result.metadata.components.length}));
} finally {await browser.close();await new Promise(resolve=>server.close(resolve));}
