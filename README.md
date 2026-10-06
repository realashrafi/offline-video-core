# @realashrafi/offline-video-core

> Offline PWA video download manager with OPFS, IndexedDB, Web Locks and AES-GCM encryption.

A lightweight, robust, and TypeScript-first offline video caching and download engine for modern web apps and PWAs. Powered by the **Origin Private File System (OPFS)** for high-performance chunked file storage, **IndexedDB** for metadata and state persistence, the **Web Locks API** for cross-tab concurrency, and **Web Crypto (AES-GCM)** for encrypting sensitive decryption keys at rest.

[![npm version](https://img.shields.io/npm/v/@realashrafi/offline-video-core.svg)](https://www.npmjs.com/package/@realashrafi/offline-video-core)
[![TypeScript](https://img.shields.io/badge/TypeScript-ready-blue.svg)](https://www.typescriptlang.org/)
[![React](https://img.shields.io/badge/React-18%2B-61dafb.svg)](https://react.dev/)

---

## Table of Contents

- [Features](#features)
- [Installation](#installation)
- [Quick Start](#quick-start)
- [React Hook: `useVideoDownloader`](#react-hook-usevideodownloader)
  - [Input Parameters](#input-parameters)
  - [Return Values & States](#return-values--states)
- [Low-Level Exports](#low-level-exports)
  - [OPFS Storage Service](#opfs-storage-service)
  - [Database Service (IndexedDB)](#database-service-indexeddb)
  - [Crypto Service (AES-GCM)](#crypto-service-aes-gcm)
- [Concurrency & Tab Synchronization](#concurrency--tab-synchronization)
- [Browser Support & Storage Quota](#browser-support--storage-quota)
- [Troubleshooting](#troubleshooting)
- [License](#license)

---

## Features

- **OPFS Storage:** Direct, sandboxed, high-throughput storage for large video files without main-thread or heap memory bottlenecks. Chunks stream into a temp file, then are finalized atomically into a `videos/` directory with a JSON manifest.
- **IndexedDB Persistence:** Tracks status, downloaded bytes, total size, course/grade/tutorial relations, timestamps, and ETags under `AppOfflineDB` (store: `downloads`, keyed by `[videoId, part]`).
- **Resumable & Chunked Downloads:** Automatic byte-range handling (`Range` + `If-Range`/`ETag`) with seamless pause, resume, cancel, and integrity verification against `Content-Length`.
- **Cross-Tab Safety (Web Locks API):** Downloads and deletions run under per-video locks (`offline-video-{videoId}-{part}`), so multiple open tabs never duplicate work or corrupt files.
- **Key Protection (Web Crypto, AES-GCM 256):** Stream decryption keys are encrypted with a non-extractable, per-origin master key persisted in IndexedDB (`AppOfflineCrypto`), then decrypted on playback.
- **Cross-Tab Reactivity:** Read/write transactions dispatch the `OFFLINE_DOWNLOADS_CHANGED` window event so every open tab stays in sync.
- **Headless React Integration:** First-class `useVideoDownloader` hook with fine-grained reactive status and progress updates, plus a default export.

---

## Installation

```bash
npm install @realashrafi/offline-video-core
```

Peer dependencies (React 18+):

```bash
npm install react react-dom
```

---

## Quick Start

```tsx
import { useVideoDownloader } from "@realashrafi/offline-video-core";

export default function DownloadAction({ videoId, part, videoUrl, title }) {
  const {
    status,
    progress,
    startDownload,
    pauseDownload,
    removeDownload,
  } = useVideoDownloader({ videoId, part, videoUrl, metadata: { title } });

  if (status === "downloading") {
    return <button onClick={pauseDownload}>Pause ({Math.round(progress)}%)</button>;
  }

  if (status === "completed") {
    return <button onClick={removeDownload}>Remove from offline storage</button>;
  }

  return <button onClick={startDownload}>Download for offline</button>;
}
```

---

## React Hook: `useVideoDownloader`

End-to-end reactive state management for downloading, pausing, resuming, and deleting videos. Available as a named and as the default export.

### Input Parameters (`VideoDownloaderInput`)

| Parameter | Type | Required | Description |
| :--- | :--- | :--- | :--- |
| `videoId` | `number` | Yes | Unique identifier of the video/lesson. |
| `part` | `number` | Yes | Part or chapter number (e.g. `1`, `2`). |
| `videoUrl` | `string` | No | Remote URL of the video source. Required to start a download. |
| `keyUrl` | `string` | No | Remote decryption key URL for protected streams; the fetched key is stored AES-GCM-encrypted. |
| `metadata` | `Partial<OfflineVideoMetadata>` | No | Context info (`title`, `courseId`, `gradeId`, `tutorialId`, `coverUrl`, `colors`, …). |

### Return Values & States (`VideoDownloaderResult`)

| Property / Method | Type | Description |
| :--- | :--- | :--- |
| `status` | `DownloadStatus` | `'idle' \| 'downloading' \| 'paused' \| 'completed' \| 'error'` |
| `progress` | `number` | Percentage between `0` and `100`; `100` when completed. |
| `downloadedBytes` | `number` | Bytes downloaded and flushed to disk so far. |
| `totalBytes` | `number` | Estimated or confirmed total file size in bytes. |
| `localPlayableSrc` | `string \| null` | Blob URL for the locally stored video file (`completed` only). |
| `localDecryptedKeySrc` | `string \| null` | Blob URL for the stored decryption key, if any. |
| `error` | `string \| null` | Human-readable error message. |
| `startDownload()` | `() => Promise<void>` | Starts a new download or resumes a paused one. |
| `pauseDownload()` | `() => void` | Pauses the active fetch and safely commits partial progress. |
| `cancelDownload()` | `() => void` | Alias of `pauseDownload()` (aborts the active fetch). |
| `removeDownload()` | `() => Promise<void>` | Deletes the OPFS files and the IndexedDB record (throws if another tab holds the lock). |

On mount (and on every `OFFLINE_DOWNLOADS_CHANGED` event) the hook reloads the saved record: interrupted `'downloading'` states are surfaced as `'paused'`, and completed videos are materialized into blob URLs.

---

## Low-Level Exports

For custom workers or programmatic management outside React.

### OPFS Storage Service

Root directories `videos/` and `temp/` are created on demand (`getDirectories()`).

```ts
import {
  getDirectories,
  getTempDownloadedBytes,
  openTempWriter,
  appendTempChunk,
  resetTempVideo,
  finalizeVideo,
  getVideoFile,
  deleteVideoAndTemp,
} from "@realashrafi/offline-video-core";

// Byte offset of the existing temp file (0 if none) — used for Range resume
const loaded = await getTempDownloadedBytes(videoId, part);

// Stream chunks into the temp file (single writer; closing commits on pause)
const writer = await openTempWriter(videoId, part);
await writer.write(chunk);
await writer.close();

// Or append a single chunk in one call
await appendTempChunk(videoId, part, new Uint8Array(/* ... */));

// Atomically move temp -> videos/video_{id}_{part}.m4v (+ manifest JSON)
const name = await finalizeVideo(videoId, part, { fileSize: loaded });

// Read the finished file back as a File (null if missing)
const file = await getVideoFile(videoId, part);

// Remove video, manifest, and temp file
await deleteVideoAndTemp(videoId, part);

// Start the download over from scratch
await resetTempVideo(videoId, part);
```

### Database Service (IndexedDB)

```ts
import {
  initDB,
  upsertDownloadRecord,
  getDownloadRecord,
  updateDownloadProgress,
  getAllDownloads,
  getDownloadsByFilter,
  deleteDownloadRecord,
  OFFLINE_DOWNLOADS_CHANGED,
} from "@realashrafi/offline-video-core";

// One record per [videoId, part]
const record = await getDownloadRecord(videoId, part);

// List/filter downloads (sorted by most recent `updatedAt`)
const list = await getDownloadsByFilter({ courseId: 123, status: "completed" });

// Update progress inline
await updateDownloadProgress(videoId, part, downloadedBytes, "downloading");

// Listen for cross-tab changes
window.addEventListener(OFFLINE_DOWNLOADS_CHANGED, refresh);
```

`DownloadsFilter` supports `gradeId`, `courseId`, `tutorialId`, and `status`; filters compose.

### Crypto Service (AES-GCM)

Protects stored values at rest (not against scripts running in the same origin). The per-origin master key is non-extractable and persisted in IndexedDB.

```ts
import { encryptKey, decryptKey } from "@realashrafi/offline-video-core";

// Encrypt a fetched key string -> "v1:<base64(iv + ciphertext)>"
const encryptedKey = await encryptKey(keyUrl ?? plainKey);

// Decrypt it back when playback starts
const plainKey = await decryptKey(encryptedKey);
```

---

## Concurrency & Tab Synchronization

Downloads and removals run under the Web Locks API:

```ts
navigator.locks.request(`offline-video-${videoId}-${part}`, { ifAvailable: true }, async (lock) => {
  if (!lock) throw new Error("Download active in another tab.");
  // safe single-worker execution scope
});
```

- If Tab A is downloading, Tab B receives updates via `OFFLINE_DOWNLOADS_CHANGED` without issuing duplicate network requests.
- When Tab A closes unexpectedly, the lock is dropped and any other tab or session can resume cleanly.
- `removeDownload()` fails gracefully if another tab holds the lock for that video.

---

## Browser Support & Storage Quota

| Technology | Chrome / Edge (Chromium) | Safari (iOS & macOS) | Firefox |
| :--- | :--- | :--- | :--- |
| **OPFS** | Supported (v86+) | Supported (v15.2+) | Supported (v111+) |
| **IndexedDB** | Supported | Supported | Supported |
| **Web Locks** | Supported (v69+) | Supported (v15.4+) | Supported (v96+) |
| **Web Crypto** | Supported | Supported | Supported |

Request persistent storage so OS heuristics cannot silently evict offline videos:

```ts
if (navigator.storage?.persist) {
  const isPersisted = await navigator.storage.persist();
  console.log(`Persistent storage granted: ${isPersisted}`);
}
```

---

## Troubleshooting

- **`Offline database upgrade is blocked by another tab`** — Close other tabs using the app (or refresh them) so the schema upgrade can proceed.
- **`This video is being downloaded in another player or tab.`** — The per-video Web Lock is held elsewhere; wait for the other tab to finish or release.
- **`Compressed video responses cannot be safely resumed.`** — The server sends a non-`identity` `Content-Encoding`, which breaks byte-range integrity; serve the video uncompressed.
- **`The offline video is missing. Download it again.`** — The OPFS file was evicted or cleared while the IndexedDB record still exists. Re-run `startDownload()`.
- **Private/Incognito mode** — Some browsers restrict OPFS in private windows; detect this up front and advise switching to a regular tab.
- **Resetting a corrupted install** — In DevTools → Application → Storage, delete the `AppOfflineDB` and `AppOfflineCrypto` databases, then reload.

---

## License

MIT © [realashrafi](https://github.com/realashrafi)
