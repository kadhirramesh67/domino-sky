import { useMemo } from 'react';
import type { Airport } from '../types/index';
import type { SimulatedFlight } from '../types/simulation';

interface NetworkMapProps {
  airports: Airport[];
  flights: SimulatedFlight[];
  closedAirport: string;
  selectedAirport: string | null;
  selectedFlight: string | null;
  onAirportClick: (id: string) => void;
  onFlightClick: (id: string) => void;
}

// Bounding box for India airspace
const MIN_LAT = 7.5;
const MAX_LAT = 32.5;
const MIN_LNG = 68.0;
const MAX_LNG = 93.5;
const SVG_WIDTH = 540;
const SVG_HEIGHT = 580;
const PADDING = 45;

function project(lat: number, lng: number): { x: number; y: number } {
  const x = PADDING + ((lng - MIN_LNG) / (MAX_LNG - MIN_LNG)) * (SVG_WIDTH - 2 * PADDING);
  const y = SVG_HEIGHT - PADDING - ((lat - MIN_LAT) / (MAX_LAT - MIN_LAT)) * (SVG_HEIGHT - 2 * PADDING);
  return { x, y };
}

export default function NetworkMap({
  airports,
  flights,
  closedAirport,
  selectedAirport,
  selectedFlight,
  onAirportClick,
  onFlightClick,
}: NetworkMapProps) {
  const airportCoords = useMemo(() => {
    const map = new Map<string, { x: number; y: number }>();
    for (const a of airports) {
      map.set(a.id, project(a.lat, a.lng));
    }
    return map;
  }, [airports]);

  // Aggregate delayed & cancelled flights per airport
  const airportStats = useMemo(() => {
    const stats = new Map<string, { delayed: number; cancelled: number; total: number }>();
    for (const a of airports) {
      stats.set(a.id, { delayed: 0, cancelled: 0, total: 0 });
    }
    for (const f of flights) {
      const orig = stats.get(f.origin);
      if (orig) {
        orig.total++;
        if (f.status === 'delayed') orig.delayed++;
        if (f.status === 'cancelled' || f.status === 'crew_grounded') orig.cancelled++;
      }
      const dest = stats.get(f.destination);
      if (dest) {
        dest.total++;
        if (f.status === 'delayed') dest.delayed++;
        if (f.status === 'cancelled' || f.status === 'crew_grounded') dest.cancelled++;
      }
    }
    return stats;
  }, [airports, flights]);

  // Unique route pairs with worst status for rendering flight corridors
  const routes = useMemo(() => {
    const routeMap = new Map<
      string,
      {
        id: string;
        from: string;
        to: string;
        fromCoord: { x: number; y: number };
        toCoord: { x: number; y: number };
        status: 'on_time' | 'delayed' | 'cancelled' | 'crew_grounded';
        flightIds: string[];
      }
    >();

    for (const f of flights) {
      const fromCoord = airportCoords.get(f.origin);
      const toCoord = airportCoords.get(f.destination);
      if (!fromCoord || !toCoord) continue;

      const key = [f.origin, f.destination].sort().join('-');
      const existing = routeMap.get(key);

      let status = f.status;
      if (existing) {
        existing.flightIds.push(f.flight_id);
        if (
          f.status === 'cancelled' ||
          f.status === 'crew_grounded' ||
          existing.status === 'cancelled' ||
          existing.status === 'crew_grounded'
        ) {
          status = 'cancelled';
        } else if (f.status === 'delayed' || existing.status === 'delayed') {
          status = 'delayed';
        } else {
          status = 'on_time';
        }
        existing.status = status;
      } else {
        routeMap.set(key, {
          id: key,
          from: f.origin,
          to: f.destination,
          fromCoord,
          toCoord,
          status,
          flightIds: [f.flight_id],
        });
      }
    }

    return Array.from(routeMap.values());
  }, [flights, airportCoords]);

  return (
    <div
      data-testid="network-map"
      className="bg-gray-900 border border-gray-800 rounded-lg p-4 flex flex-col items-center shadow-md relative overflow-hidden"
    >
      <div className="w-full flex items-center justify-between mb-2">
        <div>
          <h2 className="text-sm font-bold text-gray-200 uppercase tracking-wider">
            Network Topology &amp; Delay Spread
          </h2>
          <p className="text-xs text-gray-400">
            Interactive India route corridors &bull; Click airport to filter
          </p>
        </div>
        {selectedAirport && (
          <button
            type="button"
            onClick={() => onAirportClick('')}
            className="text-xs bg-gray-800 hover:bg-gray-700 text-cyan-400 px-2.5 py-1 rounded border border-gray-700 transition-colors"
          >
            Clear Filter ({selectedAirport})
          </button>
        )}
      </div>

      <div className="w-full relative flex justify-center">
        <svg
          viewBox={`0 0 ${SVG_WIDTH} ${SVG_HEIGHT}`}
          className="w-full max-w-[500px] h-auto select-none"
          role="img"
          aria-label="India flight route network map"
        >
          <defs>
            <filter id="glow-cyan" x="-20%" y="-20%" width="140%" height="140%">
              <feGaussianBlur stdDeviation="3" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
            <filter id="glow-rose" x="-20%" y="-20%" width="140%" height="140%">
              <feGaussianBlur stdDeviation="4" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>

          {/* Background grid lines */}
          <g stroke="#1f2937" strokeWidth="0.5" strokeDasharray="3 3">
            <line x1={PADDING} y1={100} x2={SVG_WIDTH - PADDING} y2={100} />
            <line x1={PADDING} y1={250} x2={SVG_WIDTH - PADDING} y2={250} />
            <line x1={PADDING} y1={400} x2={SVG_WIDTH - PADDING} y2={400} />
            <line x1={150} y1={PADDING} x2={150} y2={SVG_HEIGHT - PADDING} />
            <line x1={300} y1={PADDING} x2={300} y2={SVG_HEIGHT - PADDING} />
            <line x1={450} y1={PADDING} x2={450} y2={SVG_HEIGHT - PADDING} />
          </g>

          {/* Flight Routes (Corridors) */}
          <g aria-label="Flight route segments">
            {routes.map((route) => {
              const isSelectedRoute =
                selectedFlight && route.flightIds.includes(selectedFlight);
              const connectsSelectedAirport =
                selectedAirport &&
                (route.from === selectedAirport || route.to === selectedAirport);

              let stroke = '#4b5563'; // on-time muted gray
              let strokeWidth = 1.2;
              let strokeDasharray = undefined;
              let opacity = 0.35;

              if (route.status === 'cancelled') {
                stroke = '#f43f5e'; // rose/red
                strokeWidth = 2.0;
                strokeDasharray = '4 3';
                opacity = 0.85;
              } else if (route.status === 'delayed') {
                stroke = '#f59e0b'; // amber
                strokeWidth = 1.8;
                opacity = 0.75;
              }

              if (isSelectedRoute) {
                stroke = '#06b6d4'; // cyan
                strokeWidth = 3.5;
                strokeDasharray = undefined;
                opacity = 1.0;
              } else if (connectsSelectedAirport) {
                strokeWidth = 2.5;
                opacity = 0.95;
              }

              // Quadratic curve for gentle arc
              const midX = (route.fromCoord.x + route.toCoord.x) / 2;
              const midY = (route.fromCoord.y + route.toCoord.y) / 2;
              const dx = route.toCoord.x - route.fromCoord.x;
              const dy = route.toCoord.y - route.fromCoord.y;
              // Normal offset
              const curveFactor = 0.12;
              const cx = midX - dy * curveFactor;
              const cy = midY + dx * curveFactor;

              const pathD = `M ${route.fromCoord.x} ${route.fromCoord.y} Q ${cx} ${cy} ${route.toCoord.x} ${route.toCoord.y}`;

              return (
                <path
                  key={route.id}
                  d={pathD}
                  fill="none"
                  stroke={stroke}
                  strokeWidth={strokeWidth}
                  strokeDasharray={strokeDasharray}
                  strokeOpacity={opacity}
                  filter={isSelectedRoute ? 'url(#glow-cyan)' : undefined}
                  className="transition-all duration-200 cursor-pointer hover:stroke-cyan-400 hover:stroke-opacity-100"
                  onClick={() => {
                    if (route.flightIds.length > 0) {
                      onFlightClick(route.flightIds[0]);
                    }
                  }}
                >
                  <title>
                    Route {route.from} ↔ {route.to} ({route.flightIds.join(', ')}) - Status: {route.status}
                  </title>
                </path>
              );
            })}
          </g>

          {/* Airport Nodes */}
          <g aria-label="Airport nodes">
            {airports.map((airport) => {
              const coord = airportCoords.get(airport.id);
              if (!coord) return null;

              const isClosed = airport.id === closedAirport;
              const isSelected = airport.id === selectedAirport;
              const stats = airportStats.get(airport.id);

              const radius =
                airport.tier === 'mega_hub' ? 7 : airport.tier === 'regional_hub' ? 5.5 : 4;

              let nodeColor = '#9ca3af'; // default gray
              if (isClosed) {
                nodeColor = '#ef4444'; // closed red
              } else if (isSelected) {
                nodeColor = '#06b6d4'; // selected cyan
              } else if (stats && stats.cancelled > 0) {
                nodeColor = '#f43f5e';
              } else if (stats && stats.delayed > 0) {
                nodeColor = '#f59e0b';
              }

              return (
                <g
                  key={airport.id}
                  transform={`translate(${coord.x}, ${coord.y})`}
                  className="cursor-pointer group"
                  onClick={() => onAirportClick(airport.id)}
                  tabIndex={0}
                  role="button"
                  aria-label={`${airport.id} (${airport.city}): ${
                    isClosed
                      ? 'GROUND HALT CLOSED'
                      : `${stats?.delayed ?? 0} delayed, ${stats?.cancelled ?? 0} cancelled`
                  }`}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      onAirportClick(airport.id);
                    }
                  }}
                >
                  {/* Closed airport pulsing halo */}
                  {isClosed && (
                    <circle
                      r={radius + 8}
                      fill="none"
                      stroke="#ef4444"
                      strokeWidth="2"
                      strokeDasharray="4 2"
                      className="animate-spin origin-center"
                      filter="url(#glow-rose)"
                    />
                  )}

                  {/* Selected halo */}
                  {isSelected && (
                    <circle
                      r={radius + 5}
                      fill="none"
                      stroke="#06b6d4"
                      strokeWidth="2"
                      filter="url(#glow-cyan)"
                    />
                  )}

                  {/* Core airport dot */}
                  <circle
                    r={radius}
                    fill={nodeColor}
                    stroke="#030712"
                    strokeWidth="1.5"
                    className="group-hover:stroke-cyan-300 transition-colors"
                  />

                  {/* Airport code label */}
                  <text
                    x={radius + 4}
                    y={3}
                    fill={isClosed ? '#f87171' : isSelected ? '#38bdf8' : '#e5e7eb'}
                    fontSize="11"
                    fontWeight={isClosed || isSelected ? '700' : '600'}
                    fontFamily="monospace"
                    className="pointer-events-none drop-shadow-sm select-none"
                  >
                    {airport.id}
                  </text>

                  {/* Closure badge text */}
                  {isClosed && (
                    <text
                      x={radius + 4}
                      y={14}
                      fill="#f87171"
                      fontSize="9"
                      fontWeight="bold"
                      fontFamily="monospace"
                      className="pointer-events-none select-none"
                    >
                      CLOSED
                    </text>
                  )}
                </g>
              );
            })}
          </g>
        </svg>
      </div>

      {/* Map Legend */}
      <div className="w-full flex flex-wrap items-center justify-between text-[11px] text-gray-400 border-t border-gray-800 pt-2 mt-2 gap-2">
        <div className="flex items-center gap-3">
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-red-500 inline-block" /> Closed / Cancelled
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-amber-400 inline-block" /> Delayed Leg
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-gray-500 inline-block" /> On Time
          </span>
        </div>
        <div className="text-gray-400 font-mono text-[10px]">
          Hub sizes: Mega (DEL/BOM/BLR/HYD) &bull; Regional &bull; Spoke
        </div>
      </div>
    </div>
  );
}
