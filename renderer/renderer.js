const goBtn = document.getElementById("goBtn");
const urlInput = document.getElementById("urlInput");
const browser = document.getElementById("browser");

function navigate() {
    let url = urlInput.value.trim();

    if (!url) return;

    // Auto-add protocol if missing
    if (!url.startsWith("http://") && !url.startsWith("https://")) {
        url = "https://" + url;
    }

    browser.src = url;
    window.logger.log("Navigating to: " + url);
}

// 🔹 Go button click
goBtn.addEventListener("click", navigate);

// 🔹 Enter key press inside input
urlInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
        navigate();
    }
});

// 🔹 Update address bar when the webview navigates
browser.addEventListener("did-navigate", (event) => {
    urlInput.value = event.url;
    window.logger.log("Browser navigated to: " + event.url);
});

browser.addEventListener("did-navigate-in-page", (event) => {
    // Handles hash changes (#) and same-page navigations
    urlInput.value = event.url;
    window.logger.log("Browser in-page navigation: " + event.url);
});
