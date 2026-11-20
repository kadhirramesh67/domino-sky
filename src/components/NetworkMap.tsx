import { useMemo } from 'react';
import type { Airport } from '../types/index';
import type { SimulatedFlight } from '../types/simulation';
import { MAP_GEOMETRY, FLIGHT_STATUS } from '../constants/index';
import NetworkRouteCorridor, { type NetworkRouteData } from './NetworkRouteCorridor';
import NetworkAirportNode from './NetworkAirportNode';

interface NetworkMapProps {
  airports: Airport[];
  flights: SimulatedFlight[];
  closedAirport: string;
  selectedAirport: string | null;
  selectedFlight: string | null;
  onAirportClick: (id: string) => void;
  onFlightClick: (id: string) => void;
}

/**
 * Projects geographical lat/lng coordinates to SVG 2D space.
 */
function project(lat: number, lng: number): { x: number; y: number } {
  const { MIN_LAT, MAX_LAT, MIN_LNG, MAX_LNG, SVG_WIDTH, SVG_HEIGHT, PADDING } = MAP_GEOMETRY;
  const x = PADDING + ((lng - MIN_LNG) / (MAX_LNG - MIN_LNG)) * (SVG_WIDTH - 2 * PADDING);
  const y = SVG_HEIGHT - PADDING - ((lat - MIN_LAT) / (MAX_LAT - MIN_LAT)) * (SVG_HEIGHT - 2 * PADDING);
  return { x, y };
}

/**
 * Interactive SVG map illustrating the flight network topology,
 * route corridors, delay propagation, and airport closure states.
 */
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
        if (f.status === FLIGHT_STATUS.DELAYED) orig.delayed++;
        if (f.status === FLIGHT_STATUS.CANCELLED || f.status === FLIGHT_STATUS.CREW_GROUNDED) {
          orig.cancelled++;
        }
      }
      const dest = stats.get(f.destination);
      if (dest) {
        dest.total++;
        if (f.status === FLIGHT_STATUS.DELAYED) dest.delayed++;
        if (f.status === FLIGHT_STATUS.CANCELLED || f.status === FLIGHT_STATUS.CREW_GROUNDED) {
          dest.cancelled++;
        }
      }
    }
    return stats;
  }, [airports, flights]);

  // Unique route pairs with worst status for rendering flight corridors
  const routes = useMemo<NetworkRouteData[]>(() => {
    const routeMap = new Map<string, NetworkRouteData>();

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
          f.status === FLIGHT_STATUS.CANCELLED ||
          f.status === FLIGHT_STATUS.CREW_GROUNDED ||
          existing.status === FLIGHT_STATUS.CANCELLED ||
          existing.status === FLIGHT_STATUS.CREW_GROUNDED
        ) {
          status = FLIGHT_STATUS.CANCELLED;
        } else if (f.status === FLIGHT_STATUS.DELAYED || existing.status === FLIGHT_STATUS.DELAYED) {
          status = FLIGHT_STATUS.DELAYED;
        } else {
          status = FLIGHT_STATUS.ON_TIME;
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

  const { SVG_WIDTH, SVG_HEIGHT, PADDING } = MAP_GEOMETRY;

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
                selectedFlight !== null && route.flightIds.includes(selectedFlight);
              const connectsSelectedAirport =
                selectedAirport !== null &&
                (route.from === selectedAirport || route.to === selectedAirport);

              return (
                <NetworkRouteCorridor
                  key={route.id}
                  route={route}
                  isSelectedRoute={isSelectedRoute}
                  connectsSelectedAirport={connectsSelectedAirport}
                  onFlightClick={onFlightClick}
                />
              );
            })}
          </g>

          {/* Airport Nodes */}
          <g aria-label="Airport nodes">
            {airports.map((airport) => {
              const coord = airportCoords.get(airport.id);
              if (!coord) return null;

              return (
                <NetworkAirportNode
                  key={airport.id}
                  airport={airport}
                  coord={coord}
                  isClosed={airport.id === closedAirport}
                  isSelected={airport.id === selectedAirport}
                  stats={airportStats.get(airport.id)}
                  onAirportClick={onAirportClick}
                />
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
