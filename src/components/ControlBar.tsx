import type { DisruptionInput } from '../types/simulation';
import type { Airport } from '../types/index';
import type { Preset } from '../engine/presets';

interface ControlBarProps {
  input: DisruptionInput;
  onInputChange: (input: DisruptionInput) => void;
  presets: Preset[];
  airports: Airport[];
}

const DURATION_OPTIONS = [
  { value: 30, label: '30 mins' },
  { value: 45, label: '45 mins' },
  { value: 60, label: '60 mins (1 hr)' },
  { value: 90, label: '90 mins (1.5 hrs)' },
  { value: 120, label: '120 mins (2 hrs)' },
  { value: 150, label: '150 mins (2.5 hrs)' },
  { value: 180, label: '180 mins (3 hrs)' },
  { value: 240, label: '240 mins (4 hrs)' },
] as const;

/**
 * Control bar providing 1-click preset scenarios (Mumbai Monsoon, Delhi Fog, BLR Squall)
 * and interactive controls for airport, closure time, and duration parameters.
 */
export default function ControlBar({
  input,
  onInputChange,
  presets,
  airports,
}: ControlBarProps) {
  const isPresetActive = (p: Preset): boolean =>
    p.airport === input.airport &&
    p.startTime === input.startTime &&
    p.durationMinutes === input.durationMinutes;

  return (
    <section
      data-testid="control-bar"
      aria-label="Simulation disruption parameters and presets"
      className="bg-gray-900 border border-gray-800 rounded-lg p-4 shadow-md space-y-4"
    >
      {/* 1-Click Disruption Presets */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
            1-Click Disruption Scenarios
          </span>
          <span className="text-xs text-cyan-400 font-mono">
            Deterministic Engine Ready
          </span>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          {presets.map((preset) => {
            const active = isPresetActive(preset);
            return (
              <button
                key={preset.label}
                type="button"
                onClick={() =>
                  onInputChange({
                    airport: preset.airport,
                    startTime: preset.startTime,
                    durationMinutes: preset.durationMinutes,
                  })
                }
                aria-pressed={active}
                aria-label={`Apply preset ${preset.label}: ${preset.airport} closed at ${preset.startTime} for ${preset.durationMinutes} minutes`}
                className={`flex flex-col text-left p-3 rounded border transition-colors cursor-pointer ${
                  active
                    ? 'bg-cyan-950/80 border-cyan-500 text-cyan-200 ring-1 ring-cyan-500'
                    : 'bg-gray-800/60 border-gray-700/80 text-gray-200 hover:bg-gray-800 hover:border-gray-600'
                }`}
              >
                <div className="flex items-center gap-2 font-bold text-sm">
                  <span aria-hidden="true">{preset.icon}</span>
                  <span>{preset.label}</span>
                </div>
                <div className="text-xs text-gray-400 mt-1 font-mono">
                  {preset.airport} @ {preset.startTime} IST ({preset.durationMinutes}m hold)
                </div>
                <div className="text-[11px] text-gray-400 mt-1 line-clamp-1">
                  {preset.description}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Manual Controls */}
      <fieldset className="border-t border-gray-800 pt-3">
        <legend className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">
          Custom Disruption Controls
        </legend>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div>
            <label
              htmlFor="disrupted-airport-select"
              className="block text-xs font-medium text-gray-300 mb-1"
            >
              Closed Airport
            </label>
            <select
              id="disrupted-airport-select"
              value={input.airport}
              onChange={(e) =>
                onInputChange({ ...input, airport: e.target.value })
              }
              aria-label="Closed Airport"
              className="w-full bg-gray-950 border border-gray-700 rounded px-3 py-2 text-sm text-gray-100 focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500 outline-none"
            >
              {airports.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.id} — {a.city} ({a.tier.replace('_', ' ')})
                </option>
              ))}
            </select>
          </div>

          <div>
            <label
              htmlFor="closure-start-time"
              className="block text-xs font-medium text-gray-300 mb-1"
            >
              Closure Start Time (IST)
            </label>
            <input
              type="time"
              id="closure-start-time"
              value={input.startTime}
              onChange={(e) =>
                onInputChange({ ...input, startTime: e.target.value })
              }
              aria-label="Closure Start Time in IST"
              className="w-full bg-gray-950 border border-gray-700 rounded px-3 py-2 text-sm text-gray-100 focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500 outline-none"
            />
          </div>

          <div>
            <label
              htmlFor="closure-duration"
              className="block text-xs font-medium text-gray-300 mb-1"
            >
              Duration (Minutes)
            </label>
            <select
              id="closure-duration"
              value={input.durationMinutes}
              onChange={(e) =>
                onInputChange({
                  ...input,
                  durationMinutes: parseInt(e.target.value, 10),
                })
              }
              aria-label="Closure Duration in Minutes"
              className="w-full bg-gray-950 border border-gray-700 rounded px-3 py-2 text-sm text-gray-100 focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500 outline-none"
            >
              {DURATION_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
        </div>
      </fieldset>
    </section>
  );
}
