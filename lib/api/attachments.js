// lib/api/attachments.js
import { supabase } from "../supabase";
import * as FileSystem from "expo-file-system/legacy";
import { decode } from "base64-arraybuffer";

const BUCKET = "request-attachments";
const TEMP_PREFIX = "tmp"; // Temporary folder for uploads before request is created

// tiny uuid v4-ish (enough for object keys)
function uuid4() {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/**
 * Link uploaded object paths to a request via RPC.
 * @param {string} requestId
 * @param {string[]} paths - array of object paths like "{request_id}/{uuid}.jpg"
 * @returns {number} number inserted
 */
export async function attachRequestImages(requestId, paths) {
  const { data, error } = await supabase.rpc("rpc_attach_request_images", {
    p_request_id: requestId,
    p_paths: paths || [],
  });
  if (error) throw error;
  // New images just landed for this request — blow away the
  // viewer-side memo so the next screen entry re-signs the full
  // current set instead of showing a stale list.
  try { requestAttachmentsCache.delete(requestId); } catch {}
  return data || 0;
}

/**
 * Returns array of object paths (no signed URLs) for a request.
 * @param {string} requestId
 * @returns {string[]}
 */
export async function listRequestImagePaths(requestId) {
  const { data, error } = await supabase.rpc("rpc_list_request_images", {
    p_request_id: requestId,
  });
  if (error) throw error;
  return Array.isArray(data) ? data : [];
}

/* ---------- Request-attachments memo cache ---------- */
//
// Signed URLs are relatively expensive to fetch (RPC + one round trip
// per batch), and the Client Request / Quote Overview screens all ask
// for the same set whenever the user re-focuses the screen. Cache them
// keyed by requestId with a TTL slightly under the signed-URL expiry
// (3600 s) so we never hand out a URL that's about to die.
//
// Cache entry: { paths: string[], urls: string[], expiresAt: ms }
//
// The quote-request FORM flow (uploadTempImage / moveTempToRequest /
// attachRequestImages) never touches this cache — it doesn't call
// getSignedUrls at all. The previews on the form come from local
// file URIs, so this memoisation is upload-safe.

const REQUEST_ATTACHMENT_TTL_MS = 3500 * 1000; // 3500 s ≈ 58 min
const requestAttachmentsCache = new Map();

/**
 * Fetch signed attachment URLs for a request, with an in-process
 * memo cache keyed by requestId. Returns `{ paths, urls }` where:
 *   - paths: raw object paths (for things like the viewer to pass back)
 *   - urls:  signed URLs, in the same order, suitable for <Image source={{ uri }}/>
 *
 * @param {string} requestId
 * @param {{ force?: boolean, expires?: number }} [opts]
 * @returns {Promise<{ paths: string[], urls: string[] }>}
 */
export async function getRequestAttachmentUrlsCached(requestId, opts = {}) {
  const { force = false, expires = 3600 } = opts;
  if (!requestId) return { paths: [], urls: [] };

  const now = Date.now();
  if (!force) {
    const hit = requestAttachmentsCache.get(requestId);
    if (hit && hit.expiresAt > now) {
      return { paths: hit.paths, urls: hit.urls };
    }
  }

  const rawPaths = await listRequestImagePaths(requestId);
  const paths = Array.isArray(rawPaths) ? rawPaths : [];

  if (!paths.length) {
    const entry = { paths, urls: [], expiresAt: now + REQUEST_ATTACHMENT_TTL_MS };
    requestAttachmentsCache.set(requestId, entry);
    return entry;
  }

  const signed = await getSignedUrls(paths, expires);
  const urls = (signed || []).map((s) => s.url).filter(Boolean);

  const entry = { paths, urls, expiresAt: now + REQUEST_ATTACHMENT_TTL_MS };
  requestAttachmentsCache.set(requestId, entry);
  return entry;
}

/**
 * Drop a single request from the attachment cache. Call after
 * attaching new images to a request so the viewer re-fetches on the
 * next screen entry.
 */
export function invalidateRequestAttachmentsCache(requestId) {
  if (!requestId) return;
  requestAttachmentsCache.delete(requestId);
}

/** Nuke the whole cache — useful on sign-out. */
export function clearRequestAttachmentsCache() {
  requestAttachmentsCache.clear();
}

/**
 * Create signed URLs for given object paths in the "request-attachments" bucket.
 *
 * @param {string[]} paths - object paths relative to bucket root
 * @param {number} expires - seconds, default 3600 (1h)
 * @returns {Array<{path:string, url:string|null, error?:string}>}
 */
export async function getSignedUrls(paths, expires = 3600) {
  if (!paths?.length) return [];

  const clean = paths.map((p) => String(p).replace(/^\//, ""));
  const storage = supabase.storage.from(BUCKET);

  // Bulk if available
  if (typeof storage.createSignedUrls === "function") {
    const { data, error } = await storage.createSignedUrls(clean, expires);
    if (error) {
      console.warn("createSignedUrls error:", error.message || error);
      return [];
    }
    return (data || []).map((row, i) => ({
      path: clean[i],
      url: row?.signedUrl || row?.signed_url || null,
      error: row?.error || null,
    }));
  }

  // Fallback loop
  const results = [];
  for (const p of clean) {
    const { data, error } = await storage.createSignedUrl(p, expires);
    results.push({
      path: p,
      url: data?.signedUrl || data?.signed_url || null,
      error: error?.message || null,
    });
  }
  return results;
}

/* ---------- Helpers for RN upload flow ---------- */

/** Quick bucket existence check (helps surface the common "bucket not found" case). */
async function ensureBucketExists() {
  const { error } = await supabase.storage.from(BUCKET).list("", { limit: 1 });
  if (error && /not found|does not exist/i.test(error.message || "")) {
    throw new Error(
      `Storage bucket "${BUCKET}" not found. ` +
        `Create it in Supabase or run SQL: INSERT INTO storage.buckets (id,name,public) VALUES ('${BUCKET}','${BUCKET}', false) ON CONFLICT (id) DO NOTHING;`
    );
  }
}

/** Normalise a local item to { uri, mime, ext, base64 } */
function normaliseLocalItem(item) {
  if (!item) return null;

  if (typeof item === "string") {
    const clean = item.split("?")[0];
    const ext = (clean.split(".").pop() || "jpg").toLowerCase();
    const mime = ext === "png" ? "image/png" : "image/jpeg";
    return { uri: item, ext, mime, base64: null };
  }

  const uri = item.uri || item.path || null;
  if (!uri) return null;

  const clean = uri.split("?")[0];
  const ext = (clean.split(".").pop() || "jpg").toLowerCase();

  const mime =
    item.mimeType ||
    item.type ||
    (ext === "png" ? "image/png" : "image/jpeg");

  const base64 = item.base64 || null;

  return { uri, ext, mime, base64 };
}

/** Build an object key inside the request folder. */
export function makeObjectPath(requestId, ext = "jpg") {
  const safeExt = String(ext || "jpg").replace(/^\./, "");
  return `${requestId}/${uuid4()}.${safeExt}`;
}

/** Build a temporary object path for uploads before request creation. */
export function makeTempObjectPath(sessionId, ext = "jpg") {
  const safeExt = String(ext || "jpg").replace(/^\./, "");
  return `${TEMP_PREFIX}/${sessionId}/${uuid4()}.${safeExt}`;
}

/** Generate a unique session ID for temporary uploads (userId_timestamp). */
export function generateUploadSessionId(userId) {
  return `${userId}_${Date.now()}`;
}

/** Convert a local image (with uri/base64) into an ArrayBuffer for Supabase upload. */
async function toArrayBuffer(meta) {
  // Prefer the base64 from ImagePicker – no extra I/O
  if (meta.base64) {
    try {
      return decode(meta.base64);
    } catch (e) {
      console.warn("decode(base64) failed:", e?.message || e);
    }
  }

  if (!meta.uri) {
    throw new Error("missing uri/base64");
  }

  // Fallback: read file as base64 via expo-file-system
  const base64 = await FileSystem.readAsStringAsync(meta.uri, {
    encoding: "base64",
  });
  return decode(base64);
}

/**
 * Upload an array of local images and then attach with the RPC.
 * Uses ArrayBuffer from base64 (Supabase's recommended RN approach).
 *
 * @param {string} requestId
 * @param {Array<string|{uri:string,base64?:string}>} localItems
 * @param {(done:number,total:number)=>void} [onProgress]
 * @returns {Promise<string[]>} successfully uploaded object paths
 */
export async function uploadRequestImages(
  requestId,
  localItems = [],
  onProgress
) {
  if (!requestId || !localItems?.length) return [];

  try {
    await ensureBucketExists();
  } catch (e) {
    console.warn(e.message);
  }

  const uploaded = [];
  const total = localItems.length;
  let done = 0;

  for (const it of localItems) {
    const meta = normaliseLocalItem(it);
    if (!meta) {
      done++;
      if (onProgress) {
        try {
          onProgress(done, total);
        } catch {}
      }
      continue;
    }

    const objectPath = makeObjectPath(requestId, meta.ext);

    try {
      const buffer = await toArrayBuffer(meta);

      const { error } = await supabase.storage
        .from(BUCKET)
        .upload(objectPath, buffer, {
          contentType: meta.mime,
          upsert: false,
        });

      if (error) {
        console.warn("storage.upload failed:", objectPath, error.message || error);
      } else {
        uploaded.push(objectPath);
      }
    } catch (err) {
      console.warn("upload exception:", objectPath, err?.message || String(err));
    }

    done++;
    if (onProgress) {
      try {
        onProgress(done, total);
      } catch {}
    }
  }

  if (uploaded.length) {
    try {
      await attachRequestImages(requestId, uploaded);
    } catch (e) {
      console.warn("attachRequestImages error:", e?.message || e);
    }
  }

  return uploaded;
}

/* ---------- Progressive Upload (Option 4) Functions ---------- */

/**
 * Upload a single image to temporary storage immediately after selection.
 * This allows uploads to happen in the background while user fills form.
 *
 * @param {string} sessionId - Unique session ID (userId_timestamp)
 * @param {string|{uri:string,base64?:string}} localItem - Local image
 * @param {(progress:number)=>void} [onProgress] - Progress callback (0-100)
 * @returns {Promise<{success:boolean, tempPath?:string, error?:string}>}
 */
export async function uploadTempImage(sessionId, localItem, onProgress) {
  if (!sessionId || !localItem) {
    return { success: false, error: "Missing sessionId or image" };
  }

  try {
    await ensureBucketExists();
  } catch (e) {
    return { success: false, error: e.message };
  }

  const meta = normaliseLocalItem(localItem);
  if (!meta) {
    return { success: false, error: "Invalid image data" };
  }

  const tempPath = makeTempObjectPath(sessionId, meta.ext);

  try {
    // Report initial progress
    if (onProgress) onProgress(10);

    const buffer = await toArrayBuffer(meta);

    // Report progress after conversion
    if (onProgress) onProgress(30);

    const { error } = await supabase.storage
      .from(BUCKET)
      .upload(tempPath, buffer, {
        contentType: meta.mime,
        upsert: false,
      });

    if (error) {
      console.warn("uploadTempImage failed:", tempPath, error.message || error);
      return { success: false, error: error.message || "Upload failed" };
    }

    // Report completion
    if (onProgress) onProgress(100);

    return { success: true, tempPath };
  } catch (err) {
    console.warn("uploadTempImage exception:", tempPath, err?.message || String(err));
    return { success: false, error: err?.message || "Upload exception" };
  }
}

/**
 * Move temporary images to the final request folder and attach them.
 * Called after the request is created.
 *
 * @param {string} requestId - The newly created request ID
 * @param {string[]} tempPaths - Array of temporary paths to move
 * @returns {Promise<{success:boolean, movedPaths:string[], errors:string[]}>}
 */
export async function moveTempToRequest(requestId, tempPaths) {
  if (!requestId || !tempPaths?.length) {
    return { success: true, movedPaths: [], errors: [] };
  }

  const movedPaths = [];
  const errors = [];
  const storage = supabase.storage.from(BUCKET);

  for (const tempPath of tempPaths) {
    try {
      // Extract extension from temp path
      const ext = tempPath.split(".").pop() || "jpg";
      const finalPath = makeObjectPath(requestId, ext);

      // Move file from temp to final location
      const { error: moveError } = await storage.move(tempPath, finalPath);

      if (moveError) {
        console.warn("move failed:", tempPath, "->", finalPath, moveError.message);
        errors.push(`Failed to move ${tempPath}: ${moveError.message}`);
        continue;
      }

      movedPaths.push(finalPath);
    } catch (err) {
      console.warn("move exception:", tempPath, err?.message || String(err));
      errors.push(`Exception moving ${tempPath}: ${err?.message || "Unknown error"}`);
    }
  }

  // Attach successfully moved images to the request
  if (movedPaths.length) {
    try {
      await attachRequestImages(requestId, movedPaths);
    } catch (e) {
      console.warn("attachRequestImages error after move:", e?.message || e);
      errors.push(`Failed to attach images: ${e?.message || "Unknown error"}`);
    }
  }

  return {
    success: errors.length === 0,
    movedPaths,
    errors,
  };
}

/**
 * Delete temporary images (cleanup on form cancel or after successful move).
 *
 * @param {string[]} tempPaths - Array of temporary paths to delete
 * @returns {Promise<void>}
 */
export async function deleteTempImages(tempPaths) {
  if (!tempPaths?.length) return;

  try {
    const { error } = await supabase.storage.from(BUCKET).remove(tempPaths);
    if (error) {
      console.warn("deleteTempImages error:", error.message || error);
    }
  } catch (e) {
    console.warn("deleteTempImages exception:", e?.message || e);
  }
}
