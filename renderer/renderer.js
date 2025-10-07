// renderer.js
// Handles UI interactions and IPC for PixReaper

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
    if (!url) url = "about:blank";
    if (!/^https?:\/\//i.test(url) && url !== "about:blank") {
        url = "https://" + url;
    }
    try {
        console.log("[Renderer] Navigating to:", url);
        webview.loadURL(url);
    } catch (err) {
        console.error("[Renderer] Failed to load URL:", err);
    }
}

// --- Bookmark Logic ---
let currentBookmarks = [];

// Update dropdown
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

// When a bookmark is selected
bookmarkSelect.addEventListener("change", (e) => {
    const url = e.target.value;
    if (url) {
        urlInput.value = url;
        navigateTo(url);
    }
});

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
    const okBtn = modal.querySelector("#promptOk");
    const cancelBtn = modal.querySelector("#promptCancel");

    okBtn.onclick = () => {
        callback(input.value.trim());
        modal.remove();
    };
    cancelBtn.onclick = () => modal.remove();
}

// --- Replace the old prompt() usage with this ---
addBookmarkBtn.addEventListener("click", () => {
    const currentUrl = urlInput.value.trim();
    if (!currentUrl || currentUrl === "about:blank") {
        alert("No valid URL to bookmark.");
        return;
    }

    showPrompt("Enter a title for this bookmark:", currentUrl, (title) => {
        if (!title) return;
        console.log("[Renderer] Adding bookmark:", { title, url: currentUrl });
        window.electronAPI.send("options:addBookmark", { title, url: currentUrl });
    });
});


// --- Remove bookmark ---
removeBookmarkBtn.addEventListener("click", () => {
    const selectedUrl = bookmarkSelect.value;
    if (!selectedUrl) {
        alert("Please select a bookmark to remove.");
        return;
    }

    if (!confirm("Remove this bookmark?")) return;
    console.log("[Renderer] Removing bookmark:", selectedUrl);

    window.electronAPI.send("options:removeBookmark", selectedUrl);
});


// --- Folder Picker ---
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
    const url = urlInput.value.trim();
    navigateTo(url);
});

// --- Save last visited URL ---
webview.addEventListener("did-navigate", (event) => {
    const currentUrl = event.url;
    urlInput.value = currentUrl;
    if (currentUrl && currentUrl !== "about:blank") {
        console.log("[Renderer] Saving last visited URL:", currentUrl);
        window.electronAPI.send("options:save", { lastUrl: currentUrl });
    }
});

// --- Results + Status ---
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

// --- Scan ---
scanButton.addEventListener("click", async () => {
    resultsList.innerHTML = "";
    currentManifest = [];
    downloadBtn.style.display = "none";
    cancelBtn.style.display = "inline-block";
    imagesFound = 0;
    imagesFoundText.textContent = "Images found: 0";
    statusText.textContent = "Status: Scanning...";
    progressBar.style.width = "0%";

    const hostText = document.getElementById("hostList").value || "";
    const validHosts = hostText.split("\n").map(h => h.trim().toLowerCase()).filter(Boolean);
    console.log("[Renderer] Starting scan. Hosts:", validHosts);

    const rawLinks = await webview.executeJavaScript(`
        Array.from(document.querySelectorAll("a[href]"))
            .map(a => a.href)
            .filter(Boolean)
    `);

    console.log("[Renderer] Raw links found:", rawLinks.length);
    const filteredLinks = validHosts.length > 0
        ? rawLinks.filter(href => validHosts.some(host => href.toLowerCase().includes(host)))
        : rawLinks;
    console.log("[Renderer] Filtered links:", filteredLinks.length);
    window.electronAPI.send("scan-page", filteredLinks);
});

// --- Scan Progress ---
window.electronAPI.receive("scan-progress", (data) => {
    const allowedExts = Array.from(
        document.querySelectorAll(".ext-option:checked")
    ).map(cb => cb.value.toLowerCase());
    const url = data.resolved || data.original;
    if (!url) return;
    if (!isAllowedExtension(url, allowedExts)) return;

    const index = resultsList.children.length + 1;
    const li = document.createElement("li");
    li.className = "pending";
    li.setAttribute("data-index", index);
    li.innerHTML = `<span class="status-icon pending"></span><a href="${url}" target="_blank">${url}</a>`;
    resultsList.appendChild(li);
    imagesFound++;
    imagesFoundText.textContent = "Images found: " + imagesFound;
    if (resultsList.children.length === 1) downloadBtn.style.display = "inline-block";
});

// --- Scan Complete ---
window.electronAPI.receive("scan-complete", () => {
    cancelBtn.style.display = "none";
    cancelBtn.disabled = false;
    if (resultsList.children.length > 0) {
        statusText.textContent = "Status: Scan complete. Ready to download.";
        resultsList.querySelectorAll("li.pending").forEach(li => li.className = "ready");
    } else {
        statusText.textContent = "Status: Scan complete — no results found.";
    }
});

// --- Helpers ---
function sanitizeFilename(name) { return name.replace(/[<>:"/\\|?*]+/g, "_"); }
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
    } catch { return null; }
}

// --- IPC: Options Load ---
window.electronAPI.receive("options:load", (opt) => {
    console.log("[Renderer] Loaded options:", opt);

    document.getElementById("prefix").value = opt.prefix ?? "";
    document.getElementById("savePath").value = opt.savePath ?? "";
    document.getElementById("subfolder").checked = !!opt.createSubfolder;

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

    // ✅ Bookmarks
    currentBookmarks = opt.bookmarks ?? [];
    refreshBookmarkList();

    // ✅ Restore last URL
    if (opt.lastUrl && opt.lastUrl !== "about:blank") {
        urlInput.value = opt.lastUrl;
        navigateTo(opt.lastUrl);
    } else {
        urlInput.value = "about:blank";
        navigateTo("about:blank");
    }
});
