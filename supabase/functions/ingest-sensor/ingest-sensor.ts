import { createClient } from "jsr:@supabase/supabase-js@2";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const supabase = createClient(
  supabaseUrl,
  supabaseServiceKey
);

interface SensorPayload {
  drain_id: string;
  water_level_cm: number;
  flow_rate_lpm: number;
  rise_rate_cm_min: number;
  sensor_health?: string;
  battery_voltage?: number;
  timestamp?: string;
}

Deno.serve(async (req: Request) => {
  // Allow only POST requests
  if (req.method !== "POST") {
    return new Response(
      JSON.stringify({
        success: false,
        message: "Only POST requests are allowed"
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
    // Read JSON body
    const body: SensorPayload = await req.json();

    // -----------------------------
    // 1. Validate required fields
    // -----------------------------

    if (
      !body.drain_id ||
      body.water_level_cm === undefined ||
      body.flow_rate_lpm === undefined ||
      body.rise_rate_cm_min === undefined
    ) {
      return new Response(
        JSON.stringify({
          success: false,
          message: "Missing required sensor fields"
        }),
        {
          status: 400,
          headers: {
            "Content-Type": "application/json"
          }
        }
      );
    }

    // -----------------------------
    // 2. Validate numeric values
    // -----------------------------

    if (
      !Number.isFinite(body.water_level_cm) ||
      !Number.isFinite(body.flow_rate_lpm) ||
      !Number.isFinite(body.rise_rate_cm_min)
    ) {
      return new Response(
        JSON.stringify({
          success: false,
          message: "Sensor values must be valid numbers"
        }),
        {
          status: 400,
          headers: {
            "Content-Type": "application/json"
          }
        }
      );
    }

    // -----------------------------
    // 3. Check whether drain exists
    // -----------------------------

    const { data: drain, error: drainError } = await supabase
      .from("drains")
      .select("drain_id")
      .eq("drain_id", body.drain_id)
      .single();

    if (drainError || !drain) {
      return new Response(
        JSON.stringify({
          success: false,
          message: `Drain ${body.drain_id} does not exist`
        }),
        {
          status: 404,
          headers: {
            "Content-Type": "application/json"
          }
        }
      );
    }

    // -----------------------------
    // 4. Insert sensor reading
    // -----------------------------

    const { data: reading, error: insertError } = await supabase
      .from("sensor_readings")
      .insert({
        drain_id: body.drain_id,
        timestamp: body.timestamp ?? new Date().toISOString(),
        water_level_cm: body.water_level_cm,
        flow_rate_lpm: body.flow_rate_lpm,
        rise_rate_cm_min: body.rise_rate_cm_min,
        sensor_health: body.sensor_health ?? "GOOD",
        battery_voltage: body.battery_voltage ?? null
      })
      .select()
      .single();

    if (insertError) {
      console.error(insertError);

      return new Response(
        JSON.stringify({
          success: false,
          message: "Failed to store sensor reading",
          error: insertError.message
        }),
        {
          status: 500,
          headers: {
            "Content-Type": "application/json"
          }
        }
      );
    }

    // -----------------------------
    // 5. Success response
    // -----------------------------

    return new Response(
      JSON.stringify({
        success: true,
        message: "Sensor reading stored successfully",
        drain_id: body.drain_id,
        reading_id: reading.id
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


