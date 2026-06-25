import { useEffect, useRef, useState } from "react";

type Vec = { x: number; y: number };

type Ship = {
  pos: Vec;
  vel: Vec;
  hp: number;
  maxHp: number;
  faction: "player" | "enemy";
  cooldown: number;
  width: number;
  height: number;
  bob: number;
  facing: 1 | -1;
};

type Bullet = {
  pos: Vec;
  vel: Vec;
  life: number;
  faction: "player" | "enemy";
  damage: number;
};

type Particle = {
  pos: Vec;
  vel: Vec;
  life: number;
  maxLife: number;
  color: string;
  size: number;
  kind: "smoke" | "fire" | "spark" | "cloud" | "ring" | "ember" | "debris";
  rot?: number;
  vrot?: number;
};


type Cloud = { pos: Vec; scale: number; speed: number; opacity: number };

const WORLD = { w: 4000, h: 1600 };

export function AirshipGame() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState<"playing" | "won" | "lost">("playing");
  const [score, setScore] = useState(0);
  const [hpDisplay, setHpDisplay] = useState(100);
  const [enemiesLeft, setEnemiesLeft] = useState(0);

  // Input state, refs to avoid re-renders
  const keys = useRef<Record<string, boolean>>({});
  const joy = useRef<{ active: boolean; cx: number; cy: number; dx: number; dy: number; id: number | null }>({
    active: false, cx: 0, cy: 0, dx: 0, dy: 0, id: null,
  });
  const firing = useRef(false);
  const fireTouchId = useRef<number | null>(null);

  const stateRef = useRef<{
    player: Ship;
    enemies: Ship[];
    bullets: Bullet[];
    particles: Particle[];
    clouds: Cloud[];
    camera: Vec;
    time: number;
    shake: number;
  } | null>(null);

  // Init game state
  useEffect(() => {
    const player: Ship = {
      pos: { x: 400, y: WORLD.h / 2 },
      vel: { x: 0, y: 0 },
      hp: 100, maxHp: 100,
      faction: "player",
      cooldown: 0,
      width: 220, height: 90,
      bob: 0, facing: 1,
    };
    const enemies: Ship[] = [];
    for (let i = 0; i < 5; i++) {
      enemies.push({
        pos: { x: 1200 + i * 600 + Math.random() * 200, y: 300 + Math.random() * (WORLD.h - 600) },
        vel: { x: 0, y: 0 },
        hp: 60, maxHp: 60,
        faction: "enemy",
        cooldown: Math.random() * 2,
        width: 200, height: 80,
        bob: Math.random() * Math.PI * 2,
        facing: -1,
      });
    }
    const clouds: Cloud[] = [];
    for (let i = 0; i < 40; i++) {
      clouds.push({
        pos: { x: Math.random() * WORLD.w, y: Math.random() * WORLD.h },
        scale: 0.5 + Math.random() * 1.8,
        speed: 5 + Math.random() * 15,
        opacity: 0.3 + Math.random() * 0.5,
      });
    }
    stateRef.current = {
      player, enemies, bullets: [], particles: [], clouds,
      camera: { x: 0, y: 0 }, time: 0, shake: 0,
    };
    setEnemiesLeft(enemies.length);
  }, []);

  // Input handlers
  useEffect(() => {
    const kd = (e: KeyboardEvent) => { keys.current[e.key.toLowerCase()] = true; if (e.key === " ") firing.current = true; };
    const ku = (e: KeyboardEvent) => { keys.current[e.key.toLowerCase()] = false; if (e.key === " ") firing.current = false; };
    window.addEventListener("keydown", kd);
    window.addEventListener("keyup", ku);
    return () => { window.removeEventListener("keydown", kd); window.removeEventListener("keyup", ku); };
  }, []);

  // Game loop
  useEffect(() => {
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext("2d")!;
    let raf = 0;
    let last = performance.now();
    let curDpr = 1;

    const resize = () => {
      curDpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = wrapRef.current!.clientWidth;
      const h = wrapRef.current!.clientHeight;
      canvas.width = Math.round(w * curDpr);
      canvas.height = Math.round(h * curDpr);
      canvas.style.width = w + "px";
      canvas.style.height = h + "px";
      ctx.setTransform(curDpr, 0, 0, curDpr, 0, 0);
    };
    resize();
    window.addEventListener("resize", resize);

    const loop = (t: number) => {
      const dt = Math.min(0.033, (t - last) / 1000);
      last = t;
      tick(dt);
      render(ctx, canvas.width / curDpr, canvas.height / curDpr);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);

    return () => { cancelAnimationFrame(raf); window.removeEventListener("resize", resize); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);


  function spawnParticle(p: Particle) {
    stateRef.current!.particles.push(p);
  }

  function explode(x: number, y: number, big = false) {
    const s = stateRef.current!;
    s.shake = Math.min(s.shake + (big ? 18 : 6), 30);
    const n = big ? 60 : 20;
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = 60 + Math.random() * (big ? 350 : 180);
      s.particles.push({
        pos: { x, y },
        vel: { x: Math.cos(a) * sp, y: Math.sin(a) * sp },
        life: 0.6 + Math.random() * 0.8,
        maxLife: 1.2,
        color: Math.random() < 0.5 ? "#ff8a3d" : "#ffd66b",
        size: 4 + Math.random() * (big ? 14 : 8),
        kind: "fire",
      });
    }
    for (let i = 0; i < (big ? 30 : 10); i++) {
      s.particles.push({
        pos: { x: x + (Math.random() - 0.5) * 30, y: y + (Math.random() - 0.5) * 30 },
        vel: { x: (Math.random() - 0.5) * 40, y: -20 - Math.random() * 30 },
        life: 1.5 + Math.random() * 1.5,
        maxLife: 3,
        color: "#5a4a44",
        size: 10 + Math.random() * 20,
        kind: "smoke",
      });
    }
  }

  function fireFromShip(ship: Ship, targetX: number, targetY: number) {
    const s = stateRef.current!;
    const muzzleX = ship.pos.x + ship.facing * (ship.width * 0.42);
    const muzzleY = ship.pos.y - ship.height * 0.05;
    const dx = targetX - muzzleX;
    const dy = targetY - muzzleY;
    const len = Math.hypot(dx, dy) || 1;
    const speed = 700;
    s.bullets.push({
      pos: { x: muzzleX, y: muzzleY },
      vel: { x: (dx / len) * speed, y: (dy / len) * speed },
      life: 2,
      faction: ship.faction,
      damage: ship.faction === "player" ? 18 : 10,
    });
    // muzzle flash
    for (let i = 0; i < 8; i++) {
      const a = Math.atan2(dy, dx) + (Math.random() - 0.5) * 0.6;
      s.particles.push({
        pos: { x: muzzleX, y: muzzleY },
        vel: { x: Math.cos(a) * 200, y: Math.sin(a) * 200 },
        life: 0.25, maxLife: 0.25,
        color: ship.faction === "player" ? "#ff5a2a" : "#ffcf3a",
        size: 6, kind: "spark",
      });
    }
    s.shake = Math.min(s.shake + 2, 10);
  }

  function tick(dt: number) {
    const s = stateRef.current;
    if (!s) return;
    s.time += dt;

    if (status !== "playing") return;

    // Input vector
    let ix = 0, iy = 0;
    if (keys.current["w"] || keys.current["arrowup"]) iy -= 1;
    if (keys.current["s"] || keys.current["arrowdown"]) iy += 1;
    if (keys.current["a"] || keys.current["arrowleft"]) ix -= 1;
    if (keys.current["d"] || keys.current["arrowright"]) ix += 1;
    if (joy.current.active) {
      ix += joy.current.dx;
      iy += joy.current.dy;
    }
    const mag = Math.hypot(ix, iy);
    if (mag > 1) { ix /= mag; iy /= mag; }

    const p = s.player;
    const accel = 1400;
    p.vel.x += ix * accel * dt;
    p.vel.y += iy * accel * dt;
    // drag
    p.vel.x *= Math.pow(0.02, dt);
    p.vel.y *= Math.pow(0.02, dt);
    const maxSpeed = 380;
    const sp = Math.hypot(p.vel.x, p.vel.y);
    if (sp > maxSpeed) { p.vel.x = (p.vel.x / sp) * maxSpeed; p.vel.y = (p.vel.y / sp) * maxSpeed; }
    p.pos.x += p.vel.x * dt;
    p.pos.y += p.vel.y * dt;
    p.pos.x = Math.max(120, Math.min(WORLD.w - 120, p.pos.x));
    p.pos.y = Math.max(80, Math.min(WORLD.h - 80, p.pos.y));
    if (ix > 0.1) p.facing = 1;
    else if (ix < -0.1) p.facing = -1;
    p.bob += dt;

    // Engine smoke
    if (Math.abs(p.vel.x) + Math.abs(p.vel.y) > 40 && Math.random() < 0.6) {
      spawnParticle({
        pos: { x: p.pos.x - p.facing * p.width * 0.45, y: p.pos.y + 8 },
        vel: { x: -p.facing * 30 + (Math.random() - 0.5) * 20, y: -10 + (Math.random() - 0.5) * 20 },
        life: 1.2, maxLife: 1.2,
        color: "#9a8b80", size: 8 + Math.random() * 8, kind: "smoke",
      });
    }

    // Player fire
    p.cooldown -= dt;
    if (firing.current && p.cooldown <= 0) {
      // Target nearest enemy in front; fallback ahead
      let tx = p.pos.x + p.facing * 600;
      let ty = p.pos.y;
      let best = Infinity;
      for (const e of s.enemies) {
        const dx = e.pos.x - p.pos.x;
        if (Math.sign(dx) !== p.facing) continue;
        const d = Math.hypot(dx, e.pos.y - p.pos.y);
        if (d < best) { best = d; tx = e.pos.x; ty = e.pos.y; }
      }
      fireFromShip(p, tx, ty);
      p.cooldown = 0.18;
    }

    // Enemies AI
    for (const e of s.enemies) {
      e.bob += dt;
      const dx = p.pos.x - e.pos.x;
      const dy = p.pos.y - e.pos.y;
      const dist = Math.hypot(dx, dy);
      e.facing = dx >= 0 ? 1 : -1;
      // Keep at engagement distance
      const desired = 500;
      const dirX = dx / (dist || 1);
      const dirY = dy / (dist || 1);
      const approach = dist > desired ? 1 : dist < desired - 80 ? -1 : 0;
      e.vel.x += dirX * approach * 600 * dt + (Math.sin(e.bob * 0.7) * 30) * dt;
      e.vel.y += dirY * approach * 400 * dt + Math.cos(e.bob * 0.5) * 60 * dt;
      e.vel.x *= Math.pow(0.05, dt);
      e.vel.y *= Math.pow(0.05, dt);
      const es = Math.hypot(e.vel.x, e.vel.y);
      const emax = 180;
      if (es > emax) { e.vel.x = (e.vel.x / es) * emax; e.vel.y = (e.vel.y / es) * emax; }
      e.pos.x += e.vel.x * dt;
      e.pos.y += e.vel.y * dt;
      e.pos.y = Math.max(80, Math.min(WORLD.h - 80, e.pos.y));
      e.cooldown -= dt;
      if (e.cooldown <= 0 && dist < 900) {
        fireFromShip(e, p.pos.x, p.pos.y);
        e.cooldown = 1.2 + Math.random() * 0.8;
      }
      // damage smoke when low
      if (e.hp < e.maxHp * 0.5 && Math.random() < 0.3) {
        spawnParticle({
          pos: { x: e.pos.x + (Math.random() - 0.5) * e.width * 0.5, y: e.pos.y - e.height * 0.3 },
          vel: { x: (Math.random() - 0.5) * 20, y: -30 },
          life: 1.5, maxLife: 1.5, color: "#3a3a3a", size: 12, kind: "smoke",
        });
      }
    }

    // Bullets
    for (const b of s.bullets) {
      b.pos.x += b.vel.x * dt;
      b.pos.y += b.vel.y * dt;
      b.life -= dt;
    }
    s.bullets = s.bullets.filter(b => b.life > 0);

    // Collisions
    for (const b of s.bullets) {
      if (b.faction === "player") {
        for (const e of s.enemies) {
          if (e.hp <= 0) continue;
          if (Math.abs(b.pos.x - e.pos.x) < e.width * 0.42 && Math.abs(b.pos.y - e.pos.y) < e.height * 0.55) {
            e.hp -= b.damage;
            b.life = 0;
            explode(b.pos.x, b.pos.y, false);
            if (e.hp <= 0) {
              explode(e.pos.x, e.pos.y, true);
              setScore(sc => sc + 100);
            }
          }
        }
      } else {
        if (p.hp > 0 && Math.abs(b.pos.x - p.pos.x) < p.width * 0.42 && Math.abs(b.pos.y - p.pos.y) < p.height * 0.55) {
          p.hp -= b.damage;
          b.life = 0;
          explode(b.pos.x, b.pos.y, false);
          s.shake = Math.min(s.shake + 6, 25);
        }
      }
    }
    s.bullets = s.bullets.filter(b => b.life > 0);
    s.enemies = s.enemies.filter(e => e.hp > 0);
    setEnemiesLeft(s.enemies.length);
    setHpDisplay(Math.max(0, Math.round(p.hp)));

    if (p.hp <= 0 && status === "playing") setStatus("lost");
    if (s.enemies.length === 0 && status === "playing") setStatus("won");

    // Particles
    for (const pa of s.particles) {
      pa.pos.x += pa.vel.x * dt;
      pa.pos.y += pa.vel.y * dt;
      pa.vel.x *= Math.pow(0.5, dt);
      if (pa.kind === "smoke") pa.vel.y -= 20 * dt;
      pa.life -= dt;
    }
    s.particles = s.particles.filter(pa => pa.life > 0);
    if (s.particles.length > 600) s.particles.splice(0, s.particles.length - 600);

    // Clouds drift
    for (const c of s.clouds) {
      c.pos.x -= c.speed * dt;
      if (c.pos.x < -200) { c.pos.x = WORLD.w + 200; c.pos.y = Math.random() * WORLD.h; }
    }

    // Camera (with zoom so mobile sees more of the world)
    const vw = canvasRef.current!.clientWidth;
    const vh = canvasRef.current!.clientHeight;
    const zoom = Math.min(1, Math.max(0.45, vw / 1100));
    const evw = vw / zoom;
    const evh = vh / zoom;
    const tx = p.pos.x - evw / 2;
    const ty = p.pos.y - evh / 2;
    s.camera.x += (tx - s.camera.x) * Math.min(1, dt * 4);
    s.camera.y += (ty - s.camera.y) * Math.min(1, dt * 4);
    s.camera.x = Math.max(0, Math.min(WORLD.w - evw, s.camera.x));
    s.camera.y = Math.max(0, Math.min(WORLD.h - evh, s.camera.y));
    s.shake *= Math.pow(0.001, dt);
  }

  function render(ctx: CanvasRenderingContext2D, vw: number, vh: number) {
    const s = stateRef.current;
    if (!s) return;
    const shakeX = (Math.random() - 0.5) * s.shake;
    const shakeY = (Math.random() - 0.5) * s.shake;
    const camX = s.camera.x + shakeX;
    const camY = s.camera.y + shakeY;

    // Sky gradient
    const g = ctx.createLinearGradient(0, 0, 0, vh);
    g.addColorStop(0, "#f4c98a");
    g.addColorStop(0.5, "#e8866b");
    g.addColorStop(1, "#7e3a4f");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, vw, vh);

    // Sun
    const sunX = vw - 120, sunY = 140;
    const sg = ctx.createRadialGradient(sunX, sunY, 10, sunX, sunY, 200);
    sg.addColorStop(0, "rgba(255,240,200,0.9)");
    sg.addColorStop(1, "rgba(255,200,150,0)");
    ctx.fillStyle = sg;
    ctx.fillRect(0, 0, vw, vh);
    ctx.fillStyle = "#fff2c2";
    ctx.beginPath(); ctx.arc(sunX, sunY, 50, 0, Math.PI * 2); ctx.fill();

    // Distant mountains (parallax)
    drawMountains(ctx, vw, vh, camX * 0.15, "#5a3a55", vh * 0.65);
    drawMountains(ctx, vw, vh, camX * 0.3, "#3d2a45", vh * 0.78);

    // Clouds back layer
    for (const c of s.clouds) {
      const px = c.pos.x - camX * 0.5;
      const py = c.pos.y - camY * 0.3;
      if (px < -300 || px > vw + 300) continue;
      drawCloud(ctx, px, py, c.scale * 0.8, c.opacity * 0.6);
    }

    // Mid mountains
    drawMountains(ctx, vw, vh, camX * 0.5, "#2a1f33", vh * 0.88);

    // World transform (with zoom for small screens)
    const zoom = Math.min(1, Math.max(0.45, vw / 1100));
    ctx.save();
    ctx.scale(zoom, zoom);
    ctx.translate(-camX, -camY);

    // Ships
    drawShip(ctx, s.player, s.time, false);
    for (const e of s.enemies) drawShip(ctx, e, s.time, true);

    // Bullets
    for (const b of s.bullets) {
      ctx.save();
      ctx.translate(b.pos.x, b.pos.y);
      const ang = Math.atan2(b.vel.y, b.vel.x);
      ctx.rotate(ang);
      ctx.fillStyle = b.faction === "player" ? "#ff3b1f" : "#ffb43a";
      ctx.shadowColor = ctx.fillStyle;
      ctx.shadowBlur = 12;
      ctx.beginPath();
      ctx.ellipse(0, 0, 10, 4, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.restore();
    }

    // Particles
    for (const pa of s.particles) {
      const a = Math.max(0, pa.life / pa.maxLife);
      ctx.globalAlpha = a;
      if (pa.kind === "smoke") {
        ctx.fillStyle = pa.color;
        ctx.beginPath(); ctx.arc(pa.pos.x, pa.pos.y, pa.size * (1.4 - a * 0.4), 0, Math.PI * 2); ctx.fill();
      } else if (pa.kind === "fire") {
        ctx.fillStyle = pa.color;
        ctx.shadowColor = pa.color; ctx.shadowBlur = 16;
        ctx.beginPath(); ctx.arc(pa.pos.x, pa.pos.y, pa.size * a, 0, Math.PI * 2); ctx.fill();
        ctx.shadowBlur = 0;
      } else {
        ctx.fillStyle = pa.color;
        ctx.fillRect(pa.pos.x - 1, pa.pos.y - 1, 3, 3);
      }
    }
    ctx.globalAlpha = 1;

    ctx.restore();

    // Foreground clouds
    for (const c of s.clouds) {
      const px = c.pos.x - camX * 0.9;
      const py = c.pos.y - camY * 0.7;
      if (px < -300 || px > vw + 300) continue;
      drawCloud(ctx, px, py, c.scale * 1.2, c.opacity * 0.4);
    }

    // Vignette
    const vg = ctx.createRadialGradient(vw / 2, vh / 2, vh * 0.4, vw / 2, vh / 2, vh * 0.9);
    vg.addColorStop(0, "rgba(0,0,0,0)");
    vg.addColorStop(1, "rgba(20,5,15,0.5)");
    ctx.fillStyle = vg;
    ctx.fillRect(0, 0, vw, vh);

    // Hand-drawn paper grain overlay
    ctx.globalAlpha = 0.05;
    ctx.fillStyle = "#3a1f2a";
    for (let i = 0; i < 30; i++) {
      ctx.fillRect(Math.random() * vw, Math.random() * vh, 1, 1);
    }
    ctx.globalAlpha = 1;
  }

  function drawMountains(ctx: CanvasRenderingContext2D, vw: number, vh: number, offset: number, color: string, baseY: number) {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(0, vh);
    const step = 80;
    for (let x = 0; x <= vw + step; x += step) {
      const wx = x + offset;
      const y = baseY + Math.sin(wx * 0.005) * 60 + Math.sin(wx * 0.013) * 40 + Math.sin(wx * 0.04) * 15;
      ctx.lineTo(x, y);
    }
    ctx.lineTo(vw, vh);
    ctx.closePath();
    ctx.fill();
  }

  function drawCloud(ctx: CanvasRenderingContext2D, x: number, y: number, scale: number, alpha: number) {
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(scale, scale);
    ctx.globalAlpha = alpha;
    ctx.fillStyle = "#ffe6c9";
    const blobs = [[0, 0, 30], [25, -8, 24], [-25, -5, 26], [12, 10, 22], [-15, 12, 20]];
    for (const [bx, by, br] of blobs) {
      ctx.beginPath(); ctx.arc(bx, by, br, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
    ctx.globalAlpha = 1;
  }

  function drawShip(ctx: CanvasRenderingContext2D, ship: Ship, t: number, enemy: boolean) {
    const bobY = Math.sin(t * 1.3 + ship.bob) * 4;
    ctx.save();
    ctx.translate(ship.pos.x, ship.pos.y + bobY);
    ctx.scale(ship.facing, 1);
    const w = ship.width, h = ship.height;

    // shadow under
    ctx.globalAlpha = 0.25;
    ctx.fillStyle = "#1a0a14";
    ctx.beginPath(); ctx.ellipse(0, h * 0.7, w * 0.45, 8, 0, 0, Math.PI * 2); ctx.fill();
    ctx.globalAlpha = 1;

    // Balloon (envelope)
    const balloonColor = enemy ? "#7a1d1d" : "#b53a2a";
    const balloonDark = enemy ? "#4a0e0e" : "#7a1f12";
    ctx.fillStyle = balloonColor;
    ctx.strokeStyle = "#1a0a0a";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.ellipse(0, -h * 0.7, w * 0.55, h * 0.55, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    // balloon ribbing
    ctx.strokeStyle = balloonDark;
    ctx.lineWidth = 2;
    for (let i = -2; i <= 2; i++) {
      ctx.beginPath();
      const rx = i * w * 0.18;
      ctx.ellipse(rx, -h * 0.7, w * 0.05, h * 0.55, 0, 0, Math.PI * 2);
      ctx.stroke();
    }
    // fin tail
    ctx.fillStyle = balloonDark;
    ctx.beginPath();
    ctx.moveTo(-w * 0.55, -h * 0.7);
    ctx.lineTo(-w * 0.75, -h * 1.05);
    ctx.lineTo(-w * 0.5, -h * 0.95);
    ctx.closePath(); ctx.fill();
    ctx.strokeStyle = "#1a0a0a"; ctx.lineWidth = 2; ctx.stroke();
    // emblem
    ctx.fillStyle = "#ffce4a";
    ctx.beginPath();
    ctx.arc(0, -h * 0.7, 12, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "#1a0a0a"; ctx.stroke();
    ctx.fillStyle = enemy ? "#7a1d1d" : "#b53a2a";
    // simple flame emblem
    ctx.beginPath();
    ctx.moveTo(0, -h * 0.7 - 8);
    ctx.quadraticCurveTo(6, -h * 0.7, 0, -h * 0.7 + 6);
    ctx.quadraticCurveTo(-6, -h * 0.7, 0, -h * 0.7 - 8);
    ctx.fill();

    // Ropes
    ctx.strokeStyle = "#2a1810"; ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(-w * 0.4, -h * 0.3); ctx.lineTo(-w * 0.35, h * 0.05);
    ctx.moveTo(w * 0.4, -h * 0.3); ctx.lineTo(w * 0.35, h * 0.05);
    ctx.moveTo(-w * 0.15, -h * 0.2); ctx.lineTo(-w * 0.15, h * 0.05);
    ctx.moveTo(w * 0.15, -h * 0.2); ctx.lineTo(w * 0.15, h * 0.05);
    ctx.stroke();

    // Hull (wooden gondola)
    ctx.fillStyle = "#6e4a2a";
    ctx.strokeStyle = "#2a1810"; ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(-w * 0.45, h * 0.05);
    ctx.lineTo(w * 0.45, h * 0.05);
    ctx.lineTo(w * 0.55, h * 0.25);
    ctx.lineTo(w * 0.35, h * 0.5);
    ctx.lineTo(-w * 0.35, h * 0.5);
    ctx.lineTo(-w * 0.55, h * 0.25);
    ctx.closePath();
    ctx.fill(); ctx.stroke();
    // planks
    ctx.strokeStyle = "#4a2f1a"; ctx.lineWidth = 1;
    for (let i = 1; i < 4; i++) {
      ctx.beginPath();
      ctx.moveTo(-w * 0.45, h * 0.05 + i * h * 0.11);
      ctx.lineTo(w * 0.45, h * 0.05 + i * h * 0.11);
      ctx.stroke();
    }
    // windows
    ctx.fillStyle = "#ffd66b";
    for (let i = -2; i <= 2; i++) {
      ctx.beginPath();
      ctx.arc(i * w * 0.14, h * 0.22, 5, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "#2a1810"; ctx.lineWidth = 1.5; ctx.stroke();
    }
    // Cannon at front
    ctx.fillStyle = "#2a2a2e";
    ctx.strokeStyle = "#0a0a0a"; ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.rect(w * 0.4, h * 0.1, w * 0.18, h * 0.12);
    ctx.fill(); ctx.stroke();
    // propeller back
    ctx.strokeStyle = "#1a0a0a"; ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(-w * 0.55, h * 0.2);
    ctx.lineTo(-w * 0.7, h * 0.2);
    ctx.stroke();
    const spin = (t * 20) % (Math.PI * 2);
    ctx.save();
    ctx.translate(-w * 0.7, h * 0.2);
    ctx.rotate(spin);
    ctx.fillStyle = "#3a2a1a";
    ctx.fillRect(-2, -h * 0.18, 4, h * 0.36);
    ctx.restore();

    ctx.restore();

    // HP bar
    if (ship.hp < ship.maxHp) {
      const bw = ship.width * 0.6;
      ctx.fillStyle = "rgba(0,0,0,0.5)";
      ctx.fillRect(ship.pos.x - bw / 2, ship.pos.y - ship.height * 1.25, bw, 6);
      ctx.fillStyle = ship.faction === "player" ? "#5ad77a" : "#ff5a3a";
      ctx.fillRect(ship.pos.x - bw / 2, ship.pos.y - ship.height * 1.25, bw * (ship.hp / ship.maxHp), 6);
    }
  }

  // Joystick handlers
  const joyRadius = 60;
  const onJoyStart = (e: React.PointerEvent) => {
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    joy.current.cx = rect.left + rect.width / 2;
    joy.current.cy = rect.top + rect.height / 2;
    joy.current.active = true;
    joy.current.id = e.pointerId;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    updateJoy(e.clientX, e.clientY);
  };
  const onJoyMove = (e: React.PointerEvent) => {
    if (!joy.current.active || joy.current.id !== e.pointerId) return;
    updateJoy(e.clientX, e.clientY);
  };
  const onJoyEnd = (e: React.PointerEvent) => {
    if (joy.current.id !== e.pointerId) return;
    joy.current.active = false;
    joy.current.dx = 0; joy.current.dy = 0; joy.current.id = null;
  };
  const updateJoy = (x: number, y: number) => {
    const dx = x - joy.current.cx;
    const dy = y - joy.current.cy;
    const d = Math.hypot(dx, dy);
    const m = Math.min(1, d / joyRadius);
    joy.current.dx = (dx / (d || 1)) * m;
    joy.current.dy = (dy / (d || 1)) * m;
  };

  const restart = () => {
    setStatus("playing");
    setScore(0);
    stateRef.current = null;
    // re-init
    const player: Ship = {
      pos: { x: 400, y: WORLD.h / 2 }, vel: { x: 0, y: 0 },
      hp: 100, maxHp: 100, faction: "player", cooldown: 0,
      width: 220, height: 90, bob: 0, facing: 1,
    };
    const enemies: Ship[] = [];
    for (let i = 0; i < 5; i++) {
      enemies.push({
        pos: { x: 1200 + i * 600, y: 300 + Math.random() * (WORLD.h - 600) },
        vel: { x: 0, y: 0 }, hp: 60, maxHp: 60, faction: "enemy",
        cooldown: Math.random() * 2, width: 200, height: 80,
        bob: Math.random() * Math.PI * 2, facing: -1,
      });
    }
    const clouds: Cloud[] = [];
    for (let i = 0; i < 40; i++) {
      clouds.push({
        pos: { x: Math.random() * WORLD.w, y: Math.random() * WORLD.h },
        scale: 0.5 + Math.random() * 1.8, speed: 5 + Math.random() * 15,
        opacity: 0.3 + Math.random() * 0.5,
      });
    }
    stateRef.current = { player, enemies, bullets: [], particles: [], clouds, camera: { x: 0, y: 0 }, time: 0, shake: 0 };
    setEnemiesLeft(enemies.length);
    setHpDisplay(100);
  };

  return (
    <div
      ref={wrapRef}
      className="relative w-screen h-screen overflow-hidden bg-black touch-none select-none"
      style={{ fontFamily: "ui-serif, Georgia, serif" }}
    >
      <canvas ref={canvasRef} className="absolute inset-0 w-full h-full" />

      {/* HUD */}
      <div className="absolute top-3 left-3 right-3 flex justify-between items-start pointer-events-none z-10">
        <div className="bg-black/40 backdrop-blur-sm rounded-lg px-3 py-2 text-amber-100 border border-amber-700/50">
          <div className="text-xs uppercase tracking-widest text-amber-300/80">Hull</div>
          <div className="w-40 h-2 bg-black/60 rounded mt-1 overflow-hidden border border-amber-900/60">
            <div className="h-full bg-gradient-to-r from-orange-500 to-yellow-400 transition-all" style={{ width: `${hpDisplay}%` }} />
          </div>
        </div>
        <div className="bg-black/40 backdrop-blur-sm rounded-lg px-4 py-2 text-amber-100 border border-amber-700/50 text-right">
          <div className="text-xs uppercase tracking-widest text-amber-300/80">Bounty</div>
          <div className="text-xl font-bold">{score}</div>
        </div>
        <div className="bg-black/40 backdrop-blur-sm rounded-lg px-3 py-2 text-amber-100 border border-amber-700/50 absolute left-1/2 -translate-x-1/2">
          <div className="text-xs uppercase tracking-widest text-amber-300/80">Enemy Fleet</div>
          <div className="text-center text-lg font-bold">{enemiesLeft}</div>
        </div>
      </div>

      {/* Instructions */}
      <div className="absolute bottom-3 left-1/2 -translate-x-1/2 text-amber-200/70 text-xs text-center pointer-events-none z-10 hidden md:block">
        WASD / Arrows to fly · SPACE to fire
      </div>

      {/* Joystick — mobile */}
      <div
        className="absolute bottom-8 left-8 w-36 h-36 rounded-full bg-black/30 border-2 border-amber-300/40 backdrop-blur-sm z-20 touch-none"
        onPointerDown={onJoyStart}
        onPointerMove={onJoyMove}
        onPointerUp={onJoyEnd}
        onPointerCancel={onJoyEnd}
      >
        <JoyKnob joyRef={joy} />
        <div className="absolute inset-0 flex items-center justify-center text-amber-300/30 text-[10px] uppercase tracking-widest pointer-events-none">Steer</div>
      </div>

      {/* Fire button — mobile */}
      <button
        className="absolute bottom-12 right-10 w-24 h-24 rounded-full bg-gradient-to-br from-orange-500 to-red-700 border-4 border-amber-200/70 shadow-2xl active:scale-95 transition-transform z-20 touch-none text-white font-bold tracking-widest"
        onPointerDown={(e) => { fireTouchId.current = e.pointerId; firing.current = true; (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); }}
        onPointerUp={(e) => { if (fireTouchId.current === e.pointerId) { firing.current = false; fireTouchId.current = null; } }}
        onPointerCancel={() => { firing.current = false; fireTouchId.current = null; }}
      >
        FIRE
      </button>

      {/* Status overlays */}
      {status !== "playing" && (
        <div className="absolute inset-0 bg-black/70 backdrop-blur-sm flex flex-col items-center justify-center z-30 text-center px-6">
          <h1 className="text-4xl md:text-6xl font-bold text-amber-200 drop-shadow-[0_0_20px_rgba(255,140,40,0.6)]">
            {status === "won" ? "Skies Cleared" : "Ship Down"}
          </h1>
          <p className="mt-3 text-amber-100/80 max-w-md">
            {status === "won" ? "The horizon belongs to you, captain. The fleet has fallen." : "Your airship plummets into the crimson dusk. The fleet endures."}
          </p>
          <div className="mt-2 text-amber-300/90">Bounty: <span className="font-bold">{score}</span></div>
          <button
            onClick={restart}
            className="mt-6 px-8 py-3 rounded-lg bg-gradient-to-br from-orange-500 to-red-700 text-white font-bold tracking-widest border-2 border-amber-200/70 shadow-xl active:scale-95"
          >
            FLY AGAIN
          </button>
        </div>
      )}

      {/* Title chrome */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-none hidden" />
    </div>
  );
}

function JoyKnob({ joyRef }: { joyRef: React.MutableRefObject<{ active: boolean; dx: number; dy: number; cx: number; cy: number; id: number | null }> }) {
  const knobRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let raf = 0;
    const loop = () => {
      if (knobRef.current) {
        const r = 50;
        const x = joyRef.current.dx * r;
        const y = joyRef.current.dy * r;
        knobRef.current.style.transform = `translate(${x}px, ${y}px)`;
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [joyRef]);
  return (
    <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
      <div ref={knobRef} className="w-16 h-16 rounded-full bg-gradient-to-br from-amber-300 to-orange-600 border-2 border-amber-100/80 shadow-lg" />
    </div>
  );
}
