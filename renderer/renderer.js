const urlInput = document.getElementById("urlInput");
const goBtn = document.getElementById("goBtn");
const scanBtn = document.getElementById("scanBtn");
const browserView = document.getElementById("browserView");
const resultsList = document.getElementById("results");
const splitter = document.getElementById("splitter");
const topPanel = document.getElementById("top-panel");
const bottomPanel = document.getElementById("bottom-panel");

// --- Supported hosts ---
const supportedHosts = [
    "pixhost.to",
    "imagebam.com",
    "imagevenue.com",
    "imgbox.com",
    "pimpandhost.com",
    "postimg.cc",
    "turboimagehost.com",
    "fastpic.org",
    "fastpic.ru",
    "imagetwist.com",
    "imgview.net",
    "radikal.ru",
    "imageupper.com",
];

// --- Navigation ---
goBtn.addEventListener("click", () => {
    const url = urlInput.value.trim();
    if (url) {
        browserView.src = url; // ✅ use src instead of loadURL
    }
});

urlInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
        goBtn.click();
    }
});

// --- Scan Page ---
scanBtn.addEventListener("click", async () => {
    const viewerLinks = await browserView.executeJavaScript(`
    const supported = ${JSON.stringify(supportedHosts)};
    Array.from(document.querySelectorAll("a[href] img"))
      .map(img => img.parentElement.href)
      .filter(href => {
        try {
          const host = new URL(href).hostname.replace(/^www\\./, "");
          return supported.some(s => host.endsWith(s));
        } catch {
          return false;
        }
      });
  `);

    console.log("[Renderer] Found filtered viewer links:", viewerLinks.length);
    resultsList.innerHTML = ""; // clear old results

    viewerLinks.forEach((link) => {
        addResultItem(link, "pending");
    });

    window.electronAPI.scanPage(viewerLinks);
});

// --- Receive scan progress ---
window.electronAPI.onScanProgress(({ original, resolved, status }) => {
    const normalize = (u) => {
        try {
            const url = new URL(u);
            return url.href.replace(/\/$/, "");
        } catch {
            return u;
        }
    };

    const item = Array.from(resultsList.children)
        .find(li => normalize(li.dataset.link) === normalize(original));

    if (item) {
        const statusEl = item.querySelector(".result-status");
        const linkEl = item.querySelector(".result-link");

        if (status === "success" && resolved) {
            statusEl.textContent = "✅";
            statusEl.className = "result-status status-success";
            linkEl.innerHTML = `<a href="${resolved}" target="_blank">${resolved}</a>`;
        } else if (status === "failed") {
            statusEl.textContent = "⚠️";
            statusEl.className = "result-status status-failed";
            linkEl.textContent = "Failed to resolve";
        }
    } else {
        console.warn("[Renderer] No match found for:", original);
    }
});

// --- Helpers ---
function addResultItem(link, status) {
    const li = document.createElement("li");
    li.className = "result-item";
    li.dataset.link = link;

    const statusEl = document.createElement("div");
    statusEl.className = "result-status status-" + status;
    statusEl.textContent = status === "pending" ? "⏳" : "";

    const linkEl = document.createElement("div");
    linkEl.className = "result-link";
    linkEl.textContent = link; // show raw link until resolved

    li.appendChild(statusEl);
    li.appendChild(linkEl);
    resultsList.appendChild(li);
}

// --- Splitter logic ---
let isDragging = false;

splitter.addEventListener("mousedown", () => {
    isDragging = true;
    document.body.style.cursor = "row-resize";
});

window.addEventListener("mousemove", (e) => {
    if (!isDragging) return;

    const containerHeight = window.innerHeight;
    const topHeight = e.clientY;
    const bottomHeight = containerHeight - topHeight - splitter.offsetHeight;

    topPanel.style.flex = "none";
    bottomPanel.style.flex = "none";
    topPanel.style.height = `${topHeight}px`;
    bottomPanel.style.height = `${bottomHeight}px`;
});

window.addEventListener("mouseup", () => {
    isDragging = false;
    document.body.style.cursor = "default";
});
