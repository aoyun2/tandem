import * as THREE from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'

export function loadCartridge(game: 'Black 2'|'White 2', height=.14): Promise<THREE.Group> {
  return new GLTFLoader().loadAsync('./models/cartridge/cartridge.gltf').then(gltf=>{
    const model=gltf.scene;model.rotation.x=Math.PI/2;model.updateMatrixWorld(true)
    const box=new THREE.Box3().setFromObject(model),scale=height/box.getSize(new THREE.Vector3()).y
    model.scale.multiplyScalar(scale);model.position.copy(box.getCenter(new THREE.Vector3())).multiplyScalar(-scale)
    model.traverse(child=>{if(child instanceof THREE.Mesh)for(const material of Array.isArray(child.material)?child.material:[child.material]){
      if(material.name==='presetNdsiCartridgeFront4'&&material instanceof THREE.MeshStandardMaterial){
        material.map?.dispose();const texture=new THREE.TextureLoader().load(game==='White 2'?'./art/white2.png':'./art/black2.png')
        texture.colorSpace=THREE.SRGBColorSpace;texture.flipY=false;texture.offset.set(.145,0);texture.repeat.set(.855,1);texture.anisotropy=8
        material.map=texture;material.metalness=0;material.roughness=.65;material.needsUpdate=true
      }
    }})
    const wrapper=new THREE.Group();wrapper.add(model);return wrapper
  })
}
