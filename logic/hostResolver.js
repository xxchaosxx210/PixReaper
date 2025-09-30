// logic/hostResolver.js
const fetch = require("node-fetch");
let fetchCookie = require("fetch-cookie");
if (fetchCookie.default) fetchCookie = fetchCookie.default; // ESM interop

const { JSDOM } = require("jsdom");
const tough = require("tough-cookie");

// Shared cookie jar for all hosts
const jar = new tough.CookieJar();
const fetchWithCookies = fetchCookie(fetch, jar);

// debug logs
const { logDebug, logWarn, logError } = require("../utils/logger");
const { loadOptions } = require("../config/optionsManager"); // ✅ import options

// --- Utility: get regex for valid extensions ---
function getExtRegex() {
    const options = loadOptions();
    const valid = options.validExtensions && options.validExtensions.length > 0
        ? options.validExtensions
        : ["jpg", "jpeg"]; // fallback default

    return new RegExp(`\\.(${valid.join("|")})(?:$|\\?)`, "i");
}

// --- Generic fallback resolver ---
async function genericResolver(url) {
    try {
        const res = await fetchWithCookies(url);
        if (!res.ok) throw new Error(`Generic resolver HTTP ${res.status}`);
        const html = await res.text();
        const doc = new JSDOM(html).window.document;
        const extRegex = getExtRegex();

        // Look for obvious <img>
        let img = doc.querySelector("img");
        if (img?.src && extRegex.test(img.src)) return new URL(img.src, url).href;

        // Try OpenGraph
        const og = doc.querySelector('meta[property="og:image"]');
        if (og?.content && extRegex.test(og.content)) return new URL(og.content, url).href;

        logWarn("Generic resolver failed (no match):", url);
        return null;
    } catch (err) {
        logError("Generic resolver error:", err);
        return null;
    }
}

