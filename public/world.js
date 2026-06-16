/* ===========================================================================
   YATA — el mundo (planeta embrujado, estética PS1 / Silent Hill).
   Render a baja resolución + niebla + grano/dither + wobble de vértices.
   Casas abren la app en overlay. Sastrería = vestuario. My Hell = tu cuarto.
   Three r128 (global THREE, vendoreado).
   =========================================================================== */
(function () {
"use strict";
var note = document.getElementById('loadnote');
if (!window.THREE) { if (note) note.textContent = "No cargó el motor 3D. Recargá la página."; return; }
var T = window.THREE;

/* ----------------------------------------------------------- helpers */
var clamp=function(v,a,b){return Math.max(a,Math.min(b,v));};
var lerp=function(a,b,t){return a+(b-a)*t;};
var rand=function(a,b){return a+Math.random()*(b-a);};
var pick=function(a){return a[Math.floor(Math.random()*a.length)];};
var TAU=Math.PI*2;
var UP_Y=new T.Vector3(0,1,0);

function noise3(v){
  return 0.55*Math.sin(v.x*1.7+v.y*2.3) + 0.35*Math.sin(v.y*2.9+v.z*1.3+1.7)
       + 0.28*Math.sin(v.z*2.1+v.x*1.9+4.1) + 0.18*Math.sin((v.x+v.z)*4.0+2.0);
}
var R=30;
function terrainR(dir){ return R + noise3(dir.clone().multiplyScalar(1.6))*2.1; }
function surfacePoint(dir){ var d=dir.clone().normalize(); return d.multiplyScalar(terrainR(d)); }

function ps1v(mat){
  mat.onBeforeCompile=function(sh){
    sh.vertexShader=sh.vertexShader.replace('#include <project_vertex>',
      '#include <project_vertex>\n{ float _w=max(gl_Position.w,0.0001); vec2 _g=vec2(184.0,140.0);\n gl_Position.xy=floor((gl_Position.xy/_w)*_g)/_g*_w; }');
  };
  mat.customProgramCacheKey=function(){return 'ps1snap';};
  return mat;
}

function glowTexture(inner, outer){
  var s=128, cv=document.createElement('canvas'); cv.width=cv.height=s;
  var ctx=cv.getContext('2d'), g=ctx.createRadialGradient(s/2,s/2,0,s/2,s/2,s/2);
  g.addColorStop(0,inner); g.addColorStop(0.4,outer); g.addColorStop(1,'rgba(0,0,0,0)');
  ctx.fillStyle=g; ctx.fillRect(0,0,s,s);
  var tex=new T.CanvasTexture(cv); tex.needsUpdate=true; return tex;
}
var TEX_TEAL=glowTexture('rgba(150,255,238,1)','rgba(90,220,200,.45)');
var TEX_WARM=glowTexture('rgba(255,224,160,1)','rgba(255,180,90,.4)');
var TEX_SOFT=glowTexture('rgba(255,255,255,1)','rgba(160,200,255,.35)');
var TEX_MAG =glowTexture('rgba(255,140,235,1)','rgba(190,80,220,.4)');
var TEX_RED =glowTexture('rgba(255,120,90,1)','rgba(200,40,30,.4)');
var TEX_GRN =glowTexture('rgba(150,255,150,1)','rgba(60,200,90,.4)');
var TEX_PURP=glowTexture('rgba(190,150,255,1)','rgba(120,70,220,.4)');
var TEX_MIST=glowTexture('rgba(170,180,185,.6)','rgba(110,120,128,.25)');
var TEX_SHADOW=glowTexture('rgba(0,0,0,.6)','rgba(0,0,0,0)');

function batTexture(){
  var s=64, cv=document.createElement('canvas'); cv.width=cv.height=s; var c=cv.getContext('2d');
  c.fillStyle='#08080e'; c.beginPath();
  c.moveTo(32,30); c.quadraticCurveTo(8,14,2,30); c.quadraticCurveTo(14,30,18,40);
  c.quadraticCurveTo(26,30,32,42); c.quadraticCurveTo(38,30,46,40); c.quadraticCurveTo(50,30,62,30);
  c.quadraticCurveTo(56,14,32,30); c.fill();
  var t=new T.CanvasTexture(cv); t.needsUpdate=true; return t;
}
var TEX_BAT=batTexture();

function makeSprite(tex,color,scale,blend){
  var m=new T.SpriteMaterial({map:tex,color:(color===undefined?0xffffff:color),transparent:true,
    blending:(blend===undefined?T.AdditiveBlending:blend),depthWrite:false});
  var s=new T.Sprite(m); s.scale.setScalar(scale); return s;
}
function emat(color,emis,ei,rough){
  return ps1v(new T.MeshStandardMaterial({color:color,emissive:(emis===undefined?0x000000:emis),
    emissiveIntensity:(ei===undefined?0:ei),roughness:(rough===undefined?0.85:rough),flatShading:true}));
}
function fibSphere(n){ var p=[],phi=Math.PI*(3-Math.sqrt(5)),i;
  for(i=0;i<n;i++){var y=1-(i/(n-1))*2,r=Math.sqrt(1-y*y),t=phi*i; p.push(new T.Vector3(Math.cos(t)*r,y,Math.sin(t)*r));} return p; }
function randDir(){ return new T.Vector3(rand(-1,1),rand(-1,1),rand(-1,1)).normalize(); }

function mergeParts(parts){
  var pos=[],nor=[],col=[],i,j;
  for(i=0;i<parts.length;i++){
    var pt=parts[i], g=pt.geo.index?pt.geo.toNonIndexed():pt.geo.clone();
    if(pt.matrix) g.applyMatrix4(pt.matrix);
    g.computeVertexNormals();
    var pa=g.attributes.position.array, na=g.attributes.normal.array, n=g.attributes.position.count;
    for(j=0;j<pa.length;j++){ pos.push(pa[j]); nor.push(na[j]); }
    for(j=0;j<n;j++){ col.push(pt.color.r,pt.color.g,pt.color.b); }
  }
  var m=new T.BufferGeometry();
  m.setAttribute('position',new T.Float32BufferAttribute(pos,3));
  m.setAttribute('normal',new T.Float32BufferAttribute(nor,3));
  m.setAttribute('color',new T.Float32BufferAttribute(col,3));
  return m;
}
var _m=new T.Matrix4(), _q=new T.Quaternion(), _qy=new T.Quaternion(), _s=new T.Vector3(), _p=new T.Vector3();
function instAt(mesh,i,dir,scaleV,yaw,lift){
  var up=dir.clone().normalize();
  _q.setFromUnitVectors(UP_Y,up); _qy.setFromAxisAngle(UP_Y,yaw||0); _q.multiply(_qy);
  _p.copy(up).multiplyScalar(terrainR(up)+(lift||0));
  _s.copy(scaleV);
  _m.compose(_p,_q,_s); mesh.setMatrixAt(i,_m);
}
function meshAt(geo,mat,x,y,z){ var m=new T.Mesh(geo,mat); m.position.set(x,y,z); return m; }
function coneGeo(r,h,seg){ return new T.ConeGeometry(r,h,seg||7); }
function cylGeo(r1,r2,h,seg){ return new T.CylinderGeometry(r1,r2,h,seg||6); }

/* ----------------------------------------------------------- renderer/scene */
var canvas=document.getElementById('c');
var renderer=new T.WebGLRenderer({canvas:canvas,antialias:false,alpha:true});
renderer.setClearColor(0x090c12,1);
renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,2));
renderer.outputEncoding=T.sRGBEncoding;
renderer.toneMapping=T.ACESFilmicToneMapping;
renderer.toneMappingExposure=1.35;

var scene=new T.Scene();
scene.fog=new T.FogExp2(0x121a1d,0.013);
var camera=new T.PerspectiveCamera(62, window.innerWidth/window.innerHeight, 0.1, 2000);
camera.position.set(0,40,60);

scene.add(new T.AmbientLight(0x3e4a52,0.6));
var hemi=new T.HemisphereLight(0x5c6e78,0x0a0f0d,0.55); scene.add(hemi);
var moonLight=new T.DirectionalLight(0x9aa6b0,0.8); moonLight.position.set(80,50,40); scene.add(moonLight);
var rim=new T.DirectionalLight(0x4fd6c2,0.2); rim.position.set(-60,10,-40); scene.add(rim);

var world=new T.Group(); scene.add(world);

/* ----------------------------------------------------------- POST PS1 (sin scanlines) */
var rt=new T.WebGLRenderTarget(2,2,{minFilter:T.NearestFilter,magFilter:T.NearestFilter,depthBuffer:true});
var postScene=new T.Scene(), postCam=new T.OrthographicCamera(-1,1,1,-1,0,1);
var POST_FRAG=[
'precision highp float;',
'uniform sampler2D tDiffuse; uniform vec2 uRes; uniform float uTime; varying vec2 vUv;',
'float hash(vec2 p){ p=fract(p*vec2(123.34,456.21)); p+=dot(p,p+45.32); return fract(p.x*p.y); }',
'void main(){',
'  vec2 px=1.4/uRes;',
'  vec3 c=texture2D(tDiffuse,vUv).rgb;',
'  float l0=dot(c,vec3(0.299,0.587,0.114));',
'  float lx=dot(texture2D(tDiffuse,vUv+vec2(px.x,0.0)).rgb,vec3(0.299,0.587,0.114));',
'  float lX=dot(texture2D(tDiffuse,vUv-vec2(px.x,0.0)).rgb,vec3(0.299,0.587,0.114));',
'  float ly=dot(texture2D(tDiffuse,vUv+vec2(0.0,px.y)).rgb,vec3(0.299,0.587,0.114));',
'  float lY=dot(texture2D(tDiffuse,vUv-vec2(0.0,px.y)).rgb,vec3(0.299,0.587,0.114));',
'  float edge=abs(l0-lx)+abs(l0-lX)+abs(l0-ly)+abs(l0-lY);',
'  vec3 col=c;',
'  float g=dot(col,vec3(0.299,0.587,0.114)); col=mix(col,vec3(g),0.52);',
'  col*=vec3(0.9,0.97,0.95);',
'  col=pow(clamp(col,0.0,1.0),vec3(1.16));',
'  float ink=smoothstep(0.1,0.22,edge);',
'  col=mix(col,vec3(0.0),ink);',
'  float vig=smoothstep(1.05,0.32,length(vUv-0.5));',
'  col*=mix(0.52,1.0,vig);',
'  gl_FragColor=vec4(col,1.0);',
'}'].join('\n');
var postMat=new T.ShaderMaterial({
  uniforms:{ tDiffuse:{value:rt.texture}, uRes:{value:new T.Vector2(1,1)}, uTime:{value:0} },
  vertexShader:'varying vec2 vUv; void main(){ vUv=uv; gl_Position=vec4(position.xy,0.0,1.0); }',
  fragmentShader:POST_FRAG, depthTest:false, depthWrite:false
});
postScene.add(new T.Mesh(new T.PlaneGeometry(2,2), postMat));
var PIXEL=1.0;

