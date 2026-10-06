import { useCallback, useEffect, useRef, useState } from "react";
import { decryptKey, encryptKey } from "../services/cryptoService";
import { deleteDownloadRecord, getDownloadRecord, OFFLINE_DOWNLOADS_CHANGED, upsertDownloadRecord, } from "../services/offlineDb";
import { deleteVideoAndTemp, finalizeVideo, getTempDownloadedBytes, getVideoFile, openTempWriter, resetTempVideo, } from "../services/opfsStorage";
export function useVideoDownloader({ videoId, part, videoUrl, keyUrl, metadata, }) {
    const [record, setRecord] = useState(null);
    const [error, setError] = useState(null);
    const [localPlayableSrc, setLocalPlayableSrc] = useState(null);
    const [localDecryptedKeySrc, setLocalDecryptedKeySrc] = useState(null);
    const metadataRef = useRef(metadata);
    metadataRef.current = metadata;
    const active = useRef(null);
    const deleting = useRef(false);
    const generation = useRef(0);
    useEffect(() => {
        const version = ++generation.current;
        let live = true;
        let blobUrl = null;
        let sequence = 0;
        setRecord(null);
        setError(null);
        setLocalPlayableSrc(null);
        setLocalDecryptedKeySrc(null);
        const refresh = async () => {
            const request = ++sequence;
            try {
                let saved = await getDownloadRecord(videoId, part);
                if (!live || request !== sequence)
                    return;
                if (saved?.status === "downloading" && !active.current)
                    saved = { ...saved, status: "paused" };
                let file = null;
                let key = null;
                if (saved?.status === "completed") {
                    file = await getVideoFile(videoId, part);
                    if (!file)
                        throw new Error("The offline video is missing. Download it again.");
                    if (saved.encryptedKey)
                        key = await decryptKey(saved.encryptedKey);
                }
                if (!live || request !== sequence)
                    return;
                if (blobUrl)
                    URL.revokeObjectURL(blobUrl);
                blobUrl = file ? URL.createObjectURL(file) : null;
                setRecord(saved);
                setLocalPlayableSrc(blobUrl);
                setLocalDecryptedKeySrc(key);
            }
            catch (reason) {
                if (live && request === sequence) {
                    if (blobUrl)
                        URL.revokeObjectURL(blobUrl);
                    blobUrl = null;
                    setLocalPlayableSrc(null);
                    setLocalDecryptedKeySrc(null);
                    setError(reason instanceof Error
                        ? reason.message
                        : "Cannot load the offline video.");
                    setRecord((previous) => previous ? { ...previous, status: "error" } : null);
                }
            }
        };
        const onChange = () => {
            if (!active.current)
                void refresh();
        };
        window.addEventListener(OFFLINE_DOWNLOADS_CHANGED, onChange);
        void refresh();
        return () => {
            live = false;
            generation.current = version + 1;
            active.current?.controller.abort();
            window.removeEventListener(OFFLINE_DOWNLOADS_CHANGED, onChange);
            if (blobUrl)
                URL.revokeObjectURL(blobUrl);
        };
    }, [videoId, part]);
    const startDownload = useCallback(async () => {
        if (active.current || deleting.current)
            return;
        const controller = new AbortController();
        const version = generation.current;
        const publish = (next) => {
            if (version === generation.current)
                setRecord({ ...next });
        };
        const execute = async () => {
            let current = null;
            let writer = null;
            let reader = null;
            let loaded = 0;
            const checkAbort = () => {
                if (controller.signal.aborted)
                    throw new DOMException("Download paused.", "AbortError");
            };
            try {
                if (version === generation.current)
                    setError(null);
                current = await getDownloadRecord(videoId, part);
                checkAbort();
                if (current?.status === "completed" &&
                    (await getVideoFile(videoId, part)))
                    return;
                if (!videoUrl)
                    throw new Error("A video URL is required to download this video.");
                loaded = await getTempDownloadedBytes(videoId, part);
                current = {
                    ...metadataRef.current,
                    ...current,
                    videoId,
                    part,
                    title: current?.title ?? metadataRef.current?.title ?? "",
                    fileNameInOpfs: current?.fileNameInOpfs ?? "",
                    fileSize: current?.fileSize ?? 0,
                    downloadedBytes: loaded,
                    status: "downloading",
                    updatedAt: Date.now(),
                };
                checkAbort();
                await upsertDownloadRecord(current);
                publish(current);
                const headers = new Headers();
                if (loaded > 0) {
                    headers.set("Range", `bytes=${loaded}-`);
                    if (current.entityTag)
                        headers.set("If-Range", current.entityTag);
                }
                const response = await fetch(videoUrl, {
                    headers,
                    signal: controller.signal,
                });
                const completeRange = /^bytes \*\/(\d+)$/.exec(response.headers.get("Content-Range") ?? "");
                const alreadyComplete = response.status === 416 &&
                    completeRange &&
                    Number(completeRange[1]) === loaded &&
                    loaded > 0;
                if (!alreadyComplete) {
                    if (!response.ok || !response.body)
                        throw new Error(`Video download failed (${response.status}).`);
                    if (response.status === 206) {
                        const range = /^bytes (\d+)-(\d+)\/(\d+)$/.exec(response.headers.get("Content-Range") ?? "");
                        if (!range ||
                            Number(range[1]) !== loaded ||
                            Number(range[2]) >= Number(range[3]))
                            throw new Error("Invalid resume response from the video server.");
                        current.fileSize = Number(range[3]);
                    }
                    else if (response.status === 200) {
                        if (loaded) {
                            await resetTempVideo(videoId, part);
                            loaded = 0;
                        }
                        current.fileSize = Number(response.headers.get("Content-Length") ?? 0);
                    }
                    else
                        throw new Error("Unsupported video download response.");
                    if (response.headers.get("Content-Encoding") &&
                        response.headers.get("Content-Encoding") !== "identity")
                        throw new Error("Compressed video responses cannot be safely resumed.");
                    current.entityTag =
                        response.headers.get("ETag") ??
                            response.headers.get("Last-Modified") ??
                            undefined;
                    current.downloadedBytes = loaded;
                    await upsertDownloadRecord(current);
                    checkAbort();
                    writer = await openTempWriter(videoId, part);
                    reader = response.body.getReader();
                    while (true) {
                        checkAbort();
                        const { done, value } = await reader.read();
                        if (done)
                            break;
                        await writer.write(value);
                        loaded += value.byteLength;
                        current.downloadedBytes = loaded;
                        publish(current);
                    }
                    await writer.close();
                    writer = null;
                }
                else
                    current.fileSize = loaded;
                checkAbort();
                if (current.fileSize && loaded !== current.fileSize)
                    throw new Error("The video download is incomplete. Resume to finish it.");
                current.fileSize = loaded;
                if (keyUrl)
                    current.encryptedKey = await encryptKey(keyUrl);
                checkAbort();
                current.fileNameInOpfs = await finalizeVideo(videoId, part, {
                    fileSize: loaded,
                });
                checkAbort();
                current.status = "completed";
                current.downloadedBytes = loaded;
                current.updatedAt = Date.now();
                await upsertDownloadRecord(current);
                publish(current);
                await resetTempVideo(videoId, part);
            }
            catch (reason) {
                if (writer) {
                    try {
                        await writer.close();
                    }
                    catch {
                        await writer.abort().catch(() => undefined);
                    }
                    writer = null;
                }
                if (current && current.status !== "completed") {
                    try {
                        current.downloadedBytes = await getTempDownloadedBytes(videoId, part);
                        current.status = controller.signal.aborted ? "paused" : "error";
                        current.updatedAt = Date.now();
                        await upsertDownloadRecord(current);
                        publish(current);
                    }
                    catch (storageError) {
                        if (version === generation.current)
                            setError(storageError instanceof Error
                                ? storageError.message
                                : "Cannot persist download progress.");
                    }
                }
                if (!controller.signal.aborted && version === generation.current)
                    setError(reason instanceof Error ? reason.message : "Video download failed.");
            }
            finally {
                if (reader) {
                    await reader.cancel().catch(() => undefined);
                    reader.releaseLock();
                }
            }
        };
        const done = Promise.resolve().then(async () => {
            if (navigator.locks) {
                await navigator.locks.request(`offline-video-${videoId}-${part}`, { ifAvailable: true }, async (lock) => {
                    if (!lock) {
                        if (version === generation.current)
                            setError("This video is being downloaded in another player or tab.");
                        return;
                    }
                    await execute();
                });
            }
            else {
                if (version === generation.current)
                    setError("This browser cannot safely coordinate offline downloads.");
            }
        });
        const operation = { controller, done };
        active.current = operation;
        try {
            await done;
        }
        finally {
            if (active.current === operation)
                active.current = null;
            if (version === generation.current)
                window.dispatchEvent(new Event(OFFLINE_DOWNLOADS_CHANGED));
        }
    }, [videoId, part, videoUrl, keyUrl]);
    const pauseDownload = useCallback(() => {
        active.current?.controller.abort();
    }, []);
    const cancelDownload = pauseDownload;
    const removeDownload = useCallback(async () => {
        if (deleting.current)
            return;
        deleting.current = true;
        const version = generation.current;
        try {
            const operation = active.current;
            operation?.controller.abort();
            await operation?.done;
            if (!navigator.locks)
                throw new Error("This browser cannot safely coordinate offline downloads.");
            await navigator.locks.request(`offline-video-${videoId}-${part}`, { ifAvailable: true }, async (lock) => {
                if (!lock)
                    throw new Error("Pause this video in the other player or tab before removing it.");
                await deleteVideoAndTemp(videoId, part);
                await deleteDownloadRecord(videoId, part);
            });
            if (version === generation.current) {
                setRecord(null);
                setError(null);
            }
        }
        catch (reason) {
            if (version === generation.current)
                setError(reason instanceof Error
                    ? reason.message
                    : "Cannot remove offline video.");
            throw reason;
        }
        finally {
            deleting.current = false;
        }
    }, [videoId, part]);
    const downloadedBytes = record?.downloadedBytes ?? 0;
    const totalBytes = record?.fileSize ?? 0;
    return {
        status: error ? "error" : (record?.status ?? "idle"),
        progress: record?.status === "completed"
            ? 100
            : totalBytes > 0
                ? Math.min(100, (downloadedBytes / totalBytes) * 100)
                : 0,
        downloadedBytes,
        totalBytes,
        startDownload,
        pauseDownload,
        cancelDownload,
        removeDownload,
        localPlayableSrc,
        localDecryptedKeySrc,
        error,
    };
}
export default useVideoDownloader;
