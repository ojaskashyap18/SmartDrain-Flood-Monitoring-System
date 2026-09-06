import { createClient } from "jsr:@supabase/supabase-js@2";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const supabase = createClient(
  supabaseUrl,
  supabaseServiceKey
);

interface SensorReading {
  timestamp: string;
  water_level_cm: number;
  flow_rate_lpm: number;
  rise_rate_cm_min: number;
  sensor_health?: string;
  battery_voltage?: number;
}

interface BatchPayload {
  drain_id: string;
  readings: SensorReading[];
}

// --------------------------------------------------
// Trigger risk calculation
// --------------------------------------------------

async function triggerRiskCalculation(drainId: string) {
  const response = await fetch(
    `${supabaseUrl}/functions/v1/calculate-risk?drain_id=${encodeURIComponent(drainId)}`,
    {
      method: "GET",
      headers: {
        "Authorization": `Bearer ${supabaseServiceKey}`,
        "apikey": supabaseServiceKey
      }
    }
  );

  const result = await response.json();

  if (!response.ok || !result.success) {
    console.error("Risk calculation failed:", result);
    return null;
  }

  return result;
}

Deno.serve(async (req: Request) => {
  // Only POST requests are allowed
  if (req.method !== "POST") {
    return new Response(
      JSON.stringify({
        success: false,
        message: "Only POST requests are allowed"
      }),
      {
        status: 405,
        headers: { "Content-Type": "application/json" }
      }
    );
  }

  try {
    // Read JSON
    const body: BatchPayload = await req.json();

    // -----------------------------
    // 1. Validate basic structure
    // -----------------------------

    if (
      !body.drain_id ||
      !Array.isArray(body.readings) ||
      body.readings.length === 0
    ) {
      return new Response(
        JSON.stringify({
          success: false,
          message: "drain_id and readings are required"
        }),
        {
          status: 400,
          headers: { "Content-Type": "application/json" }
        }
      );
    }

    // -----------------------------
    // 2. Verify drain exists
    // -----------------------------

    const { data: drain, error: drainError } = await supabase
      .from("drains")
      .select("drain_id")
      .eq("drain_id", body.drain_id)
      .maybeSingle();

    if (drainError) {
      return new Response(
        JSON.stringify({
          success: false,
          message: "Failed to verify drain",
          error: drainError.message
        }),
        {
          status: 500,
          headers: { "Content-Type": "application/json" }
        }
      );
    }

    if (!drain) {
      return new Response(
        JSON.stringify({
          success: false,
          message: `Drain ${body.drain_id} does not exist`
        }),
        {
          status: 404,
          headers: { "Content-Type": "application/json" }
        }
      );
    }

    // -----------------------------
    // 3. Validate each reading
    // -----------------------------

    for (const reading of body.readings) {
      if (
        !reading.timestamp ||
        !Number.isFinite(reading.water_level_cm) ||
        !Number.isFinite(reading.flow_rate_lpm) ||
        !Number.isFinite(reading.rise_rate_cm_min)
      ) {
        return new Response(
          JSON.stringify({
            success: false,
            message: "One or more readings contain invalid data"
          }),
          {
            status: 400,
            headers: { "Content-Type": "application/json" }
          }
        );
      }
    }

    // -----------------------------
    // 4. Prepare database rows
    // -----------------------------

    const rows = body.readings.map((reading) => ({
      drain_id: body.drain_id,
      timestamp: reading.timestamp,
      water_level_cm: reading.water_level_cm,
      flow_rate_lpm: reading.flow_rate_lpm,
      rise_rate_cm_min: reading.rise_rate_cm_min,
      sensor_health: reading.sensor_health ?? "GOOD",
      battery_voltage: reading.battery_voltage ?? null
    }));

    // -----------------------------
    // 5. Insert readings without duplicates
    // -----------------------------

    const { data, error: insertError } = await supabase
      .from("sensor_readings")
      .upsert(rows, {
        onConflict: "drain_id,timestamp",
        ignoreDuplicates: true
      })
      .select();

    if (insertError) {
      console.error(insertError);

      return new Response(
        JSON.stringify({
          success: false,
          message: "Failed to store sensor batch",
          error: insertError.message
        }),
        {
          status: 500,
          headers: { "Content-Type": "application/json" }
        }
      );
    }

    // -----------------------------
    // 6. Automatically calculate risk
    // -----------------------------

    const riskResult = await triggerRiskCalculation(
      body.drain_id
    );

    // -----------------------------
    // 7. Return result
    // -----------------------------

    return new Response(
      JSON.stringify({
        success: true,
        message: "Sensor batch stored successfully",
        drain_id: body.drain_id,
        records_received: body.readings.length,
        records_stored: data?.length ?? 0,

        risk_calculation: riskResult
          ? {
              success: true,
              overall_risk: riskResult.risk.overall_risk,
              status: riskResult.status
            }
          : {
              success: false,
              message: "Risk calculation could not be completed"
            }
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" }
      }
    );

  } catch (error) {
    console.error(error);

    return new Response(
      JSON.stringify({
        success: false,
        message: "Invalid request",
        error:
          error instanceof Error
            ? error.message
            : "Unknown error"
      }),
      {
        status: 400,
        headers: { "Content-Type": "application/json" }
      }
    );
  }
});