// supabase/functions/send-push-notifications/index.ts
// Deno Edge Function: Process and send push notifications via Expo Push API

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.3";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";

const supabaseAdmin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

interface ExpoNotification {
  to: string;
  title: string;
  body: string;
  data?: Record<string, unknown>;
  sound?: string;
  badge?: number;
  channelId?: string;
  priority?: "default" | "normal" | "high";
  ttl?: number;
}

interface NotificationRecord {
  id: string;
  push_token: string;
  title: string;
  body: string;
  data: Record<string, unknown>;
  notification_type: string;
}

// Map notification type to Android channel ID
function getChannelId(type: string): string {
  switch (type) {
    case "new_message":
      return "messages";
    case "new_request":
    case "direct_request":
    case "quote_sent":
    case "quote_accepted":
    case "quote_declined":
    case "quote_expiring":
    case "quote_expired":
    case "request_accepted":
    case "request_declined":
      return "quotes";
    case "appointment_scheduled":
    case "appointment_reminder":
    case "work_completed":
      return "reminders";
    default:
      return "default";
  }
}

// Map notification type to priority
function getPriority(type: string): "default" | "normal" | "high" {
  switch (type) {
    case "new_message":
    case "direct_request":
    case "quote_accepted":
    case "appointment_reminder":
      return "high";
    case "new_request":
    case "quote_sent":
    case "appointment_scheduled":
      return "normal";
    default:
      return "default";
  }
}

