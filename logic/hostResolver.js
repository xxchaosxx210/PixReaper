// logic/hostResolver.js
const fetch = require("node-fetch");
let fetchCookie = require("fetch-cookie");
if (fetchCookie.default) fetchCookie = fetchCookie.default; // ESM interop

const { JSDOM } = require("jsdom");
const tough = require("tough-cookie");

// Shared cookie jar for all hosts
const jar = new tough.CookieJar();
const fetchWithCookies = fetchCookie(fetch, jar);

// --- debug flag (defaults to false) ---
// Enable with env var: PIXREAPER_DEBUG=1 npm start
let DEBUG = !!process.env.PIXREAPER_DEBUG;

function setDebug(enabled) {
    DEBUG = !!enabled;
}

function logDebug(...args) { if (DEBUG) console.log("[hostResolver][DEBUG]", ...args); }
function logWarn(...args) { console.warn("[hostResolver][WARN]", ...args); }
function logError(...args) { console.error("[hostResolver][ERROR]", ...args); }


// --- Host resolvers ---
const hostResolvers = {
    // --- Pixhost ---
    "pixhost.to": async (url) => {
        try {
            const res = await fetchWithCookies(url);
            if (!res.ok) throw new Error(`Pixhost HTTP ${res.status}`);
            const html = await res.text();
            const doc = new JSDOM(html).window.document;

            let img = doc.querySelector("#image") || doc.querySelector("img#show_image");
            if (img && img.src) return new URL(img.src, url).href;

            const og = doc.querySelector('meta[property="og:image"]');
            if (og?.content) return new URL(og.content, url).href;

            logWarn("Pixhost resolver failed:", url);
            return null;
        } catch (err) {
            logError("Pixhost resolver error:", err);
            return null;
        }
    },

    // --- ImageBam (fixed with cookie injection) ---
    "imagebam.com": async (url) => {
        try {
            const res1 = await fetchWithCookies(url);
            if (!res1.ok) throw new Error(`ImageBam HTTP ${res1.status}`);
            const html1 = await res1.text();
            const doc1 = new JSDOM(html1).window.document;

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

                if (img?.src) return new URL(img.src, url).href;
                return null;
            }

            // No continue link (cookie already set)
            const img =
                doc1.querySelector("#imageContainer img") ||
                doc1.querySelector(".main-image") ||
                doc1.querySelector("img#mainImage");

            if (img?.src) return new URL(img.src, url).href;
            return null;
        } catch (err) {
            logError("ImageBam resolver error:", err);
            return null;
        }
    },

    // --- ImageVenue ---
    "imagevenue.com": async (url) => {
        try {
            const res = await fetchWithCookies(url);
            if (!res.ok) throw new Error(`ImageVenue HTTP ${res.status}`);
            const html = await res.text();
            const doc = new JSDOM(html).window.document;

            let img = doc.querySelector("img#img");
            if (img?.src) return new URL(img.src, url).href;

            const og = doc.querySelector('meta[property="og:image"]');
            if (og?.content) return new URL(og.content, url).href;

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

            let img = doc.querySelector(".img-content img");
            if (img?.src) return new URL(img.src, url).href;

            const og = doc.querySelector('meta[property="og:image"]');
            if (og?.content) return new URL(og.content, url).href;

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

            const og = doc.querySelector('meta[property="og:image"]');
            if (og?.content) return new URL(og.content, url).href;

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

            let img = doc.querySelector("img#main-image");
            if (img?.src) return new URL(img.src, url).href;

            const og = doc.querySelector('meta[property="og:image"]');
            if (og?.content) return new URL(og.content, url).href;

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

            let img = doc.querySelector("img.pic");
            if (img?.src) return new URL(img.src, url).href;

            const og = doc.querySelector('meta[property="og:image"]');
            if (og?.content) return new URL(og.content, url).href;

            return null;
        } catch (err) {
            logError("TurboImageHost resolver error:", err);
            return null;
        }
    },

    // --- FastPic (org + ru) ---
    "fastpic.org": async (url) => {
        try {
            const res = await fetchWithCookies(url);
            if (!res.ok) throw new Error(`FastPic HTTP ${res.status}`);
            const html = await res.text();
            const doc = new JSDOM(html).window.document;

            let img = doc.querySelector("img");
            if (img?.src) return new URL(img.src, url).href;

            const og = doc.querySelector('meta[property="og:image"]');
            if (og?.content) return new URL(og.content, url).href;

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

            let img = doc.querySelector("img#image");
            if (img?.src) return new URL(img.src, url).href;

            const og = doc.querySelector('meta[property="og:image"]');
            if (og?.content) return new URL(og.content, url).href;

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

            let img = doc.querySelector("img.pic");
            if (img?.src) return new URL(img.src, url).href;

            const og = doc.querySelector('meta[property="og:image"]');
            if (og?.content) return new URL(og.content, url).href;

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

            let img = doc.querySelector("img#mainImage");
            if (img?.src) return new URL(img.src, url).href;

            const og = doc.querySelector('meta[property="og:image"]');
            if (og?.content) return new URL(og.content, url).href;

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

            let img = doc.querySelector("img#img");
            if (img?.src) return new URL(img.src, url).href;

            const og = doc.querySelector('meta[property="og:image"]');
            if (og?.content) return new URL(og.content, url).href;

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
            return await hostResolvers[resolverKey](url);
        }
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
        return Object.keys(hostResolvers).some((host) =>
            hostname.endsWith(host)
        );
    } catch {
        return false;
    }
}

module.exports = { resolveLink, isSupportedHost, setDebug, logDebug };

