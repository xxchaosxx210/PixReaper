// logic/downloader.js
// Handles downloading files with concurrency control + retry logic + cancel support

const fs = require("fs");
const path = require("path");
const https = require("https");
const http = require("http");
const crypto = require("crypto");
const { app } = require("electron");
const { loadOptions } = require("../config/optionsManager");

const MAX_RETRIES = 3;

/* -------------------------------------------------------------
 * Build regex for allowed extensions based on user options
 * -----------------------------------------------------------*/
function getExtRegex() {
    const options = loadOptions();
    const valid =
        options.validExtensions && options.validExtensions.length > 0
            ? options.validExtensions
            : ["jpg", "jpeg"];
    return new RegExp(`\\.(${valid.join("|")})(?:$|\\?)`, "i");
}

/* -------------------------------------------------------------
 * Utility: Compute MD5 hash of a file
 * -----------------------------------------------------------*/
function computeFileHash(filePath) {
    return new Promise((resolve, reject) => {
        const hash = crypto.createHash("md5");
        const stream = fs.createReadStream(filePath);
        stream.on("data", (data) => hash.update(data));
        stream.on("end", () => resolve(hash.digest("hex")));
        stream.on("error", reject);
    });
}

/* -------------------------------------------------------------
 * Utility: Check folder for duplicates by size (and optional hash)
 * -----------------------------------------------------------*/
async function findDuplicateInFolder(folderPath, targetSize, tempFilePath) {
    if (!fs.existsSync(folderPath)) return null;
    const files = fs.readdirSync(folderPath);
    for (const file of files) {
        const fullPath = path.join(folderPath, file);
        if (!fs.existsSync(fullPath) || fullPath === tempFilePath) continue;

        const stat = fs.statSync(fullPath);
        if (!stat.isFile()) continue;

        // Quick skip if not an image
        if (!/\.(jpe?g|png|gif|webp|bmp|avif|tiff)$/i.test(fullPath)) continue;

        // Compare by size first
        if (stat.size === targetSize) {
            return fullPath; // identical size → likely duplicate
        }

        // If sizes are within 1KB, check hash to be sure
        const sizeDiff = Math.abs(stat.size - targetSize);
        if (sizeDiff < 1024) {
            try {
                const [hashA, hashB] = await Promise.all([
                    computeFileHash(fullPath),
                    computeFileHash(tempFilePath)
                ]);
                if (hashA === hashB) return fullPath;
            } catch (_) { /* ignore hash errors */ }
        }
    }
    return null;
}

/* -------------------------------------------------------------
 * Download a single file with smart duplicate detection
 * -----------------------------------------------------------*/
async function downloadFile(url, savePath, redirectCount = 0) {
    const MAX_REDIRECTS = 5;

    let absolutePath = path.isAbsolute(savePath)
        ? savePath
        : path.join(app.getPath("downloads"), savePath);

    absolutePath = path.normalize(absolutePath);
    const folderPath = path.dirname(absolutePath);
    await fs.promises.mkdir(folderPath, { recursive: true });

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
                    Referer: url,
                },
            },
            async (res) => {
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

                if (res.statusCode !== 200) {
                    reject(new Error(`HTTP ${res.statusCode}`));
                    return;
                }

                const contentType = res.headers["content-type"] || "";
                if (!contentType.startsWith("image/")) {
                    reject(new Error(`Invalid content-type: ${contentType}`));
                    res.resume();
                    return;
                }

                const totalBytes = parseInt(res.headers["content-length"] || "0", 10);
                const tempPath = absolutePath + ".tmp";
                const fileStream = fs.createWriteStream(tempPath);
                res.pipe(fileStream);

                fileStream.on("finish", async () => {
                    fileStream.close();

                    try {
                        const newSize = fs.statSync(tempPath).size;
                        const existingDuplicate = await findDuplicateInFolder(
                            folderPath,
                            totalBytes > 0 ? totalBytes : newSize,
                            tempPath
                        );

                        if (existingDuplicate) {
                            fs.unlinkSync(tempPath);
                            return resolve({ status: "skipped", savePath: existingDuplicate });
                        }

                        fs.renameSync(tempPath, absolutePath);
                        resolve({ status: "success", savePath: absolutePath });
                    } catch (err) {
                        if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath);
                        reject(err);
                    }
                });
            }
        );

        req.on("error", (err) => {
            const tempPath = savePath + ".tmp";
            if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath);
            reject(err);
        });
    });
}

/* -------------------------------------------------------------
 * Download with retry & cancel support
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
            const result = await downloadFile(item.url, item.savePath);
            if (isCancelled && isCancelled()) {
                item.status = "cancelled";
                onProgress(item.index, "cancelled", item.savePath);
                return;
            }

            item.status = result.status || "success";
            onProgress(item.index, item.status, result.savePath);
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
                await new Promise((res) => setTimeout(res, 500 * attempt));
            }
        }
    }
}

/* -------------------------------------------------------------
 * Run multiple downloads concurrently
 * -----------------------------------------------------------*/
async function startDownload(manifest, options, onProgress, isCancelled) {
    const userOptions = loadOptions();
    const maxConnections =
        options?.maxConnections || userOptions?.maxConnections || 4;

    const MAX_CONCURRENCY = Math.min(16, Math.max(1, maxConnections));
    console.log(`[Downloader] Starting ${manifest.length} downloads with ${MAX_CONCURRENCY} connections`);

    let active = 0;
    let index = 0;

    return new Promise((resolve) => {
        function next() {
            if ((index >= manifest.length || (isCancelled && isCancelled())) && active === 0) {
                resolve();
                return;
            }

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
                        next();
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