// Send notifications to Expo Push API
async function sendToExpo(notifications: ExpoNotification[]): Promise<{
  success: string[];
  failed: string[];
  errors: Record<string, string>;
}> {
  const result = {
    success: [] as string[],
    failed: [] as string[],
    errors: {} as Record<string, string>,
  };

  if (notifications.length === 0) {
    return result;
  }

  try {
    const response = await fetch(EXPO_PUSH_URL, {
      method: "POST",
      headers: {
        "Accept": "application/json",
        "Accept-Encoding": "gzip, deflate",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(notifications),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`Expo API error: ${response.status} - ${errorText}`);
      // Mark all as failed
      notifications.forEach((n) => {
        result.failed.push(n.to);
        result.errors[n.to] = `HTTP ${response.status}: ${errorText}`;
      });
      return result;
    }

    const data = await response.json();

    // Process response for each notification
    if (data.data && Array.isArray(data.data)) {
      data.data.forEach((ticket: { status: string; message?: string; details?: { error?: string } }, index: number) => {
        const token = notifications[index]?.to;
        if (ticket.status === "ok") {
          result.success.push(token);
        } else {
          result.failed.push(token);
          result.errors[token] = ticket.message || ticket.details?.error || "Unknown error";
        }
      });
    }

    return result;
  } catch (error) {
    console.error("Error sending to Expo:", error);
    notifications.forEach((n) => {
      result.failed.push(n.to);
      result.errors[n.to] = String(error);
    });
    return result;
  }
}

serve(async (req) => {
  const LOG_PREFIX = "[SEND-PUSH]";
  // Require CRON_SECRET from the deploy environment. The previous
  // `|| "tradify-cron-secret-2024"` fallback embedded a guessable
  // secret in the public repo, defeating the purpose of the cron
  // auth path. Fail closed if the env var isn't set so the function
  // can't be invoked with the compiled-in value.
  const CRON_SECRET = Deno.env.get("CRON_SECRET");
  if (!CRON_SECRET) {
    console.error(`${LOG_PREFIX} CRON_SECRET env var is not set`);
    return new Response(
      JSON.stringify({ error: "Server misconfigured" }),
      { status: 500 }
    );
  }

  try {
    if (req.method !== "POST") {
      return new Response(JSON.stringify({ error: "Use POST" }), { status: 405 });
    }

    // Allow service role auth OR cron secret header
    const authHeader = req.headers.get("Authorization") || "";
    const cronHeader = req.headers.get("x-cron-secret") || "";

    const hasServiceRole = authHeader.includes(SERVICE_ROLE_KEY);
    const hasCronSecret = cronHeader === CRON_SECRET;
    const hasAnonKey = authHeader.length > 20; // Basic check for any auth header

    if (!hasServiceRole && !hasCronSecret && !hasAnonKey) {
      console.log(`${LOG_PREFIX} Unauthorized request`);
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const batchSize = Math.min(body.batch_size ?? 100, 100); // Max 100 per batch (Expo limit)

    console.log(`${LOG_PREFIX} Processing up to ${batchSize} pending notifications`);

    // 1) Fetch pending notifications from the database
    const { data: pendingNotifications, error: fetchErr } = await supabaseAdmin
      .rpc("rpc_get_pending_notifications", { p_limit: batchSize });

    if (fetchErr) {
      console.error(`${LOG_PREFIX} Error fetching notifications:`, fetchErr);
      return new Response(JSON.stringify({ error: fetchErr.message }), { status: 500 });
    }

    const notifications = (pendingNotifications ?? []) as NotificationRecord[];

    if (notifications.length === 0) {
      console.log(`${LOG_PREFIX} No pending notifications`);
      return new Response(JSON.stringify({ processed: 0, sent: 0, failed: 0 }), { status: 200 });
    }

    console.log(`${LOG_PREFIX} Found ${notifications.length} pending notifications`);

    // 2) Format notifications for Expo
    const expoNotifications: ExpoNotification[] = notifications
      .filter((n) => n.push_token?.startsWith("ExponentPushToken["))
      .map((n) => ({
        to: n.push_token,
        title: n.title,
        body: n.body || "",
        data: {
          ...n.data,
          type: n.notification_type,
          notification_id: n.id,
        },
        sound: "default",
        channelId: getChannelId(n.notification_type),
        priority: getPriority(n.notification_type),
        ttl: 86400, // 24 hours
      }));

    if (expoNotifications.length === 0) {
      console.log(`${LOG_PREFIX} No valid Expo push tokens found`);
      // Mark all as failed (invalid tokens)
      const invalidIds = notifications.map((n) => n.id);
      await supabaseAdmin.rpc("rpc_mark_notifications_sent", {
        p_ids: invalidIds,
        p_status: "failed",
        p_error: "Invalid push token format",
      });
      return new Response(
        JSON.stringify({ processed: notifications.length, sent: 0, failed: notifications.length }),
        { status: 200 }
      );
    }

    // 3) Send to Expo
    const result = await sendToExpo(expoNotifications);

    console.log(`${LOG_PREFIX} Expo result: ${result.success.length} sent, ${result.failed.length} failed`);

    // 4) Update notification statuses in database
    // Map tokens back to notification IDs
    const tokenToId = new Map(notifications.map((n) => [n.push_token, n.id]));

    const successIds = result.success.map((token) => tokenToId.get(token)).filter(Boolean) as string[];
    const failedIds = result.failed.map((token) => tokenToId.get(token)).filter(Boolean) as string[];

    // Mark successful notifications
    if (successIds.length > 0) {
      await supabaseAdmin.rpc("rpc_mark_notifications_sent", {
        p_ids: successIds,
        p_status: "sent",
      });
    }

    // Mark failed notifications with error messages
    if (failedIds.length > 0) {
      // Get first error message for the batch
      const errorMsg = Object.values(result.errors)[0] || "Unknown error";
      await supabaseAdmin.rpc("rpc_mark_notifications_sent", {
        p_ids: failedIds,
        p_status: "failed",
        p_error: errorMsg,
      });
    }

    const response = {
      processed: notifications.length,
      sent: result.success.length,
      failed: result.failed.length,
      errors: Object.keys(result.errors).length > 0 ? result.errors : undefined,
    };

    console.log(`${LOG_PREFIX} Complete:`, response);
    return new Response(JSON.stringify(response), { status: 200 });
  } catch (e) {
    console.error(`${LOG_PREFIX} Error:`, e);
    return new Response(JSON.stringify({ error: String(e?.message || e) }), { status: 500 });
  }
});
