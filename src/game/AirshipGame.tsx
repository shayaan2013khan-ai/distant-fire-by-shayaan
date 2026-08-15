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
  name?: string;
  weaponDamage?: number;
  weaponCooldown?: number;
  weaponStyle?: "projectile" | "beam";
  flame?: boolean;
  upgradeLevel?: number;
  id?: string;
  score?: number;
  kills?: number;
  deaths?: number;
};

type Bullet = {
  pos: Vec;
  vel: Vec;
  target?: Vec;
  life: number;
  faction: "player" | "enemy";
  damage: number;
  kind?: "normal" | "flame" | "beam";
  aoe?: boolean;
  sourceId?: string;
  peerBullet?: boolean;
  curve?: number;
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

type MessagePayload =
  | { type: "presence-refresh" }
  | { type: "peer-bullet"; sourceId: string; damage: number; kind: "normal" | "flame" | "beam"; pos: Vec; vel: Vec; target?: Vec; aoe: boolean }
  | { type: "peer-hit"; sourceId: string; targetId: string; hp: number; pos: Vec }
  | { type: "peer-kill"; sourceId: string; targetId: string; reward: number; pos: Vec; beam?: boolean };

const WORLD = { w: 4000, h: 1600 };

export function AirshipGame() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState<"playing" | "paused" | "won" | "lost">("playing");
  const statusRef = useRef<typeof status>("playing");
  useEffect(() => { statusRef.current = status; }, [status]);
  const [gameMode, setGameMode] = useState<"normal" | "online">("normal");
  const gameModeRef = useRef<typeof gameMode>("normal");
  useEffect(() => { gameModeRef.current = gameMode; }, [gameMode]);
  const [page, setPage] = useState<"menu" | "instructions" | "game">("menu");
  const [username, setUsername] = useState(() => {
    try { return localStorage.getItem('game.username') || 'Pilot'; } catch { return 'Pilot'; }
  });
  const [score, setScore] = useState(0);
  const scoreRef = useRef(score);
  useEffect(() => { scoreRef.current = score; }, [score]);
  const [kills, setKills] = useState(() => { try { return Number(localStorage.getItem('game.kills')) || 0; } catch { return 0; } });
  const killsRef = useRef(kills);
  useEffect(() => { killsRef.current = kills; }, [kills]);
  const [deaths, setDeaths] = useState(() => { try { return Number(localStorage.getItem('game.deaths')) || 0; } catch { return 0; } });
  const deathsRef = useRef(deaths);
  useEffect(() => { deathsRef.current = deaths; }, [deaths]);
  const [wave, setWave] = useState(1);
  const [scoreLabel, setScoreLabel] = useState(() => {
    try { return localStorage.getItem('game.scoreLabel') || 'Flameos'; } catch { return 'Flameos'; }
  });
  const [hpDisplay, setHpDisplay] = useState(100);
  const [enemiesLeft, setEnemiesLeft] = useState(0);
  const [shopOpen, setShopOpen] = useState(false);
  const [upgradeLevel, setUpgradeLevel] = useState(() => {
    try { return Number(localStorage.getItem('game.upgradeLevel')) || 1; } catch { return 1; }
  });
  const [onlinePeers, setOnlinePeers] = useState<string[]>([]);
  const [onlinePeerShips, setOnlinePeerShips] = useState<Ship[]>([]);
  const [killMessage, setKillMessage] = useState<string | null>(null);
  const [notificationMessage, setNotificationMessage] = useState<string | null>(null);
  const [renameLabelOpen, setRenameLabelOpen] = useState(false);
  const [pendingScoreLabel, setPendingScoreLabel] = useState(scoreLabel);
  const [secretUnlocked, setSecretUnlocked] = useState(false);
  const [purpleBeamEnabled, setPurpleBeamEnabled] = useState(() => { try { return localStorage.getItem('game.purpleBeam') !== '0'; } catch { return true; } });
  const [purpleBeamCosmetic, setPurpleBeamCosmetic] = useState(() => { try { return localStorage.getItem('game.purpleBeamCosmetic') !== '0'; } catch { return true; } });
  const [publishPassword, setPublishPassword] = useState(() => { try { return localStorage.getItem('game.publishPassword') || ''; } catch { return ''; } });
  const crosshairRef = useRef<{ x: number; y: number; active: boolean; world: Vec }>({ x: 0, y: 0, active: false, world: { x: 400, y: 400 } });
  const killPopupTimeoutRef = useRef<number | null>(null);
  const notificationTimeoutRef = useRef<number | null>(null);
  const peerPresenceRef = useRef<Record<string, { username: string; timestamp: number }>>({});
  const onlinePeerShipsRef = useRef<Ship[]>([]);
  const broadcastChannelRef = useRef<BroadcastChannel | null>(null);
  const ownPeerIdRef = useRef(`peer-${Math.random().toString(36).slice(2, 10)}`);
  const presenceIntervalRef = useRef<number | null>(null);
  const requestPresenceRefresh = useRef<() => void>(() => {});
  const messagePrefix = "distant-fire-online-msg:";
  const shopCosts = [0, 100, 250, 500];
  const maxUpgradeLevel = 4;
  const secretCodeRef = useRef("");
  const secretCode = "1945";
  const upgradeBonuses: Record<number, { damage: number; cooldown: number; maxHp: number; flame: boolean }> = {
    1: { damage: 18, cooldown: 0.18, maxHp: 100, flame: false },
    2: { damage: 22, cooldown: 0.16, maxHp: 110, flame: false },
    3: { damage: 28, cooldown: 0.14, maxHp: 125, flame: false },
    4: { damage: 34, cooldown: 0.12, maxHp: 140, flame: true },
  };
  const broadcastMessageRef = useRef<(payload: MessagePayload) => void>(() => {});

  // Helper functions for UI notifications
  const showKillPopup = (message: string) => {
    setKillMessage(message);
    if (killPopupTimeoutRef.current !== null) {
      window.clearTimeout(killPopupTimeoutRef.current);
    }
    killPopupTimeoutRef.current = window.setTimeout(() => {
      setKillMessage(null);
      killPopupTimeoutRef.current = null;
    }, 2000);
  };

  const showNotification = (message: string) => {
    setNotificationMessage(message);
    if (notificationTimeoutRef.current !== null) {
      window.clearTimeout(notificationTimeoutRef.current);
    }
    notificationTimeoutRef.current = window.setTimeout(() => {
      setNotificationMessage(null);
      notificationTimeoutRef.current = null;
    }, 3000);
  };

  useEffect(() => {
    try { localStorage.setItem('game.username', username); } catch {}
  }, [username]);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const channelName = "distant-fire-online";
    const peerPrefix = "distant-fire-online-peer:";
    let channel: BroadcastChannel | null = null;
    let active = true;

    type RawPeerPayload = {
      username: string;
      timestamp: number;
      pos: Vec;
      facing: 1 | -1;
      bob: number;
      hp: number;
      maxHp: number;
      vel: Vec;
      score: number;
      kills?: number;
      deaths?: number;
    };

    const readAllPeers = () => {
      const peers: Record<string, RawPeerPayload> = {};
      for (let i = 0; i < window.localStorage.length; i++) {
        const key = window.localStorage.key(i);
        if (!key || !key.startsWith(peerPrefix)) continue;
        try {
          const value = window.localStorage.getItem(key);
          if (!value) continue;
          const parsed = JSON.parse(value) as RawPeerPayload;
          peers[key.slice(peerPrefix.length)] = parsed;
        } catch {
          // ignore invalid entries
        }
      }
      return peers;
    };

    const syncPeers = (peers: Record<string, RawPeerPayload>) => {
      const now = Date.now();
      const valid: Record<string, RawPeerPayload> = {};
      const shipList: Ship[] = [];
      for (const [id, peer] of Object.entries(peers)) {
        if (id === ownPeerIdRef.current) continue;
        if (now - peer.timestamp <= 8000) {
          valid[id] = peer;
          shipList.push({
            pos: peer.pos,
            vel: peer.vel,
            hp: peer.hp,
            maxHp: peer.maxHp,
            faction: "player",
            cooldown: 0,
            width: 220,
            height: 90,
            bob: peer.bob,
            facing: peer.facing,
            name: peer.username,
            id,
            score: peer.score,
            kills: peer.kills ?? 0,
            deaths: peer.deaths ?? 0,
          });
        } else {
          window.localStorage.removeItem(peerPrefix + id);
        }
      }
      peerPresenceRef.current = Object.fromEntries(
        Object.entries(valid).map(([id, peer]) => [id, { username: peer.username, timestamp: peer.timestamp }])
      );
      onlinePeerShipsRef.current = shipList;
      setOnlinePeers(Object.values(valid).map(peer => peer.username));
      setOnlinePeerShips(shipList);
    };

    const broadcastMessage = (payload: MessagePayload) => {
      if (channel) {
        channel.postMessage(payload);
        return;
      }
      try {
        const key = messagePrefix + Math.random().toString(36).slice(2, 10);
        window.localStorage.setItem(key, JSON.stringify(payload));
        window.setTimeout(() => {
          try { window.localStorage.removeItem(key); } catch {}
        }, 500);
      } catch {
        // ignore storage issues
      }
    };

    broadcastMessageRef.current = broadcastMessage;

    const handleMessage = (payload: MessagePayload) => {
      if (!active) return;
      if (payload.type === "presence-refresh") {
        const peers = readAllPeers();
        syncPeers(peers);
        return;
      }
      if (payload.type === "peer-bullet") {
        const s = stateRef.current;
        if (!s) return;
        s.bullets.push({
          pos: { x: payload.pos.x, y: payload.pos.y },
          vel: { x: payload.vel.x, y: payload.vel.y },
          life: 2,
          faction: "player",
          damage: payload.damage,
          kind: payload.kind,
          aoe: payload.aoe,
          peerBullet: true,
          sourceId: payload.sourceId,
        });
        return;
      }
      if (payload.type === "peer-hit") {
        if (payload.targetId === ownPeerIdRef.current) {
          const s = stateRef.current;
          if (!s) return;
          const peer = s.player;
          peer.hp = payload.hp;
          setHpDisplay(Math.max(0, Math.round(payload.hp)));
          explode(payload.pos.x, payload.pos.y, false);
          requestPresenceRefresh.current();
        }
        if (payload.sourceId === ownPeerIdRef.current) {
          onlinePeerShipsRef.current = onlinePeerShipsRef.current.map(peer => {
            if (peer.id === payload.targetId) {
              return { ...peer, hp: payload.hp };
            }
            return peer;
          }).filter(peer => peer.hp > 0);
          setOnlinePeerShips([...onlinePeerShipsRef.current]);
          explode(payload.pos.x, payload.pos.y, false);
        }
        return;
      }
      if (payload.type === "peer-kill") {
        if (payload.sourceId === ownPeerIdRef.current) {
          setScore((sc) => sc + payload.reward);
          showKillPopup("Airship down!!!!");
          setKills(k => k + 1);
          onlinePeerShipsRef.current = onlinePeerShipsRef.current.filter(peer => peer.id !== payload.targetId);
          setOnlinePeerShips([...onlinePeerShipsRef.current]);
          const s = stateRef.current;
          if (s) {
            explode(payload.pos.x, payload.pos.y, true);
          }
        }
        if (payload.targetId === ownPeerIdRef.current) {
          const s = stateRef.current;
          if (!s) return;
          explode(payload.pos.x, payload.pos.y, true);
        }
        return;
      }
    };

    const updateLocalPresence = () => {
      const payload = { username, timestamp: Date.now(), pos: stateRef.current?.player.pos ?? { x: 0, y: 0 }, facing: stateRef.current?.player.facing ?? 1, bob: stateRef.current?.player.bob ?? 0, hp: stateRef.current?.player.hp ?? 100, maxHp: stateRef.current?.player.maxHp ?? 100, vel: stateRef.current?.player.vel ?? { x: 0, y: 0 }, score: scoreRef.current, kills: killsRef.current, deaths: deathsRef.current };
      try {
        window.localStorage.setItem(peerPrefix + ownPeerIdRef.current, JSON.stringify(payload));
      } catch {
        // ignore storage errors
      }
      const peers = readAllPeers();
      syncPeers(peers);
      broadcastMessage({ type: "presence-refresh" });
    };

    const removeLocalPresence = () => {
      try {
        window.localStorage.removeItem(peerPrefix + ownPeerIdRef.current);
      } catch {
        // ignore storage errors
      }
      const peers = readAllPeers();
      syncPeers(peers);
      broadcastMessage({ type: "presence-refresh" });
    };

    const onStorage = (event: StorageEvent) => {
      if (!event.key) return;
      if (event.key.startsWith(peerPrefix)) {
        const peers = readAllPeers();
        syncPeers(peers);
        return;
      }
      if (event.key.startsWith(messagePrefix) && event.newValue) {
        try {
          const payload = JSON.parse(event.newValue) as MessagePayload;
          handleMessage(payload);
        } catch {
          // ignore invalid message
        }
      }
    };

    const onBroadcast = (event: MessageEvent) => {
      const data = event.data as MessagePayload | undefined;
      if (!active || !data) return;
      handleMessage(data);
    };

    if (page === "game" && gameMode === "online") {
      if (typeof window.BroadcastChannel !== "undefined") {
        channel = new BroadcastChannel(channelName);
        channel.onmessage = onBroadcast;
      }
      window.addEventListener("storage", onStorage);
      updateLocalPresence();
      requestPresenceRefresh.current = updateLocalPresence;
      presenceIntervalRef.current = window.setInterval(updateLocalPresence, 1000);
    }

    return () => {
      active = false;
      if (presenceIntervalRef.current !== null) {
        window.clearInterval(presenceIntervalRef.current);
        presenceIntervalRef.current = null;
      }
      if (page === "game" && gameMode === "online") {
        removeLocalPresence();
      }
      if (channel) {
        channel.close();
      }
      window.removeEventListener("storage", onStorage);
      peerPresenceRef.current = {};
      onlinePeerShipsRef.current = [];
      setOnlinePeers([]);
      setOnlinePeerShips([]);
    };
  }, [page, gameMode, username]);

  // Input state, refs to avoid re-renders
  const keys = useRef<Record<string, boolean>>({});
  const joy = useRef<{ active: boolean; cx: number; cy: number; dx: number; dy: number; id: number | null }>({
    active: false, cx: 0, cy: 0, dx: 0, dy: 0, id: null,
  });
  const firing = useRef(false);
  const fireTouchId = useRef<number | null>(null);
  const audioUnlocked = useRef(false);
  const audioContextRef = useRef<AudioContext | null>(null);
  const audioGainRef = useRef<GainNode | null>(null);

  const [showTouchControls, setShowTouchControls] = useState(false);
  const touchedRef = useRef(false);

  const teleportToPeer = () => {
    if (page !== "game" || gameMode !== "online") return;
    if (onlinePeerShips.length === 0) {
      window.alert("No online players available to teleport to.");
      return;
    }
    const list = onlinePeerShips.map((peer, index) => `${index + 1}. ${peer.name || "Pilot"}`).join("\n");
    const input = window.prompt(`Teleport to player:\n${list}\n\nEnter number or exact name:`);
    if (!input) return;
    let target: Ship | undefined;
    const index = Number(input.trim());
    if (!Number.isNaN(index) && index >= 1 && index <= onlinePeerShips.length) {
      target = onlinePeerShips[index - 1];
    } else {
      target = onlinePeerShips.find(peer => peer.name?.toLowerCase() === input.trim().toLowerCase());
    }
    if (!target) {
      showNotification("Player not found.");
      return;
    }
    const player = stateRef.current?.player;
    if (!player) return;
    player.pos = { x: target.pos.x + target.facing * 120, y: target.pos.y };
    player.vel = { x: 0, y: 0 };
    player.facing = target.facing;
    player.bob = target.bob;
    setStatus("playing");
    statusRef.current = "playing";
  };

  useEffect(() => {
    if (typeof window === "undefined") return;
    const isTouchCapable = 'ontouchstart' in window || navigator.maxTouchPoints > 0 || (navigator as any).msMaxTouchPoints > 0;
    const isSmall = window.innerWidth <= 768;
    // Only auto-show immediately for small screens that are touch-capable (mobile/tablet)
    if (isSmall && isTouchCapable) setShowTouchControls(true);

    const onPointerDownGlobal = (e: PointerEvent) => {
      if ((e as any).pointerType === 'touch') {
        touchedRef.current = true;
        setShowTouchControls(true);
      }
    };
    const onTouchStart = () => {
      touchedRef.current = true;
      setShowTouchControls(true);
    };
    const onResize = () => {
      const small = window.innerWidth <= 768;
      if (small && isTouchCapable) setShowTouchControls(true);
      else if (!small && !touchedRef.current) setShowTouchControls(false);
    };

    window.addEventListener('pointerdown', onPointerDownGlobal);
    window.addEventListener('touchstart', onTouchStart as any, { passive: true } as any);
    window.addEventListener('resize', onResize);
    return () => {
      window.removeEventListener('pointerdown', onPointerDownGlobal);
      window.removeEventListener('touchstart', onTouchStart as any);
      window.removeEventListener('resize', onResize);
    };
  }, []);

  useEffect(() => {
    try { localStorage.setItem('game.upgradeLevel', String(upgradeLevel)); } catch {}
  }, [upgradeLevel]);

  useEffect(() => {
    try { localStorage.setItem('game.purpleBeam', purpleBeamEnabled ? '1' : '0'); } catch {}
  }, [purpleBeamEnabled]);

  useEffect(() => {
    try { localStorage.setItem('game.purpleBeamCosmetic', purpleBeamCosmetic ? '1' : '0'); } catch {}
  }, [purpleBeamCosmetic]);

  // If the main purple beam feature is disabled, also disable cosmetic beams so
  // the game reverts to original orange bullets.
  useEffect(() => {
    if (!purpleBeamEnabled && purpleBeamCosmetic) setPurpleBeamCosmetic(false);
  }, [purpleBeamEnabled]);

  // When the purple-beam feature is toggled, update the current player's weapon
  // so enabling takes effect immediately if the player has beam-capable upgrade.
  useEffect(() => {
    const s = stateRef.current;
    if (!s) return;
    const p = s.player;
    if (!p) return;
    applyUpgradeToPlayer(p);
  }, [purpleBeamEnabled, secretUnlocked]);

  // Ensure changes to upgrade level take effect immediately for the current player
  useEffect(() => {
    const s = stateRef.current;
    if (!s) return;
    applyUpgradeToPlayer(s.player);
  }, [upgradeLevel]);

  // When disabling the main purple-beam feature, remove any lingering cosmetic
  // beam bullets (damage === 0) so visuals update immediately.
  useEffect(() => {
    if (purpleBeamEnabled) return;
    const s = stateRef.current;
    if (!s) return;
    s.bullets = s.bullets.filter(b => !(b.kind === 'beam' && (b.damage ?? 0) === 0 && b.faction === 'player'));
  }, [purpleBeamEnabled]);

  const applyUpgradeToPlayer = (player: Ship) => {
    const bonus = upgradeBonuses[upgradeLevel] ?? upgradeBonuses[1];
    const beamUnlocked = purpleBeamEnabled;

    player.weaponDamage = bonus.damage;
    player.weaponCooldown = bonus.cooldown;
    player.weaponStyle = beamUnlocked ? "beam" : "projectile";
    player.hp = Math.min(player.hp || bonus.maxHp, player.maxHp);
    player.upgradeLevel = upgradeLevel;

    const cd = player.weaponCooldown ?? 0.18;
    player.cooldown = Math.max(0, player.cooldown);
    player.cooldown = Math.max(player.cooldown, cd);
  };

  const renameScoreLabel = () => {
    try {
      const v = window.prompt('Set label for score:', scoreLabel) || scoreLabel;
      setScoreLabel(v);
      localStorage.setItem('game.scoreLabel', v);
    } catch (e) {
      // ignore
    }
  };

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

  // Init game state when the player starts
  useEffect(() => {
    if (page !== "game" || stateRef.current) return;
    restart();
  }, [page]);

  function spawnWave(n: number) {
    const s = stateRef.current!;
    const count = 5 + (n - 1) * 2;
    const enemies: Ship[] = [];
    for (let i = 0; i < count; i++) {
      enemies.push({
        pos: { x: 1200 + i * 500 + Math.random() * 300, y: 300 + Math.random() * (WORLD.h - 600) },
        vel: { x: 0, y: 0 },
        hp: 60 + (n - 1) * 12, maxHp: 60 + (n - 1) * 12,
        faction: 'enemy', cooldown: Math.random() * 2, width: 180, height: 80, bob: Math.random() * Math.PI * 2, facing: -1,
      });
    }
    s.enemies = enemies;
    setEnemiesLeft(enemies.length);
  }

  // Input handlers
  useEffect(() => {
    const kd = (e: KeyboardEvent) => {
      const key = e.key.toLowerCase();
      if (key === "p") {
        setStatus((prev) => {
          const next = prev === "playing" ? "paused" : prev === "paused" ? "playing" : prev;
          statusRef.current = next;
          return next;
        });
      }
      if (/^[0-9]$/.test(key)) {
        secretCodeRef.current = (secretCodeRef.current + key).slice(-secretCode.length);
        if (secretCodeRef.current === secretCode) {
          secretCodeRef.current = "";
          setSecretUnlocked(true);
          setShopOpen(true);
          setScore((sc) => sc + 1000);
          window.alert("Secret code 1945 activated! You received 1000 Flameos.");
        }
      } else if (/^[a-z]$/.test(key)) {
        // allow normal keyboard controls without breaking secret code entry
      } else {
        secretCodeRef.current = "";
      }
      keys.current[key] = true;
      if (e.key === " ") firing.current = true;
    };
    const ku = (e: KeyboardEvent) => {
      keys.current[e.key.toLowerCase()] = false;
      if (e.key === " ") firing.current = false;
    };
    window.addEventListener("keydown", kd);
    window.addEventListener("keyup", ku);
    return () => {
      window.removeEventListener("keydown", kd);
      window.removeEventListener("keyup", ku);
    };
  }, []);

  useEffect(() => {
    if (page !== "game" || status !== "playing") {
      firing.current = false;
    }
  }, [page, status]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

      const updateCrosshair = (e: PointerEvent) => {
      if (page !== "game") return;
      const rect = canvas.getBoundingClientRect();
      const sx = e.clientX - rect.left;
      const sy = e.clientY - rect.top;
      if (sx < 0 || sy < 0 || sx > rect.width || sy > rect.height) {
        crosshairRef.current.active = false;
        return;
      }
      crosshairRef.current.active = true;
      crosshairRef.current.x = sx;
      crosshairRef.current.y = sy;
      const s = stateRef.current;
      if (!s) return;
      const zoom = Math.min(1, Math.max(0.45, rect.width / 1100));
      const worldX = s.camera.x + sx / zoom;
      const worldY = s.camera.y + sy / zoom;
      crosshairRef.current.world = {
        x: Math.max(0, Math.min(WORLD.w, worldX)),
        y: Math.max(0, Math.min(WORLD.h, worldY)),
      };
    };

    const onDown = (e: PointerEvent) => {
      if (e.pointerType !== "touch" && e.button === 0) {
        firing.current = true;
      }
    };
    const onUp = (e: PointerEvent) => {
      if (e.pointerType !== "touch" && e.button === 0) {
        firing.current = false;
      }
    };
    const onLeave = () => {
      crosshairRef.current.active = false;
    };

    canvas.addEventListener("pointermove", updateCrosshair);
    canvas.addEventListener("pointerleave", onLeave);
    canvas.addEventListener("pointerdown", onDown);
    canvas.addEventListener("pointerup", onUp);
    return () => {
      canvas.removeEventListener("pointermove", updateCrosshair);
      canvas.removeEventListener("pointerleave", onLeave);
      canvas.removeEventListener("pointerdown", onDown);
      canvas.removeEventListener("pointerup", onUp);
    };
  }, [page]);

  useEffect(() => {
    if (page !== "game" || status !== "playing") {
      crosshairRef.current.active = false;
    }
  }, [page, status]);

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

  function explode(x: number, y: number, big = false, purple = false) {
    const s = stateRef.current!;
    s.shake = Math.min(s.shake + (big ? 28 : 7), 40);
    const ringColor = purple ? "#c16cff" : "#ffe9b0";
    const flashColor = purple ? "#f0adff" : "#ffffff";
    const palette = purple
      ? ["#e2b2ff", "#c16cff", "#9f4cff", "#7222ff", "#3f00ff"]
      : ["#fff2a8", "#ffcf3a", "#ff8a3d", "#ff4a1a", "#b32018"];

    s.particles.push({
      pos: { x, y }, vel: { x: 0, y: 0 },
      life: big ? 0.5 : 0.3, maxLife: big ? 0.5 : 0.3,
      color: ringColor, size: big ? 14 : 6, kind: "ring",
    });
    if (big) {
      s.particles.push({
        pos: { x, y }, vel: { x: 0, y: 0 },
        life: 0.18, maxLife: 0.18,
        color: flashColor, size: 220, kind: "fire",
      });
    }
    const n = big ? 110 : 28;
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = 80 + Math.random() * (big ? 520 : 220);
      s.particles.push({
        pos: { x, y },
        vel: { x: Math.cos(a) * sp, y: Math.sin(a) * sp },
        life: 0.5 + Math.random() * (big ? 1.2 : 0.6),
        maxLife: big ? 1.4 : 0.9,
        color: palette[(Math.random() * palette.length) | 0],
        size: 5 + Math.random() * (big ? 18 : 9),
        kind: "fire",
      });
    }
    // embers (long trailing sparks)
    for (let i = 0; i < (big ? 40 : 12); i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = 150 + Math.random() * (big ? 450 : 250);
      s.particles.push({
        pos: { x, y },
        vel: { x: Math.cos(a) * sp, y: Math.sin(a) * sp - 40 },
        life: 0.8 + Math.random() * 1.4, maxLife: 2,
        color: Math.random() < 0.5 ? "#ffd66b" : "#ff6a2a",
        size: 2 + Math.random() * 2, kind: "ember",
      });
    }
    // chunky smoke
    for (let i = 0; i < (big ? 50 : 12); i++) {
      s.particles.push({
        pos: { x: x + (Math.random() - 0.5) * 40, y: y + (Math.random() - 0.5) * 40 },
        vel: { x: (Math.random() - 0.5) * 70, y: -30 - Math.random() * 60 },
        life: 1.8 + Math.random() * 2, maxLife: 3.5,
        color: Math.random() < 0.5 ? "#2a1f1c" : "#5a4a44",
        size: 14 + Math.random() * 28, kind: "smoke",
      });
    }
    // debris chunks for big explosions
    if (big) {
      for (let i = 0; i < 18; i++) {
        const a = Math.random() * Math.PI * 2;
        const sp = 200 + Math.random() * 400;
        s.particles.push({
          pos: { x, y },
          vel: { x: Math.cos(a) * sp, y: Math.sin(a) * sp - 120 },
          life: 1.4 + Math.random() * 1.2, maxLife: 2.5,
          color: ["#6e4a2a", "#3a2a1a", "#1a1a1e"][(Math.random() * 3) | 0],
          size: 4 + Math.random() * 8, kind: "debris",
          rot: Math.random() * Math.PI * 2, vrot: (Math.random() - 0.5) * 10,
        });
      }
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
    const damage = ship.weaponDamage ?? (ship.faction === "player" ? 18 : 10);
    const beamMode = ship.weaponStyle === "beam" && purpleBeamEnabled;
    const kind: "normal" | "flame" | "beam" = beamMode ? "beam" : ship.flame ? "flame" : "normal";
    const aoe = !!ship.flame;
    const bullet = {
      pos: { x: muzzleX, y: muzzleY },
      vel: { x: (dx / len) * speed, y: (dy / len) * speed },
      target: beamMode ? { x: targetX, y: targetY } : undefined,
      life: beamMode ? 0.28 : 2,
      faction: ship.faction,
      damage,
      kind,
      aoe,
      sourceId: ship.faction === "player" ? ownPeerIdRef.current : undefined,
    } as Bullet;
    s.bullets.push(bullet);

    // Cosmetic purple-beam overlay when firing projectiles (local only)
    if (!beamMode && ship.faction === 'player' && purpleBeamCosmetic && purpleBeamEnabled) {
      const muzzleX2 = ship.pos.x + ship.facing * (ship.width * 0.42);
      const muzzleY2 = ship.pos.y - ship.height * 0.05;
      const vb: Bullet = {
        pos: { x: muzzleX2, y: muzzleY2 },
        vel: { x: 0, y: 0 },
        target: { x: targetX, y: targetY },
        life: 0.28,
        faction: ship.faction,
        damage: 0,
        kind: 'beam',
      };
      s.bullets.push(vb);
    }

    if (gameModeRef.current === "online" && ship.faction === "player" && !bullet.peerBullet) {
      const payload: MessagePayload = {
        type: "peer-bullet",
        sourceId: ownPeerIdRef.current,
        damage,
        kind,
        pos: bullet.pos,
        vel: bullet.vel,
        aoe,
        target: bullet.target,
      };
      broadcastMessageRef.current(payload);
    }

    const splashes = beamMode ? 6 : 8;
    for (let i = 0; i < splashes; i++) {
      const a = Math.atan2(dy, dx) + (Math.random() - 0.5) * 0.5;
      s.particles.push({
        pos: { x: muzzleX, y: muzzleY },
        vel: { x: Math.cos(a) * 240, y: Math.sin(a) * 240 },
        life: beamMode ? 0.32 : 0.28,
        maxLife: beamMode ? 0.32 : 0.28,
        color: beamMode ? "#c86cff" : ship.faction === "player" ? "#ff5a2a" : "#ffcf3a",
        size: beamMode ? 9 : 6, kind: "spark",
      });
    }

    if (beamMode && bullet.target) {
      for (let i = 0; i < 3; i++) {
        const t = i / 2;
        const px = muzzleX + (targetX - muzzleX) * t + (Math.random() - 0.5) * 20;
        const py = muzzleY + (targetY - muzzleY) * t + (Math.random() - 0.5) * 20;
        s.particles.push({
          pos: { x: px, y: py },
          vel: { x: (Math.random() - 0.5) * 80, y: (Math.random() - 0.5) * 80 },
          life: 0.24, maxLife: 0.24,
          color: "#a76cff",
          size: 12,
          kind: "ember",
        });
      }
    }

    s.shake = Math.min(s.shake + (beamMode ? 8 : 2), 14);
  }

  function beamIntersectsShip(b: Bullet, ship: Ship) {
    if (b.kind !== "beam" || !b.target) return false;
    const dx = b.target.x - b.pos.x;
    const dy = b.target.y - b.pos.y;
    const len = Math.hypot(dx, dy);
    if (len === 0) return false;
    const t = ((ship.pos.x - b.pos.x) * dx + (ship.pos.y - b.pos.y) * dy) / (len * len);
    const clamped = Math.max(0, Math.min(1, t));
    const closestX = b.pos.x + dx * clamped;
    const closestY = b.pos.y + dy * clamped;
    const distX = Math.abs(closestX - ship.pos.x);
    const distY = Math.abs(closestY - ship.pos.y);
    return distX < ship.width * 0.38 && distY < ship.height * 0.55;
  }

  function tick(dt: number) {
    const s = stateRef.current;
    if (!s) return;
    if (statusRef.current !== "playing") return;
    s.time += dt;

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
    // Clamp cooldown so dt spikes / repeated calls can’t create “double shots”.
    p.cooldown = Math.max(0, p.cooldown - dt);
    if (firing.current && p.cooldown <= 0) {
      let tx = p.pos.x + p.facing * 600;
      let ty = p.pos.y;
      if (crosshairRef.current.active) {
        tx = crosshairRef.current.world.x;
        ty = crosshairRef.current.world.y;
      } else if (gameModeRef.current !== "online") {
        let best = Infinity;
        for (const e of s.enemies) {
          const dx = e.pos.x - p.pos.x;
          if (Math.sign(dx) !== p.facing) continue;
          const d = Math.hypot(dx, e.pos.y - p.pos.y);
          if (d < best) { best = d; tx = e.pos.x; ty = e.pos.y; }
        }
      } else {
        const peers = onlinePeerShipsRef.current;
        let best = Infinity;
        for (const peer of peers) {
          const dx = peer.pos.x - p.pos.x;
          if (Math.sign(dx) !== p.facing) continue;
          const d = Math.hypot(dx, peer.pos.y - p.pos.y);
          if (d < best) { best = d; tx = peer.pos.x; ty = peer.pos.y; }
        }
      }
      fireFromShip(p, tx, ty);
      p.cooldown = Math.max(0.01, p.weaponCooldown ?? 0.18);
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
      if (b.kind !== "beam") {
        b.pos.x += b.vel.x * dt;
        b.pos.y += b.vel.y * dt;
      } else if (b.faction === "player" && b.sourceId === ownPeerIdRef.current) {
        const player = s.player;
        const muzzleX = player.pos.x + player.facing * (player.width * 0.42);
        const muzzleY = player.pos.y - player.height * 0.05;
        b.pos.x += (muzzleX - b.pos.x) * Math.min(1, dt * 15);
        b.pos.y += (muzzleY - b.pos.y) * Math.min(1, dt * 15);
      }
      b.life -= dt;
    }
    s.bullets = s.bullets.filter(b => b.life > 0);

    const checkHit = (b: Bullet, ship: Ship) => {
      if (b.kind === "beam") return beamIntersectsShip(b, ship);
      return Math.abs(b.pos.x - ship.pos.x) < ship.width * 0.42 && Math.abs(b.pos.y - ship.pos.y) < ship.height * 0.55;
    };

    // Collisions
    for (const b of s.bullets) {
      if (b.faction === "player") {
        if (gameModeRef.current !== "online") {
          for (const e of s.enemies) {
            if (e.hp <= 0) continue;
                  if (checkHit(b, e)) {
                    // Purple beam insta-kill option
                    if (b.kind === "beam" && purpleBeamEnabled && b.damage > 0) {
                      e.hp = 0;
                      b.life = 0;
                      const reward = 50;
                      explode(e.pos.x, e.pos.y, true, true);
                      setScore(sc => sc + reward);
                      setKills(k => k + 1);
                      showKillPopup("Airship down!!!!");
                    } else {
                      e.hp -= b.damage;
                      b.life = 0;
                      explode(b.pos.x, b.pos.y, false);
                      if (e.hp <= 0) {
                        const reward = b.kind === "beam" ? 50 : 10;
                        explode(e.pos.x, e.pos.y, true, b.kind === "beam");
                        setScore(sc => sc + reward);
                        setKills(k => k + 1);
                        showKillPopup("Airship down!!!!");
                      }
                    }
                  }
          }
        } else if (b.peerBullet) {
          if (p.hp > 0 && checkHit(b, p)) {
            const wasAlive = p.hp > 0;
            // Insta-kill if a beam and purple-beam enabled
            if (b.kind === "beam" && purpleBeamEnabled && b.damage > 0) {
              p.hp = 0;
              b.life = 0;
              explode(p.pos.x, p.pos.y, true, true);
              s.shake = Math.min(s.shake + 6, 25);
              if (b.sourceId) {
                broadcastMessageRef.current({
                  type: "peer-kill",
                  sourceId: b.sourceId,
                  targetId: ownPeerIdRef.current,
                  reward: 50,
                  pos: { x: p.pos.x, y: p.pos.y },
                  beam: true,
                });
              }
            } else {
              p.hp -= b.damage;
              b.life = 0;
              explode(b.pos.x, b.pos.y, false);
              s.shake = Math.min(s.shake + 6, 25);
              if (b.sourceId) {
                if (p.hp > 0) {
                  broadcastMessageRef.current({
                    type: "peer-hit",
                    sourceId: b.sourceId,
                    targetId: ownPeerIdRef.current,
                    hp: p.hp,
                    pos: { x: b.pos.x, y: b.pos.y },
                  });
                } else if (wasAlive) {
                  const reward = b.kind === "beam" ? 50 : 10;
                  broadcastMessageRef.current({
                    type: "peer-kill",
                    sourceId: b.sourceId,
                    targetId: ownPeerIdRef.current,
                    reward,
                    pos: { x: p.pos.x, y: p.pos.y },
                    beam: b.kind === "beam",
                  });
                }
              }
            }
          }
        } else {
          for (const peer of onlinePeerShipsRef.current) {
            if (peer.hp <= 0) continue;
            if (checkHit(b, peer)) {
              const wasAlive = peer.hp > 0;
              // Insta-kill behavior for purple beam when enabled
              if (b.kind === "beam" && purpleBeamEnabled && b.damage > 0) {
                peer.hp = 0;
                b.life = 0;
                s.shake = Math.min(s.shake + 6, 25);
                setOnlinePeerShips([...onlinePeerShipsRef.current]);
                if (b.sourceId && peer.id) {
                  const reward = 50;
                  setScore(sc => sc + reward);
                  setKills(k => k + 1);
                  onlinePeerShipsRef.current = onlinePeerShipsRef.current.filter(item => item.id !== peer.id);
                  setOnlinePeerShips([...onlinePeerShipsRef.current]);
                  broadcastMessageRef.current({
                    type: "peer-kill",
                    sourceId: b.sourceId,
                    targetId: peer.id,
                    reward,
                    pos: { x: peer.pos.x, y: peer.pos.y },
                    beam: true,
                  });
                  explode(peer.pos.x, peer.pos.y, true, true);
                  showKillPopup("Airship down!!!!");
                }
              } else {
                peer.hp = Math.max(0, peer.hp - b.damage);
                b.life = 0;
                explode(b.pos.x, b.pos.y, false);
                s.shake = Math.min(s.shake + 6, 25);
                setOnlinePeerShips([...onlinePeerShipsRef.current]);
                if (b.sourceId) {
                  if (peer.id) {
                    if (peer.hp > 0) {
                      broadcastMessageRef.current({
                        type: "peer-hit",
                        sourceId: b.sourceId,
                        targetId: peer.id,
                        hp: peer.hp,
                        pos: { x: b.pos.x, y: b.pos.y },
                      });
                    } else if (wasAlive) {
                      const reward = b.kind === "beam" ? 50 : 10;
                      setScore(sc => sc + reward);
                      setKills(k => k + 1);
                      onlinePeerShipsRef.current = onlinePeerShipsRef.current.filter(item => item.id !== peer.id);
                      setOnlinePeerShips([...onlinePeerShipsRef.current]);
                      broadcastMessageRef.current({
                        type: "peer-kill",
                        sourceId: b.sourceId,
                        targetId: peer.id,
                        reward,
                        pos: { x: peer.pos.x, y: peer.pos.y },
                        beam: b.kind === "beam",
                      });
                      explode(peer.pos.x, peer.pos.y, true, b.kind === "beam");
                      showKillPopup("Airship down!!!!");
                    }
                  }
                }
              }
              break;
            }
          }
        }
      } else {
        if (p.hp > 0 && checkHit(b, p)) {
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

    if (p.hp <= 0 && statusRef.current === "playing") {
      setDeaths(d => d + 1);
      setStatus("lost");
      setPage("menu");
    }
    if (s.enemies.length === 0 && statusRef.current === "playing" && gameModeRef.current !== "online") {
      // wave cleared: save flameos and advance to next wave while keeping score
      // Do not persist flameos (score) per user request — keep runtime-only
      const next = wave + 1;
      setWave(next);
      // small delay before spawning next wave so player can see effect briefly
      setTimeout(() => {
        spawnWave(next);
      }, 600);
    }

    // Particles
    for (const pa of s.particles) {
      pa.pos.x += pa.vel.x * dt;
      pa.pos.y += pa.vel.y * dt;
      if (pa.kind === "ring") {
        pa.size += 600 * dt;
      } else if (pa.kind === "debris" || pa.kind === "ember") {
        pa.vel.x *= Math.pow(0.6, dt);
        pa.vel.y += 300 * dt; // gravity
        if (pa.vrot != null && pa.rot != null) pa.rot += pa.vrot * dt;
      } else {
        pa.vel.x *= Math.pow(0.5, dt);
        if (pa.kind === "smoke") pa.vel.y -= 20 * dt;
      }
      pa.life -= dt;
    }
    s.particles = s.particles.filter(pa => pa.life > 0);
    if (s.particles.length > 900) s.particles.splice(0, s.particles.length - 900);


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
    if (gameModeRef.current !== "online") {
      s.camera.x = Math.max(0, Math.min(WORLD.w - evw, s.camera.x));
      s.camera.y = Math.max(0, Math.min(WORLD.h - evh, s.camera.y));
    }
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
    for (const peer of onlinePeerShipsRef.current) {
      drawShip(ctx, peer, s.time, false);
      ctx.fillStyle = "#fff";
      ctx.font = "14px ui-sans-serif, system-ui, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(peer.name || "Pilot", peer.pos.x, peer.pos.y - peer.height - 12);
    }
    for (const e of s.enemies) drawShip(ctx, e, s.time, true);

    let beamAmbient = 0;
    const beamNearPlayer = (b: Bullet) => {
      if (b.kind !== "beam" || !b.target) return false;
      const px = s.player.pos.x;
      const py = s.player.pos.y;
      const dx = b.target.x - b.pos.x;
      const dy = b.target.y - b.pos.y;
      const len = Math.hypot(dx, dy) || 1;
      const t = Math.max(0, Math.min(1, ((px - b.pos.x) * dx + (py - b.pos.y) * dy) / (len * len)));
      const closestX = b.pos.x + dx * t;
      const closestY = b.pos.y + dy * t;
      const dist = Math.hypot(px - closestX, py - closestY);
      return dist < 420;
    };

    for (const b of s.bullets) {
      if (b.kind === "beam" && b.target) {
        const extra = purpleBeamEnabled ? (beamNearPlayer(b) ? 0.36 : 0.12) : (beamNearPlayer(b) ? 0.18 : 0.06);
        beamAmbient = Math.max(beamAmbient, extra);
        ctx.save();
        const angle = Math.atan2(b.target.y - b.pos.y, b.target.x - b.pos.x);
        const length = Math.hypot(b.target.x - b.pos.x, b.target.y - b.pos.y);
        ctx.translate(b.pos.x, b.pos.y);
        ctx.rotate(angle);

        const shimmer = Math.sin((s.time * 6 + b.pos.x * 0.02) % (Math.PI * 2)) * 0.15 + 0.85;
        const coreGrad = ctx.createLinearGradient(0, 0, length, 0);
        coreGrad.addColorStop(0, `rgba(212,108,255,${0.9 * shimmer})`);
        coreGrad.addColorStop(0.35, `rgba(158,78,255,${0.75 * shimmer})`);
        coreGrad.addColorStop(0.65, `rgba(92,30,255,${0.65 * shimmer})`);
        coreGrad.addColorStop(1, `rgba(48,14,255,0.18)`);

        ctx.strokeStyle = "rgba(64, 0, 128, 0.58)";
        ctx.lineWidth = 26;
        ctx.shadowColor = "rgba(128,30,255,0.55)";
        ctx.shadowBlur = 32;
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(length, 0);
        ctx.stroke();

        ctx.fillStyle = coreGrad;
        ctx.fillRect(0, -16, length, 32);

        ctx.strokeStyle = `rgba(255,255,255,${0.24 + Math.sin(s.time * 10) * 0.05})`;
        ctx.lineWidth = 8;
        ctx.setLineDash([18, 12]);
        ctx.lineDashOffset = -s.time * 100;
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(length, 0);
        ctx.stroke();
        ctx.setLineDash([]);

        ctx.strokeStyle = "rgba(196,116,255,0.72)";
        ctx.lineWidth = 5;
        ctx.beginPath();
        ctx.moveTo(0, -8);
        ctx.lineTo(length, -8);
        ctx.moveTo(0, 8);
        ctx.lineTo(length, 8);
        ctx.stroke();

        ctx.shadowBlur = 0;
        ctx.restore();
      } else {
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
    }

    if (beamAmbient > 0) {
      ctx.save();
      ctx.resetTransform();
      ctx.globalCompositeOperation = "screen";
      const overlayAlpha = beamAmbient * (purpleBeamEnabled ? 1.1 : 0.8);
      ctx.fillStyle = `rgba(112, 24, 182, ${overlayAlpha})`;
      ctx.fillRect(0, 0, vw, vh);
      const playerScreenX = (s.player.pos.x - camX) * zoom;
      const playerScreenY = (s.player.pos.y - camY) * zoom;
      const glow = ctx.createRadialGradient(playerScreenX, playerScreenY, 0, playerScreenX, playerScreenY, Math.max(vw, vh) * 0.7);
      glow.addColorStop(0, `rgba(216, 108, 255, ${beamAmbient * (purpleBeamEnabled ? 0.9 : 0.45)})`);
      glow.addColorStop(1, "rgba(112, 24, 182, 0)");
      ctx.fillStyle = glow;
      ctx.fillRect(0, 0, vw, vh);
      ctx.globalCompositeOperation = "source-over";
      ctx.restore();
    }

    // Particles
    for (const pa of s.particles) {
      const a = Math.max(0, pa.life / pa.maxLife);
      ctx.globalAlpha = a;
      if (pa.kind === "smoke") {
        ctx.fillStyle = pa.color;
        ctx.beginPath(); ctx.arc(pa.pos.x, pa.pos.y, pa.size * (1.6 - a * 0.5), 0, Math.PI * 2); ctx.fill();
      } else if (pa.kind === "fire") {
        ctx.fillStyle = pa.color;
        ctx.shadowColor = pa.color; ctx.shadowBlur = 24;
        ctx.beginPath(); ctx.arc(pa.pos.x, pa.pos.y, pa.size * (0.4 + a * 0.8), 0, Math.PI * 2); ctx.fill();
        ctx.shadowBlur = 0;
      } else if (pa.kind === "ring") {
        ctx.strokeStyle = pa.color;
        ctx.lineWidth = pa.size * a + 1;
        ctx.shadowColor = pa.color; ctx.shadowBlur = 20;
        ctx.beginPath();
        ctx.arc(pa.pos.x, pa.pos.y, pa.size * 4, 0, Math.PI * 2);
        ctx.stroke();
        ctx.shadowBlur = 0;
      } else if (pa.kind === "ember") {
        ctx.fillStyle = pa.color;
        ctx.shadowColor = pa.color; ctx.shadowBlur = 10;
        const len = 6 + Math.hypot(pa.vel.x, pa.vel.y) * 0.02;
        const ang = Math.atan2(pa.vel.y, pa.vel.x);
        ctx.save();
        ctx.translate(pa.pos.x, pa.pos.y); ctx.rotate(ang);
        ctx.fillRect(-len, -pa.size / 2, len, pa.size);
        ctx.restore();
        ctx.shadowBlur = 0;
      } else if (pa.kind === "debris") {
        ctx.save();
        ctx.translate(pa.pos.x, pa.pos.y);
        ctx.rotate(pa.rot || 0);
        ctx.fillStyle = pa.color;
        ctx.fillRect(-pa.size / 2, -pa.size / 2, pa.size, pa.size * 0.6);
        ctx.restore();
      } else {
        ctx.fillStyle = pa.color;
        ctx.fillRect(pa.pos.x - 1, pa.pos.y - 1, 3, 3);
      }
    }
    ctx.globalAlpha = 1;

    if (crosshairRef.current.active && page === "game") {
      ctx.save();
      ctx.resetTransform();
      ctx.strokeStyle = "rgba(255,255,255,0.85)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(crosshairRef.current.x, crosshairRef.current.y, 18, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(crosshairRef.current.x - 10, crosshairRef.current.y);
      ctx.lineTo(crosshairRef.current.x + 10, crosshairRef.current.y);
      ctx.moveTo(crosshairRef.current.x, crosshairRef.current.y - 10);
      ctx.lineTo(crosshairRef.current.x, crosshairRef.current.y + 10);
      ctx.stroke();
      ctx.restore();
    }

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
    ctx.globalAlpha = 0.3;
    ctx.fillStyle = "#1a0a14";
    ctx.beginPath(); ctx.ellipse(0, h * 0.7, w * 0.45, 8, 0, 0, Math.PI * 2); ctx.fill();
    ctx.globalAlpha = 1;

    if (enemy) {
      drawEnemyShip(ctx, w, h, t);
    } else {
      drawPlayerShip(ctx, w, h, t, ship.vel.y, ship, ship.pos, ship.facing, bobY);
    }

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

  function drawPlayerShip(ctx: CanvasRenderingContext2D, w: number, h: number, t: number, velY: number, ship: Ship, shipPos: Vec, facing: 1 | -1, bobY: number) {
    const hingeOffsetX = 0;
    const hingeOffsetY = -h * 1.16;
    const hingeWorldY = shipPos.y + bobY + hingeOffsetY;
    const hingeWorldX = shipPos.x + hingeOffsetX;
    // Warm orange balloon
    ctx.fillStyle = "#d96a3a";
    ctx.strokeStyle = "#1a0a0a";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.ellipse(0, -h * 0.7, w * 0.55, h * 0.55, 0, 0, Math.PI * 2);
    ctx.fill(); ctx.stroke();
    ctx.strokeStyle = "#8a3018"; ctx.lineWidth = 2;
    for (let i = -2; i <= 2; i++) {
      ctx.beginPath();
      ctx.ellipse(i * w * 0.18, -h * 0.7, w * 0.05, h * 0.55, 0, 0, Math.PI * 2);
      ctx.stroke();
    }
    // tail fin
    ctx.fillStyle = "#8a3018";
    ctx.beginPath();
    ctx.moveTo(-w * 0.55, -h * 0.7);
    ctx.lineTo(-w * 0.75, -h * 1.05);
    ctx.lineTo(-w * 0.5, -h * 0.95);
    ctx.closePath(); ctx.fill();
    ctx.strokeStyle = "#1a0a0a"; ctx.lineWidth = 2; ctx.stroke();
    // golden emblem (sun)
    ctx.fillStyle = "#ffce4a";
    ctx.beginPath(); ctx.arc(0, -h * 0.7, 13, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = "#1a0a0a"; ctx.stroke();
    ctx.fillStyle = "#fff2b0";
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      ctx.beginPath();
      ctx.moveTo(Math.cos(a) * 6, -h * 0.7 + Math.sin(a) * 6);
      ctx.lineTo(Math.cos(a) * 10, -h * 0.7 + Math.sin(a) * 10);
      ctx.lineWidth = 2; ctx.strokeStyle = "#fff2b0"; ctx.stroke();
    }
    // ropes
    ctx.strokeStyle = "#2a1810"; ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(-w * 0.4, -h * 0.3); ctx.lineTo(-w * 0.35, h * 0.05);
    ctx.moveTo(w * 0.4, -h * 0.3); ctx.lineTo(w * 0.35, h * 0.05);
    ctx.moveTo(-w * 0.15, -h * 0.2); ctx.lineTo(-w * 0.15, h * 0.05);
    ctx.moveTo(w * 0.15, -h * 0.2); ctx.lineTo(w * 0.15, h * 0.05);
    ctx.stroke();
    // no flap or hatch
    const hatchHeight = 0;
    const flapHeight = 0;
    const flapAngle = 0;
    const hatchWidth = 0;
    ctx.save();
    ctx.restore();

    // wooden hull
    ctx.fillStyle = "#6e4a2a";
    ctx.strokeStyle = "#2a1810"; ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(-w * 0.45, h * 0.05);
    ctx.lineTo(w * 0.45, h * 0.05);
    ctx.lineTo(w * 0.55, h * 0.25);
    ctx.lineTo(w * 0.35, h * 0.5);
    ctx.lineTo(-w * 0.35, h * 0.5);
    ctx.lineTo(-w * 0.55, h * 0.25);
    ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.strokeStyle = "#4a2f1a"; ctx.lineWidth = 1;
    for (let i = 1; i < 4; i++) {
      ctx.beginPath();
      ctx.moveTo(-w * 0.45, h * 0.05 + i * h * 0.11);
      ctx.lineTo(w * 0.45, h * 0.05 + i * h * 0.11);
      ctx.stroke();
    }
    if ((ship.upgradeLevel ?? 1) >= 2) {
      ctx.strokeStyle = "#ffd166"; ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(-w * 0.45, h * 0.05);
      ctx.lineTo(w * 0.45, h * 0.05);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(-w * 0.25, h * 0.15);
      ctx.lineTo(w * 0.25, h * 0.15);
      ctx.stroke();
    }
    // warm windows
    ctx.fillStyle = "#ffd66b";
    for (let i = -2; i <= 2; i++) {
      ctx.beginPath();
      ctx.arc(i * w * 0.14, h * 0.22, 5, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "#2a1810"; ctx.lineWidth = 1.5; ctx.stroke();
    }
    // cannon
    ctx.fillStyle = "#2a2a2e"; ctx.strokeStyle = "#0a0a0a"; ctx.lineWidth = 2;
    const cannonSize = (ship.upgradeLevel ?? 1) >= 3 ? h * 0.18 : h * 0.12;
    ctx.beginPath(); ctx.rect(w * 0.4, h * 0.1, w * 0.18, cannonSize); ctx.fill(); ctx.stroke();
    if ((ship.upgradeLevel ?? 1) >= 4) {
      ctx.fillStyle = "#d36cff";
      ctx.beginPath(); ctx.moveTo(w * 0.58, h * 0.1); ctx.lineTo(w * 0.72, h * 0.1); ctx.lineTo(w * 0.58, h * 0.16); ctx.closePath(); ctx.fill();
      ctx.save();
      ctx.strokeStyle = "rgba(196,124,255,0.9)";
      ctx.lineWidth = 6;
      ctx.beginPath();
      ctx.moveTo(w * 0.4, h * 0.1);
      ctx.lineTo(w * 0.56, h * 0.04);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(w * 0.4, h * 0.1);
      ctx.lineTo(w * 0.56, h * 0.16);
      ctx.stroke();
      ctx.restore();
    }
    // propeller
    ctx.strokeStyle = "#1a0a0a"; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(-w * 0.55, h * 0.2); ctx.lineTo(-w * 0.7, h * 0.2); ctx.stroke();
    if ((ship.upgradeLevel ?? 1) >= 3) {
      ctx.fillStyle = "#ffba00";
      ctx.beginPath(); ctx.rect(-w * 0.72, h * 0.12, 8, 6); ctx.fill();
    }
    const spin = (t * 20) % (Math.PI * 2);
    ctx.save();
    ctx.translate(-w * 0.7, h * 0.2); ctx.rotate(spin);
    ctx.fillStyle = "#3a2a1a";
    ctx.fillRect(-2, -h * 0.18, 4, h * 0.36);
    ctx.restore();
  }

  function drawEnemyShip(ctx: CanvasRenderingContext2D, w: number, h: number, t: number) {
    // Fire Nation iron warship — dark, angular, menacing.
    // Elongated dark balloon with metallic plating
    const grad = ctx.createLinearGradient(0, -h * 1.2, 0, -h * 0.2);
    grad.addColorStop(0, "#3a1010");
    grad.addColorStop(1, "#150505");
    ctx.fillStyle = grad;
    ctx.strokeStyle = "#000";
    ctx.lineWidth = 3;
    ctx.beginPath();
    // angular zeppelin shape
    ctx.moveTo(w * 0.6, -h * 0.7);
    ctx.lineTo(w * 0.45, -h * 1.15);
    ctx.lineTo(-w * 0.45, -h * 1.15);
    ctx.lineTo(-w * 0.6, -h * 0.7);
    ctx.lineTo(-w * 0.45, -h * 0.25);
    ctx.lineTo(w * 0.45, -h * 0.25);
    ctx.closePath();
    ctx.fill(); ctx.stroke();
    // metal plating seams
    ctx.strokeStyle = "#5a1a1a"; ctx.lineWidth = 1.5;
    for (let i = -3; i <= 3; i++) {
      ctx.beginPath();
      ctx.moveTo(i * w * 0.15, -h * 1.15);
      ctx.lineTo(i * w * 0.15, -h * 0.25);
      ctx.stroke();
    }
    // red trim stripe
    ctx.fillStyle = "#c41818";
    ctx.fillRect(-w * 0.55, -h * 0.55, w * 1.1, h * 0.08);
    ctx.strokeStyle = "#000"; ctx.lineWidth = 2;
    ctx.strokeRect(-w * 0.55, -h * 0.55, w * 1.1, h * 0.08);
    // jagged top spikes
    ctx.fillStyle = "#1a0505";
    ctx.beginPath();
    for (let i = -2; i <= 2; i++) {
      const x = i * w * 0.18;
      ctx.moveTo(x - w * 0.04, -h * 1.15);
      ctx.lineTo(x, -h * 1.35);
      ctx.lineTo(x + w * 0.04, -h * 1.15);
    }
    ctx.fill();
    ctx.strokeStyle = "#000"; ctx.stroke();
    // tail spike fins (sharp triangles top and bottom)
    ctx.fillStyle = "#2a0a0a";
    ctx.beginPath();
    ctx.moveTo(-w * 0.6, -h * 0.7);
    ctx.lineTo(-w * 0.9, -h * 1.0);
    ctx.lineTo(-w * 0.85, -h * 0.55);
    ctx.closePath(); ctx.fill(); ctx.strokeStyle = "#000"; ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(-w * 0.6, -h * 0.4);
    ctx.lineTo(-w * 0.9, -h * 0.25);
    ctx.lineTo(-w * 0.85, -h * 0.6);
    ctx.closePath(); ctx.fill(); ctx.stroke();
    // glowing red emblem (Fire Nation insignia)
    ctx.fillStyle = "#000";
    ctx.beginPath(); ctx.arc(0, -h * 0.7, 14, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "#ff2a1a";
    ctx.shadowColor = "#ff2a1a"; ctx.shadowBlur = 14;
    // three-flame insignia
    for (let i = -1; i <= 1; i++) {
      ctx.beginPath();
      ctx.moveTo(i * 5, -h * 0.7 + 5);
      ctx.quadraticCurveTo(i * 5 + 3, -h * 0.7 - 2, i * 5, -h * 0.7 - 7);
      ctx.quadraticCurveTo(i * 5 - 3, -h * 0.7 - 2, i * 5, -h * 0.7 + 5);
      ctx.fill();
    }
    ctx.shadowBlur = 0;
    // chains instead of ropes
    ctx.strokeStyle = "#1a1a1a"; ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(-w * 0.4, -h * 0.25); ctx.lineTo(-w * 0.35, h * 0.05);
    ctx.moveTo(w * 0.4, -h * 0.25); ctx.lineTo(w * 0.35, h * 0.05);
    ctx.moveTo(0, -h * 0.25); ctx.lineTo(0, h * 0.05);
    ctx.stroke();
    // iron-clad gondola (darker, angular)
    const hullGrad = ctx.createLinearGradient(0, h * 0.05, 0, h * 0.5);
    hullGrad.addColorStop(0, "#2a2a2e");
    hullGrad.addColorStop(1, "#0a0a0e");
    ctx.fillStyle = hullGrad;
    ctx.strokeStyle = "#000"; ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(-w * 0.5, h * 0.05);
    ctx.lineTo(w * 0.5, h * 0.05);
    ctx.lineTo(w * 0.62, h * 0.25);
    ctx.lineTo(w * 0.4, h * 0.55);
    ctx.lineTo(-w * 0.4, h * 0.55);
    ctx.lineTo(-w * 0.62, h * 0.25);
    ctx.closePath();
    ctx.fill(); ctx.stroke();
    // hull bolts
    ctx.fillStyle = "#5a5a5e";
    for (let i = -3; i <= 3; i++) {
      ctx.beginPath(); ctx.arc(i * w * 0.13, h * 0.12, 2, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(i * w * 0.13, h * 0.5, 2, 0, Math.PI * 2); ctx.fill();
    }
    // menacing red slit windows
    ctx.fillStyle = "#ff2a1a";
    ctx.shadowColor = "#ff2a1a"; ctx.shadowBlur = 8;
    for (let i = -2; i <= 2; i++) {
      ctx.fillRect(i * w * 0.14 - 6, h * 0.27, 12, 3);
    }
    ctx.shadowBlur = 0;
    // big front cannon
    ctx.fillStyle = "#1a1a1e"; ctx.strokeStyle = "#000"; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.rect(w * 0.45, h * 0.08, w * 0.22, h * 0.16); ctx.fill(); ctx.stroke();
    ctx.fillStyle = "#000";
    ctx.beginPath(); ctx.arc(w * 0.67, h * 0.16, h * 0.06, 0, Math.PI * 2); ctx.fill();
    // rear engine glow
    ctx.fillStyle = "#ff5a1a";
    ctx.shadowColor = "#ff5a1a"; ctx.shadowBlur = 18;
    const flicker = 0.7 + Math.sin(t * 30) * 0.3;
    ctx.beginPath(); ctx.ellipse(-w * 0.62, h * 0.25, 8 * flicker, 5, 0, 0, Math.PI * 2); ctx.fill();
    ctx.shadowBlur = 0;
    // dark propeller
    ctx.strokeStyle = "#000"; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(-w * 0.6, h * 0.25); ctx.lineTo(-w * 0.75, h * 0.25); ctx.stroke();
    const spin = (t * 25) % (Math.PI * 2);
    ctx.save();
    ctx.translate(-w * 0.75, h * 0.25); ctx.rotate(spin);
    ctx.fillStyle = "#1a1a1e";
    ctx.fillRect(-2, -h * 0.2, 4, h * 0.4);
    ctx.restore();
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

  const restart = (mode: "normal" | "online" = gameModeRef.current) => {
    setGameMode(mode);
    setStatus("playing");
    statusRef.current = "playing";
    gameModeRef.current = mode;
    setScore(0);
    setWave(1);
    stateRef.current = null;
    // re-init
    const player: Ship = {
      pos: { x: 400, y: WORLD.h / 2 }, vel: { x: 0, y: 0 },
      hp: 100, maxHp: 100, faction: "player", cooldown: 0,
      width: 220, height: 90, bob: 0, facing: 1,
      name: username,
      upgradeLevel,
    };
    applyUpgradeToPlayer(player);
    const enemies: Ship[] = [];
    if (mode !== "online") {
      for (let i = 0; i < 5; i++) {
        enemies.push({
          pos: { x: 1200 + i * 600, y: 300 + Math.random() * (WORLD.h - 600) },
          vel: { x: 0, y: 0 }, hp: 60, maxHp: 60, faction: "enemy",
          cooldown: Math.random() * 2, width: 200, height: 80,
          bob: Math.random() * Math.PI * 2, facing: -1,
        });
      }
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

      {/* Menu / instructions overlays */}
      {page === "menu" && (
        <div className="absolute inset-0 bg-black/80 backdrop-blur-sm flex flex-col items-center justify-center z-30 text-center px-6 text-amber-100">
          <div className="text-xl md:text-3xl font-black tracking-[0.2em] uppercase mb-6 leading-tight max-w-full">Mayday</div>
          <div className="mb-6 w-full max-w-xs text-left">
            <label className="block text-[11px] uppercase tracking-[0.3em] text-amber-300/80 mb-2">Username</label>
            <input
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="w-full rounded-2xl border border-amber-300/50 bg-black/60 px-4 py-3 text-white outline-none placeholder:text-amber-400/50"
              placeholder="Enter a name"
              maxLength={20}
            />
          </div>
          <div className="space-y-4 w-full max-w-xs">
            <button
              onClick={() => {
                if (publishPassword) {
                  const attempt = window.prompt('Enter game password to play:');
                  if (attempt !== publishPassword) { showNotification('Incorrect password.'); return; }
                }
                restart('normal'); setPage('game');
              }}
              className="w-full rounded-xl bg-gradient-to-r from-orange-500 to-red-700 px-6 py-4 text-white text-lg font-bold shadow-xl hover:brightness-110 transition"
            >
              Play
            </button>
            <button
              onClick={() => {
                if (publishPassword) {
                  const attempt = window.prompt('Enter game password to join online:');
                  if (attempt !== publishPassword) { showNotification('Incorrect password.'); return; }
                }
                restart('online'); setPage('game');
              }}
              className="w-full rounded-xl bg-gradient-to-r from-sky-500 to-blue-700 px-6 py-4 text-white text-lg font-bold shadow-xl hover:brightness-110 transition"
            >
              Online Mode
            </button>
            <div className="flex gap-2">
              <button
                onClick={() => setPage('instructions')}
                className="flex-1 rounded-xl border border-amber-300/80 bg-black/40 px-6 py-3 text-amber-100 text-lg font-semibold shadow-inner hover:bg-black/60 transition"
              >
                Instructions
              </button>
              <button
                onClick={() => {
                  const current = publishPassword ? 'Set' : 'Not set';
                  const v = window.prompt(`Set a publish password (leave empty to clear). Current: ${current}`) || '';
                  try { setPublishPassword(v); showNotification(v ? 'Password set.' : 'Password cleared.'); } catch { }
                }}
                className="rounded-xl border border-amber-300/40 bg-white/5 px-4 py-3 text-amber-100 text-sm shadow-inner hover:bg-black/60 transition"
              >
                {publishPassword ? 'Change Password' : 'Set Password'}
              </button>
            </div>
          </div>
          <p className="mt-10 text-sm text-amber-300/70 max-w-md leading-relaxed">
            Take to the skies and defend your ship from enemy air fleets. Earn Flameos, survive waves, and master the winds.
          </p>
        </div>
      )}
      {page === "instructions" && (
        <div className="absolute inset-0 bg-black/90 backdrop-blur-sm flex flex-col items-center justify-center z-30 text-center px-6 text-amber-100">
          <div className="max-w-2xl">
            <h2 className="text-3xl md:text-5xl font-bold uppercase tracking-[0.3em] mb-6">Instructions</h2>
            <div className="space-y-3 text-left text-sm md:text-base leading-relaxed text-amber-200/90 bg-black/40 border border-amber-300/20 rounded-3xl p-6 shadow-lg">
              <p><strong>Move:</strong> WASD or arrow keys. On touch, use the steering knob.</p>
              <p><strong>Fire:</strong> Press SPACE or tap the FIRE button on mobile.</p>
              <p><strong>Pause:</strong> Press P to pause the battle.</p>
              <p><strong>Goal:</strong> Clear the enemy wave to earn Flameos and unlock the next one.</p>
              <p><strong>Online mode:</strong> No NPCs, infinite skies, paired with every online player.</p>
              <p><strong>Your username:</strong> {username}</p>
            </div>
            <div className="mt-8 flex flex-col gap-3 md:flex-row justify-center">
              <button
                onClick={() => setPage('game')}
                className="rounded-xl bg-gradient-to-r from-orange-500 to-red-700 px-6 py-3 text-white font-bold shadow-xl hover:brightness-110 transition"
              >
                Play
              </button>
              <button
                onClick={() => setPage('menu')}
                className="rounded-xl border border-amber-300/80 bg-black/40 px-6 py-3 text-amber-100 font-semibold hover:bg-black/60 transition"
              >
                Back
              </button>
            </div>
          </div>
        </div>
      )}

      {/* HUD */}
      <div className="absolute top-3 left-3 right-3 grid gap-3 items-start pointer-events-none z-10" style={{ gridTemplateColumns: 'repeat(3, minmax(0, 1fr))' }}>
        <div className="min-w-0 bg-black/40 backdrop-blur-sm rounded-lg px-3 py-2 text-amber-100 border border-amber-700/50 relative pointer-events-auto">
          {gameMode === "online" && page === "game" && (
            <span className="absolute -top-2 left-4 inline-flex h-3 w-3 rounded-full bg-emerald-400 shadow-lg shadow-emerald-500/30" />
          )}
          <div className="text-xs uppercase tracking-widest text-amber-300/80">Hull</div>
          <div className="mt-1 overflow-hidden border border-amber-900/60 rounded-lg" style={{ width: '100%', height: '0.5rem' }}>
            <div
              className="h-full bg-gradient-to-r from-orange-500 to-yellow-400 transition-all"
              style={{
                width: `${Math.max(0, Math.min(98, hpDisplay))}%`,
                maxWidth: '100%',
                minWidth: '0px',
                height: '100%',
                display: 'block',
                borderRadius: '9999px',
              }}
            />
          </div>
          <button
            className="mt-3 w-full rounded-2xl bg-gradient-to-r from-orange-500 to-red-700 px-3 py-2 text-sm font-semibold text-white shadow-lg hover:brightness-110 transition"
            onClick={() => setShopOpen((open) => !open)}
          >
            {shopOpen ? "Close Shop" : "Upgrade Shop"}
          </button>
        </div>
        <div className="min-w-0 flex justify-center">
          <div className="min-w-0 bg-black/40 backdrop-blur-sm rounded-lg px-3 py-2 text-amber-100 border border-amber-700/50 text-center">
            <div className="text-xs uppercase tracking-widest text-amber-300/80">{gameMode === "online" ? "Online Mode" : "Enemy Fleet"}</div>
            <div className="text-center text-lg font-bold">{gameMode === "online" ? "LIVE" : enemiesLeft}</div>
            <div className="mt-1 text-[10px] text-amber-300/80">{gameMode === "online" ? "Free Flight" : `Wave ${wave}`}</div>
          </div>
        </div>
        {gameMode === "online" && page === "game" && (
          <div className="min-w-0 bg-black/40 backdrop-blur-sm rounded-lg px-3 py-2 text-amber-100 border border-emerald-700/50">
            <div className="text-xs uppercase tracking-widest text-emerald-300/80">Online Leaderboard</div>
              {onlinePeerShips.length || true ? (
                <div className="mt-2 space-y-1 text-left text-sm text-amber-100">
                  {(() => {
                    const list = [
                      { name: username, score: scoreRef.current, kills: killsRef.current, deaths: deathsRef.current, me: true, id: undefined },
                      ...onlinePeerShips.map(p => ({ name: p.name || 'Pilot', score: p.score ?? 0, kills: p.kills ?? 0, deaths: p.deaths ?? 0, id: p.id, me: false })),
                    ];
                    list.sort((a, b) => (b.score || 0) - (a.score || 0));
                    return list.slice(0, 6).map((row, i) => (
                      <div key={`${row.name}-${i}`} className="flex justify-between">
                        <div className={`truncate ${row.me ? 'font-bold text-emerald-200' : ''}`}>{i+1}. {row.name}</div>
                        <div className="ml-3 text-amber-200">{row.score}</div>
                      </div>
                    ));
                  })()}
                </div>
              ) : (
                <div className="mt-2 text-sm text-amber-300/80">Waiting for other players...</div>
              )}
          </div>
        )}
        {gameMode !== "online" && (
          <div className="min-w-0 flex justify-end">
            <div className="min-w-0 bg-black/40 backdrop-blur-sm rounded-lg px-3 py-2 text-amber-100 border border-amber-700/50 text-right pointer-events-auto">
              <div className="text-xs uppercase tracking-widest text-amber-300/80 cursor-pointer" onClick={renameScoreLabel}>{scoreLabel}</div>
              <div className="text-xl font-bold">{score}</div>
            </div>
          </div>
        )}
      </div>
      {shopOpen && page === "game" && (
        <div className="absolute top-16 right-3 w-[clamp(220px,26vw,360px)] bg-black/85 backdrop-blur-xl border border-amber-500/50 rounded-3xl p-4 text-amber-100 shadow-2xl pointer-events-auto z-30">
          <div className="flex items-center justify-between mb-3">
            <div>
              <div className="text-xs uppercase tracking-[0.3em] text-amber-300/80">Upgrade Shop</div>
              <div className="text-sm text-amber-100/90">Spend Flameos for better weapons.</div>
            </div>
            <div className="text-right text-sm font-semibold">Level {upgradeLevel}</div>
          </div>
          <div className="space-y-3">
            <div className="rounded-3xl border border-amber-500/30 bg-gradient-to-br from-black/70 via-orange-900/20 to-amber-950/30 p-4 shadow-2xl shadow-orange-950/20">
              <div className="text-sm uppercase tracking-[0.25em] text-amber-300/70">Your Flameos</div>
              <div className="mt-2 text-3xl font-bold text-amber-100">{score}</div>
              <div className="mt-3 grid gap-2 text-[10px] uppercase tracking-[0.3em] text-amber-200/80">
                <div className="inline-flex items-center gap-2 rounded-full bg-amber-500/15 px-3 py-1">⚡ Damage {upgradeBonuses[upgradeLevel].damage}</div>
                <div className="inline-flex items-center gap-2 rounded-full bg-red-500/15 px-3 py-1">⏱ Reload {upgradeBonuses[upgradeLevel].cooldown.toFixed(2)}s</div>
                <div className="inline-flex items-center gap-2 rounded-full bg-emerald-500/15 px-3 py-1">❤️ HP {upgradeBonuses[upgradeLevel].maxHp}</div>
              </div>
            </div>
            <div className="rounded-3xl border border-amber-700/50 bg-black/60 p-4">
              <div className="text-sm uppercase tracking-[0.25em] text-amber-300/70">Current Ship</div>
              <StatRow label="Damage" value={upgradeBonuses[upgradeLevel].damage} max={40} />
              <StatRow label="Reload" value={Math.round((1 - upgradeBonuses[upgradeLevel].cooldown / 0.18) * 100)} max={100} suffix="fast" />
              <StatRow label="HP" value={upgradeBonuses[upgradeLevel].maxHp} max={160} />
              <div className="mt-2 text-sm text-amber-100">{upgradeBonuses[upgradeLevel].flame ? "Flame Rounds and flame rounds active" : "Standard cannon volley"}</div>
            </div>
            {upgradeLevel < maxUpgradeLevel ? (
              <div className="rounded-2xl border border-amber-700/40 bg-white/5 p-3">
                <div className="text-sm uppercase tracking-[0.25em] text-amber-300/70">Next Upgrade</div>
                <div className="mt-2 text-sm">
                  Damage: <span className="font-semibold">{upgradeBonuses[upgradeLevel + 1].damage}</span><br />
                  Reload: <span className="font-semibold">{upgradeBonuses[upgradeLevel + 1].cooldown.toFixed(2)}s</span><br />
                  HP: <span className="font-semibold">{upgradeBonuses[upgradeLevel + 1].maxHp}</span><br />
                  {upgradeBonuses[upgradeLevel + 1].flame ? "Flame Rounds unlocked" : ""}
                </div>
                <button
                  className="mt-3 w-full rounded-2xl bg-gradient-to-r from-orange-500 to-red-700 px-3 py-2 text-sm font-semibold text-white shadow-inner hover:brightness-110 transition"
                  onClick={() => {
                    const cost = shopCosts[upgradeLevel + 1] ?? 999;
                    if (score < cost) {
                      showNotification(`You need ${cost} ${scoreLabel} to upgrade.`);
                      return;
                    }
                    setScore(sc => sc - cost);
                    setUpgradeLevel((lvl) => Math.min(maxUpgradeLevel, lvl + 1));
                    const player = stateRef.current?.player;
                    if (player) applyUpgradeToPlayer(player);
                  }}
                >
                  Buy for {shopCosts[upgradeLevel + 1]} {scoreLabel}
                </button>
              </div>
            ) : (
              <div className="rounded-2xl border border-emerald-500/40 bg-emerald-500/10 p-3 text-sm text-emerald-100">
                Maximum upgrades reached.
              </div>
            )}
            {secretUnlocked && (
              <div className="rounded-3xl border border-fuchsia-500/40 bg-fuchsia-900/20 p-3 text-fuchsia-100 mt-3 shadow-lg shadow-fuchsia-500/20">
                <div className="text-sm uppercase tracking-[0.25em] text-fuchsia-300/70">Secret Arsenal</div>
                <div className="mt-2 text-sm">Code 1945 unlocked a hidden ship boost. Activate it to supercharge your guns.</div>
                <button
                  className="mt-3 w-full rounded-2xl bg-gradient-to-r from-fuchsia-500 to-pink-600 px-3 py-2 text-sm font-semibold text-white shadow-inner hover:brightness-110 transition"
                  onClick={() => {
                    if (score < 250) {
                      showNotification(`You need 250 ${scoreLabel} for the secret arsenal.`);
                      return;
                    }
                    setScore(sc => sc - 250);
                    setUpgradeLevel(maxUpgradeLevel);
                    const player = stateRef.current?.player;
                    if (player) {
                      player.weaponDamage = 46;
                      player.weaponCooldown = 0.08;
                      player.weaponStyle = purpleBeamEnabled ? "beam" : "projectile";
                      player.flame = true;
                      player.maxHp = Math.max(player.maxHp, 160);
                      player.hp = Math.min(player.hp + 30, player.maxHp);
                      player.upgradeLevel = maxUpgradeLevel;
                    }
                    showNotification("Secret Arsenal activated! Beam mode engaged.");
                  }}
                >
                  Activate 1945 Arsenal
                </button>
              </div>
            )}
            <div className="rounded-2xl border border-fuchsia-700/20 bg-black/50 p-3 mt-3">
              <div className="flex items-center justify-between">
                <div className="text-sm uppercase tracking-[0.25em] text-amber-300/70">Purple Beam</div>
                <div>
                  <button
                    className={`px-3 py-1 rounded-lg font-semibold ${purpleBeamEnabled ? 'bg-fuchsia-500 text-white' : 'bg-white/5 text-amber-200'}`}
                    onClick={() => setPurpleBeamEnabled(v => !v)}
                  >
                    {purpleBeamEnabled ? 'Enabled' : 'Disabled'}
                    </button>
                </div>
              </div>
              <div className="mt-2 text-xs text-amber-300/70">Toggle the purple instakill beam. When enabled, beam kills are instant.</div>
            </div>
            <div className="rounded-2xl border border-fuchsia-700/20 bg-black/50 p-3 mt-3">
              <div className="flex items-center justify-between">
                <div className="text-sm uppercase tracking-[0.25em] text-amber-300/70">Purple Beam Visual</div>
                <div>
                  <button
                    className={`px-3 py-1 rounded-lg font-semibold ${purpleBeamCosmetic ? 'bg-fuchsia-500 text-white' : 'bg-white/5 text-amber-200'}`}
                    onClick={() => setPurpleBeamCosmetic(v => !v)}
                  >
                    {purpleBeamCosmetic ? 'On' : 'Off'}
                  </button>
                </div>
              </div>
              <div className="mt-2 text-xs text-amber-300/70">Show the purple beam effect even when instakill is disabled. Cosmetic only.</div>
            </div>
          </div>
        </div>
      )}

      {/* Instructions */}
      <div className="absolute bottom-3 left-1/2 -translate-x-1/2 text-amber-200/70 text-xs text-center pointer-events-none z-10 hidden md:block">
        WASD / Arrows to fly · SPACE to fire · P to pause
      </div>

      {/* Joystick — mobile (hidden on non-touch until user touches) */}
      {showTouchControls && page === "game" && (
        <div
          className="absolute rounded-full bg-black/30 border-2 border-amber-300/40 backdrop-blur-sm z-20"
          style={{ bottom: '4vmin', left: '4vmin', width: 'clamp(64px, 12vmin, 160px)', height: 'clamp(64px, 12vmin, 160px)' }}
          onPointerDown={onJoyStart}
          onPointerMove={onJoyMove}
          onPointerUp={onJoyEnd}
          onPointerCancel={onJoyEnd}
        >
          <JoyKnob joyRef={joy} />
          <div className="absolute inset-0 flex items-center justify-center text-amber-300/30 text-[10px] uppercase tracking-widest pointer-events-none">Steer</div>
        </div>
      )}

      {/* Fire button — mobile (hidden on non-touch until user touches) */}
      {showTouchControls && page === "game" && (
        <button
          className="absolute rounded-full bg-gradient-to-br from-orange-500 to-red-700 border-4 border-amber-200/70 shadow-2xl active:scale-95 transition-transform z-20 text-white font-bold tracking-widest"
          style={{ bottom: '5vmin', right: '4vmin', width: 'clamp(64px, 14vmin, 160px)', height: 'clamp(64px, 14vmin, 160px)', fontSize: 'clamp(12px, 3vmin, 28px)' }}
          onPointerDown={(e) => { if ((e as any).pointerType === 'touch') { fireTouchId.current = e.pointerId; firing.current = true; (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); } else { /* ignore mouse */ } }}
          onPointerUp={(e) => { if (fireTouchId.current === e.pointerId) { firing.current = false; fireTouchId.current = null; } }}
          onPointerCancel={() => { firing.current = false; fireTouchId.current = null; }}
        >
          FIRE
        </button>
      )}

      {/* Crosshair overlay */}
      {killMessage && page === "game" && (
        <div className="pointer-events-none absolute inset-x-0 top-24 z-30 flex justify-center">
          <div className="rounded-3xl border-2 border-red-400 bg-black/80 px-6 py-4 text-xl font-bold uppercase tracking-[0.2em] text-red-300 shadow-2xl shadow-red-600/20">
            {killMessage}
          </div>
        </div>
      )}

      {/* Notification message */}
      {notificationMessage && page === "game" && (
        <div className="pointer-events-none absolute inset-x-0 top-40 z-30 flex justify-center">
          <div className="rounded-2xl border border-amber-400 bg-black/80 px-6 py-3 text-sm font-semibold tracking-[0.1em] text-amber-200 shadow-lg shadow-amber-600/20">
            {notificationMessage}
          </div>
        </div>
      )}

      {/* Status overlays */}
      {page === "game" && status !== "playing" && (
        <div className="absolute inset-0 bg-black/70 backdrop-blur-sm flex flex-col items-center justify-center z-30 text-center px-6">
          <h1 className="text-4xl md:text-6xl font-bold text-amber-200 drop-shadow-[0_0_20px_rgba(255,140,40,0.6)]">
            {status === "won" ? "Skies Cleared" : status === "lost" ? "Ship Down" : "Paused"}
          </h1>
          <p className="mt-3 text-amber-100/80 max-w-md">
            {status === "won"
              ? "The horizon belongs to you, captain. The fleet has fallen."
              : status === "lost"
                ? "Your airship plummets into the crimson dusk. The fleet endures."
                : "The battle is on hold. Press P again to resume flying."
            }
          </p>
          <div className="mt-2 text-amber-300/90">{scoreLabel}: <span className="font-bold">{score}</span></div>
          {status === "won" ? (
            <button
              onClick={() => {
                // keep score, advance wave and spawn next
                // Do not persist flameos (score) on kill — keep runtime-only
                const next = wave + 1;
                setWave(next);
                setStatus('playing');
                // small timeout to let overlay disappear visually
                setTimeout(() => spawnWave(next), 80);
              }}
              className="mt-6 px-8 py-3 rounded-lg bg-gradient-to-br from-orange-500 to-red-700 text-white font-bold tracking-widest border-2 border-amber-200/70 shadow-xl active:scale-95"
            >
              NEXT WAVE
            </button>
          ) : status === "paused" ? (
            <button
              onClick={() => setStatus('playing')}
              className="mt-6 px-8 py-3 rounded-lg bg-gradient-to-br from-orange-500 to-red-700 text-white font-bold tracking-widest border-2 border-amber-200/70 shadow-xl active:scale-95"
            >
              RESUME
            </button>
          ) : (
            <button
              onClick={() => restart()}
              className="mt-6 px-8 py-3 rounded-lg bg-gradient-to-br from-orange-500 to-red-700 text-white font-bold tracking-widest border-2 border-amber-200/70 shadow-xl active:scale-95"
            >
              FLY AGAIN
            </button>
          )}
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
      <div ref={knobRef} style={{ width: '40%', height: '40%' }} className="rounded-full bg-gradient-to-br from-amber-300 to-orange-600 border-2 border-amber-100/80 shadow-lg" />
    </div>
  );
}

function StatRow({ label, value, max, suffix }: { label: string; value: number; max: number; suffix?: string }) {
  const ratio = Math.max(0, Math.min(1, value / max));
  return (
    <div className="flex items-center gap-3 text-sm text-amber-100">
      <div className="min-w-[5rem] uppercase tracking-[0.2em] text-amber-300/80">{label}</div>
      <div className="flex-1">
        <div className="h-2 rounded-full bg-white/10 overflow-hidden">
          <div className="h-full rounded-full bg-gradient-to-r from-orange-400 to-amber-300" style={{ width: `${ratio * 100}%` }} />
        </div>
        <div className="mt-1 text-[11px] text-amber-200/80">{value}{suffix ? ` ${suffix}` : ''}</div>
      </div>
    </div>
  );
}
