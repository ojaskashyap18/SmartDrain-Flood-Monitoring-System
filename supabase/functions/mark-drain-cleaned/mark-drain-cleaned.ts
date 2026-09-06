import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS"
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response(
      JSON.stringify({ message: "Method not allowed" }),
      {
        status: 405,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      }
    );
  }

  try {
    const url = new URL(req.url);
    const drainId = url.searchParams.get("drain_id");

    if (!drainId) {
      return new Response(
        JSON.stringify({ message: "drain_id is required" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        }
      );
    }

    const body = await req.json().catch(() => ({}));
    const notes = body?.notes || "Routine drain cleaning";

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    const { data: risk, error: riskError } = await supabase
      .from("risk_assessments")
      .select("status, timestamp")
      .eq("drain_id", drainId)
      .order("timestamp", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (riskError) throw riskError;

    if (!risk) {
      return new Response(
        JSON.stringify({ message: "No risk assessment found for this drain" }),
        {
          status: 404,
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        }
      );
    }

    if (risk.status !== "LOW") {
      return new Response(
        JSON.stringify({
          message: "Cleaning can only be recorded when the drain is LOW risk.",
          status: risk.status
        }),
        {
          status: 409,
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        }
      );
    }

    const { data: cleaning, error: insertError } = await supabase
      .from("maintenance_records")
      .insert({
        drain_id: drainId,
        action: "CLEANING",
        action_date: new Date().toISOString(),
        notes
      })
      .select()
      .single();

    if (insertError) throw insertError;

    return new Response(
      JSON.stringify({
        message: "Cleaning recorded successfully",
        cleaning
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      }
    );
  } catch (error) {
    console.error(error);

    return new Response(
      JSON.stringify({
        message: error instanceof Error ? error.message : "Server error"
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      }
    );
  }
});
