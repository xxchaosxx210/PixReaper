document.getElementById("goBtn").addEventListener("click", () => {
    const url = document.getElementById("urlInput").value;
    if (url) {
        window.logger.log("Go button clicked, URL: " + url);
    }
});

document.getElementById("scanBtn").addEventListener("click", () => {
    window.logger.log("Scan Page clicked");
});

document.getElementById("downloadBtn").addEventListener("click", () => {
    window.logger.log("Download clicked");
});
