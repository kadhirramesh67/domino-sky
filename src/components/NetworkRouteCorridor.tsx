import type { FlightStatus } from '../types/simulation';
import { MAP_GEOMETRY, FLIGHT_STATUS } from '../constants/index';

export interface NetworkRouteData {
  id: string;
  from: string;
  to: string;
  fromCoord: { x: number; y: number };
  toCoord: { x: number; y: number };
  status: FlightStatus;
  flightIds: string[];
}

interface NetworkRouteCorridorProps {
  route: NetworkRouteData;
  isSelectedRoute: boolean;
  connectsSelectedAirport: boolean;
  onFlightClick: (id: string) => void;
}

/**
 * Renders an interactive curved SVG flight corridor between two airports
 * with dynamic delay and disruption styling.
 */
export default function NetworkRouteCorridor({
  route,
  isSelectedRoute,
  connectsSelectedAirport,
  onFlightClick,
}: NetworkRouteCorridorProps) {
  let stroke = '#4b5563'; // on-time muted gray
  let strokeWidth = 1.2;
  let strokeDasharray: string | undefined = undefined;
  let opacity = 0.35;

  if (route.status === FLIGHT_STATUS.CANCELLED || route.status === FLIGHT_STATUS.CREW_GROUNDED) {
    stroke = '#f43f5e'; // rose/red
    strokeWidth = 2.0;
    strokeDasharray = '4 3';
    opacity = 0.85;
  } else if (route.status === FLIGHT_STATUS.DELAYED) {
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
  const cx = midX - dy * MAP_GEOMETRY.CURVE_FACTOR;
  const cy = midY + dx * MAP_GEOMETRY.CURVE_FACTOR;

  const pathD = `M ${route.fromCoord.x} ${route.fromCoord.y} Q ${cx} ${cy} ${route.toCoord.x} ${route.toCoord.y}`;

  const handleRouteClick = (): void => {
    const firstFlightId = route.flightIds[0];
    if (firstFlightId) {
      onFlightClick(firstFlightId);
    }
  };

  return (
    <path
      d={pathD}
      fill="none"
      stroke={stroke}
      strokeWidth={strokeWidth}
      strokeDasharray={strokeDasharray}
      strokeOpacity={opacity}
      filter={isSelectedRoute ? 'url(#glow-cyan)' : undefined}
      className="transition-all duration-200 cursor-pointer hover:stroke-cyan-400 hover:stroke-opacity-100"
      onClick={handleRouteClick}
    >
      <title>
        Route {route.from} ↔ {route.to} ({route.flightIds.join(', ')}) - Status: {route.status}
      </title>
    </path>
  );
}
