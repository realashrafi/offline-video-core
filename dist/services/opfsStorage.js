const tempName = (videoId, part) => `chunk_${videoId}_${part}.part`;
const videoName = (videoId, part) => `video_${videoId}_${part}.m4v`;
const manifestName = (videoId, part) => `manifest_${videoId}_${part}.json`;
export async function getDirectories() {
    if (!navigator.storage?.getDirectory)
        throw new Error("Offline video storage is unavailable in this browser.");
    const root = await navigator.storage.getDirectory();
    const [videosDir, tempDir] = await Promise.all([
        root.getDirectoryHandle("videos", { create: true }),
        root.getDirectoryHandle("temp", { create: true }),
    ]);
    return { videosDir, tempDir };
}
function missing(error) {
    return error instanceof DOMException && error.name === "NotFoundError";
}
export async function getTempDownloadedBytes(videoId, part) {
    const { tempDir } = await getDirectories();
    try {
        return (await (await tempDir.getFileHandle(tempName(videoId, part))).getFile()).size;
    }
    catch (error) {
        if (missing(error))
            return 0;
        throw error;
    }
}
/** Keep a single writer open during a download; close commits the partial file on pause. */
export async function openTempWriter(videoId, part) {
    const { tempDir } = await getDirectories();
    const handle = await tempDir.getFileHandle(tempName(videoId, part), {
        create: true,
    });
    const size = (await handle.getFile()).size;
    const writer = await handle.createWritable({ keepExistingData: true });
    await writer.seek(size);
    return writer;
}
export async function appendTempChunk(videoId, part, chunk) {
    const writer = await openTempWriter(videoId, part);
    try {
        await writer.write(chunk);
        await writer.close();
    }
    catch (error) {
        await writer.abort().catch(() => undefined);
        throw error;
    }
}
export async function resetTempVideo(videoId, part) {
    const { tempDir } = await getDirectories();
    await removeIfPresent(tempDir, tempName(videoId, part));
}
export async function finalizeVideo(videoId, part, technicalMeta) {
    const { videosDir, tempDir } = await getDirectories();
    const file = await (await tempDir.getFileHandle(tempName(videoId, part))).getFile();
    if (file.size !== technicalMeta.fileSize)
        throw new Error("Downloaded video size does not match its metadata.");
    const name = videoName(videoId, part);
    const writer = await (await videosDir.getFileHandle(name, { create: true })).createWritable();
    await file.stream().pipeTo(writer);
    const manifest = await (await videosDir.getFileHandle(manifestName(videoId, part), { create: true })).createWritable();
    try {
        await manifest.write(JSON.stringify({ videoId, part, ...technicalMeta }));
        await manifest.close();
    }
    catch (error) {
        await manifest.abort().catch(() => undefined);
        throw error;
    }
    return name;
}
export async function getVideoFile(videoId, part) {
    const { videosDir } = await getDirectories();
    try {
        return await (await videosDir.getFileHandle(videoName(videoId, part))).getFile();
    }
    catch (error) {
        if (missing(error))
            return null;
        throw error;
    }
}
async function removeIfPresent(dir, name) {
    try {
        await dir.removeEntry(name);
    }
    catch (error) {
        if (!missing(error))
            throw error;
    }
}
export async function deleteVideoAndTemp(videoId, part) {
    const { videosDir, tempDir } = await getDirectories();
    await removeIfPresent(videosDir, videoName(videoId, part));
    await removeIfPresent(videosDir, manifestName(videoId, part));
    await removeIfPresent(tempDir, tempName(videoId, part));
}
