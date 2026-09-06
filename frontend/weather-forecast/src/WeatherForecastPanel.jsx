import React, { useEffect, useState, useCallback } from "react";
import {
  subscribeToForecast,
  getForecastSnapshot,
  setManualOverride,
  clearManualOverride,
} from "./weatherService";
import "./WeatherForecastPanel.css";

const INTENSITY_META = {
  none: { label: "No rain", color: "var(--intensity-none)" },
  light: { label: "Light", color: "var(--intensity-light)" },
  moderate: { label: "Moderate", color: "var(--intensity-moderate)" },
  heavy: { label: "Heavy", color: "var(--intensity-heavy)" },
  extreme: { label: "Extreme", color: "var(--intensity-extreme)" },
};

function formatClock(iso) {
  return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

// --- Weather icons -----------------------------------------------------

function IconSun() {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.8">
      <circle cx="12" cy="12" r="4.2" />
      <path d="M12 2.5v2.4M12 19.1v2.4M4.2 4.2l1.7 1.7M18.1 18.1l1.7 1.7M2.5 12h2.4M19.1 12h2.4M4.2 19.8l1.7-1.7M18.1 5.9l1.7-1.7" strokeLinecap="round" />
    </svg>
  );
}

function IconCloud() {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M6.5 18h11a3.8 3.8 0 0 0 .6-7.55A5.2 5.2 0 0 0 8.2 8.9 4.2 4.2 0 0 0 6.5 18Z" strokeLinejoin="round" />
    </svg>
  );
}

function IconRain() {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M6.5 14.5h11a3.8 3.8 0 0 0 .6-7.55A5.2 5.2 0 0 0 8.2 5.4 4.2 4.2 0 0 0 6.5 14.5Z" strokeLinejoin="round" />
      <path d="M8.5 17.5 7.3 20M12.5 17.5 11.3 20M16.5 17.5 15.3 20" strokeLinecap="round" />
    </svg>
  );
}

function IconStorm() {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M6.5 13h11a3.8 3.8 0 0 0 .6-7.55A5.2 5.2 0 0 0 8.2 3.9 4.2 4.2 0 0 0 6.5 13Z" strokeLinejoin="round" />
      <path d="M13 15.5 10.5 19h3l-1.8 3.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function WeatherIcon({ intensity }) {
  switch (intensity) {
    case "none":
      return <IconSun />;
    case "light":
      return <IconCloud />;
    case "moderate":
    case "heavy":
      return <IconRain />;
    case "extreme":
      return <IconStorm />;
    default:
      return <IconCloud />;
  }
}

// --- Editable window readout ---------------------------------------------
// Click the mm number to edit it. Enter or blur commits the value as a
// pinned manual override; a small "manual" tag with a × appears so it can
// be cleared back to live/mock data.

function WindowReadout({ w, locationId, onSetOverride, onClearOverride }) {
  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState("");

  if (!w) {
    return (
      <div className="window-readout window-readout--empty">
        <span className="window-label">—</span>
        <span className="window-value">no data</span>
      </div>
    );
  }

  const meta = INTENSITY_META[w.intensity] ?? INTENSITY_META.none;

  function startEditing() {
    setDraft(w.rainfall_mm.toFixed(1));
    setIsEditing(true);
  }

  function commit() {
    const value = parseFloat(draft);
    setIsEditing(false);
    if (!Number.isNaN(value) && value >= 0) {
      onSetOverride(locationId, w.window_label, value);
    }
  }

  function handleKeyDown(e) {
    if (e.key === "Enter") commit();
    if (e.key === "Escape") setIsEditing(false);
  }

  return (
    <div className={`window-readout ${w.is_manual ? "window-readout--manual" : ""}`}>
      <div className="window-header">
        <span className="window-icon" style={{ color: meta.color }}>
          <WeatherIcon intensity={w.intensity} />
        </span>
        <span className="window-label">{w.window_label}</span>
        <span className="intensity-chip" style={{ "--chip-color": meta.color }}>
          {meta.label}
        </span>
      </div>

      {isEditing ? (
        <input
          type="number"
          step="0.1"
          min="0"
          className="window-value-input"
          autoFocus
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={handleKeyDown}
        />
      ) : (
        <div
          className="window-value window-value--editable"
          onClick={startEditing}
          title="Click to set a value manually"
        >
          {w.rainfall_mm.toFixed(1)}
          <span className="window-unit">mm</span>
        </div>
      )}

      <div className="window-sub">
        {w.probability_percent}% chance · {formatClock(w.window_start)}–{formatClock(w.window_end)}
        {w.is_manual && (
          <button
            className="manual-reset-btn"
            title="Clear manual value, resume live data"
            onClick={() => onClearOverride(locationId, w.window_label)}
          >
            manual ×
          </button>
        )}
      </div>
    </div>
  );
}

