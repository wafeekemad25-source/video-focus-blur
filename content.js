(() => {
  if (window.__videoFocusBlur) return;
  window.__videoFocusBlur = true;

  const DEFAULTS = { enabled: true, mode: "hover", blur: 14, dim: 35, minSize: 150 };
  let cfg = { ...DEFAULTS };

  // One full-page layer that blurs whatever is behind it, with a hole cut out
  // exactly where the video is. Never blocks clicks (pointer-events: none).
  const layer = document.createElement("div");
  layer.id = "__video-focus-blur-layer";
  Object.assign(layer.style, {
    position: "fixed",
    inset: "0",
    zIndex: "2147483646",
    pointerEvents: "none",
    opacity: "0",
    transition: "opacity 220ms ease",
    willChange: "opacity",
  });

  let mouse = { x: -1, y: -1 };
  let target = null; // the video currently in focus
  let leaveTimer = null;
  let raf = 0;

  const applyStyle = () => {
    const b = `blur(${cfg.blur}px)`;
    layer.style.backdropFilter = b;
    layer.style.webkitBackdropFilter = b;
    layer.style.background = `rgba(0,0,0,${cfg.dim / 100})`;
  };

  const isPlaying = (v) =>
    !v.paused && !v.ended && v.readyState > 2 && v.currentTime > 0;

  const visibleRect = (v) => {
    const r = v.getBoundingClientRect();
    if (r.width < cfg.minSize || r.height < cfg.minSize) return null;
    const left = Math.max(r.left, 0);
    const top = Math.max(r.top, 0);
    const right = Math.min(r.right, innerWidth);
    const bottom = Math.min(r.bottom, innerHeight);
    if (right <= left || bottom <= top) return null;
    return { left, top, right, bottom, area: (right - left) * (bottom - top) };
  };

  const inside = (r, x, y) =>
    r && x >= r.left && x <= r.right && y >= r.top && y <= r.bottom;

  // Pick the video to focus on, depending on the mode.
  const pickVideo = () => {
    let best = null;
    let bestArea = 0;
    for (const v of document.querySelectorAll("video")) {
      if (!isPlaying(v)) continue;
      const r = visibleRect(v);
      if (!r) continue;
      if (cfg.mode === "hover" && !inside(r, mouse.x, mouse.y)) continue;
      if (cfg.mode === "playing" && v.muted) continue; // skip silent autoplay previews
      if (r.area > bestArea) { best = v; bestArea = r.area; }
    }
    return best;
  };

  const show = (v) => {
    clearTimeout(leaveTimer);
    leaveTimer = null;
    target = v;
    if (!layer.isConnected) document.documentElement.appendChild(layer);
    layer.style.opacity = "1";
    loop();
  };

  const hide = (delay = 250) => {
    if (!target || leaveTimer) return;
    leaveTimer = setTimeout(() => {
      leaveTimer = null;
      target = null;
      layer.style.opacity = "0";
    }, delay);
  };

  // Keep the hole glued to the video while it scrolls / resizes.
  const loop = () => {
    cancelAnimationFrame(raf);
    const tick = () => {
      if (!target) return;
      const r = visibleRect(target);
      if (!r || !target.isConnected || document.fullscreenElement) {
        layer.style.opacity = "0";
      } else {
        const p = 2; // tiny padding so the video edge stays crisp
        const L = r.left - p, T = r.top - p, R = r.right + p, B = r.bottom + p;
        layer.style.clipPath =
          `polygon(evenodd, 0 0, 100% 0, 100% 100%, 0 100%, 0 0, ` +
          `${L}px ${T}px, ${L}px ${B}px, ${R}px ${B}px, ${R}px ${T}px, ${L}px ${T}px)`;
        if (!leaveTimer) layer.style.opacity = "1";
      }
      raf = requestAnimationFrame(tick);
    };
    tick();
  };

  const evaluate = () => {
    if (!cfg.enabled) { target = null; layer.style.opacity = "0"; return; }
    const v = pickVideo();
    if (v) show(v);
    else hide(cfg.mode === "hover" ? 250 : 0);
  };

  document.addEventListener("mousemove", (e) => {
    mouse = { x: e.clientX, y: e.clientY };
    evaluate();
  }, { passive: true, capture: true });

  document.documentElement.addEventListener("mouseleave", () => {
    mouse = { x: -1, y: -1 };
    evaluate();
  });

  for (const ev of ["play", "playing", "pause", "ended", "emptied"]) {
    document.addEventListener(ev, evaluate, true);
  }
  document.addEventListener("fullscreenchange", evaluate);
  addEventListener("scroll", evaluate, { passive: true, capture: true });
  setInterval(evaluate, 1000); // catches videos swapped in by SPA sites

  chrome.storage.sync.get(DEFAULTS, (s) => { cfg = { ...DEFAULTS, ...s }; applyStyle(); evaluate(); });
  chrome.storage.onChanged.addListener((changes) => {
    for (const k in changes) cfg[k] = changes[k].newValue;
    applyStyle();
    evaluate();
  });
  applyStyle();
})();
