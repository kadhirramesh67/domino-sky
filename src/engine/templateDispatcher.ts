import type { SimulationResult } from '../types/simulation';
import type { RecoveryCandidate } from '../types/recovery';
import { formatTime } from './timeUtils';

/**
 * Generate a crisp deterministic plain-language dispatch summary
 * using ONLY numbers from the simulation engine. This is the fallback
 * when AI is unavailable or numeric verification fails.
 */
export function generateTemplateDispatch(
  result: SimulationResult,
  candidates: RecoveryCandidate[]
): string {
  const { input, metrics, brokenConnections, crewBreaches } = result;
  const closeStart = input.startTime;
  const closeEndMins = (() => {
    const parts = input.startTime.split(':');
    const startMins = parseInt(parts[0], 10) * 60 + parseInt(parts[1], 10);
    return startMins + input.durationMinutes;
  })();
  const closeEnd = formatTime(closeEndMins);

  const lines: string[] = [];

  lines.push(
    `DISPATCH SUMMARY — ${input.airport} closed ${closeStart}–${closeEnd} IST (${input.durationMinutes} min)`
  );
  lines.push('');

  lines.push('IMPACT:');
  lines.push(`• ${metrics.delayedFlightsCount} flights delayed (total ${metrics.totalDelayMinutes} min, max ${metrics.maxDelayMinutes} min single flight)`);
  lines.push(`• ${metrics.cancelledFlightsCount} flights cancelled or crew-grounded`);
  lines.push(`• ${metrics.totalStrandedPax} passengers stranded`);
  lines.push(`  — ${metrics.cancelledOrGroundedPax} on cancelled/grounded flights`);
  lines.push(`  — ${metrics.missedConnectionPax} missed connections`);
  lines.push(`• ${metrics.brokenConnectionsCount} broken connections, ${metrics.crewBreachCount} crew duty breach(es)`);
  lines.push(`• ${metrics.affectedAirportsCount} airports affected`);
  lines.push('');

  if (brokenConnections.length > 0) {
    const missed = brokenConnections.filter(c => c.countsInMissedPax);
    if (missed.length > 0) {
      lines.push('BROKEN CONNECTIONS:');
      for (const conn of missed.slice(0, 4)) {
        lines.push(`• ${conn.connection_id} at ${conn.airport}: ${conn.from_flight}→${conn.to_flight} gap ${conn.actualGapMinutes}m (need ${conn.min_connect_minutes}m) — ${conn.passengers} pax stranded`);
      }
      if (missed.length > 4) lines.push(`• …and ${missed.length - 4} more`);
      lines.push('');
    }
  }

  if (crewBreaches.length > 0) {
    lines.push('CREW DUTY BREACHES:');
    for (const breach of crewBreaches) {
      lines.push(`• ${breach.crew_id} on ${breach.tail_id}: ${breach.dutyMinutes} min duty (limit ${breach.maxDutyMins} min, breach +${breach.breachMinutes} min)`);
    }
    lines.push('');
  }

  if (candidates.length > 0) {
    lines.push('RECOMMENDED RECOVERY ACTIONS (ranked):');
    for (let i = 0; i < Math.min(candidates.length, 3); i++) {
      const c = candidates[i];
      const d = c.delta;
      const paxDelta = d.deltaStrandedPax < 0 ? `saves ${-d.deltaStrandedPax} pax` : `adds ${d.deltaStrandedPax} pax`;
      const delayDelta = d.deltaDelayMinutes < 0 ? `cuts ${-d.deltaDelayMinutes} delay-min` : `adds ${d.deltaDelayMinutes} delay-min`;
      lines.push(`${i + 1}. ${c.action.label} — ${paxDelta}, ${delayDelta}`);
      lines.push(`   ${c.action.description}`);
    }
  } else {
    lines.push('No significant recovery actions identified. Monitor situation.');
  }

  return lines.join('\n');
}
