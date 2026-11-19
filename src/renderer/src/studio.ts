import * as THREE from 'three'
import { pixelBudget } from './settings'
import { HDRLoader } from 'three/addons/loaders/HDRLoader.js'
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js'
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js'
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js'
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js'

/** Drawing-buffer scale for a canvas of w × h CSS pixels: the display's density, held to about four million pixels. */
export const pixelRatio = (w: number, h: number, budget = pixelBudget()) => Math.max(.75, Math.min(devicePixelRatio, Math.sqrt(budget / Math.max(1, w * h))))

export function studio(element: HTMLElement, options: {aoIntensity?:number;aoRadius?:number} = {}) {
 const renderer=new THREE.WebGLRenderer({alpha:true,antialias:true,powerPreference:'high-performance'})
 renderer.setPixelRatio(pixelRatio(element.clientWidth,element.clientHeight))
 renderer.setClearColor(0,0);renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.05
 renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFShadowMap
 element.append(renderer.domElement)
 const scene=new THREE.Scene();scene.environmentIntensity=.32;scene.environmentRotation.y=.65
 // Warm key from upper left with soft self-shadowing, strong cool rim from behind right, faint cool fill.
 const key=new THREE.DirectionalLight(0xffd6ad,2.6);key.position.set(-1.4,2.1,1.5);key.castShadow=true
 key.shadow.mapSize.set(1536,1536);key.shadow.radius=6;key.shadow.bias=-.0004;key.shadow.normalBias=.002
 Object.assign(key.shadow.camera,{left:-1,right:1,top:1,bottom:-1,near:.1,far:6})
 const rim=new THREE.DirectionalLight(0x86b4ff,3.2);rim.position.set(1.7,1,-2.2)
 const fill=new THREE.DirectionalLight(0x9fb3d6,.25);fill.position.set(1.5,.4,1.8)
 scene.add(key,rim,fill)
 let disposed=false,environment:THREE.WebGLRenderTarget|undefined,composer:EffectComposer|undefined,ao:GTAOPass|undefined,output:OutputPass|undefined,beauty:RenderPass|undefined
 new HDRLoader().load('./environments/studio-small-09.hdr',texture=>{
  if(disposed){texture.dispose();return}
  const pmrem=new THREE.PMREMGenerator(renderer);environment=pmrem.fromEquirectangular(texture);scene.environment=environment.texture;texture.dispose();pmrem.dispose();element.dataset.lightingLoaded='true'
 })
 let lastW=0,lastH=0,lastR=0
 return {renderer,scene,render:(camera:THREE.PerspectiveCamera|THREE.OrthographicCamera,overlay?:THREE.Scene)=>{
  const w=element.clientWidth,h=element.clientHeight;if(!w||!h)return
  if(!composer){
   const target=new THREE.WebGLRenderTarget(w,h,{type:THREE.HalfFloatType,samples:4})
   composer=new EffectComposer(renderer,target);beauty=new RenderPass(scene,camera);ao=new GTAOPass(scene,camera,w,h)
   ao.blendIntensity=options.aoIntensity??.7;ao.updateGtaoMaterial({radius:options.aoRadius??.025,thickness:.012,scale:1,distanceExponent:1,distanceFallOff:1})
   output=new OutputPass();composer.addPass(beauty);composer.addPass(ao)
   composer.addPass(output)
  }
  const r=renderer.getPixelRatio()
  if(w!==lastW||h!==lastH||r!==lastR){composer.setPixelRatio(r);composer.setSize(w,h);lastW=w;lastH=h;lastR=r}
  composer.render()
  // Emissive overlay draws after tone mapping so its colours stay saturated.
  if(overlay){const auto=renderer.autoClear;renderer.autoClear=false;renderer.setRenderTarget(null);renderer.clearDepth();renderer.render(overlay,camera);renderer.autoClear=auto}
 },dispose:()=>{
  disposed=true;scene.traverse(o=>{if(o instanceof THREE.Mesh){o.geometry.dispose();for(const m of Array.isArray(o.material)?o.material:[o.material]){for(const t of Object.values(m))if(t instanceof THREE.Texture)t.dispose();m.dispose()}}})
  environment?.dispose();beauty?.dispose();ao?.dispose();output?.dispose();composer?.dispose();renderer.dispose();renderer.domElement.remove()
 }}
}

