export type DownloadStatus = 'idle' | 'downloading' | 'paused' | 'completed' | 'error';

export interface OfflineVideoMetadata {
    videoId: number;
    part: number;
    title: string;
    subtitle?: string;
    fileNameInOpfs: string;
    fileSize: number;
    downloadedBytes: number;
    tutorialId?: number;
    tutorialTitle?: string;
    gradeId?: number;
    gradeTitle?: string;
    courseId?: number;
    courseTitle?: string;
    colors?: string[];
    coverUrl?: string;
    status: DownloadStatus;
    encryptedKey?: string;
    updatedAt: number;
    entityTag?: string;
}

export interface VideoDownloaderInput {
    videoId: number;
    part: number;
    videoUrl?: string;
    keyUrl?: string;
    metadata?: Partial<OfflineVideoMetadata>;
}

export interface VideoDownloaderResult {
    status: DownloadStatus;
    progress: number;
    downloadedBytes: number;
    totalBytes: number;
    startDownload: () => Promise<void>;
    pauseDownload: () => void;
    cancelDownload: () => void;
    removeDownload: () => Promise<void>;
    localPlayableSrc: string | null;
    localDecryptedKeySrc: string | null;
    error: string | null;
}

export interface DownloadsFilter {
    gradeId?: number;
    courseId?: number;
    tutorialId?: number;
    status?: DownloadStatus;
}
