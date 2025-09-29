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

// --- Results List ---
const resultsList = document.getElementById("results");
let currentManifest = [];
let imagesFound = 0;
let downloadTotal = 0;
let downloadCompleted = 0;

// --- Status Bar Elements ---
const statusText = document.getElementById("statusText");
const imagesFoundText = document.getElementById("imageCount");
const progressBar = document.getElementById("progressBar");
const downloadBtn = document.getElementById("downloadBtn");
const cancelBtn = document.getElementById("cancelBtn"); // ✅ new cancel button

// --- Scan ---
scanButton.addEventListener("click", async () => {
    resultsList.innerHTML = "";
    currentManifest = [];
    downloadBtn.style.display = "none";
    cancelBtn.style.display = "inline-block"; // ✅ show cancel during scan
    imagesFound = 0;
    imagesFoundText.textContent = "Images found: 0";
    statusText.textContent = "Status: Scanning...";
    progressBar.style.width = "0%";

    const viewerLinks = await webview.executeJavaScript(`
        Array.from(document.querySelectorAll("a[href]"))
          .map(a => a.href)
          .filter(href => href && href.match(/(imagebam|imgbox|pixhost|imagevenue|pimpandhost)/i))
    `);

    console.log("[Renderer] Found links in page:", viewerLinks.length);
    window.electronAPI.send("scan-page", viewerLinks);
});

window.electronAPI.receive("scan-progress", (data) => {
    console.log("[Renderer] Got scan-progress:", data);

    // ✅ get allowed extensions from checkboxes
    const allowedExts = Array.from(
        document.querySelectorAll(".ext-option:checked")
    ).map(cb => cb.value.toLowerCase());

    if (!isAllowedExtension(data.resolved || data.original, allowedExts)) {
        console.warn("[Renderer] Skipped disallowed file:", data.resolved || data.original);
        return; // ❌ don’t add to results or count
    }

    const index = resultsList.children.length + 1;
    const li = document.createElement("li");
    li.className = "pending";
    li.setAttribute("data-index", index);

    li.innerHTML = `
        <span class="status-icon pending"></span>
        <a href="${data.resolved || data.original}" target="_blank">
          ${data.resolved || data.original}
        </a>
    `;
    resultsList.appendChild(li);

    imagesFound++;
    imagesFoundText.textContent = `Images found: ${imagesFound}`;

    if (resultsList.children.length === 1) {
        downloadBtn.style.display = "inline-block";
    }
});

// --- Options Modal Logic ---
const optionsModal = document.getElementById("optionsModal");
const optionsButton = document.getElementById("optionsBtn");
const cancelOptions = document.getElementById("cancelOptions");
const saveOptions = document.getElementById("saveOptions");
const maxConnections = document.getElementById("maxConnections");
const maxConnectionsValue = document.getElementById("maxConnectionsValue");

optionsButton.addEventListener("click", () => {
    optionsModal.style.display = "block";
});
cancelOptions.addEventListener("click", () => {
    optionsModal.style.display = "none";
});
maxConnections.addEventListener("input", () => {
    maxConnectionsValue.textContent = maxConnections.value;
});
saveOptions.addEventListener("click", () => {
    // ✅ collect selected extensions
    const selectedExts = Array.from(
        document.querySelectorAll(".ext-option:checked")
    ).map(cb => cb.value);

    const newOptions = {
        prefix: document.getElementById("prefix").value.trim(),
        savePath: document.getElementById("savePath").value.trim(),
        createSubfolder: document.getElementById("subfolder").checked,
        indexing: document.querySelector('input[name="indexing"]:checked').value,
        maxConnections: parseInt(document.getElementById("maxConnections").value, 10),
        debugLogging: document.getElementById("debugLogging").checked,
        validExtensions: selectedExts // ✅ new
    };
    console.log("[Renderer] Saving options:", newOptions);
    window.electronAPI.send("options:save", newOptions);
    optionsModal.style.display = "none";
});

