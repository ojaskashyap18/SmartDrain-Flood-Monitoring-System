import { useMemo, useState } from "react";
import { MapContainer, Polyline, TileLayer, Tooltip, useMap } from "react-leaflet";
import { MOCK_DRAINS } from "./data/mockDrains.js";
import { getRiskBand, getRiskColor, getActionLabel } from "./utils/risk.js";

const DEFAULT_CENTER = [12.9748, 79.1642];
const FILTERS = ["ALL", "LOW", "MEDIUM", "HIGH", "CRITICAL"];

function RecenterMap({ center }) {
  const map = useMap();
  map.setView(center, Math.max(map.getZoom(), 14), { animate: true });
  return null;
}

function buildRiskHistory(drain) {
  const current = drain.risk.overall;
  const histories = {
    D1: [24, 22, 21, 19, 18, 16],
    D2: [39, 41, 43, 44, 46, 45],
    D3: [55, 57, 60, 62, 65, 66],
    D4: [90, 88, 86, 84, 83, 82],
    D5: [41, 39, 37, 35, 33, 32],
    D6: [17, 15, 14, 13, 12, 11],
    D7: [45, 47, 49, 51, 53, 54],
    D8: [78, 76, 75, 73, 72, 71],
    D9: [76, 79, 81, 83, 86, 88],
    D10: [31, 29, 27, 25, 23, 22]
  };

  const values = histories[drain.id] || [current - 12, current - 10, current - 8, current - 5, current - 2, current];
  values[values.length - 1] = current;

  return values.map((risk, index) => ({
    time: index === values.length - 1 ? "NOW" : `${(values.length - 1 - index) * 10}m`,
    risk: Math.max(0, Math.min(100, Math.round(risk)))
  }));
}