// --- Host resolvers (custom) ---
const hostResolvers = {
    // --- Pixhost ---
    "pixhost.to": async (url) => {
        try {
            const res = await fetchWithCookies(url);
            if (!res.ok) throw new Error(`Pixhost HTTP ${res.status}`);
            const html = await res.text();
            const doc = new JSDOM(html).window.document;
            const extRegex = getExtRegex();

            let img = doc.querySelector("#image") || doc.querySelector("img#show_image");
            if (img?.src && extRegex.test(img.src)) return new URL(img.src, url).href;

            const og = doc.querySelector('meta[property="og:image"]');
            if (og?.content && extRegex.test(og.content)) return new URL(og.content, url).href;

            logWarn("Pixhost resolver failed:", url);
            return null;
        } catch (err) {
            logError("Pixhost resolver error:", err);
            return null;
        }
    },

    // --- ImageBam (cookie bypass) ---
    "imagebam.com": async (url) => {
        try {
            const res1 = await fetchWithCookies(url);
            if (!res1.ok) throw new Error(`ImageBam HTTP ${res1.status}`);
            const html1 = await res1.text();
            const doc1 = new JSDOM(html1).window.document;
            const extRegex = getExtRegex();

            const continueLink = doc1.querySelector("#continue a[data-shown='inter']");
            if (continueLink) {
                logDebug("⚠️ ImageBam interstitial detected, injecting cookie...");

                const cookies = await jar.getCookies(url);
                const hasCookie = cookies.some(c => c.key === "nsfw_inter");

                if (!hasCookie) {
                    jar.setCookieSync("nsfw_inter=1; Domain=.imagebam.com; Path=/", url);
                    logDebug("🍪 nsfw_inter=1 cookie set");
                }

                const res2 = await fetchWithCookies(url);
                if (!res2.ok) throw new Error(`ImageBam retry HTTP ${res2.status}`);
                const html2 = await res2.text();
                const doc2 = new JSDOM(html2).window.document;

                const img =
                    doc2.querySelector("#imageContainer img") ||
                    doc2.querySelector(".main-image") ||
                    doc2.querySelector("img#mainImage");

                if (img?.src && extRegex.test(img.src)) return new URL(img.src, url).href;
                return null;
            }

            const img =
                doc1.querySelector("#imageContainer img") ||
                doc1.querySelector(".main-image") ||
                doc1.querySelector("img#mainImage");

            if (img?.src && extRegex.test(img.src)) return new URL(img.src, url).href;
            return null;
        } catch (err) {
            logError("ImageBam resolver error:", err);
            return null;
        }
    },

    // --- ImageVenue ---
    "imagevenue.com": async (url) => {
        try {
            const res = await fetchWithCookies(url, {
                headers: { "User-Agent": "PixReaper/1.0", "Referer": url }
            });
            if (!res.ok) throw new Error(`ImageVenue HTTP ${res.status}`);
            const html = await res.text();
            const doc = new JSDOM(html).window.document;
            const extRegex = getExtRegex();

            let img = doc.querySelector("img#main-image");
            if (img?.src && extRegex.test(img.src)) return new URL(img.src, url).href;

            const candidates = [...doc.querySelectorAll("img")]
                .map(el => el.src)
                .filter(src => src && extRegex.test(src));

            if (candidates.length > 0) return new URL(candidates[0], url).href;

            const og = doc.querySelector('meta[property="og:image"]');
            if (og?.content && extRegex.test(og.content)) return new URL(og.content, url).href;

            logWarn("ImageVenue resolver failed (no match):", url);
            return null;
        } catch (err) {
            logError("ImageVenue resolver error:", err);
            return null;
        }
    },

    // --- ImgBox ---
    "imgbox.com": async (url) => {
        try {
            const res = await fetchWithCookies(url);
            if (!res.ok) throw new Error(`ImgBox HTTP ${res.status}`);
            const html = await res.text();
            const doc = new JSDOM(html).window.document;
            const extRegex = getExtRegex();

            let img = doc.querySelector(".img-content img");
            if (img?.src && extRegex.test(img.src)) return new URL(img.src, url).href;

            const og = doc.querySelector('meta[property="og:image"]');
            if (og?.content && extRegex.test(og.content)) return new URL(og.content, url).href;

            return null;
        } catch (err) {
            logError("ImgBox resolver error:", err);
            return null;
        }
    },

    // --- PimpAndHost ---
    "pimpandhost.com": async (url) => {
        try {
            const res = await fetchWithCookies(url);
            if (!res.ok) throw new Error(`PimpAndHost HTTP ${res.status}`);
            const html = await res.text();
            const doc = new JSDOM(html).window.document;
            const extRegex = getExtRegex();

            const og = doc.querySelector('meta[property="og:image"]');
            if (og?.content && extRegex.test(og.content)) return new URL(og.content, url).href;

            return null;
        } catch (err) {
            logError("PimpAndHost resolver error:", err);
            return null;
        }
    },

    // --- PostImage ---
    "postimg.cc": async (url) => {
        try {
            const res = await fetchWithCookies(url);
            if (!res.ok) throw new Error(`PostImage HTTP ${res.status}`);
            const html = await res.text();
            const doc = new JSDOM(html).window.document;
            const extRegex = getExtRegex();

            let img = doc.querySelector("img#main-image");
            if (img?.src && extRegex.test(img.src)) return new URL(img.src, url).href;

            const og = doc.querySelector('meta[property="og:image"]');
            if (og?.content && extRegex.test(og.content)) return new URL(og.content, url).href;

            return null;
        } catch (err) {
            logError("PostImage resolver error:", err);
            return null;
        }
    },

    // --- TurboImageHost ---
    "turboimagehost.com": async (url) => {
        try {
            const res = await fetchWithCookies(url);
            if (!res.ok) throw new Error(`TurboImageHost HTTP ${res.status}`);
            const html = await res.text();
            const doc = new JSDOM(html).window.document;
            const extRegex = getExtRegex();

            let img = doc.querySelector("img.pic");
            if (img?.src && extRegex.test(img.src)) return new URL(img.src, url).href;

            const og = doc.querySelector('meta[property="og:image"]');
            if (og?.content && extRegex.test(og.content)) return new URL(og.content, url).href;

            return null;
        } catch (err) {
            logError("TurboImageHost resolver error:", err);
            return null;
        }
    },

    // --- FastPic ---
    "fastpic.org": async (url) => {
        try {
            const res = await fetchWithCookies(url);
            if (!res.ok) throw new Error(`FastPic HTTP ${res.status}`);
            const html = await res.text();
            const doc = new JSDOM(html).window.document;
            const extRegex = getExtRegex();

            let img = doc.querySelector("img");
            if (img?.src && extRegex.test(img.src)) return new URL(img.src, url).href;

            const og = doc.querySelector('meta[property="og:image"]');
            if (og?.content && extRegex.test(og.content)) return new URL(og.content, url).href;

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
            const res = await fetchWithCookies(url);
            if (!res.ok) throw new Error(`ImageTwist HTTP ${res.status}`);
            const html = await res.text();
            const doc = new JSDOM(html).window.document;
            const extRegex = getExtRegex();

            let img = doc.querySelector("img#image");
            if (img?.src && extRegex.test(img.src)) return new URL(img.src, url).href;

            const og = doc.querySelector('meta[property="og:image"]');
            if (og?.content && extRegex.test(og.content)) return new URL(og.content, url).href;

            return null;
        } catch (err) {
            logError("ImageTwist resolver error:", err);
            return null;
        }
    },

    // --- ImgView ---
    "imgview.net": async (url) => {
        try {
            const res = await fetchWithCookies(url);
            if (!res.ok) throw new Error(`ImgView HTTP ${res.status}`);
            const html = await res.text();
            const doc = new JSDOM(html).window.document;
            const extRegex = getExtRegex();

            let img = doc.querySelector("img.pic");
            if (img?.src && extRegex.test(img.src)) return new URL(img.src, url).href;

            const og = doc.querySelector('meta[property="og:image"]');
            if (og?.content && extRegex.test(og.content)) return new URL(og.content, url).href;

            return null;
        } catch (err) {
            logError("ImgView resolver error:", err);
            return null;
        }
    },

    // --- Radikal ---
    "radikal.ru": async (url) => {
        try {
            const res = await fetchWithCookies(url);
            if (!res.ok) throw new Error(`Radikal HTTP ${res.status}`);
            const html = await res.text();
            const doc = new JSDOM(html).window.document;
            const extRegex = getExtRegex();

            let img = doc.querySelector("img#mainImage");
            if (img?.src && extRegex.test(img.src)) return new URL(img.src, url).href;

            const og = doc.querySelector('meta[property="og:image"]');
            if (og?.content && extRegex.test(og.content)) return new URL(og.content, url).href;

            return null;
        } catch (err) {
            logError("Radikal resolver error:", err);
            return null;
        }
    },

    // --- ImageUpper ---
    "imageupper.com": async (url) => {
        try {
            const res = await fetchWithCookies(url);
            if (!res.ok) throw new Error(`ImageUpper HTTP ${res.status}`);
            const html = await res.text();
            const doc = new JSDOM(html).window.document;
            const extRegex = getExtRegex();

            let img = doc.querySelector("img#img");
            if (img?.src && extRegex.test(img.src)) return new URL(img.src, url).href;

            const og = doc.querySelector('meta[property="og:image"]');
            if (og?.content && extRegex.test(og.content)) return new URL(og.content, url).href;

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
        const options = loadOptions();
        const validHosts = options.validHosts || [];

        // 1) Try custom resolver
        const resolverKey = Object.keys(hostResolvers).find((host) =>
            hostname.endsWith(host)
        );
        if (resolverKey) {
            return await hostResolvers[resolverKey](url);
        }

        // 2) If host is in validHosts → generic resolver
        if (validHosts.some(h => hostname.endsWith(h))) {
            logDebug(`Using generic resolver for: ${hostname}`);
            return await genericResolver(url);
        }

        // 3) Unsupported host
        logWarn("No resolver for host:", hostname);
        return null;
    } catch (err) {
        logError("resolveLink error:", err);
        return null;
    }
}

// --- Host support checker ---
function isSupportedHost(url) {
    try {
        const hostname = new URL(url).hostname.replace(/^www\./, "");
        const options = loadOptions();
        const validHosts = options.validHosts || [];
        return (
            Object.keys(hostResolvers).some((host) => hostname.endsWith(host)) ||
            validHosts.some((h) => hostname.endsWith(h))
        );
    } catch {
        return false;
    }
}

module.exports = { resolveLink, isSupportedHost };
