import { useState as L, useRef as z, useEffect as ie, useCallback as H } from "react";
let T;
function ee() {
  return T || (T = ce().catch((e) => {
    throw T = void 0, e;
  })), T;
}
async function ce() {
  const e = await crypto.subtle.generateKey(
    { name: "AES-GCM", length: 256 },
    !1,
    ["encrypt", "decrypt"]
  );
  return new Promise((t, a) => {
    const o = indexedDB.open("AppOfflineCrypto", 1);
    o.onupgradeneeded = () => {
      o.result.createObjectStore("keys");
    }, o.onerror = () => a(o.error), o.onblocked = () => a(new Error("Offline encryption database is blocked.")), o.onsuccess = () => {
      const s = o.result, r = s.transaction("keys", "readwrite"), d = r.objectStore("keys");
      let m = e;
      const u = d.get("license");
      u.onsuccess = () => {
        u.result ? m = u.result : d.put(e, "license");
      }, r.oncomplete = () => {
        s.close(), t(m);
      }, r.onabort = () => {
        s.close(), a(r.error ?? new Error("Cannot persist offline encryption key."));
      }, r.onerror = () => {
      };
    };
  });
}
async function le(e) {
  const t = crypto.getRandomValues(new Uint8Array(12)), a = new Uint8Array(
    await crypto.subtle.encrypt(
      { name: "AES-GCM", iv: t },
      await ee(),
      new TextEncoder().encode(e)
    )
  ), o = new Uint8Array(t.length + a.length);
  return o.set(t), o.set(a, t.length), `v1:${btoa(Array.from(o, (s) => String.fromCharCode(s)).join(""))}`;
}
async function de(e) {
  if (!e.startsWith("v1:"))
    throw new Error("Unsupported offline key format.");
  const t = Uint8Array.from(
    atob(e.slice(3)),
    (o) => o.charCodeAt(0)
  );
  if (t.length < 28) throw new Error("Invalid encrypted offline key.");
  const a = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: t.slice(0, 12) },
    await ee(),
    t.slice(12)
  );
  return new TextDecoder().decode(a);
}
const x = "offline-downloads-changed", ue = "AppOfflineDB", we = 1, K = "downloads";
let R;
async function fe() {
  return R || (R = new Promise((e, t) => {
    const a = indexedDB.open(ue, we);
    a.onupgradeneeded = () => {
      const o = a.result.createObjectStore(K, {
        keyPath: ["videoId", "part"]
      });
      for (const s of [
        "gradeId",
        "courseId",
        "tutorialId",
        "status",
        "updatedAt"
      ])
        o.createIndex(s, s);
    }, a.onerror = () => t(a.error), a.onblocked = () => t(
      new Error("Offline database upgrade is blocked by another tab.")
    ), a.onsuccess = () => {
      const o = a.result;
      o.onversionchange = () => {
        o.close(), R = void 0;
      }, e(o);
    };
  }).catch((e) => {
    throw R = void 0, e;
  })), R;
}
async function C(e, t) {
  const a = await fe();
  return new Promise((o, s) => {
    const r = a.transaction(K, e);
    let d;
    r.oncomplete = () => {
      e === "readwrite" && window.dispatchEvent(new Event(x)), o(d);
    }, r.onabort = () => s(r.error ?? new Error("Offline database transaction aborted.")), r.onerror = () => s(r.error ?? new Error("Offline database transaction failed."));
    try {
      t(r.objectStore(K), (m) => {
        d = m;
      });
    } catch (m) {
      r.abort(), s(m);
    }
  });
}
function B(e) {
  return C("readwrite", (t) => {
    t.put(e);
  });
}
function Q(e, t) {
  return C("readonly", (a, o) => {
    const s = a.get([e, t]);
    s.onsuccess = () => o(s.result ?? null);
  });
}
function ye(e) {
  return C("readonly", (t, a) => {
    const o = (e == null ? void 0 : e.gradeId) !== void 0 ? "gradeId" : (e == null ? void 0 : e.courseId) !== void 0 ? "courseId" : (e == null ? void 0 : e.tutorialId) !== void 0 ? "tutorialId" : (e == null ? void 0 : e.status) !== void 0 ? "status" : void 0, s = o ? t.index(o).getAll(e == null ? void 0 : e[o]) : t.getAll();
    s.onsuccess = () => a(
      s.result.filter(
        (r) => ((e == null ? void 0 : e.gradeId) === void 0 || r.gradeId === e.gradeId) && ((e == null ? void 0 : e.courseId) === void 0 || r.courseId === e.courseId) && ((e == null ? void 0 : e.tutorialId) === void 0 || r.tutorialId === e.tutorialId) && ((e == null ? void 0 : e.status) === void 0 || r.status === e.status)
      ).sort((r, d) => d.updatedAt - r.updatedAt)
    );
  });
}
const ve = ye;
function Ee(e, t, a, o) {
  return C("readwrite", (s) => {
    const r = s.get([e, t]);
    r.onsuccess = () => {
      const d = r.result;
      d && s.put({
        ...d,
        downloadedBytes: a,
        status: o,
        updatedAt: Date.now()
      });
    };
  });
}
function ge(e, t) {
  return C("readwrite", (a) => {
    a.delete([e, t]);
  });
}
const O = (e, t) => `chunk_${e}_${t}.part`, V = (e, t) => `video_${e}_${t}.m4v`, te = (e, t) => `manifest_${e}_${t}.json`;
async function A() {
  var o;
  if (!((o = navigator.storage) != null && o.getDirectory))
    throw new Error("Offline video storage is unavailable in this browser.");
  const e = await navigator.storage.getDirectory(), [t, a] = await Promise.all([
    e.getDirectoryHandle("videos", { create: !0 }),
    e.getDirectoryHandle("temp", { create: !0 })
  ]);
  return { videosDir: t, tempDir: a };
}
function M(e) {
  return e instanceof DOMException && e.name === "NotFoundError";
}
async function X(e, t) {
  const { tempDir: a } = await A();
  try {
    return (await (await a.getFileHandle(O(e, t))).getFile()).size;
  } catch (o) {
    if (M(o)) return 0;
    throw o;
  }
}
async function ne(e, t) {
  const { tempDir: a } = await A(), o = await a.getFileHandle(O(e, t), {
    create: !0
  }), s = (await o.getFile()).size, r = await o.createWritable({ keepExistingData: !0 });
  return await r.seek(s), r;
}
async function De(e, t, a) {
  const o = await ne(e, t);
  try {
    await o.write(a), await o.close();
  } catch (s) {
    throw await o.abort().catch(() => {
    }), s;
  }
}
async function Y(e, t) {
  const { tempDir: a } = await A();
  await F(a, O(e, t));
}
async function he(e, t, a) {
  const { videosDir: o, tempDir: s } = await A(), r = await (await s.getFileHandle(O(e, t))).getFile();
  if (r.size !== a.fileSize)
    throw new Error("Downloaded video size does not match its metadata.");
  const d = V(e, t), m = await (await o.getFileHandle(d, { create: !0 })).createWritable();
  await r.stream().pipeTo(m);
  const u = await (await o.getFileHandle(te(e, t), { create: !0 })).createWritable();
  try {
    await u.write(JSON.stringify({ videoId: e, part: t, ...a })), await u.close();
  } catch ($) {
    throw await u.abort().catch(() => {
    }), $;
  }
  return d;
}
async function Z(e, t) {
  const { videosDir: a } = await A();
  try {
    return await (await a.getFileHandle(V(e, t))).getFile();
  } catch (o) {
    if (M(o)) return null;
    throw o;
  }
}
async function F(e, t) {
  try {
    await e.removeEntry(t);
  } catch (a) {
    if (!M(a)) throw a;
  }
}
async function me(e, t) {
  const { videosDir: a, tempDir: o } = await A();
  await F(a, V(e, t)), await F(a, te(e, t)), await F(o, O(e, t));
}
function Ae({
  videoId: e,
  part: t,
  videoUrl: a,
  keyUrl: o,
  metadata: s
}) {
  const [r, d] = L(null), [m, u] = L(null), [$, P] = L(null), [oe, U] = L(null), _ = z(s);
  _.current = s;
  const p = z(null), N = z(!1), y = z(0);
  ie(() => {
    const g = ++y.current;
    let i = !0, f = null, E = 0;
    d(null), u(null), P(null), U(null);
    const k = async () => {
      const n = ++E;
      try {
        let c = await Q(e, t);
        if (!i || n !== E) return;
        (c == null ? void 0 : c.status) === "downloading" && !p.current && (c = { ...c, status: "paused" });
        let h = null, l = null;
        if ((c == null ? void 0 : c.status) === "completed") {
          if (h = await Z(e, t), !h)
            throw new Error("The offline video is missing. Download it again.");
          c.encryptedKey && (l = await de(c.encryptedKey));
        }
        if (!i || n !== E) return;
        f && URL.revokeObjectURL(f), f = h ? URL.createObjectURL(h) : null, d(c), P(f), U(l);
      } catch (c) {
        i && n === E && (f && URL.revokeObjectURL(f), f = null, P(null), U(null), u(
          c instanceof Error ? c.message : "Cannot load the offline video."
        ), d(
          (h) => h ? { ...h, status: "error" } : null
        ));
      }
    }, S = () => {
      p.current || k();
    };
    return window.addEventListener(x, S), k(), () => {
      var n;
      i = !1, y.current = g + 1, (n = p.current) == null || n.controller.abort(), window.removeEventListener(x, S), f && URL.revokeObjectURL(f);
    };
  }, [e, t]);
  const ae = H(async () => {
    if (p.current || N.current) return;
    const g = new AbortController(), i = y.current, f = (n) => {
      i === y.current && d({ ...n });
    }, E = async () => {
      var j;
      let n = null, c = null, h = null, l = 0;
      const b = () => {
        if (g.signal.aborted)
          throw new DOMException("Download paused.", "AbortError");
      };
      try {
        if (i === y.current && u(null), n = await Q(e, t), b(), (n == null ? void 0 : n.status) === "completed" && await Z(e, t))
          return;
        if (!a)
          throw new Error("A video URL is required to download this video.");
        l = await X(e, t), n = {
          ..._.current,
          ...n,
          videoId: e,
          part: t,
          title: (n == null ? void 0 : n.title) ?? ((j = _.current) == null ? void 0 : j.title) ?? "",
          fileNameInOpfs: (n == null ? void 0 : n.fileNameInOpfs) ?? "",
          fileSize: (n == null ? void 0 : n.fileSize) ?? 0,
          downloadedBytes: l,
          status: "downloading",
          updatedAt: Date.now()
        }, b(), await B(n), f(n);
        const D = new Headers();
        l > 0 && (D.set("Range", `bytes=${l}-`), n.entityTag && D.set("If-Range", n.entityTag));
        const w = await fetch(a, {
          headers: D,
          signal: g.signal
        }), G = /^bytes \*\/(\d+)$/.exec(
          w.headers.get("Content-Range") ?? ""
        );
        if (w.status === 416 && G && Number(G[1]) === l && l > 0)
          n.fileSize = l;
        else {
          if (!w.ok || !w.body)
            throw new Error(`Video download failed (${w.status}).`);
          if (w.status === 206) {
            const v = /^bytes (\d+)-(\d+)\/(\d+)$/.exec(
              w.headers.get("Content-Range") ?? ""
            );
            if (!v || Number(v[1]) !== l || Number(v[2]) >= Number(v[3]))
              throw new Error("Invalid resume response from the video server.");
            n.fileSize = Number(v[3]);
          } else if (w.status === 200)
            l && (await Y(e, t), l = 0), n.fileSize = Number(
              w.headers.get("Content-Length") ?? 0
            );
          else throw new Error("Unsupported video download response.");
          if (w.headers.get("Content-Encoding") && w.headers.get("Content-Encoding") !== "identity")
            throw new Error(
              "Compressed video responses cannot be safely resumed."
            );
          for (n.entityTag = w.headers.get("ETag") ?? w.headers.get("Last-Modified") ?? void 0, n.downloadedBytes = l, await B(n), b(), c = await ne(e, t), h = w.body.getReader(); ; ) {
            b();
            const { done: v, value: J } = await h.read();
            if (v) break;
            await c.write(J), l += J.byteLength, n.downloadedBytes = l, f(n);
          }
          await c.close(), c = null;
        }
        if (b(), n.fileSize && l !== n.fileSize)
          throw new Error(
            "The video download is incomplete. Resume to finish it."
          );
        n.fileSize = l, o && (n.encryptedKey = await le(o)), b(), n.fileNameInOpfs = await he(e, t, {
          fileSize: l
        }), b(), n.status = "completed", n.downloadedBytes = l, n.updatedAt = Date.now(), await B(n), f(n), await Y(e, t);
      } catch (D) {
        if (c) {
          try {
            await c.close();
          } catch {
            await c.abort().catch(() => {
            });
          }
          c = null;
        }
        if (n && n.status !== "completed")
          try {
            n.downloadedBytes = await X(
              e,
              t
            ), n.status = g.signal.aborted ? "paused" : "error", n.updatedAt = Date.now(), await B(n), f(n);
          } catch (w) {
            i === y.current && u(
              w instanceof Error ? w.message : "Cannot persist download progress."
            );
          }
        !g.signal.aborted && i === y.current && u(
          D instanceof Error ? D.message : "Video download failed."
        );
      } finally {
        h && (await h.cancel().catch(() => {
        }), h.releaseLock());
      }
    }, k = Promise.resolve().then(async () => {
      navigator.locks ? await navigator.locks.request(
        `offline-video-${e}-${t}`,
        { ifAvailable: !0 },
        async (n) => {
          if (!n) {
            i === y.current && u(
              "This video is being downloaded in another player or tab."
            );
            return;
          }
          await E();
        }
      ) : i === y.current && u("This browser cannot safely coordinate offline downloads.");
    }), S = { controller: g, done: k };
    p.current = S;
    try {
      await k;
    } finally {
      p.current === S && (p.current = null), i === y.current && window.dispatchEvent(new Event(x));
    }
  }, [e, t, a, o]), I = H(() => {
    var g;
    (g = p.current) == null || g.controller.abort();
  }, []), re = I, se = H(async () => {
    if (N.current) return;
    N.current = !0;
    const g = y.current;
    try {
      const i = p.current;
      if (i == null || i.controller.abort(), await (i == null ? void 0 : i.done), !navigator.locks)
        throw new Error(
          "This browser cannot safely coordinate offline downloads."
        );
      await navigator.locks.request(
        `offline-video-${e}-${t}`,
        { ifAvailable: !0 },
        async (f) => {
          if (!f)
            throw new Error(
              "Pause this video in the other player or tab before removing it."
            );
          await me(e, t), await ge(e, t);
        }
      ), g === y.current && (d(null), u(null));
    } catch (i) {
      throw g === y.current && u(
        i instanceof Error ? i.message : "Cannot remove offline video."
      ), i;
    } finally {
      N.current = !1;
    }
  }, [e, t]), W = (r == null ? void 0 : r.downloadedBytes) ?? 0, q = (r == null ? void 0 : r.fileSize) ?? 0;
  return {
    status: m ? "error" : (r == null ? void 0 : r.status) ?? "idle",
    progress: (r == null ? void 0 : r.status) === "completed" ? 100 : q > 0 ? Math.min(100, W / q * 100) : 0,
    downloadedBytes: W,
    totalBytes: q,
    startDownload: ae,
    pauseDownload: I,
    cancelDownload: re,
    removeDownload: se,
    localPlayableSrc: $,
    localDecryptedKeySrc: oe,
    error: m
  };
}
export {
  x as OFFLINE_DOWNLOADS_CHANGED,
  De as appendTempChunk,
  de as decryptKey,
  Ae as default,
  ge as deleteDownloadRecord,
  me as deleteVideoAndTemp,
  le as encryptKey,
  he as finalizeVideo,
  ye as getAllDownloads,
  A as getDirectories,
  Q as getDownloadRecord,
  ve as getDownloadsByFilter,
  X as getTempDownloadedBytes,
  Z as getVideoFile,
  fe as initDB,
  ne as openTempWriter,
  Y as resetTempVideo,
  Ee as updateDownloadProgress,
  B as upsertDownloadRecord,
  Ae as useVideoDownloader
};
