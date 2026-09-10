/**
 * TokFetch 3D Background Engine
 * Interactive bioluminescent 3D living creatures and particle field using Three.js
 */

(function init3DBackground() {
  const canvas = document.getElementById('bg3dCanvas');
  if (!canvas) return;

  // Check if Three.js is loaded
  if (typeof THREE === 'undefined') {
    console.warn('Three.js not loaded. 3D background disabled.');
    return;
  }

  // Scene setup
  const scene = new THREE.Scene();
  
  // Camera setup
  const camera = new THREE.PerspectiveCamera(
    60,
    window.innerWidth / window.innerHeight,
    0.1,
    1000
  );
  camera.position.z = 25;

  // Renderer setup
  const renderer = new THREE.WebGLRenderer({
    canvas: canvas,
    alpha: true,
    antialias: true,
    powerPreference: 'high-performance'
  });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

  // Lighting
  const ambientLight = new THREE.AmbientLight(0x0a0d14, 2);
  scene.add(ambientLight);

  // Cyan Point Light
  const cyanLight = new THREE.PointLight(0x00F2FE, 3, 40);
  cyanLight.position.set(-10, 10, 10);
  scene.add(cyanLight);

  // Pink Point Light
  const pinkLight = new THREE.PointLight(0xFE2C55, 3, 40);
  pinkLight.position.set(10, -10, 10);
  scene.add(pinkLight);

  // --------------------------------------------------------------------------
  // 1. Create Main Bioluminescent Organism (Morphing TorusKnot Creature)
  // --------------------------------------------------------------------------
  const mainGeo = new THREE.TorusKnotGeometry(3.5, 1.2, 128, 32, 2, 3);
  
  // Store original positions for procedural wave deformation
  const posAttr = mainGeo.attributes.position;
  const originalPositions = new Float32Array(posAttr.array.length);
  originalPositions.set(posAttr.array);

  // Material: Glowing Wireframe + Glass Effect
  const mainMat = new THREE.MeshPhongMaterial({
    color: 0x00F2FE,
    emissive: 0x052a38,
    wireframe: true,
    transparent: true,
    opacity: 0.45,
    shininess: 100,
    blending: THREE.AdditiveBlending
  });

  const mainCreature = new THREE.Mesh(mainGeo, mainMat);
  mainCreature.position.set(8, 2, 0);
  scene.add(mainCreature);

  // Inner Core Sphere (Heartbeat)
  const coreGeo = new THREE.IcosahedronGeometry(2, 3);
  const coreMat = new THREE.MeshBasicMaterial({
    color: 0xFE2C55,
    wireframe: true,
    transparent: true,
    opacity: 0.35,
    blending: THREE.AdditiveBlending
  });
  const creatureCore = new THREE.Mesh(coreGeo, coreMat);
  mainCreature.add(creatureCore);

  // --------------------------------------------------------------------------
  // 2. Create Floating Satellite Organisms (Mini Jellyfish/Nodes)
  // --------------------------------------------------------------------------
  const satGroup = new THREE.Group();
  scene.add(satGroup);

  const satellites = [];
  const satGeometries = [
    new THREE.IcosahedronGeometry(1.2, 2),
    new THREE.OctahedronGeometry(1.4, 2),
    new THREE.DodecahedronGeometry(1.0, 1)
  ];

  for (let i = 0; i < 6; i++) {
    const geo = satGeometries[i % satGeometries.length];
    const isPink = i % 2 === 0;
    const mat = new THREE.MeshPhongMaterial({
      color: isPink ? 0xFE2C55 : 0x00F2FE,
      wireframe: true,
      transparent: true,
      opacity: 0.35,
      blending: THREE.AdditiveBlending
    });
    const mesh = new THREE.Mesh(geo, mat);

    // Initial random placement
    mesh.position.set(
      (Math.random() - 0.5) * 35,
      (Math.random() - 0.5) * 30,
      (Math.random() - 0.5) * 15 - 5
    );

    mesh.userData = {
      baseY: mesh.position.y,
      speed: 0.008 + Math.random() * 0.012,
      amplitude: 1.5 + Math.random() * 2,
      phase: Math.random() * Math.PI * 2,
      rotSpeedX: (Math.random() - 0.5) * 0.02,
      rotSpeedY: (Math.random() - 0.5) * 0.02
    };

    satGroup.add(mesh);
    satellites.push(mesh);
  }

  // --------------------------------------------------------------------------
  // 3. Bioluminescent Particles Field (Floating Spores)
  // --------------------------------------------------------------------------
  const particleCount = 180;
  const particleGeo = new THREE.BufferGeometry();
  const particlePositions = new Float32Array(particleCount * 3);
  const particleScales = new Float32Array(particleCount);

  for (let i = 0; i < particleCount; i++) {
    particlePositions[i * 3 + 0] = (Math.random() - 0.5) * 60;
    particlePositions[i * 3 + 1] = (Math.random() - 0.5) * 50;
    particlePositions[i * 3 + 2] = (Math.random() - 0.5) * 30;
    particleScales[i] = Math.random() * 2 + 0.5;
  }

  particleGeo.setAttribute('position', new THREE.BufferAttribute(particlePositions, 3));

  // Custom canvas texture for soft circular particles
  const createParticleTexture = () => {
    const pCanvas = document.createElement('canvas');
    pCanvas.width = 64;
    pCanvas.height = 64;
    const ctx = pCanvas.getContext('2d');
    const grad = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
    grad.addColorStop(0, 'rgba(255, 255, 255, 1)');
    grad.addColorStop(0.4, 'rgba(0, 242, 254, 0.6)');
    grad.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(32, 32, 32, 0, Math.PI * 2);
    ctx.fill();
    return new THREE.CanvasTexture(pCanvas);
  };

  const particleMat = new THREE.PointsMaterial({
    size: 0.8,
    map: createParticleTexture(),
    transparent: true,
    opacity: 0.6,
    blending: THREE.AdditiveBlending,
    depthWrite: false
  });

  const particleSystem = new THREE.Points(particleGeo, particleMat);
  scene.add(particleSystem);

  // --------------------------------------------------------------------------
  // Mouse Tracking & Parallax Interactivity
  // --------------------------------------------------------------------------
  let mouseX = 0;
  let mouseY = 0;
  let targetMouseX = 0;
  let targetMouseY = 0;

  const windowHalfX = window.innerWidth / 2;
  const windowHalfY = window.innerHeight / 2;

  window.addEventListener('mousemove', (e) => {
    targetMouseX = (e.clientX - windowHalfX) * 0.01;
    targetMouseY = (e.clientY - windowHalfY) * 0.01;
  });

  // Touch device movement support
  window.addEventListener('touchmove', (e) => {
    if (e.touches.length > 0) {
      targetMouseX = (e.touches[0].clientX - windowHalfX) * 0.01;
      targetMouseY = (e.touches[0].clientY - windowHalfY) * 0.01;
    }
  }, { passive: true });

  // --------------------------------------------------------------------------
  // Resize Handler
  // --------------------------------------------------------------------------
  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });

  // --------------------------------------------------------------------------
  // Render Loop & Organic Animations
  // --------------------------------------------------------------------------
  let clock = new THREE.Clock();

  function animate() {
    requestAnimationFrame(animate);

    const elapsedTime = clock.getElapsedTime();

    // Smooth Lerp Mouse Movement for Parallax
    mouseX += (targetMouseX - mouseX) * 0.05;
    mouseY += (targetMouseY - mouseY) * 0.05;

    camera.position.x = mouseX * 2;
    camera.position.y = -mouseY * 2;
    camera.lookAt(scene.position);

    // 1. Organic Mesh Distortion for Main Creature
    const positions = mainGeo.attributes.position.array;
    for (let i = 0; i < positions.length; i += 3) {
      const ox = originalPositions[i];
      const oy = originalPositions[i + 1];
      const oz = originalPositions[i + 2];

      const wave = Math.sin(elapsedTime * 2 + ox * 0.5 + oy * 0.5) * 0.18;
      positions[i]     = ox + ox * wave;
      positions[i + 1] = oy + oy * wave;
      positions[i + 2] = oz + oz * wave;
    }
    mainGeo.attributes.position.needsUpdate = true;

    // Rotate Main Creature
    mainCreature.rotation.x = elapsedTime * 0.15 + mouseY * 0.5;
    mainCreature.rotation.y = elapsedTime * 0.2 + mouseX * 0.5;

    // Heartbeat Pulse for Inner Core
    const scalePulse = 1 + Math.sin(elapsedTime * 3) * 0.15;
    creatureCore.scale.set(scalePulse, scalePulse, scalePulse);

    // 2. Animate Satellites
    satellites.forEach((sat) => {
      sat.position.y = sat.userData.baseY + Math.sin(elapsedTime * sat.userData.speed * 10 + sat.userData.phase) * sat.userData.amplitude;
      sat.rotation.x += sat.userData.rotSpeedX;
      sat.rotation.y += sat.userData.rotSpeedY;
    });

    // Rotate Satellite Group slowly
    satGroup.rotation.y = elapsedTime * 0.05;

    // 3. Move Particles
    particleSystem.rotation.y = elapsedTime * 0.02;
    particleSystem.rotation.x = Math.sin(elapsedTime * 0.01) * 0.1;

    // Dynamic Lights movement
    cyanLight.position.x = Math.sin(elapsedTime * 0.7) * 15 + mouseX * 5;
    cyanLight.position.y = Math.cos(elapsedTime * 0.5) * 15;

    pinkLight.position.x = Math.cos(elapsedTime * 0.6) * 15 - mouseX * 5;
    pinkLight.position.y = Math.sin(elapsedTime * 0.8) * 15;

    renderer.render(scene, camera);
  }

  animate();
})();
