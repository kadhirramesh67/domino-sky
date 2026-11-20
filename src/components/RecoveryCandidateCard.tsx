import type { RecoveryCandidate } from '../types/recovery';
import { RECOVERY_ACTION_TYPES } from '../constants/index';

interface RecoveryCandidateCardProps {
  candidate: RecoveryCandidate;
  idx: number;
  isApplied: boolean;
  onApply: (candidate: RecoveryCandidate) => void;
}

/**
 * Renders a single recovery candidate card with before vs after deltas
 * (stranded passengers saved, delay reduced, crew breaches resolved).
 */
export default function RecoveryCandidateCard({
  candidate,
  idx,
  isApplied,
  onApply,
}: RecoveryCandidateCardProps) {
  const { action, delta } = candidate;
  const isSpare = action.type === RECOVERY_ACTION_TYPES.SPARE_SWAP;
  const paxSavings = -delta.deltaStrandedPax;
  const delaySavings = -delta.deltaDelayMinutes;

  return (
    <div
      className={`p-3 rounded-lg border transition-all ${
        isApplied
          ? 'bg-emerald-950/60 border-emerald-500 ring-1 ring-emerald-500'
          : 'bg-gray-950 border-gray-800 hover:border-gray-700'
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="text-xs font-bold text-gray-400 font-mono">
            #{idx + 1}
          </span>
          <span
            className={`text-[10px] uppercase font-bold px-1.5 py-0.5 rounded ${
              isSpare
                ? 'bg-blue-950 text-blue-300 border border-blue-800'
                : 'bg-amber-950 text-amber-300 border border-amber-800'
            }`}
          >
            {isSpare ? 'Spare Swap' : 'Cancel Pair'}
          </span>
          <span className="text-xs font-bold text-gray-100">{action.label}</span>
        </div>

        <button
          type="button"
          onClick={() => onApply(candidate)}
          aria-pressed={isApplied}
          aria-label={`${isApplied ? 'Revert' : 'Apply'} recovery action: ${action.label}`}
          className={`text-xs font-semibold px-2.5 py-1 rounded transition-colors cursor-pointer ${
            isApplied
              ? 'bg-emerald-600 text-white hover:bg-emerald-500'
              : 'bg-gray-800 hover:bg-cyan-700 text-cyan-200 hover:text-white border border-gray-700'
          }`}
        >
          {isApplied ? '✓ Applied' : 'Apply Recovery'}
        </button>
      </div>

      <p className="text-xs text-gray-400 mt-1.5 leading-snug">{action.description}</p>

      {/* Before vs After Deltas */}
      <div className="flex flex-wrap items-center gap-2 mt-2 pt-2 border-t border-gray-800/80 text-[11px] font-mono">
        <span
          className={`px-1.5 py-0.5 rounded ${
            paxSavings > 0
              ? 'bg-emerald-950 text-emerald-300'
              : paxSavings < 0
              ? 'bg-rose-950 text-rose-300'
              : 'text-gray-400'
          }`}
        >
          {paxSavings > 0 ? `+${paxSavings} pax saved` : `${paxSavings} pax`}
        </span>

        <span
          className={`px-1.5 py-0.5 rounded ${
            delaySavings > 0
              ? 'bg-emerald-950 text-emerald-300'
              : delaySavings < 0
              ? 'bg-rose-950 text-rose-300'
              : 'text-gray-400'
          }`}
        >
          {delaySavings > 0 ? `-${delaySavings}m total delay` : `${delaySavings}m delay`}
        </span>

        {delta.deltaCrewBreaches !== 0 && (
          <span className="px-1.5 py-0.5 rounded bg-purple-950 text-purple-300">
            {delta.deltaCrewBreaches < 0
              ? `${-delta.deltaCrewBreaches} breach cleared`
              : `+${delta.deltaCrewBreaches} breach`}
          </span>
        )}

        {delta.deltaBrokenConnections !== 0 && (
          <span className="px-1.5 py-0.5 rounded bg-blue-950 text-blue-300">
            {delta.deltaBrokenConnections < 0
              ? `${-delta.deltaBrokenConnections} conns fixed`
              : `+${delta.deltaBrokenConnections} broken`}
          </span>
        )}
      </div>
    </div>
  );
}
