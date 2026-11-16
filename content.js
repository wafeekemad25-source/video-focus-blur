(() => {
  // If an older copy is still running in this tab (after an update), shut it
  // down first so only the newest version is active.
  try { window.__videoFocusBlurCleanup && window.__videoFocusBlurCleanup(); } catch (_) {}
  document.querySelectorAll("#__video-focus-blur-layer").forEach((n) => n.remove());
  const abort = new AbortController();
  const sig = { signal: abort.signal };

  const DEFAULTS = {
    enabled: true, mode: "hover", gifs: true, images: true, imageDelay: 500, blur: 14, dim: 35,
    minSize: 150, disabledSites: [],
  };
  let cfg = { ...DEFAULTS };
  const host = location.hostname;

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
  let target = null; // the video / GIF currently in focus
  let leaveTimer = null;
  let raf = 0;

  const active = () => cfg.enabled && !(cfg.disabledSites || []).includes(host);

  const applyStyle = () => {
    const b = `blur(${cfg.blur}px)`;
    layer.style.backdropFilter = b;
    layer.style.webkitBackdropFilter = b;
    layer.style.background = `rgba(0,0,0,${cfg.dim / 100})`;
  };

  // Playing OR buffering (internet lag) both count as "playing".
  const isPlaying = (v) => !v.paused && !v.ended;

  const GIF_RE = /\.gif($|[?#])|[?&]format=gif|\/gifs?\//i;
  const isGif = (img) => GIF_RE.test(img.currentSrc || img.src || "");

  const intersect = (a, b) => ({
    left: Math.max(a.left, b.left),
    top: Math.max(a.top, b.top),
    right: Math.min(a.right, b.right),
    bottom: Math.min(a.bottom, b.bottom),
  });

  // The part of the element you can actually see: cut by the screen edges and
  // by any parent box that crops it (e.g. Pinterest crops wide videos), so the
  // sharp hole matches what's on screen. Also picks up rounded corners.
  const visibleRect = (el) => {
    const raw = el.getBoundingClientRect();
    if (raw.width < cfg.minSize || raw.height < cfg.minSize) return null;
    let r = intersect(raw, { left: 0, top: 0, right: innerWidth, bottom: innerHeight });
    let radius = parseFloat(getComputedStyle(el).borderTopLeftRadius) || 0;
    let p = el.parentElement;
    for (let i = 0; p && p !== document.body && i < 12; i++, p = p.parentElement) {
      const cs = getComputedStyle(p);
      if (cs.overflowX !== "visible" || cs.overflowY !== "visible" || cs.clipPath !== "none") {
        const pr = p.getBoundingClientRect();
        if (pr.width >= cfg.minSize && pr.height >= cfg.minSize) {
          r = intersect(r, pr);
          radius = Math.max(radius, parseFloat(cs.borderTopLeftRadius) || 0);
        }
      }
    }
    const w = r.right - r.left, h = r.bottom - r.top;
    if (w < cfg.minSize / 2 || h < cfg.minSize / 2) return null;
    return { ...r, area: w * h, radius: Math.min(radius, w / 2, h / 2, 40) };
  };

  const inside = (r, x, y) =>
    r && x >= r.left && x <= r.right && y >= r.top && y <= r.bottom;

  // Cheap check first so we don't measure every video on the page per mouse move.
  const underMouse = (el) => inside(el.getBoundingClientRect(), mouse.x, mouse.y);

  // Pick the video to focus on, depending on the mode.
  const pickVideo = () => {
    let best = null;
    let bestArea = 0;
    for (const v of document.querySelectorAll("video")) {
      if (cfg.mode === "hover") {
        // Any video you've started stays in focus while the mouse is on it,
        // even if you pause it or it freezes / buffers.
        if (!isPlaying(v) && !(v.currentTime > 0)) continue;
        if (!underMouse(v)) continue;
      } else {
        if (!isPlaying(v) || v.muted) continue; // skip silent autoplay previews
      }
      const r = visibleRect(v);
      if (!r) continue;
      if (cfg.mode === "hover" && !inside(r, mouse.x, mouse.y)) continue;
      if (r.area > bestArea) { best = v; bestArea = r.area; }
    }
    // GIFs and pictures: the one under the mouse (hover mode only).
    // GIFs focus right away; normal pictures only after the mouse rests on
    // them for a moment, so just moving across a grid doesn't flash the blur.
    if (cfg.mode === "hover" && (cfg.gifs || cfg.images)) {
      let hoveredPic = null;
      for (const img of document.images) {
        if (!underMouse(img)) continue;
        const gif = isGif(img);
        if (gif ? !cfg.gifs : !cfg.images) continue;
        const r = visibleRect(img);
        if (!r || !inside(r, mouse.x, mouse.y)) continue;
        if (!gif) {
          hoveredPic = img;
          if (img !== target && !restedOn(img)) continue;
        }
        if (r.area > bestArea) { best = img; bestArea = r.area; }
      }
      if (hoveredPic !== pending.el) pending = { el: hoveredPic, since: performance.now() };
    }
    return best;
  };

  // Hover-delay bookkeeping for normal pictures.
  let pending = { el: null, since: 0 };
  let pendingTimer = null;
  const restedOn = (img) => {
    if (pending.el !== img) {
      pending = { el: img, since: performance.now() };
    }
    const left = cfg.imageDelay - (performance.now() - pending.since);
    if (left <= 0) return true;
    clearTimeout(pendingTimer);
    pendingTimer = setTimeout(evaluate, left + 10); // re-check once the delay passes
    return false;
  };

  const show = (el) => {
    clearTimeout(leaveTimer);
    leaveTimer = null;
    target = el;
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

  // Full-screen rectangle with a (rounded) hole where the video is.
  const holePath = (r) => {
    const W = innerWidth, H = innerHeight, p = 1;
    const L = r.left - p, T = r.top - p, R = r.right + p, B = r.bottom + p;
    const k = r.radius;
    const outer = `M0 0H${W}V${H}H0Z`;
    const inner = k > 0
      ? `M${L + k} ${T}H${R - k}A${k} ${k} 0 0 1 ${R} ${T + k}V${B - k}` +
        `A${k} ${k} 0 0 1 ${R - k} ${B}H${L + k}A${k} ${k} 0 0 1 ${L} ${B - k}` +
        `V${T + k}A${k} ${k} 0 0 1 ${L + k} ${T}Z`
      : `M${L} ${T}H${R}V${B}H${L}Z`;
    return `path(evenodd, "${outer} ${inner}")`;
  };

  // Keep the hole glued to the video while it scrolls / resizes.
  const loop = () => {
    cancelAnimationFrame(raf);
    let last = "";
    const tick = () => {
      if (!target) return;
      const r = target.isConnected && !document.fullscreenElement && visibleRect(target);
      if (!r) {
        layer.style.opacity = "0";
      } else {
        const cp = holePath(r);
        if (cp !== last) { layer.style.clipPath = cp; last = cp; }
        if (!leaveTimer) layer.style.opacity = "1";
      }
      raf = requestAnimationFrame(tick);
    };
    tick();
  };

  const evaluate = () => {
    if (!active()) {
      target = null;
      clearTimeout(leaveTimer); leaveTimer = null;
      layer.style.opacity = "0";
      return;
    }
    const el = pickVideo();
    if (el) show(el);
    else hide(cfg.mode === "hover" ? 250 : 0);
  };

  document.addEventListener("mousemove", (e) => {
    mouse = { x: e.clientX, y: e.clientY };
    evaluate();
  }, { passive: true, capture: true, ...sig });

  document.documentElement.addEventListener("mouseleave", () => {
    mouse = { x: -1, y: -1 };
    evaluate();
  }, sig);

  for (const ev of ["play", "playing", "pause", "ended", "emptied", "waiting", "stalled"]) {
    document.addEventListener(ev, evaluate, { capture: true, ...sig });
  }
  document.addEventListener("fullscreenchange", evaluate, sig);
  addEventListener("scroll", evaluate, { passive: true, capture: true, ...sig });
  addEventListener("resize", evaluate, { passive: true, ...sig });

  const onStorage = (changes) => {
    for (const k in changes) cfg[k] = changes[k].newValue;
    applyStyle();
    evaluate();
  };

  const cleanup = () => {
    abort.abort();
    clearInterval(timer);
    clearTimeout(leaveTimer);
    clearTimeout(pendingTimer);
    cancelAnimationFrame(raf);
    target = null;
    layer.remove();
    try { chrome.storage.onChanged.removeListener(onStorage); } catch (_) {}
    if (window.__videoFocusBlurCleanup === cleanup) window.__videoFocusBlurCleanup = null;
  };
  window.__videoFocusBlurCleanup = cleanup;

  const timer = setInterval(() => {
    // Extension was updated/removed: this copy is stale, so step aside.
    if (!(chrome.runtime && chrome.runtime.id)) return cleanup();
    evaluate(); // also catches videos swapped in by SPA sites
  }, 1000);

  chrome.storage.sync.get(DEFAULTS, (s) => { cfg = { ...DEFAULTS, ...s }; applyStyle(); evaluate(); });
  chrome.storage.onChanged.addListener(onStorage);
  applyStyle();
})();
