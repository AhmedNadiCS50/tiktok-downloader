/**
 * Ahmed Nadi Media Downloader — 3D Background Engine v6.0.0
 * Bioluminescent Jellyfish, Galaxy Star Field, Mouse/Touch Parallax & Scroll Depth
 * Optimized for Mobile, Tablets & Rock-Solid 60Hz Performance
 */

(function init3DBackground() {
  const canvas = document.getElementById('bg3dCanvas');
  if (!canvas || typeof THREE === 'undefined') return;

  // ── Device & Performance Detection ──────────────────────────────────────────
  const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) || window.innerWidth <= 768;
  const isTablet = !isMobile && (window.innerWidth <= 1024 || /iPad|Tablet/i.test(navigator.userAgent));

  // ── Scene Setup ──────────────────────────────────────────────────────────────
  const scene  = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 1000);
  camera.position.set(0, 0, 28);

  const renderer = new THREE.WebGLRenderer({
    canvas,
    alpha: true,
    antialias: !isMobile, // Disable MSAA on mobile to guarantee 60fps
    powerPreference: 'high-performance',
    precision: isMobile ? 'mediump' : 'highp'
  });
  renderer.setSize(window.innerWidth, window.innerHeight);

  // Dynamic DPR: Cap at 1.0 for mobile and 1.25 for tablet to avoid GPU fillrate bottleneck
  const maxDPR = isMobile ? 1.0 : (isTablet ? 1.25 : Math.min(window.devicePixelRatio || 1, 1.75));
  renderer.setPixelRatio(maxDPR);

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
      const theta = Math.random() * Math.PI * 2;
      const phi   = Math.acos(2 * Math.random() - 1);
      const r     = spread * (0.4 + Math.random() * 0.6);
      positions[i * 3]     = r * Math.sin(phi) * Math.cos(theta);
      positions[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta) * 0.35;
      positions[i * 3 + 2] = r * Math.cos(phi) - 20;
    }
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));

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
      size: isMobile ? size * 0.9 : size,
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

  // Scaled star count for 60fps on mobile
  const farStars  = createStarField(isMobile ? 450 : 1200, 80, 0.35, '200,220,255', 'far');
  const nearStars = createStarField(isMobile ? 150 : 400,  45, 0.7,  '100,240,254', 'near');
  const pinkStars = createStarField(isMobile ? 80  : 200,  50, 0.5,  '254,100,180', 'mid');

  // ── Jellyfish Factory ─────────────────────────────────────────────────────────
  function makeJellyfish(config) {
    const group = new THREE.Group();

    // Bell dome using LatheGeometry (fewer segments on mobile for performance)
    const latheSegments = isMobile ? 16 : 24;
    const bellPoints = [];
    for (let i = 0; i <= 16; i++) {
      const t = (i / 16) * Math.PI * 0.6;
      bellPoints.push(new THREE.Vector2(
        Math.sin(t) * config.bellRadius,
        -Math.cos(t) * config.bellHeight
      ));
    }
    bellPoints.push(new THREE.Vector2(config.bellRadius * 1.05, -config.bellHeight * 0.1));
    bellPoints.push(new THREE.Vector2(config.bellRadius * 0.85, config.bellHeight * 0.05));

    const bellGeo = new THREE.LatheGeometry(bellPoints, latheSegments);
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

    // Tentacles — Zero garbage collection allocations on animation
    const tentacleCount = isMobile ? 6 : (10 + Math.floor(Math.random() * 4));
    const segs = isMobile ? 8 : 12;

    for (let i = 0; i < tentacleCount; i++) {
      const angle = (i / tentacleCount) * Math.PI * 2;
      const radius = config.bellRadius * (0.5 + Math.random() * 0.5);
      const length = config.bellHeight * (2.5 + Math.random() * 2.5);
      const posArray = new Float32Array((segs + 1) * 3);

      for (let j = 0; j <= segs; j++) {
        const pct = j / segs;
        const sway = Math.sin(pct * Math.PI) * config.bellRadius * 0.3;
        const idx = j * 3;
        posArray[idx]     = Math.cos(angle) * radius + sway * Math.cos(angle + 1);
        posArray[idx + 1] = -config.bellHeight * 0.9 - pct * length;
        posArray[idx + 2] = Math.sin(angle) * radius + sway * Math.sin(angle + 1);
      }

      const tentGeo = new THREE.BufferGeometry();
      tentGeo.setAttribute('position', new THREE.BufferAttribute(posArray, 3));

      const tentMat = new THREE.LineBasicMaterial({
        color: config.tentacleColor,
        transparent: true,
        opacity: 0.4,
        blending: THREE.AdditiveBlending,
      });

      const tentacle = new THREE.Line(tentGeo, tentMat);
      // Keep clone of initial positions to mutate in-place without allocating objects
      tentacle.userData = {
        origPositions: new Float32Array(posArray),
        ptCount: segs + 1,
        index: i,
      };
      group.add(tentacle);
    }

    // Inner glow core
    const coreGeo = new THREE.SphereGeometry(config.bellRadius * 0.4, isMobile ? 10 : 16, isMobile ? 10 : 16);
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

  // On mobile: render 3 jellyfish (front/center focus) to maximize 60Hz smoothness
  // On desktop/tablet: render all 6 jellyfish
  const jellyfishDefs = [
    { x: 9,   y: 3,  z: -2, bellRadius: 2.8, bellHeight: 2.0, color: 0x00F2FE, emissive: 0x002a38, tentacleColor: 0x4FACFE },
    { x: -9,  y: -2, z: -4, bellRadius: 2.2, bellHeight: 1.6, color: 0xFE2C55, emissive: 0x380010, tentacleColor: 0xFF7BAC },
    { x: 3,   y: 8,  z: -8, bellRadius: 1.5, bellHeight: 1.1, color: 0x7B2FBE, emissive: 0x1a003a, tentacleColor: 0xBB66FF },
    { x: -5,  y: -8, z: -6, bellRadius: 1.8, bellHeight: 1.3, color: 0x00F2FE, emissive: 0x001820, tentacleColor: 0x00F2FE },
    { x: 14,  y: -5, z:-10, bellRadius: 1.2, bellHeight: 0.9, color: 0xFE2C55, emissive: 0x200005, tentacleColor: 0xFF4488 },
    { x:-14,  y: 6,  z:-12, bellRadius: 1.0, bellHeight: 0.8, color: 0x00CCFF, emissive: 0x001520, tentacleColor: 0x66EEFF },
  ];

  const activeDefs = isMobile ? jellyfishDefs.slice(0, 3) : jellyfishDefs;
  const jellyfish = activeDefs.map(def => makeJellyfish(def));

  // ── Bioluminescent Spore Particles ───────────────────────────────────────────
  const sporeCount = isMobile ? 60 : 200;
  const sporeGeo = new THREE.BufferGeometry();
  const sporePos = new Float32Array(sporeCount * 3);
  for (let i = 0; i < sporeCount; i++) {
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
    size: isMobile ? 0.45 : 0.6,
    map: new THREE.CanvasTexture(sporeCanvas),
    transparent: true,
    opacity: 0.55,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  scene.add(new THREE.Points(sporeGeo, sporeMat));

  // ── Mouse / Touch Parallax (Passive listeners) ────────────────────────────────
  let mouseX = 0, mouseY = 0, targetX = 0, targetY = 0;
  let halfW = window.innerWidth / 2, halfH = window.innerHeight / 2;

  window.addEventListener('mousemove', e => {
    targetX = (e.clientX - halfW) * 0.008;
    targetY = (e.clientY - halfH) * 0.008;
  }, { passive: true });

  window.addEventListener('touchmove', e => {
    if (e.touches && e.touches[0]) {
      targetX = (e.touches[0].clientX - halfW) * 0.006;
      targetY = (e.touches[0].clientY - halfH) * 0.006;
    }
  }, { passive: true });

  // ── Scroll Parallax ───────────────────────────────────────────────────────────
  let scrollY = 0, targetScrollY = 0;
  window.addEventListener('scroll', () => {
    targetScrollY = window.scrollY;
  }, { passive: true });

  // ── Resize ───────────────────────────────────────────────────────────────────
  window.addEventListener('resize', () => {
    halfW = window.innerWidth / 2;
    halfH = window.innerHeight / 2;
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  }, { passive: true });

  // ── Morph Trigger ─────────────────────────────────────────────────────────────
  let morphActive = false, morphProgress = 0;
  window._triggerMorph = function () {
    morphActive = true;
    morphProgress = 0;
  };

  // ── Animation Loop (60Hz Rock-Solid, Zero GC) ──────────────────────────────────
  const clock = new THREE.Clock();
  let animId = null;
  let frameCounter = 0;

  function animateJellyfish(jelly, t) {
    const ud = jelly.userData;

    // Float up and down
    jelly.position.y = ud.baseY + Math.sin(t * ud.floatSpeed + ud.floatPhase) * ud.floatAmplitude;
    jelly.rotation.y += ud.rotSpeed;

    // Bell pulse
    const pulse = 1 + Math.sin(t * 1.5 + ud.pulsePhase) * 0.08;
    jelly.scale.set(pulse, 1 + Math.sin(t * 1.5 + ud.pulsePhase) * 0.04, pulse);

    // On mobile: update tentacles every 2 frames for extra battery & 60Hz headroom
    if (isMobile && (frameCounter % 2 !== 0)) return;

    // In-place mutate tentacle vertices (ZERO memory allocations per frame!)
    const children = jelly.children;
    const clen = children.length;
    for (let c = 0; c < clen; c++) {
      const child = children[c];
      if (!child.isLine) continue;
      const od = child.userData;
      if (!od.origPositions) continue;

      const pos = child.geometry.attributes.position.array;
      const orig = od.origPositions;
      const ptCount = od.ptCount;

      for (let j = 0; j < ptCount; j++) {
        const pct = j / (ptCount - 1);
        const swayAmt = pct * pct * 0.5;
        const idx = j * 3;
        pos[idx]     = orig[idx]     + Math.sin(t * 1.2 + od.index * 0.8 + j * 0.3) * swayAmt;
        pos[idx + 1] = orig[idx + 1];
        pos[idx + 2] = orig[idx + 2] + Math.cos(t * 1.0 + od.index * 0.6 + j * 0.2) * swayAmt;
      }
      child.geometry.attributes.position.needsUpdate = true;
    }
  }

  function animate() {
    animId = requestAnimationFrame(animate);
    frameCounter++;
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
    for (let i = 0; i < jellyfish.length; i++) {
      animateJellyfish(jellyfish[i], t);
    }

    // Rotate star fields
    farStars.rotation.y  = t * 0.008;
    farStars.rotation.x  = Math.sin(t * 0.003) * 0.05;
    nearStars.rotation.y = t * 0.015 + mouseX * 0.05;
    pinkStars.rotation.y = t * 0.012 - mouseX * 0.03;

    // Drift lights
    cyanLight.position.x   = Math.sin(t * 0.6) * 14 + mouseX * 4;
    cyanLight.position.y   = Math.cos(t * 0.5) * 12;
    pinkLight.position.x   = Math.cos(t * 0.55) * 14 - mouseX * 4;
    pinkLight.position.y   = Math.sin(t * 0.7) * 12;
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

  // Start animation loop
  animId = requestAnimationFrame(animate);

  // Tab Visibility management: Pause rendering when user minimizes or switches tab to save mobile battery
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      if (animId) cancelAnimationFrame(animId);
      animId = null;
    } else {
      if (!animId) {
        clock.getDelta(); // reset clock delta
        animId = requestAnimationFrame(animate);
      }
    }
  });

})();
