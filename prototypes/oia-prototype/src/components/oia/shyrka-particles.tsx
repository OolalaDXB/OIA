import { useEffect, useRef } from "react";
import faceDepth from "@/assets/shyrka-face-regard-doux.jpg";

type Props = { mode: "repos" | "ecoute" | "reflexion" | "parle"; paused: boolean };
export function ShyrkaParticles({ mode, paused }: Props) {
  const host = useRef<HTMLDivElement>(null);
  const state = useRef({ mode, paused });
  useEffect(() => { state.current = { mode, paused }; }, [mode, paused]);
  useEffect(() => {
    const element = host.current;
    if (!element) return;
    let disposed = false;
    let cleanup = () => {};
    async function init() {
      const THREE = await import("three");
      if (disposed || !element) return;
      const image = new Image();
      image.src = faceDepth;
      await image.decode();
      if (disposed) return;
      const sampler = document.createElement("canvas");
      sampler.width = sampler.height = 256;
      const ctx = sampler.getContext("2d", { willReadFrequently: true });
      if (!ctx) return;
      ctx.drawImage(image, 0, 0, 256, 256);
      const depth = ctx.getImageData(0, 0, 256, 256).data;
      const count = 32000;
      const sphere = new Float32Array(count * 3);
      const face = new Float32Array(count * 3);
      const seeds = new Float32Array(count);
      let randomState = 427;
      const rand = () => { randomState = (randomState * 1664525 + 1013904223) >>> 0; return randomState / 4294967296; };
      const samples: [number, number, number][] = [];
      for (let y = 8; y < 246; y++) for (let x = 8; x < 246; x++) {
        const d = (depth[(y * 256 + x) * 4] ?? 0) / 255;
        if (d > .12) samples.push([x, y, d]);
      }
      for (let i = 0; i < count; i++) {
        const y = 1 - 2 * (i + .5) / count;
        const radius = Math.sqrt(1 - y * y);
        const a = i * 2.39996323;
        const r = 1.22 + .017 * Math.sin(i * .73);
        sphere.set([Math.cos(a) * radius * r, y * r, Math.sin(a) * radius * r], i * 3);
        const sample = samples[Math.floor(rand() * samples.length)];
        if (!sample) continue;
        const [x, fy, d] = sample;
        const dust = i % 19 === 0 ? .35 : .018;
        face.set([(x / 256 - .5) * 2.7 + (rand() - .5) * dust, (.5 - fy / 256) * 2.7 + (rand() - .5) * dust, (d - .4) * .95 + (rand() - .5) * .035], i * 3);
        seeds[i] = rand();
      }
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute("position", new THREE.BufferAttribute(sphere, 3));
      geometry.setAttribute("face", new THREE.BufferAttribute(face, 3));
      geometry.setAttribute("seed", new THREE.BufferAttribute(seeds, 1));
      const readColor = (token: string) => {
        ctx.fillStyle = getComputedStyle(element).getPropertyValue(token).trim();
        ctx.fillRect(0, 0, 1, 1);
        const rgba = ctx.getImageData(0, 0, 1, 1).data;
        return new THREE.Color((rgba[0] ?? 0) / 255, (rgba[1] ?? 0) / 255, (rgba[2] ?? 0) / 255);
      };
      const uniforms = { uTime: { value: 0 }, uMorph: { value: 0 }, uListen: { value: 0 }, uThink: { value: 0 }, uDim: { value: 1 }, uPixel: { value: 1 }, uBlue: { value: readColor("--shyrka-particle") }, uIce: { value: readColor("--shyrka-light") } };
      const material = new THREE.ShaderMaterial({
        uniforms, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
        vertexShader: `attribute vec3 face; attribute float seed; uniform float uTime,uMorph,uListen,uThink,uPixel; varying float vLight; varying float vSeed;
          void main(){
            vec3 p=position;
            float angle=uTime*.035;
            p.xz=mat2(cos(angle),-sin(angle),sin(angle),cos(angle))*p.xz;
            p*=1.+.009*sin(uTime*.8);
            p=mix(p,face,uMorph);
            p*=1.-uListen*.14;
            p.x+=uMorph*.018*sin(uTime*1.8+p.y*5.+seed*2.)+uThink*.045*sin(uTime*2.+p.y*4.+seed*6.);
            p.z+=uMorph*.025*sin(uTime*2.4+p.y*8.)+uThink*.04*cos(uTime*1.7+p.x*5.+seed*4.);
            float rim=pow(1.-abs(position.z)/1.24,3.);
            float relief=clamp((face.z+.38)/.95,0.,1.);
            vLight=mix(.10+rim*1.5,.12+pow(relief,2.)*1.2+seed*.15,uMorph);
            vSeed=seed;
            vec4 mv=modelViewMatrix*vec4(p,1.);
            gl_Position=projectionMatrix*mv;
            gl_PointSize=(.7+seed*.95)*uPixel*(4./-mv.z);
          }`,
        fragmentShader: `uniform vec3 uBlue,uIce; uniform float uMorph,uDim; varying float vLight,vSeed;
          void main(){float r=length(gl_PointCoord-.5); if(r>.5) discard;
          float soft=1.-smoothstep(.08,.5,r);
          vec3 color=mix(uBlue,uIce,uMorph*.85+vSeed*.1);
          gl_FragColor=vec4(color*1.5,soft*vLight*uDim);}`,
      });
      const scene = new THREE.Scene();
      const camera = new THREE.PerspectiveCamera(40, 1, .1, 30);
      camera.position.z = 4.6;
      scene.add(new THREE.Points(geometry, material));
      const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, powerPreference: "low-power" });
      renderer.setClearColor(0, 0);
      renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
      element.appendChild(renderer.domElement);
      const resize = () => {
        const { width, height } = element.getBoundingClientRect();
        renderer.setSize(width, height);
        camera.aspect = width / Math.max(height, 1);
        camera.position.z = camera.aspect < 1 ? 4.6 / camera.aspect : 4.6;
        camera.updateProjectionMatrix();
        uniforms.uPixel.value = renderer.getPixelRatio() * Math.min(width, height) / 440;
      };
      const observer = new ResizeObserver(resize);
      observer.observe(element);
      resize();
      const reduced = matchMedia("(prefers-reduced-motion: reduce)");
      let frame = 0, last = performance.now();
      const render = (now: number) => {
        if (disposed) return;
        const dt = Math.min((now - last) / 1000, .04); last = now;
        const current = state.current;
        const target = current.mode === "parle" ? 1 : current.mode === "reflexion" ? .52 : 0;
        if (!current.paused) {
          if (!reduced.matches) uniforms.uTime.value += dt;
          // Le visage se forme au même rythme, mais se défait plus lentement : retour à la sphère doux, sans à-coup.
          const vitesseMorph = target > uniforms.uMorph.value ? 3.5 : 1.3;
          uniforms.uMorph.value += (target - uniforms.uMorph.value) * (reduced.matches ? 1 : Math.min(1, dt * vitesseMorph));
          uniforms.uListen.value += ((current.mode === "ecoute" ? 1 : current.mode === "reflexion" ? .16 : 0) - uniforms.uListen.value) * (reduced.matches ? 1 : dt * 3);
          uniforms.uThink.value += ((current.mode === "reflexion" ? 1 : 0) - uniforms.uThink.value) * (reduced.matches ? 1 : dt * 4);
        }
        uniforms.uDim.value = current.paused ? .15 : 1;
        renderer.render(scene, camera);
        frame = requestAnimationFrame(render);
      };
      frame = requestAnimationFrame(render);
      cleanup = () => { cancelAnimationFrame(frame); observer.disconnect(); geometry.dispose(); material.dispose(); renderer.dispose(); renderer.domElement.remove(); };
    }
    init().catch(() => element.setAttribute("data-render-error", "true"));
    return () => { disposed = true; cleanup(); };
  }, []);
  return <div ref={host} className="shyrka-particles" aria-hidden="true" />;
}
