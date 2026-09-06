# SmartDrain — Flood Monitoring & Drainage Management System

SmartDrain is a low-cost IoT-enabled urban drainage monitoring and early-warning system designed to shift drain maintenance from a reactive approach to a predictive, data-driven approach.

The system combines drainage sensor data, weather information, historical maintenance records, and GIS-based visualization to identify drainage sections at risk of blockage or overflow and help authorities prioritize maintenance.

---

## Presentation

The complete project presentation is available here:

[View SmartDrain Presentation](presentation/SMARTDRAIN.pptx)

## Problem

Urban drainage systems are often maintained reactively — drains are cleaned after severe blockage, waterlogging, or flooding has already occurred.

This creates several problems:

- Delayed detection of drainage blockages
- Waterlogging and localized flooding
- Inefficient maintenance scheduling
- Limited visibility into drainage conditions
- Dependence on manual inspection

SmartDrain aims to provide an early-warning and maintenance-prioritization mechanism.

---

## Solution

SmartDrain continuously monitors important drainage parameters and combines them with environmental and historical information.

```text
        ESP32 Sensor Nodes
               │
               ▼
     ┌───────────────────┐
     │ Water Level       │
     │ Flow Rate         │
     │ Rate of Rise      │
     └─────────┬─────────┘
               │
               ▼
       Backend / Risk Engine
               │
       ┌───────┼────────┐
       │       │        │
    Sensor  Weather  Historical
     Data     Data      Data
       │       │        │
       └───────┼────────┘
               ▼
        Risk Assessment
               │
               ▼
         GIS Dashboard
               │
               ▼
     Maintenance Priority
