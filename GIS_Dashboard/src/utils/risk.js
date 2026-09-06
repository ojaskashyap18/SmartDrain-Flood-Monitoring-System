export function getRiskBand(score) {
  if (score < 30) return "LOW";
  if (score < 60) return "MEDIUM";
  if (score < 80) return "HIGH";
  return "CRITICAL";
}

export function getRiskColor(band) {
  switch (band) {
    case "LOW":
      return "#16a34a";
    case "MEDIUM":
      return "#eab308";
    case "HIGH":
      return "#f97316";
    case "CRITICAL":
      return "#dc2626";
    default:
      return "#64748b";
  }
}

export function getActionLabel(action) {
  switch (action) {
    case "MONITOR":
      return "MONITOR";
    case "INSPECT":
      return "INSPECT";
    case "PRIORITISE_CLEANING":
      return "PRIORITISE CLEANING";
    case "IMMEDIATE_INTERVENTION":
      return "IMMEDIATE INTERVENTION";
    default:
      return action;
  }
}