import { createClient } from "jsr:@supabase/supabase-js@2";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const supabase = createClient(
  supabaseUrl,
  supabaseServiceKey
);

Deno.serve(async (req: Request) => {
  // Only allow GET requests
  if (req.method !== "GET") {
    return new Response(
      JSON.stringify({
        success: false,
        message: "Only GET requests are allowed"
      }),
      {
        status: 405,
        headers: {
          "Content-Type": "application/json"
        }
      }
    );
  }

  try {
    // Read drain_id from the URL
    const url = new URL(req.url);
    const drainId = url.searchParams.get("drain_id");

    // Check that drain_id was provided
    if (!drainId) {
      return new Response(
        JSON.stringify({
          success: false,
          message: "drain_id is required"
        }),
        {
          status: 400,
          headers: {
            "Content-Type": "application/json"
          }
        }
      );
    }

    // Get the latest sensor reading for this drain
    const { data, error } = await supabase
      .from("sensor_readings")
      .select(
        "id, drain_id, timestamp, water_level_cm, flow_rate_lpm, rise_rate_cm_min, sensor_health, battery_voltage"
      )
      .eq("drain_id", drainId)
      .order("timestamp", { ascending: false })
      .limit(1)
      .single();

    // Database/query error
    if (error) {
      console.error(error);

      return new Response(
        JSON.stringify({
          success: false,
          message: "Unable to retrieve sensor reading",
          error: error.message
        }),
        {
          status: 500,
          headers: {
            "Content-Type": "application/json"
          }
        }
      );
    }

    // Success
    return new Response(
      JSON.stringify({
        success: true,
        data: data
      }),
      {
        status: 200,
        headers: {
          "Content-Type": "application/json"
        }
      }
    );

  } catch (error) {
    console.error(error);

    return new Response(
      JSON.stringify({
        success: false,
        message: "Invalid request",
        error: error instanceof Error ? error.message : "Unknown error"
      }),
      {
        status: 400,
        headers: {
          "Content-Type": "application/json"
        }
      }
    );
  }
});