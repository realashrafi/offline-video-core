export declare function getDirectories(): Promise<{
    videosDir: FileSystemDirectoryHandle;
    tempDir: FileSystemDirectoryHandle;
}>;
export declare function getTempDownloadedBytes(videoId: number, part: number): Promise<number>;
/** Keep a single writer open during a download; close commits the partial file on pause. */
export declare function openTempWriter(videoId: number, part: number): Promise<FileSystemWritableFileStream>;
export declare function appendTempChunk(videoId: number, part: number, chunk: Uint8Array): Promise<void>;
export declare function resetTempVideo(videoId: number, part: number): Promise<void>;
export declare function finalizeVideo(videoId: number, part: number, technicalMeta: {
    duration?: number;
    quality?: string;
    fileSize: number;
}): Promise<string>;
export declare function getVideoFile(videoId: number, part: number): Promise<File | null>;
export declare function deleteVideoAndTemp(videoId: number, part: number): Promise<void>;
