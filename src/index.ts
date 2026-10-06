/**
 * @realashrafi/offline-video-core
 * نقطه ورود رسمی و اکسپورت‌های پکیج
 */

// هوک اصلی
export { useVideoDownloader, default } from './hooks/useVideoDownloader';

// متدهای دیتابیس
export {
    initDB,
    upsertDownloadRecord,
    getDownloadRecord,
    deleteDownloadRecord,
    updateDownloadProgress,
    getDownloadsByFilter,
    getAllDownloads,
    OFFLINE_DOWNLOADS_CHANGED,
} from './services/offlineDb';

// متدهای فایل‌سیستم OPFS
export {
    getVideoFile,
    finalizeVideo,
    resetTempVideo,
    deleteVideoAndTemp,
    getTempDownloadedBytes,
    openTempWriter,
    appendTempChunk,
    getDirectories,
} from './services/opfsStorage';

// متدهای رمزنگاری لایسنس
export {
    encryptKey,
    decryptKey,
} from './services/cryptoService';

// تایپ‌ها
export type {
    DownloadStatus,
    OfflineVideoMetadata,
    VideoDownloaderInput,
    VideoDownloaderResult,
    DownloadsFilter,
} from './types';
