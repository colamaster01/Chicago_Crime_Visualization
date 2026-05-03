# COMP4462 Final Project: Chicago Crime Visualization Dashboard

## Introduction
This repository contains the final project for HKUST COMP4462: Data Visualization. The project is an interactive, web-based visualization dashboard designed to analyze and explore Chicago crime data. It handles over 1.7 million records on the client side, allowing users to discover spatial-temporal patterns, evaluate community safety via a dynamic severity index, and explore specific crime types through interconnected views.

## Key Features

* Full-Dashboard Brushing & Linking: All visual components within the dashboard are fully interconnected. Filtering data through the interactive D3.js brush charts (Year, Month, Time of Day) or selecting specific crime types synchronously updates the map, Sankey diagram, and all statistical counts in real-time, providing a cohesive exploratory experience.
* Dual-Scale Map Interface (2D & 3D):
  * Micro View (2D): Utilizes MapLibre GL for rendering individual crime points and clusters.
  * Macro View (3D): Tilting the map activates a Deck.gl layer. It renders 3D extruded polygons for Chicago communities, where height and color encode a dynamically calculated severity score.
* Customizable Severity Score: Users can adjust the weight of different crime types via an interactive weight bar (scroll to adjust, drag to remove) to see how different evaluation criteria affect community safety rankings in real-time.
* Dynamic Crime Flow (Sankey Diagram): Clicking on a specific community opens a Sankey diagram, revealing the structural flow and correlation between specific crime types and times of day.
* Interactive Legend & State Management: A custom drag-and-drop UI allows users to categorize specific crimes as main dimensions or group them into an "OTHER" category, with D3.js handling DOM transitions.

## Technologies Used

The project is built entirely with native web technologies (HTML, CSS, Vanilla JavaScript with ES6 Modules), avoiding frontend frameworks like React or Vue to maximize rendering performance.

* D3.js (v7): Used for rendering brushable bar charts, dynamic sorting animations in the legend, custom SVG donut tooltips, and Sankey diagrams (d3-sankey).
* MapLibre GL JS: The core 2D mapping engine for base maps, GeoJSON rendering, and point clustering.
* Deck.gl: Overlayed on top of MapLibre to handle high-performance 3D polygon extrusion and WebGL rendering for the Macro View.
* Crossfilter.js: The core client-side data engine. It creates multidimensional inverted indexes, enabling millisecond-level filtering across millions of records.
* PapaParse: Used for asynchronous chunked parsing of the massive CSV dataset without blocking the browser's main thread.

## Architecture

* data_engine.js: Handles data ingestion (PapaParse), crossfilter initialization, and spatial-temporal queries.
* state.js: Acts as a centralized observer. It stores current filters, user-defined weights, and color mappings, notifying all renderers upon state changes.
* map.js / chart.js / sankey.js: View controllers that listen to the state and update their respective SVG or WebGL contexts.
* ui.js / cluster-tooltip.js: Manages DOM interactions, drag-and-drop events, and contextual map popups.

## Installation & Setup

The easiest way to view the dashboard is to visit the deployed live version directly:
**[https://colamaster01.github.io/Chicago_Crime_Visualization/](https://colamaster01.github.io/Chicago_Crime_Visualization/)**

Alternatively, to run the project locally for development or review, follow the steps below.

1. Clone the repository
```bash
git clone https://github.com/colamaster01/Chicago_Crime_Visualization
cd Chicago_Crime_Visualization
```

2. Add the dataset
Ensure the dataset (`chicago_crimes_data_20-26.csv`) and mapping file (`crime_mapping.json`) are placed in the root directory.

3. Start a local server
Using Python 3:
```bash
python -m http.server 8000
```

4. Launch
Open your web browser and navigate to `http://localhost:8000`.
