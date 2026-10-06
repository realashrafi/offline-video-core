export const OFFLINE_DOWNLOADS_CHANGED = "offline-downloads-changed";
const DB_NAME = "AppOfflineDB";
const DB_VERSION = 1;
const STORE_NAME = "downloads";
let database;
export async function initDB() {
    if (!database) {
        database = new Promise((resolve, reject) => {
            const request = indexedDB.open(DB_NAME, DB_VERSION);
            request.onupgradeneeded = () => {
                const store = request.result.createObjectStore(STORE_NAME, {
                    keyPath: ["videoId", "part"],
                });
                for (const name of [
                    "gradeId",
                    "courseId",
                    "tutorialId",
                    "status",
                    "updatedAt",
                ]) {
                    store.createIndex(name, name);
                }
            };
            request.onerror = () => reject(request.error);
            request.onblocked = () => reject(new Error("Offline database upgrade is blocked by another tab."));
            request.onsuccess = () => {
                const db = request.result;
                db.onversionchange = () => {
                    db.close();
                    database = undefined;
                };
                resolve(db);
            };
        }).catch((error) => {
            database = undefined;
            throw error;
        });
    }
    return database;
}
async function transaction(mode, run) {
    const db = await initDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, mode);
        let value;
        tx.oncomplete = () => {
            if (mode === "readwrite")
                window.dispatchEvent(new Event(OFFLINE_DOWNLOADS_CHANGED));
            resolve(value);
        };
        tx.onabort = () => reject(tx.error ?? new Error("Offline database transaction aborted."));
        tx.onerror = () => reject(tx.error ?? new Error("Offline database transaction failed."));
        try {
            run(tx.objectStore(STORE_NAME), (next) => {
                value = next;
            });
        }
        catch (error) {
            tx.abort();
            reject(error);
        }
    });
}
export function upsertDownloadRecord(record) {
    return transaction("readwrite", (store) => {
        store.put(record);
    });
}
export function getDownloadRecord(videoId, part) {
    return transaction("readonly", (store, result) => {
        const request = store.get([videoId, part]);
        request.onsuccess = () => result(request.result ?? null);
    });
}
export function getAllDownloads(filter) {
    return transaction("readonly", (store, result) => {
        const field = filter?.gradeId !== undefined
            ? "gradeId"
            : filter?.courseId !== undefined
                ? "courseId"
                : filter?.tutorialId !== undefined
                    ? "tutorialId"
                    : filter?.status !== undefined
                        ? "status"
                        : undefined;
        const request = field
            ? store.index(field).getAll(filter?.[field])
            : store.getAll();
        request.onsuccess = () => result(request.result
            .filter((record) => (filter?.gradeId === undefined ||
            record.gradeId === filter.gradeId) &&
            (filter?.courseId === undefined ||
                record.courseId === filter.courseId) &&
            (filter?.tutorialId === undefined ||
                record.tutorialId === filter.tutorialId) &&
            (filter?.status === undefined || record.status === filter.status))
            .sort((a, b) => b.updatedAt - a.updatedAt));
    });
}
export const getDownloadsByFilter = getAllDownloads;
export function updateDownloadProgress(videoId, part, downloadedBytes, status) {
    return transaction("readwrite", (store) => {
        const request = store.get([videoId, part]);
        request.onsuccess = () => {
            const record = request.result;
            if (record)
                store.put({
                    ...record,
                    downloadedBytes,
                    status,
                    updatedAt: Date.now(),
                });
        };
    });
}
export function deleteDownloadRecord(videoId, part) {
    return transaction("readwrite", (store) => {
        store.delete([videoId, part]);
    });
}
