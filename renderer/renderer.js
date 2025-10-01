// renderer.js
// Handles UI interactions and IPC for PixReaper

// --- Webview Controls ---
const webview = document.getElementById("browserView");
const urlInput = document.getElementById("urlInput");
const goButton = document.getElementById("goBtn");
const scanButton = document.getElementById("scanBtn");
const browsePathBtn = document.getElementById("browsePath");

browsePathBtn.addEventListener("click", () => {
    console.log("[Renderer] Browse for folder...");
    window.electronAPI.send("choose-folder");
});

window.electronAPI.receive("choose-folder:result", (folderPath) => {
    if (folderPath) {
        console.log("[Renderer] Folder chosen:", folderPath);
        document.getElementById("savePath").value = folderPath;
    }
});

// --- Toggle Webview Visibility ---
const toggleViewBtn = document.getElementById("toggleViewBtn");
const splitter = document.getElementById("splitter");
const bottomPanel = document.getElementById("bottom-panel");

toggleViewBtn.addEventListener("click", () => {
    const isHidden = webview.classList.toggle("hidden");
    splitter.style.display = isHidden ? "none" : "block";
    toggleViewBtn.textContent = isHidden ? "🖥️ Show View" : "🖥️ Hide View";

    if (isHidden) {
        bottomPanel.style.height = "auto";
        bottomPanel.style.flex = "1 1 auto";
    } else {
        bottomPanel.style.flex = "0 0 120px";
        bottomPanel.style.height = "";
    }
});

// --- Resizable Bottom Panel ---
let isResizing = false;

splitter.addEventListener("mousedown", (e) => {
    if (webview.classList.contains("hidden")) return;
    isResizing = true;
    document.body.style.cursor = "row-resize";
    e.preventDefault();
});

window.addEventListener("mousemove", (e) => {
    if (!isResizing) return;
    const newHeight = window.innerHeight - e.clientY;
    const clamped = Math.min(Math.max(newHeight, 60), window.innerHeight * 0.7);
    bottomPanel.style.height = clamped + "px";
    bottomPanel.style.flex = "0 0 auto";
});

window.addEventListener("mouseup", (e) => {
    if (isResizing) {
        isResizing = false;
        document.body.style.cursor = "";
        const newHeight = window.innerHeight - e.clientY;
        const clamped = Math.min(Math.max(newHeight, 60), window.innerHeight * 0.7);
        window.electronAPI.send("options:save", { bottomPanelHeight: clamped });
    }
});

// --- Navigation ---
goButton.addEventListener("click", () => {
    let url = urlInput.value.trim();
    if (!/^https?:\/\//i.test(url)) {
        url = "https://" + url;
    }
    webview.loadURL(url);
});

webview.addEventListener("did-navigate", (event) => {
    urlInput.value = event.url;
});

// --- Results / State ---
const resultsList = document.getElementById("results");
let currentManifest = [];
let imagesFound = 0;
let downloadTotal = 0;
let downloadCompleted = 0;

const statusText = document.getElementById("statusText");
const imagesFoundText = document.getElementById("imageCount");
const progressBar = document.getElementById("progressBar");
const downloadBtn = document.getElementById("downloadBtn");
const cancelBtn = document.getElementById("cancelBtn");

function resetScanState() {
    resultsList.innerHTML = "";
    currentManifest = [];
    imagesFound = 0;
    imagesFoundText.textContent = "Images found: 0";
    statusText.textContent = "Status: Ready";
    progressBar.style.width = "0%";
    downloadBtn.style.display = "none";
    cancelBtn.style.display = "none";
}

// --- Scan ---
scanButton.addEventListener("click", async () => {
    resetScanState();
    cancelBtn.style.display = "inline-block";
    statusText.textContent = "Status: Scanning...";

    const hostText = document.getElementById("hostList").value || "";
    const validHosts = hostText.split("\n").map(h => h.trim().toLowerCase()).filter(Boolean);

    console.log("[Renderer] Starting scan. Hosts:", validHosts);

    const rawLinks = await webview.executeJavaScript(`
        Array.from(document.querySelectorAll("a[href]"))
            .map(a => a.href)
            .filter(Boolean)
    `);

    console.log("[Renderer] Raw links found:", rawLinks.length);

    // 🔑 Change: if no hosts defined, block all instead of allowing all
    const filteredLinks = validHosts.length > 0
        ? rawLinks.filter(href => validHosts.some(host => href.toLowerCase().includes(host)))
        : [];

    console.log("[Renderer] Filtered links:", filteredLinks.length);

    window.electronAPI.send("scan-page", filteredLinks);
});

