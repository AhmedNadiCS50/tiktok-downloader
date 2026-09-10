/**
 * Ahmed Nadi Media Downloader — 3D Background Engine v6.0.0
 * Bioluminescent Jellyfish, Galaxy Star Field, Mouse Parallax & Scroll Depth
 */

(function init3DBackground() {
  const canvas = document.getElementById('bg3dCanvas');
  if (!canvas || typeof THREE === 'undefined') return;

  // ── Scene Setup ──────────────────────────────────────────────────────────────
  const scene    = new THREE.Scene();
  const camera   = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 1000);
  camera.position.set(0, 0, 28);

  const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, powerPreference: 'high-performance' });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

  // ── Lighting ─────────────────────────────────────────────────────────────────
  scene.add(new THREE.AmbientLight(0x0a0d20, 3));

  const cyanLight = new THREE.PointLight(0x00F2FE, 4, 50);
  cyanLight.position.set(-12, 10, 8);
  scene.add(cyanLight);

  const pinkLight = new THREE.PointLight(0xFE2C55, 4, 50);
  pinkLight.position.set(12, -8, 8);
  scene.add(pinkLight);

  const purpleLight = new THREE.PointLight(0x7B2FBE, 2, 40);
  purpleLight.position.set(0, 0, -10);
  scene.add(purpleLight);

  // ── Galaxy Star Field ────────────────────────────────────────────────────────
  function createStarField(count, spread, size, color, layer) {
    const geo = new THREE.BufferGeometry();
    const positions = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      // Spherical distribution for realistic galaxy look
      const theta = Math.random() * Math.PI * 2;
      const phi   = Math.acos(2 * Math.random() - 1);
      const r     = spread * (0.4 + Math.random() * 0.6);
      positions[i * 3]     = r * Math.sin(phi) * Math.cos(theta);
      positions[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta) * 0.35; // Flatten into disk
      positions[i * 3 + 2] = r * Math.cos(phi) - 20; // Push back in Z
    }
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));

    // Soft circular star texture
    const starCanvas = document.createElement('canvas');
    starCanvas.width = starCanvas.height = 32;
    const ctx = starCanvas.getContext('2d');
    const g = ctx.createRadialGradient(16, 16, 0, 16, 16, 16);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.3, `rgba(${color},0.8)`);
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(16, 16, 16, 0, Math.PI * 2); ctx.fill();

    const mat = new THREE.PointsMaterial({
      size,
      map: new THREE.CanvasTexture(starCanvas),
      transparent: true,
      opacity: layer === 'far' ? 0.5 : 0.8,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });

    const stars = new THREE.Points(geo, mat);
    stars.userData = { layer, baseRotY: 0 };
    scene.add(stars);
    return stars;
  }

  const farStars  = createStarField(1200, 80, 0.35, '200,220,255', 'far');
  const nearStars = createStarField(400,  45, 0.7,  '100,240,254', 'near');
  const pinkStars = createStarField(200,  50, 0.5,  '254,100,180', 'mid');

  // ── Jellyfish Factory ─────────────────────────────────────────────────────────
  function makeJellyfish(config) {
    const group = new THREE.Group();

    // Bell dome using LatheGeometry
    const bellPoints = [];
    for (let i = 0; i <= 20; i++) {
      const t = (i / 20) * Math.PI * 0.6; // Half-dome arc
      bellPoints.push(new THREE.Vector2(
        Math.sin(t) * config.bellRadius,
        -Math.cos(t) * config.bellHeight
      ));
    }
    // Rim curl
    bellPoints.push(new THREE.Vector2(config.bellRadius * 1.05, -config.bellHeight * 0.1));
    bellPoints.push(new THREE.Vector2(config.bellRadius * 0.85, config.bellHeight * 0.05));

    const bellGeo = new THREE.LatheGeometry(bellPoints, 24);
    const bellMat = new THREE.MeshPhongMaterial({
      color: config.color,
      emissive: config.emissive,
      transparent: true,
      opacity: 0.25,
      side: THREE.DoubleSide,
      wireframe: false,
    });
    const bell = new THREE.Mesh(bellGeo, bellMat);
    group.add(bell);

    // Bell wireframe overlay
    const wireMat = new THREE.MeshBasicMaterial({
      color: config.color,
      transparent: true,
      opacity: 0.35,
      wireframe: true,
      blending: THREE.AdditiveBlending,
    });
    const wire = new THREE.Mesh(bellGeo.clone(), wireMat);
    wire.scale.set(1.01, 1.01, 1.01);
    group.add(wire);

    // Tentacles
    const tentacleCount = 10 + Math.floor(Math.random() * 6);
    for (let i = 0; i < tentacleCount; i++) {
      const angle = (i / tentacleCount) * Math.PI * 2;
      const radius = config.bellRadius * (0.5 + Math.random() * 0.5);
      const length = config.bellHeight * (2.5 + Math.random() * 2.5);
      const segs = 12;
      const tentPts = [];
      for (let j = 0; j <= segs; j++) {
        const pct = j / segs;
        const sway = Math.sin(pct * Math.PI) * config.bellRadius * 0.3;
        tentPts.push(new THREE.Vector3(
          Math.cos(angle) * radius + sway * Math.cos(angle + 1),
          -config.bellHeight * 0.9 - pct * length,
          Math.sin(angle) * radius + sway * Math.sin(angle + 1)
        ));
      }
      const tentGeo = new THREE.BufferGeometry().setFromPoints(tentPts);
      const tentMat = new THREE.LineBasicMaterial({
        color: config.tentacleColor,
        transparent: true,
        opacity: 0.4,
        blending: THREE.AdditiveBlending,
      });
      const tentacle = new THREE.Line(tentGeo, tentMat);
      tentacle.userData = { originalPts: tentPts.map(p => p.clone()), index: i };
      group.add(tentacle);
    }

    // Inner glow core
    const coreGeo = new THREE.SphereGeometry(config.bellRadius * 0.4, 16, 16);
    const coreMat = new THREE.MeshBasicMaterial({
      color: config.color,
      transparent: true,
      opacity: 0.15,
      blending: THREE.AdditiveBlending,
    });
    group.add(new THREE.Mesh(coreGeo, coreMat));

    group.position.set(config.x, config.y, config.z);
    group.userData = {
      baseY: config.y,
      floatSpeed: 0.3 + Math.random() * 0.3,
      floatAmplitude: 1.5 + Math.random() * 1.5,
      floatPhase: Math.random() * Math.PI * 2,
      pulsePhase: Math.random() * Math.PI * 2,
      rotSpeed: (Math.random() - 0.5) * 0.008,
      config,
    };

    scene.add(group);
    return group;
  }

  const jellyfish = [
    makeJellyfish({ x: 9,  y: 3,  z: -2, bellRadius: 2.8, bellHeight: 2.0, color: 0x00F2FE, emissive: 0x002a38, tentacleColor: 0x4FACFE }),
    makeJellyfish({ x: -9, y: -2, z: -4, bellRadius: 2.2, bellHeight: 1.6, color: 0xFE2C55, emissive: 0x380010, tentacleColor: 0xFF7BAC }),
    makeJellyfish({ x: 3,  y: 8,  z: -8, bellRadius: 1.5, bellHeight: 1.1, color: 0x7B2FBE, emissive: 0x1a003a, tentacleColor: 0xBB66FF }),
    makeJellyfish({ x: -5, y: -8, z: -6, bellRadius: 1.8, bellHeight: 1.3, color: 0x00F2FE, emissive: 0x001820, tentacleColor: 0x00F2FE }),
    makeJellyfish({ x: 14, y: -5, z:-10, bellRadius: 1.2, bellHeight: 0.9, color: 0xFE2C55, emissive: 0x200005, tentacleColor: 0xFF4488 }),
    makeJellyfish({ x:-14, y: 6,  z:-12, bellRadius: 1.0, bellHeight: 0.8, color: 0x00CCFF, emissive: 0x001520, tentacleColor: 0x66EEFF }),
  ];

  // ── Bioluminescent Spore Particles ───────────────────────────────────────────
  const sporeGeo = new THREE.BufferGeometry();
  const sporePos = new Float32Array(250 * 3);
  for (let i = 0; i < 250; i++) {
    sporePos[i*3]   = (Math.random() - 0.5) * 60;
    sporePos[i*3+1] = (Math.random() - 0.5) * 50;
    sporePos[i*3+2] = (Math.random() - 0.5) * 30;
  }
  sporeGeo.setAttribute('position', new THREE.BufferAttribute(sporePos, 3));

  const sporeCanvas = document.createElement('canvas');
  sporeCanvas.width = sporeCanvas.height = 32;
  const sCtx = sporeCanvas.getContext('2d');
  const sg = sCtx.createRadialGradient(16,16,0,16,16,16);
  sg.addColorStop(0, 'rgba(255,255,255,1)');
  sg.addColorStop(0.5, 'rgba(0,242,254,0.5)');
  sg.addColorStop(1, 'rgba(0,0,0,0)');
  sCtx.fillStyle = sg; sCtx.beginPath(); sCtx.arc(16,16,16,0,Math.PI*2); sCtx.fill();

  const sporeMat = new THREE.PointsMaterial({
    size: 0.6, map: new THREE.CanvasTexture(sporeCanvas),
    transparent: true, opacity: 0.55,
    blending: THREE.AdditiveBlending, depthWrite: false,
  });
  scene.add(new THREE.Points(sporeGeo, sporeMat));

  // ── Mouse Parallax ───────────────────────────────────────────────────────────
  let mouseX = 0, mouseY = 0, targetX = 0, targetY = 0;
  const halfW = window.innerWidth / 2, halfH = window.innerHeight / 2;

  window.addEventListener('mousemove', e => {
    targetX = (e.clientX - halfW) * 0.008;
    targetY = (e.clientY - halfH) * 0.008;
  });
  window.addEventListener('touchmove', e => {
    if (e.touches[0]) {
      targetX = (e.touches[0].clientX - halfW) * 0.008;
      targetY = (e.touches[0].clientY - halfH) * 0.008;
    }
  }, { passive: true });

  // ── Scroll Parallax ───────────────────────────────────────────────────────────
  let scrollY = 0, targetScrollY = 0;
  window.addEventListener('scroll', () => { targetScrollY = window.scrollY; });

  // ── Resize ───────────────────────────────────────────────────────────────────
  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });

  // ── Morph Trigger (called by app.js on analyze success) ────────────────────
  let morphActive = false, morphProgress = 0;
  window._triggerMorph = function () {
    morphActive = true;
    morphProgress = 0;
  };

  // ── Animation Loop ───────────────────────────────────────────────────────────
  const clock = new THREE.Clock();

  function animateJellyfish(jelly, t) {
    const ud = jelly.userData;

    // Float up and down
    jelly.position.y = ud.baseY + Math.sin(t * ud.floatSpeed + ud.floatPhase) * ud.floatAmplitude;
    jelly.rotation.y += ud.rotSpeed;

    // Bell pulse (breathe in/out)
    const pulse = 1 + Math.sin(t * 1.5 + ud.pulsePhase) * 0.08;
    jelly.scale.set(pulse, 1 + Math.sin(t * 1.5 + ud.pulsePhase) * 0.04, pulse);

    // Animate tentacles sway
    jelly.children.forEach(child => {
      if (!child.isLine) return;
      const od = child.userData;
      if (!od.originalPts) return;
      const newPts = od.originalPts.map((p, j) => {
        const pct = j / (od.originalPts.length - 1);
        const swayAmt = pct * pct * 0.5;
        return new THREE.Vector3(
          p.x + Math.sin(t * 1.2 + od.index * 0.8 + j * 0.3) * swayAmt,
          p.y,
          p.z + Math.cos(t * 1.0 + od.index * 0.6 + j * 0.2) * swayAmt
        );
      });
      child.geometry.setFromPoints(newPts);
    });
  }

  function animate() {
    requestAnimationFrame(animate);
    const t = clock.getElapsedTime();

    // Smooth mouse lerp
    mouseX += (targetX - mouseX) * 0.04;
    mouseY += (targetY - mouseY) * 0.04;

    // Smooth scroll lerp
    scrollY += (targetScrollY - scrollY) * 0.06;
    const scrollOffset = scrollY * 0.006;

    // Camera parallax
    camera.position.x = mouseX * 2.5;
    camera.position.y = -mouseY * 2.5 - scrollOffset * 2;
    camera.position.z = 28 - scrollOffset;
    camera.lookAt(0, -scrollOffset * 0.5, 0);

    // Animate jellyfish
    jellyfish.forEach(j => animateJellyfish(j, t));

    // Rotate star fields at different speeds (parallax depth)
    farStars.rotation.y  = t * 0.008;
    farStars.rotation.x  = Math.sin(t * 0.003) * 0.05;
    nearStars.rotation.y = t * 0.015 + mouseX * 0.05;
    pinkStars.rotation.y = t * 0.012 - mouseX * 0.03;

    // Drift lights
    cyanLight.position.x  = Math.sin(t * 0.6) * 14 + mouseX * 4;
    cyanLight.position.y  = Math.cos(t * 0.5) * 12;
    pinkLight.position.x  = Math.cos(t * 0.55) * 14 - mouseX * 4;
    pinkLight.position.y  = Math.sin(t * 0.7) * 12;
    purpleLight.position.x = Math.sin(t * 0.3) * 8;
    purpleLight.position.y = Math.cos(t * 0.25) * 8;

    // Morph transition — camera pulse on analyze success
    if (morphActive) {
      morphProgress += 0.04;
      const mp = morphProgress;
      if (mp < 1) {
        const pulse = Math.sin(mp * Math.PI) * 3;
        camera.position.z += pulse * 0.3;
        cyanLight.intensity = 4 + Math.sin(mp * Math.PI) * 6;
        pinkLight.intensity = 4 + Math.sin(mp * Math.PI) * 6;
      } else {
        morphActive = false;
        cyanLight.intensity = 4;
        pinkLight.intensity = 4;
      }
    }

    renderer.render(scene, camera);
  }

  animate();
})();
