// supabase/functions/run-scheduled-tasks/index.ts
// Deno Edge Function: Run scheduled tasks (expiry, reminders, cleanup)
// Call this via cron job (e.g., every 15 minutes)

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.3";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const supabaseAdmin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

interface TaskResult {
  task: string;
  success: boolean;
  result?: unknown;
  error?: string;
}

serve(async (req) => {
  const LOG_PREFIX = "[SCHEDULED-TASKS]";

  try {
    if (req.method !== "POST") {
      return new Response(JSON.stringify({ error: "Use POST" }), { status: 405 });
    }

    const body = await req.json().catch(() => ({}));
    const tasks = body.tasks ?? ["expiry", "quote_reminders", "response_nudge", "send_notifications"];

    console.log(`${LOG_PREFIX} Running tasks:`, tasks);

    const results: TaskResult[] = [];

    // 1. Run expiry checks (quotes and requests)
    if (tasks.includes("expiry")) {
      try {
        const { data, error } = await supabaseAdmin.rpc("rpc_run_expiry_checks");
        if (error) throw error;
        results.push({ task: "expiry", success: true, result: data });
        console.log(`${LOG_PREFIX} Expiry check complete:`, data);
      } catch (e) {
        const errorMsg = e instanceof Error ? e.message : String(e);
        results.push({ task: "expiry", success: false, error: errorMsg });
        console.error(`${LOG_PREFIX} Expiry check failed:`, errorMsg);
      }
    }

    // 2. Send quote expiry reminders (quotes expiring in 2 days)
    if (tasks.includes("quote_reminders")) {
      try {
        const { data: expiringQuotes, error } = await supabaseAdmin
          .rpc("rpc_get_expiring_quotes", { p_days_until_expiry: 2 });

        if (error) throw error;

        let remindersSent = 0;
        for (const quote of (expiringQuotes ?? [])) {
          // Get trade name for the notification
          const { data: trade } = await supabaseAdmin
            .from("profiles")
            .select("business_name, full_name")
            .eq("id", quote.trade_id)
            .single();

          const tradeName = trade?.business_name || trade?.full_name || "A trade";
          const amount = quote.grand_total ? `£${quote.grand_total}` : "Quote";

          // Queue notification via the fn_queue_notification function
          await supabaseAdmin.rpc("fn_queue_notification", {
            p_recipient_id: quote.client_id,
            p_notification_type: "quote_expiring",
            p_title: "Quote Expiring Soon",
            p_body: `Your quote from ${tradeName} for ${amount} expires in ${quote.days_remaining} days`,
            p_data: {
              quote_id: quote.quote_id,
              trade_id: quote.trade_id,
              days_remaining: quote.days_remaining,
            },
          });

          remindersSent++;
        }

        results.push({ task: "quote_reminders", success: true, result: { reminders_sent: remindersSent } });
        console.log(`${LOG_PREFIX} Quote reminders sent:`, remindersSent);
      } catch (e) {
        const errorMsg = e instanceof Error ? e.message : String(e);
        results.push({ task: "quote_reminders", success: false, error: errorMsg });
        console.error(`${LOG_PREFIX} Quote reminders failed:`, errorMsg);
      }
    }

    // 3. Send response time nudges to trades with pending requests
    if (tasks.includes("response_nudge")) {
      try {
        const { data, error } = await supabaseAdmin.rpc("fn_send_response_time_nudges");
        if (error) throw error;
        results.push({ task: "response_nudge", success: true, result: { nudges_sent: data } });
        console.log(`${LOG_PREFIX} Response nudges sent:`, data);
      } catch (e) {
        const errorMsg = e instanceof Error ? e.message : String(e);
        results.push({ task: "response_nudge", success: false, error: errorMsg });
        console.error(`${LOG_PREFIX} Response nudge failed:`, errorMsg);
      }
    }

    // 4. Process and send pending push notifications
    if (tasks.includes("send_notifications")) {
      try {
        // Call the send-push-notifications function
        const response = await fetch(`${SUPABASE_URL}/functions/v1/send-push-notifications`, {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${SERVICE_ROLE_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ batch_size: 100 }),
        });

        const data = await response.json();
        results.push({ task: "send_notifications", success: response.ok, result: data });
        console.log(`${LOG_PREFIX} Notifications sent:`, data);
      } catch (e) {
        const errorMsg = e instanceof Error ? e.message : String(e);
        results.push({ task: "send_notifications", success: false, error: errorMsg });
        console.error(`${LOG_PREFIX} Send notifications failed:`, errorMsg);
      }
    }

    // 5. Send appointment reminders (24 hours and 1 hour before)
    if (tasks.includes("appointment_reminders")) {
      try {
        let remindersSent = 0;

        // 24-hour reminders
        const { data: upcoming24h } = await supabaseAdmin
          .from("appointments")
          .select("id, trade_id, quote_id, request_id, scheduled_at")
          .gte("scheduled_at", new Date(Date.now() + 23 * 60 * 60 * 1000).toISOString())
          .lte("scheduled_at", new Date(Date.now() + 25 * 60 * 60 * 1000).toISOString())
          .eq("status", "scheduled");

        for (const appt of (upcoming24h ?? [])) {
          // Get client_id from quote or request
          let clientId: string | null = null;
          if (appt.quote_id) {
            const { data: quote } = await supabaseAdmin
              .from("tradify_native_app_db")
              .select("client_id")
              .eq("id", appt.quote_id)
              .single();
            clientId = quote?.client_id;
          } else if (appt.request_id) {
            const { data: request } = await supabaseAdmin
              .from("quote_requests")
              .select("requester_id")
              .eq("id", appt.request_id)
              .single();
            clientId = request?.requester_id;
          }

          const scheduledDate = new Date(appt.scheduled_at).toLocaleString("en-GB", {
            weekday: "short",
            month: "short",
            day: "numeric",
            hour: "numeric",
            minute: "2-digit",
          });

          // Notify trade
          await supabaseAdmin.rpc("fn_queue_notification", {
            p_recipient_id: appt.trade_id,
            p_notification_type: "appointment_reminder",
            p_title: "Appointment Tomorrow",
            p_body: `Reminder: You have an appointment scheduled for ${scheduledDate}`,
            p_data: { appointment_id: appt.id, scheduled_at: appt.scheduled_at },
          });

          // Notify client
          if (clientId) {
            await supabaseAdmin.rpc("fn_queue_notification", {
              p_recipient_id: clientId,
              p_notification_type: "appointment_reminder",
              p_title: "Appointment Tomorrow",
              p_body: `Reminder: You have an appointment scheduled for ${scheduledDate}`,
              p_data: { appointment_id: appt.id, scheduled_at: appt.scheduled_at },
            });
          }

          remindersSent++;
        }

        // 1-hour reminders
        const { data: upcoming1h } = await supabaseAdmin
          .from("appointments")
          .select("id, trade_id, quote_id, request_id, scheduled_at")
          .gte("scheduled_at", new Date(Date.now() + 50 * 60 * 1000).toISOString())
          .lte("scheduled_at", new Date(Date.now() + 70 * 60 * 1000).toISOString())
          .eq("status", "scheduled");

        for (const appt of (upcoming1h ?? [])) {
          let clientId: string | null = null;
          if (appt.quote_id) {
            const { data: quote } = await supabaseAdmin
              .from("tradify_native_app_db")
              .select("client_id")
              .eq("id", appt.quote_id)
              .single();
            clientId = quote?.client_id;
          } else if (appt.request_id) {
            const { data: request } = await supabaseAdmin
              .from("quote_requests")
              .select("requester_id")
              .eq("id", appt.request_id)
              .single();
            clientId = request?.requester_id;
          }

          // Notify trade
          await supabaseAdmin.rpc("fn_queue_notification", {
            p_recipient_id: appt.trade_id,
            p_notification_type: "appointment_reminder",
            p_title: "Appointment in 1 Hour",
            p_body: "Your appointment is starting soon!",
            p_data: { appointment_id: appt.id, scheduled_at: appt.scheduled_at },
          });

          // Notify client
          if (clientId) {
            await supabaseAdmin.rpc("fn_queue_notification", {
              p_recipient_id: clientId,
              p_notification_type: "appointment_reminder",
              p_title: "Appointment in 1 Hour",
              p_body: "Your appointment is starting soon!",
              p_data: { appointment_id: appt.id, scheduled_at: appt.scheduled_at },
            });
          }

          remindersSent++;
        }

        results.push({ task: "appointment_reminders", success: true, result: { reminders_sent: remindersSent } });
        console.log(`${LOG_PREFIX} Appointment reminders sent:`, remindersSent);
      } catch (e) {
        const errorMsg = e instanceof Error ? e.message : String(e);
        results.push({ task: "appointment_reminders", success: false, error: errorMsg });
        console.error(`${LOG_PREFIX} Appointment reminders failed:`, errorMsg);
      }
    }

    const response = {
      success: results.every((r) => r.success),
      tasks: results,
      run_at: new Date().toISOString(),
    };

    console.log(`${LOG_PREFIX} Complete:`, response);
    return new Response(JSON.stringify(response), { status: 200 });
  } catch (e) {
    console.error(`${LOG_PREFIX} Error:`, e);
    return new Response(JSON.stringify({ error: String(e?.message || e) }), { status: 500 });
  }
});
