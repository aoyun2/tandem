import * as THREE from 'three'

// The supplied DS asset merges the inserted card and slot cover into `base`.
// Subtract only the measured Slot-1 volume, retaining the source shell and UVs.
export function emptySlot(mesh:THREE.Mesh) {
 const source=mesh.geometry,position=source.getAttribute('position'),normal=source.getAttribute('normal'),uv=source.getAttribute('uv'),index=source.index
 type Vertex={p:THREE.Vector3;n:THREE.Vector3;uv:THREE.Vector2;world:THREE.Vector3}
 const positions:number[]=[],normals:number[]=[],uvs:number[]=[]
 const planes:[number,number,number][]=[[0,1,-.0435],[0,-1,.044],[1,1,.01165],[1,-1,.0172],[2,1,-.119],[2,-1,-.085]]
 const mix=(a:Vertex,b:Vertex,t:number):Vertex=>({p:a.p.clone().lerp(b.p,t),n:a.n.clone().lerp(b.n,t),uv:a.uv.clone().lerp(b.uv,t),world:a.world.clone().lerp(b.world,t)})
 const split=(polygon:Vertex[],axis:number,sign:number,bound:number)=>{
  const inside:Vertex[]=[],outside:Vertex[]=[]
  for(let j=0;j<polygon.length;j++){
   const a=polygon[j],b=polygon[(j+1)%polygon.length],da=sign*(a.world.getComponent(axis)-bound),db=sign*(b.world.getComponent(axis)-bound)
   ;(da>=0?inside:outside).push(a)
   if((da>=0)!==(db>=0)){const v=mix(a,b,da/(da-db));inside.push(v);outside.push(v)}
  }return {inside,outside}
 }
 const emit=(poly:Vertex[])=>{for(let j=1;j<poly.length-1;j++)for(const v of [poly[0],poly[j],poly[j+1]]){positions.push(...v.p.toArray());normals.push(...v.n.toArray());uvs.push(...v.uv.toArray())}}
 for(let i=0;i<(index?.count??position.count);i+=3){
  let remainder:Vertex[]=[]
  for(let j=0;j<3;j++){const k=index?index.getX(i+j):i+j,p=new THREE.Vector3().fromBufferAttribute(position,k);remainder.push({p,n:new THREE.Vector3().fromBufferAttribute(normal,k),uv:new THREE.Vector2(uv.getX(k),uv.getY(k)),world:p.clone().applyMatrix4(mesh.matrixWorld)})}
  for(const [axis,sign,bound] of planes){if(remainder.length<3)break;const parts=split(remainder,axis,sign,bound);emit(parts.outside);remainder=parts.inside}
 }
 const result=new THREE.BufferGeometry();result.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));result.setAttribute('normal',new THREE.Float32BufferAttribute(normals,3));result.setAttribute('uv',new THREE.Float32BufferAttribute(uvs,2));result.computeBoundingSphere();mesh.geometry=result;source.dispose()
}

