// DOM nodes
const container = document.getElementById("container");
const browserPanel = document.getElementById("browserPanel");
const resultsPanel = document.getElementById("resultsPanel");
const splitter = document.getElementById("splitter");

const urlInput = document.getElementById("urlInput");
const goButton = document.getElementById("goButton");
const scanButton = document.getElementById("scanButton");
const webview = document.getElementById("browser");
const resultsList = document.getElementById("resultsList");

// --- Navigation ---
function navigateTo(input) {
    const raw = (input || "").trim();
    if (!raw) return;
    const url = /^https?:\/\//i.test(raw) ? raw : `http://${raw}`;
    webview.src = url;
}

goButton.addEventListener("click", () => navigateTo(urlInput.value));
urlInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") navigateTo(urlInput.value);
});

// Keep address bar in sync when user clicks links in the webview
webview.addEventListener("did-navigate", (e) => { urlInput.value = e.url || ""; });
webview.addEventListener("did-navigate-in-page", (e) => { urlInput.value = e.url || ""; });

// --- Scan Page (uses preload-exposed API, NOT require('electron')) ---
scanButton.addEventListener("click", async () => {
    console.log("[Renderer] Scan Page clicked");

    // Pull candidate viewer links from the current page
    const viewerLinks = await webview.executeJavaScript(`
    Array.from(document.querySelectorAll("a[href] img"))
      .map(img => img.parentElement && img.parentElement.href)
      .filter(Boolean)
  `);

    console.log("[Renderer] Found candidate viewer links:", viewerLinks.length);

    // Clear previous results and kick off scan in main
    resultsList.innerHTML = "";
    if (window.electronAPI && typeof window.electronAPI.scanPage === "function") {
        window.electronAPI.scanPage(viewerLinks);
    } else {
        console.error("electronAPI.scanPage is not available from preload.");
    }
});

// Stream progress back into the results panel
if (window.electronAPI && typeof window.electronAPI.onScanProgress === "function") {
    window.electronAPI.onScanProgress(({ index, total, url, direct, error }) => {
        const li = document.createElement("li");
        if (error) {
            li.textContent = `(${index + 1}/${total}) [FAIL] ${url} — ${error}`;
        } else if (direct) {
            li.textContent = `(${index + 1}/${total}) ${direct}`;
        } else {
            li.textContent = `(${index + 1}/${total}) [unresolved] ${url}`;
        }
        resultsList.appendChild(li);
    });
} else {
    console.warn("electronAPI.onScanProgress is not wired; check preload.js");
}

// --- Splitter drag logic (top/bottom) ---
let isDragging = false;

splitter.addEventListener("mousedown", (e) => {
    e.preventDefault();
    isDragging = true;
    document.body.style.cursor = "row-resize";
});

document.addEventListener("mousemove", (e) => {
    if (!isDragging) return;

    const rect = container.getBoundingClientRect();
    const y = e.clientY - rect.top;
    const pct = Math.max(10, Math.min(90, (y / rect.height) * 100)); // clamp 10–90%

    browserPanel.style.height = `${pct}%`;
    resultsPanel.style.height = `${100 - pct}%`;
});

document.addEventListener("mouseup", () => {
    if (!isDragging) return;
    isDragging = false;
    document.body.style.cursor = "default";
});
