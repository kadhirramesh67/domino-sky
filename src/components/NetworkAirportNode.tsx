import type { KeyboardEvent } from 'react';
import type { Airport } from '../types/index';
import { AIRPORT_NODE_RADIUS } from '../constants/index';

interface NetworkAirportNodeProps {
  airport: Airport;
  coord: { x: number; y: number };
  isClosed: boolean;
  isSelected: boolean;
  stats?: { delayed: number; cancelled: number; total: number };
  onAirportClick: (id: string) => void;
}

/**
 * Renders an accessible, interactive airport node on the flight route map
 * with closure pulsing halo and keyboard activation.
 */
export default function NetworkAirportNode({
  airport,
  coord,
  isClosed,
  isSelected,
  stats,
  onAirportClick,
}: NetworkAirportNodeProps) {
  const radius =
    airport.tier === 'mega_hub'
      ? AIRPORT_NODE_RADIUS.MEGA_HUB
      : airport.tier === 'regional_hub'
      ? AIRPORT_NODE_RADIUS.REGIONAL_HUB
      : AIRPORT_NODE_RADIUS.SPOKE;

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

  const handleKeyDown = (e: KeyboardEvent<SVGGElement>): void => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onAirportClick(airport.id);
    }
  };

  const ariaLabelText = `${airport.id} (${airport.city}): ${
    isClosed
      ? 'GROUND HALT CLOSED'
      : `${stats?.delayed ?? 0} delayed, ${stats?.cancelled ?? 0} cancelled`
  }`;

  return (
    <g
      transform={`translate(${coord.x}, ${coord.y})`}
      className="cursor-pointer group"
      onClick={() => onAirportClick(airport.id)}
      tabIndex={0}
      role="button"
      aria-label={ariaLabelText}
      onKeyDown={handleKeyDown}
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
}
