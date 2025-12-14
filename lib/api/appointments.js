// lib/api/appointments.js
import { supabase } from "../supabase";

/**
 * Trade creates a survey appointment for a request.
 *
 * @param {string} requestId - UUID of quote_requests.id
 * @param {string|Date} scheduledAtISO - ISO string or Date for timestamptz
 * @param {string} location
 * @param {string} notes
 */
export async function createSurveyAppointment(
  requestId,
  scheduledAtISO,
  location,
  notes
) {
  const when =
    scheduledAtISO instanceof Date
      ? scheduledAtISO.toISOString()
      : String(scheduledAtISO);

  const { data, error } = await supabase.rpc(
    "rpc_trade_create_survey_appointment",
    {
      p_request_id: requestId,
      p_scheduled_at: when,
      p_location: location || null,
      p_notes: notes || null,
    }
  );

  if (error) throw error;
  const row = Array.isArray(data) ? data[0] : data;
  return row || null;
}

/**
 * Latest appointment for a given request (or null if none).
 *
 * @param {string} requestId - UUID of quote_requests.id
 */
export async function fetchLatestAppointment(requestId) {
  const { data, error } = await supabase.rpc(
    "rpc_get_latest_request_appointment",
    { p_request_id: requestId }
  );
  if (error) throw error;
  const row = Array.isArray(data) ? data[0] : data;
  return row || null;
}
