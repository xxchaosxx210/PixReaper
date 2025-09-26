const goBtn = document.getElementById("goBtn");
const urlInput = document.getElementById("urlInput");
const browser = document.getElementById("browser");
const scanBtn = document.getElementById("scanBtn");
const resultsDiv = document.getElementById("results");

function navigate() {
    let url = urlInput.value.trim();
    if (!url) return;

    if (!url.startsWith("http://") && !url.startsWith("https://")) {
        url = "https://" + url;
    }

    browser.src = url;
    window.logger.log("Navigating to: " + url);
}

// Navigation handlers
goBtn.addEventListener("click", navigate);
urlInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter") navigate();
});
browser.addEventListener("did-navigate", (event) => {
    urlInput.value = event.url;
});
browser.addEventListener("did-navigate-in-page", (event) => {
    urlInput.value = event.url;
});

// Scan Page button
scanBtn.addEventListener("click", async () => {
    window.logger.log("Scan Page clicked");

    // Run DOM scrape directly in the <webview>
    const viewerLinks = await browser.executeJavaScript(`
    Array.from(document.querySelectorAll("a[href] img"))
      .map(img => img.parentElement.href)
      .filter(Boolean)
  `);

    window.logger.log("Found raw viewer links: " + viewerLinks.length);

    // Send links to main process for filtering
    window.electronAPI.scanPage(viewerLinks);
});

// Receive results from main process
window.electronAPI.onScanResults((links) => {
    resultsDiv.innerHTML = "";

    if (!links || links.length === 0) {
        resultsDiv.textContent = "No supported viewer links found.";
        return;
    }

    const list = document.createElement("ul");
    links.forEach((link) => {
        const li = document.createElement("li");
        const a = document.createElement("a");
        a.href = link;
        a.textContent = link;
        a.target = "_blank"; // open in external browser
        li.appendChild(a);
        list.appendChild(li);
    });

    resultsDiv.appendChild(list);
});
