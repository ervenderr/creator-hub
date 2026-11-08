// WebGL hero: a torus knot, a wireframe icosahedron and a point field.
// Skipped for reduced-motion, narrow screens and no-WebGL (the CSS panes stay as the fallback);
// pauses when off-screen or the tab is hidden.
const scene = document.querySelector(".scene");
const hero = document.querySelector(".hero");
const ACCENT = 0xf26b1d;

if (scene && !matchMedia("(prefers-reduced-motion: reduce)").matches && innerWidth > 700) {
  init().catch((err) => console.error("WebGL scene failed", err));
}

async function init() {
  const THREE = await import("./vendor/three.module.min.js");
  const canvas = document.createElement("canvas");
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  } catch (err) {
    console.warn("WebGL unavailable, keeping CSS fallback", err);
    return;
  }
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  scene.append(canvas);
  scene.classList.add("gl");

  const world = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 50);
  camera.position.z = 7;

  world.add(new THREE.AmbientLight(0xffffff, 0.7));
  const key = new THREE.DirectionalLight(0xffffff, 2);
  key.position.set(3, 4, 5);
  world.add(key);

  const knot = new THREE.Mesh(
    new THREE.TorusKnotGeometry(1.1, 0.34, 160, 24),
    new THREE.MeshStandardMaterial({ color: ACCENT, metalness: 0.55, roughness: 0.25 })
  );
  knot.scale.setScalar(0.85);
  knot.position.set(0, -0.4, 0);
  world.add(knot);

  const ico = new THREE.Mesh(
    new THREE.IcosahedronGeometry(0.55, 0),
    new THREE.MeshBasicMaterial({ color: ACCENT, wireframe: true })
  );
  ico.position.set(0, -1.2, 0);
  world.add(ico);

  const N = 220, pos = new Float32Array(N * 3);
  for (let i = 0; i < N; i++) {
    pos[i * 3] = (Math.random() - 0.5) * 16;
    pos[i * 3 + 1] = (Math.random() - 0.5) * 8;
    pos[i * 3 + 2] = (Math.random() - 0.5) * 6;
  }
  const dots = new THREE.BufferGeometry();
  dots.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  const color = getComputedStyle(document.documentElement).getPropertyValue("--mute").trim() || "#888";
  const points = new THREE.Points(dots, new THREE.PointsMaterial({ color, size: 0.035 }));
  world.add(points);

  const resize = () => {
    const { clientWidth: w, clientHeight: h } = scene;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    // keep the shapes in the side margins, clear of the centred text, at any width
    const halfWidth = Math.tan((camera.fov / 2) * (Math.PI / 180)) * camera.position.z * camera.aspect;
    knot.position.x = halfWidth * 0.72;
    ico.position.x = -halfWidth * 0.74;
  };
  new ResizeObserver(resize).observe(scene);
  resize();

  const target = { x: 0, y: 0 }, cur = { x: 0, y: 0 };
  hero.addEventListener("pointermove", (e) => {
    const r = hero.getBoundingClientRect();
    target.x = (e.clientX - r.left) / r.width - 0.5;
    target.y = (e.clientY - r.top) / r.height - 0.5;
  });
  hero.addEventListener("pointerleave", () => { target.x = 0; target.y = 0; });

  let visible = true, raf = 0;
  const tick = (t) => {
    cur.x += (target.x - cur.x) * 0.06;
    cur.y += (target.y - cur.y) * 0.06;
    knot.rotation.set(t * 0.0003 + cur.y * 1.2, t * 0.0005 + cur.x * 1.6, 0);
    ico.rotation.set(t * 0.0006, t * 0.0004, 0);
    points.rotation.y = t * 0.00003 + cur.x * 0.3;
    camera.position.x = cur.x * 0.6;
    camera.position.y = -cur.y * 0.4;
    camera.lookAt(0, 0, 0);
    renderer.render(world, camera);
    raf = visible && !document.hidden ? requestAnimationFrame(tick) : 0;
  };
  const wake = () => { if (!raf && visible && !document.hidden) raf = requestAnimationFrame(tick); };
  new IntersectionObserver(([en]) => { visible = en.isIntersecting; wake(); }).observe(hero);
  document.addEventListener("visibilitychange", wake);
  wake();
}
