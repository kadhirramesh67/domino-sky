import { useState, useMemo } from 'react';
import type { SimulatedFlight, BrokenConnection } from '../types/simulation';
import { formatTime } from '../engine/timeUtils';

interface FlightCascadeTableProps {
  flights: SimulatedFlight[];
  brokenConnections: BrokenConnection[];
  selectedAirport: string | null;
  selectedFlight: string | null;
  onFlightSelect: (id: string) => void;
}

type StatusFilter = 'all' | 'delayed' | 'cancelled' | 'crew_grounded' | 'on_time';

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
        if (statusFilter === 'delayed' && f.status !== 'delayed') return false;
        if (statusFilter === 'cancelled' && f.status !== 'cancelled') return false;
        if (statusFilter === 'crew_grounded' && f.status !== 'crew_grounded') return false;
        if (statusFilter === 'on_time' && f.status !== 'on_time') return false;
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

  const getStatusBadge = (flight: SimulatedFlight) => {
    switch (flight.status) {
      case 'on_time':
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold bg-emerald-950 text-emerald-400 border border-emerald-800">
            ON TIME
          </span>
        );
      case 'delayed':
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold bg-amber-950 text-amber-300 border border-amber-800">
            +{flight.delayMinutes}m DELAY
          </span>
        );
      case 'cancelled':
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold bg-rose-950 text-rose-300 border border-rose-800">
            CANCELLED
          </span>
        );
      case 'crew_grounded':
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold bg-red-950 text-red-400 border border-red-700">
            CREW GROUNDED
          </span>
        );
    }
  };

  const formatCausalReason = (flight: SimulatedFlight) => {
    if (flight.status === 'on_time') {
      return <span className="text-gray-400">Operating normal schedule</span>;
    }
    if (flight.status === 'cancelled') {
      return (
        <span className="text-rose-400 font-semibold">
          Cancelled by operations / recovery action
        </span>
      );
    }
    if (flight.status === 'crew_grounded') {
      return (
        <div className="space-y-0.5">
          <span className="text-rose-300 font-semibold">
            🚨 Crew Duty Exceeded (&gt;600m duty limit)
          </span>
          {flight.breachMinutes > 0 && (
            <div className="text-[11px] text-rose-400">
              Arrival would breach by +{flight.breachMinutes} min
            </div>
          )}
        </div>
      );
    }

    if (flight.reason === 'DIRECT_DEPARTURE_HOLD') {
      return (
        <span className="text-amber-300">
          Direct departure hold at {flight.origin} (airport closed)
        </span>
      );
    }
    if (flight.reason === 'DIRECT_ARRIVAL_HOLD') {
      return (
        <span className="text-amber-300">
          Direct arrival hold at {flight.destination} (airport closed)
        </span>
      );
    }
    if (flight.reason === 'INBOUND_ROTATION_DELAY') {
      return (
        <div className="space-y-0.5">
          <span className="text-amber-400">
            Inbound aircraft turnaround ({flight.causedByFlightId ?? 'prior leg'})
          </span>
          {flight.causalChain && flight.causalChain.length > 0 && (
            <div className="text-[10px] text-gray-400 flex items-center gap-1 font-mono flex-wrap">
              <span>Cascade:</span>
              {flight.causalChain.map((link, idx) => (
                <span key={idx} className="bg-gray-800 px-1 py-0.5 rounded text-gray-300">
                  {link.flightId} (+{link.delayMinutes}m)
                  {idx < flight.causalChain.length - 1 ? ' → ' : ''}
                </span>
              ))}
            </div>
          )}
        </div>
      );
    }

    return <span className="text-gray-400">—</span>;
  };

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
            {(
              [
                ['all', 'All'],
                ['delayed', 'Delayed'],
                ['cancelled', 'Cancelled'],
                ['crew_grounded', 'Grounded'],
              ] as const
            ).map(([val, label]) => (
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
                  <tr
                    key={flight.flight_id}
                    onClick={() => onFlightSelect(flight.flight_id)}
                    className={`cursor-pointer transition-colors ${
                      isSelected
                        ? 'bg-cyan-950/70 border-l-4 border-cyan-400 text-cyan-100'
                        : flight.status === 'cancelled' || flight.status === 'crew_grounded'
                        ? 'hover:bg-rose-950/30'
                        : flight.status === 'delayed'
                        ? 'hover:bg-amber-950/30'
                        : 'hover:bg-gray-800/40'
                    }`}
                  >
                    {/* Flight / Tail */}
                    <td className="px-3 py-2 font-bold whitespace-nowrap">
                      <div className="flex items-center gap-1.5">
                        <span className="text-cyan-300">{flight.flight_id}</span>
                        <span className="text-[10px] text-gray-400 font-normal">
                          {flight.tail_id} (L{flight.leg_order})
                        </span>
                      </div>
                    </td>

                    {/* Route */}
                    <td className="px-3 py-2 whitespace-nowrap font-semibold">
                      <span>{flight.origin}</span>
                      <span className="text-gray-400 mx-1">→</span>
                      <span>{flight.destination}</span>
                    </td>

                    {/* Scheduled */}
                    <td className="px-3 py-2 text-gray-300 whitespace-nowrap">
                      {formatTime(flight.scheduledDep)} – {formatTime(flight.scheduledArr)}
                    </td>

                    {/* Actual */}
                    <td className="px-3 py-2 whitespace-nowrap">
                      {flight.status === 'cancelled' || flight.status === 'crew_grounded' ? (
                        <span className="text-rose-400 font-semibold">—</span>
                      ) : (
                        <span
                          className={
                            flight.delayMinutes > 0 ? 'text-amber-300 font-semibold' : 'text-gray-300'
                          }
                        >
                          {formatTime(flight.actualDep)} – {formatTime(flight.actualArr)}
                        </span>
                      )}
                    </td>

                    {/* Status / Delay */}
                    <td className="px-3 py-2 whitespace-nowrap">
                      {getStatusBadge(flight)}
                    </td>

                    {/* Pax / Broken Conns */}
                    <td className="px-3 py-2 whitespace-nowrap">
                      <div className="flex flex-col">
                        <span className="text-gray-200">{flight.pax} pax</span>
                        {brokenConns.length > 0 && (
                          <span className="text-[10px] text-purple-300 font-bold">
                            ⚠️ {brokenConns.reduce((s, c) => s + c.passengers, 0)} missed conn
                          </span>
                        )}
                      </div>
                    </td>

                    {/* Causal Chain */}
                    <td className="px-3 py-2 text-xs">
                      {formatCausalReason(flight)}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
