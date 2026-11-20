import type { ReactNode } from 'react';
import type { SimulationMetrics } from '../types/simulation';
import { formatDelay } from '../engine/timeUtils';

interface KPIStripProps {
  metrics: SimulationMetrics;
  baseMetrics: SimulationMetrics | null;
}

/**
 * Renders key operational metrics (delayed flights, cancelled legs, stranded pax,
 * broken connections, crew breaches, total delay) with Before vs After delta indicators.
 */
export default function KPIStrip({ metrics, baseMetrics }: KPIStripProps) {
  const renderDelta = (
    current: number,
    base: number | undefined,
    inverse = false // If inverse=true, negative is good (e.g. less delay, fewer stranded)
  ): ReactNode => {
    if (base === undefined || baseMetrics === null) return null;
    const diff = current - base;
    if (diff === 0) return <span className="text-gray-400 text-xs ml-1 font-mono">(0)</span>;

    const isGood = inverse ? diff < 0 : diff > 0;
    const prefix = diff > 0 ? '+' : '';
    const colorClass = isGood ? 'text-emerald-400' : 'text-rose-400';

    return (
      <span className={`${colorClass} text-xs font-semibold font-mono ml-1.5`}>
        {prefix}{diff}
      </span>
    );
  };

  const renderDelayDelta = (current: number, base: number | undefined): ReactNode => {
    if (base === undefined || baseMetrics === null) return null;
    const diff = current - base;
    if (diff === 0) return <span className="text-gray-400 text-xs ml-1 font-mono">(0m)</span>;
    const isGood = diff < 0;
    const prefix = diff > 0 ? '+' : '';
    const colorClass = isGood ? 'text-emerald-400' : 'text-rose-400';
    return (
      <span className={`${colorClass} text-xs font-semibold font-mono ml-1.5`}>
        {prefix}{diff}m
      </span>
    );
  };

  return (
    <section
      data-testid="kpi-strip"
      aria-label="Simulation operational cascade key performance indicators"
      aria-live="polite"
      className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3"
    >
      {/* Delayed Flights */}
      <div className="bg-gray-900 border border-gray-800 rounded-lg p-3 relative overflow-hidden">
        <div className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
          Delayed Flights
        </div>
        <div className="text-2xl font-bold font-mono text-amber-400 mt-1 flex items-baseline">
          <span>{metrics.delayedFlightsCount}</span>
          {renderDelta(metrics.delayedFlightsCount, baseMetrics?.delayedFlightsCount, true)}
        </div>
        <div className="text-[11px] text-gray-400 mt-1 font-mono">
          Max: +{metrics.maxDelayMinutes}m single leg
        </div>
      </div>

      {/* Cancelled / Grounded Flights */}
      <div className="bg-gray-900 border border-gray-800 rounded-lg p-3 relative overflow-hidden">
        <div className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
          Cancelled / Grounded
        </div>
        <div className="text-2xl font-bold font-mono text-rose-400 mt-1 flex items-baseline">
          <span>{metrics.cancelledFlightsCount}</span>
          {renderDelta(metrics.cancelledFlightsCount, baseMetrics?.cancelledFlightsCount, true)}
        </div>
        <div className="text-[11px] text-gray-400 mt-1 font-mono">
          Zero-ops legs
        </div>
      </div>

      {/* Stranded Pax */}
      <div className="bg-gray-900 border border-gray-800 rounded-lg p-3 relative overflow-hidden">
        <div className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
          Stranded Pax
        </div>
        <div className="text-2xl font-bold font-mono text-rose-300 mt-1 flex items-baseline">
          <span>{metrics.totalStrandedPax.toLocaleString()}</span>
          {renderDelta(metrics.totalStrandedPax, baseMetrics?.totalStrandedPax, true)}
        </div>
        <div className="text-[11px] text-gray-400 mt-1 font-mono">
          {metrics.cancelledOrGroundedPax} cxld + {metrics.missedConnectionPax} missed conn
        </div>
      </div>

      {/* Broken Connections */}
      <div className="bg-gray-900 border border-gray-800 rounded-lg p-3 relative overflow-hidden">
        <div className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
          Broken Connections
        </div>
        <div className="text-2xl font-bold font-mono text-purple-400 mt-1 flex items-baseline">
          <span>{metrics.brokenConnectionsCount}</span>
          {renderDelta(metrics.brokenConnectionsCount, baseMetrics?.brokenConnectionsCount, true)}
        </div>
        <div className="text-[11px] text-gray-400 mt-1 font-mono">
          Below min connect mins
        </div>
      </div>

      {/* Crew Breaches */}
      <div className="bg-gray-900 border border-gray-800 rounded-lg p-3 relative overflow-hidden">
        <div className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
          Crew Breaches
        </div>
        <div className="text-2xl font-bold font-mono text-orange-400 mt-1 flex items-baseline">
          <span>{metrics.crewBreachCount}</span>
          {renderDelta(metrics.crewBreachCount, baseMetrics?.crewBreachCount, true)}
        </div>
        <div className="text-[11px] text-gray-400 mt-1 font-mono">
          &gt;600m duty limit
        </div>
      </div>

      {/* Total Network Delay */}
      <div className="bg-gray-900 border border-gray-800 rounded-lg p-3 relative overflow-hidden">
        <div className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
          Total Delay
        </div>
        <div className="text-2xl font-bold font-mono text-cyan-400 mt-1 flex items-baseline">
          <span>{formatDelay(metrics.totalDelayMinutes)}</span>
          {renderDelayDelta(metrics.totalDelayMinutes, baseMetrics?.totalDelayMinutes)}
        </div>
        <div className="text-[11px] text-gray-400 mt-1 font-mono">
          Across {metrics.affectedAirportsCount} airports
        </div>
      </div>
    </section>
  );
}