function App() {
  const [filter, setFilter] = useState("ALL");
  const [selectedId, setSelectedId] = useState(null);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [drains, setDrains] = useState(MOCK_DRAINS);
  const [notice, setNotice] = useState("");

  const filteredDrains = useMemo(
    () => filter === "ALL" ? drains : drains.filter(d => getRiskBand(d.risk.overall) === filter),
    [drains, filter]
  );
  const visibleIds = useMemo(() => new Set(filteredDrains.map(d => d.id)), [filteredDrains]);
  const selectedDrain = drains.find(d => d.id === selectedId) ?? null;

  const counts = useMemo(() => drains.reduce((a, d) => {
    a[getRiskBand(d.risk.overall)] += 1;
    return a;
  }, { LOW: 0, MEDIUM: 0, HIGH: 0, CRITICAL: 0 }), [drains]);

  const hardwareCount = drains.filter(d => d.source === "HARDWARE").length;
  const dummyCount = drains.filter(d => d.source === "DUMMY").length;
  const unresolvedBlockages = drains.reduce((n, d) => n + d.blockageHistory.filter(h => !h.resolved).length, 0);

  function selectDrain(id) {
    setSelectedId(id);
    setDetailsOpen(false);
    setNotice("");
  }

  function openDetails(id = selectedId) {
    if (!id) return;
    setSelectedId(id);
    setDetailsOpen(true);
    setNotice("");
  }

  function handleCleaned() {
    if (!selectedDrain) return;
    if (getRiskBand(selectedDrain.risk.overall) !== "LOW") {
      setNotice("Cleaning can only be recorded when the drain is LOW risk.");
      return;
    }
    const now = new Date();
    const date = now.toISOString().slice(0, 10);
    const timestamp = now.toLocaleString([], { year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
    setDrains(current => current.map(d => d.id === selectedDrain.id ? {
      ...d,
      lastCleaned: date,
      cleaningHistory: [{ date, note: "Cleaning recorded from dashboard" }, ...d.cleaningHistory],
      lastUpdated: timestamp
    } : d));
    setNotice(`Cleaning recorded for ${selectedDrain.name}.`);
  }

  if (detailsOpen && selectedDrain) {
    return (
      <div className="app-shell">
        <header className="topbar">
          <div className="brand-row"><span className="brand-mark">SD</span><div><h1>SmartDrain</h1><p>Predictive Urban Drainage Monitoring</p></div></div>
          <div className="system-status"><span className="status-dot" /> Drain Details</div>
        </header>
        <main className="all-data-page">
          <div className="all-data-header">
            <div>
              <button className="back-home-button" type="button" onClick={() => setDetailsOpen(false)}>← BACK TO HOME</button>
              <span className="eyebrow">COMPLETE SECTION DATA</span>
              <h2>{selectedDrain.name}</h2>
              <p>Detailed operational, risk, weather, sensor and maintenance information for this sewer section.</p>
            </div>
            <div className="all-data-risk">
              <span className={`risk-pill ${getRiskBand(selectedDrain.risk.overall).toLowerCase()}`}>{getRiskBand(selectedDrain.risk.overall)}</span>
              <strong>{selectedDrain.risk.overall}%</strong>
              <span>overall risk</span>
            </div>
          </div>
          {notice && <div className="maintenance-notice global-notice">{notice}</div>}
          <div className="all-data-grid">
            <section className="panel all-data-metrics">
              <div className="panel-heading compact"><div><span className="eyebrow">CURRENT CONDITION</span><h3>Live Sensor Data</h3></div><span>{selectedDrain.source === "HARDWARE" ? "ESP32" : "DEMO"}</span></div>
              <div className="large-metric-grid">
                <Metric label="Water Level" value={`${selectedDrain.sensorData.waterLevel} cm`} />
                <Metric label="Flow Rate" value={`${selectedDrain.sensorData.flowRate} L/min`} />
                <Metric label="Rate of Rise" value={`${selectedDrain.sensorData.riseRate} cm/min`} />
                <Metric label="Sensor Status" value={selectedDrain.sensorData.sensorStatus} />
              </div>
            </section>
            <section className="panel all-data-metrics">
              <div className="panel-heading compact"><div><span className="eyebrow">WEATHER INPUT</span><h3>Rainfall & Forecast</h3></div></div>
              <div className="large-metric-grid">
                <Metric label="Rainfall — 1h" value={`${selectedDrain.weather.rainfall1h} mm`} />
                <Metric label="Rainfall — 3h" value={`${selectedDrain.weather.rainfall3h} mm`} />
                <Metric label="Forecast Intensity" value={selectedDrain.weather.forecastIntensity} />
              </div>
            </section>
            <section className="panel all-data-metrics">
              <div className="panel-heading compact"><div><span className="eyebrow">RISK ASSESSMENT</span><h3>Risk Components</h3></div></div>
              <div className="large-metric-grid">
                <Metric label="Blockage Risk" value={`${selectedDrain.risk.blockage}%`} />
                <Metric label="Overflow Risk" value={`${selectedDrain.risk.overflow}%`} />
                <Metric label="Recommended Action" value={getActionLabel(selectedDrain.recommendedAction)} />
              </div>
            </section>
            <RiskTrend drain={selectedDrain} />
            <ExplainRisk drain={selectedDrain} />
            <SensorHealth drain={selectedDrain} />
            <MaintenanceWindow drain={selectedDrain} onCleaned={handleCleaned} notice={notice} />
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand-row"><span className="brand-mark">SD</span><div><h1>SmartDrain</h1><p>Predictive Urban Drainage Monitoring</p></div></div>
        <div className="system-status"><span className="status-dot" /> Prototype Dashboard</div>
      </header>

      <main className="dashboard">
        <section className="overview-strip">
          <div className="overview-title"><span className="eyebrow">GIS MONITORING</span><h2>Connected Drainage Network</h2><p>Ten monitored sewer sections form one connected network. Select a section to inspect its current condition.</p></div>
          <div className="overview-stats">
            <StatCard label="Total Drains" value={drains.length} />
            <StatCard label="Hardware" value={hardwareCount} accent="live" />
            <StatCard label="Dummy" value={dummyCount} />
            <StatCard label="Open Blockages" value={unresolvedBlockages} accent="critical" />
          </div>
        </section>

        <section className="workspace">
          <div className="map-panel">
            <div className="panel-toolbar">
              <div><span className="eyebrow">NETWORK VIEW</span><h3>Drainage Sewer Sections</h3></div>
              <div className="filter-group">{FILTERS.map(item => <button key={item} type="button" className={`filter-button ${filter === item ? "active" : ""}`} onClick={() => setFilter(item)}>{item}</button>)}</div>
            </div>

            <div className="map-wrapper">
              <MapContainer center={DEFAULT_CENTER} zoom={14} scrollWheelZoom className="map">
                <TileLayer attribution='&copy; OpenStreetMap contributors' url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
                {selectedDrain && detailsOpen && <RecenterMap center={selectedDrain.location} />}
                {drains.map(drain => {
                  if (!visibleIds.has(drain.id) || !Array.isArray(drain.geometry) || drain.geometry.length < 2) return null;
                  const band = getRiskBand(drain.risk.overall);
                  const selected = selectedId === drain.id;
                  return (
                    <Polyline
                      key={drain.id}
                      positions={drain.geometry}
                      pathOptions={{ color: getRiskColor(band), weight: selected ? 13 : 8, opacity: selected ? 1 : 0.92, lineCap: "round", lineJoin: "round" }}
                      eventHandlers={{ click: () => selectDrain(drain.id) }}
                    >
                      <Tooltip sticky direction="top">{drain.name} · {band} · {drain.risk.overall}% risk</Tooltip>
                    </Polyline>
                  );
                })}
                <DrainLabels drains={drains} visibleIds={visibleIds} onSelect={selectDrain} />
              </MapContainer>
              <div className="map-legend"><span><i className="legend-line low" />Low</span><span><i className="legend-line medium" />Medium</span><span><i className="legend-line high" />High</span><span><i className="legend-line critical" />Critical</span></div>
              <div className="map-help">Click anywhere on a colored sewer section to select that drain. Details remain hidden until requested.</div>
            </div>
          </div>

          {selectedDrain && !detailsOpen ? (
            <DrainSummary drain={selectedDrain} onDetails={() => openDetails(selectedDrain.id)} />
          ) : (
            <aside className="details-placeholder"><span className="placeholder-icon">↖</span><h3>Select a drain section</h3><p>Click any colored sewer section on the map. A compact summary will appear here; full data is available on request.</p></aside>
          )}
        </section>

        <PriorityRanking drains={drains} selectedId={selectedId} onSelect={selectDrain} />

        <section className="bottom-grid">
          <RiskDistribution counts={counts} total={drains.length} />
          <MaintenanceSummary drains={drains} />
        </section>
      </main>
    </div>
  );
}

function DrainLabels({ drains, visibleIds, onSelect }) {
  return drains.map(d => {
    if (!visibleIds.has(d.id) || !Array.isArray(d.geometry) || d.geometry.length < 2) return null;
    const midpoint = d.geometry[Math.floor(d.geometry.length / 2)];
    return <Polyline key={`label-${d.id}`} positions={[midpoint, midpoint]} pathOptions={{ opacity: 0, weight: 1 }} eventHandlers={{ click: () => onSelect(d.id) }}><Tooltip permanent direction="center" className="drain-section-label">{d.name}</Tooltip></Polyline>;
  });
}

function StatCard({ label, value, accent }) { return <div className="stat-card"><span>{label}</span><strong className={accent || ""}>{value}</strong></div>; }

function DrainSummary({ drain, onDetails }) {
  const band = getRiskBand(drain.risk.overall);
  return <aside className="summary-panel"><div className="summary-top"><div><span className="eyebrow">SELECTED SECTION</span><h3>{drain.name}</h3></div><span className={`risk-pill ${band.toLowerCase()}`}>{band}</span></div><div className="summary-risk"><strong>{drain.risk.overall}%</strong><span>overall risk</span></div><div className="summary-grid"><Metric label="Blockage Risk" value={`${drain.risk.blockage}%`} /><Metric label="Overflow Risk" value={`${drain.risk.overflow}%`} /><Metric label="Water Level" value={`${drain.sensorData.waterLevel} cm`} /><Metric label="Flow Rate" value={`${drain.sensorData.flowRate} L/min`} /><Metric label="Rise Rate" value={`${drain.sensorData.riseRate} cm/min`} /><Metric label="Rainfall (1h)" value={`${drain.weather.rainfall1h} mm`} /><Metric label="Rainfall (3h)" value={`${drain.weather.rainfall3h} mm`} /><Metric label="Forecast" value={drain.weather.forecastIntensity} /></div><div className="summary-action"><span>Recommended action</span><strong>{getActionLabel(drain.recommendedAction)}</strong></div><button className="primary-button" type="button" onClick={onDetails}>VIEW ALL DATA</button><p className="summary-source">{drain.source === "HARDWARE" ? "ESP32 hardware section" : "Dummy demonstration section"}</p></aside>;
}

function MaintenanceWindow({ drain, onCleaned, notice }) {
  const band = getRiskBand(drain.risk.overall);
  const canClean = band === "LOW";
  return (
    <section className="panel maintenance-window">
      <div className="panel-heading compact">
        <div><span className="eyebrow">MAINTENANCE WINDOW</span><h3>Cleaning & Service Status</h3></div>
        <button type="button" className={`cleaned-button ${canClean ? "enabled" : "disabled"}`} disabled={!canClean} onClick={onCleaned}>CLEANED</button>
      </div>
      <div className="maintenance-window-grid">
        <DataRow label="Last Cleaned" value={drain.lastCleaned || "No record"} />
        <DataRow label="Recommended Action" value={getActionLabel(drain.recommendedAction)} />
        <DataRow label="Cleaning Records" value={`${(drain.cleaningHistory || []).length}`} />
        <DataRow label="Blockage Events" value={`${(drain.blockageHistory || []).length}`} />
      </div>
      {!canClean && <p className="maintenance-note">CLEANED is available only while this drain is LOW risk.</p>}
      {notice && <p className="maintenance-notice">{notice}</p>}
    </section>
  );
}

function Metric({ label, value }) { return <div className="metric"><span>{label}</span><strong>{value}</strong></div>; }
function DataRow({ label, value }) { return <div className="data-row"><span>{label}</span><strong>{value}</strong></div>; }
function RiskTrend({ drain }) {
  const history = buildRiskHistory(drain);
  const first = history[0].risk;
  const last = history[history.length - 1].risk;
  const increasing = last > first;
  const decreasing = last < first;
  const trendLabel = increasing ? "INCREASING" : decreasing ? "DECREASING" : "STABLE";
  const chartHeight = 150;
  const chartWidth = 620;
  const paddingX = 34;
  const paddingY = 18;
  const plotWidth = chartWidth - paddingX * 2;
  const plotHeight = chartHeight - paddingY * 2;
  const points = history.map((point, index) => ({
    ...point,
    x: paddingX + (plotWidth * index) / (history.length - 1),
    y: paddingY + ((100 - point.risk) / 100) * plotHeight
  }));
  const linePoints = points.map(point => `${point.x},${point.y}`).join(" ");

  return (
    <section className="panel risk-trend-panel">
      <div className="panel-heading compact">
        <div>
          <span className="eyebrow">RISK TREND</span>
          <h3>Overall Risk — Last Hour</h3>
        </div>
        <div className={`trend-badge ${trendLabel.toLowerCase()}`}>
          <span className="trend-arrow">{increasing ? "↗" : decreasing ? "↘" : "→"}</span>
          {trendLabel}
        </div>
      </div>

      <div className="risk-trend-summary">
        <div>
          <span>Current risk</span>
          <strong>{drain.risk.overall}%</strong>
        </div>
        <div>
          <span>Change over hour</span>
          <strong>{last - first > 0 ? "+" : ""}{last - first}%</strong>
        </div>
        <div>
          <span>Data points</span>
          <strong>{history.length}</strong>
        </div>
      </div>

      <div className="risk-trend-chart">
        <svg viewBox={`0 0 ${chartWidth} ${chartHeight}`} preserveAspectRatio="none" role="img" aria-label={`Overall risk trend for ${drain.name}`}>
          {[0, 25, 50, 75, 100].map(value => {
            const y = paddingY + ((100 - value) / 100) * plotHeight;
            return (
              <g key={value}>
                <line x1={paddingX} y1={y} x2={chartWidth - paddingX} y2={y} className="trend-grid-line" />
                <text x="2" y={y + 3} className="trend-axis-label">{value}</text>
              </g>
            );
          })}
          <polyline points={linePoints} className="trend-line" fill="none" />
          {points.map((point, index) => (
            <g key={`${point.time}-${index}`} className="trend-point">
              <circle cx={point.x} cy={point.y} r="5" />
              <text x={point.x} y={point.y - 11} textAnchor="middle" className="trend-value">{point.risk}</text>
              <text x={point.x} y={chartHeight - 2} textAnchor="middle" className="trend-time">{point.time}</text>
            </g>
          ))}
        </svg>
      </div>

      <div className="risk-trend-footer">
        <span>{decreasing ? "Risk is easing compared with the start of the hour." : increasing ? "Risk is rising compared with the start of the hour." : "Risk has remained broadly stable over the hour."}</span>
        <span>Prototype history</span>
      </div>
    </section>
  );
}

function ExplainRisk({ drain }) {
  const labels = [
    { key: "waterLevel", label: "Water Level", detail: "Current level relative to drain capacity" },
    { key: "riseRate", label: "Rate of Rise", detail: "How quickly the water level is increasing" },
    { key: "flowDeficit", label: "Flow Deficit", detail: "Reduction in flow compared with expected flow" },
    { key: "rainfall", label: "Rainfall", detail: "Forecast rainfall contribution to risk" },
    { key: "historical", label: "Historical Risk", detail: "Cleaning age and previous blockage history" }
  ];

  const factors = labels
    .map(item => ({ ...item, value: Number(drain.riskFactors?.[item.key] ?? 0) }))
    .sort((a, b) => b.value - a.value);
  const available = factors.some(f => f.value > 0 || drain.riskFactors?.[f.key] !== undefined);
  const primary = factors[0];
  const secondary = factors[1];

  if (!available) {
    return (
      <section className="panel explain-risk-panel">
        <div className="panel-heading compact">
          <div><span className="eyebrow">RISK EXPLANATION</span><h3>Why This Drain Is Risky</h3></div>
        </div>
        <div className="explain-empty">Factor-level risk data will appear here when supplied by the backend risk engine.</div>
      </section>
    );
  }

  return (
    <section className="panel explain-risk-panel">
      <div className="panel-heading compact">
        <div>
          <span className="eyebrow">RISK EXPLANATION</span>
          <h3>Why This Drain Is Risky</h3>
        </div>
        <span>Factor scores / 100</span>
      </div>

      <div className="risk-factor-list">
        {factors.map(factor => {
          const band = getRiskBand(factor.value);
          return (
            <div className="risk-factor" key={factor.key}>
              <div className="risk-factor-heading">
                <div>
                  <strong>{factor.label}</strong>
                  <small>{factor.detail}</small>
                </div>
                <b>{factor.value}</b>
              </div>
              <div className="risk-factor-track">
                <div className={`risk-factor-fill ${band.toLowerCase()}`} style={{ width: `${factor.value}%` }} />
              </div>
            </div>
          );
        })}
      </div>

      <div className="risk-contributors">
        <div>
          <span>Primary contributor</span>
          <strong>{primary.label} · {primary.value}/100</strong>
        </div>
        <div>
          <span>Secondary contributor</span>
          <strong>{secondary.label} · {secondary.value}/100</strong>
        </div>
      </div>
      <div className="risk-explanation-note">
        The backend combines these factor scores with the blockage and overflow models to produce the overall risk of <strong>{drain.risk.overall}%</strong>.
      </div>
    </section>
  );
}

function SensorHealth({ drain }) {
  const isHardware = drain.source === "HARDWARE";
  const status = drain.sensorData?.sensorStatus || (isHardware ? "ONLINE" : "DEMO");
  const statusClass = status.toLowerCase() === "online" ? "online" : status.toLowerCase() === "offline" ? "offline" : "demo";
  const statusLabel = status.toLowerCase() === "online" ? "ONLINE" : status.toLowerCase() === "offline" ? "OFFLINE" : "DEMO";

  return (
    <section className="panel sensor-health-panel">
      <div className="panel-heading compact">
        <div>
          <span className="eyebrow">SENSOR HEALTH</span>
          <h3>Sensor Connection Status</h3>
        </div>
        <span>{isHardware ? "ESP32 section" : "Prototype section"}</span>
      </div>
      <div className="sensor-health-body">
        <div className="sensor-health-status">
          <span className={`sensor-health-dot ${statusClass}`} />
          <div>
            <strong>{statusLabel}</strong>
            <small>{isHardware ? "Live hardware connection" : "Simulated sensor data"}</small>
          </div>
        </div>
        <div className="sensor-health-grid">
          <div><span>Last data received</span><strong>{drain.lastUpdated}</strong></div>
          <div><span>Data source</span><strong>{isHardware ? "ESP32" : "Dummy"}</strong></div>
        </div>
      </div>
      {!isHardware && <p className="sensor-health-note">This section uses demonstration data. A live health state will come from the backend once the ESP32 nodes are connected.</p>}
    </section>
  );
}

function PriorityRanking({ drains, selectedId, onSelect }) {
  const ranked = drains
    .filter(drain => getRiskBand(drain.risk.overall) !== "LOW")
    .sort((a, b) => b.risk.overall - a.risk.overall)
    .slice(0, 3);

  return (
    <section className="panel priority-panel">
      <div className="panel-heading compact">
        <div>
          <span className="eyebrow">ACTION PRIORITY</span>
          <h3>Top 3 Sewers Requiring Maintenance</h3>
        </div>
        <span>Highest-risk sections</span>
      </div>

      <div className="priority-list">
        {ranked.length ? ranked.map((drain, index) => {
          const band = getRiskBand(drain.risk.overall);
          const selected = selectedId === drain.id;

          return (
            <button
              key={drain.id}
              type="button"
              className={`priority-row ${selected ? "selected" : ""}`}
              onClick={() => onSelect(drain.id)}
              aria-label={`Select ${drain.name}, ${band} risk, ${drain.risk.overall}%`}
            >
              <span className="priority-rank">{index + 1}</span>
              <span className="priority-drain">
                <strong>{drain.name}</strong>
                <small>{getActionLabel(drain.recommendedAction)}</small>
              </span>
              <span className={`priority-risk ${band.toLowerCase()}`}>
                <strong>{drain.risk.overall}%</strong>
                <small>{band}</small>
              </span>
              <span className="priority-arrow">→</span>
            </button>
          );
        }) : <div className="priority-empty">No sewer sections currently require maintenance.</div>}
      </div>
    </section>
  );
}

function RiskDistribution({ counts, total }) { return <section className="panel"><div className="panel-heading compact"><div><span className="eyebrow">RISK OVERVIEW</span><h3>Risk Distribution</h3></div><span>{total} drains</span></div><div className="risk-bars">{["LOW", "MEDIUM", "HIGH", "CRITICAL"].map(b => <div className="risk-bar-row" key={b}><div className="risk-bar-label"><span>{b}</span><strong>{counts[b]}</strong></div><div className="risk-bar-track"><div className={`risk-bar-fill ${b.toLowerCase()}`} style={{ width: `${total ? counts[b] / total * 100 : 0}%` }} /></div></div>)}</div></section>; }
function MaintenanceSummary({ drains }) { const cleaned = drains.filter(d => d.lastCleaned).length; const open = drains.reduce((n, d) => n + d.blockageHistory.filter(h => !h.resolved).length, 0); return <section className="panel"><div className="panel-heading compact"><div><span className="eyebrow">MAINTENANCE</span><h3>Maintenance Overview</h3></div></div><div className="maintenance-summary"><div className="summary-metric"><span>Drains with cleaning record</span><strong>{cleaned}</strong></div><div className="summary-metric"><span>Open blockage events</span><strong>{open}</strong></div></div></section>; }

export default App;