/* ----------------------------------------------------------- planet */
var planetMesh;
(function buildPlanet(){
  var geo=new T.IcosahedronGeometry(R,5), pos=geo.attributes.position, v=new T.Vector3(), i;
  for(i=0;i<pos.count;i++){ v.fromBufferAttribute(pos,i); var d=v.clone().normalize();
    v.copy(d).multiplyScalar(R+noise3(d.clone().multiplyScalar(1.6))*2.1); pos.setXYZ(i,v.x,v.y,v.z); }
  geo.computeVertexNormals(); geo=geo.toNonIndexed();
  var p=geo.attributes.position, col=[];
  var lo=new T.Color(0x1e261f), mid=new T.Color(0x2c352c), hi=new T.Color(0x3c4339), rock=new T.Color(0x3c3b3d), moss=new T.Color(0x262e23);
  var c=new T.Color(),a=new T.Vector3(),b=new T.Vector3(),cc=new T.Vector3();
  for(i=0;i<p.count;i+=3){
    a.fromBufferAttribute(p,i); b.fromBufferAttribute(p,i+1); cc.fromBufferAttribute(p,i+2);
    var r=(a.length()+b.length()+cc.length())/3, t=clamp((r-(R-1.6))/4.2,0,1);
    c.copy(lo).lerp(mid,clamp(t*1.4,0,1)).lerp(hi,clamp((t-0.45)*1.8,0,1));
    if(r>R+1.5) c.lerp(rock,clamp((r-(R+1.5))*0.8,0,0.7));
    if(Math.random()<0.12) c.lerp(moss,0.5);
    c.offsetHSL(rand(-0.02,0.02),rand(-0.03,0.02),rand(-0.05,0.05));
    for(var k=0;k<3;k++) col.push(c.r,c.g,c.b);
  }
  geo.setAttribute('color',new T.Float32BufferAttribute(col,3));
  planetMesh=new T.Mesh(geo, ps1v(new T.MeshStandardMaterial({vertexColors:true,flatShading:true,roughness:0.97})));
  world.add(planetMesh);
  var ocean=new T.Mesh(new T.SphereGeometry(R-0.7,56,56), emat(0x07100f,0x050d0c,0.3,0.4));
  world.add(ocean);
})();

function orientToDir(obj,dir){
  var up=dir.clone().normalize(), fwd=new T.Vector3(0,0,1);
  if(Math.abs(up.dot(fwd))>0.9) fwd.set(1,0,0);
  var right=new T.Vector3().crossVectors(up,fwd).normalize();
  fwd.crossVectors(right,up).normalize();
  obj.quaternion.setFromRotationMatrix(new T.Matrix4().makeBasis(right,up,fwd));
}

/* ----------------------------------------------------------- GRASS */
var GRASS_SHADER=null;
(function grass(){
  var base=new T.Color(0x0c2a20), tipc=new T.Color(0x2f6e54);
  var pos=[],col=[]; var blades=3,bi;
  for(bi=0;bi<blades;bi++){
    var ang=bi*(TAU/blades)+rand(-0.3,0.3), dx=Math.cos(ang)*0.05, dz=Math.sin(ang)*0.05, lean=rand(0.05,0.16), h=rand(0.5,0.9);
    pos.push(-0.06+dx,0,dz, 0.06+dx,0,dz, dx+lean, h, dz+lean);
    col.push(base.r,base.g,base.b, base.r,base.g,base.b, tipc.r,tipc.g,tipc.b);
  }
  var g=new T.BufferGeometry();
  g.setAttribute('position',new T.Float32BufferAttribute(pos,3));
  g.setAttribute('color',new T.Float32BufferAttribute(col,3));
  g.computeVertexNormals();
  var mat=new T.MeshStandardMaterial({vertexColors:true,roughness:1,side:T.DoubleSide,emissive:0x0a3a2c,emissiveIntensity:0.16});
  mat.onBeforeCompile=function(sh){
    sh.uniforms.uTime={value:0};
    sh.vertexShader='uniform float uTime;\n'+sh.vertexShader.replace('#include <begin_vertex>',
      '#include <begin_vertex>\n#ifdef USE_INSTANCING\n vec3 ip=instanceMatrix[3].xyz; float ph=ip.x*0.5+ip.z*0.5; float hh=max(position.y,0.0);\n transformed.x+=sin(uTime*1.7+ph)*0.16*hh; transformed.z+=cos(uTime*1.35+ph)*0.12*hh;\n#endif');
    GRASS_SHADER=sh;
  };
  mat.customProgramCacheKey=function(){return 'grasswind';};
  var N=5200, mesh=new T.InstancedMesh(g,mat,N), i, placed=0;
  for(i=0;i<N;i++){
    var d=randDir(); var rr=terrainR(d);
    if(rr<R-0.3) continue;
    var sc=rand(0.8,1.7); instAt(mesh,placed,d,_s.set(sc,rand(0.9,1.6),sc),rand(0,TAU));
    placed++;
  }
  mesh.count=placed; mesh.instanceMatrix.needsUpdate=true; mesh.frustumCulled=false;
  world.add(mesh);
})();

/* ----------------------------------------------------------- FORESTS + PROPS */
function mtx(x,y,z,sx,sy,sz,ry){ var m=new T.Matrix4(); var q=new T.Quaternion().setFromAxisAngle(UP_Y,ry||0);
  m.compose(new T.Vector3(x,y,z),q,new T.Vector3(sx||1,sy||1,sz||1)); return m; }
function rotZ(m,a){ return m.multiply(new T.Matrix4().makeRotationZ(a)); }

var firGeo=mergeParts([
  {geo:cylGeo(0.12,0.18,0.7,6),color:new T.Color(0x3a2a22),matrix:mtx(0,0.35,0,1,1,1)},
  {geo:coneGeo(0.85,0.9,7),color:new T.Color(0x123a2c),matrix:mtx(0,0.7,0,1,1,1)},
  {geo:coneGeo(0.63,0.78,7),color:new T.Color(0x14402f),matrix:mtx(0,1.25,0,1,1,1)},
  {geo:coneGeo(0.41,0.66,7),color:new T.Color(0x174833),matrix:mtx(0,1.8,0,1,1,1)}
]);
var deadGeo=mergeParts([
  {geo:cylGeo(0.1,0.22,1.6,6),color:new T.Color(0x241c1a),matrix:mtx(0,0.8,0,1,1,1)},
  {geo:cylGeo(0.05,0.1,0.9,5),color:new T.Color(0x201917),matrix:rotZ(mtx(0.25,1.5,0,1,1,1),0.7)},
  {geo:cylGeo(0.05,0.09,0.8,5),color:new T.Color(0x201917),matrix:rotZ(mtx(-0.22,1.4,0.1,1,1,1),-0.8)},
  {geo:cylGeo(0.04,0.07,0.6,5),color:new T.Color(0x201917),matrix:rotZ(mtx(0.1,1.95,-0.1,1,1,1),0.4)}
]);

function instancedField(geo,mat,count,opt){
  opt=opt||{}; var mesh=new T.InstancedMesh(geo,mat,count), i, placed=0;
  for(i=0;i<count;i++){
    var d= opt.dirs?opt.dirs[i]:randDir(); var rr=terrainR(d);
    if(rr<R-0.2 && !opt.allowWater) continue;
    if(opt.avoid && opt.avoid(d)) continue;
    var sc=rand(opt.min||0.8,opt.max||1.3);
    instAt(mesh,placed,d,_s.set(sc,sc*rand(0.9,1.2),sc),rand(0,TAU),opt.lift||0); placed++;
  }
  mesh.count=placed; mesh.instanceMatrix.needsUpdate=true; mesh.frustumCulled=false; world.add(mesh); return mesh;
}
var treeMat=ps1v(new T.MeshStandardMaterial({vertexColors:true,flatShading:true,roughness:1,emissive:0x06140f,emissiveIntensity:0.22}));
var deadMat=ps1v(new T.MeshStandardMaterial({vertexColors:true,flatShading:true,roughness:1}));
var housesDirsHolder=[];
function avoidHouses(d){ for(var i=0;i<housesDirsHolder.length;i++){ if(d.angleTo(housesDirsHolder[i])<0.18) return true; } return false; }

var rockGeo=new T.IcosahedronGeometry(0.6,0); (function(){ var p=rockGeo.attributes.position,v=new T.Vector3();
  for(var i=0;i<p.count;i++){ v.fromBufferAttribute(p,i); v.multiplyScalar(rand(0.7,1.3)); p.setXYZ(i,v.x,v.y,v.z);} rockGeo.computeVertexNormals(); })();
var rockMat=emat(0x2b3340,0,0,1);
var graveGeo=mergeParts([
  {geo:new T.BoxGeometry(0.5,0.7,0.12),color:new T.Color(0x3a4048),matrix:mtx(0,0.45,0,1,1,1)},
  {geo:new T.BoxGeometry(0.7,0.12,0.4),color:new T.Color(0x2c3138),matrix:mtx(0,0.06,0,1,1,1)}
]);
var graveMat=ps1v(new T.MeshStandardMaterial({vertexColors:true,flatShading:true,roughness:1}));
var mushGeo=mergeParts([
  {geo:cylGeo(0.05,0.08,0.3,6),color:new T.Color(0xcfd6c8),matrix:mtx(0,0.15,0,1,1,1)},
  {geo:new T.SphereGeometry(0.18,8,6,0,TAU,0,Math.PI/2),color:new T.Color(0x59f0d8),matrix:mtx(0,0.3,0,1,1,1)}
]);
var mushMat=ps1v(new T.MeshStandardMaterial({vertexColors:true,flatShading:true,roughness:0.6,emissive:0x1f8f80,emissiveIntensity:0.9}));
var crysGeo=new T.IcosahedronGeometry(0.4,0);
var crysMat=emat(0x123a44,0x49d0ff,1.4,0.3);

/* ----------------------------------------------------------- HERO houses */
function houseShadow(){ return new T.Mesh(new T.CircleGeometry(2.4,22), new T.MeshBasicMaterial({map:TEX_SHADOW,transparent:true,opacity:0.55,depthWrite:false})); }

