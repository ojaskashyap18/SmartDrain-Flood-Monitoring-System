// weatherService.js
// Live weather service for SmartDrain using Open-Meteo.
// The UI continues to receive the same data structure as before.

const REFRESH_INTERVAL_SECONDS = 900; // 15 minutes

const WEATHER_API_URL = "https://api.open-meteo.com/v1/forecast";

const LOCATIONS = [
  {
    location_id: "LOC-01",
    name: "Katpadi Junction",
    lat: 12.9698,
    lng: 79.1559,
  },
  {
    location_id: "LOC-02",
    name: "VIT Main Gate",
    lat: 12.9692,
    lng: 79.1559,
  },
  {
    location_id: "LOC-03",
    name: "Gandhi Nagar",
    lat: 12.9584,
    lng: 79.1325,
  },
  {
    location_id: "LOC-04",
    name: "Sathuvachari",
    lat: 12.9483,
    lng: 79.1198,
  },
];

const INTENSITY_BANDS = [
  { max: 0, intensity: "none" },
  { max: 5, intensity: "light" },
  { max: 15, intensity: "moderate" },
  { max: 30, intensity: "heavy" },
  { max: Infinity, intensity: "extreme" },
];

function intensityFor(mm) {
  return INTENSITY_BANDS.find((band) => mm <= band.max).intensity;
}

// ---------------------------------------------------------
// Manual override store
// ---------------------------------------------------------

const overrides = new Map();

function overrideKey(locationId, windowLabel) {
  return `${locationId}::${windowLabel}`;
}

export function setManualOverride(
  locationId,
  windowLabel,
  rainfallMm,
  probabilityPercent
) {
  overrides.set(overrideKey(locationId, windowLabel), {
    rainfall_mm: rainfallMm,
    probability_percent:
      probabilityPercent != null
        ? probabilityPercent
        : Math.min(95, Math.round(rainfallMm * 3)),
  });
}

export function clearManualOverride(locationId, windowLabel) {
  overrides.delete(overrideKey(locationId, windowLabel));
}

export function clearAllOverrides() {
  overrides.clear();
}

export function isManuallyOverridden(locationId, windowLabel) {
  return overrides.has(overrideKey(locationId, windowLabel));
}

// ---------------------------------------------------------
// Apply manual override to live data
// ---------------------------------------------------------

function applyOverride(locationId, window) {
  const override = overrides.get(
    overrideKey(locationId, window.window_label)
  );

  if (!override) {
    return window;
  }

  return {
    ...window,
    rainfall_mm: override.rainfall_mm,
    intensity: intensityFor(override.rainfall_mm),
    probability_percent: override.probability_percent,
    is_manual: true,
  };
}

// ---------------------------------------------------------
// Fetch weather for one location
// ---------------------------------------------------------

async function fetchLocationWeather(location) {
  const params = new URLSearchParams({
    latitude: location.lat,
    longitude: location.lng,

    hourly: "precipitation,precipitation_probability",

    // We only need the next few hours.
    forecast_hours: "4",

    // Vellore/India timezone.
    timezone: "Asia/Kolkata",
  });

  const response = await fetch(`${WEATHER_API_URL}?${params}`);

  if (!response.ok) {
    throw new Error(
      `Weather API error for ${location.name}: ${response.status}`
    );
  }

  const data = await response.json();

  if (
    !data.hourly ||
    !data.hourly.time ||
    !data.hourly.precipitation
  ) {
    throw new Error(`Invalid weather data received for ${location.name}`);
  }

  return data;
}

// ---------------------------------------------------------
// Convert Open-Meteo data into SmartDrain format
// ---------------------------------------------------------

function buildLocationForecast(location, weatherData, fetchedAt) {
  const times = weatherData.hourly.time;
  const precipitation = weatherData.hourly.precipitation;
  const probability =
    weatherData.hourly.precipitation_probability || [];

  // First forecast hour
  const rainfall1h = Number(precipitation[0] || 0);

  // Next 3 forecast hours
  const rainfall3h = precipitation
    .slice(0, 3)
    .reduce((sum, value) => sum + Number(value || 0), 0);

  // Round rainfall values to one decimal place
  const rainfall1hRounded = Math.round(rainfall1h * 10) / 10;
  const rainfall3hRounded = Math.round(rainfall3h * 10) / 10;

  // For the 3-hour window, use the highest precipitation
  // probability among those three hours.
  const probability1h = Number(probability[0] || 0);

  const probability3h = Math.max(
    ...probability.slice(0, 3).map((value) => Number(value || 0)),
    0
  );

  // Open-Meteo returns local time because we requested
  // Asia/Kolkata. Add the India timezone offset before
  // converting to ISO format.
  const firstTime = new Date(`${times[0]}+05:30`);

  const oneHourEnd = new Date(
    firstTime.getTime() + 1 * 60 * 60 * 1000
  );

  const threeHourEnd = new Date(
    firstTime.getTime() + 3 * 60 * 60 * 1000
  );

  const windows = [
    {
      window_label: "1h",
      window_start: firstTime.toISOString(),
      window_end: oneHourEnd.toISOString(),
      rainfall_mm: rainfall1hRounded,
      intensity: intensityFor(rainfall1hRounded),
      probability_percent: probability1h,
      is_manual: false,
    },
    {
      window_label: "3h",
      window_start: firstTime.toISOString(),
      window_end: threeHourEnd.toISOString(),
      rainfall_mm: rainfall3hRounded,
      intensity: intensityFor(rainfall3hRounded),
      probability_percent: probability3h,
      is_manual: false,
    },
  ];

  return {
    location_id: location.location_id,
    drain_id: null,
    name: location.name,
    lat: location.lat,
    lng: location.lng,
    windows: windows.map((window) =>
      applyOverride(location.location_id, window)
    ),
    fetched_at: fetchedAt,
    source: "open-meteo",
  };
}

// ---------------------------------------------------------
// Main function used by WeatherForecastPanel.jsx
// ---------------------------------------------------------

export async function getForecastSnapshot() {
  const fetchedAt = new Date().toISOString();

  // Fetch all four SmartDrain locations simultaneously.
  const weatherResults = await Promise.all(
    LOCATIONS.map((location) => fetchLocationWeather(location))
  );

  const locations = LOCATIONS.map((location, index) =>
    buildLocationForecast(
      location,
      weatherResults[index],
      fetchedAt
    )
  );

  return {
    generated_at: fetchedAt,
    refresh_interval_seconds: REFRESH_INTERVAL_SECONDS,
    locations,
  };
}

// ---------------------------------------------------------
// Automatic polling
// ---------------------------------------------------------

export function subscribeToForecast(
  onUpdate,
  onError,
  intervalMs = REFRESH_INTERVAL_SECONDS * 1000
) {
  let cancelled = false;

  async function tick() {
    try {
      const snapshot = await getForecastSnapshot();

      if (!cancelled) {
        onUpdate(snapshot);
      }
    } catch (error) {
      if (!cancelled && onError) {
        onError(error);
      }
    }
  }

  // Fetch immediately.
  tick();

  // Then refresh every 15 minutes.
  const id = setInterval(tick, intervalMs);

  return function unsubscribe() {
    cancelled = true;
    clearInterval(id);
  };
}