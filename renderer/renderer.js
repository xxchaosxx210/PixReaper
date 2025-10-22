// renderer.js
// Handles UI interactions and IPC for PixReaper

// --- Logging bridge (unified logger for renderer) ---
function logInfo(...args) {
    window.electronAPI.send("log:info", args);
}
function logDebug(...args) {
    window.electronAPI.send("log:debug", args);
}
function logError(...args) {
    window.electronAPI.send("log:error", args);
}

// --- Webview Controls ---
const webview = document.getElementById("browserView");
const urlInput = document.getElementById("urlInput");
const goButton = document.getElementById("goBtn");
const scanButton = document.getElementById("scanBtn");
const browsePathBtn = document.getElementById("browsePath");

// --- Bookmark Controls ---
const bookmarkSelect = document.getElementById("bookmarkSelect");
const addBookmarkBtn = document.getElementById("addBookmarkBtn");
const removeBookmarkBtn = document.getElementById("removeBookmarkBtn");

// --- Helper: Safe navigation ---
function navigateTo(rawUrl) {
    if (!rawUrl) return;
    let url = rawUrl.trim();
    if (!/^https?:\/\//i.test(url)) url = "https://" + url;
    try {
        logInfo("[Renderer] Navigating to:", url);
        webview.loadURL(url);
    } catch (err) {
        logError("[Renderer] Failed to load URL:", err);
    }
}

// --- Bookmark Logic ---
let currentBookmarks = [];

function refreshBookmarkList() {
    bookmarkSelect.innerHTML = "";
    const defaultOption = document.createElement("option");
    defaultOption.value = "";
    defaultOption.textContent = "-- Select Bookmark --";
    bookmarkSelect.appendChild(defaultOption);

    if (currentBookmarks.length === 0) {
        const emptyOption = document.createElement("option");
        emptyOption.disabled = true;
        emptyOption.textContent = "No bookmarks saved";
        bookmarkSelect.appendChild(emptyOption);
    } else {
        currentBookmarks.forEach((b) => {
            const opt = document.createElement("option");
            opt.value = b.url;
            opt.textContent = b.title || b.url;
            bookmarkSelect.appendChild(opt);
        });
    }
}

bookmarkSelect.addEventListener("change", (e) => {
    const url = e.target.value;
    if (url) {
        urlInput.value = url;
        navigateTo(url);
    }
});

// --- Prompt Overlay for Bookmark Title ---
function showPrompt(message, defaultValue = "", callback) {
    const modal = document.createElement("div");
    modal.className = "prompt-overlay";
    modal.innerHTML = `
        <div class="prompt-box">
            <p>${message}</p>
            <input type="text" id="promptInput" value="${defaultValue}" autofocus />
            <div class="prompt-buttons">
                <button id="promptOk">OK</button>
                <button id="promptCancel" class="cancel">Cancel</button>
            </div>
        </div>`;
    document.body.appendChild(modal);
    const input = modal.querySelector("#promptInput");
    modal.querySelector("#promptOk").onclick = () => {
        callback(input.value.trim());
        modal.remove();
    };
    modal.querySelector("#promptCancel").onclick = () => modal.remove();
}

// --- Add / Remove Bookmarks ---
addBookmarkBtn.addEventListener("click", () => {
    const currentUrl = urlInput.value.trim();
    if (!currentUrl || currentUrl === "about:blank") {
        alert("No valid URL to bookmark.");
        return;
    }
    showPrompt("Enter a title for this bookmark:", currentUrl, (title) => {
        if (!title) return;
        logInfo("[Renderer] Adding bookmark:", title, currentUrl);
        window.electronAPI.send("options:addBookmark", { title, url: currentUrl });
    });
});

removeBookmarkBtn.addEventListener("click", () => {
    const selectedUrl = bookmarkSelect.value;
    if (!selectedUrl) {
        alert("Please select a bookmark to remove.");
        return;
    }
    if (!confirm("Remove this bookmark?")) return;
    logInfo("[Renderer] Removing bookmark:", selectedUrl);
    window.electronAPI.send("options:removeBookmark", selectedUrl);
});

// --- Folder Picker ---
browsePathBtn.addEventListener("click", () => {
    logDebug("[Renderer] Opening folder picker...");
    window.electronAPI.send("choose-folder");
});
window.electronAPI.receive("choose-folder:result", (folderPath) => {
    if (folderPath) {
        document.getElementById("savePath").value = folderPath;
        logDebug("[Renderer] Folder selected:", folderPath);
    } else {
        logDebug("[Renderer] Folder picker cancelled.");
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
    logInfo(`[Renderer] Webview ${isHidden ? "hidden" : "shown"}.`);
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
        logDebug("[Renderer] Resized bottom panel to:", clamped, "px");
    }
});

// --- Navigation ---
goButton.addEventListener("click", () => navigateTo(urlInput.value));
webview.addEventListener("did-navigate", (event) => {
    const currentUrl = event.url;
    urlInput.value = currentUrl;
    if (currentUrl && currentUrl !== "about:blank") {
        window.electronAPI.send("options:save", { lastUrl: currentUrl });
        logDebug("[Renderer] Navigated to:", currentUrl);
    }
});

// --- Results & Status ---
const resultsList = document.getElementById("results");
let currentManifest = [];
let imagesFound = 0;
let downloadTotal = 0;
let downloadCompleted = 0;

const statusText = document.getElementById("statusText");
const imagesFoundText = document.getElementById("imageCount");
const progressBar = document.getElementById("progressBar");
const downloadBtn = document.getElementById("downloadBtn");
const completeSound = document.getElementById("downloadCompleteSound");
const cancelBtn = document.getElementById("cancelBtn");

let scanInProgress = false;
let downloadInProgress = false;

// --- Scan ---
scanButton.addEventListener("click", async () => {
    resultsList.innerHTML = "";
    currentManifest = [];
    downloadBtn.style.display = "none";
    cancelBtn.style.display = "inline-block";
    cancelBtn.disabled = false;
    imagesFound = 0;
    imagesFoundText.textContent = "Images found: 0";
    statusText.textContent = "Status: Scanning...";
    progressBar.style.width = "0%";
    scanInProgress = true;
    downloadInProgress = false;

    const hostText = document.getElementById("hostList").value || "";
    const validHosts = hostText.split("\n").map(h => h.trim().toLowerCase()).filter(Boolean);
    const rawLinks = await webview.executeJavaScript(`
        Array.from(document.querySelectorAll("a[href]"))
            .map(a => a.href)
            .filter(Boolean)
    `);
    const filteredLinks = validHosts.length > 0
        ? rawLinks.filter(href => validHosts.some(host => href.toLowerCase().includes(host)))
        : rawLinks;

    logInfo(`[Renderer] Scanning ${filteredLinks.length} links...`);
    window.electronAPI.send("scan-page", filteredLinks);
});

cancelBtn.addEventListener("click", () => {
    if (downloadInProgress) {
        logInfo("[Renderer] Cancelling download queue...");
        statusText.textContent = "Status: Cancelling download...";
        cancelBtn.disabled = true;
        window.electronAPI.send("download:cancel");
        return;
    }

    if (scanInProgress) {
        logInfo("[Renderer] Cancelling active scan...");
        statusText.textContent = "Status: Cancelling scan...";
        cancelBtn.disabled = true;
        window.electronAPI.send("scan:cancel");
        return;
    }

    logDebug("[Renderer] Cancel button pressed with no active scan or download.");
    cancelBtn.style.display = "none";
    cancelBtn.disabled = false;
    scanInProgress = false;
    downloadInProgress = false;
});

// --- Scan Progress ---
window.electronAPI.receive("scan-progress", (data) => {
    const allowedExts = Array.from(document.querySelectorAll(".ext-option:checked"))
        .map(cb => cb.value.toLowerCase());
    const url = data.resolved || data.original;
    if (!url || !isAllowedExtension(url, allowedExts)) return;

    const index = resultsList.children.length + 1;
    const li = document.createElement("li");
    li.className = "pending";
    li.innerHTML = `<span class="status-icon pending"></span><a href="${url}" target="_blank">${url}</a>`;
    resultsList.appendChild(li);
    imagesFound++;
    imagesFoundText.textContent = "Images found: " + imagesFound;
    if (resultsList.children.length === 1) downloadBtn.style.display = "inline-block";
});

// --- Scan Complete ---
window.electronAPI.receive("scan-complete", () => {
    // If the user cancelled mid-scan, ignore this
    if (statusText.textContent.includes("Cancelling") || statusText.textContent.includes("cancelled")) {
        logDebug("[Renderer] Ignoring scan-complete event (scan was cancelled).");
        return;
    }

    cancelBtn.style.display = "none";
    cancelBtn.disabled = false;
    scanInProgress = false;

    if (resultsList.children.length > 0) {
        statusText.textContent = "Status: Scan complete. Ready to download.";
        resultsList.querySelectorAll("li.pending").forEach(li => li.className = "ready");
    } else {
        statusText.textContent = "Status: Scan complete — no results found.";
    }

    logInfo("[Renderer] Scan complete.");
});

// --- Scan Cancelled Feedback ---
window.electronAPI.receive("scan:cancelled", () => {
    statusText.textContent = "Status: Scan cancelled.";
    cancelBtn.style.display = "none";
    cancelBtn.disabled = false;
    scanInProgress = false;
    logInfo("[Renderer] Scan cancelled and workers terminated.");
});



// --- Options Modal Logic ---
const optionsModal = document.getElementById("optionsModal");
const optionsButton = document.getElementById("optionsBtn");
const cancelOptions = document.getElementById("cancelOptions");
const saveOptions = document.getElementById("saveOptions");
const resetOptions = document.getElementById("resetOptions");
const viewLog = document.getElementById("viewLog");
const maxConnections = document.getElementById("maxConnections");
const maxConnectionsValue = document.getElementById("maxConnectionsValue");

optionsButton.addEventListener("click", () => {
    logDebug("[Renderer] Opening options modal...");
    optionsModal.style.display = "block";
});
cancelOptions.addEventListener("click", () => {
    logDebug("[Renderer] Closing options modal...");
    optionsModal.style.display = "none";
});
maxConnections.addEventListener("input", () => {
    maxConnectionsValue.textContent = maxConnections.value;
});
saveOptions.addEventListener("click", () => {
    const selectedExts = Array.from(document.querySelectorAll(".ext-option:checked")).map(cb => cb.value);
    const hostList = document.getElementById("hostList").value
        .split("\n")
        .map(h => h.trim().toLowerCase())
        .filter(Boolean);
    const newOptions = {
        prefix: document.getElementById("prefix").value.trim(),
        savePath: document.getElementById("savePath").value.trim(),
        createSubfolder: document.getElementById("subfolder").checked,
        indexing: document.querySelector('input[name="indexing"]:checked').value,
        duplicateMode: document.querySelector('input[name="duplicateMode"]:checked').value,
        playSoundOnComplete: document.getElementById("playSoundOnComplete").checked,
        maxConnections: parseInt(document.getElementById("maxConnections").value, 10),
        debugLogging: document.getElementById("debugLogging").checked,
        autoOpenFolder: document.getElementById("autoOpenFolder").checked,
        validExtensions: selectedExts,
        validHosts: hostList,
        bottomPanelHeight: parseInt(bottomPanel.style.height, 10) || null
    };
    logInfo("[Renderer] Saving options:", newOptions);
    window.electronAPI.send("options:save", newOptions);
    optionsModal.style.display = "none";
});
resetOptions.addEventListener("click", () => {
    if (!confirm("Are you sure you want to reset all options to defaults?")) return;
    logInfo("[Renderer] Resetting options to defaults...");
    window.electronAPI.send("options:reset");
});

viewLog.addEventListener("click", () => {
    logInfo("[Renderer] Opening log file...");
    window.electronAPI.send("log:open");
});


// --- Helpers ---
function sanitizeFilename(name) { return name.replace(/[<>:"/\\|?*]+/g, "_"); }
function isAllowedExtension(url, allowed) {
    if (!url) return false;
    const clean = url.split("?")[0].toLowerCase();
    return allowed.some(ext => clean.endsWith("." + ext));
}
function deriveSlugFromUrl(url) {
    try {
        const u = new URL(url);
        let slug = u.pathname.split("/").filter(Boolean).pop();
        if (!slug || slug.length < 2) slug = u.hostname.replace(/^www\./, "");
        return sanitizeFilename(slug);
    } catch { return null; }
}

// --- Download Manifest ---
downloadBtn.addEventListener("click", async () => {
    downloadBtn.style.display = "none";
    cancelBtn.style.display = "inline-block";
    cancelBtn.disabled = false;
    scanInProgress = false;
    logInfo("[Renderer] Preparing download manifest...");

    const options = {
        prefix: document.getElementById("prefix").value.trim(),
        savePath: document.getElementById("savePath").value.trim() || "PixReaper",
        createSubfolder: document.getElementById("subfolder").checked,
        indexing: document.querySelector('input[name="indexing"]:checked').value,
    };

    const items = resultsList.querySelectorAll("li a");
    const padWidth = String(items.length).length;
    currentManifest = [];
    const allowedExts = Array.from(document.querySelectorAll(".ext-option:checked")).map(cb => cb.value.toLowerCase());

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
    progressBar.style.width = "0%";
    if (downloadTotal > 0) {
        statusText.textContent = `Status: Downloading (0/${downloadTotal}) — 0%`;
        downloadInProgress = true;
    } else {
        statusText.textContent = "Status: No downloads queued.";
        cancelBtn.style.display = "none";
        downloadInProgress = false;
    }

    logInfo(`[Renderer] Sending ${downloadTotal} downloads to main process.`);
    window.electronAPI.send("download:start", {
        manifest: currentManifest,
        options: { ...options, debugLogging: document.getElementById("debugLogging").checked }
    });
});

// --- Download Cancelled Feedback ---
window.electronAPI.receive("download:cancelled", () => {
    statusText.textContent = "Status: Download cancelled.";
    cancelBtn.style.display = "none";
    cancelBtn.disabled = false;
    downloadInProgress = false;
    logInfo("[Renderer] Download cancelled by user.");
});


// --- Download Progress ---
window.electronAPI.receive("download:progress", (data) => {
    const { index, status, savePath } = data;
    const entry = currentManifest.find(e => e.index === index);
    if (entry) entry.status = status;

    // Count completed (success + skipped + overwritten + renamed)
    const completedCount = currentManifest.filter(e =>
        ["success", "skipped", "overwritten", "renamed"].includes(e.status)
    ).length;

    const percent = ((completedCount / downloadTotal) * 100).toFixed(1);
    statusText.textContent = `Status: Downloading (${completedCount}/${downloadTotal}) — ${percent}%`;
    progressBar.style.width = `${percent}%`;

    const li = resultsList.querySelector(`li[data-index="${index}"]`);
    if (!li) return;
    li.className = status;

    const icon = li.querySelector(".status-icon");
    if (icon) icon.className = `status-icon ${status}`;
    const link = li.querySelector("a");
    if (!link) return;

    switch (status) {
        case "success":
            link.textContent = savePath;
            link.href = "file:///" + savePath.replace(/\\/g, "/");
            link.style.color = "#333";
            break;
        case "retrying":
            link.textContent = "Retrying download...";
            link.removeAttribute("href");
            link.style.color = "orange";
            break;
        case "failed":
            link.textContent = "Failed: " + entry.url;
            link.href = entry.url;
            link.style.color = "red";
            break;
        case "cancelled":
            link.textContent = "Cancelled: " + entry.url;
            link.style.color = "gray";
            break;
        case "skipped":
            link.textContent = "Skipped duplicate file";
            link.style.color = "#777";
            break;
        case "overwritten":
            link.textContent = "Overwritten existing file";
            link.style.color = "#0066cc";
            break;
        case "renamed":
            link.textContent = "Renamed duplicate file → " + savePath.split("/").pop();
            link.style.color = "#009933";
            break;
    }
});

window.electronAPI.receive("download:complete", (data = {}) => {
    cancelBtn.style.display = "none";
    cancelBtn.disabled = false;
    progressBar.style.width = "100%";
    downloadInProgress = false;

    const summary = data.summary || {};
    const { success = 0, skipped = 0, failed = 0, cancelled = 0, total = 0 } = summary;

    let text = "Status: All downloads complete.";
    if (total > 0) {
        text = `Status: Completed — ${success} downloaded`;
        if (skipped > 0) text += `, ${skipped} skipped`;
        if (failed > 0) text += `, ${failed} failed`;
        if (cancelled > 0) text += `, ${cancelled} cancelled`;
        text += ` (Total: ${total})`;
    }

    statusText.textContent = text;
    // 🔊 Play completion sound if enabled
    if (optCache?.playSoundOnComplete && completeSound) {
        completeSound.currentTime = 0;
        completeSound.play().catch(err => logError("[Renderer] Failed to play sound:", err));
    }

    logInfo("[Renderer] " + text);
});


// --- IPC: Options Load ---
window.electronAPI.receive("options:load", (opt) => {
    document.getElementById("prefix").value = opt.prefix ?? "";
    document.getElementById("savePath").value = opt.savePath ?? "";
    document.getElementById("subfolder").checked = !!opt.createSubfolder;
    document.getElementById("autoOpenFolder").checked = !!opt.autoOpenFolder;

    const dupMode = opt.duplicateMode || "skip";
    document.querySelectorAll('input[name="duplicateMode"]').forEach(r => {
        r.checked = r.value === dupMode;
    });

    const indexing = opt.indexing ?? "order";
    document.querySelectorAll('input[name="indexing"]').forEach(r => r.checked = r.value === indexing);
    document.getElementById("debugLogging").checked = !!opt.debugLogging;

    const slider = document.getElementById("maxConnections");
    slider.value = opt.maxConnections ?? 10;
    document.getElementById("maxConnectionsValue").textContent = slider.value;

    document.querySelectorAll(".ext-option").forEach(cb => cb.checked = (opt.validExtensions ?? []).includes(cb.value));
    document.getElementById("hostList").value = (opt.validHosts ?? []).join("\n");

    if (opt.bottomPanelHeight) {
        bottomPanel.style.height = opt.bottomPanelHeight + "px";
        bottomPanel.style.flex = "0 0 auto";
    }

    currentBookmarks = opt.bookmarks ?? [];
    refreshBookmarkList();

    if (opt.lastUrl && opt.lastUrl !== "about:blank") {
        urlInput.value = opt.lastUrl;
        navigateTo(opt.lastUrl);
    } else {
        urlInput.value = "about:blank";
        navigateTo("about:blank");
    }

    // Cache options for use elsewhere (e.g. sound playback)
    window.optCache = opt;


});

