// A non-extractable per-origin key avoids embedding an app-wide secret in the bundle.
// This protects stored values at rest, not against scripts executing in this origin.
let keyPromise;
function getKey() {
    if (!keyPromise)
        keyPromise = loadKey().catch((error) => {
            keyPromise = undefined;
            throw error;
        });
    return keyPromise;
}
async function loadKey() {
    const generated = await crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
    return new Promise((resolve, reject) => {
        const request = indexedDB.open("AppOfflineCrypto", 1);
        request.onupgradeneeded = () => {
            request.result.createObjectStore("keys");
        };
        request.onerror = () => reject(request.error);
        request.onblocked = () => reject(new Error("Offline encryption database is blocked."));
        request.onsuccess = () => {
            const db = request.result;
            const tx = db.transaction("keys", "readwrite");
            const store = tx.objectStore("keys");
            let key = generated;
            const existing = store.get("license");
            existing.onsuccess = () => {
                if (existing.result)
                    key = existing.result;
                else
                    store.put(generated, "license");
            };
            tx.oncomplete = () => {
                db.close();
                resolve(key);
            };
            tx.onabort = () => {
                db.close();
                reject(tx.error ?? new Error("Cannot persist offline encryption key."));
            };
            tx.onerror = () => {
                /* onabort handles transaction failure */
            };
        };
    });
}
export async function encryptKey(plainKey) {
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const encrypted = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, await getKey(), new TextEncoder().encode(plainKey)));
    const packed = new Uint8Array(iv.length + encrypted.length);
    packed.set(iv);
    packed.set(encrypted, iv.length);
    return `v1:${btoa(Array.from(packed, (byte) => String.fromCharCode(byte)).join(""))}`;
}
export async function decryptKey(cipherText) {
    if (!cipherText.startsWith("v1:"))
        throw new Error("Unsupported offline key format.");
    const packed = Uint8Array.from(atob(cipherText.slice(3)), (character) => character.charCodeAt(0));
    if (packed.length < 28)
        throw new Error("Invalid encrypted offline key.");
    const decrypted = await crypto.subtle.decrypt({ name: "AES-GCM", iv: packed.slice(0, 12) }, await getKey(), packed.slice(12));
    return new TextDecoder().decode(decrypted);
}
