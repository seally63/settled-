// supabase/functions/submit-credential/index.ts
// Edge Function: Submit Credential for verification
// Supports three flows: API verification (Gas Safe), manual entry (NICEIC, NAPIT, OFTEC), document upload (NVQ, C&G, DBS)

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.3";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type CredentialType =
  | "gas_safe"
  | "niceic"
  | "napit"
  | "oftec"
  | "city_guilds"
  | "nvq"
  | "dbs"
  | "disclosure_scotland"
  | "other";

type VerificationMethod = "api_lookup" | "manual_entry" | "document_upload";

interface SubmitCredentialPayload {
  credential_type: CredentialType;
  verification_method: VerificationMethod;
  registration_number?: string; // For API and manual entry
  document_path?: string; // For document upload
  custom_credential_name?: string; // For "other" type
  expiry_date?: string; // Optional expiry date
}

// Validate Gas Safe licence number format
function validateGasSafeLicenceFormat(licenceNumber: string): { valid: boolean; error?: string } {
  // Gas Safe licence numbers are 6-7 digits
  if (!/^\d{6,7}$/.test(licenceNumber)) {
    return { valid: false, error: "Invalid licence number format. Gas Safe numbers are 6-7 digits." };
  }
  return { valid: true };
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response(
      JSON.stringify({ error: "Method not allowed" }),
      { status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  try {
    // Get auth token from request
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "Missing authorization header" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Create authenticated Supabase client
    const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });

    // Create admin client for updates that bypass RLS
    const supabaseAdmin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

    // Get current user
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Parse request body
    const payload: SubmitCredentialPayload = await req.json();

    // Validate credential type
    const validCredentialTypes: CredentialType[] = [
      "gas_safe", "niceic", "napit", "oftec",
      "city_guilds", "nvq", "dbs", "disclosure_scotland", "other"
    ];
    if (!validCredentialTypes.includes(payload.credential_type)) {
      return new Response(
        JSON.stringify({ error: "Invalid credential_type" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Validate verification method
    const validMethods: VerificationMethod[] = ["api_lookup", "manual_entry", "document_upload"];
    if (!validMethods.includes(payload.verification_method)) {
      return new Response(
        JSON.stringify({ error: "Invalid verification_method" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Validate based on verification method
    if (payload.verification_method === "api_lookup" || payload.verification_method === "manual_entry") {
      if (!payload.registration_number?.trim()) {
        return new Response(
          JSON.stringify({ error: "registration_number is required for this verification method" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    if (payload.verification_method === "document_upload") {
      if (!payload.document_path) {
        return new Response(
          JSON.stringify({ error: "document_path is required for document upload" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    // For "other" credential type, require custom name
    if (payload.credential_type === "other" && !payload.custom_credential_name?.trim()) {
      return new Response(
        JSON.stringify({ error: "custom_credential_name is required for 'other' credential type" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Handle Gas Safe - validate format only, submit to manual review
    let reviewStatus = "pending";

    if (payload.credential_type === "gas_safe" && payload.verification_method === "api_lookup") {
      // Validate licence number format
      const formatCheck = validateGasSafeLicenceFormat(payload.registration_number!);

      if (!formatCheck.valid) {
        return new Response(
          JSON.stringify({
            error: formatCheck.error,
            valid: false
          }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Gas Safe submissions go to manual review (admin will verify on gassaferegister.co.uk)
      reviewStatus = "pending";
    }

    // Insert submission record
    const { data: submission, error: submissionError } = await supabaseAdmin
      .from("credential_submissions")
      .insert({
        profile_id: user.id,
        credential_type: payload.credential_type,
        verification_method: payload.verification_method,
        registration_number: payload.registration_number?.trim() || null,
        document_path: payload.document_path || null,
        custom_credential_name: payload.custom_credential_name?.trim() || null,
        expiry_date: payload.expiry_date || null,
        review_status: reviewStatus,
        api_verified: false, // All credentials now go through manual review
        api_response: null,
      })
      .select()
      .single();

    if (submissionError) {
      throw submissionError;
    }

    // All credentials go to pending_review status
    const newStatus = "pending_review";

    // Update trade_verifications status
    const updateData: Record<string, unknown> = {
      profile_id: user.id,
      credentials_status: newStatus,
      updated_at: new Date().toISOString(),
    };

    const { error: updateError } = await supabaseAdmin
      .from("trade_verifications")
      .upsert(updateData, { onConflict: "profile_id" });

    if (updateError) {
      throw updateError;
    }

    // Add to review queue for manual review
    const { error: queueError } = await supabaseAdmin
      .from("verification_review_queue")
      .insert({
        profile_id: user.id,
        verification_type: "credentials",
        submission_id: submission.id,
        priority: payload.credential_type === "gas_safe" ? 2 : 1, // Gas Safe slightly higher priority
      });

    if (queueError) {
      console.warn("Failed to add to review queue:", queueError.message);
    }

    // Log status history
    const noteText = payload.credential_type === "gas_safe"
      ? `Gas Safe registration ${payload.registration_number} submitted for manual verification`
      : `Submitted ${payload.credential_type} for review`;

    await supabaseAdmin
      .from("verification_status_history")
      .insert({
        profile_id: user.id,
        verification_type: "credentials",
        old_status: "not_started",
        new_status: newStatus,
        changed_by: user.id,
        notes: noteText,
      });

    // Build response
    const response: Record<string, unknown> = {
      success: true,
      submission_id: submission.id,
      status: newStatus,
      api_verified: false,
    };

    if (payload.credential_type === "gas_safe") {
      response.message = "Gas Safe registration submitted for verification. We'll verify your details on the Gas Safe Register and notify you within 1-2 business days.";
      response.gas_safe_search_url = `https://www.gassaferegister.co.uk/find-an-engineer/`;
    } else {
      response.message = "Credential submitted for review. You will be notified within 1-2 business days.";
    }

    return new Response(
      JSON.stringify(response),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("Error:", error);
    return new Response(
      JSON.stringify({ error: error.message || "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