// --- Download Manifest ---
function sanitizeFilename(name) {
    return name.replace(/[<>:"/\\|?*]+/g, "_");
}

// --- Allowed extensions filter ---
function isAllowedExtension(url, allowed) {
    if (!url) return false;
    const clean = url.split("?")[0].toLowerCase();
    return allowed.some(ext => clean.endsWith("." + ext.toLowerCase()));
}


function deriveSlugFromUrl(url) {
    try {
        const u = new URL(url);
        let slug = u.pathname.split("/").filter(Boolean).pop();
        if (!slug || slug.length < 2) {
            slug = u.hostname.replace(/^www\./, "");
        }
        return sanitizeFilename(slug);
    } catch {
        return null;
    }
}

downloadBtn.addEventListener("click", async () => {
    console.log("[Renderer] Building download manifest...");
    downloadBtn.style.display = "none";
    cancelBtn.style.display = "inline-block";

    const options = {
        prefix: document.getElementById("prefix").value.trim(),
        savePath: document.getElementById("savePath").value.trim(),
        createSubfolder: document.getElementById("subfolder").checked,
        indexing: document.querySelector('input[name="indexing"]:checked').value,
    };

    if (!options.savePath) {
        options.savePath = "PixReaper";
    }

    const items = resultsList.querySelectorAll("li a");
    const total = items.length;
    const padWidth = String(total).length;

    currentManifest = [];

    // ✅ get allowed extensions from checkboxes
    const allowedExts = Array.from(
        document.querySelectorAll(".ext-option:checked")
    ).map(cb => cb.value.toLowerCase());

    let folder = options.savePath;
    if (options.createSubfolder) {
        const currentUrl = await webview.getURL();
        let slug = deriveSlugFromUrl(currentUrl);
        if (!slug) {
            slug = "Scan_" + new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
        }
        folder = `${folder}/${slug}`;
    }

    items.forEach((link, i) => {
        const url = link.getAttribute("href");

        // ✅ Skip disallowed extensions
        if (!isAllowedExtension(url, allowedExts)) {
            console.log("[Renderer] Skipping disallowed file:", url);
            return;
        }

        const index = currentManifest.length + 1; // ✅ only count kept items
        let base = url.split("/").pop().split("?")[0];
        base = sanitizeFilename(base || "image");

        if (!base.includes(".")) {
            base += ".jpg";
        }

        let filename = "";
        if (options.indexing === "order") {
            const padded = String(index).padStart(padWidth, "0");
            filename = `${options.prefix}${padded}_${base}`;
        } else {
            filename = `${options.prefix}${base}`;
        }

        const savePath = `${folder}/${filename}`;

        currentManifest.push({
            index,
            url,
            status: "pending",
            filename,
            savePath,
        });

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

    const slider = document.getElementById("maxConnections");
    slider.value = opt.maxConnections ?? 10;
    maxConnectionsValue.textContent = slider.value;

    document.getElementById("debugLogging").checked = !!opt.debugLogging;

    // ✅ Restore validExtensions checkboxes
    const allowed = opt.validExtensions ?? ["jpg", "jpeg"];
    document.querySelectorAll(".ext-option").forEach(cb => {
        cb.checked = allowed.includes(cb.value);
    });
});

window.electronAPI.receive("options:saved", (saved) => {
    console.log("[Renderer] Options saved:", saved);
});

// --- IPC: Scan Complete ---
window.electronAPI.receive("scan-complete", () => {
    cancelBtn.style.display = "none"; // ✅ hide cancel after scan
    cancelBtn.disabled = false;
    if (resultsList.children.length > 0) {
        downloadBtn.style.display = "inline-block";
        statusText.textContent = "Status: Scan complete. Ready to download.";
    } else {
        statusText.textContent = "Status: Scan complete — no results found.";
    }
});

// --- IPC: Download Progress ---
window.electronAPI.receive("download:progress", (data) => {
    downloadCompleted = currentManifest.filter((e) => e.status === "success").length;
    const percent = ((downloadCompleted / downloadTotal) * 100).toFixed(1);
    statusText.textContent = `Status: Downloading (${downloadCompleted}/${downloadTotal}) — ${percent}%`;
    progressBar.style.width = `${percent}%`;

    const { index, status, savePath } = data;
    const entry = currentManifest.find((e) => e.index === index);
    if (entry) {
        entry.status = status;
        entry.savePath = savePath;
    }

    const li = resultsList.querySelector(`li[data-index="${index}"]`);
    if (li) {
        const icon = li.querySelector(".status-icon");
        if (icon) icon.className = `status-icon ${status}`;

        const link = li.querySelector("a");
        if (link) {
            if (status === "success") {
                const fileUrl = "file:///" + savePath.replace(/\\/g, "/");
                link.textContent = savePath;
                link.setAttribute("href", fileUrl);
                link.setAttribute("target", "_blank");
                link.style.color = ""; // reset any red coloring
            } else if (status === "retrying") {
                link.textContent = "Retrying download...";
                link.removeAttribute("href");
                link.style.color = "orange";
            } else if (status === "failed") {
                link.textContent = "Failed (click to inspect): " + (entry.url || link.textContent);
                link.setAttribute("href", entry.url);   // ✅ keep original URL
                link.setAttribute("target", "_blank");
                link.style.color = "red";               // ✅ make failed obvious
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
    cancelBtn.style.display = "none"; // ✅ hide cancel after download
    cancelBtn.disabled = false;
    statusText.textContent = "Status: All downloads complete.";
    progressBar.style.width = "100%";
});
