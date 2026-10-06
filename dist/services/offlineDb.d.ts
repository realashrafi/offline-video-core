import { OfflineVideoMetadata, DownloadsFilter } from '../types';
export declare const OFFLINE_DOWNLOADS_CHANGED = "offline-downloads-changed";
export declare function initDB(): Promise<IDBDatabase>;
export declare function upsertDownloadRecord(record: OfflineVideoMetadata): Promise<void>;
export declare function getDownloadRecord(videoId: number, part: number): Promise<OfflineVideoMetadata | null>;
export declare function getAllDownloads(filter?: DownloadsFilter): Promise<OfflineVideoMetadata[]>;
export declare const getDownloadsByFilter: typeof getAllDownloads;
export declare function updateDownloadProgress(videoId: number, part: number, downloadedBytes: number, status: OfflineVideoMetadata["status"]): Promise<void>;
export declare function deleteDownloadRecord(videoId: number, part: number): Promise<void>;
