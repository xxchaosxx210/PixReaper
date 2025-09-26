// logic/hostResolver.js
// Central place for all host-specific resolvers (Electron + Node + jsdom)

const { JSDOM } = require("jsdom");

// --- fetch-cookie + node-fetch setup (universal fix) ---
let fetchCookie = require("fetch-cookie");
if (fetchCookie.default) {
    fetchCookie = fetchCookie.default; // handle ESM interop
}
const nodeFetch = require("node-fetch");
const fetch = fetchCookie(nodeFetch);

// --- Debug logger helpers ---
const DEBUG = true;
function logDebug(...args) { if (DEBUG) console.log("[DEBUG]", ...args); }
function logWarn(...args) { if (DEBUG) console.warn("[WARN]", ...args); }
function logError(...args) { console.error("[ERROR]", ...args); }

// --- HOST RESOLVERS ---
const hostResolvers = {
    // --- Pixhost ---
    "pixhost.to": async (url) => {
        try {
            const res = await fetch(url);
            if (!res.ok) throw new Error(`Pixhost HTTP ${res.status}`);
            const html = await res.text();
            const doc = new JSDOM(html).window.document;

            let img = doc.querySelector("#image") || doc.querySelector("img#show_image");
            if (img && img.src) return new URL(img.src, url).href;

            const og = doc.querySelector('meta[property="og:image"]');
            if (og && og.content) return new URL(og.content, url).href;

            logWarn("Pixhost resolver failed:", url);
            return null;
        } catch (err) {
            logError("Pixhost resolver error:", err);
            return null;
        }
    },

    // --- ImageBam ---
    "imagebam.com": async (url) => {
        try {
            const fetchDoc = async (u) => {
                const res = await fetch(u);
                if (!res.ok) throw new Error(`HTTP ${res.status}`);
                const html = await res.text();
                return new JSDOM(html).window.document;
            };

            let attempts = 0;
            let doc = await fetchDoc(url);
            if (!doc) return null;

            while (attempts < 2) {
                attempts++;

                const continueLink = doc.querySelector("#continue a[data-shown='inter']");
                if (continueLink && continueLink.href) {
                    logDebug("🔎 ImageBam interstitial detected, following continue link...");
                    doc = await fetchDoc(continueLink.href);
                    if (!doc) return null;
                }

                let img =
                    doc.querySelector("#imageContainer img") ||
                    doc.querySelector(".main-image") ||
                    doc.querySelector("img#mainImage");

                if (img && img.src) return new URL(img.src, url).href;

                const og = doc.querySelector('meta[property="og:image"]');
                if (og && og.content) return new URL(og.content, url).href;
            }

            logWarn("⚠️ ImageBam resolver failed after retries:", url);
            return null;
        } catch (err) {
            logError("ImageBam resolver error:", err);
            return null;
        }
    },

    // --- ImageVenue ---
    "imagevenue.com": async (url) => {
        try {
            const res = await fetch(url);
            if (!res.ok) throw new Error(`ImageVenue HTTP ${res.status}`);
            const html = await res.text();
            const doc = new JSDOM(html).window.document;

            let img = doc.querySelector("img#img");
            if (img && img.src) return new URL(img.src, url).href;

            const og = doc.querySelector('meta[property="og:image"]');
            if (og && og.content) return new URL(og.content, url).href;

            logWarn("ImageVenue resolver failed:", url);
            return null;
        } catch (err) {
            logError("ImageVenue resolver error:", err);
            return null;
        }
    },

    // --- ImgBox ---
    "imgbox.com": async (url) => {
        try {
            const res = await fetch(url);
            if (!res.ok) throw new Error(`ImgBox HTTP ${res.status}`);
            const html = await res.text();
            const doc = new JSDOM(html).window.document;

            let img = doc.querySelector(".img-content img");
            if (img && img.src) return new URL(img.src, url).href;

            const og = doc.querySelector('meta[property="og:image"]');
            if (og && og.content) return new URL(og.content, url).href;

            logWarn("ImgBox resolver failed:", url);
            return null;
        } catch (err) {
            logError("ImgBox resolver error:", err);
            return null;
        }
    },

    // --- PimpAndHost ---
    "pimpandhost.com": async (url) => {
        try {
            const res = await fetch(url);
            if (!res.ok) throw new Error(`PimpAndHost HTTP ${res.status}`);
            const html = await res.text();
            const doc = new JSDOM(html).window.document;

            const og = doc.querySelector('meta[property="og:image"]');
            if (og && og.content) return new URL(og.content, url).href;

            logWarn("PimpAndHost resolver failed:", url);
            return null;
        } catch (err) {
            logError("PimpAndHost resolver error:", err);
            return null;
        }
    },

    // --- PostImage ---
    "postimg.cc": async (url) => {
        try {
            const res = await fetch(url);
            if (!res.ok) throw new Error(`PostImage HTTP ${res.status}`);
            const html = await res.text();
            const doc = new JSDOM(html).window.document;

            let img = doc.querySelector("img#main-image");
            if (img && img.src) return new URL(img.src, url).href;

            const og = doc.querySelector('meta[property="og:image"]');
            if (og && og.content) return new URL(og.content, url).href;

            logWarn("PostImage resolver failed:", url);
            return null;
        } catch (err) {
            logError("PostImage resolver error:", err);
            return null;
        }
    },

    // --- TurboImageHost ---
    "turboimagehost.com": async (url) => {
        try {
            const res = await fetch(url);
            if (!res.ok) throw new Error(`TurboImageHost HTTP ${res.status}`);
            const html = await res.text();
            const doc = new JSDOM(html).window.document;

            let img = doc.querySelector("img.pic");
            if (img && img.src) return new URL(img.src, url).href;

            const og = doc.querySelector('meta[property="og:image"]');
            if (og && og.content) return new URL(og.content, url).href;

            logWarn("TurboImageHost resolver failed:", url);
            return null;
        } catch (err) {
            logError("TurboImageHost resolver error:", err);
            return null;
        }
    },

    // --- FastPic ---
    "fastpic.org": async (url) => {
        try {
            const res = await fetch(url);
            if (!res.ok) throw new Error(`FastPic HTTP ${res.status}`);
            const html = await res.text();
            const doc = new JSDOM(html).window.document;

            let img = doc.querySelector("img");
            if (img && img.src) return new URL(img.src, url).href;

            const og = doc.querySelector('meta[property="og:image"]');
            if (og && og.content) return new URL(og.content, url).href;

            logWarn("FastPic resolver failed:", url);
            return null;
        } catch (err) {
            logError("FastPic resolver error:", err);
            return null;
        }
    },

    "fastpic.ru": async (url) => hostResolvers["fastpic.org"](url),

    // --- ImageTwist ---
    "imagetwist.com": async (url) => {
        try {
            const res = await fetch(url);
            if (!res.ok) throw new Error(`ImageTwist HTTP ${res.status}`);
            const html = await res.text();
            const doc = new JSDOM(html).window.document;

            let img = doc.querySelector("img#image");
            if (img && img.src) return new URL(img.src, url).href;

            const og = doc.querySelector('meta[property="og:image"]');
            if (og && og.content) return new URL(og.content, url).href;

            logWarn("ImageTwist resolver failed:", url);
            return null;
        } catch (err) {
            logError("ImageTwist resolver error:", err);
            return null;
        }
    },

    // --- ImgView ---
    "imgview.net": async (url) => {
        try {
            const res = await fetch(url);
            if (!res.ok) throw new Error(`ImgView HTTP ${res.status}`);
            const html = await res.text();
            const doc = new JSDOM(html).window.document;

            let img = doc.querySelector("img.pic");
            if (img && img.src) return new URL(img.src, url).href;

            const og = doc.querySelector('meta[property="og:image"]');
            if (og && og.content) return new URL(og.content, url).href;

            logWarn("ImgView resolver failed:", url);
            return null;
        } catch (err) {
            logError("ImgView resolver error:", err);
            return null;
        }
    },

    // --- Radikal ---
    "radikal.ru": async (url) => {
        try {
            const res = await fetch(url);
            if (!res.ok) throw new Error(`Radikal HTTP ${res.status}`);
            const html = await res.text();
            const doc = new JSDOM(html).window.document;

            let img = doc.querySelector("img#mainImage");
            if (img && img.src) return new URL(img.src, url).href;

            const og = doc.querySelector('meta[property="og:image"]');
            if (og && og.content) return new URL(og.content, url).href;

            logWarn("Radikal resolver failed:", url);
            return null;
        } catch (err) {
            logError("Radikal resolver error:", err);
            return null;
        }
    },

    // --- ImageUpper ---
    "imageupper.com": async (url) => {
        try {
            const res = await fetch(url);
            if (!res.ok) throw new Error(`ImageUpper HTTP ${res.status}`);
            const html = await res.text();
            const doc = new JSDOM(html).window.document;

            let img = doc.querySelector("img#img");
            if (img && img.src) return new URL(img.src, url).href;

            const og = doc.querySelector('meta[property="og:image"]');
            if (og && og.content) return new URL(og.content, url).href;

            logWarn("ImageUpper resolver failed:", url);
            return null;
        } catch (err) {
            logError("ImageUpper resolver error:", err);
            return null;
        }
    },
};

// --- Dispatcher ---
async function resolveLink(url) {
    try {
        const hostname = new URL(url).hostname.replace(/^www\./, "");
        const resolverKey = Object.keys(hostResolvers).find((host) =>
            hostname.endsWith(host)
        );
        if (resolverKey) {
            logDebug(`Resolving ${url} with resolver for ${resolverKey}`);
            return await hostResolvers[resolverKey](url);
        }
        logWarn("No resolver for host:", hostname);
        return null;
    } catch (err) {
        logError("resolveLink error:", err);
        return null;
    }
}

function isSupportedHost(url) {
    try {
        const hostname = new URL(url).hostname.replace(/^www\./, "");
        return Object.keys(hostResolvers).some((host) => hostname.endsWith(host));
    } catch {
        return false;
    }
}

module.exports = { resolveLink, isSupportedHost };