function buildCafe(){
  var g=new T.Group();
  g.add(meshAt(new T.BoxGeometry(2.0,1.4,1.7),emat(0x3a2c22,0,0,0.9),0,0.7,0));
  var roof=meshAt(coneGeo(1.7,1.0,4),emat(0x5a3326),0,1.9,0); roof.rotation.y=Math.PI/4; g.add(roof);
  var winMat=emat(0xffcf8f,0xffb86b,1.8,0.4);
  g.add(meshAt(new T.PlaneGeometry(0.5,0.55),winMat,-0.5,0.7,0.861)); g.add(meshAt(new T.PlaneGeometry(0.5,0.55),winMat,0.5,0.7,0.861));
  g.add(meshAt(new T.PlaneGeometry(0.5,0.85),emat(0x2a1a12,0xffb86b,0.5,0.5),0,0.45,0.861));
  var aw=new T.Group(); aw.position.set(0,1.45,0.95);
  for(var i=0;i<5;i++){ var st=meshAt(new T.BoxGeometry(0.34,0.06,0.5),emat(i%2?0xc9483b:0xe9e2d6),-0.68+i*0.34,0,0); st.rotation.x=-0.5; aw.add(st); } g.add(aw);
  var sign=makeSprite(TEX_WARM,0xffd98f,3.2); sign.position.set(0,3.0,0); g.add(sign);
  var steam=makeSprite(TEX_SOFT,0xffffff,1.0); steam.position.set(0,2.9,0); g.add(steam);
  g.add(makeSprite(TEX_WARM,0xffc98a,2.6).translateY(0.8).translateZ(1.1));
  return {group:g,anim:function(t){ steam.position.y=2.82+((t*0.4)%0.6); steam.material.opacity=0.7-((t*0.4)%0.6); steam.scale.setScalar(0.7+((t*0.4)%0.6)); sign.scale.setScalar(3.0+Math.sin(t*2)*0.25); }};
}
function buildCyber(){
  var g=new T.Group();
  g.add(meshAt(new T.BoxGeometry(2.1,1.5,1.7),emat(0x10202a,0,0,0.7),0,0.75,0));
  g.add(meshAt(new T.BoxGeometry(2.25,0.18,1.85),emat(0x0a161d),0,1.55,0));
  var mon=emat(0x0a2230,0x46b6ff,2.0,0.3),x,y;
  for(x=-1;x<=1;x++)for(y=0;y<2;y++) g.add(meshAt(new T.PlaneGeometry(0.42,0.34),mon,x*0.6,0.55+y*0.55,0.861));
  var sign=meshAt(new T.BoxGeometry(1.7,0.26,0.08),emat(0x05121a,0x39e0ff,2.2,0.3),0,1.78,0.7); g.add(sign);
  var blink=makeSprite(TEX_TEAL,0x7fe8ff,1.0); blink.position.set(0.8,2.7,0); g.add(blink);
  g.add(makeSprite(TEX_TEAL,0x6fd6ff,2.8).translateY(0.9).translateZ(1.1));
  return {group:g,anim:function(t){ blink.material.opacity=0.4+0.6*(0.5+0.5*Math.sin(t*6)); sign.material.emissiveIntensity=1.8+Math.sin(t*3)*0.6; }};
}
function buildHell(){
  var g=new T.Group();
  g.add(meshAt(new T.BoxGeometry(1.8,1.4,1.6),emat(0x2a2630),0,0.7,0));
  var roof=meshAt(coneGeo(1.55,1.1,4),emat(0x39323f),0,1.85,0); roof.rotation.y=Math.PI/4; g.add(roof);
  g.add(meshAt(new T.PlaneGeometry(0.45,0.5),emat(0xffcf8f,0xffb86b,1.6,0.4),0.5,0.7,0.811));
  g.add(meshAt(new T.PlaneGeometry(0.5,0.9),emat(0x1a1018,0xff5a3a,0.8,0.5),-0.32,0.48,0.811));
  g.add(meshAt(new T.BoxGeometry(0.3,0.6,0.3),emat(0x241f29),0.55,1.8,0));
  var embers=[],i; for(i=0;i<6;i++){ var e=makeSprite(TEX_RED,0xff6a3a,rand(0.25,0.45)); e.position.set(0.55,2.1,0); e.userData={ph:rand(0,TAU)}; g.add(e); embers.push(e); }
  var pl=new T.PointLight(0xff5a3a,0.7,9); pl.position.set(-0.32,1.0,1.2); g.add(pl);
  return {group:g,anim:function(t){ embers.forEach(function(e){ var u=(t*0.5+e.userData.ph)%1; e.position.y=2.1+u*1.2; e.position.x=0.55+Math.sin((t+e.userData.ph)*3)*0.12; e.material.opacity=0.8*(1-u);}); pl.intensity=0.5+Math.sin(t*7)*0.25+Math.random()*0.1; }};
}
function buildClub(){
  var g=new T.Group();
  g.add(meshAt(new T.BoxGeometry(2.3,1.8,2.0),emat(0x15121c),0,0.9,0));
  g.add(meshAt(new T.BoxGeometry(2.45,0.2,2.15),emat(0x0f0c15),0,1.85,0));
  var s1=meshAt(new T.BoxGeometry(2.15,0.12,0.06),emat(0x1a0f22,0xff5ad0,2.4,0.3),0,1.3,1.01);
  var s2=meshAt(new T.BoxGeometry(2.15,0.12,0.06),emat(0x140f22,0x8a5cff,2.4,0.3),0,0.55,1.01); g.add(s1); g.add(s2);
  g.add(meshAt(new T.PlaneGeometry(0.75,1.15),emat(0x2a1030,0xff5ad0,1.2,0.4),0,0.72,1.012));
  var beam=meshAt(new T.ConeGeometry(1.0,3.6,16,1,true),new T.MeshBasicMaterial({color:0xff5ad0,transparent:true,opacity:0.16,blending:T.AdditiveBlending,depthWrite:false,side:T.DoubleSide}),0,3.6,0);
  g.add(beam);
  var glow=makeSprite(TEX_MAG,0xff7ae0,3.4); glow.position.set(0,1.0,1.25); g.add(glow);
  var pl=new T.PointLight(0xff5ad0,0.9,14); pl.position.set(0,2,1); g.add(pl);
  return {group:g,anim:function(t){ beam.rotation.y=t*1.6; var p=0.5+0.5*Math.sin(t*5); s1.material.emissiveIntensity=1.6+p*1.8; s2.material.emissiveIntensity=1.6+(1-p)*1.8; pl.intensity=0.6+p*1.0; pl.color.setHSL((t*0.1)%1,0.8,0.6); glow.scale.setScalar(3.2+p*0.8); }};
}
function buildArcade(){
  var g=new T.Group();
  g.add(meshAt(new T.BoxGeometry(2.2,1.5,1.7),emat(0x141a2a),0,0.75,0));
  var marq=new T.Group(); marq.position.set(0,1.7,0.7); var cols=[0x39e0ff,0xff5ad0,0xffe23a,0x5cff9e],i;
  for(i=0;i<6;i++){ marq.add(meshAt(new T.BoxGeometry(0.34,0.3,0.1),emat(0x0a0f1a,cols[i%4],2.2,0.3),-0.85+i*0.34,0,0)); } g.add(marq);
  var cab=[0x39e0ff,0xff5ad0,0xffe23a]; for(i=0;i<3;i++) g.add(meshAt(new T.PlaneGeometry(0.5,0.7),emat(0x0a0f1a,cab[i],1.9,0.3),-0.62+i*0.62,0.7,0.861));
  var top=meshAt(coneGeo(0.34,0.5,4),emat(0x0a0f1a,0xffe23a,1.6),0,2.15,0); top.rotation.y=Math.PI/4; g.add(top);
  g.add(makeSprite(TEX_TEAL,0x8af0ff,3.2).translateY(1.0).translateZ(1.2));
  return {group:g,anim:function(t){ marq.children.forEach(function(s,i){ s.material.emissiveIntensity=1.4+1.4*(0.5+0.5*Math.sin(t*6-i*0.7)); }); top.material.emissiveIntensity=1.2+Math.sin(t*4)*0.6; }};
}
function buildHouse2(){ // exterior de My Hell
  var g=new T.Group();
  g.add(meshAt(new T.BoxGeometry(1.9,1.5,1.7),emat(0x262232),0,0.75,0));
  var roof=meshAt(coneGeo(1.6,1.15,4),emat(0x342d3c),0,1.95,0); roof.rotation.y=Math.PI/4; g.add(roof);
  g.add(meshAt(new T.PlaneGeometry(0.5,0.55),emat(0xffcf8f,0xffb86b,1.7,0.4),0.45,0.8,0.861));   // ventana cálida
  g.add(meshAt(new T.PlaneGeometry(0.55,1.0),emat(0x140e16,0x8f4fff,0.7,0.5),-0.35,0.55,0.861));  // puerta glow
  g.add(meshAt(new T.BoxGeometry(0.3,0.6,0.3),emat(0x201b28),0.5,1.95,0));
  var glow=makeSprite(TEX_PURP,0xb59cff,2.2); glow.position.set(-0.35,0.7,1.1); g.add(glow);
  var pl=new T.PointLight(0xffcf8f,0.6,8); pl.position.set(0.45,0.9,1.1); g.add(pl);
  return {group:g,anim:function(t){ glow.scale.setScalar(2.0+Math.sin(t*2.2)*0.25); }};
}
function buildShop(){
  var g=new T.Group();
  g.add(meshAt(new T.BoxGeometry(2.2,1.5,1.7),emat(0x2a2330),0,0.75,0));
  g.add(meshAt(new T.BoxGeometry(2.35,0.18,1.85),emat(0x1c1622),0,1.6,0));
  g.add(meshAt(new T.PlaneGeometry(1.5,1.0),emat(0xead8b0,0xe6c98a,1.1,0.4),0,0.75,0.861));
  var man=new T.Group(); man.position.set(0,0.32,0.5);
  man.add(meshAt(cylGeo(0.18,0.24,0.6,8),emat(0x3a4655),0,0.4,0));
  man.add(meshAt(new T.SphereGeometry(0.14,10,10),emat(0x4a5666),0,0.82,0));
  man.add(meshAt(new T.BoxGeometry(0.28,0.06,0.05),emat(0x59f0d8,0x59f0d8,1.2,0.3),0,0.86,0.1)); g.add(man);
  var aw=new T.Group(); aw.position.set(0,1.4,0.95);
  for(var i=0;i<5;i++){ var st=meshAt(new T.BoxGeometry(0.36,0.06,0.5),emat(i%2?0x59c0d8:0xece6ee),-0.72+i*0.36,0,0); st.rotation.x=-0.5; aw.add(st); } g.add(aw);
  var sign=makeSprite(TEX_TEAL,0x9af0e6,3.0); sign.position.set(0,3.0,0); g.add(sign);
  var hang=new T.Group(); hang.position.set(0,2.5,0);
  hang.add(meshAt(new T.TorusGeometry(0.12,0.02,6,16),emat(0xcfd6da,0x8fd0ff,0.6),0,0.12,0));
  hang.add(meshAt(new T.BoxGeometry(0.5,0.03,0.03),emat(0xcfd6da),0,0,0)); g.add(hang);
  return {group:g,anim:function(t){ hang.rotation.y=t*1.2; sign.scale.setScalar(2.8+Math.sin(t*2)*0.2); }};
}

var HOUSES_DEF=[
  {key:'feed',label:'Café',sub:'Feed',emoji:'☕',url:'/yata?embed=1&sec=feed',build:buildCafe},
  {key:'chat',label:'Cybercafé',sub:'Chat Global',emoji:'🖥️',url:'/yata?embed=1&sec=chat',build:buildCyber},
  {key:'perfil',label:'Mi casa',sub:'My Hell',emoji:'🏠',room:true,build:buildHouse2},
  {key:'tristonicos',label:'El Club',sub:'Tristónicos',emoji:'🎷',url:'/yata?embed=1&sec=tristonicos',build:buildClub},
  {key:'juegos',label:'Arcade',sub:'Juegos',emoji:'🕹️',url:'/tristos',build:buildArcade},
  {key:'tienda',label:'Sastrería',sub:'Vestuario',emoji:'🧥',shop:true,build:buildShop}
];
var houses=[], pickables=[], labelsBox=document.getElementById('labels');
(function placeHouses(){
  var dirs=fibSphere(13), pk=[1,3,5,7,9,11];
  HOUSES_DEF.forEach(function(def,idx){
    var dir=dirs[pk[idx]].clone(); housesDirsHolder.push(dir.clone().normalize());
    var made=def.build(), sp=surfacePoint(dir);
    made.group.position.copy(sp); orientToDir(made.group,dir); made.group.rotateY(rand(-0.5,0.5)); world.add(made.group);
    var sh=houseShadow(); sh.position.copy(sp).addScaledVector(dir,0.06); orientToDir(sh,dir); sh.rotateX(-Math.PI/2); world.add(sh);
    var beacon=new T.Group();
    var beam=new T.Mesh(new T.CylinderGeometry(0.18,0.6,9,12,1,true),new T.MeshBasicMaterial({color:0x74e0d0,transparent:true,opacity:0.14,blending:T.AdditiveBlending,depthWrite:false,side:T.DoubleSide}));
    beam.position.y=5.0; beacon.add(beam);
    var ring=new T.Mesh(new T.TorusGeometry(1.1,0.05,8,28),new T.MeshBasicMaterial({color:0x74e0d0,transparent:true,opacity:0.9,blending:T.AdditiveBlending,depthWrite:false}));
    ring.rotation.x=Math.PI/2; ring.position.y=3.0; beacon.add(ring); beacon.visible=false; made.group.add(beacon);
    var hit=new T.Mesh(new T.SphereGeometry(2.8,8,8),new T.MeshBasicMaterial({visible:false})); hit.position.copy(sp).addScaledVector(dir,1.4); world.add(hit);
    var el=document.createElement('div'); el.className='label'; el.innerHTML='<span class="ico">'+def.emoji+'</span><span>'+def.label+'<small>'+def.sub+'</small></span>'; labelsBox.appendChild(el);
    var h={def:def,dir:dir.clone().normalize(),world:sp.clone().addScaledVector(dir,1.8),group:made.group,anim:made.anim,beacon:beacon,ring:ring,el:el};
    hit.userData.house=h; pickables.push(hit); houses.push(h);
  });
})();

