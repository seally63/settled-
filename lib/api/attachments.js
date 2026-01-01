// lib/api/attachments.js
import { supabase } from "../supabase";
import * as FileSystem from "expo-file-system/legacy";
import { decode } from "base64-arraybuffer";

const BUCKET = "request-attachments";

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
