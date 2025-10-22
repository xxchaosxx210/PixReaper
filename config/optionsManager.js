/**
 * optionsManager.js
 * Handles reading/writing PixReaper options from config/options.json
 */

const path = require("path");
const fs = require("fs");
const os = require("os");

// Path to options.json (inside config folder)
const optionsFilePath = path.join(__dirname, "options.json");

// Default options (used if file missing/corrupted)
const DEFAULT_OPTIONS = {
    prefix: "",
    savePath: path.join(os.homedir(), "Downloads", "PixReaper"),
    createSubfolder: true,
    maxConnections: 10,
    indexing: "order",
    debugLogging: false,
    validExtensions: ["jpg", "jpeg"],
    validHosts: [
        "pixhost.to",
        "imagebam.com",
        "imagevenue.com",
        "imgbox.com",
        "pimpandhost.com",
        "postimg.cc",
        "turboimagehost.com",
        "fastpic.org",
        "fastpic.ru",
        "imagetwist.com",
        "imgview.net",
        "radikal.ru",
        "imageupper.com"
    ],
    lastUrl: "about:blank",
    autoOpenFolder: false,
    playSoundOnComplete: true,
    duplicateMode: "skip", // "skip" | "overwrite" | "rename"
    bookmarks: [] // { title, url }
};

/** Ensure config directory and file exist */
function ensureFileExists() {
    const dir = path.dirname(optionsFilePath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

    if (!fs.existsSync(optionsFilePath)) {
        fs.writeFileSync(optionsFilePath, JSON.stringify(DEFAULT_OPTIONS, null, 2), "utf8");
    }
}

/** Safely load options from disk */
function loadOptions() {
    ensureFileExists();

    try {
        const raw = fs.readFileSync(optionsFilePath, "utf8");
        const parsed = JSON.parse(raw);

        // Merge parsed with defaults (preserving new keys)
        const merged = { ...DEFAULT_OPTIONS, ...parsed };

        // --- Normalize ---
        merged.savePath = typeof merged.savePath === "string"
            ? path.normalize(merged.savePath)
            : DEFAULT_OPTIONS.savePath;

        if (!Array.isArray(merged.validExtensions))
            merged.validExtensions = [...DEFAULT_OPTIONS.validExtensions];
        else
            merged.validExtensions = merged.validExtensions.map(ext =>
                String(ext).toLowerCase().replace(/^\./, "")
            );

        if (!Array.isArray(merged.validHosts))
            merged.validHosts = [...DEFAULT_OPTIONS.validHosts];
        else
            merged.validHosts = merged.validHosts.map(h =>
                String(h).toLowerCase().replace(/^www\./, "")
            );

        // --- Validate bookmarks ---
        if (!Array.isArray(merged.bookmarks)) merged.bookmarks = [];
        merged.bookmarks = merged.bookmarks
            .filter(b => b && b.url)
            .map(b => ({
                title: String(b.title || b.url).trim(),
                url: String(b.url).trim()
            }));

        // safety options load the defaults instead
        if (typeof merged.autoOpenFolder !== "boolean")
            merged.autoOpenFolder = DEFAULT_OPTIONS.autoOpenFolder;

        if (typeof merged.playSoundOnComplete !== "boolean")
            merged.playSoundOnComplete = DEFAULT_OPTIONS.playSoundOnComplete;

        return merged;
    } catch (err) {
        console.error("[OptionsManager] Failed to load options:", err);
        return { ...DEFAULT_OPTIONS };
    }
}

/** Save options to disk, merging with current file */
function saveOptions(newOptions = {}) {
    ensureFileExists();

    const current = loadOptions();
    const merged = {
        ...current,
        ...newOptions,
        bookmarks: Array.isArray(newOptions.bookmarks)
            ? newOptions.bookmarks
            : current.bookmarks
    };

    try {
        fs.writeFileSync(optionsFilePath, JSON.stringify(merged, null, 2), "utf8");
        return merged;
    } catch (err) {
        console.error("[OptionsManager] Failed to save options:", err);
        return current;
    }
}

/** Return defaults */
function getDefaultOptions() {
    return { ...DEFAULT_OPTIONS };
}

module.exports = {
    loadOptions,
    saveOptions,
    getDefaultOptions
};
