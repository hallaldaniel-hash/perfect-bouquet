"use client";

import { useEffect, useRef } from "react";

// A light WebGL layer: soft petals drifting upward behind the hero bouquet.
// Three.js is imported lazily inside the effect so it stays out of the initial
// bundle and only loads on the client. Honors reduced-motion, pauses when the
// tab is hidden, caps pixel ratio, and thins out on small screens.
export function PetalField() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const parent = canvas.parentElement;
    if (!parent) return;

    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    let disposed = false;
    let frame = 0;
    let cleanup: (() => void) | undefined;

    (async () => {
      const THREE = await import("three");
      if (disposed) return;

      const renderer = new THREE.WebGLRenderer({
        canvas,
        alpha: true,
        antialias: true,
        powerPreference: "low-power",
      });
      renderer.setClearColor(0x000000, 0);
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));

      const scene = new THREE.Scene();
      const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 10);
      camera.position.z = 5;

      // Soft petal sprite drawn to a canvas — no image asset needed.
      const tex = makePetalTexture(THREE);
      const petalCount = window.innerWidth < 720 ? 22 : 48;

      type Petal = {
        sprite: InstanceType<typeof THREE.Sprite>;
        speed: number;
        sway: number;
        swayPhase: number;
        spin: number;
        nx: number; // normalized horizontal position in [-1, 1]
      };
      const petals: Petal[] = [];
      const tints = [0xf4efe5, 0xe7d3cb, 0xd6aaa0, 0xece2d0];

      for (let i = 0; i < petalCount; i += 1) {
        const material = new THREE.SpriteMaterial({
          map: tex,
          transparent: true,
          opacity: 0.32 + Math.random() * 0.4,
          depthWrite: false,
          color: tints[i % tints.length],
        });
        const sprite = new THREE.Sprite(material);
        const scale = 0.05 + Math.random() * 0.09;
        sprite.scale.set(scale, scale, 1);
        sprite.position.set(0, Math.random() * 2.3 - 1.15, Math.random() * -2);
        sprite.material.rotation = Math.random() * Math.PI * 2;
        scene.add(sprite);
        petals.push({
          sprite,
          speed: 0.06 + Math.random() * 0.12, // world units / second
          sway: 0.04 + Math.random() * 0.08,
          swayPhase: Math.random() * Math.PI * 2,
          spin: (Math.random() - 0.5) * 0.5,
          nx: Math.random() * 2 - 1,
        });
      }

      const resize = () => {
        const w = parent.clientWidth;
        const h = parent.clientHeight;
        if (w === 0 || h === 0) return;
        renderer.setSize(w, h, false);
        const aspect = w / h || 1;
        camera.left = -aspect;
        camera.right = aspect;
        camera.top = 1;
        camera.bottom = -1;
        camera.updateProjectionMatrix();
      };
      resize();
      const ro = new ResizeObserver(resize);
      ro.observe(parent);
      // Layout can settle a beat after mount (fonts, images, mobile browser
      // chrome). Re-measure on the next frame and shortly after, and follow
      // window resizes too, so the drawing buffer never stays stale.
      const rafResize = requestAnimationFrame(resize);
      const lateResize = window.setTimeout(resize, 300);
      window.addEventListener("resize", resize);

      let last = performance.now();
      const render = (now: number) => {
        const dt = Math.min((now - last) / 1000, 0.05);
        last = now;
        const t = now / 1000;
        const aspect = camera.right;
        for (const p of petals) {
          if (!reduceMotion) p.sprite.position.y += p.speed * dt;
          p.sprite.position.x = p.nx * aspect + Math.sin(t * 0.6 + p.swayPhase) * p.sway;
          p.sprite.material.rotation += p.spin * dt;
          if (p.sprite.position.y > 1.15) {
            p.sprite.position.y = -1.15;
            p.nx = Math.random() * 2 - 1;
          }
        }
        renderer.render(scene, camera);
        if (!reduceMotion && !document.hidden) frame = requestAnimationFrame(render);
      };
      frame = requestAnimationFrame(render);

      const onVisibility = () => {
        if (!document.hidden && !reduceMotion && !disposed) {
          cancelAnimationFrame(frame);
          frame = requestAnimationFrame(render);
        }
      };
      document.addEventListener("visibilitychange", onVisibility);

      cleanup = () => {
        cancelAnimationFrame(frame);
        cancelAnimationFrame(rafResize);
        clearTimeout(lateResize);
        window.removeEventListener("resize", resize);
        document.removeEventListener("visibilitychange", onVisibility);
        ro.disconnect();
        petals.forEach((p) => p.sprite.material.dispose());
        tex.dispose();
        renderer.dispose();
      };
    })();

    return () => {
      disposed = true;
      cancelAnimationFrame(frame);
      cleanup?.();
    };
  }, []);

  return <canvas ref={canvasRef} className="petal-field" aria-hidden="true" />;
}

// Draw a soft, translucent petal shape into a canvas for use as a sprite map.
function makePetalTexture(THREE: typeof import("three")) {
  const size = 128;
  const c = document.createElement("canvas");
  c.width = size;
  c.height = size;
  const ctx = c.getContext("2d")!;
  ctx.translate(size / 2, size / 2);
  const grad = ctx.createRadialGradient(0, -10, 4, 0, 0, size / 2);
  grad.addColorStop(0, "rgba(255,255,255,0.95)");
  grad.addColorStop(0.5, "rgba(255,255,255,0.55)");
  grad.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = grad;
  ctx.beginPath();
  // teardrop / petal silhouette
  ctx.moveTo(0, -size / 2 + 8);
  ctx.bezierCurveTo(size / 2.6, -size / 4, size / 3.2, size / 3, 0, size / 2 - 10);
  ctx.bezierCurveTo(-size / 3.2, size / 3, -size / 2.6, -size / 4, 0, -size / 2 + 8);
  ctx.fill();
  const texture = new THREE.CanvasTexture(c);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}
