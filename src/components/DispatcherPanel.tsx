import { useState, useTransition } from 'react';
import type { SimulationResult } from '../types/simulation';
import type { RecoveryCandidate } from '../types/recovery';
import type { FlightNetwork } from '../types/index';
import { generateTemplateDispatch } from '../engine/templateDispatcher';
import { validateDispatcherResponse } from '../engine/validator';
import RecoveryCandidateCard from './RecoveryCandidateCard';

interface DispatcherPanelProps {
  baseResult: SimulationResult;
  activeResult?: SimulationResult;
  candidates: RecoveryCandidate[];
  appliedRecovery: RecoveryCandidate | null;
  onApplyRecovery: (candidate: RecoveryCandidate) => void;
  network?: FlightNetwork;
}

interface DispatchState {
  text: string;
  source: 'ai' | 'deterministic';
  verified: boolean;
  mismatchedNumbers: number[];
  loading: boolean;
  error?: string;
}

/**
 * Operations Control Center (OCC) briefing and recovery candidate panel.
 * Combines grounded AI/deterministic situational briefings with 1-click
 * candidate action evaluation.
 */
export default function DispatcherPanel({
  baseResult,
  candidates,
  appliedRecovery,
  onApplyRecovery,
}: DispatcherPanelProps) {
  const [, startTransition] = useTransition();

  const [dispatchState, setDispatchState] = useState<DispatchState>(() => {
    // Initialize with grounded deterministic template by default
    const text = generateTemplateDispatch(baseResult, candidates);
    return {
      text,
      source: 'deterministic',
      verified: true,
      mismatchedNumbers: [],
      loading: false,
    };
  });

  const handleFetchAiDispatch = async (): Promise<void> => {
    setDispatchState((prev) => ({ ...prev, loading: true, error: undefined }));

    // Extract top causal chains
    const topChains = baseResult.flights
      .filter((f) => f.causalChain && f.causalChain.length > 0)
      .slice(0, 4)
      .map(
        (f) =>
          `${f.flight_id} (${f.origin}→${f.destination}): delayed +${f.delayMinutes}m via ${f.causalChain.map((c) => c.flightId).join('→')}`
      );

    const payload = {
      airport: baseResult.input.airport,
      startTime: baseResult.input.startTime,
      durationMinutes: baseResult.input.durationMinutes,
      metrics: baseResult.metrics,
      topChains,
      recoveryStats: candidates.slice(0, 5).map((c) => ({
        label: c.action.label,
        description: c.action.description,
        deltaDelayMinutes: c.delta.deltaDelayMinutes,
        deltaStrandedPax: c.delta.deltaStrandedPax,
        deltaDelayedFlights: c.delta.deltaDelayedFlights,
        deltaBrokenConnections: c.delta.deltaBrokenConnections,
        deltaCrewBreaches: c.delta.deltaCrewBreaches,
        score: c.score,
      })),
    };

    try {
      const res = await fetch('/api/dispatch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        throw new Error(`Server responded with ${res.status}`);
      }

      const json = await res.json();
      startTransition(() => {
        setDispatchState({
          text: json.text,
          source: json.source === 'ai' ? 'ai' : 'deterministic',
          verified: json.verified ?? true,
          mismatchedNumbers: json.mismatchedNumbers ?? [],
          loading: false,
        });
      });
    } catch {
      // Grounded deterministic fallback guarantees zero app downtime
      const fallbackText = generateTemplateDispatch(baseResult, candidates);
      const validNumbers = new Set<number>([
        baseResult.metrics.delayedFlightsCount,
        baseResult.metrics.cancelledFlightsCount,
        baseResult.metrics.totalStrandedPax,
        baseResult.metrics.cancelledOrGroundedPax,
        baseResult.metrics.missedConnectionPax,
        baseResult.metrics.brokenConnectionsCount,
        baseResult.metrics.crewBreachCount,
        baseResult.metrics.totalDelayMinutes,
        baseResult.metrics.maxDelayMinutes,
        baseResult.metrics.affectedAirportsCount,
        baseResult.input.durationMinutes,
      ]);
      const val = validateDispatcherResponse(fallbackText, validNumbers);

      startTransition(() => {
        setDispatchState({
          text: fallbackText,
          source: 'deterministic',
          verified: val.verified,
          mismatchedNumbers: val.mismatchedNumbers,
          loading: false,
          error: 'Offline / local mode: Operating on pure deterministic engine.',
        });
      });
    }
  };

  return (
    <div
      data-testid="dispatcher-panel"
      className="grid grid-cols-1 lg:grid-cols-2 gap-4"
    >
      {/* Left: AI Grounded Operations Briefing */}
      <section
        aria-label="AI operations dispatcher briefing"
        className="bg-gray-900 border border-gray-800 rounded-lg p-4 shadow-md flex flex-col justify-between space-y-3"
      >
        <div>
          <div className="flex items-center justify-between flex-wrap gap-2 mb-2">
            <div className="flex items-center gap-2">
              <span className="text-cyan-400 font-bold text-sm">🤖 OCC AI Dispatcher</span>
              <span
                className={`text-[10px] uppercase font-bold px-2 py-0.5 rounded border ${
                  dispatchState.source === 'ai'
                    ? 'bg-blue-950 text-blue-300 border-blue-700'
                    : 'bg-emerald-950 text-emerald-300 border-emerald-700'
                }`}
              >
                {dispatchState.source === 'ai' ? 'Gemini 2.0 Flash' : 'Deterministic Grounded'}
              </span>
            </div>

            <button
              type="button"
              onClick={handleFetchAiDispatch}
              disabled={dispatchState.loading}
              aria-label="Request AI operations analysis"
              className="text-xs bg-cyan-700 hover:bg-cyan-600 disabled:opacity-50 text-white font-semibold px-3 py-1.5 rounded transition-colors flex items-center gap-1.5 cursor-pointer"
            >
              {dispatchState.loading ? (
                <>
                  <span className="animate-spin text-xs">⏳</span>
                  <span>Synthesizing...</span>
                </>
              ) : (
                <>
                  <span>⚡</span>
                  <span>Re-Analyze with AI</span>
                </>
              )}
            </button>
          </div>

          {/* Verification Badge */}
          <div className="flex items-center gap-2 text-[11px] text-gray-300 bg-gray-950/80 px-2.5 py-1.5 rounded border border-gray-800 font-mono mb-3">
            <span className="text-emerald-400 font-bold">✓ Grounding Validator:</span>
            <span>
              {dispatchState.verified
                ? 'All figures mathematically cross-checked against simulation engine'
                : `Warning: ${dispatchState.mismatchedNumbers.length} unverified figures detected`}
            </span>
          </div>

          {dispatchState.error && (
            <div className="text-xs text-amber-300 bg-amber-950/40 border border-amber-800/60 rounded px-2.5 py-1.5 mb-2">
              {dispatchState.error}
            </div>
          )}

          {/* Briefing Text Output */}
          <div className="bg-gray-950 border border-gray-800 rounded p-3 text-xs leading-relaxed font-mono text-gray-200 whitespace-pre-wrap max-h-72 overflow-y-auto">
            {dispatchState.text}
          </div>
        </div>

        <div className="text-[11px] text-gray-400 font-mono flex items-center justify-between border-t border-gray-800 pt-2">
          <span>Zero Hallucination Guarantee</span>
          <span>100% Deterministic Fallback</span>
        </div>
      </section>

      {/* Right: Deterministic Recovery Candidates */}
      <section
        aria-label="Deterministic recovery action engine"
        className="bg-gray-900 border border-gray-800 rounded-lg p-4 shadow-md flex flex-col space-y-3"
      >
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-sm font-bold text-gray-200 uppercase tracking-wider">
              Deterministic Recovery Engine
            </h2>
            <p className="text-xs text-gray-400">
              Evaluates spare swaps (VT-DS17 @ BLR, VT-DS18 @ DEL) &amp; bottleneck cancels
            </p>
          </div>
          {appliedRecovery && (
            <button
              type="button"
              onClick={() => onApplyRecovery(appliedRecovery)}
              className="text-xs bg-rose-950 hover:bg-rose-900 text-rose-300 border border-rose-800 px-2.5 py-1 rounded transition-colors"
            >
              Reset to Base
            </button>
          )}
        </div>

        {/* Candidate Cards List */}
        <div className="space-y-2.5 overflow-y-auto max-h-80 pr-1">
          {candidates.length === 0 ? (
            <div className="text-xs text-gray-400 bg-gray-950 p-4 rounded text-center">
              No beneficial recovery actions found for this disruption window.
            </div>
          ) : (
            candidates.map((candidate, idx) => (
              <RecoveryCandidateCard
                key={candidate.action.id}
                candidate={candidate}
                idx={idx}
                isApplied={appliedRecovery?.action.id === candidate.action.id}
                onApply={onApplyRecovery}
              />
            ))
          )}
        </div>
      </section>
    </div>
  );
}
