'use strict';
// Standalone Digital Twin viewport for SCR-11 / CMP-73.
// Same visual language as the monolith's three-twin.js (wireframe LFR vessel,
// manifold rings, control rods) but self-contained: no S model, no dispatch.
// Falls back to the static stub when THREE/WebGL is unavailable.

export function initDemoTwin(container) {
  if (!window.THREE) return false;
  try {
    const THREE = window.THREE;
    container.style.cssText += ';position:relative;background:#10161f;border-radius:6px;aspect-ratio:16/9;overflow:hidden';

    const scene = new THREE.Scene();
    const w = container.clientWidth || 640, hh = container.clientHeight || 360;
    const cam = new THREE.PerspectiveCamera(40, w / hh, 0.1, 1000);
    cam.position.set(0, 16, 32);
    cam.lookAt(0, 0, 0);

    const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
    renderer.setClearColor(0, 0);
    renderer.setSize(w, hh);
    renderer.setPixelRatio(window.devicePixelRatio);
    container.appendChild(renderer.domElement);

    const G = new THREE.Group();
    scene.add(G);

    // vessel
    G.add(new THREE.Mesh(
      new THREE.CylinderGeometry(4.1, 4.1, 18, 48),
      new THREE.MeshBasicMaterial({ color: 0x2a3d52, transparent: true, opacity: 0.25 })));
    G.add(new THREE.Mesh(
      new THREE.CylinderGeometry(5.4, 5.4, 20, 24, 6),
      new THREE.MeshBasicMaterial({ color: 0x5a7390, wireframe: true, transparent: true, opacity: 0.5 })));

    // manifold rings
    for (let i = 0; i < 5; i++) {
      const ring = new THREE.Mesh(
        new THREE.TorusGeometry(7.0, 0.055, 12, 72),
        new THREE.MeshBasicMaterial({ color: 0x7a8590, transparent: true, opacity: 0.38 }));
      ring.rotation.x = Math.PI / 2;
      ring.position.y = -9 + i * 4.5;
      G.add(ring);
    }

    // control rods — green = misurato (provenance semantics)
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * Math.PI * 2;
      const rod = new THREE.Mesh(
        new THREE.CylinderGeometry(0.28, 0.28, 10, 10),
        new THREE.MeshBasicMaterial({ color: i === 4 ? 0xe8710a : 0x1f9d55 })); // one rod degraded
      rod.position.set(Math.cos(a) * 2.4, 3, Math.sin(a) * 2.4);
      G.add(rod);
    }

    let raf;
    (function animate() {
      raf = requestAnimationFrame(animate);
      G.rotation.y += 0.004;
      renderer.render(scene, cam);
    })();

    // stop the loop when the card leaves the DOM (role/route changes re-render)
    const obs = new MutationObserver(() => {
      if (!document.body.contains(container)) {
        cancelAnimationFrame(raf);
        renderer.dispose();
        obs.disconnect();
      }
    });
    obs.observe(document.body, { childList: true, subtree: true });

    const hud = document.createElement('div');
    hud.style.cssText = 'position:absolute;left:10px;top:8px;font:600 10px var(--mono);color:#9fe3b5';
    hud.textContent = 'TWIN SYNC ▸ LIVE · Δ reale/simulato 0.6 %';
    container.appendChild(hud);
    return true;
  } catch (_e) {
    return false;
  }
}