instancedField(firGeo,treeMat,60,{min:0.8,max:1.5,avoid:avoidHouses});
instancedField(deadGeo,deadMat,170,{min:0.8,max:1.6,avoid:avoidHouses});
instancedField(rockGeo,rockMat,90,{min:0.5,max:1.8});
instancedField(mushGeo,mushMat,70,{min:0.7,max:1.5,lift:0.02});
instancedField(crysGeo,crysMat,22,{min:0.6,max:1.5,lift:0.1});
(function graveyard(){
  var center=houses[2].dir.clone(), tangent=new T.Vector3().crossVectors(center,UP_Y).normalize(), bit=new T.Vector3().crossVectors(center,tangent).normalize();
  var mesh=new T.InstancedMesh(graveGeo,graveMat,26),i,placed=0;
  for(i=0;i<26;i++){ var d=center.clone().addScaledVector(tangent,rand(-0.18,0.18)).addScaledVector(bit,rand(-0.18,0.18)).normalize();
    if(d.angleTo(center)<0.05) continue; instAt(mesh,placed,d,_s.set(rand(0.8,1.2),rand(0.9,1.3),1),rand(0,TAU)); placed++; }
  mesh.count=placed; mesh.instanceMatrix.needsUpdate=true; mesh.frustumCulled=false; world.add(mesh);
})();

var lamps=[];
(function lampposts(){
  var n=7,i; for(i=0;i<n;i++){ var d=randDir(); if(terrainR(d)<R-0.1||avoidHouses(d)) continue;
    var g=new T.Group(); var sp=surfacePoint(d); g.position.copy(sp); orientToDir(g,d);
    g.add(meshAt(cylGeo(0.06,0.08,2.2,6),emat(0x20262e),0,1.1,0));
    g.add(meshAt(new T.BoxGeometry(0.6,0.08,0.08),emat(0x20262e),0.2,2.15,0));
    var lampMat=emat(0x2a2410,0xffcaa0,2.0,0.4); var lamp=meshAt(new T.IcosahedronGeometry(0.16,0),lampMat,0.4,2.05,0); g.add(lamp);
    var glow=makeSprite(TEX_WARM,0xffc98a,1.8); glow.position.set(0.4,2.05,0); g.add(glow);
    var hasLight=i<3; var pl=null; if(hasLight){ pl=new T.PointLight(0xffcaa0,0.8,8); pl.position.set(0.4,2.0,0); g.add(pl); }
    world.add(g); lamps.push({lampMat:lampMat,glow:glow,pl:pl,ph:rand(0,TAU)});
  }
})();

/* ----------------------------------------------------------- sky */
function buildStars(count,radius,size,color,op){ var g=new T.BufferGeometry(),arr=new Float32Array(count*3),i;
  for(i=0;i<count;i++){ var v=randDir().multiplyScalar(radius*rand(0.8,1)); arr[i*3]=v.x;arr[i*3+1]=v.y;arr[i*3+2]=v.z; }
  g.setAttribute('position',new T.Float32BufferAttribute(arr,3));
  return new T.Points(g,new T.PointsMaterial({color:color,size:size,sizeAttenuation:true,transparent:true,opacity:op,depthWrite:false,fog:false})); }
var starField=new T.Group();
starField.add(buildStars(1500,1000,2.6,0xb9c8d0,0.7),buildStars(550,750,3.6,0xdfe6ea,0.85),buildStars(300,900,3.0,0x7fb0a8,0.5));
scene.add(starField);

var moon=new T.Group();
var moonBall=new T.Mesh(new T.SphereGeometry(34,32,32),emat(0x6e3c30,0x3a1810,0.85,1)); moonBall.material.fog=false; moon.add(moonBall);
var mh1=makeSprite(TEX_RED,0x8a4438,220); mh1.material.fog=false; var mh2=makeSprite(TEX_RED,0x5a221a,150); mh2.material.fog=false;
moon.add(mh1); moon.add(mh2);
moon.position.set(300,150,-340); scene.add(moon);

var mists=[],mi;
for(mi=0;mi<14;mi++){ var d=randDir(); var sp=surfacePoint(d); var s=makeSprite(TEX_MIST,0xb6c0c4,rand(12,24),T.NormalBlending);
  s.material.opacity=rand(0.12,0.26); s.position.copy(sp).addScaledVector(d,rand(0.4,1.8)); s.userData={ph:rand(0,TAU)}; world.add(s); mists.push(s); }

var NF=150,fireGeo=new T.BufferGeometry(),farr=new Float32Array(NF*3),fph=[];
for(var fi=0;fi<NF;fi++){ var fd=randDir().multiplyScalar(R+rand(1.5,7)); farr[fi*3]=fd.x;farr[fi*3+1]=fd.y;farr[fi*3+2]=fd.z; fph.push(rand(0,TAU)); }
fireGeo.setAttribute('position',new T.Float32BufferAttribute(farr,3));
var fireflies=new T.Points(fireGeo,new T.PointsMaterial({map:TEX_TEAL,color:0x9ff5e2,size:1.6,transparent:true,blending:T.AdditiveBlending,depthWrite:false,opacity:0.85}));
/*sin luciernagas*/

var wisps=[],wi;
for(wi=0;wi<0;wi++){ var col=pick([0x7ff0dd,0x9affb0,0xb59cff,0x8fd0ff]);
  var s=makeSprite(col===0xb59cff?TEX_PURP:(col===0x8fd0ff?TEX_SOFT:TEX_GRN),col,rand(0.8,1.5));
  var d=randDir(); var p=d.clone().multiplyScalar(terrainR(d)+rand(1.5,4));
  s.position.copy(p); world.add(s); wisps.push({sp:s,pos:p.clone(),target:p.clone(),ph:rand(0,TAU)}); }

var bats=[],bti;
function makeBat(){ var s=makeSprite(TEX_BAT,0x0e0e16,rand(1.2,2.0),T.NormalBlending); s.material.opacity=0.95; return s; }
for(bti=0;bti<8;bti++){ var bs=makeBat(); var orbR=R+rand(6,16), axis=randDir(); var bph=rand(0,TAU);
  scene.add(bs); bats.push({sp:bs,orbR:orbR,axis:axis,ref:new T.Vector3().crossVectors(axis,UP_Y).normalize(),ph:bph,spd:rand(0.25,0.6),flap:rand(8,14)}); }

var shooters=[],shooterTimer=rand(2,5);
function spawnShooter(){ var from=randDir().multiplyScalar(900); from.y=Math.abs(from.y);
  var to=from.clone().add(randDir().multiplyScalar(rand(220,400))); var sp=makeSprite(TEX_SOFT,0xffffff,12); sp.material.fog=false; sp.position.copy(from); scene.add(sp);
  shooters.push({sp:sp,from:from,to:to,t:0,life:rand(0.7,1.2)}); }

/* ----------------------------------------------------------- courier (vos) + vestuario */
var courier=new T.Group(), visor, lanternPivot, lanternGlow, courierLight;
(function buildCourier(){
  var coat=emat(0x1d2a3a,0,0,0.78), coat2=emat(0x16222f,0,0,0.8), teal=emat(0x59f0d8,0x59f0d8,1.5,0.3), dark=emat(0x141b26,0,0,0.7);
  courier.add(meshAt(cylGeo(0.16,0.2,0.7,6),dark,-0.16,0.35,0)); courier.add(meshAt(cylGeo(0.16,0.2,0.7,6),dark,0.16,0.35,0));
  courier.add(meshAt(cylGeo(0.42,0.5,1.0,8),coat,0,1.0,0));
  courier.add(meshAt(new T.BoxGeometry(0.06,0.95,0.04),teal,0,1.0,0.46));
  courier.add(meshAt(new T.BoxGeometry(0.5,0.05,0.04),teal,0,1.35,0.45));
  courier.add(meshAt(new T.SphereGeometry(0.22,8,8),coat2,-0.42,1.4,0)); courier.add(meshAt(new T.SphereGeometry(0.22,8,8),coat2,0.42,1.4,0));
  courier.add(meshAt(new T.SphereGeometry(0.34,16,16),emat(0x2b3d4f,0,0,0.7),0,1.78,0));
  var hood=meshAt(coneGeo(0.58,0.82,10),coat,0,2.04,-0.06); hood.rotation.x=-0.16; courier.add(hood);
  courier.add(meshAt(cylGeo(0.5,0.64,1.55,9),coat,0,0.78,0));
  visor=meshAt(new T.BoxGeometry(0.42,0.12,0.16),teal,0,1.8,0.28); courier.add(visor);
  var faceMat=new T.MeshBasicMaterial({color:0xffffff,transparent:true,depthWrite:false});
  var face=meshAt(new T.PlaneGeometry(0.5,0.5),faceMat,0,1.8,0.27); face.visible=false; courier.add(face);
  courier.add(meshAt(new T.BoxGeometry(0.5,0.5,0.42),emat(0x123a34,0x1d8a7d,0.6,0.6),0.5,0.95,-0.02));
  courier.add(meshAt(new T.BoxGeometry(0.62,0.08,0.04),teal,0.2,1.25,0.3));
  lanternPivot=new T.Group(); lanternPivot.position.set(-0.5,1.35,0.15); courier.add(lanternPivot);
  lanternPivot.add(meshAt(cylGeo(0.07,0.07,0.7,6),coat2,0,-0.3,0));
  var lantMat=emat(0xffe6b0,0xffce80,2.4,0.3); lanternPivot.add(meshAt(new T.IcosahedronGeometry(0.2,0),lantMat,0,-0.72,0));
  lanternGlow=makeSprite(TEX_WARM,0xffd98f,2.6); lanternGlow.position.set(0,-0.72,0); lanternPivot.add(lanternGlow);
  courierLight=new T.PointLight(0xffd28a,1.5,12); courierLight.position.set(0,-0.7,0); lanternPivot.add(courierLight);
  var hats={};
  function addHat(name,obj){ obj.visible=false; courier.add(obj); hats[name]=obj; }
  var gorro=new T.Group(); gorro.add(meshAt(cylGeo(0.32,0.35,0.3,10),emat(0x2a2f38),0,2.02,0)); gorro.add(meshAt(new T.SphereGeometry(0.1,8,8),emat(0xff5ad0,0xff5ad0,0.7),0,2.22,0)); addHat('gorro',gorro);
  var gorra=new T.Group(); gorra.add(meshAt(new T.SphereGeometry(0.34,12,8,0,TAU,0,Math.PI/2),emat(0x1d2a3a),0,1.98,0)); gorra.add(meshAt(new T.BoxGeometry(0.5,0.06,0.34),emat(0x1d2a3a),0,1.97,0.34)); addHat('gorra',gorra);
  var galera=new T.Group(); galera.add(meshAt(cylGeo(0.3,0.3,0.5,12),emat(0x121418),0,2.22,0)); galera.add(meshAt(cylGeo(0.44,0.44,0.05,12),emat(0x121418),0,1.99,0)); galera.add(meshAt(cylGeo(0.305,0.305,0.06,12),emat(0x59f0d8,0x59f0d8,0.5),0,2.02,0)); addHat('galera',galera);
  var aura=meshAt(new T.TorusGeometry(0.27,0.04,8,24),emat(0xffe07a,0xffe07a,2.2),0,2.4,0); aura.rotation.x=Math.PI/2; addHat('aura',aura);
  var cuernos=new T.Group(); var cm=emat(0x3a1414,0xff3a2a,0.6); var c1=meshAt(coneGeo(0.08,0.32,6),cm,-0.18,2.12,0); c1.rotation.z=0.3; var c2=meshAt(coneGeo(0.08,0.32,6),cm,0.18,2.12,0); c2.rotation.z=-0.3; cuernos.add(c1); cuernos.add(c2); addHat('cuernos',cuernos);
  courier.userData={faceMat:faceMat,face:face,matCoat:coat,matCoat2:coat2,matAccent:teal,matLantern:lantMat,hats:hats};
})();
world.add(courier);
var shadow=new T.Mesh(new T.CircleGeometry(1.0,20),new T.MeshBasicMaterial({map:TEX_SHADOW,transparent:true,opacity:0.5,depthWrite:false})); world.add(shadow);
function setAvatar(url){ if(!url)return; var l=new T.TextureLoader(); l.setCrossOrigin('anonymous');
  l.load(url,function(tex){ tex.encoding=T.sRGBEncoding; courier.userData.faceMat.map=tex; courier.userData.faceMat.needsUpdate=true; courier.userData.face.visible=true; if(visor)visor.visible=false; },undefined,function(){}); }

