import { createClient } from "jsr:@supabase/supabase-js@2";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const supabase = createClient(
  supabaseUrl,
  supabaseServiceKey
);

interface WeatherWindow {
  window: "1h" | "3h";
  rainfall_mm: number;
  rainfall_probability?: number;
  rainfall_intensity?: string;
  weather_condition?: string;
  timestamp?: string;
}

interface WeatherPayload {
  location_id?: string;
  drain_id: string;
  forecast: WeatherWindow[];
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
    const body: WeatherPayload = await req.json();

    // --------------------------------------------------
    // 1. Validate request
    // --------------------------------------------------

    if (
      !body.drain_id ||
      !Array.isArray(body.forecast) ||
      body.forecast.length === 0
    ) {
      return new Response(
        JSON.stringify({
          success: false,
          message: "drain_id and forecast are required"
        }),
        {
          status: 400,
          headers: { "Content-Type": "application/json" }
        }
      );
    }

    // --------------------------------------------------
    // 2. Verify drain exists
    // --------------------------------------------------

    const { data: drain, error: drainError } = await supabase
      .from("drains")
      .select("drain_id")
      .eq("drain_id", body.drain_id)
      .maybeSingle();

    if (drainError) {
      throw drainError;
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

    // --------------------------------------------------
    // 3. Validate forecast entries
    // --------------------------------------------------

    for (const item of body.forecast) {
      if (
        !item.window ||
        !["1h", "3h"].includes(item.window) ||
        !Number.isFinite(item.rainfall_mm)
      ) {
        return new Response(
          JSON.stringify({
            success: false,
            message: "One or more forecast entries are invalid"
          }),
          {
            status: 400,
            headers: { "Content-Type": "application/json" }
          }
        );
      }
    }

    // --------------------------------------------------
    // 4. Convert forecast data to database rows
    // --------------------------------------------------

    const rows = body.forecast.map((item) => ({
      drain_id: body.drain_id,
      timestamp: item.timestamp ?? new Date().toISOString(),
      rainfall_mm: item.rainfall_mm,
      forecast_duration_hours:
        item.window === "1h" ? 1 : 3,
      rainfall_probability:
        item.rainfall_probability ?? null,
      rainfall_intensity:
        item.rainfall_intensity ?? null,
      weather_condition:
        item.weather_condition ?? null
    }));

    // --------------------------------------------------
    // 5. Store weather data
    // --------------------------------------------------

    const { data, error: insertError } = await supabase
      .from("weather_data")
      .insert(rows)
      .select();

    if (insertError) {
      console.error(insertError);

      return new Response(
        JSON.stringify({
          success: false,
          message: "Failed to store weather data",
          error: insertError.message
        }),
        {
          status: 500,
          headers: { "Content-Type": "application/json" }
        }
      );
    }

    // --------------------------------------------------
    // 6. Automatically calculate risk
    // --------------------------------------------------

    const riskResult = await triggerRiskCalculation(
      body.drain_id
    );

    // --------------------------------------------------
    // 7. Return result
    // --------------------------------------------------

    return new Response(
      JSON.stringify({
        success: true,
        message: "Weather data stored successfully",
        drain_id: body.drain_id,
        records_received: body.forecast.length,
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