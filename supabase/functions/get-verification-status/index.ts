// supabase/functions/get-verification-status/index.ts
// Edge Function: Get verification status for current user

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.3";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
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

    // Get current user
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get verification status from trade_verifications table
    const { data: verifications, error: verifyError } = await supabase
      .from("trade_verifications")
      .select("*")
      .eq("profile_id", user.id)
      .single();

    if (verifyError && verifyError.code !== "PGRST116") {
      // PGRST116 = no rows found, which is OK for new users
      throw verifyError;
    }

    // Get latest submissions for each verification type
    const [photoIdSub, insuranceSub, credentialsSub] = await Promise.all([
      supabase
        .from("photo_id_submissions")
        .select("id, document_type, review_status, submitted_at, reviewed_at, rejection_reason")
        .eq("profile_id", user.id)
        .order("submitted_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase
        .from("insurance_submissions")
        .select("id, policy_provider, coverage_amount_pence, policy_expiry_date, review_status, submitted_at, reviewed_at, rejection_reason")
        .eq("profile_id", user.id)
        .order("submitted_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase
        .from("credential_submissions")
        .select("id, credential_type, registration_number, custom_credential_name, review_status, submitted_at, reviewed_at, rejection_reason, api_verified, api_response")
        .eq("profile_id", user.id)
        .order("submitted_at", { ascending: false }),
    ]);

    // Build response
    const response = {
      photo_id: {
        status: verifications?.photo_id_status || "not_started",
        verified_at: verifications?.photo_id_verified_at || null,
        latest_submission: photoIdSub.data || null,
      },
      insurance: {
        status: verifications?.insurance_status || "not_started",
        verified_at: verifications?.insurance_verified_at || null,
        expires_at: verifications?.insurance_expires_at || null,
        latest_submission: insuranceSub.data || null,
      },
      credentials: {
        status: verifications?.credentials_status || "not_started",
        verified_at: verifications?.credentials_verified_at || null,
        submissions: credentialsSub.data || [],
      },
      overall_complete: verifications?.overall_complete || false,
    };

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