var DEFAULT_FIT={coat:'#1d2a3a',accent:'#59f0d8',lantern:'#ffce80',hat:'none'};
function loadFit(){ try{ var f=JSON.parse(localStorage.getItem('yata_fit')); return f&&f.coat?f:null; }catch(e){ return null; } }
var saveTimer=null, ROOM=null;
function pushWorld(){ if(saveTimer)clearTimeout(saveTimer); saveTimer=setTimeout(function(){ try{ fetch('/api/world/save',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({data:{fit:FIT,room:ROOM}})}).catch(function(){}); }catch(e){} },600); }
function saveFit(f){ try{ localStorage.setItem('yata_fit',JSON.stringify(f)); }catch(e){} pushWorld(); }
function saveRoom(r){ try{ localStorage.setItem('yata_room',JSON.stringify(r)); }catch(e){} pushWorld(); }
var FIT=loadFit()||Object.assign({},DEFAULT_FIT);
function applyFit(f){ var u=courier.userData;
  if(u.matCoat) u.matCoat.color.set(f.coat);
  if(u.matCoat2){ u.matCoat2.color.set(f.coat); u.matCoat2.color.multiplyScalar(0.82); }
  if(u.matAccent){ u.matAccent.color.set(f.accent); u.matAccent.emissive.set(f.accent); }
  if(u.matLantern){ u.matLantern.color.set(f.lantern); u.matLantern.emissive.set(f.lantern); }
  if(lanternGlow) lanternGlow.material.color.set(f.lantern);
  if(courierLight) courierLight.color.set(f.lantern);
  if(u.hats){ for(var k in u.hats) u.hats[k].visible=false; if(f.hat&&f.hat!=='none'&&u.hats[f.hat]) u.hats[f.hat].visible=true; }
}
applyFit(FIT);

/* ----------------------------------------------------------- MY HELL: dormitorio interior */
var roomDecor={};
var interiorScene=new T.Scene();
var roomCam=new T.PerspectiveCamera(68, window.innerWidth/window.innerHeight, 0.04, 200);
var monitorScreen=null, roomDust=null, roomPickables=[];
var fp={x:0,z:3,y:0,yaw:Math.PI,pitch:0}, fpLook=false, fpLocked=false, fpLastX=0, fpLastY=0, floorMeshes=[], COL=[], downRay=new T.Raycaster();
function buildHouse(){
  interiorScene.add(new T.AmbientLight(0x3a3640,0.5));
  function PL(x,y,z,c,i,d){ var l=new T.PointLight(c,i,d); l.position.set(x,y,z); interiorScene.add(l); return l; }
  roomDecor.ceilLight=PL(0,2.7,1.5,0xffd6a0,0.7,12); PL(-3.5,2.6,-5.5,0xffe0b0,0.5,9); PL(4.3,2.6,-6,0xcfe0ff,0.4,8); PL(-2,5.6,-5,0xffd6a0,0.55,13);
  var wall=emat(0x232a31,0,0,1), wood=emat(0x2e251c,0,0,1), floorMat=emat(0x2a2622,0,0,1);
  roomDecor.wallMat=wall; roomDecor.floorMat=floorMat;
  var X0=-6,X1=6,Z0=-8,Z1=4,H=3,H2=6;
  function box(w,h,d,m,x,y,z){ var b=meshAt(new T.BoxGeometry(w,h,d),m,x,y,z); interiorScene.add(b); return b; }
  function col(x0,x1,z0,z1,yTop){ COL.push({x0:x0,x1:x1,z0:z0,z1:z1,yTop:yTop}); }
  function wseg(x0,x1,z0,z1,h,m,yTop){ var w=Math.max(x1-x0,0.2),d=Math.max(z1-z0,0.2); box(w,h,d,m,(x0+x1)/2,h/2,(z0+z1)/2); col(x0-0.04,x1+0.04,z0-0.04,z1+0.04,yTop===undefined?h:yTop); }
  function slab(x0,x1,z0,z1,y,m){ var b=box(x1-x0,0.2,z1-z0,m,(x0+x1)/2,y-0.1,(z0+z1)/2); floorMeshes.push(b); }
  slab(X0,X1,Z0,Z1,0,floorMat);
  slab(X0,3,Z0,Z1,H,floorMat); slab(3,X1,-3.5,Z1,H,floorMat);
  box(X1-X0,0.2,Z1-Z0,emat(0x16191d),0,H2,0);
  wseg(X0,-1,Z1,Z1,H2,wall); wseg(1,X1,Z1,Z1,H2,wall); wseg(X0,X1,Z0,Z0,H2,wall); wseg(X0,X0,Z0,Z1,H2,wall); wseg(X1,X1,Z0,Z1,H2,wall);
  box(2,2.4,0.12,emat(0x3a2a1e,0x281408,0.25),0,1.2,Z1);
  wseg(X0,-2,-1,-1,H,wall); wseg(2,2,Z0,-4,H,wall); wseg(3,X1,-4,-4,H,wall);
  for(var si=0;si<8;si++){ var sy=(si+1)*(H/8), sz=-3.5-si*(4.5/8); var st=box(2,0.3,4.5/8+0.06,wood,4.2,sy-0.15,sz-0.28); floorMeshes.push(st); }
  wseg(3,3,-6,-3.5,H+1.0,wall,H+1.0); wseg(3,5.5,-3.5,-3.5,H+1.0,wall,H+1.0);
  var cmet=emat(0x3a4048,0,0,0.6), ccab=emat(0x4a3a2a);
  box(4,1.0,0.9,ccab,-4,0.5,-7.5); col(X0,-2,-8,-7,1.0); box(4,0.06,0.95,cmet,-4,1.03,-7.5);
  box(0.85,0.9,0.85,emat(0x2a2e32),-1.2,0.45,-7.55); box(4,0.6,0.5,ccab,-4,2.4,-7.74);
  box(1.0,1.9,0.9,emat(0x9aa6ad),-5.4,0.95,-3.6); col(-6,-4.6,-4.1,-3.1,1.9);
  box(0.5,0.18,0.5,cmet,-3,1.07,-7.4);
  box(0.7,0.6,0.7,emat(0xdfe4e6),4.5,0.4,-7.4); col(4.1,4.9,-7.8,-7.0,0.7);
  box(0.7,0.5,0.45,emat(0xeef2f3),5.5,0.7,-5.6); box(1.7,0.55,0.95,emat(0xe6ecee),4.6,0.3,-5.0); col(3.7,5.5,-5.6,-4.4,0.55);
  box(0.5,0.7,0.05,emat(0x9fd0ff,0x223344,0.4),5.9,1.5,-5.6);
  box(2.5,0.7,0.95,emat(0x3a3340),-3.4,0.4,2.6); box(2.5,0.5,0.2,emat(0x3a3340),-3.4,0.78,3.1); col(-4.7,-2.1,2.0,3.2,0.7);
  box(1.7,1.0,0.16,emat(0x101418,0x2a90d0,0.5),3.6,1.3,3.74);
  var UY=H;
  box(1.7,0.4,2.4,wood,-4,UY+0.3,-5.5); box(1.6,0.25,2.3,emat(0x2a2f38),-4,UY+0.6,-5.5); box(1.5,0.2,0.95,emat(0x59f0d8,0x1d8a7d,0.2,0.8),-4,UY+0.72,-4.4); box(1.3,0.25,0.5,emat(0xd9dde2),-4,UY+0.78,-6.5); col(-5,-3,-7,-4.3,UY+0.55);
  var desk=new T.Group(); desk.position.set(2,UY,-7.45); interiorScene.add(desk);
  desk.add(meshAt(new T.BoxGeometry(2.0,0.1,0.8),wood,0,1.0,0)); desk.add(meshAt(new T.BoxGeometry(1.0,0.78,0.5),emat(0x14181e),0,1.5,-0.1));
  monitorScreen=meshAt(new T.PlaneGeometry(0.85,0.6),ps1v(new T.MeshStandardMaterial({color:0x9fd0ff,emissive:0x4a90d0,emissiveIntensity:1.5,roughness:0.4})),0,1.52,0.16);
  monitorScreen.userData.action='pc'; desk.add(monitorScreen); roomPickables.push(monitorScreen);
  desk.add(meshAt(new T.BoxGeometry(0.6,0.04,0.2),emat(0x20262e),0,1.06,0.28)); col(1,3,-7.95,-7.0,UY+1.1);
  box(1.6,2.0,0.7,emat(0x2e251c),4.6,UY+1.0,-7.45); col(3.8,5.4,-7.9,-7.0,UY+2.0);
  box(2.2,1.4,0.1,emat(0x16243f,0x22406a,0.8,0.5),0,UY+1.6,Z1-0.07);
  var lampMat=emat(0x2a2410,0xffd9a0,1.2); roomDecor.lampMat=lampMat; interiorScene.add(meshAt(coneGeo(0.3,0.3,10),lampMat,0,2.7,1.5));
  var rugMat=emat(0x3a1822,0x5a1828,0.2,0.9); roomDecor.rugMat=rugMat; interiorScene.add(meshAt(new T.BoxGeometry(3,0.04,2.2),rugMat,-3.2,0.04,2.4));
  var posters=new T.Group(); var pA=meshAt(new T.PlaneGeometry(0.9,1.2),emat(0x2a1030,0xff5ad0,0.7,0.5),-5.92,UY+1.6,-5.5); pA.rotation.y=Math.PI/2; posters.add(pA); posters.add(meshAt(new T.PlaneGeometry(1.0,0.8),emat(0x102a2a,0x39e0ff,0.6,0.5),1.2,1.7,-7.92)); roomDecor.posters=posters; interiorScene.add(posters);
  var fairy=new T.Group(); var fcol=[0xff5ad0,0x59f0d8,0xffe23a,0x9affb0,0xff8a5a]; for(var gi=0;gi<14;gi++){ fairy.add(meshAt(new T.SphereGeometry(0.05,6,6),emat(fcol[gi%5],fcol[gi%5],1.6,0.4),-5.6+gi*0.85,UY+2.55,-7.85)); } fairy.visible=false; roomDecor.lights=fairy; interiorScene.add(fairy);
  var plant2=new T.Group(); plant2.position.set(5.2,0,2.6); plant2.add(meshAt(cylGeo(0.22,0.18,0.4,8),emat(0x3a2a22),0,0.2,0)); for(var pj=0;pj<5;pj++){ var p2c=meshAt(coneGeo(0.12,0.7,5),emat(0x1f5a3a),0,0.7,0); p2c.rotation.z=rand(-0.4,0.4); p2c.rotation.x=rand(-0.4,0.4); plant2.add(p2c); } plant2.visible=false; roomDecor.plant2=plant2; interiorScene.add(plant2);
  var bannerMat=new T.MeshBasicMaterial({transparent:true}); roomDecor.bannerMat=bannerMat;
  roomDecor.setBannerNick=function(nick){ var cv=document.createElement('canvas'); cv.width=512; cv.height=160; var bc=cv.getContext('2d'); bc.fillStyle='#0e1420'; bc.fillRect(0,0,512,160); bc.strokeStyle='#74e0d0'; bc.lineWidth=8; bc.strokeRect(8,8,496,144); bc.fillStyle='#eaf6f4'; bc.font='bold 66px sans-serif'; bc.textAlign='center'; bc.textBaseline='middle'; bc.fillText((nick||'MI CASA').slice(0,14),256,84); var tx=new T.CanvasTexture(cv); tx.needsUpdate=true; bannerMat.map=tx; bannerMat.needsUpdate=true; };
  roomDecor.setBannerNick('MI CASA');
  var banner=meshAt(new T.PlaneGeometry(1.6,0.5),bannerMat,-2.5,2.2,Z1-0.09); banner.visible=false; roomDecor.banner=banner; interiorScene.add(banner);
  var lava=new T.Group(); lava.position.set(5.2,0,3.4); lava.add(meshAt(cylGeo(0.18,0.22,0.15,12),emat(0x20242b),0,0.08,0)); lava.add(meshAt(cylGeo(0.13,0.16,0.7,12),new T.MeshStandardMaterial({color:0x223040,transparent:true,opacity:0.45,roughness:0.3}),0,0.5,0)); var lavaBlob=meshAt(new T.SphereGeometry(0.1,10,10),emat(0xff5ad0,0xff5ad0,1.6,0.4),0,0.45,0); lava.add(lavaBlob); lava.add(meshAt(cylGeo(0.16,0.13,0.08,12),emat(0x20242b),0,0.88,0)); lava.visible=false; roomDecor.lava=lava; roomDecor.lavaBlob=lavaBlob; interiorScene.add(lava);
  var dn=70,dg=new T.BufferGeometry(),da=new Float32Array(dn*3); for(var i=0;i<dn;i++){ da[i*3]=rand(X0+0.5,X1-0.5); da[i*3+1]=rand(0.4,5.4); da[i*3+2]=rand(Z0+0.5,Z1-0.5); } dg.setAttribute('position',new T.Float32BufferAttribute(da,3)); roomDust=new T.Points(dg,new T.PointsMaterial({color:0x9fb0c0,size:0.04,transparent:true,opacity:0.4,depthWrite:false})); interiorScene.add(roomDust);
}
buildHouse();
function floorYAt(x,z,cy){ downRay.set(new T.Vector3(x,cy+0.9,z),new T.Vector3(0,-1,0)); downRay.far=cy+2.6; var h=downRay.intersectObjects(floorMeshes,false); for(var i=0;i<h.length;i++){ if(h[i].point.y<=cy+0.8) return h[i].point.y; } return 0; }
function collideXZ(nx,nz,y){ var r=0.34,i,c; for(i=0;i<COL.length;i++){ c=COL[i]; if(y>=c.yTop-0.25)continue; if(nx>c.x0-r&&nx<c.x1+r&&nz>c.z0-r&&nz<c.z1+r){ var dL=nx-(c.x0-r),dR=(c.x1+r)-nx,dB=nz-(c.z0-r),dF=(c.z1+r)-nz,m=Math.min(dL,dR,dB,dF); if(m===dL)nx=c.x0-r; else if(m===dR)nx=c.x1+r; else if(m===dB)nz=c.z0-r; else nz=c.z1+r; } } return [nx,nz]; }
var DEFAULT_ROOM={wall:'#1f262e',floor:'#2a2018',light:'#ffd6a0',items:{posters:true,lights:false,plant2:false,banner:false,lava:false}};
function loadRoom(){ try{ var r=JSON.parse(localStorage.getItem('yata_room')); if(r&&r.wall){ r.items=Object.assign({},DEFAULT_ROOM.items,r.items||{}); return r; } }catch(e){} return null; }
function applyRoom(r){ var d=roomDecor;
  if(d.wallMat) d.wallMat.color.set(r.wall);
  if(d.floorMat) d.floorMat.color.set(r.floor);
  if(d.ceilLight) d.ceilLight.color.set(r.light);
  if(d.lampMat) d.lampMat.emissive.set(r.light);
  if(d.posters) d.posters.visible=!!r.items.posters;
  if(d.lights) d.lights.visible=!!r.items.lights;
  if(d.plant2) d.plant2.visible=!!r.items.plant2;
  if(d.banner) d.banner.visible=!!r.items.banner;
  if(d.lava) d.lava.visible=!!r.items.lava;
}
ROOM=loadRoom()||Object.assign({},DEFAULT_ROOM,{items:Object.assign({},DEFAULT_ROOM.items)}); applyRoom(ROOM);
var inRoom=false;
function fadeFlash(){ var f=document.getElementById('fade'); if(!f)return; f.style.transition='none'; f.style.opacity='1';
  requestAnimationFrame(function(){ requestAnimationFrame(function(){ f.style.transition='opacity .45s ease'; f.style.opacity='0'; }); }); }
