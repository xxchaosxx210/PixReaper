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
    window.electronAPI.send("choose-folder"); // ask main process
});

// Receive chosen folder path
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

// Update address bar when webview navigates
webview.addEventListener("did-navigate", (event) => {
    urlInput.value = event.url;
});

// Request scan of current webview page
scanButton.addEventListener("click", async () => {
    // ✅ Reset before starting a new scan
    resultsList.innerHTML = "";
    currentManifest = [];
    downloadBtn.style.display = "none";

    const viewerLinks = await webview.executeJavaScript(`
        Array.from(document.querySelectorAll("a[href]"))
          .map(a => a.href)
          .filter(href => href && href.match(/(imagebam|imgbox|pixhost|imagevenue|pimpandhost)/i))
    `);

    console.log("[Renderer] Found links in page:", viewerLinks.length);
    window.electronAPI.send("scan-page", viewerLinks);
});

// --- Results List ---
const resultsList = document.getElementById("results");
let currentManifest = [];

window.electronAPI.receive("scan-progress", (data) => {
    console.log("[Renderer] Got scan-progress:", data);

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

// Open modal
optionsButton.addEventListener("click", () => {
    optionsModal.style.display = "block";
});

// Close modal without saving
cancelOptions.addEventListener("click", () => {
    optionsModal.style.display = "none";
});

// Slider live update
maxConnections.addEventListener("input", () => {
    maxConnectionsValue.textContent = maxConnections.value;
});

// Save options
saveOptions.addEventListener("click", () => {
    const newOptions = {
        prefix: document.getElementById("prefix").value.trim(),
        savePath: document.getElementById("savePath").value.trim(),
        createSubfolder: document.getElementById("subfolder").checked,
        maxConnections: parseInt(document.getElementById("maxConnections").value, 10)
    };

    console.log("[Renderer] Saving options:", newOptions);
    window.electronAPI.send("options:save", newOptions);

    optionsModal.style.display = "none"; // close modal after save
});

// --- Download Manifest ---
const downloadBtn = document.getElementById("downloadBtn");

// Helper: sanitize filenames (basic)
function sanitizeFilename(name) {
    return name.replace(/[<>:"/\\|?*]+/g, "_");
}

downloadBtn.addEventListener("click", () => {
    console.log("[Renderer] Building download manifest...");
    downloadBtn.style.display = "none";

    // Get current options
    const options = {
        prefix: document.getElementById("prefix").value.trim(),
        savePath: document.getElementById("savePath").value.trim(),
        createSubfolder: document.getElementById("subfolder").checked,
        indexing: document.querySelector('input[name="indexing"]:checked').value,
    };

    // ✅ Default save path if empty
    if (!options.savePath) {
        options.savePath = "PixReaper"; // will be resolved into Downloads/PixReaper
    }

    const items = resultsList.querySelectorAll("li a");
    const total = items.length;
    const padWidth = String(total).length;

    currentManifest = [];

    items.forEach((link, i) => {
        const url = link.getAttribute("href");
        const index = i + 1;

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

        let folder = options.savePath;
        if (options.createSubfolder) {
            const sub = "Scan_" + new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
            folder = `${folder}/${sub}`;
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

    window.electronAPI.send("download:start", {
        manifest: currentManifest,
        options: {
            prefix: options.prefix,
            savePath: options.savePath,
            createSubfolder: options.createSubfolder,
            indexing: options.indexing,
            maxConnections: parseInt(document.getElementById("maxConnections").value, 10),
        }
    });
});

// --- IPC: Options Load/Save ---
window.electronAPI.receive("options:load", (opt) => {
    console.log("[Renderer] Loaded options:", opt);

    document.getElementById("prefix").value = opt.prefix ?? "";
    document.getElementById("savePath").value = opt.savePath ?? "";
    document.getElementById("subfolder").checked = !!opt.createSubfolder;

    const slider = document.getElementById("maxConnections");
    slider.value = opt.maxConnections ?? 10;
    maxConnectionsValue.textContent = slider.value;
});

window.electronAPI.receive("options:saved", (saved) => {
    console.log("[Renderer] Options saved:", saved);
});

// --- IPC: Scan Complete ---
window.electronAPI.receive("scan-complete", () => {
    if (resultsList.children.length > 0) {
        downloadBtn.style.display = "inline-block";
        console.log("[Renderer] Scan complete — Download button enabled.");
    } else {
        console.log("[Renderer] Scan complete — no results found.");
    }
});

// --- IPC: Download Progress ---
window.electronAPI.receive("download:progress", (data) => {
    console.log("[Renderer] Download progress:", data);

    const { index, status, savePath } = data;

    const entry = currentManifest.find((e) => e.index === index);
    if (entry) {
        entry.status = status;
        entry.savePath = savePath;
    }

    const li = resultsList.querySelector(`li[data-index="${index}"]`);
    if (li) {
        const icon = li.querySelector(".status-icon");
        if (icon) {
            icon.className = `status-icon ${status}`;
        }
        const link = li.querySelector("a");
        if (link) {
            const fileUrl = "file:///" + savePath.replace(/\\/g, "/");
            link.textContent = savePath;
            link.setAttribute("href", fileUrl);
            link.setAttribute("target", "_blank");
        }
    }
});

window.electronAPI.receive("download:complete", () => {
    console.log("[Renderer] All downloads complete.");
});
