import { createClient } from "jsr:@supabase/supabase-js@2";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const supabase = createClient(
  supabaseUrl,
  supabaseServiceKey
);

Deno.serve(async (req: Request) => {
  // Only GET requests are allowed
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
    // -----------------------------
    // 1. Read drain_id from URL
    // -----------------------------
    const url = new URL(req.url);
    const drainId = url.searchParams.get("drain_id");

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

    // -----------------------------
    // 2. Get drain metadata
    // -----------------------------
    const { data: drain, error: drainError } = await supabase
      .from("drains")
      .select(`
        drain_id,
        name,
        diameter_cm,
        slope,
        max_capacity_cm,
        expected_flow_lpm,
        status
      `)
      .eq("drain_id", drainId)
      .maybeSingle();

    if (drainError) {
      console.error("Drain lookup error:", drainError);

      return new Response(
        JSON.stringify({
          success: false,
          message: "Failed to retrieve drain metadata",
          error: drainError.message
        }),
        {
          status: 500,
          headers: {
            "Content-Type": "application/json"
          }
        }
      );
    }

    if (!drain) {
      return new Response(
        JSON.stringify({
          success: false,
          message: `Drain ${drainId} does not exist`
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
    // 3. Get latest sensor reading
    // -----------------------------
    const { data: sensor, error: sensorError } = await supabase
      .from("sensor_readings")
      .select(`
        id,
        drain_id,
        timestamp,
        water_level_cm,
        flow_rate_lpm,
        rise_rate_cm_min,
        sensor_health,
        battery_voltage
      `)
      .eq("drain_id", drainId)
      .order("timestamp", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (sensorError) {
      console.error("Sensor lookup error:", sensorError);

      return new Response(
        JSON.stringify({
          success: false,
          message: "Failed to retrieve sensor data",
          error: sensorError.message
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
    // 4. Get latest weather record
    // -----------------------------
    const { data: weather, error: weatherError } = await supabase
      .from("weather_data")
      .select(`
        id,
        drain_id,
        timestamp,
        rainfall_mm,
        forecast_duration_hours,
        rainfall_probability,
        rainfall_intensity,
        weather_condition
      `)
      .eq("drain_id", drainId)
      .order("timestamp", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (weatherError) {
      console.error("Weather lookup error:", weatherError);

      return new Response(
        JSON.stringify({
          success: false,
          message: "Failed to retrieve weather data",
          error: weatherError.message
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
    // 5. Get latest cleaning record
    // -----------------------------
    const { data: cleaning, error: cleaningError } = await supabase
      .from("maintenance_records")
      .select(`
        action_date,
        action,
        notes
      `)
      .eq("drain_id", drainId)
      .eq("action", "CLEANING")
      .order("action_date", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (cleaningError) {
      console.error("Cleaning history error:", cleaningError);

      return new Response(
        JSON.stringify({
          success: false,
          message: "Failed to retrieve cleaning history",
          error: cleaningError.message
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
    // 6. Calculate days since cleaning
    // -----------------------------
    let daysSinceCleaning: number | null = null;

    if (cleaning?.action_date) {
      const cleaningDate = new Date(cleaning.action_date);
      const now = new Date();

      const differenceMs = now.getTime() - cleaningDate.getTime();

      daysSinceCleaning = Math.max(
        0,
        Math.floor(differenceMs / (1000 * 60 * 60 * 24))
      );
    }

    // -----------------------------
    // 7. Count previous blockages
    // -----------------------------
    const { count: blockageCount, error: blockageError } = await supabase
      .from("historical_events")
      .select("*", { count: "exact", head: true })
      .eq("drain_id", drainId)
      .eq("event_type", "BLOCKAGE");

    if (blockageError) {
      console.error("Blockage history error:", blockageError);

      return new Response(
        JSON.stringify({
          success: false,
          message: "Failed to retrieve blockage history",
          error: blockageError.message
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
    // 8. Return all risk inputs
    // -----------------------------
    return new Response(
      JSON.stringify({
        success: true,

        drain: {
          drain_id: drain.drain_id,
          name: drain.name,
          diameter_cm: drain.diameter_cm,
          slope: drain.slope,
          max_capacity_cm: drain.max_capacity_cm,
          expected_flow_lpm: drain.expected_flow_lpm,
          status: drain.status
        },

        sensor: sensor
          ? {
              timestamp: sensor.timestamp,
              water_level_cm: sensor.water_level_cm,
              flow_rate_lpm: sensor.flow_rate_lpm,
              rise_rate_cm_min: sensor.rise_rate_cm_min,
              sensor_health: sensor.sensor_health,
              battery_voltage: sensor.battery_voltage
            }
          : null,

        weather: weather
          ? {
              timestamp: weather.timestamp,
              rainfall_3h_mm:
                weather.forecast_duration_hours === 3
                  ? weather.rainfall_mm
                  : null,
              rainfall_probability: weather.rainfall_probability,
              rainfall_intensity: weather.rainfall_intensity,
              weather_condition: weather.weather_condition
            }
          : null,

        history: {
          last_cleaning_date: cleaning?.action_date ?? null,
          days_since_cleaning: daysSinceCleaning,
          past_blockage_incidents: blockageCount ?? 0
        }
      }),
      {
        status: 200,
        headers: {
          "Content-Type": "application/json"
        }
      }
    );

  } catch (error) {
    console.error("Unexpected error:", error);

    return new Response(
      JSON.stringify({
        success: false,
        message: "Unexpected server error",
        error: error instanceof Error ? error.message : "Unknown error"
      }),
      {
        status: 500,
        headers: {
          "Content-Type": "application/json"
        }
      }
    );
  }
});