function enterRoom(){ inRoom=true; fp.x=0; fp.z=3; fp.y=0; fp.yaw=Math.PI; fp.pitch=0; currentHouse=null;
  document.body.classList.add('inroom'); document.getElementById('roomui').classList.add('show'); prompt.classList.remove('show'); fadeFlash(); blip(300,0.18,'sine',0.07); }
function exitRoom(){ inRoom=false; try{ if(document.exitPointerLock&&document.pointerLockElement)document.exitPointerLock(); }catch(e){} document.body.classList.remove('inroom'); document.getElementById('roomui').classList.remove('show'); closeDecor(); fadeFlash(); }
function openEscritorio(){ var nick=(me&&me.nick)?me.nick:''; if(nick) openURL('/demon/'+encodeURIComponent(nick)+'/escritorio?embed=1','🖥️','Escritorio','tu PC'); else openURL('/yata?embed=1&sec=perfil','🖥️','My Hell','perfil'); }
function updateHouse(dt,t){
  var mf=0,ms=0;
  if(started){ if(keys['w']||keys['arrowup'])mf+=1; if(keys['s']||keys['arrowdown'])mf-=1; if(keys['d']||keys['arrowright'])ms+=1; if(keys['a']||keys['arrowleft'])ms-=1; }
  if(joyActive){ mf+=-joyVec.y; ms+=joyVec.x; }
  var ln=Math.hypot(mf,ms); if(ln>1){mf/=ln;ms/=ln;}
  var sp=2.2,fX=Math.sin(fp.yaw),fZ=-Math.cos(fp.yaw),rX=Math.cos(fp.yaw),rZ=Math.sin(fp.yaw);
  var nx=fp.x+(fX*mf+rX*ms)*sp*dt, nz=fp.z+(fZ*mf+rZ*ms)*sp*dt;
  var p=collideXZ(nx,nz,fp.y); fp.x=p[0]; fp.z=p[1];
  var fy=floorYAt(fp.x,fp.z,fp.y); fp.y=lerp(fp.y,fy,Math.min(1,dt*12));
  roomCam.position.set(fp.x,fp.y+1.62,fp.z);
  var d=new T.Vector3(Math.sin(fp.yaw)*Math.cos(fp.pitch),Math.sin(fp.pitch),-Math.cos(fp.yaw)*Math.cos(fp.pitch));
  roomCam.up.set(0,1,0); roomCam.lookAt(roomCam.position.clone().add(d));
  if(roomDecor.lava&&roomDecor.lava.visible){ roomDecor.lavaBlob.position.y=0.45+Math.sin(t*1.3)*0.16; roomDecor.lavaBlob.material.emissiveIntensity=1.4+Math.sin(t*2.2)*0.3; }
  if(roomDecor.lights&&roomDecor.lights.visible){ var lc=roomDecor.lights.children; for(var qi=0;qi<lc.length;qi++) lc[qi].material.emissiveIntensity=1.0+0.8*(0.5+0.5*Math.sin(t*3+qi)); }
  if(monitorScreen) monitorScreen.material.emissiveIntensity=1.35+Math.sin(t*22)*0.06+Math.random()*0.05;
  if(roomDust) roomDust.rotation.y+=dt*0.03;
  var nd=(fp.z>2.7&&Math.abs(fp.x)<1.5), npc=houseNearPC(), hint=document.querySelector('#roomui .room-hint');
  if(hint) hint.innerHTML = npc?'Tu PC — <b>E</b> para abrir el escritorio' : (nd?'<b>E</b> para salir al mundo' : 'WASD moverte · mirá con el mouse · <b>E</b> interactuar');
}
function houseNearPC(){ if(!monitorScreen)return false; var mp=new T.Vector3(); monitorScreen.getWorldPosition(mp); return (Math.hypot(fp.x-mp.x,fp.z-mp.z)<2.2 && Math.abs(fp.y-(mp.y-1.62))<2.2); }
function houseInteract(){ if(houseNearPC()){ openEscritorio(); return; } if(fp.z>2.6&&Math.abs(fp.x)<1.6){ exitRoom(); } }
addEventListener('keydown',function(e){ if(inRoom&&e.key&&e.key.toLowerCase()==='e') houseInteract(); });
document.addEventListener('pointerlockchange',function(){ fpLocked=(document.pointerLockElement===canvas); });

/* ----------------------------------------------------------- NPCs */
var npcNames=['Nochi','osaaran','z_Juan','EXO','fabrx','Polizzeh','dilan','n!co','Soo','justdag','Haze'];
var npcs=[];
function makeNPC(){
  var g=new T.Group(); var col=pick([0x223044,0x2a2436,0x1f3a36,0x33283a]);
  g.add(meshAt(cylGeo(0.16,0.2,0.6,6),emat(0x141b26,0,0,0.8),-0.14,0.3,0)); g.add(meshAt(cylGeo(0.16,0.2,0.6,6),emat(0x141b26,0,0,0.8),0.14,0.3,0));
  g.add(meshAt(cylGeo(0.38,0.46,0.9,7),emat(col,0,0,0.8),0,0.95,0));
  g.add(meshAt(new T.SphereGeometry(0.3,12,12),emat(0x2b3d4f),0,1.65,0));
  var hood=meshAt(coneGeo(0.44,0.52,9),emat(col),0,1.8,-0.04); hood.rotation.x=-0.15; g.add(hood);
  var ec=pick([0x59f0d8,0xff5ad0,0xffca6a,0x8fd0ff]);
  g.add(meshAt(new T.BoxGeometry(0.34,0.1,0.14),emat(ec,ec,1.4,0.3),0,1.66,0.24));
  var lant=makeSprite(TEX_WARM,0xffd98f,1.8); lant.position.set(-0.42,1.0,0.2); g.add(lant);
  g.add(meshAt(new T.IcosahedronGeometry(0.13,0),emat(0xffe6b0,0xffce80,2.0,0.3),-0.42,1.0,0.2));
  world.add(g);
  var el=document.createElement('div'); el.className='label npc'; el.innerHTML='<span class="dotn"></span>'+pick(npcNames); labelsBox.appendChild(el);
  var d=randDir(); var posN2=d.clone(); var fwd2=new T.Vector3().crossVectors(posN2,UP_Y).normalize();
  return {group:g,posN:posN2,fwd:fwd2,target:randDir(),spd:rand(0.18,0.32),el:el,bob:rand(0,TAU),lant:lant};
}
var ni; for(ni=0;ni<9;ni++) npcs.push(makeNPC());

var spirits=[];
for(ni=0;ni<3;ni++){ var sg=new T.Group(); var sm=ps1v(new T.MeshStandardMaterial({color:0x8fb6d6,transparent:true,opacity:0.32,emissive:0x4a7fb0,emissiveIntensity:0.6,flatShading:true}));
  sg.add(meshAt(coneGeo(0.5,1.4,8),sm,0,0,0)); sg.add(meshAt(new T.SphereGeometry(0.3,10,10),sm,0,0.6,0));
  sg.add(makeSprite(TEX_SOFT,0x9fd0ff,2.0)); var sd=randDir(); sg.userData={dir:sd,ph:rand(0,TAU)}; world.add(sg); spirits.push(sg); }