// --- Scan progress ---
window.electronAPI.receive("scan-progress", (data) => {
    console.log("[Renderer] scan-progress:", data);

    const allowedExts = Array.from(
        document.querySelectorAll(".ext-option:checked")
    ).map(cb => cb.value.toLowerCase());

    const url = data.resolved || data.original;
    if (!url || !isAllowedExtension(url, allowedExts)) return;

    const index = resultsList.children.length + 1;
    const li = document.createElement("li");
    li.className = "pending";
    li.setAttribute("data-index", index);
    li.innerHTML = `<span class="status-icon pending"></span><a href="${url}" target="_blank">${url}</a>`;
    resultsList.appendChild(li);

    imagesFound++;
    imagesFoundText.textContent = `Images found: ${imagesFound}`;
});

// --- Scan complete ---
window.electronAPI.receive("scan-complete", () => {
    cancelBtn.style.display = "none";
    cancelBtn.disabled = false;
    if (resultsList.children.length > 0) {
        statusText.textContent = "Status: Scan complete. Ready to download.";
        downloadBtn.style.display = "inline-block"; // ✅ ensure visible
    } else {
        statusText.textContent = "Status: Scan complete — no results found.";
    }
});

// --- Options Modal ---
const optionsModal = document.getElementById("optionsModal");
const optionsButton = document.getElementById("optionsBtn");
const cancelOptions = document.getElementById("cancelOptions");
const saveOptions = document.getElementById("saveOptions");
const resetOptions = document.getElementById("resetOptions"); // ✅ reset button
const maxConnections = document.getElementById("maxConnections");
const maxConnectionsValue = document.getElementById("maxConnectionsValue");

optionsButton.addEventListener("click", () => optionsModal.style.display = "block");
cancelOptions.addEventListener("click", () => optionsModal.style.display = "none");
maxConnections.addEventListener("input", () => {
    maxConnectionsValue.textContent = maxConnections.value;
});

// Save Options
saveOptions.addEventListener("click", () => {
    const selectedExts = Array.from(
        document.querySelectorAll(".ext-option:checked")
    ).map(cb => cb.value);

    const hostList = document.getElementById("hostList").value
        .split("\n")
        .map(h => h.trim().toLowerCase())
        .filter(Boolean);

    const newOptions = {
        prefix: document.getElementById("prefix").value.trim(),
        savePath: document.getElementById("savePath").value.trim(),
        createSubfolder: document.getElementById("subfolder").checked,
        indexing: document.querySelector('input[name="indexing"]:checked').value,
        maxConnections: parseInt(maxConnections.value, 10),
        debugLogging: document.getElementById("debugLogging").checked,
        validExtensions: selectedExts,
        validHosts: hostList,
        bottomPanelHeight: parseInt(bottomPanel.style.height, 10) || null
    };
    console.log("[Renderer] Saving options:", newOptions);
    window.electronAPI.send("options:save", newOptions);
    optionsModal.style.display = "none";
});

// Reset Options to defaults
resetOptions.addEventListener("click", () => {
    console.log("[Renderer] Resetting options to defaults");
    window.electronAPI.send("options:reset");
});

