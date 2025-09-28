// renderer.js
// Handles UI interactions and IPC for PixReaper

// --- Webview Controls ---
const webview = document.getElementById("browserView");
const urlInput = document.getElementById("urlInput");
const goButton = document.getElementById("goBtn");
const scanButton = document.getElementById("scanBtn");

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

window.electronAPI.receive("scan-progress", (data) => {
    console.log("[Renderer] Got scan-progress:", data);

    const li = document.createElement("li");
    li.className = data.status;
    li.innerHTML = `
    <span class="status-icon ${data.status}"></span>
    <a href="${data.resolved || data.original}" target="_blank">
      ${data.resolved || data.original}
    </a>
  `;
    resultsList.appendChild(li);
    // Show the Download button if it’s still hidden
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

// --- IPC: Options Load/Save ---

// --- Download Manifest Preview ---
const downloadBtn = document.getElementById("downloadBtn");

// Helper: sanitize filenames (basic)
function sanitizeFilename(name) {
    return name.replace(/[<>:"/\\|?*]+/g, "_");
}

downloadBtn.addEventListener("click", () => {
    console.log("[Renderer] Building download manifest...");
    // Hide the button once download starts
    downloadBtn.style.display = "none";


    // Get current options (last loaded from main)
    // For now, reuse values directly from the modal fields
    const options = {
        prefix: document.getElementById("prefix").value.trim(),
        savePath: document.getElementById("savePath").value.trim(),
        createSubfolder: document.getElementById("subfolder").checked,
        indexing: document.querySelector('input[name="indexing"]:checked').value,
    };

    const items = resultsList.querySelectorAll("li a");
    const total = items.length;
    const padWidth = String(total).length;

    const manifest = [];

    items.forEach((link, i) => {
        const url = link.getAttribute("href");
        const index = i + 1;

        // Get basename from URL
        let base = url.split("/").pop().split("?")[0];
        base = sanitizeFilename(base || "image");

        // Ensure extension
        if (!base.includes(".")) {
            base += ".jpg";
        }

        // Build filename
        let filename = "";
        if (options.indexing === "order") {
            const padded = String(index).padStart(padWidth, "0");
            filename = `${options.prefix}${padded}_${base}`;
        } else {
            filename = `${options.prefix}${base}`;
        }

        // Build savePath
        let folder = options.savePath;
        if (options.createSubfolder) {
            const sub = "Scan_" + new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
            folder = `${folder}/${sub}`;
        }
        const savePath = `${folder}/${filename}`;

        // Push to manifest
        manifest.push({
            index,
            url,
            status: "pending",
            filename,
            savePath,
        });

        // Update UI: replace link text with savePath
        link.textContent = savePath;
    });

    console.log("[Renderer] Download manifest:", manifest);
});


// Fill modal fields when options are loaded
window.electronAPI.receive("options:load", (opt) => {
    console.log("[Renderer] Loaded options:", opt);

    document.getElementById("prefix").value = opt.prefix ?? "";
    document.getElementById("savePath").value = opt.savePath ?? "";
    document.getElementById("subfolder").checked = !!opt.createSubfolder;

    const slider = document.getElementById("maxConnections");
    slider.value = opt.maxConnections ?? 10;
    maxConnectionsValue.textContent = slider.value;
});

// Confirm when options are saved
window.electronAPI.receive("options:saved", (saved) => {
    console.log("[Renderer] Options saved:", saved);
    // Optional: add a UI confirmation here
});
