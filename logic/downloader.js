// logic/downloader.js
// Handles downloading files with concurrency control

const fs = require("fs");
const path = require("path");
const { pipeline } = require("stream");
const { promisify } = require("util");
const https = require("https");
const http = require("http");

const streamPipeline = promisify(pipeline);

/**
 * Download a single file from URL to savePath
 */
async function downloadFile(url, savePath) {
    await fs.promises.mkdir(path.dirname(savePath), { recursive: true });

    return new Promise((resolve, reject) => {
        const client = url.startsWith("https") ? https : http;

        client.get(url, (res) => {
            if (res.statusCode !== 200) {
                reject(new Error(`HTTP ${res.statusCode}`));
                return;
            }

            const fileStream = fs.createWriteStream(savePath);
            streamPipeline(res, fileStream)
                .then(() => resolve(true))
                .catch(reject);
        }).on("error", reject);
    });
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
            // All items processed?
            if (index >= manifest.length && active === 0) {
                resolve();
                return;
            }

            // Fill up concurrency slots
            while (active < maxConnections && index < manifest.length) {
                const item = manifest[index++];
                active++;

                downloadFile(item.url, item.savePath)
                    .then(() => {
                        item.status = "success";
                        onProgress(item.index, "success", item.savePath);
                    })
                    .catch((err) => {
                        console.error("[Downloader] Failed:", item.url, err.message);
                        item.status = "failed";
                        onProgress(item.index, "failed", item.savePath);
                    })
                    .finally(() => {
                        active--;
                        next(); // launch next task
                    });
            }
        }

        next();
    });
}

module.exports = {
    startDownload,
};