function npcStep(n,dt){
  var up=n.posN; n.fwd.addScaledVector(up,-n.fwd.dot(up)).normalize();
  var toT=n.target.clone().addScaledVector(up,-n.target.dot(up)); if(toT.lengthSq()<1e-5){ n.target=randDir(); return; }
  toT.normalize();
  var cross=new T.Vector3().crossVectors(n.fwd,toT); var dirSign=Math.sign(cross.dot(up))||1; var ang=n.fwd.angleTo(toT);
  n.fwd.applyAxisAngle(up,dirSign*Math.min(ang,1.6*dt)); n.fwd.addScaledVector(up,-n.fwd.dot(up)).normalize();
  var right=new T.Vector3().crossVectors(up,n.fwd).normalize();
  n.posN.applyAxisAngle(right,n.spd*dt).normalize(); n.fwd.applyAxisAngle(right,n.spd*dt); n.fwd.addScaledVector(up,-n.fwd.dot(up)).normalize();
  if(n.posN.angleTo(n.target)<0.08) n.target=randDir();
  var sp=surfacePoint(n.posN); n.bob+=dt*9; var bob=Math.sin(n.bob)*0.05;
  n.group.position.copy(sp).addScaledVector(n.posN,0.02+bob);
  var r2=new T.Vector3().crossVectors(n.posN,n.fwd).normalize(), f2=new T.Vector3().crossVectors(r2,n.posN).normalize();
  n.group.quaternion.setFromRotationMatrix(new T.Matrix4().makeBasis(r2,n.posN,f2));
}

/* ----------------------------------------------------------- movimiento (vos) */
var posN=new T.Vector3(0,0,1), fwd=new T.Vector3(0,1,0);
function orthonormalize(){ fwd.addScaledVector(posN,-fwd.dot(posN)); if(fwd.lengthSq()<1e-6) fwd.set(posN.y,-posN.x,0); fwd.normalize(); }
orthonormalize(); posN.copy(houses[0].dir).applyAxisAngle(new T.Vector3(1,0,0),0.5).normalize(); orthonormalize();
var SPEED=0.26, TURN=1.9, walkBob=0, vel=0;
function moveForward(ds){ var right=new T.Vector3().crossVectors(posN,fwd).normalize(); posN.applyAxisAngle(right,ds).normalize(); fwd.applyAxisAngle(right,ds); orthonormalize(); }
function turn(a){ fwd.applyAxisAngle(posN,a); orthonormalize(); }

/* ----------------------------------------------------------- input */
var keys={}, started=false, paused=false, currentHouse=null, shopOpen=false, shopSpin=0;
addEventListener('keydown',function(e){ var k=e.key.toLowerCase(); keys[k]=true;
  if(['arrowup','arrowdown','arrowleft','arrowright',' '].indexOf(k)>=0) e.preventDefault();
  if(k==='e'&&started&&!paused&&!inRoom&&!shopOpen&&currentHouse) enter(currentHouse);
  if(k==='escape'){ if(overlay.classList.contains('show')) closeOverlay(); else if(shopOpen) closeShop(); } });
addEventListener('keyup',function(e){ keys[e.key.toLowerCase()]=false; });

var joyVec={x:0,y:0}, joyActive=false, joy=document.getElementById('joy'), joyStick=document.getElementById('joyStick');
var isTouch=matchMedia('(pointer:coarse)').matches; if(isTouch) document.body.classList.add('touch');
function joyStart(e){ joyActive=true; joyMove(e); if(e.preventDefault)e.preventDefault(); }
function joyMove(e){ if(!joyActive)return; var t=e.touches?e.touches[0]:e, r=joy.getBoundingClientRect();
  var dx=t.clientX-(r.left+r.width/2), dy=t.clientY-(r.top+r.height/2), max=r.width/2, len=Math.hypot(dx,dy)||1, cl=Math.min(len,max);
  dx=dx/len*cl; dy=dy/len*cl; joyStick.style.transform='translate('+dx+'px,'+dy+'px)'; joyVec.x=dx/max; joyVec.y=dy/max; }
function joyEnd(){ joyActive=false; joyVec.x=joyVec.y=0; joyStick.style.transform='translate(0,0)'; }
joy.addEventListener('touchstart',joyStart,{passive:false}); joy.addEventListener('touchmove',joyMove,{passive:false}); joy.addEventListener('touchend',joyEnd); joy.addEventListener('touchcancel',joyEnd);
joy.addEventListener('mousedown',joyStart); addEventListener('mousemove',joyMove); addEventListener('mouseup',joyEnd);

var mobileEnter=document.getElementById('mobileEnter');
if(mobileEnter) mobileEnter.addEventListener('click',function(){ if(currentHouse) enter(currentHouse); });

var pointerV=new T.Vector2(), rc=new T.Raycaster();
canvas.addEventListener('pointerdown',function(e){
  if(inRoom){ fpLook=true; fpLastX=e.clientX; fpLastY=e.clientY;
    if(!fpLocked&&canvas.requestPointerLock){ try{canvas.requestPointerLock();}catch(_){} }
    rc.setFromCamera(new T.Vector2(0,0),roomCam); var hh=rc.intersectObjects(roomPickables,false); if(hh.length&&hh[0].distance<3.2) openEscritorio();
    return; }
  if(!started||paused)return;
  pointerV.x=(e.clientX/window.innerWidth)*2-1; pointerV.y=-(e.clientY/window.innerHeight)*2+1;
  rc.setFromCamera(pointerV,camera); var hit=rc.intersectObjects(pickables,false);
  if(hit.length&&hit[0].object.userData.house) enter(hit[0].object.userData.house); });
addEventListener('pointermove',function(e){ if(!inRoom)return;
  if(fpLocked){ fp.yaw-=(e.movementX||0)*0.0022; fp.pitch=clamp(fp.pitch-(e.movementY||0)*0.0022,-1.1,1.1); }
  else if(fpLook){ var dx=e.clientX-fpLastX,dy=e.clientY-fpLastY; fpLastX=e.clientX; fpLastY=e.clientY; fp.yaw-=dx*0.005; fp.pitch=clamp(fp.pitch-dy*0.004,-1.1,1.1); } });
addEventListener('pointerup',function(){ fpLook=false; });

/* ----------------------------------------------------------- audio (solo blips, sin música) */
var actx=null,muted=false;
function audioInit(){ if(actx)return; try{ actx=new (window.AudioContext||window.webkitAudioContext)(); }catch(e){ actx=null; } }
function blip(f,d,ty,g){ if(!actx||muted)return; var o=actx.createOscillator(),gn=actx.createGain(); o.type=ty||'sine'; o.frequency.value=f;
  gn.gain.setValueAtTime(0,actx.currentTime); gn.gain.linearRampToValueAtTime(g||0.1,actx.currentTime+0.01); gn.gain.exponentialRampToValueAtTime(0.0001,actx.currentTime+(d||0.2));
  o.connect(gn).connect(actx.destination); o.start(); o.stop(actx.currentTime+(d||0.2)+0.02); }

/* ----------------------------------------------------------- overlay + HUD + vestuario */
var overlay=document.getElementById('overlay'), ovFrame=document.getElementById('ovFrame'), ovTitle=document.getElementById('ovTitle'), ovLoad=document.getElementById('ovLoad'), ovBackLabel=document.getElementById('ovBackLabel');
function openURL(url,emoji,label,sub){ ovTitle.innerHTML='<span class="em">'+(emoji||'✨')+'</span> <span>'+label+'</span>'+(sub?'<small>'+sub+'</small>':'');
  if(ovBackLabel) ovBackLabel.textContent=inRoom?'Volver al cuarto':'Volver al mundo';
  ovLoad.style.display='block'; ovFrame.src=url; overlay.classList.add('show'); paused=true; blip(523,0.12,'sine',0.08); }
ovFrame.addEventListener('load',function(){ ovLoad.style.display='none'; });
function enter(h){ if(h.def.room){ enterRoom(); } else if(h.def.shop){ openShop(); } else openURL(h.def.url,h.def.emoji,h.def.label,h.def.sub); }
function openSection(sec,emoji,label){ openURL('/yata?embed=1&sec='+sec,emoji,label,label); }
function closeOverlay(){ overlay.classList.remove('show'); paused=false; setTimeout(function(){ if(!overlay.classList.contains('show')) ovFrame.src='about:blank'; },320); }
document.getElementById('ovBack').addEventListener('click',closeOverlay);
var prompt=document.getElementById('prompt'), promptRing=document.getElementById('promptRing');
prompt.addEventListener('click',function(){ if(currentHouse) enter(currentHouse); });
var roomBackBtn=document.getElementById('roomBack'); if(roomBackBtn) roomBackBtn.addEventListener('click',exitRoom);

var PAL={
  coat:['#1d2a3a','#20242b','#133a34','#3a1822','#15301f','#241830','#121418','#5a4632'],
  accent:['#59f0d8','#ff5ad0','#ffca6a','#49d0ff','#5cff9e','#ff5a4a','#b59cff','#e8eef2'],
  lantern:['#ffce80','#59f0d8','#6bff9e','#b59cff','#ff6a4a','#6fb0ff']
};
var HATS=[['none','Ninguno'],['gorro','Gorro'],['gorra','Gorra'],['galera','Galera'],['aura','Aura'],['cuernos','Cuernos']];
var shopEl=document.getElementById('shop');
function buildSwatches(){
  ['coat','accent','lantern'].forEach(function(part){
    var box=shopEl.querySelector('.shop-row[data-part="'+part+'"] .sw'); if(!box)return; box.innerHTML='';
    PAL[part].forEach(function(c){ var b=document.createElement('button'); b.className='swatch'+((''+FIT[part]).toLowerCase()===c.toLowerCase()?' on':''); b.style.background=c; b.title=c;
      b.onclick=function(){ FIT[part]=c; applyFit(FIT); saveFit(FIT); box.querySelectorAll('.swatch').forEach(function(x){x.classList.remove('on');}); b.classList.add('on'); blip(440,0.05,'sine',0.05); };
      box.appendChild(b); });
  });
  var hbox=shopEl.querySelector('.shop-row[data-part="hat"] .sw'); if(hbox){ hbox.innerHTML='';
    HATS.forEach(function(h){ var b=document.createElement('button'); b.className='hatchip'+(FIT.hat===h[0]?' on':''); b.textContent=h[1];
      b.onclick=function(){ FIT.hat=h[0]; applyFit(FIT); saveFit(FIT); hbox.querySelectorAll('.hatchip').forEach(function(x){x.classList.remove('on');}); b.classList.add('on'); blip(440,0.05,'sine',0.05); };
      hbox.appendChild(b); }); }
}
function openShop(){ buildSwatches(); shopEl.classList.add('show'); paused=true; shopOpen=true; blip(523,0.12,'sine',0.08); }
function closeShop(){ shopEl.classList.remove('show'); paused=false; shopOpen=false; }
if(shopEl){
  var sdn=document.getElementById('shopDone'); if(sdn) sdn.addEventListener('click',closeShop);
  var srnd=document.getElementById('shopRandom'); if(srnd) srnd.addEventListener('click',function(){ FIT.coat=pick(PAL.coat); FIT.accent=pick(PAL.accent); FIT.lantern=pick(PAL.lantern); FIT.hat=pick(HATS)[0]; applyFit(FIT); saveFit(FIT); buildSwatches(); blip(660,0.08,'square',0.06); });
}

