import type { SimulationResult } from '../types/simulation';
import type { RecoveryCandidate } from '../types/recovery';
import { formatTime } from './timeUtils';
import { VALIDATION_LIMITS, TIME_CONSTANTS } from '../constants/index';

/**
 * Generates a deterministic plain-language OCC dispatch summary
 * using ONLY ground-truth numbers from the simulation engine.
 * Serves as reliable fallback when AI is unavailable or produces ungrounded figures.
 *
 * @param result Simulation execution result
 * @param candidates Evaluated recovery action candidates
 * @returns Grounded plain-text operational dispatch briefing
 */
export function generateTemplateDispatch(
  result: SimulationResult,
  candidates: RecoveryCandidate[]
): string {
  const { input, metrics, brokenConnections, crewBreaches } = result;
  const closeStart = input.startTime;
  const closeEndMins = (() => {
    const parts = input.startTime.split(':');
    const startH = parseInt(parts[0] ?? '0', 10);
    const startM = parseInt(parts[1] ?? '0', 10);
    const startMins = startH * TIME_CONSTANTS.MINUTES_IN_HOUR + startM;
    return startMins + input.durationMinutes;
  })();
  const closeEnd = formatTime(closeEndMins);

  const lines: string[] = [];

  lines.push(
    `DISPATCH SUMMARY — ${input.airport} closed ${closeStart}–${closeEnd} IST (${input.durationMinutes} min)`
  );
  lines.push('');

  lines.push('IMPACT:');
  lines.push(
    `• ${metrics.delayedFlightsCount} flights delayed (total ${metrics.totalDelayMinutes} min, max ${metrics.maxDelayMinutes} min single flight)`
  );
  lines.push(`• ${metrics.cancelledFlightsCount} flights cancelled or crew-grounded`);
  lines.push(`• ${metrics.totalStrandedPax} passengers stranded`);
  lines.push(`  — ${metrics.cancelledOrGroundedPax} on cancelled/grounded flights`);
  lines.push(`  — ${metrics.missedConnectionPax} missed connections`);
  lines.push(
    `• ${metrics.brokenConnectionsCount} broken connections, ${metrics.crewBreachCount} crew duty breach(es)`
  );
  lines.push(`• ${metrics.affectedAirportsCount} airports affected`);
  lines.push('');

  if (brokenConnections.length > 0) {
    const missed = brokenConnections.filter((c) => c.countsInMissedPax);
    if (missed.length > 0) {
      lines.push('BROKEN CONNECTIONS:');
      for (const conn of missed.slice(0, 4)) {
        lines.push(
          `• ${conn.connection_id} at ${conn.airport}: ${conn.from_flight}→${conn.to_flight} gap ${conn.actualGapMinutes}m (need ${conn.min_connect_minutes}m) — ${conn.passengers} pax stranded`
        );
      }
      if (missed.length > 4) lines.push(`• …and ${missed.length - 4} more`);
      lines.push('');
    }
  }

  if (crewBreaches.length > 0) {
    lines.push('CREW DUTY BREACHES:');
    for (const breach of crewBreaches) {
      lines.push(
        `• ${breach.crew_id} on ${breach.tail_id}: ${breach.dutyMinutes} min duty (limit ${breach.maxDutyMins} min, breach +${breach.breachMinutes} min)`
      );
    }
    lines.push('');
  }

  if (candidates.length > 0) {
    lines.push('RECOMMENDED RECOVERY ACTIONS (ranked):');
    const topCandidates = candidates.slice(
      0,
      Math.min(candidates.length, VALIDATION_LIMITS.MAX_DISPLAYED_RECOVERY_ACTIONS)
    );
    for (let i = 0; i < topCandidates.length; i++) {
      const c = topCandidates[i];
      if (!c) continue;
      const d = c.delta;
      const paxDelta =
        d.deltaStrandedPax < 0
          ? `saves ${-d.deltaStrandedPax} pax`
          : `adds ${d.deltaStrandedPax} pax`;
      const delayDelta =
        d.deltaDelayMinutes < 0
          ? `cuts ${-d.deltaDelayMinutes} delay-min`
          : `adds ${d.deltaDelayMinutes} delay-min`;
      lines.push(`${i + 1}. ${c.action.label} — ${paxDelta}, ${delayDelta}`);
      lines.push(`   ${c.action.description}`);
    }
  } else {
    lines.push('No significant recovery actions identified. Monitor situation.');
  }

  return lines.join('\n');
}
