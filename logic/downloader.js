// logic/downloader.js
// Handles downloading files with concurrency control + retry logic + cancel support

const fs = require("fs");
const path = require("path");
const { pipeline } = require("stream");
const { promisify } = require("util");
const https = require("https");
const http = require("http");
const { app } = require("electron");
const { loadOptions } = require("../config/optionsManager"); // ✅ import options

const streamPipeline = promisify(pipeline);
const MAX_RETRIES = 3;

/* -------------------------------------------------------------
 * Build regex for allowed extensions based on user options
 * -----------------------------------------------------------*/
function getExtRegex() {
    const options = loadOptions();
    const valid =
        options.validExtensions && options.validExtensions.length > 0
            ? options.validExtensions
            : ["jpg", "jpeg"]; // fallback default
    return new RegExp(`\\.(${valid.join("|")})(?:$|\\?)`, "i");
}

/* -------------------------------------------------------------
 * Download a single file (follows redirects, validates type)
 * -----------------------------------------------------------*/
async function downloadFile(url, savePath, redirectCount = 0) {
    const MAX_REDIRECTS = 5;

    // Ensure absolute path
    let absolutePath = path.isAbsolute(savePath)
        ? savePath
        : path.join(app.getPath("downloads"), savePath);

    absolutePath = path.normalize(absolutePath);
    await fs.promises.mkdir(path.dirname(absolutePath), { recursive: true });

    // Validate file extension
    const extRegex = getExtRegex();
    const checkTarget = url.split("?")[0].toLowerCase();
    if (!extRegex.test(checkTarget)) {
        throw new Error(`Disallowed extension: ${checkTarget}`);
    }

    return new Promise((resolve, reject) => {
        const client = url.startsWith("https") ? https : http;

        const req = client.get(
            url,
            {
                headers: {
                    "User-Agent": "PixReaper/1.0",
                    Referer: url, // sometimes required for hotlink-protected hosts
                },
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
                    res.resume();
                    resolve(downloadFile(location, savePath, redirectCount + 1));
                    return;
                }

                // Non-OK status
                if (res.statusCode !== 200) {
                    reject(new Error(`HTTP ${res.statusCode}`));
                    return;
                }

                // Validate content-type
                const contentType = res.headers["content-type"] || "";
                if (!contentType.startsWith("image/")) {
                    reject(new Error(`Invalid content-type: ${contentType}`));
                    res.resume();
                    return;
                }

                // Stream file to disk
                const fileStream = fs.createWriteStream(absolutePath);
                streamPipeline(res, fileStream)
                    .then(() => resolve(absolutePath))
                    .catch(reject);
            }
        );

        req.on("error", reject);
    });
}

/* -------------------------------------------------------------
 * Download a single item with retry & cancel support
 * -----------------------------------------------------------*/
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
                console.error(`[Downloader] Permanent failure: ${item.url} (${err.message})`);
                item.status = "failed";
                onProgress(item.index, "failed", item.savePath);
                return;
            } else {
                console.warn(`[Downloader] Retry ${attempt}/${maxRetries}: ${item.url}`);
                onProgress(item.index, "retrying", item.savePath);
                await new Promise((res) => setTimeout(res, 500 * attempt)); // backoff
            }
        }
    }
}

/* -------------------------------------------------------------
 * Run multiple downloads concurrently (based on maxConnections)
 * -----------------------------------------------------------*/
async function startDownload(manifest, options, onProgress, isCancelled) {
    // Priority: options passed from main.js → fallback to user saved options → default 4
    const userOptions = loadOptions();
    const maxConnections =
        options?.maxConnections ||
        userOptions?.maxConnections ||
        4;

    const MAX_CONCURRENCY = Math.min(16, Math.max(1, maxConnections));

    console.log(`[Downloader] Starting ${manifest.length} downloads with ${MAX_CONCURRENCY} connections`);

    let active = 0;
    let index = 0;

    return new Promise((resolve) => {
        function next() {
            // Complete when no more downloads are left and all active have finished
            if (
                (index >= manifest.length || (isCancelled && isCancelled())) &&
                active === 0
            ) {
                resolve();
                return;
            }

            // Launch new downloads up to concurrency limit
            while (active < MAX_CONCURRENCY && index < manifest.length) {
                if (isCancelled && isCancelled()) {
                    resolve();
                    return;
                }

                const item = manifest[index++];
                active++;

                downloadWithRetries(item, onProgress, MAX_RETRIES, isCancelled)
                    .finally(() => {
                        active--;
                        next(); // start next file after one finishes
                    });
            }
        }

        next();
    });
}

/* -------------------------------------------------------------
 * Exports
 * -----------------------------------------------------------*/
module.exports = {
    startDownload,
};
