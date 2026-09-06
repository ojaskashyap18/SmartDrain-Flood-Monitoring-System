# SmartDrain — GIS Drainage Dashboard

A React + Leaflet GIS dashboard for monitoring urban drainage sections, assessing risk, and helping authorities prioritize maintenance.

## Dashboard

![GIS Mapping](Images/GIS%20Mapping.png)

SmartDrain visualizes drainage sections using color-coded risk levels so that high-risk areas can be identified quickly.

## Key Features

- GIS-based visualization of 10 drainage sections (D1–D10)
- Risk-based filtering and color coding
- Top 3 drains requiring maintenance
- Real-time-style drainage data display
- Risk trend analysis
- Risk-factor explanation
- Sensor health monitoring
- Weather and rainfall information
- Maintenance and cleaning status
- Full-screen detailed drain information

**D1–D3** are reserved for ESP32 sensor integration, while **D4–D10** currently use demonstration data.

## Risk Assessment

The system combines:

- Water level
- Rate of water-level rise
- Flow deficit
- Forecast rainfall
- Historical blockage and cleaning information

to generate:

**Blockage Risk → Overflow Risk → Overall Risk → Recommended Action**

The current risk engine is rule-based and intended for demonstration. Real municipal data can later be used for calibration.

## Dashboard Modules

### Data & Monitoring

![Fetched Data](Images/Fetched%20data.png)

Displays drainage and environmental data received by the system.

### GIS Mapping

![GIS Mapping](Images/GIS%20Mapping.png)

Shows complete sewer sections rather than individual sensor points, with colors representing their current risk level.

### Informative Data

![Informative Table](Images/Informative%20Table.png)

Provides a compact overview of drainage conditions and risk status.

### Risk Explanation

![Risk Explanation](Images/Risk%20Explanation.png)

Breaks down the major factors contributing to the calculated risk.

### Risk Trend

![Risk Trend](Images/Risk%20Trend.png)

Shows how the risk level of a drainage section is changing over time.

### Sensor Health & Maintenance

![Sensor Health and Maintenance](Images/SensorHealth%20%26%20Maintenance.png)

Displays sensor status together with maintenance and cleaning information.

## System Workflow

```text
ESP32 Sensors + Weather Data + Historical Data
                    ↓
              Backend / Risk Engine
                    ↓
              Risk Assessment
                    ↓
             GIS Web Dashboard
                    ↓
          Maintenance Prioritization
