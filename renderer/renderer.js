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

// Go button click
goBtn.addEventListener("click", navigate);

// Enter key press inside input
urlInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
        navigate();
    }
});
