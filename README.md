# Offline Video Core

A lightweight, robust, and TypeScript-first offline video caching and download engine for modern web apps and PWAs. Powered by the **Origin Private File System (OPFS)** for high-performance chunked file storage, **IndexedDB** for metadata and state persistence, **Web Locks API** for cross-tab concurrency, and **Web Crypto (AES-GCM)** for hardware-accelerated segment and key encryption.

[![npm version](https://img.shields.io/npm/v/@realashrafi/offline-video-core.svg)](https://www.npmjs.com/package/@realashrafi/offline-video-core)
[![TypeScript](https://img.shields.io/badge/TypeScript-ready-blue.svg)](https://www.typescriptlang.org/)
[![React](https://img.shields.io/badge/React-18%2B-61dafb.svg)](https://react.dev/)

---

## Table of Contents

- [Architecture Overview](#architecture-overview)
- [Features](#features)
- [Installation](#installation)
- [Quick Start](#quick-start)
- [React Hook: useVideoDownloader](#react-hook-usevideodownloader)
  - [Input Parameters](#input-parameters)
  - [Return Values & States](#return-values--states)
- [Integration with Sibtorsh Player](#integration-with-sibtorsh-player)
- [Low-Level Services API](#low-level-services-api)
  - [Diagnostics](#diagnostics)
  - [Database Service (offlineDb)](#database-service-offlinedb)
  - [Storage Service (opfsStorage)](#storage-service-opfsstorage)
  - [Crypto Service (cryptoService)](#crypto-service-cryptoservice)
- [HLS & AES-128 Offline Playback](#hls--aes-128-offline-playback)
- [Concurrency & Tab Synchronization](#concurrency--tab-synchronization)
- [Browser Support & PWA Storage Quota](#browser-support--pwa-storage-quota)
- [Troubleshooting](#troubleshooting)
- [License](#license)

---

## Architecture Overview

```text
┌────────────────────────────────────────────────────────┐
│                   React Application                    │
│             useVideoDownloader() Hook                  │
└───────────────────────────┬────────────────────────────┘
                            │
┌───────────────────────────▼────────────────────────────┐
│                  Offline Video Core                    │
│  ┌───────────────────────┬───────────────────────────┐ │
│  │   IndexedDB Metadata  │   OPFS Chunked Storage    │ │
│  │    (States/Progress)  │   (Encrypted / Raw Blobs) │ │
│  └───────────────────────┴───────────────────────────┘ │
│  ┌───────────────────────┬───────────────────────────┐ │
│  │   Web Crypto AES-GCM  │   Web Locks Concurrency   │ │
│  │  (Zero-overhead keys) │    (Multi-tab safe locks) │ │
│  └───────────────────────┴───────────────────────────┘ │
└────────────────────────────────────────────────────────┘
```

---

## Features

- **Origin Private File System (OPFS):** Direct, sandboxed, high-throughput storage for large video files without main-thread or heap memory bottlenecks.
- **IndexedDB Metadata Persistence:** Tracks video status, downloaded bytes, total size, course/lesson relations, and timestamps.
- **Web Crypto (AES-GCM):** Hardware-accelerated at-rest encryption for video chunks and sensitive AES decryption keys.
- **Cross-Tab Concurrency (Web Locks API):** Guarantees that multiple open tabs will never duplicate downloads or corrupt storage files.
- **Resumable & Chunked Downloads:** Automatic byte-range handling with seamless resume, pause, cancel, and retry capabilities.
- **Headless React Integration:** First-class `useVideoDownloader` React hook with fine-grained reactive status and progress updates.
- **Local Playback Generation:** Instantly turns stored OPFS files and decryption keys into local Blob/Object URLs for players like `@alirezahosseini/sibtorsh-player`.
- **System Diagnostics:** One-line check to verify browser capabilities before initiating downloads.

---

## Installation

Install the core package into your PWA or frontend application:

```bash
npm install @realashrafi/offline-video-core
```

Ensure peer dependencies are installed:

```bash
npm install react react-dom
```

---

## Quick Start

### 1. Verify Browser Support (Diagnostics)

Run diagnostics on application startup or when mounting video modules:

```tsx
import { runDiagnostics } from "@realashrafi/offline-video-core";

const diag = await runDiagnostics();
console.log("Storage System Status:", diag);
```

### 2. Basic Download Component

```tsx
import React from "react";
import { useVideoDownloader } from "@realashrafi/offline-video-core";

export default function DownloadAction({ videoId, part, videoUrl, keyUrl, title }) {
  const {
    status,
    progress,
    startDownload,
    pauseDownload,
    removeOfflineVideo,
  } = useVideoDownloader({
    videoId,
    part,
    videoUrl,
    keyUrl,
    metadata: { title },
  });

  if (status === "downloading") {
    return (
      <button onClick={pauseDownload}>
        توقف ({Math.round(progress)}%)
      </button>
    );
  }

  if (status === "completed") {
    return (
      <button onClick={removeOfflineVideo}>
        حذف از حافظه آفلاین
      </button>
    );
  }

  return (
    <button onClick={startDownload}>
      دانلود آفلاین
    </button>
  );
}
```

---

## React Hook: `useVideoDownloader`

The `useVideoDownloader` hook provides end-to-end reactive state management for downloading, pausing, resuming, and deleting videos.

### Input Parameters (`VideoDownloaderInput`)

| Parameter | Type | Required | Description |
| :--- | :--- | :--- | :--- |
| `videoId` | `string | number` | Yes | Unique identifier of the video/lesson. |
| `part` | `number` | Yes | Part or chapter number (e.g., `1`, `2`). |
| `videoUrl` | `string` | No | Remote URL to fetch the video source (MP4/TS/m3u8). |
| `keyUrl` | `string` | No | Protected remote key URL for AES-128 encrypted streams. |
| `metadata` | `Partial<OfflineVideoMetadata>` | No | Context information (e.g., `title`, `courseId`, `gradeId`, `tutorialId`). |

### Return Values & States (`VideoDownloaderResult`)

| Property / Method | Type | Description |
| :--- | :--- | :--- |
| `status` | `DownloadStatus` | `'idle' | 'downloading' | 'paused' | 'completed' | 'error'` |
| `progress` | `number` | Floating point percentage between `0` and `100`. |
| `downloadedBytes` | `number` | Total bytes downloaded and flushed to disk so far. |
| `totalBytes` | `number` | Estimated or confirmed total size of the file in bytes. |
| `localVideoUrl` | `string | null` | Clean Blob URL referencing the decrypted OPFS video file. |
| `localKeyUrl` | `string | null` | Clean Blob URL for the stored decryption key (if applicable). |
| `error` | `string | null` | Human-readable error message in case of failure. |
| `startDownload()` | `() => Promise<void>` | Starts a new download or resumes a paused one. |
| `pauseDownload()` | `() => Promise<void>` | Pauses the active fetch and releases locks safely. |
| `cancelDownload()` | `() => Promise<void>` | Aborts download and removes partial progress. |
| `removeOfflineVideo()`| `() => Promise<void>` | Deletes the file from OPFS and removes its record from IndexedDB. |

---

## Integration with Sibtorsh Player

Connect offline storage seamlessly with `@alirezahosseini/sibtorsh-player`:

```tsx
import React from "react";
import VideoPlayer from "@alirezahosseini/sibtorsh-player";
import { useVideoDownloader } from "@realashrafi/offline-video-core";

export default function CoursePlayerSection({ video, selectedPart }) {
  const {
    status,
    localVideoUrl,
    localKeyUrl,
  } = useVideoDownloader({
    videoId: video.id,
    part: selectedPart.part_number,
    videoUrl: selectedPart.video_url,
    keyUrl: selectedPart.key_url,
    metadata: {
      title: video.title,
      courseId: video.course_id,
    },
  });

  const videoSource = (status === "completed" && localVideoUrl) 
    ? localVideoUrl 
    : selectedPart.video_url;

  const keySource = (status === "completed" && localKeyUrl) 
    ? localKeyUrl 
    : selectedPart.key_url;

  return (
    <div className="aspect-video w-full">
      <VideoPlayer
        src={videoSource}
        keySrc={keySource}
        title={video.title}
        poster={video.poster}
      />
    </div>
  );
}
```

---

## Low-Level Services API

For custom background workers or programmatic management outside React:

### Diagnostics

```ts
import { runDiagnostics } from "@realashrafi/offline-video-core";

const report = await runDiagnostics();
// Returns: { opfs: boolean, webLocks: boolean, webCrypto: boolean, indexedDB: boolean, fullySupported: boolean }
```

### Database Service (`offlineDb`)

Tracks video metadata, download progress, and filter lookups.

```ts
import { offlineDb } from "@realashrafi/offline-video-core";

// Fetch all completed downloads for a specific course
const downloads = await offlineDb.getVideosByFilter({ courseId: "123" });

// Get raw metadata for a specific part
const item = await offlineDb.getVideo(videoId, partNumber);
```

### Storage Service (`opfsStorage`)

Interacts directly with the Origin Private File System:

```ts
import { opfsStorage } from "@realashrafi/offline-video-core";

// Write a chunk stream or blob
await opfsStorage.saveFile(filename, dataBlob);

// Read back as an in-memory Blob
const blob = await opfsStorage.getFile(filename);

// Purge physical file
await opfsStorage.deleteFile(filename);
```

### Crypto Service (`cryptoService`)

Hardware-accelerated envelope encryption with `AES-GCM`:

```ts
import { cryptoService } from "@realashrafi/offline-video-core";

// Encrypt payload before persisting
const encryptedData = await cryptoService.encryptData(rawBuffer);

// Decrypt buffer on playback initiation
const decryptedBuffer = await cryptoService.decryptData(encryptedData);
```

---

## HLS & AES-128 Offline Playback

When caching encrypted streams, the core saves both the media segments and the protected decryption key:

1. **Remote Fetch:** Downloads segments and requests the key via authorized headers or authenticated session cookies.
2. **At-Rest Protection:** Encrypts raw chunks using the device's local Master Key generated via `crypto.subtle`.
3. **Local Stream Assembly:** On demand, creates transient `blob:` URLs for the media and the key.
4. **Playback Handshake:** Feed the generated `localVideoUrl` and `localKeyUrl` directly into `@alirezahosseini/sibtorsh-player`.

---

## Concurrency & Tab Synchronization

Multiple tabs attempting to download the same video simultaneously can lead to race conditions. The core leverages the **Web Locks API** (`navigator.locks`):

```ts
navigator.locks.request(`download_${videoId}_${part}`, async (lock) => {
  // Safe single-worker execution scope
});
```

- If Tab A begins downloading, Tab B receives state updates via storage events without triggering duplicate network requests.
- When Tab A closes unexpectedly, the lock drops gracefully, permitting Tab B or subsequent sessions to resume cleanly.

---

## Browser Support & PWA Storage Quota

| Technology | Chrome / Edge / Chromium | Safari (iOS & macOS) | Firefox |
| :--- | :--- | :--- | :--- |
| **OPFS** | Supported (v86+) | Supported (v15.2+) | Supported (v111+) |
| **IndexedDB** | Supported | Supported | Supported |
| **Web Locks** | Supported (v69+) | Supported (v15.4+) | Supported (v96+) |
| **Web Crypto** | Supported | Supported | Supported |

### Requesting Persistent Storage Quota

PWAs may have storage cleared by aggressive OS heuristics when under memory pressure. Request persistent storage on user consent:

```ts
if (navigator.storage && navigator.storage.persist) {
  const isPersisted = await navigator.storage.persist();
  console.log(`Persistent storage granted: ${isPersisted}`);
}
```

---

## Troubleshooting

### `IndexedDB connected: false` / VersionMismatch
If upgrading from an earlier schema version, existing caches might cause open-request deadlocks:
1. Open DevTools -> **Application** -> **Storage** -> **IndexedDB**.
2. Delete the offline core database.
3. Refresh the page to allow `initDB()` to create fresh object stores.

### `OPFS not supported in InPrivate/Incognito mode`
Certain browsers disable OPFS access inside Private/Incognito windows to prevent persistent fingerprinting. Verify via `runDiagnostics()` and gracefully advise the user to switch to a regular browsing tab.

---

## License

Proprietary / Private package for **Sibtorsh PWA Ecosystem**. All rights reserved.
