// logic/downloader.js
// Handles downloading files with concurrency control

const fs = require("fs");
const path = require("path");
const { pipeline } = require("stream");
const { promisify } = require("util");
const https = require("https");
const http = require("http");
const { app } = require("electron"); // ✅ so we can get default Downloads path

const streamPipeline = promisify(pipeline);

/**
 * Download a single file from URL to savePath
 */
async function downloadFile(url, savePath) {
    // ✅ Ensure absolute path
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
                    .then(() => resolve(absolutePath)) // ✅ resolve with real path
                    .catch(reject);
            })
            .on("error", reject);
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
            if (index >= manifest.length && active === 0) {
                resolve();
                return;
            }

            while (active < maxConnections && index < manifest.length) {
                const item = manifest[index++];
                active++;

                downloadFile(item.url, item.savePath)
                    .then((absolutePath) => {
                        item.status = "success";
                        item.savePath = absolutePath; // ✅ store normalized absolute path
                        onProgress(item.index, "success", absolutePath);
                    })
                    .catch((err) => {
                        console.error("[Downloader] Failed:", item.url, err.message);
                        item.status = "failed";
                        onProgress(item.index, "failed", item.savePath);
                    })
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
