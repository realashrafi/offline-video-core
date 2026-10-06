const tempName = (videoId: number, part: number) =>
    `chunk_${videoId}_${part}.part`;
const videoName = (videoId: number, part: number) =>
    `video_${videoId}_${part}.m4v`;
const manifestName = (videoId: number, part: number) =>
    `manifest_${videoId}_${part}.json`;

export async function getDirectories(): Promise<{
  videosDir: FileSystemDirectoryHandle;
  tempDir: FileSystemDirectoryHandle;
}> {
  if (!navigator.storage?.getDirectory)
    throw new Error("Offline video storage is unavailable in this browser.");
  const root = await navigator.storage.getDirectory();
  const [videosDir, tempDir] = await Promise.all([
    root.getDirectoryHandle("videos", { create: true }),
    root.getDirectoryHandle("temp", { create: true }),
  ]);
  return { videosDir, tempDir };
}

function missing(error: unknown): boolean {
  return error instanceof DOMException && error.name === "NotFoundError";
}

export async function getTempDownloadedBytes(
    videoId: number,
    part: number,
): Promise<number> {
  const { tempDir } = await getDirectories();
  try {
    return (
        await (await tempDir.getFileHandle(tempName(videoId, part))).getFile()
    ).size;
  } catch (error) {
    if (missing(error)) return 0;
    throw error;
  }
}

/** Keep a single writer open during a download; close commits the partial file on pause. */
export async function openTempWriter(
    videoId: number,
    part: number,
): Promise<FileSystemWritableFileStream> {
  const { tempDir } = await getDirectories();
  const handle = await tempDir.getFileHandle(tempName(videoId, part), {
    create: true,
  });
  const size = (await handle.getFile()).size;
  const writer = await handle.createWritable({ keepExistingData: true });
  await writer.seek(size);
  return writer;
}

export async function appendTempChunk(
    videoId: number,
    part: number,
    chunk: Uint8Array,
): Promise<void> {
  const writer = await openTempWriter(videoId, part);
  try {
    await writer.write(chunk as unknown as BufferSource);
    await writer.close();
  } catch (error) {
    await writer.abort().catch(() => undefined);
    throw error;
  }
}

export async function resetTempVideo(
    videoId: number,
    part: number,
): Promise<void> {
  const { tempDir } = await getDirectories();
  await removeIfPresent(tempDir, tempName(videoId, part));
}

export async function finalizeVideo(
    videoId: number,
    part: number,
    technicalMeta: { duration?: number; quality?: string; fileSize: number },
): Promise<string> {
  const { videosDir, tempDir } = await getDirectories();
  const file = await (
      await tempDir.getFileHandle(tempName(videoId, part))
  ).getFile();
  if (file.size !== technicalMeta.fileSize)
    throw new Error("Downloaded video size does not match its metadata.");
  const name = videoName(videoId, part);
  const writer = await (
      await videosDir.getFileHandle(name, { create: true })
  ).createWritable();
  await file.stream().pipeTo(writer);
  const manifest = await (
      await videosDir.getFileHandle(manifestName(videoId, part), { create: true })
  ).createWritable();
  try {
    await manifest.write(JSON.stringify({ videoId, part, ...technicalMeta }));
    await manifest.close();
  } catch (error) {
    await manifest.abort().catch(() => undefined);
    throw error;
  }
  return name;
}

export async function getVideoFile(
    videoId: number,
    part: number,
): Promise<File | null> {
  const { videosDir } = await getDirectories();
  try {
    return await (
        await videosDir.getFileHandle(videoName(videoId, part))
    ).getFile();
  } catch (error) {
    if (missing(error)) return null;
    throw error;
  }
}

async function removeIfPresent(
    dir: FileSystemDirectoryHandle,
    name: string,
): Promise<void> {
  try {
    await dir.removeEntry(name);
  } catch (error) {
    if (!missing(error)) throw error;
  }
}

export async function deleteVideoAndTemp(
    videoId: number,
    part: number,
): Promise<void> {
  const { videosDir, tempDir } = await getDirectories();
  await removeIfPresent(videosDir, videoName(videoId, part));
  await removeIfPresent(videosDir, manifestName(videoId, part));
  await removeIfPresent(tempDir, tempName(videoId, part));
}
