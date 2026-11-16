const DEFAULTS = { enabled: true, mode: "hover", blur: 14, dim: 35 };
const $ = (id) => document.getElementById(id);

chrome.storage.sync.get(DEFAULTS, (s) => {
  $("enabled").checked = s.enabled;
  $("mode").value = s.mode;
  $("blur").value = s.blur;
  $("dim").value = s.dim;
  $("blurV").textContent = s.blur + "px";
  $("dimV").textContent = s.dim + "%";
});

$("enabled").onchange = (e) => chrome.storage.sync.set({ enabled: e.target.checked });
$("mode").onchange = (e) => chrome.storage.sync.set({ mode: e.target.value });
$("blur").oninput = (e) => {
  $("blurV").textContent = e.target.value + "px";
  chrome.storage.sync.set({ blur: +e.target.value });
};
$("dim").oninput = (e) => {
  $("dimV").textContent = e.target.value + "%";
  chrome.storage.sync.set({ dim: +e.target.value });
};
