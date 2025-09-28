// logic/downloader.js
// Handles downloading files with concurrency control + retry logic

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
async function downloadFile(url, savePath) {
    // Ensure absolute path
    let absolutePath = path.isAbsolute(savePath)
        ? savePath
        : path.join(app.getPath("downloads"), savePath);

    absolutePath = path.normalize(absolutePath);

    await fs.promises.mkdir(path.dirname(absolutePath), { recursive: true });

    return new Promise((resolve, reject) => {
        const client = url.startsWith("https") ? https : http;

        client
            .get(url, (res) => {
                if (res.statusCode !== 200) {
                    reject(new Error(`HTTP ${res.statusCode}`));
                    return;
                }

                const fileStream = fs.createWriteStream(absolutePath);
                streamPipeline(res, fileStream)
                    .then(() => resolve(absolutePath))
                    .catch(reject);
            })
            .on("error", reject);
    });
}

/**
 * Attempt a download with retry logic
 */
async function downloadWithRetries(item, onProgress, maxRetries = MAX_RETRIES) {
    let attempt = 0;

    while (attempt <= maxRetries) {
        try {
            const absolutePath = await downloadFile(item.url, item.savePath);
            item.status = "success";
            item.savePath = absolutePath;
            onProgress(item.index, "success", absolutePath);
            return;
        } catch (err) {
            attempt++;
            if (attempt > maxRetries) {
                console.error(
                    `[Downloader] Permanent failure: ${item.url} after ${maxRetries} retries`
                );
                item.status = "failed";
                onProgress(item.index, "failed", item.savePath);
                return;
            } else {
                console.warn(
                    `[Downloader] Retry ${attempt}/${maxRetries} for ${item.url} (${err.message})`
                );
                onProgress(item.index, "retrying", item.savePath);

                // backoff delay before retrying
                await new Promise((res) =>
                    setTimeout(res, 500 * attempt)
                );
            }
        }
    }
}

/**
 * Run downloads with concurrency limit
 */
async function startDownload(manifest, options, onProgress) {
    const maxConnections = options.maxConnections || 5;

    let active = 0;
    let index = 0;

    return new Promise((resolve) => {
        function next() {
            if (index >= manifest.length && active === 0) {
                resolve();
                return;
            }

            while (active < maxConnections && index < manifest.length) {
                const item = manifest[index++];
                active++;

                downloadWithRetries(item, onProgress, MAX_RETRIES)
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
