// @ts-nocheck
"use client";

import React, { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";

if (typeof window !== "undefined") {
  gsap.registerPlugin(ScrollTrigger);
}

export const Component = () => {
  const containerRef = useRef(null);
  const canvasRef = useRef(null);
  const titleRef = useRef(null);
  const subtitleRef = useRef(null);
  const scrollProgressRef = useRef(null);
  const progressFillRef = useRef(null);
  const sectionCounterRef = useRef(null);
  const menuRef = useRef(null);

  const smoothCameraPos = useRef({ x: 0, y: 30, z: 100 });

  const [isReady, setIsReady] = useState(false);
  const totalSections = 2;

  const threeRefs = useRef({
    scene: null,
    camera: null,
    renderer: null,
    composer: null,
    stars: [],
    nebula: null,
    mountains: [],
    animationId: null,
    locations: [],
  });

  useEffect(() => {
    const initThree = () => {
      const { current: refs } = threeRefs;

      refs.scene = new THREE.Scene();
      refs.scene.fog = new THREE.FogExp2(0x000000, 0.00025);

      refs.camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 2000);
      refs.camera.position.z = 100;
      refs.camera.position.y = 20;

      refs.renderer = new THREE.WebGLRenderer({ canvas: canvasRef.current, antialias: true, alpha: true });
      refs.renderer.setSize(window.innerWidth, window.innerHeight);
      // Cap the pixel ratio at 1.5 — 2x on a hi-DPI display doubled the shaded
      // pixels and was a big part of the scroll stutter.
      refs.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
      refs.renderer.toneMapping = THREE.ACESFilmicToneMapping;
      refs.renderer.toneMappingExposure = 0.5;

      refs.composer = new EffectComposer(refs.renderer);
      refs.composer.addPass(new RenderPass(refs.scene, refs.camera));
      const bloomPass = new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), 0.55, 0.4, 0.85);
      refs.composer.addPass(bloomPass);

      createStarField();
      createNebula();
      createMountains();
      createAtmosphere();
      getLocation();
      animate();
      setIsReady(true);
    };

    const createStarField = () => {
      const { current: refs } = threeRefs;
      // Fewer stars + fewer layers (was 5000×3) — the main GPU cost behind the
      // scroll stutter; 2500×2 keeps the field dense but renders smoothly.
      const starCount = 2500;
      for (let i = 0; i < 2; i++) {
        const geometry = new THREE.BufferGeometry();
        const positions = new Float32Array(starCount * 3);
        const colors = new Float32Array(starCount * 3);
        const sizes = new Float32Array(starCount);
        for (let j = 0; j < starCount; j++) {
          const radius = 200 + Math.random() * 800;
          const theta = Math.random() * Math.PI * 2;
          const phi = Math.acos(Math.random() * 2 - 1);
          positions[j * 3] = radius * Math.sin(phi) * Math.cos(theta);
          positions[j * 3 + 1] = radius * Math.sin(phi) * Math.sin(theta);
          positions[j * 3 + 2] = radius * Math.cos(phi);
          const color = new THREE.Color();
          const c = Math.random();
          if (c < 0.7) color.setHSL(0, 0, 0.8 + Math.random() * 0.2);
          else if (c < 0.9) color.setHSL(0.08, 0.5, 0.8);
          else color.setHSL(0.6, 0.5, 0.8);
          colors[j * 3] = color.r;
          colors[j * 3 + 1] = color.g;
          colors[j * 3 + 2] = color.b;
          sizes[j] = Math.random() * 2 + 0.5;
        }
        geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
        geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
        geometry.setAttribute("size", new THREE.BufferAttribute(sizes, 1));
        const material = new THREE.ShaderMaterial({
          uniforms: { time: { value: 0 }, depth: { value: i } },
          vertexShader: `
            attribute float size; attribute vec3 color; varying vec3 vColor; uniform float time; uniform float depth;
            void main() {
              vColor = color; vec3 pos = position;
              float angle = time * 0.05 * (1.0 - depth * 0.3);
              mat2 rot = mat2(cos(angle), -sin(angle), sin(angle), cos(angle));
              pos.xy = rot * pos.xy;
              vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
              gl_PointSize = size * (300.0 / -mvPosition.z);
              gl_Position = projectionMatrix * mvPosition;
            }`,
          fragmentShader: `
            varying vec3 vColor;
            void main() {
              float dist = length(gl_PointCoord - vec2(0.5));
              if (dist > 0.5) discard;
              float opacity = 1.0 - smoothstep(0.0, 0.5, dist);
              gl_FragColor = vec4(vColor, opacity);
            }`,
          transparent: true,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
        });
        const stars = new THREE.Points(geometry, material);
        refs.scene.add(stars);
        refs.stars.push(stars);
      }
    };

    const createNebula = () => {
      const { current: refs } = threeRefs;
      const geometry = new THREE.PlaneGeometry(8000, 4000, 100, 100);
      const material = new THREE.ShaderMaterial({
        uniforms: {
          time: { value: 0 },
          color1: { value: new THREE.Color(0x176579) },
          color2: { value: new THREE.Color(0x27a8c4) },
          opacity: { value: 0.3 },
        },
        vertexShader: `
          varying vec2 vUv; varying float vElevation; uniform float time;
          void main() {
            vUv = uv; vec3 pos = position;
            float elevation = sin(pos.x * 0.01 + time) * cos(pos.y * 0.01 + time) * 20.0;
            pos.z += elevation; vElevation = elevation;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
          }`,
        fragmentShader: `
          uniform vec3 color1; uniform vec3 color2; uniform float opacity; uniform float time;
          varying vec2 vUv; varying float vElevation;
          void main() {
            float mixFactor = sin(vUv.x * 10.0 + time) * cos(vUv.y * 10.0 + time);
            vec3 color = mix(color1, color2, mixFactor * 0.5 + 0.5);
            float alpha = opacity * (1.0 - length(vUv - 0.5) * 2.0);
            alpha *= 1.0 + vElevation * 0.01;
            gl_FragColor = vec4(color, alpha);
          }`,
        transparent: true,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide,
        depthWrite: false,
      });
      const nebula = new THREE.Mesh(geometry, material);
      nebula.position.z = -1050;
      refs.scene.add(nebula);
      refs.nebula = nebula;
    };

    const createMountains = () => {
      const { current: refs } = threeRefs;
      const layers = [
        { distance: -50, height: 60, color: 0x0b1f2a, opacity: 1 },
        { distance: -100, height: 80, color: 0x0f3346, opacity: 0.8 },
        { distance: -150, height: 100, color: 0x145063, opacity: 0.6 },
        { distance: -200, height: 120, color: 0x176579, opacity: 0.4 },
      ];
      layers.forEach((layer, index) => {
        const points = [];
        const segments = 50;
        for (let i = 0; i <= segments; i++) {
          const x = (i / segments - 0.5) * 1000;
          const y = Math.sin(i * 0.1) * layer.height + Math.sin(i * 0.05) * layer.height * 0.5 + Math.random() * layer.height * 0.2 - 100;
          points.push(new THREE.Vector2(x, y));
        }
        points.push(new THREE.Vector2(5000, -300));
        points.push(new THREE.Vector2(-5000, -300));
        const shape = new THREE.Shape(points);
        const geometry = new THREE.ShapeGeometry(shape);
        const material = new THREE.MeshBasicMaterial({ color: layer.color, transparent: true, opacity: layer.opacity, side: THREE.DoubleSide });
        const mountain = new THREE.Mesh(geometry, material);
        mountain.position.z = layer.distance;
        mountain.position.y = layer.distance;
        mountain.userData = { baseZ: layer.distance, index };
        refs.scene.add(mountain);
        refs.mountains.push(mountain);
      });
    };

    const createAtmosphere = () => {
      const { current: refs } = threeRefs;
      const geometry = new THREE.SphereGeometry(600, 32, 32);
      const material = new THREE.ShaderMaterial({
        uniforms: { time: { value: 0 } },
        vertexShader: `
          varying vec3 vNormal;
          void main() { vNormal = normalize(normalMatrix * normal); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
        fragmentShader: `
          varying vec3 vNormal; uniform float time;
          void main() {
            float intensity = pow(0.7 - dot(vNormal, vec3(0.0, 0.0, 1.0)), 2.0);
            vec3 atmosphere = vec3(0.2, 0.65, 0.77) * intensity;
            float pulse = sin(time * 2.0) * 0.1 + 0.9;
            atmosphere *= pulse;
            gl_FragColor = vec4(atmosphere, intensity * 0.25);
          }`,
        side: THREE.BackSide,
        blending: THREE.AdditiveBlending,
        transparent: true,
      });
      refs.scene.add(new THREE.Mesh(geometry, material));
    };

    const animate = () => {
      const { current: refs } = threeRefs;
      refs.animationId = requestAnimationFrame(animate);
      const time = Date.now() * 0.001;
      refs.stars.forEach((s) => { if (s.material.uniforms) s.material.uniforms.time.value = time; });
      if (refs.nebula && refs.nebula.material.uniforms) refs.nebula.material.uniforms.time.value = time * 0.5;
      if (refs.camera && refs.targetCameraX !== undefined) {
        const f = 0.05;
        smoothCameraPos.current.x += (refs.targetCameraX - smoothCameraPos.current.x) * f;
        smoothCameraPos.current.y += (refs.targetCameraY - smoothCameraPos.current.y) * f;
        smoothCameraPos.current.z += (refs.targetCameraZ - smoothCameraPos.current.z) * f;
        const floatX = Math.sin(time * 0.1) * 2;
        const floatY = Math.cos(time * 0.15) * 1;
        refs.camera.position.x = smoothCameraPos.current.x + floatX;
        refs.camera.position.y = smoothCameraPos.current.y + floatY;
        refs.camera.position.z = smoothCameraPos.current.z;
        refs.camera.lookAt(0, 10, -600);
      }
      refs.mountains.forEach((mountain, i) => {
        const p = 1 + i * 0.5;
        mountain.position.x = Math.sin(time * 0.1) * 2 * p;
        mountain.position.y = 50 + Math.cos(time * 0.15) * 1 * p;
      });
      // Stop rendering the (fixed, full-screen) scene once it's scrolled out of
      // view — otherwise it keeps burning GPU behind the career content and
      // parallax below, which showed up as stutter on those sections.
      const heroOnScreen = window.scrollY < window.innerHeight * 3.2;
      if (refs.composer && heroOnScreen) refs.composer.render();
    };

    const getLocation = () => {
      const { current: refs } = threeRefs;
      const locations = [];
      refs.mountains.forEach((mountain, i) => { locations[i] = mountain.position.z; });
      refs.locations = locations;
    };

    initThree();

    const handleResize = () => {
      const { current: refs } = threeRefs;
      if (refs.camera && refs.renderer && refs.composer) {
        refs.camera.aspect = window.innerWidth / window.innerHeight;
        refs.camera.updateProjectionMatrix();
        refs.renderer.setSize(window.innerWidth, window.innerHeight);
        refs.composer.setSize(window.innerWidth, window.innerHeight);
      }
    };
    window.addEventListener("resize", handleResize);

    return () => {
      const { current: refs } = threeRefs;
      if (refs.animationId) cancelAnimationFrame(refs.animationId);
      window.removeEventListener("resize", handleResize);
      refs.stars.forEach((s) => { s.geometry.dispose(); s.material.dispose(); });
      refs.mountains.forEach((m) => { m.geometry.dispose(); m.material.dispose(); });
      if (refs.nebula) { refs.nebula.geometry.dispose(); refs.nebula.material.dispose(); }
      if (refs.renderer) refs.renderer.dispose();
    };
  }, []);

  useEffect(() => {
    if (!isReady) return;
    gsap.set([titleRef.current, subtitleRef.current, scrollProgressRef.current].filter(Boolean), { visibility: "visible" });
    const tl = gsap.timeline();
    if (titleRef.current) {
      const chars = titleRef.current.querySelectorAll(".title-char");
      tl.from(chars, { y: 200, opacity: 0, duration: 1.5, stagger: 0.05, ease: "power4.out" });
    }
    if (subtitleRef.current) {
      const lines = subtitleRef.current.querySelectorAll(".subtitle-line");
      tl.from(lines, { y: 50, opacity: 0, duration: 1, stagger: 0.2, ease: "power3.out" }, "-=0.8");
    }
    if (scrollProgressRef.current) tl.from(scrollProgressRef.current, { opacity: 0, y: 50, duration: 1, ease: "power2.out" }, "-=0.5");
    return () => { tl.kill(); };
  }, [isReady]);

  useEffect(() => {
    // Scroll drives the camera every frame. Doing React setState on every
    // scroll event re-rendered this whole WebGL component ~60×/s, which is what
    // made the scene judder. Instead we rAF-throttle the work and write the
    // progress bar / counter straight to the DOM via refs — zero re-renders.
    let ticking = false;
    let lastSection = -1;

    const update = () => {
      ticking = false;
      const { current: refs } = threeRefs;
      if (!refs.nebula || refs.mountains.length < 4 || !refs.locations.length) return;
      const scrollY = window.scrollY;
      const maxScroll = document.documentElement.scrollHeight - window.innerHeight;
      const progress = Math.min(scrollY / (maxScroll || 1), 1);

      // Progress UI written directly to the DOM (no state → no re-render).
      if (progressFillRef.current) progressFillRef.current.style.width = `${progress * 100}%`;
      const newSection = Math.floor(progress * totalSections);
      if (newSection !== lastSection) {
        lastSection = newSection;
        if (sectionCounterRef.current) {
          sectionCounterRef.current.textContent = `${String(newSection).padStart(2, "0")} / ${String(totalSections).padStart(2, "0")}`;
        }
      }

      const totalProgress = progress * totalSections;
      const sectionProgress = totalProgress % 1;
      const cameraPositions = [
        { x: 0, y: 30, z: 300 },
        { x: 0, y: 40, z: -50 },
        { x: 0, y: 50, z: -700 },
      ];
      const currentPos = cameraPositions[newSection] || cameraPositions[0];
      const nextPos = cameraPositions[newSection + 1] || currentPos;
      refs.targetCameraX = currentPos.x + (nextPos.x - currentPos.x) * sectionProgress;
      refs.targetCameraY = currentPos.y + (nextPos.y - currentPos.y) * sectionProgress;
      refs.targetCameraZ = currentPos.z + (nextPos.z - currentPos.z) * sectionProgress;
      refs.mountains.forEach((mountain, i) => {
        if (progress > 0.7) mountain.position.z = 600000;
        else mountain.position.z = refs.locations[i];
      });
      refs.nebula.position.z = refs.mountains[3].position.z;
    };

    const handleScroll = () => {
      if (!ticking) {
        ticking = true;
        requestAnimationFrame(update);
      }
    };
    window.addEventListener("scroll", handleScroll, { passive: true });
    update();
    return () => window.removeEventListener("scroll", handleScroll);
  }, [totalSections]);

  const splitTitle = (text) => text.split("").map((char, i) => (
    <span key={i} className="title-char">{char === " " ? " " : char}</span>
  ));

  return (
    <div ref={containerRef} className="hero-container cosmos-style">
      <canvas ref={canvasRef} className="hero-canvas" />

      <div className="hero-content cosmos-content">
        <h1 ref={titleRef} className="hero-title">{splitTitle("BUILD THE FUTURE")}</h1>
        <div ref={subtitleRef} className="hero-subtitle cosmos-subtitle">
          <p className="subtitle-line">Careers at Affhan International —</p>
          <p className="subtitle-line">source the world, from anywhere.</p>
        </div>
      </div>

      <div ref={scrollProgressRef} className="scroll-progress" style={{ visibility: "hidden" }}>
        <div className="scroll-text">SCROLL</div>
        <div className="progress-track"><div ref={progressFillRef} className="progress-fill" style={{ width: "0%" }} /></div>
        <div ref={sectionCounterRef} className="section-counter">{String(0).padStart(2, "0")} / {String(totalSections).padStart(2, "0")}</div>
      </div>

      <div className="scroll-sections">
        {[...Array(2)].map((_, i) => {
          const titles = { 0: "BUILD THE FUTURE", 1: "GO GLOBAL", 2: "GROW WITH US" };
          const subtitles = {
            0: { line1: "Careers at Affhan International —", line2: "source the world, from anywhere." },
            1: { line1: "Six offices across five countries,", line2: "one team moving goods worldwide." },
            2: { line1: "From Chennai to Guangzhou,", line2: "your career has no borders." },
          };
          return (
            <section key={i} className="content-section">
              <h1 className="hero-title">{splitTitle(titles[i + 1] || "AFFHAN")}</h1>
              <div className="hero-subtitle cosmos-subtitle">
                <p className="subtitle-line">{subtitles[i + 1].line1}</p>
                <p className="subtitle-line">{subtitles[i + 1].line2}</p>
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
};

export default Component;
