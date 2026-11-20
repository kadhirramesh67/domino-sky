import { useState, useMemo, useCallback } from 'react';
import type { DisruptionInput, SimulationResult } from './types/simulation';
import type { RecoveryCandidate } from './types/recovery';
import { simulateDisruption } from './engine/simulateDisruption';
import { generateRecoveryCandidates } from './engine/recoveryEngine';
import { PRESETS } from './engine/presets';
import networkData from './data/flight_network.json';
import type { FlightNetwork } from './types/index';
import ControlBar from './components/ControlBar';
import KPIStrip from './components/KPIStrip';
import NetworkMap from './components/NetworkMap';
import FlightCascadeTable from './components/FlightCascadeTable';
import DispatcherPanel from './components/DispatcherPanel';

const network = networkData as FlightNetwork;

function App() {
  const [input, setInput] = useState<DisruptionInput>(PRESETS[0]);
  const [appliedRecovery, setAppliedRecovery] = useState<RecoveryCandidate | null>(null);
  const [selectedAirport, setSelectedAirport] = useState<string | null>(null);
  const [selectedFlight, setSelectedFlight] = useState<string | null>(null);

  const baseResult = useMemo<SimulationResult>(
    () => simulateDisruption(network, input),
    [input]
  );

  const recoveryResult = useMemo<SimulationResult | null>(() => {
    if (!appliedRecovery) return null;
    return simulateDisruption(network, input, appliedRecovery.action);
  }, [input, appliedRecovery]);

  const activeResult = recoveryResult ?? baseResult;

  const candidates = useMemo<RecoveryCandidate[]>(
    () => generateRecoveryCandidates(network, input, baseResult),
    [input, baseResult]
  );

  const handleApplyRecovery = useCallback((candidate: RecoveryCandidate) => {
    setAppliedRecovery(prev => prev?.action.id === candidate.action.id ? null : candidate);
  }, []);

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100 font-mono">
      <header className="border-b border-gray-800 px-4 py-3 flex items-center gap-3">
        <span className="text-cyan-400 text-xl" aria-hidden="true">✈</span>
        <h1 className="text-lg font-bold text-cyan-400 tracking-wider uppercase">
          Domino Sky
        </h1>
        <span className="text-gray-500 text-sm hidden sm:inline">
          Flight Disruption Cascade &amp; Recovery Simulator
        </span>
        {appliedRecovery && (
          <span className="ml-auto text-xs bg-emerald-900 text-emerald-300 px-2 py-1 rounded border border-emerald-700">
            Recovery Applied: {appliedRecovery.action.label}
          </span>
        )}
      </header>

      <main id="main-content" className="p-4 space-y-4">
        <ControlBar
          input={input}
          onInputChange={setInput}
          presets={PRESETS}
          airports={network.airports}
        />
        <KPIStrip
          metrics={activeResult.metrics}
          baseMetrics={appliedRecovery ? baseResult.metrics : null}
        />
        <div className="grid grid-cols-1 xl:grid-cols-5 gap-4">
          <section className="xl:col-span-2" aria-label="Flight network map">
            <NetworkMap
              airports={network.airports}
              flights={activeResult.flights}
              closedAirport={input.airport}
              selectedAirport={selectedAirport}
              selectedFlight={selectedFlight}
              onAirportClick={setSelectedAirport}
              onFlightClick={setSelectedFlight}
            />
          </section>
          <section className="xl:col-span-3" aria-label="Flight cascade board">
            <FlightCascadeTable
              flights={activeResult.flights}
              brokenConnections={activeResult.brokenConnections}
              selectedAirport={selectedAirport}
              selectedFlight={selectedFlight}
              onFlightSelect={setSelectedFlight}
            />
          </section>
        </div>
        <aside aria-label="AI dispatcher and recovery panel">
          <DispatcherPanel
            baseResult={baseResult}
            activeResult={activeResult}
            candidates={candidates}
            appliedRecovery={appliedRecovery}
            onApplyRecovery={handleApplyRecovery}
            network={network}
          />
        </aside>
      </main>
    </div>
  );
}

export default App;
