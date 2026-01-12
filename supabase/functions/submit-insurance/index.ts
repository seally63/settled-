// supabase/functions/submit-insurance/index.ts
// Edge Function: Submit Insurance for verification

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.3";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface SubmitInsurancePayload {
  policy_provider: string;
  policy_number: string;
  coverage_amount_pence: number; // e.g., 200000000 for £2,000,000
  policy_expiry_date: string; // ISO date string YYYY-MM-DD
  pli_document_path: string; // Storage path for PLI certificate
  has_employees: boolean;
  eli_document_path?: string; // Storage path for ELI certificate (if has_employees)
  eli_coverage_amount_pence?: number;
  eli_expiry_date?: string;
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
    const payload: SubmitInsurancePayload = await req.json();

    // Validate required fields
    const requiredFields = ["policy_provider", "policy_number", "coverage_amount_pence", "policy_expiry_date", "pli_document_path"];
    for (const field of requiredFields) {
      if (!payload[field as keyof SubmitInsurancePayload]) {
        return new Response(
          JSON.stringify({ error: `Missing required field: ${field}` }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    // Validate coverage amount (minimum £1,000,000 = 100000000 pence)
    if (payload.coverage_amount_pence < 100000000) {
      return new Response(
        JSON.stringify({ error: "Coverage amount must be at least £1,000,000" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Validate expiry date is in the future
    const expiryDate = new Date(payload.policy_expiry_date);
    if (expiryDate <= new Date()) {
      return new Response(
        JSON.stringify({ error: "Policy expiry date must be in the future" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Validate ELI if has_employees
    if (payload.has_employees) {
      if (!payload.eli_document_path) {
        return new Response(
          JSON.stringify({ error: "ELI document is required when you have employees" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      // Minimum ELI coverage is £5,000,000 = 500000000 pence
      if (payload.eli_coverage_amount_pence && payload.eli_coverage_amount_pence < 500000000) {
        return new Response(
          JSON.stringify({ error: "Employer's Liability Insurance coverage must be at least £5,000,000" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    // Insert submission record
    const { data: submission, error: submissionError } = await supabaseAdmin
      .from("insurance_submissions")
      .insert({
        profile_id: user.id,
        policy_provider: payload.policy_provider.trim(),
        policy_number: payload.policy_number.trim(),
        coverage_amount_pence: payload.coverage_amount_pence,
        policy_expiry_date: payload.policy_expiry_date,
        pli_document_path: payload.pli_document_path,
        has_employees: payload.has_employees,
        eli_document_path: payload.eli_document_path || null,
        eli_coverage_amount_pence: payload.eli_coverage_amount_pence || null,
        eli_expiry_date: payload.eli_expiry_date || null,
        review_status: "pending",
      })
      .select()
      .single();

    if (submissionError) {
      throw submissionError;
    }

    // Update trade_verifications status to pending_review
    const { error: updateError } = await supabaseAdmin
      .from("trade_verifications")
      .upsert({
        profile_id: user.id,
        insurance_status: "pending_review",
        updated_at: new Date().toISOString(),
      }, {
        onConflict: "profile_id",
      });

    if (updateError) {
      throw updateError;
    }

    // Add to review queue
    const { error: queueError } = await supabaseAdmin
      .from("verification_review_queue")
      .insert({
        profile_id: user.id,
        verification_type: "insurance",
        submission_id: submission.id,
        priority: 1,
      });

    if (queueError) {
      console.warn("Failed to add to review queue:", queueError.message);
    }

    // Log status history
    await supabaseAdmin
      .from("verification_status_history")
      .insert({
        profile_id: user.id,
        verification_type: "insurance",
        old_status: "not_started",
        new_status: "pending_review",
        changed_by: user.id,
        notes: `Submitted ${payload.policy_provider} policy for review`,
      });

    // Format coverage for response
    const formatCoverage = (pence: number) => {
      return `£${(pence / 100).toLocaleString("en-GB")}`;
    };

    return new Response(
      JSON.stringify({
        success: true,
        submission_id: submission.id,
        status: "pending_review",
        coverage: formatCoverage(payload.coverage_amount_pence),
        expiry_date: payload.policy_expiry_date,
        message: "Insurance submitted for review. You will be notified within 1-2 business days.",
      }),
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
