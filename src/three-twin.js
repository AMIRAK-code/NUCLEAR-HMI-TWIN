import { S } from './model.js';
import { dispatch } from './reducer.js';

// ═══════════════════════════════════════════════════════════════════
export function initThreeJS() {
  const container = document.getElementById('three-container');
  if (!container || !window.THREE) return;

  const scene = new THREE.Scene();
  const aspect = container.clientWidth / container.clientHeight || 1.6;
  const perspCam = new THREE.PerspectiveCamera(40, aspect, 0.1, 1000);
  perspCam.position.set(0, 16, 32); perspCam.lookAt(0, 0, 0);
  const d = 14;
  const orthoCam = new THREE.OrthographicCamera(-d*aspect, d*aspect, d, -d, 1, 1000);
  orthoCam.position.set(0, 16, 32); orthoCam.lookAt(0, 0, 0);
  let activeCam = perspCam;

  const renderer = new THREE.WebGLRenderer({ alpha:true, antialias:true });
  renderer.setClearColor(0, 0);
  renderer.setSize(container.clientWidth, container.clientHeight);
  renderer.setPixelRatio(window.devicePixelRatio);
  container.appendChild(renderer.domElement);

  const G = new THREE.Group();
  scene.add(G);

  // Reactor vessel (translucent fill)
  G.add(new THREE.Mesh(
    new THREE.CylinderGeometry(4.1, 4.1, 18, 48),
    new THREE.MeshBasicMaterial({ color:0x2a2f36, transparent:true, opacity:0.15 })
  ));

  // Outer vessel wireframe
  const outerMat = new THREE.MeshBasicMaterial({ color:0x5a6573, wireframe:true, transparent:true, opacity:0.5 });
  const outerMesh = new THREE.Mesh(new THREE.CylinderGeometry(5.4, 5.4, 20, 24, 6), outerMat);
  G.add(outerMesh);

  // Lead coolant pool
  G.add(new THREE.Mesh(
    new THREE.CylinderGeometry(8.5, 9, 2.5, 36),
    new THREE.MeshBasicMaterial({ color:0x5a6573, transparent:true, opacity:0.05 })
  ));

  // Coolant manifold rings
  for (let i=0;i<5;i++) {
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(7.0, 0.055, 12, 72),
      new THREE.MeshBasicMaterial({ color:0x7a8590, transparent:true, opacity:0.38 })
    );
    ring.rotation.x = Math.PI/2; ring.position.y = -9+i*4.5; G.add(ring);
  }

  // Top cap & bottom plenum
  [[10.4, new THREE.CylinderGeometry(5.8,5.4,0.8,32)],[-10.6, new THREE.CylinderGeometry(5.4,4.8,1.2,32)]].forEach(([y,geo]) => {
    const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({color:0x5a6573,wireframe:true,transparent:true,opacity:0.3}));
    m.position.y=y; G.add(m);
  });

  // Control rods
  const rods = [];
  for (let i=0;i<12;i++) {
    const rodMat = new THREE.MeshBasicMaterial({ color:0x1a1d21, transparent:true, opacity:0.9 });
    const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.11,0.11,22,6), rodMat);
    const a=(i/12)*Math.PI*2;
    rod.position.x=Math.cos(a)*3.0; rod.position.z=Math.sin(a)*3.0;
    rod.userData={idx:i}; G.add(rod); rods.push(rod);
  }

  // Camera buttons
  function setCam(mode) {
    activeCam = mode==='persp' ? perspCam : orthoCam;
    const pe=document.getElementById('btn-persp'), oe=document.getElementById('btn-ortho');
    const act='tv text-[11px] px-2 py-1 border border-[rgba(0,0,0,.1)] font-bold bg-[#212529] text-[#f4f6f8]';
    const inact='tv text-[11px] px-2 py-1 border border-[rgba(0,0,0,.1)] font-bold bg-[#d1d6dc] text-[#343a40] hover:bg-[#ced4da]';
    if(pe) pe.className=mode==='persp'?act:inact;
    if(oe) oe.className=mode==='ortho'?act:inact;
    dispatch('LOG',{msg:`Digital Twin camera: ${mode.toUpperCase()}`});
  }
  document.getElementById('btn-persp')?.addEventListener('click', ()=>setCam('persp'));
  document.getElementById('btn-ortho')?.addEventListener('click', ()=>setCam('ortho'));

  (function animate() {
    requestAnimationFrame(animate);
    const t = Date.now()*0.001;
    G.rotation.y = t*0.07;

    // Rods follow live sensor
    const rodPos = (S.sensors.ROD_POS?.v ?? 72) / 100;
    rods.forEach(r => {
      r.position.y = Math.sin(t*0.34+r.userData.idx*0.52)*0.65 + (rodPos*6-7.5);
    });

    // Emergency: change wireframe color dynamically
    const coreTemp = S.sensors.CORE_TEMP?.v ?? 1045;
    const danger = Math.max(0, (coreTemp - 1000) / 200); // 0 at 1000°C, 1 at 1200°C
    outerMat.color.setRGB(0.35+danger*0.55, 0.39*(1-danger*0.8), 0.45*(1-danger*0.9));
    outerMat.opacity = 0.5 + danger*0.3;

    renderer.render(scene, activeCam);
  })();

  window.addEventListener('resize', ()=>{
    const w=container.clientWidth, h=container.clientHeight;
    if(!w||!h) return;
    const a=w/h;
    perspCam.aspect=a; perspCam.updateProjectionMatrix();
    orthoCam.left=-d*a; orthoCam.right=d*a; orthoCam.updateProjectionMatrix();
    renderer.setSize(w,h);
  });
}