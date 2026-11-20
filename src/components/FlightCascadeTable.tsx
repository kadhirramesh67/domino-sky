import { useState, useMemo } from 'react';
import type { SimulatedFlight, BrokenConnection } from '../types/simulation';
import { FLIGHT_STATUS } from '../constants/index';
import FlightCascadeRow from './FlightCascadeRow';

interface FlightCascadeTableProps {
  flights: SimulatedFlight[];
  brokenConnections: BrokenConnection[];
  selectedAirport: string | null;
  selectedFlight: string | null;
  onFlightSelect: (id: string) => void;
}

type StatusFilter = 'all' | 'delayed' | 'cancelled' | 'crew_grounded' | 'on_time';

const STATUS_FILTER_BUTTONS = [
  ['all', 'All'],
  ['delayed', 'Delayed'],
  ['cancelled', 'Cancelled'],
  ['crew_grounded', 'Grounded'],
] as const;

/**
 * Interactive tabular display of flight schedules, delays, causal chains,
 * and crew grounding status with instant multi-facet filtering.
 */
export default function FlightCascadeTable({
  flights,
  brokenConnections,
  selectedAirport,
  selectedFlight,
  onFlightSelect,
}: FlightCascadeTableProps) {
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [searchQuery, setSearchQuery] = useState('');

  // Map broken connections by flight id for quick lookup
  const connectionsByFlight = useMemo(() => {
    const map = new Map<string, BrokenConnection[]>();
    for (const c of brokenConnections) {
      const fromArr = map.get(c.from_flight) ?? [];
      fromArr.push(c);
      map.set(c.from_flight, fromArr);

      const toArr = map.get(c.to_flight) ?? [];
      toArr.push(c);
      map.set(c.to_flight, toArr);
    }
    return map;
  }, [brokenConnections]);

  const filteredFlights = useMemo(() => {
    return flights.filter((f) => {
      // Status filter
      if (statusFilter !== 'all') {
        if (statusFilter === 'delayed' && f.status !== FLIGHT_STATUS.DELAYED) return false;
        if (statusFilter === 'cancelled' && f.status !== FLIGHT_STATUS.CANCELLED) return false;
        if (statusFilter === 'crew_grounded' && f.status !== FLIGHT_STATUS.CREW_GROUNDED) return false;
        if (statusFilter === 'on_time' && f.status !== FLIGHT_STATUS.ON_TIME) return false;
      }

      // Airport filter
      if (selectedAirport) {
        if (f.origin !== selectedAirport && f.destination !== selectedAirport) {
          return false;
        }
      }

      // Search query
      if (searchQuery.trim()) {
        const q = searchQuery.trim().toLowerCase();
        const matchesId = f.flight_id.toLowerCase().includes(q);
        const matchesTail = f.tail_id.toLowerCase().includes(q);
        const matchesOrigin = f.origin.toLowerCase().includes(q);
        const matchesDest = f.destination.toLowerCase().includes(q);
        if (!matchesId && !matchesTail && !matchesOrigin && !matchesDest) return false;
      }

      return true;
    });
  }, [flights, statusFilter, selectedAirport, searchQuery]);

  return (
    <div
      data-testid="flight-cascade-table"
      className="bg-gray-900 border border-gray-800 rounded-lg p-4 shadow-md space-y-3"
    >
      {/* Header and Filter Controls */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-bold text-gray-200 uppercase tracking-wider">
            Flight Cascade Board ({filteredFlights.length} of {flights.length})
          </h2>
          <p className="text-xs text-gray-400">
            Real-time causal propagation &amp; crew duty status
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
          {/* Search box */}
          <input
            type="search"
            placeholder="Search flight, tail, city..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            aria-label="Search flights table"
            className="bg-gray-950 border border-gray-700 text-xs text-gray-200 px-2.5 py-1.5 rounded focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500 outline-none w-full sm:w-44"
          />

          {/* Status filter buttons */}
          <div className="inline-flex rounded-md shadow-xs bg-gray-950 p-0.5 border border-gray-800">
            {STATUS_FILTER_BUTTONS.map(([val, label]) => (
              <button
                key={val}
                type="button"
                onClick={() => setStatusFilter(val)}
                aria-pressed={statusFilter === val}
                className={`px-2.5 py-1 text-xs font-medium rounded transition-colors ${
                  statusFilter === val
                    ? 'bg-cyan-900 text-cyan-200 font-bold'
                    : 'text-gray-400 hover:text-gray-200'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto border border-gray-800 rounded">
        <table className="w-full text-left text-xs divide-y divide-gray-800 font-mono">
          <thead className="bg-gray-950/80 text-gray-400 uppercase text-[11px]">
            <tr>
              <th scope="col" className="px-3 py-2.5 font-semibold">
                Flight / Tail
              </th>
              <th scope="col" className="px-3 py-2.5 font-semibold">
                Route
              </th>
              <th scope="col" className="px-3 py-2.5 font-semibold">
                Sched (Dep–Arr)
              </th>
              <th scope="col" className="px-3 py-2.5 font-semibold">
                Actual (Dep–Arr)
              </th>
              <th scope="col" className="px-3 py-2.5 font-semibold">
                Status / Delay
              </th>
              <th scope="col" className="px-3 py-2.5 font-semibold">
                Pax / Conns
              </th>
              <th scope="col" className="px-3 py-2.5 font-semibold min-w-[200px]">
                Why Late / Causal Chain
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-800/60 bg-gray-900">
            {filteredFlights.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-gray-400">
                  No flights match current filter criteria.
                </td>
              </tr>
            ) : (
              filteredFlights.map((flight) => {
                const isSelected = selectedFlight === flight.flight_id;
                const flightConns = connectionsByFlight.get(flight.flight_id) ?? [];
                const brokenConns = flightConns.filter((c) => c.countsInMissedPax);

                return (
                  <FlightCascadeRow
                    key={flight.flight_id}
                    flight={flight}
                    isSelected={isSelected}
                    brokenConns={brokenConns}
                    onFlightSelect={onFlightSelect}
                  />
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
