// lib/api/invites.js
// Trade-invite deep-link flow.
//
// A trade is sent a web URL (https://trades.settledapp.co.uk/invite/?token=…)
// whose CTA opens this app at `tradifyapp://invite?token=<uuid>`. The app
// then runs them through: preview → register/login → accept.
//
// Two Edge Functions on the shared Supabase project back this:
//   • get-trade-invite        — PUBLIC. Returns a sanitised enquiry
//                               preview. Called with the anon key as
//                               BOTH `apikey` and `Authorization`.
//   • app-accept-trade-invite — Called with the trade's OWN JWT. Binds
//                               them to the invite, first-claim-wins.
//
// Both are deployed from the web repo's supabase/ folder — they are NOT
// in this repo. `app-accept-trade-invite` is confirmed live; its exact
// status contract (200 ok / 401 session / 404 not-found / 409 claimed /
// 410 expired) is handled below.
//
// The pending token is parked in expo-secure-store so it survives the
// register/login screens (the trade may not be signed in when they tap
// the link) and is cleared once the invite is accepted or declined.

import * as SecureStore from "expo-secure-store";
import { supabase, auth, ENV, getEnvironmentStatus } from "../supabase";

// ── Pending-token persistence ───────────────────────────────────────

const PENDING_INVITE_KEY = "settled.pendingInviteToken";

/** Park the invite token so it survives the auth round-trip. */
export async function setPendingInviteToken(token) {
  if (!token) return;
  try {
    await SecureStore.setItemAsync(PENDING_INVITE_KEY, String(token));
  } catch (e) {
    console.warn("setPendingInviteToken failed:", e?.message || e);
  }
}

/** Read the parked invite token (null if none). */
export async function getPendingInviteToken() {
  try {
    return await SecureStore.getItemAsync(PENDING_INVITE_KEY);
  } catch (e) {
    console.warn("getPendingInviteToken failed:", e?.message || e);
    return null;
  }
}

/** Clear the parked token — call on accept OR decline. */
export async function clearPendingInviteToken() {
  try {
    await SecureStore.deleteItemAsync(PENDING_INVITE_KEY);
  } catch (e) {
    console.warn("clearPendingInviteToken failed:", e?.message || e);
  }
}

// ── Active environment config ───────────────────────────────────────
//
// The app supports a production / local environment switch. Edge
// Functions have to hit whichever one is active, so resolve the
// URL + anon key off the live status rather than hard-coding.

function activeConfig() {
  let activeEnv = "production";
  try {
    const status = getEnvironmentStatus();
    if (status?.activeEnv && ENV[status.activeEnv]) {
      activeEnv = status.activeEnv;
    }
  } catch {
    /* fall back to production */
  }
  return ENV[activeEnv] || ENV.production;
}

// ── get-trade-invite ────────────────────────────────────────────────

/**
 * Fetch the sanitised enquiry preview for an invite token.
 *
 * PUBLIC function — the contract is to send the anon key as BOTH the
 * `apikey` header and the `Authorization: Bearer` header, regardless
 * of whether a trade session exists. We use a raw fetch (rather than
 * supabase.functions.invoke) precisely so the Authorization header is
 * always the anon key — invoke() would substitute a logged-in trade's
 * JWT, which isn't what the contract asks for.
 *
 * @param {string} token - the invite_token uuid from the deep link
 * @returns {Promise<{ invite: object, preview: object }>}
 */
export async function getTradeInvite(token) {
  if (!token) throw new Error("Missing invite token.");

  const { url, anonKey } = activeConfig();

  let res;
  try {
    res = await fetch(`${url}/functions/v1/get-trade-invite`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: anonKey,
        Authorization: `Bearer ${anonKey}`,
      },
      body: JSON.stringify({ token }),
    });
  } catch (e) {
    throw new Error(
      "Couldn't reach the invite service. Check your connection and try again."
    );
  }

  if (res.status === 404) {
    const err = new Error("This invite link is not valid.");
    err.code = "NOT_FOUND";
    throw err;
  }
  if (res.status === 410) {
    const err = new Error("This invite has expired.");
    err.code = "EXPIRED";
    throw err;
  }
  if (!res.ok) {
    let detail = "";
    try {
      detail = (await res.json())?.error || "";
    } catch {
      /* ignore */
    }
    throw new Error(detail || "Couldn't load this enquiry. Please try again.");
  }

  return res.json();
}

// ── app-accept-trade-invite ─────────────────────────────────────────

/**
 * Bind the signed-in trade to an invite (first-claim-wins).
 *
 * Sent with the trade's OWN access token as `Authorization: Bearer`.
 * On success returns `{ ok, request_id, conversation_token }`.
 *
 * Error contract (confirmed against the deployed function):
 *   401 → not signed in / expired session  (code SESSION_EXPIRED)
 *   404 → invite not found                 (code NOT_FOUND)
 *   409 → already accepted by another trade (code ALREADY_CLAIMED)
 *   410 → the invite expired               (code EXPIRED)
 *
 * @param {string} token
 * @param {{ business_name?: string, full_name?: string }} [extra]
 * @returns {Promise<{ ok: boolean, request_id: string, conversation_token: string }>}
 */
export async function acceptTradeInvite(token, extra = {}) {
  if (!token) throw new Error("Missing invite token.");

  const { url, anonKey } = activeConfig();

  // The trade must be signed in — we send THEIR jwt, not the anon key.
  const {
    data: { session },
  } = await auth.getSession();
  if (!session?.access_token) {
    throw new Error("You need to be signed in to accept this enquiry.");
  }

  const body = { token };
  if (extra.business_name) body.business_name = extra.business_name;
  if (extra.full_name) body.full_name = extra.full_name;

  let res;
  try {
    res = await fetch(`${url}/functions/v1/app-accept-trade-invite`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: anonKey,
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify(body),
    });
  } catch (e) {
    throw new Error(
      "Couldn't reach the accept service. Check your connection and try again."
    );
  }

  if (res.status === 401) {
    // Session died between loading the preview and tapping accept.
    const err = new Error(
      "Your session has expired. Please log in again to accept."
    );
    err.code = "SESSION_EXPIRED";
    throw err;
  }
  if (res.status === 404) {
    const err = new Error("This invite link is not valid.");
    err.code = "NOT_FOUND";
    throw err;
  }
  if (res.status === 409) {
    const err = new Error(
      "This enquiry has already been accepted by another trade."
    );
    err.code = "ALREADY_CLAIMED";
    throw err;
  }
  if (res.status === 410) {
    const err = new Error("This invite has expired.");
    err.code = "EXPIRED";
    throw err;
  }
  if (!res.ok) {
    let detail = "";
    try {
      detail = (await res.json())?.error || "";
    } catch {
      /* ignore */
    }
    throw new Error(detail || "Couldn't accept this enquiry. Please try again.");
  }

  return res.json();
}
