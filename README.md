# 🖼️ PixReaper

**PixReaper** is an advanced **Electron-based desktop application** that scans webpages for **image-hosting links** (such as Pixhost, Imagebam, Imgbox, etc.), resolves them into direct image URLs, and downloads the images with full control over concurrency, save paths, and file naming.

---

## 🚀 Features

- 🔍 **Smart Webpage Scanning** — Finds and extracts all image-host links using multi-threaded background workers.  
- ⚙️ **Concurrent Downloads** — Download multiple images simultaneously with customizable connection limits.  
- 💾 **Flexible Save Options** — Choose download folders, filename prefixes, indexing, and more.  
- 🧩 **Bookmark Management** — Save and revisit your favorite galleries or image pages.  
- 🧠 **Persistent Settings** — Options are stored locally and automatically reloaded between sessions.  
- 🧰 **Debug Logging** — Detailed logs for debugging and tracking progress.  
- 🪟 **Polished UI** — Simple, responsive interface with real-time progress updates.  
- 🧵 **Worker Thread Pool** — Efficient use of system resources for large batch scans.  

---

## 📦 Tech Stack

- **Electron** — Desktop framework for cross-platform app packaging.  
- **Node.js** — Backend logic and file management.  
- **Worker Threads** — Parallel scanning and resolution of image links.  
- **JS/HTML/CSS** — Renderer UI.  
- **Custom Modules**:
  - `optionsManager.js` – Handles saving/loading user preferences.
  - `downloader.js` – Manages concurrent image downloads.
  - `hostResolver.js` – Resolves supported image-host URLs to direct images.
  - `linkWorker.js` – Worker-thread script that processes individual links.

---

## 🧠 How It Works

1. Load a webpage inside PixReaper’s built-in webview.  
2. Click **Scan** — the app extracts all supported image-host links.  
3. PixReaper uses worker threads to resolve and validate links concurrently.  
4. Review results and hit **Download** — the downloader saves all resolved images to your chosen folder.  
5. Optionally, PixReaper opens the download folder automatically when complete.

---

## ⚙️ Developer Notes

- Main entry point: `main.js`  
- Renderer/UI: `renderer/index.html`  
- Uses IPC communication between main and renderer for all background operations.  
- Logs are stored in your system’s user data folder (e.g., `AppData/Roaming/PixReaper/logs`).  
- Packaged with **electron-builder** for easy distribution.

---

## 🧾 License

MIT License © 2025  
Created and maintained by **Paul Millar**

---

> 💡 *PixReaper — built for speed, simplicity, and control when collecting image-host content.*
