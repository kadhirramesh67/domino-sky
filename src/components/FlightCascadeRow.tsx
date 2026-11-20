import type { SimulatedFlight, BrokenConnection } from '../types/simulation';
import { formatTime } from '../engine/timeUtils';
import { FLIGHT_STATUS, DELAY_REASONS } from '../constants/index';

interface FlightCascadeRowProps {
  flight: SimulatedFlight;
  isSelected: boolean;
  brokenConns: BrokenConnection[];
  onFlightSelect: (id: string) => void;
}

/**
 * Renders the visual status badge for a flight leg.
 */
function renderStatusBadge(flight: SimulatedFlight) {
  switch (flight.status) {
    case FLIGHT_STATUS.ON_TIME:
      return (
        <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold bg-emerald-950 text-emerald-400 border border-emerald-800">
          ON TIME
        </span>
      );
    case FLIGHT_STATUS.DELAYED:
      return (
        <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold bg-amber-950 text-amber-300 border border-amber-800">
          +{flight.delayMinutes}m DELAY
        </span>
      );
    case FLIGHT_STATUS.CANCELLED:
      return (
        <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold bg-rose-950 text-rose-300 border border-rose-800">
          CANCELLED
        </span>
      );
    case FLIGHT_STATUS.CREW_GROUNDED:
      return (
        <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold bg-red-950 text-red-400 border border-red-700">
          CREW GROUNDED
        </span>
      );
  }
}

/**
 * Explains the causal root cause or domino propagation chain for delayed/grounded legs.
 */
function renderCausalReason(flight: SimulatedFlight) {
  if (flight.status === FLIGHT_STATUS.ON_TIME) {
    return <span className="text-gray-400">Operating normal schedule</span>;
  }
  if (flight.status === FLIGHT_STATUS.CANCELLED) {
    return (
      <span className="text-rose-400 font-semibold">
        Cancelled by operations / recovery action
      </span>
    );
  }
  if (flight.status === FLIGHT_STATUS.CREW_GROUNDED) {
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

  if (flight.reason === DELAY_REASONS.DIRECT_DEPARTURE_HOLD) {
    return (
      <span className="text-amber-300">
        Direct departure hold at {flight.origin} (airport closed)
      </span>
    );
  }
  if (flight.reason === DELAY_REASONS.DIRECT_ARRIVAL_HOLD) {
    return (
      <span className="text-amber-300">
        Direct arrival hold at {flight.destination} (airport closed)
      </span>
    );
  }
  if (flight.reason === DELAY_REASONS.INBOUND_ROTATION_DELAY) {
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
}

/**
 * Single table row rendering detailed flight status, actual vs scheduled times,
 * passenger impact, and causal chain explanations.
 */
export default function FlightCascadeRow({
  flight,
  isSelected,
  brokenConns,
  onFlightSelect,
}: FlightCascadeRowProps) {
  const isCancelledOrGrounded =
    flight.status === FLIGHT_STATUS.CANCELLED || flight.status === FLIGHT_STATUS.CREW_GROUNDED;

  return (
    <tr
      onClick={() => onFlightSelect(flight.flight_id)}
      className={`cursor-pointer transition-colors ${
        isSelected
          ? 'bg-cyan-950/70 border-l-4 border-cyan-400 text-cyan-100'
          : isCancelledOrGrounded
          ? 'hover:bg-rose-950/30'
          : flight.status === FLIGHT_STATUS.DELAYED
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
        {isCancelledOrGrounded ? (
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
        {renderStatusBadge(flight)}
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
        {renderCausalReason(flight)}
      </td>
    </tr>
  );
}