function LocationCard({ loc, view, onSetOverride, onClearOverride }) {
  const oneHour = loc.windows.find((w) => w.window_label === "1h");
  const threeHour = loc.windows.find((w) => w.window_label === "3h");

  return (
    <article className="location-card">
      <header className="location-card__header">
        <h3>{loc.name}</h3>
        <span className="location-id">{loc.location_id}</span>
      </header>
      <div className="location-card__coords">
        {loc.lat.toFixed(4)}, {loc.lng.toFixed(4)}
      </div>
      <div className={`location-card__windows location-card__windows--${view}`}>
        {(view === "both" || view === "1h") && (
          <WindowReadout
            w={oneHour}
            locationId={loc.location_id}
            onSetOverride={onSetOverride}
            onClearOverride={onClearOverride}
          />
        )}
        {(view === "both" || view === "3h") && (
          <WindowReadout
            w={threeHour}
            locationId={loc.location_id}
            onSetOverride={onSetOverride}
            onClearOverride={onClearOverride}
          />
        )}
      </div>
      {!loc.drain_id && <div className="location-card__notice">Not yet linked to GIS</div>}
    </article>
  );
}

// --- Main panel ------------------------------------------------------------

const VIEW_CYCLE = ["both", "1h", "3h"];
const VIEW_LABEL = { both: "1h + 3h", "1h": "1h only", "3h": "3h only" };

export default function WeatherForecastPanel() {
  const [snapshot, setSnapshot] = useState(null);
  const [error, setError] = useState(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [view, setView] = useState("both");

  const handleUpdate = useCallback((snap) => {
    setSnapshot(snap);
    setError(null);
  }, []);

  const handleError = useCallback((err) => {
    setError(err.message || "Failed to load forecast");
  }, []);

  useEffect(() => {
    const unsubscribe = subscribeToForecast(handleUpdate, handleError);
    return unsubscribe;
  }, [handleUpdate, handleError, refreshKey]);

  async function refreshNow() {
    try {
      const snap = await getForecastSnapshot();
      setSnapshot(snap);
      setError(null);
    } catch (err) {
      setError(err.message || "Failed to load forecast");
    }
  }

  function handleSetOverride(locationId, windowLabel, mm) {
    setManualOverride(locationId, windowLabel, mm);
    refreshNow();
  }

  function handleClearOverride(locationId, windowLabel) {
    clearManualOverride(locationId, windowLabel);
    refreshNow();
  }

  function cycleView() {
    const idx = VIEW_CYCLE.indexOf(view);
    setView(VIEW_CYCLE[(idx + 1) % VIEW_CYCLE.length]);
  }

  return (
    <div className="weather-panel">
      <header className="weather-panel__header">
        <div>
          <h2>Weather Forecast</h2>
          <p className="weather-panel__subtitle">
            Short-term precipitation by location · Live weather data · Open-Meteo
          </p>
        </div>
        <div className="weather-panel__meta">
          {snapshot && (
            <span className="last-updated">Updated {formatClock(snapshot.generated_at)}</span>
          )}
          <button
            className="refresh-btn"
            onClick={() => setRefreshKey((k) => k + 1)}
            disabled={!snapshot && !error}
          >
            Refresh
          </button>
          <button
            className="view-toggle-btn"
            onClick={cycleView}
            title={`Window view: ${VIEW_LABEL[view]} (click to change)`}
            aria-label="Change forecast window view"
          >
            ⋮
          </button>
        </div>
      </header>

      {error && <div className="weather-panel__error">{error}</div>}

      {!snapshot && !error && <div className="weather-panel__loading">Loading forecast…</div>}

      {snapshot && (
        <div className="location-grid">
          {snapshot.locations.map((loc) => (
            <LocationCard
              key={loc.location_id}
              loc={loc}
              view={view}
              onSetOverride={handleSetOverride}
              onClearOverride={handleClearOverride}
            />
          ))}
        </div>
      )}
    </div>
  );
}
