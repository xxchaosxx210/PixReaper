// renderer/renderer.js

// ======================================================
// 🌐 Webview Navigation
// ======================================================
const webview = document.getElementById("browserView");
const urlInput = document.getElementById("urlInput");
const goBtn = document.getElementById("goBtn");
const scanBtn = document.getElementById("scanBtn");
const resultsList = document.getElementById("results");

// Navigate to typed URL
goBtn.addEventListener("click", () => {
    const url = urlInput.value.trim();
    if (url) {
        if (!/^https?:\/\//i.test(url)) {
            webview.src = "http://" + url;
        } else {
            webview.src = url;
        }
    }
});

// Allow pressing Enter in the address bar
urlInput.addEventListener("keypress", (e) => {
    if (e.key === "Enter") {
        goBtn.click();
    }
});

// --- Scan Page ---
scanBtn.addEventListener("click", async () => {
    console.log("[Renderer] Scan Page clicked");

    const viewerLinks = await webview.executeJavaScript(`
        Array.from(document.querySelectorAll("a[href] img"))
            .map(img => img.parentElement.href)
            .filter(href => href && href.match(/(imagebam|imgbox|pixhost|imagevenue|pimpandhost|postimg|turboimagehost|fastpic|imagetwist|imgview|radikal|imageupper)/i))
    `);

    console.log("[Renderer] Found candidate viewer links:", viewerLinks.length);

    // Clear old results
    resultsList.innerHTML = "";

    // Send links to main process for resolving
    window.electronAPI.send("scan-page", viewerLinks);
});

// --- Listen for resolved results from main process ---
window.electronAPI.receive("scan-progress", (data) => {
    const li = document.createElement("li");

    if (data.status === "success" && data.resolved) {
        li.innerHTML = `
            ✅ <a href="${data.resolved}" target="_blank">${data.resolved}</a>
        `;
        li.className = "success";
    } else if (data.status === "failed") {
        li.innerHTML = `
            ⚠️ Failed to resolve 
            <a href="${data.original}" target="_blank">${data.original}</a>
        `;
        li.className = "failed";
    } else {
        li.innerHTML = `⏳ ${data.original}`;
        li.className = "pending";
    }

    resultsList.appendChild(li);
});

// ======================================================
// ⚙️ Options Modal Logic
// ======================================================

const optionsBtn = document.getElementById("optionsBtn");
const optionsModal = document.getElementById("optionsModal");
const cancelOptions = document.getElementById("cancelOptions");
const saveOptions = document.getElementById("saveOptions");

// Inputs inside modal
const savePathInput = document.getElementById("savePath");
const prefixInput = document.getElementById("prefix");
const indexingRadios = document.getElementsByName("indexing");
const subfolderCheckbox = document.getElementById("subfolder");
const maxConnectionsSlider = document.getElementById("maxConnections");
const maxConnectionsValue = document.getElementById("maxConnectionsValue");
const debugLoggingCheckbox = document.getElementById("debugLogging");

// --- Open modal
optionsBtn.addEventListener("click", () => {
    console.log("[Renderer] Options button clicked");
    optionsModal.style.display = "block";
});

// --- Cancel button
cancelOptions.addEventListener("click", () => {
    optionsModal.style.display = "none";
});

// --- Save button (for now just logs values)
saveOptions.addEventListener("click", () => {
    const indexingMode = Array.from(indexingRadios).find(r => r.checked).value;

    const options = {
        savePath: savePathInput.value.trim(),
        prefix: prefixInput.value.trim(),
        indexing: indexingMode,
        subfolder: subfolderCheckbox.checked,
        maxConnections: parseInt(maxConnectionsSlider.value, 10),
        debugLogging: debugLoggingCheckbox.checked
    };

    console.log("[Renderer] Options saved:", options);

    // Later: send to main process via IPC
    // window.electronAPI.send("save-options", options);

    optionsModal.style.display = "none";
});

// --- Update slider label live
maxConnectionsSlider.addEventListener("input", () => {
    maxConnectionsValue.textContent = maxConnectionsSlider.value;
});

// --- Close modal when clicking outside of content
window.addEventListener("click", (e) => {
    if (e.target === optionsModal) {
        optionsModal.style.display = "none";
    }
});