// --- Helpers ---
function sanitizeFilename(name) {
    return name.replace(/[<>:"/\\|?*]+/g, "_");
}
function isAllowedExtension(url, allowed) {
    if (!url) return false;
    const clean = url.split("?")[0].toLowerCase();
    return allowed.some(ext => clean.endsWith("." + ext.toLowerCase()));
}
function deriveSlugFromUrl(url) {
    try {
        const u = new URL(url);
        let slug = u.pathname.split("/").filter(Boolean).pop();
        if (!slug || slug.length < 2) slug = u.hostname.replace(/^www\./, "");
        return sanitizeFilename(slug);
    } catch {
        return null;
    }
}

// --- Download Manifest ---
downloadBtn.addEventListener("click", async () => {
    console.log("[Renderer] Download button clicked");
    downloadBtn.style.display = "none";
    cancelBtn.style.display = "inline-block";

    const options = {
        prefix: document.getElementById("prefix").value.trim(),
        savePath: document.getElementById("savePath").value.trim() || "PixReaper",
        createSubfolder: document.getElementById("subfolder").checked,
        indexing: document.querySelector('input[name="indexing"]:checked').value,
    };

    const items = resultsList.querySelectorAll("li a");
    const padWidth = String(items.length).length;

    currentManifest = [];
    const allowedExts = Array.from(
        document.querySelectorAll(".ext-option:checked")
    ).map(cb => cb.value.toLowerCase());

    let folder = options.savePath;
    if (options.createSubfolder) {
        const currentUrl = await webview.getURL();
        let slug = deriveSlugFromUrl(currentUrl);
        if (!slug) slug = "Scan_" + new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
        folder = `${folder}/${slug}`;
    }

    items.forEach((link) => {
        const url = link.getAttribute("href");
        if (!isAllowedExtension(url, allowedExts)) return;

        const index = currentManifest.length + 1;
        let base = url.split("/").pop().split("?")[0] || "image";
        base = sanitizeFilename(base);
        if (!base.includes(".")) base += ".jpg";

        const filename = options.indexing === "order"
            ? `${options.prefix}${String(index).padStart(padWidth, "0")}_${base}`
            : `${options.prefix}${base}`;

        const savePath = `${folder}/${filename}`;
        currentManifest.push({ index, url, status: "pending", filename, savePath });
        link.closest("li").setAttribute("data-index", index);
    });

    downloadTotal = currentManifest.length;
    downloadCompleted = 0;
    statusText.textContent = `Status: Downloading (0/${downloadTotal}) — 0%`;
    progressBar.style.width = "0%";

    window.electronAPI.send("download:start", {
        manifest: currentManifest,
        options: {
            ...options,
            debugLogging: document.getElementById("debugLogging").checked
        }
    });
});

// --- IPC: Options Load/Save ---
window.electronAPI.receive("options:load", (opt) => {
    console.log("[Renderer] Loaded options:", opt);
    document.getElementById("prefix").value = opt.prefix ?? "";
    document.getElementById("savePath").value = opt.savePath ?? "";
    document.getElementById("subfolder").checked = !!opt.createSubfolder;

    const indexing = opt.indexing ?? "order";
    document.querySelectorAll('input[name="indexing"]').forEach((radio) => {
        radio.checked = radio.value === indexing;
    });

    maxConnections.value = opt.maxConnections ?? 10;
    maxConnectionsValue.textContent = maxConnections.value;

    document.getElementById("debugLogging").checked = !!opt.debugLogging;

    const allowed = opt.validExtensions ?? ["jpg", "jpeg"];
    document.querySelectorAll(".ext-option").forEach(cb => {
        cb.checked = allowed.includes(cb.value);
    });

    document.getElementById("hostList").value = (opt.validHosts ?? []).join("\n");

    if (opt.bottomPanelHeight) {
        bottomPanel.style.height = opt.bottomPanelHeight + "px";
        bottomPanel.style.flex = "0 0 auto";
    }
});

window.electronAPI.receive("options:saved", (saved) => {
    console.log("[Renderer] Options saved:", saved);
});

// --- IPC: Download Progress ---
window.electronAPI.receive("download:progress", (data) => {
    downloadCompleted = currentManifest.filter(e => e.status === "success").length;
    const percent = ((downloadCompleted / downloadTotal) * 100).toFixed(1);
    statusText.textContent = `Status: Downloading (${downloadCompleted}/${downloadTotal}) — ${percent}%`;
    progressBar.style.width = `${percent}%`;

    const { index, status, savePath } = data;
    const entry = currentManifest.find(e => e.index === index);
    if (entry) entry.status = status;

    const li = resultsList.querySelector(`li[data-index="${index}"]`);
    if (li) {
        const icon = li.querySelector(".status-icon");
        if (icon) icon.className = `status-icon ${status}`;

        const link = li.querySelector("a");
        if (link) {
            if (status === "success") {
                link.textContent = savePath;
                link.href = "file:///" + savePath.replace(/\\/g, "/");
                link.target = "_blank";
                link.style.color = "";
            } else if (status === "retrying") {
                link.textContent = "Retrying download...";
                link.removeAttribute("href");
                link.style.color = "orange";
            } else if (status === "failed") {
                link.textContent = "Failed: " + (entry.url || link.textContent);
                link.href = entry.url;
                link.target = "_blank";
                link.style.color = "red";
            } else if (status === "cancelled") {
                link.textContent = "Cancelled: " + (entry.url || link.textContent);
                link.removeAttribute("href");
                link.style.color = "gray";
            }
        }
    }
});

// --- IPC: Download Complete ---
window.electronAPI.receive("download:complete", () => {
    console.log("[Renderer] All downloads complete.");
    cancelBtn.style.display = "none";
    cancelBtn.disabled = false;
    statusText.textContent = "Status: All downloads complete.";
    progressBar.style.width = "100%";
});
