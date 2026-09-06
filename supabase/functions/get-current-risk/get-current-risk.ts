import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, OPTIONS"
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "GET") {
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

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    const { data: drain, error: drainError } = await supabase
      .from("drains")
      .select("*")
      .eq("drain_id", drainId)
      .single();

    if (drainError) throw drainError;

    const { data: sensor, error: sensorError } = await supabase
      .from("sensor_readings")
      .select("*")
      .eq("drain_id", drainId)
      .order("timestamp", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (sensorError) throw sensorError;

    const { data: weatherRows, error: weatherError } = await supabase
      .from("weather_data")
      .select("*")
      .eq("drain_id", drainId)
      .in("forecast_duration_hours", [1, 3])
      .order("timestamp", { ascending: false });

    if (weatherError) throw weatherError;

    const weather1h =
      weatherRows?.find(
        (row) => Number(row.forecast_duration_hours) === 1
      ) ?? null;

    const weather3h =
      weatherRows?.find(
        (row) => Number(row.forecast_duration_hours) === 3
      ) ?? null;

    const { data: risk, error: riskError } = await supabase
      .from("risk_assessments")
      .select("*")
      .eq("drain_id", drainId)
      .order("timestamp", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (riskError) throw riskError;

    const { data: maintenanceHistory, error: maintenanceError } =
      await supabase
        .from("maintenance_records")
        .select("id, action, action_date, notes")
        .eq("drain_id", drainId)
        .order("action_date", { ascending: false });

    if (maintenanceError) throw maintenanceError;

    const { data: blockageHistory, error: blockageError } =
      await supabase
        .from("historical_events")
        .select("id, event_date, description")
        .eq("drain_id", drainId)
        .eq("event_type", "BLOCKAGE")
        .order("event_date", { ascending: false });

    if (blockageError) throw blockageError;

    return new Response(
      JSON.stringify({
        drain,
        sensor,
        weather: {
          "1h": weather1h,
          "3h": weather3h
        },
        risk,
        history: {
          last_cleaning_date:
            maintenanceHistory?.[0]?.action_date ?? null,
          maintenance_history: maintenanceHistory ?? [],
          past_blockage_incidents: blockageHistory?.length ?? 0,
          blockage_history: blockageHistory ?? []
        }
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
