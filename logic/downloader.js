// logic/downloader.js
// Handles downloading files with concurrency control + retry logic + cancel support

const fs = require("fs");
const path = require("path");
const { pipeline } = require("stream");
const { promisify } = require("util");
const https = require("https");
const http = require("http");
const { app } = require("electron");

const streamPipeline = promisify(pipeline);

// Default retries
const MAX_RETRIES = 3;

/**
 * Download a single file from URL to savePath
 */
/**
 * Download a single file from URL to savePath
 * - follows redirects
 * - validates content-type is image/*
 */
async function downloadFile(url, savePath, redirectCount = 0) {
    const MAX_REDIRECTS = 5;

    // Ensure absolute path
    let absolutePath = path.isAbsolute(savePath)
        ? savePath
        : path.join(app.getPath("downloads"), savePath);

    absolutePath = path.normalize(absolutePath);
    await fs.promises.mkdir(path.dirname(absolutePath), { recursive: true });

    return new Promise((resolve, reject) => {
        const client = url.startsWith("https") ? https : http;

        const req = client.get(
            url,
            {
                headers: {
                    "User-Agent": "PixReaper/1.0",
                    "Referer": url   // ⚠️ sometimes needed for hotlink-protected hosts
                }
            },
            (res) => {
                // Handle redirects
                if ([301, 302, 303, 307, 308].includes(res.statusCode)) {
                    if (redirectCount >= MAX_REDIRECTS) {
                        reject(new Error("Too many redirects"));
                        return;
                    }
                    const location = res.headers.location;
                    if (!location) {
                        reject(new Error("Redirect with no location header"));
                        return;
                    }
                    // Close current response & recurse
                    res.resume();
                    resolve(downloadFile(location, savePath, redirectCount + 1));
                    return;
                }

                // Non-200 response
                if (res.statusCode !== 200) {
                    reject(new Error(`HTTP ${res.statusCode}`));
                    return;
                }

                // Validate content-type
                const contentType = res.headers["content-type"] || "";
                if (!contentType.startsWith("image/")) {
                    reject(new Error(`Invalid content-type: ${contentType}`));
                    res.resume(); // discard body
                    return;
                }

                // Write to file
                const fileStream = fs.createWriteStream(absolutePath);
                streamPipeline(res, fileStream)
                    .then(() => resolve(absolutePath))
                    .catch(reject);
            }
        );

        req.on("error", reject);
    });
}

/**
 * Attempt a download with retry logic
 */
async function downloadWithRetries(item, onProgress, maxRetries = MAX_RETRIES, isCancelled) {
    let attempt = 0;

    while (attempt <= maxRetries) {
        if (isCancelled && isCancelled()) {
            item.status = "cancelled";
            onProgress(item.index, "cancelled", item.savePath);
            return;
        }

        try {
            const absolutePath = await downloadFile(item.url, item.savePath);
            if (isCancelled && isCancelled()) {
                item.status = "cancelled";
                onProgress(item.index, "cancelled", item.savePath);
                return;
            }
            item.status = "success";
            item.savePath = absolutePath;
            onProgress(item.index, "success", absolutePath);
            return;
        } catch (err) {
            attempt++;
            if (isCancelled && isCancelled()) {
                item.status = "cancelled";
                onProgress(item.index, "cancelled", item.savePath);
                return;
            }

            if (attempt > maxRetries) {
                // ✅ only log once, after all retries exhausted
                console.error(`[Downloader] Permanent failure: ${item.url} (${err.message})`);
                item.status = "failed";
                onProgress(item.index, "failed", item.savePath);
                return;
            } else {
                // ✅ don’t log retries, only tell UI
                onProgress(item.index, "retrying", item.savePath);
                await new Promise((res) => setTimeout(res, 500 * attempt));
            }
        }
    }
}

/**
 * Run downloads with concurrency limit
 */
async function startDownload(manifest, options, onProgress, isCancelled) {
    const maxConnections = options.maxConnections || 5;

    let active = 0;
    let index = 0;

    return new Promise((resolve) => {
        function next() {
            if ((index >= manifest.length || (isCancelled && isCancelled())) && active === 0) {
                resolve();
                return;
            }

            while (active < maxConnections && index < manifest.length) {
                if (isCancelled && isCancelled()) {
                    resolve();
                    return;
                }

                const item = manifest[index++];
                active++;

                downloadWithRetries(item, onProgress, MAX_RETRIES, isCancelled)
                    .finally(() => {
                        active--;
                        next();
                    });
            }
        }

        next();
    });
}

module.exports = {
    startDownload,
};