var RPAL={wall:['#1f262e','#241c2a','#2a1820','#16221f','#26221a','#1a1f2c','#2a2530'],floor:['#2a2018','#241c2a','#1c2228','#2a2420','#1f2a22','#2c2230'],light:['#ffd6a0','#74e0d0','#ff7ad0','#ff6a4a','#9b8cff','#9affb0']};
var RITEMS=[['posters','Posters'],['lights','Luces'],['plant2','Planta'],['banner','Cartel'],['lava','Lampara']];
var decorEl=document.getElementById('decor');
function buildDecorUI(){
  ['wall','floor','light'].forEach(function(part){ var box=decorEl.querySelector('.shop-row[data-part="'+part+'"] .sw'); if(!box)return; box.innerHTML='';
    RPAL[part].forEach(function(c){ var b=document.createElement('button'); b.className='swatch'+((''+ROOM[part]).toLowerCase()===c.toLowerCase()?' on':''); b.style.background=c; b.title=c;
      b.onclick=function(){ ROOM[part]=c; applyRoom(ROOM); saveRoom(ROOM); box.querySelectorAll('.swatch').forEach(function(x){x.classList.remove('on');}); b.classList.add('on'); blip(440,0.05,'sine',0.05); }; box.appendChild(b); }); });
  var ibox=decorEl.querySelector('.shop-row[data-part="items"] .sw'); if(ibox){ ibox.innerHTML='';
    RITEMS.forEach(function(it){ var b=document.createElement('button'); b.className='hatchip'+(ROOM.items[it[0]]?' on':''); b.textContent=it[1];
      b.onclick=function(){ ROOM.items[it[0]]=!ROOM.items[it[0]]; applyRoom(ROOM); saveRoom(ROOM); b.classList.toggle('on',!!ROOM.items[it[0]]); blip(520,0.05,'sine',0.05); }; ibox.appendChild(b); }); }
}
function openDecor(){ buildDecorUI(); decorEl.classList.add('show'); }
function closeDecor(){ decorEl.classList.remove('show'); }
if(decorEl){ var ddn=document.getElementById('decorDone'); if(ddn) ddn.addEventListener('click',closeDecor); }
var decBtn=document.getElementById('roomDecorBtn'); if(decBtn) decBtn.addEventListener('click',openDecor);
function chipSec(id,sec,emoji,label){ var el=document.getElementById(id); if(el) el.addEventListener('click',function(){ openSection(sec,emoji,label); }); }
chipSec('chipNotif','notifs','🔔','Notificaciones'); chipSec('chipMsg','mensajes','✉️','Mensajes'); chipSec('chipFriends','amigos','👥','Amigos'); chipSec('chipAdmin','admin','🛡️','Admin');
document.getElementById('chipClassic').addEventListener('click',function(){ location.href='/yata?clasico=1'; });
document.getElementById('chipSound').addEventListener('click',function(){ muted=!muted; document.getElementById('soundIco').style.opacity=muted?0.4:1; });

var me=null;
fetch('/api/hub/me',{headers:{'accept':'application/json'}}).then(function(r){return r.json();}).then(function(d){
  if(d&&d.ok&&d.logged){ me=d; if(d.avatar) setAvatar(d.avatar); if(roomDecor.setBannerNick) roomDecor.setBannerNick(d.nick);
    if(d.admin){ document.getElementById('chipAdmin').classList.remove('is-hidden'); document.getElementById('chipClassic').classList.remove('is-hidden'); } }
}).catch(function(){});
fetch('/api/world/me',{headers:{'accept':'application/json'}}).then(function(r){return r.json();}).then(function(d){
  if(d&&d.logged&&d.data){ var D=d.data;
    if(D.fit){ FIT=Object.assign({},DEFAULT_FIT,D.fit); applyFit(FIT); try{ localStorage.setItem('yata_fit',JSON.stringify(FIT)); }catch(e){} }
    if(D.room){ ROOM=Object.assign({},DEFAULT_ROOM,D.room); ROOM.items=Object.assign({},DEFAULT_ROOM.items,D.room.items||{}); applyRoom(ROOM); try{ localStorage.setItem('yata_room',JSON.stringify(ROOM)); }catch(e){} }
  }
}).catch(function(){});

/* ----------------------------------------------------------- resize + loop */
function onResize(){ var w=window.innerWidth,h=window.innerHeight;
  camera.aspect=w/h; camera.updateProjectionMatrix(); roomCam.aspect=w/h; roomCam.updateProjectionMatrix(); renderer.setSize(w,h);
  var lw=Math.max(2,Math.floor(w/PIXEL)), lh=Math.max(2,Math.floor(h/PIXEL));
  rt.setSize(lw,lh); postMat.uniforms.uRes.value.set(lw,lh); }
addEventListener('resize',onResize); onResize();

var clock=new T.Clock(), _camTarget=new T.Vector3(), _proj=new T.Vector3();
function updateCamera(dt){ var cw=posN.clone().multiplyScalar(terrainR(posN)+1.0);
  var camUp=shopOpen?6.0:8.5, camBack=shopOpen?9.0:14.0, camLook=shopOpen?3.0:2.4;
  _camTarget.copy(cw).addScaledVector(posN,camLook);
  var desired=cw.clone().addScaledVector(posN,camUp).addScaledVector(fwd,-camBack);
  camera.position.lerp(desired,1-Math.pow(0.0016,dt)); camera.up.copy(posN); camera.lookAt(_camTarget); }
function projectToScreen(v){ _proj.copy(v).project(camera); return {x:(_proj.x*0.5+0.5)*window.innerWidth,y:(-_proj.y*0.5+0.5)*window.innerHeight,behind:_proj.z>1}; }

function animate(){
  requestAnimationFrame(animate);
  var dt=Math.min(clock.getDelta(),0.05), t=clock.elapsedTime;

  if(inRoom){
    updateHouse(dt,t);
    postMat.uniforms.uTime.value=t;
    renderer.setRenderTarget(rt); renderer.render(interiorScene,roomCam);
    renderer.setRenderTarget(null); renderer.render(postScene,postCam);
    return;
  }

  var steer=0,go=0;
  if(started&&!paused){
    if(keys['a']||keys['arrowleft'])steer+=1; if(keys['d']||keys['arrowright'])steer-=1;
    if(keys['w']||keys['arrowup'])go+=1; if(keys['s']||keys['arrowdown'])go-=1;
    if(joyActive){ steer+=-joyVec.x; go+=-joyVec.y; }
    steer=clamp(steer,-1,1); go=clamp(go,-1,1);
    if(steer)turn(steer*TURN*dt); if(go)moveForward(go*SPEED*dt);
    vel=lerp(vel,Math.abs(go),0.2);
  } else vel=lerp(vel,0,0.1);

  var sp=surfacePoint(posN); walkBob+=dt*11*vel; var bob=Math.sin(walkBob)*0.06*vel;
  courier.position.copy(sp).addScaledVector(posN,0.02+bob);
  var up=posN.clone(), right=new T.Vector3().crossVectors(up,fwd).normalize(), f2=new T.Vector3().crossVectors(right,up).normalize();
  courier.quaternion.setFromRotationMatrix(new T.Matrix4().makeBasis(right,up,f2));
  courier.rotateZ(-steer*0.16*vel); courier.rotateX(-0.12*vel);
  if(shopOpen){ shopSpin+=dt*0.7; courier.rotateY(shopSpin); }
  if(lanternPivot) lanternPivot.rotation.x=Math.sin(walkBob*0.5)*0.25*vel + Math.sin(t*1.3)*0.05;
  shadow.position.copy(sp).addScaledVector(posN,0.05); orientToDir(shadow,posN); shadow.rotateX(-Math.PI/2);
  var fl=0.85+Math.sin(t*9)*0.06+Math.random()*0.05; if(courierLight)courierLight.intensity=1.4*fl; if(lanternGlow)lanternGlow.scale.setScalar(2.6*fl);

  var best=null,bd=99,i;
  for(i=0;i<houses.length;i++){ var h=houses[i]; var ang=posN.angleTo(h.dir); var near=ang<0.22; h.beacon.visible=near; if(near)h.ring.rotation.z+=dt*1.6;
    if(ang<bd){bd=ang;best=h;} if(h.anim)h.anim(t);
    var s=projectToScreen(h.world); if(s.behind){h.el.style.opacity=0;} else { h.el.style.left=s.x+'px'; h.el.style.top=s.y+'px'; h.el.style.opacity=clamp(1.15-ang*1.6,0,1); } }
  if(!shopOpen&&!paused&&best&&bd<0.17){ currentHouse=best; promptRing.innerHTML='Entrar al <b>'+best.def.label+'</b> · <b>E</b>'; prompt.classList.add('show'); if(mobileEnter){ mobileEnter.textContent='Entrar al '+best.def.label; mobileEnter.classList.add('show'); } }
  else { currentHouse=(best&&bd<0.17)?best:null; prompt.classList.remove('show'); if(mobileEnter)mobileEnter.classList.remove('show'); }

  for(i=0;i<npcs.length;i++){ var n=npcs[i]; if(!paused&&started)npcStep(n,dt); var ns=projectToScreen(n.group.position);
    if(ns.behind||posN.angleTo(n.posN)>0.6){ n.el.style.opacity=0; } else { n.el.style.left=ns.x+'px'; n.el.style.top=(ns.y-34)+'px'; n.el.style.opacity=clamp(0.9-posN.angleTo(n.posN),0,0.9); }
    n.lant.scale.setScalar(1.8*(0.9+Math.sin(t*7+n.bob)*0.08)); }
  for(i=0;i<spirits.length;i++){ var s2=spirits[i], dd=s2.userData; dd.dir.applyAxisAngle(UP_Y,dt*0.06);
    var ps=surfacePoint(dd.dir).addScaledVector(dd.dir,2.2+Math.sin(t*0.8+dd.ph)*0.6); s2.position.copy(ps); orientToDir(s2,dd.dir); s2.children[2].material.opacity=0.5+0.3*Math.sin(t*2+dd.ph); }

  if(GRASS_SHADER) GRASS_SHADER.uniforms.uTime.value=t;
  for(i=0;i<lamps.length;i++){ var L=lamps[i]; var lf=0.75+Math.sin(t*8+L.ph)*0.1+Math.random()*0.12; L.lampMat.emissiveIntensity=2.0*lf; L.glow.scale.setScalar(1.8*lf); if(L.pl)L.pl.intensity=0.8*lf; }

  starField.rotation.y+=dt*0.005; starField.rotation.x=Math.sin(t*0.02)*0.04;
  moon.position.x=Math.cos(t*0.008)*310; moon.position.z=-340+Math.sin(t*0.008)*40;
  var fp=fireflies.geometry.attributes.position; for(i=0;i<NF;i++){ fp.array[i*3+1]+=Math.cos(t*0.8+fph[i])*0.003; } fp.needsUpdate=true; fireflies.rotation.y+=dt*0.025;
  for(i=0;i<mists.length;i++){ var M=mists[i]; M.material.rotation+=dt*0.05; M.material.opacity=0.14+0.07*Math.sin(t*0.4+M.userData.ph); }
  for(i=0;i<wisps.length;i++){ var w=wisps[i]; if(w.pos.distanceTo(w.target)<0.5){ var nd=randDir(); w.target.copy(nd.multiplyScalar(terrainR(nd)+rand(1.5,4))); }
    w.pos.lerp(w.target,dt*0.4); w.sp.position.copy(w.pos); w.sp.position.y+=Math.sin(t*2+w.ph)*0.3; w.sp.material.opacity=0.6+0.4*Math.sin(t*3+w.ph); }
  for(i=0;i<bats.length;i++){ var B=bats[i]; B.ph+=dt*B.spd; var ba=B.ref.clone().applyAxisAngle(B.axis,B.ph).multiplyScalar(B.orbR);
    B.sp.position.copy(ba); B.sp.material.rotation=Math.sin(t*B.flap)*0.6; B.sp.scale.x=1.6+Math.sin(t*B.flap)*0.5; }
  shooterTimer-=dt; if(shooterTimer<=0){ spawnShooter(); shooterTimer=rand(3,8); }
  for(i=shooters.length-1;i>=0;i--){ var S=shooters[i]; S.t+=dt/S.life; S.sp.position.lerpVectors(S.from,S.to,clamp(S.t,0,1)); S.sp.material.opacity=Math.sin(clamp(S.t,0,1)*Math.PI); S.sp.scale.setScalar(12*(1-Math.abs(0.5-S.t))); if(S.t>=1){ scene.remove(S.sp); shooters.splice(i,1); } }

  updateCamera(dt);
  postMat.uniforms.uTime.value=t;
  renderer.setRenderTarget(rt); renderer.render(scene,camera);
  renderer.setRenderTarget(null); renderer.render(postScene,postCam);
}

/* ----------------------------------------------------------- start */
document.getElementById('enterBtn').addEventListener('click',function(){ if(started)return; started=true;
  audioInit(); if(actx&&actx.state==='suspended')actx.resume();
  document.getElementById('intro').classList.add('hide'); document.getElementById('hud').classList.add('show'); });
setTimeout(function(){ document.getElementById('loader').classList.add('hide'); },800);
animate();

})();
