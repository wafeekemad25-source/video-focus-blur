const DEFAULTS = {
  enabled: true, mode: "hover", gifs: true, images: true, imageDelay: 500,
  blur: 14, dim: 35, disabledSites: [],
};
const delayText = (ms) => (ms == 0 ? "فوراً" : (ms / 1000).toFixed(1) + " ث");
const syncHoverOpts = () => { $("hoverOpts").hidden = $("mode").value !== "hover"; };
const $ = (id) => document.getElementById(id);
let host = null;

$("ver").textContent = "v" + chrome.runtime.getManifest().version;

chrome.storage.sync.get(DEFAULTS, (s) => {
  $("enabled").checked = s.enabled;
  $("mode").value = s.mode;
  $("gifs").checked = s.gifs;
  $("images").checked = s.images;
  $("imageDelay").value = s.imageDelay;
  $("delayV").textContent = delayText(s.imageDelay);
  syncHoverOpts();
  $("blur").value = s.blur;
  $("dim").value = s.dim;
  $("blurV").textContent = s.blur + "px";
  $("dimV").textContent = s.dim + "%";

  chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => {
    try {
      const u = new URL(tab && tab.url);
      if (!/^https?:$/.test(u.protocol)) return;
      host = u.hostname;
      $("siteName").textContent = host;
      $("site").checked = !s.disabledSites.includes(host);
      $("siteBox").hidden = false;
    } catch (_) { /* chrome:// pages etc. */ }
  });
});

$("enabled").onchange = (e) => chrome.storage.sync.set({ enabled: e.target.checked });
$("mode").onchange = (e) => { chrome.storage.sync.set({ mode: e.target.value }); syncHoverOpts(); };
$("gifs").onchange = (e) => chrome.storage.sync.set({ gifs: e.target.checked });
$("images").onchange = (e) => chrome.storage.sync.set({ images: e.target.checked });
$("imageDelay").oninput = (e) => {
  $("delayV").textContent = delayText(e.target.value);
  chrome.storage.sync.set({ imageDelay: +e.target.value });
};
$("site").onchange = (e) => {
  if (!host) return;
  chrome.storage.sync.get({ disabledSites: [] }, ({ disabledSites }) => {
    const set = new Set(disabledSites);
    e.target.checked ? set.delete(host) : set.add(host);
    chrome.storage.sync.set({ disabledSites: [...set] });
  });
};
$("blur").oninput = (e) => {
  $("blurV").textContent = e.target.value + "px";
  chrome.storage.sync.set({ blur: +e.target.value });
};
$("dim").oninput = (e) => {
  $("dimV").textContent = e.target.value + "%";
  chrome.storage.sync.set({ dim: +e.target.value });
};
