// supabase/functions/submit-photo-id/index.ts
// Edge Function: Submit Photo ID for verification

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.3";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type DocumentType = "passport" | "driving_licence" | "national_id";

interface SubmitPhotoIdPayload {
  document_type: DocumentType;
  document_path: string; // Storage path in verification-documents bucket
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
    const payload: SubmitPhotoIdPayload = await req.json();

    // Validate payload
    if (!payload.document_type || !payload.document_path) {
      return new Response(
        JSON.stringify({ error: "Missing required fields: document_type, document_path" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const validTypes: DocumentType[] = ["passport", "driving_licence", "national_id"];
    if (!validTypes.includes(payload.document_type)) {
      return new Response(
        JSON.stringify({ error: "Invalid document_type. Must be: passport, driving_licence, or national_id" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Verify the file exists in storage
    const { data: fileData, error: fileError } = await supabase.storage
      .from("verification-documents")
      .list(user.id, { search: payload.document_path.split("/").pop() });

    // Insert submission record
    const { data: submission, error: submissionError } = await supabaseAdmin
      .from("photo_id_submissions")
      .insert({
        profile_id: user.id,
        document_type: payload.document_type,
        document_path: payload.document_path,
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
        photo_id_status: "pending_review",
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
        verification_type: "photo_id",
        submission_id: submission.id,
        priority: 1, // Standard priority
      });

    if (queueError) {
      console.warn("Failed to add to review queue:", queueError.message);
    }

    // Log status history
    await supabaseAdmin
      .from("verification_status_history")
      .insert({
        profile_id: user.id,
        verification_type: "photo_id",
        old_status: "not_started",
        new_status: "pending_review",
        changed_by: user.id,
        notes: `Submitted ${payload.document_type} for review`,
      });

    return new Response(
      JSON.stringify({
        success: true,
        submission_id: submission.id,
        status: "pending_review",
        message: "Photo ID submitted for review. You will be notified within 24-48 hours.",
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
