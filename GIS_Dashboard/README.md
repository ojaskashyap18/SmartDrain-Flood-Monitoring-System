# SmartDrain GIS Dashboard — V2

React + Vite + Leaflet prototype for the SmartDrain predictive urban drainage monitoring system.

## Current review build

- 10 total drains: D1–D10
- D1–D3 reserved for real ESP32/hardware integration
- D4–D10 are dummy demonstration nodes
- Drain names are permanently displayed on the map
- Connected sewer network drawn between consecutive drains
- Each network segment is owned by its upstream drain (D1→D2, D2→D3, … D9→D10)
- Segment colour follows the risk band of the drain that owns that section
- Full drain details are hidden until the user explicitly opens **View details**
- Detailed view contains sensor, weather, risk and recommended-action data
- Cleaning history is maintained per drain
- Blockage history is maintained per drain
- **CLEANED** can only be recorded when the current overall risk is **LOW**
- Cleaning records are stored locally in the review build and will later be sent to the backend

## Stack

- React 19
- Vite
- Leaflet
- React-Leaflet
- JavaScript / JSX
- CSS

## Development

```bash
npm install
npm run dev
```

LAN development:

```bash
npm run dev -- --host
```

## Backend integration boundary

The frontend is intentionally structured around a future REST endpoint:

```text
GET /api/drains
```

The backend should return the drain object structure used in `src/data/mockDrains.js`.

For final integration, set:

```text
VITE_API_BASE_URL=http://BACKEND_LAPTOP_IP:8000
```

and route dashboard data through `src/services/api.js`.

Cleaning will eventually use a backend endpoint such as:

```text
POST /api/drains/{drain_id}/cleaned
```

The backend should reject the operation unless the drain's current risk band is LOW. The frontend also disables the button for non-LOW drains, but the backend must remain the authoritative validation layer.

## Prototype network model

```text
D1 ── D2 ── D3 ── D4 ── D5 ── D6 ── D7 ── D8 ── D9 ── D10
```

This is a demonstrator network layout. The actual municipal GIS deployment can later replace the prototype coordinates and connectivity with surveyed drainage geometry.


## V4 data visibility and maintenance rules

The dashboard preserves and displays:
- Water level
- Flow rate
- Rate of water-level rise
- Rainfall forecast for the next 1 hour
- Rainfall forecast for the next 3 hours
- Forecast intensity
- Blockage risk
- Overflow risk
- Overall risk
- Recommended action
- Sensor status and last updated time

The detailed drain panel includes a `CLEANED` action. It is enabled only when the selected drain is LOW risk. A successful cleaning action:
1. Adds a new cleaning-history event.
2. Updates the last-cleaned date.
3. Preserves all previous blockage-history events.

The UI disables the action for MEDIUM, HIGH and CRITICAL drains. The eventual backend must enforce the same rule server-side.

Each of D1-D10 is represented by an explicit clickable sewer-section geometry; there are no drain marker nodes.


## V5 stability fix

V5 fixes the blank-page regression from V4. The cause was the D10 mock record missing the explicit `geometry` array even though the map renderer expected every drain to have a sewer-section geometry. D10 now has a terminal geometry, and the renderer defensively skips malformed geometry rather than crashing the entire dashboard.


### Feature 3 — Explain Risk
The selected drain now shows backend-style factor scores for water level, rate of rise, flow deficit, rainfall, and historical risk, plus primary/secondary contributors. The mock values are prototype data; the backend should later provide `riskFactors` directly from the risk engine. The frontend does not calculate the authoritative risk score.


## Feature 9 — Historical Timeline
The selected drain details view now includes a chronological timeline combining cleaning and blockage events. Blockage history is retained after cleaning, and unresolved blockage events are explicitly marked. The prototype uses the existing `cleaningHistory` and `blockageHistory` arrays; the backend can later supply the same fields from municipal maintenance records.


## UI update — v7
- Full-screen All Data view refined with clearer field partitions and a brighter authority-focused visual hierarchy.
- Risk Trend redesigned as a restrained line chart with varied prototype trend directions across drains.
- Historical Records/Timeline removed from the active frontend.
