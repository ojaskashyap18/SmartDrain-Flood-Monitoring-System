import { createClient } from "jsr:@supabase/supabase-js@2";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const supabase = createClient(
  supabaseUrl,
  supabaseServiceKey
);

Deno.serve(async (req: Request) => {
  if (req.method !== "GET" && req.method !== "POST") {
    return new Response(
      JSON.stringify({
        success: false,
        message: "Only GET or POST requests are allowed"
      }),
      {
        status: 405,
        headers: { "Content-Type": "application/json" }
      }
    );
  }

  try {
    const url = new URL(req.url);
    const drainId =
      url.searchParams.get("drain_id") ??
      (req.method === "POST" ? (await req.json()).drain_id : null);

    if (!drainId) {
      return new Response(
        JSON.stringify({
          success: false,
          message: "drain_id is required"
        }),
        {
          status: 400,
          headers: { "Content-Type": "application/json" }
        }
      );
    }

    // --------------------------------------------------
    // 1. Get drain metadata
    // --------------------------------------------------

    const { data: drain, error: drainError } = await supabase
      .from("drains")
      .select(
        "drain_id, name, max_capacity_cm, expected_flow_lpm, status"
      )
      .eq("drain_id", drainId)
      .maybeSingle();

    if (drainError) {
      throw drainError;
    }

    if (!drain) {
      return new Response(
        JSON.stringify({
          success: false,
          message: `Drain ${drainId} does not exist`
        }),
        {
          status: 404,
          headers: { "Content-Type": "application/json" }
        }
      );
    }

    // --------------------------------------------------
    // 2. Get latest sensor reading
    // --------------------------------------------------

    const { data: sensor, error: sensorError } = await supabase
      .from("sensor_readings")
      .select(
        "timestamp, water_level_cm, flow_rate_lpm, rise_rate_cm_min, sensor_health, battery_voltage"
      )
      .eq("drain_id", drainId)
      .order("timestamp", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (sensorError) {
      throw sensorError;
    }

    if (!sensor) {
      return new Response(
        JSON.stringify({
          success: false,
          message: "No sensor reading found"
        }),
        {
          status: 404,
          headers: { "Content-Type": "application/json" }
        }
      );
    }

    // --------------------------------------------------
    // 3. Get latest 3-hour weather forecast
    // --------------------------------------------------

    const { data: weather, error: weatherError } = await supabase
      .from("weather_data")
      .select(
        "timestamp, rainfall_mm, forecast_duration_hours, rainfall_probability, rainfall_intensity, weather_condition"
      )
      .eq("drain_id", drainId)
      .eq("forecast_duration_hours", 3)
      .order("timestamp", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (weatherError) {
      throw weatherError;
    }

    if (!weather) {
      return new Response(
        JSON.stringify({
          success: false,
          message: "No 3-hour weather data found"
        }),
        {
          status: 404,
          headers: { "Content-Type": "application/json" }
        }
      );
    }

    // --------------------------------------------------
    // 4. Get latest cleaning record
    // --------------------------------------------------

    const { data: cleaning, error: cleaningError } = await supabase
      .from("maintenance_records")
      .select("action_date, action")
      .eq("drain_id", drainId)
      .order("action_date", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (cleaningError) {
      throw cleaningError;
    }

    if (!cleaning) {
      return new Response(
        JSON.stringify({
          success: false,
          message: "No cleaning history found"
        }),
        {
          status: 404,
          headers: { "Content-Type": "application/json" }
        }
      );
    }

    // --------------------------------------------------
    // 5. Count blockage incidents
    // --------------------------------------------------

    const { count: blockageCount, error: blockageError } =
      await supabase
        .from("historical_events")
        .select("id", { count: "exact", head: true })
        .eq("drain_id", drainId)
        .eq("event_type", "BLOCKAGE");

    if (blockageError) {
      throw blockageError;
    }

    const pastBlockageIncidents = blockageCount ?? 0;

    // --------------------------------------------------
    // 6. Calculate days since cleaning
    // --------------------------------------------------

    const now = new Date();
    const cleaningDate = new Date(cleaning.action_date);

    const daysSinceCleaning = Math.max(
      0,
      Math.floor(
        (now.getTime() - cleaningDate.getTime()) /
          (1000 * 60 * 60 * 24)
      )
    );

    // --------------------------------------------------
    // 7. Normalize risk factors
    // --------------------------------------------------

    // WLF
    const wlf = Math.min(
      100,
      Math.max(
        0,
        (sensor.water_level_cm / drain.max_capacity_cm) * 100
      )
    );

    // LRF
    const maxExpectedRiseRate = 3;

    const lrf = Math.min(
      100,
      Math.max(
        0,
        (sensor.rise_rate_cm_min / maxExpectedRiseRate) * 100
      )
    );

    // FDF
    const fdf = Math.min(
      100,
      Math.max(
        0,
        ((drain.expected_flow_lpm - sensor.flow_rate_lpm) /
          drain.expected_flow_lpm) *
          100
      )
    );

    // FRF
    const rainfallThreshold = 150;

    const frf = Math.min(
      100,
      Math.max(
        0,
        (weather.rainfall_mm / rainfallThreshold) * 100
      )
    );

    // HRF
    const cleaningRisk = Math.min(
      100,
      (daysSinceCleaning / 90) * 100
    );

    const blockageRisk = Math.min(
      100,
      (pastBlockageIncidents / 5) * 100
    );

    const hrf =
      0.6 * cleaningRisk +
      0.4 * blockageRisk;

    // --------------------------------------------------
    // 8. Calculate Blockage Risk
    // --------------------------------------------------

    const blockageRiskScore =
      0.45 * fdf +
      0.20 * lrf +
      0.25 * hrf +
      0.10 * frf;

    // --------------------------------------------------
    // 9. Calculate Overflow Risk
    // --------------------------------------------------

    const overflowRiskScore =
      0.35 * wlf +
      0.30 * lrf +
      0.25 * frf +
      0.10 * hrf;

    // --------------------------------------------------
    // 10. Calculate Overall Risk
    // --------------------------------------------------

    const overallRisk =
      100 *
      (
        1 -
        (1 - blockageRiskScore / 100) *
        (1 - overflowRiskScore / 100)
      );

    // --------------------------------------------------
    // 11. Determine status and action
    // --------------------------------------------------

    let status: string;
    let maintenancePriority: string;

    if (overallRisk < 30) {
      status = "LOW";
      maintenancePriority = "Monitor";
    } else if (overallRisk < 60) {
      status = "MEDIUM";
      maintenancePriority = "Inspect";
    } else if (overallRisk < 80) {
      status = "HIGH";
      maintenancePriority = "Prioritise cleaning";
    } else {
      status = "CRITICAL";
      maintenancePriority = "Immediate intervention";
    }

    // --------------------------------------------------
    // 12. Store risk assessment
    // --------------------------------------------------

    const { data: assessment, error: insertError } = await supabase
      .from("risk_assessments")
      .insert({
        drain_id: drainId,
        timestamp: now.toISOString(),
        wlf: Number(wlf.toFixed(2)),
        lrf: Number(lrf.toFixed(2)),
        fdf: Number(fdf.toFixed(2)),
        frf: Number(frf.toFixed(2)),
        hrf: Number(hrf.toFixed(2)),
        blockage_risk: Number(
          blockageRiskScore.toFixed(2)
        ),
        overflow_risk: Number(
          overflowRiskScore.toFixed(2)
        ),
        overall_risk: Number(overallRisk.toFixed(2)),
        status,
        maintenance_priority: maintenancePriority
      })
      .select()
      .single();

    if (insertError) {
      throw insertError;
    }

    // --------------------------------------------------
    // 13. Return result
    // --------------------------------------------------

    return new Response(
      JSON.stringify({
        success: true,
        drain_id: drainId,

        factors: {
          wlf: Number(wlf.toFixed(2)),
          lrf: Number(lrf.toFixed(2)),
          fdf: Number(fdf.toFixed(2)),
          frf: Number(frf.toFixed(2)),
          hrf: Number(hrf.toFixed(2))
        },

        risk: {
          blockage_risk: Number(
            blockageRiskScore.toFixed(2)
          ),
          overflow_risk: Number(
            overflowRiskScore.toFixed(2)
          ),
          overall_risk: Number(
            overallRisk.toFixed(2)
          )
        },

        status,
        maintenance_priority: maintenancePriority,

        history: {
          days_since_cleaning: daysSinceCleaning,
          past_blockage_incidents:
            pastBlockageIncidents
        },

        assessment_id: assessment.id
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
        message: "Risk calculation failed",
        error:
          error instanceof Error
            ? error.message
            : "Unknown error"
      }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" }
      }
    );
  }
});