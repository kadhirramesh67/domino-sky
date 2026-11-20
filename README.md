# Domino Sky ✈️

> **Flight Disruption Cascade & Recovery Simulator**  
> Deterministic multi-leg cascade modeling, spare aircraft swaps, crew duty tracking, and hallucination-free AI dispatch briefing for airline operations.

---

## Overview

When an airport closes or experiences severe delays, the impact ripples across the entire airspace:
- Aircraft scheduled to fly subsequent legs are delayed or stuck out of position.
- Flight crews approach legal duty limits (DGCA / CAR Section 7: max 600 minutes), causing flights to be grounded.
- Tight passenger connections are broken, leaving transit passengers stranded.

**Domino Sky** simulates these network-wide cascades deterministically and identifies high-impact recovery actions (spare aircraft swaps at strategic hubs, bottleneck flight cancellations) with exact Before vs. After metrics.

---

## Key Capabilities

### 1. Deterministic Simulation Engine
All simulation calculations are pure functions that execute synchronously without heuristics or non-deterministic state:
- **Turnaround Slack Absorption**: Turnaround buffer between scheduled arrival and next scheduled departure absorbs delay until the buffer drops below `min_turnaround_minutes: 30`. Delays within the buffer do not cascade.
- **Direct Departure Holds**: Flights departing a closed airport during the disruption window are held until reopening (`DIRECT_DEPARTURE_HOLD`).
- **Direct Arrival Holds**: Flights en route to a closed airport have their departure held back at the origin so they arrive at reopening time (`DIRECT_ARRIVAL_HOLD`).
- **Multi-Leg Rotations & Causal Chains**: Aircraft tail rotations (`leg_order` 1 through 5) track causal chains (`INBOUND_ROTATION_DELAY`), attributing downstream delays to root-cause flights.
- **Crew Duty Tracking (600 min limit)**: Cumulative duty from `duty_start` to flight arrival is tracked against `max_duty_mins: 600`. Once breached, the breaching flight and all subsequent legs for that crew are grounded (`CREW_DUTY_BREACH`).
- **Passenger Connections & Zero Double-Counting**: Connecting passengers (`min_connect_minutes: 45`) who miss their outbound flights are tracked. If a flight is cancelled or crew-grounded, its passengers are counted under `cancelledOrGroundedPax`, and broken connection records for that flight have `countsInMissedPax: false` to guarantee **zero double-counting** of stranded passengers.

### 2. Deterministic Recovery Engine
The recovery engine ranks recovery candidate interventions using a composite improvement score:
- **Spare Aircraft Swaps**:
  - `VT-DS17` based at Kempegowda International Airport (**BLR**), available from 05:00 IST.
  - `VT-DS18` based at Indira Gandhi International Airport (**DEL**), available from 05:00 IST.
  - Swapping a spare onto a delayed or crew-grounded rotation resets duty and removes inbound rotational delay for subsequent legs.
- **Bottleneck Flight Cancellations**:
  - Cancelling an out-and-back turn pair or a bottleneck leg stops cascading delays down the aircraft line, isolating downstream flights so they can depart on schedule.
- **Accurate Metric Deltas**:
  - Every candidate computes exact deltas ($\Delta\text{Delay Minutes}$, $\Delta\text{Stranded Pax}$, $\Delta\text{Delayed Flights}$, $\Delta\text{Cancelled Flights}$, $\Delta\text{Broken Connections}$, $\Delta\text{Crew Breaches}$).

### 3. AI Dispatcher & Numeric Validator
- **AI Briefing**: Generates concise, natural-language executive dispatch briefings from simulation metrics.
- **Mathematical Consistency Validator**: Every numeric token $\ge 10$ in the AI response is strictly validated against the set of verified numbers produced by the simulation engine (`validateDispatcherResponse`).
- **100% Deterministic Grounded Fallback**: If the AI model is unreachable, returns unverified figures, or encounters an error, the system automatically falls back to `generateTemplateDispatch`, ensuring a **Zero Hallucination Guarantee**.

---

## Security Safeguards

- **Strict Schema Validation**: Serverless endpoints (`api/dispatch.ts`) use Zod schemas (`RequestSchema`, `MetricsSchema`, `RecoveryStatSchema`) to validate and sanitize every payload property.
- **Secret Protection**: API keys and environment variables are strictly isolated on the server side; `.gitignore` prevents committing `.env*`, `dist/`, and credentials.
- **Clean API Routing**: `vercel.json` provides explicit routing for `/api/*` and avoids catch-all single-page app rewrites that could misroute API traffic.

---

## Accessibility Features

- **Semantic Landmarks**: Semantic `<header>`, `<main>`, `<section>`, `<aside>`, and `<table>` elements with accessible labels (`aria-label`).
- **Live Regions**: KPI strip uses `aria-live="polite"` to announce operational updates to assistive technologies.
- **State Indicators**: Toggle and filter controls use explicit `aria-pressed` attributes and keyboard-accessible buttons (`Enter` / `Space`).
- **Visual Contrast**: Dark high-contrast palette with distinct color-coded badges (cyan for active, amber for delayed, rose for cancelled/grounded, emerald for recovered).

---

## Flight Network Dataset

- The network dataset (`src/data/flight_network.json`) models **70 scheduled flights** across **16 Indian airports** (DEL, BOM, BLR, HYD, MAA, CCU, AMD, COK, GOI, PNQ, JAI, GAU, LKO, IXC, BBI, TRV).
- All UI tables, maps, counters, and tests dynamically read the flight count (`flights.length`) directly from the network definition.

---

## Test Suite & Commands

The project includes an end-to-end Vitest + React Testing Library suite covering the simulation engine, recovery candidate generation, numeric validator, and UI components.

### Run Tests
```bash
cmd /c npm test
# or
npx vitest run
```

### Test Coverage Breakdown
- `src/tests/engine.test.ts`:
  - Time parsing, formatting, window checks, and delay string formatting
  - Turnaround slack absorption (`min_turnaround_minutes: 30`)
  - Direct departure & arrival holds for airport closures
  - Multi-leg cascade propagation and causal chain links
  - Crew 600-min duty limit breach detection and flight grounding
  - Broken connection detection and zero double-counting verification
- `src/tests/recovery.test.ts`:
  - Spare swap generation for `VT-DS17` (BLR) and `VT-DS18` (DEL)
  - Bottleneck single-flight and turn-pair cancellations
  - Accurate Before vs. After metric deltas
- `src/tests/validator.test.ts`:
  - Flagging hallucinated or mismatched figures $\ge 10$
  - Passing verified engine figures and ignoring narrative filler numbers $< 10$
  - Deterministic template dispatcher fallback verification
- `src/tests/app.test.tsx`:
  - Full `<App />` rendering with all 70 flights
  - Preset switching (Mumbai Monsoon, Delhi Fog Hold, Bengaluru Squall)
  - Recovery action application, Before vs. After delta rendering, and reset
  - Interactive table filtering by flight status

### Production Build
```bash
cmd /c npm run build
# Runs: tsc -b && vite build
```

### Local Development Server
```bash
npm run dev
```
