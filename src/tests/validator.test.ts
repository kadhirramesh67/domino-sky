import { describe, it, expect } from 'vitest';
import { validateDispatcherResponse, buildValidNumbersSet } from '../engine/validator';
import { generateTemplateDispatch } from '../engine/templateDispatcher';
import { simulateDisruption } from '../engine/simulateDisruption';
import { generateRecoveryCandidates } from '../engine/recoveryEngine';
import networkData from '../data/flight_network.json';
import type { FlightNetwork } from '../types/index';
import type { DisruptionInput } from '../types/simulation';

const network = networkData as FlightNetwork;

describe('Validator: AI numeric-consistency validator', () => {
  it('passes when all numbers >= 10 in AI text exist in the engine validNumbers set', () => {
    const validNumbers = buildValidNumbersSet([15, 240, 150, 45, 90]);
    const aiText = 'We have 15 flights delayed totaling 240 minutes. 150 passengers are stranded, and connection gap was 45 mins with 90 min closure.';

    const result = validateDispatcherResponse(aiText, validNumbers);
    expect(result.verified).toBe(true);
    expect(result.mismatchedNumbers).toEqual([]);
  });

  it('catches and reports mismatched or hallucinated numbers >= 10', () => {
    const validNumbers = buildValidNumbersSet([15, 240, 150]);
    // 999 and 88 are hallucinated figures
    const aiText = 'The disruption caused 999 flights to be delayed and 88 passengers stranded with 15 cancellations.';

    const result = validateDispatcherResponse(aiText, validNumbers);
    expect(result.verified).toBe(false);
    expect(result.mismatchedNumbers).toContain(999);
    expect(result.mismatchedNumbers).toContain(88);
    // 15 is valid, so it must not be in mismatchedNumbers
    expect(result.mismatchedNumbers).not.toContain(15);
  });

  it('ignores filler numbers less than 10 so narrative phrasing passes', () => {
    const validNumbers = buildValidNumbersSet([50, 120]);
    // 1, 2, 3, 4 are below 10 and should be ignored as narrative words
    const aiText = '1 airport closed for 2 hours affected 3 regions, causing 50 minutes delay across 4 routes.';

    const result = validateDispatcherResponse(aiText, validNumbers);
    expect(result.verified).toBe(true);
    expect(result.mismatchedNumbers).toEqual([]);
  });

  it('supports decimal numbers and rounded matches', () => {
    const validNumbers = buildValidNumbersSet([12.5, 40]);
    const aiText = 'Average delay was 12.5 minutes with 40 passengers.';

    const result = validateDispatcherResponse(aiText, validNumbers);
    expect(result.verified).toBe(true);
    expect(result.mismatchedNumbers).toEqual([]);
  });
});

describe('Validator & Fallback: Grounded template dispatcher behavior', () => {
  it('generates a 100% deterministic summary whose figures match simulation metrics exactly', () => {
    const input: DisruptionInput = {
      airport: 'BOM',
      startTime: '07:30',
      durationMinutes: 90,
    };
    const simResult = simulateDisruption(network, input);
    const candidates = generateRecoveryCandidates(network, input, simResult);

    const dispatchText = generateTemplateDispatch(simResult, candidates);

    // Verify key lines exist in the dispatch summary
    expect(dispatchText).toContain('DISPATCH SUMMARY — BOM closed 07:30–09:00 IST (90 min)');
    expect(dispatchText).toContain(`${simResult.metrics.delayedFlightsCount} flights delayed`);
    expect(dispatchText).toContain(`total ${simResult.metrics.totalDelayMinutes} min`);
    expect(dispatchText).toContain(`${simResult.metrics.totalStrandedPax} passengers stranded`);
    expect(dispatchText).toContain(`${simResult.metrics.brokenConnectionsCount} broken connections`);

    // Build the valid numbers set from the simulation engine output
    const validNumbers = new Set<number>([
      simResult.input.durationMinutes,
      simResult.metrics.delayedFlightsCount,
      simResult.metrics.cancelledFlightsCount,
      simResult.metrics.crewBreachCount,
      simResult.metrics.brokenConnectionsCount,
      simResult.metrics.totalDelayMinutes,
      simResult.metrics.maxDelayMinutes,
      simResult.metrics.affectedAirportsCount,
      simResult.metrics.cancelledOrGroundedPax,
      simResult.metrics.missedConnectionPax,
      simResult.metrics.totalStrandedPax,
      ...simResult.brokenConnections.flatMap(c => [c.passengers, c.actualGapMinutes, c.min_connect_minutes]),
      ...simResult.crewBreaches.flatMap(b => [b.dutyMinutes, b.maxDutyMins, b.breachMinutes]),
      ...candidates.flatMap(c => [
        Math.abs(c.delta.deltaStrandedPax),
        Math.abs(c.delta.deltaDelayMinutes),
      ]),
    ]);

    // Validate that the template summary passes the validator without hallucinated numbers
    const validation = validateDispatcherResponse(dispatchText, validNumbers);
    expect(validation.verified).toBe(true);
    expect(validation.mismatchedNumbers).toEqual([]);
  });

  it('acts as a reliable fallback when AI returns hallucinated numbers or fails', () => {
    const input: DisruptionInput = {
      airport: 'DEL',
      startTime: '08:00',
      durationMinutes: 120,
    };
    const simResult = simulateDisruption(network, input);
    const candidates = generateRecoveryCandidates(network, input, simResult);

    const validNumbers = new Set<number>([
      simResult.metrics.delayedFlightsCount,
      simResult.metrics.totalDelayMinutes,
      simResult.metrics.totalStrandedPax,
    ]);

    const hallucinatedAiResponse = 'AI Dispatcher: We have 500 flights delayed and 12000 stranded passengers.';
    const validation = validateDispatcherResponse(hallucinatedAiResponse, validNumbers);

    expect(validation.verified).toBe(false);

    // In this failure case, application grounds dispatch in the deterministic template
    const fallbackText = generateTemplateDispatch(simResult, candidates);
    expect(fallbackText).toBeTruthy();
    expect(fallbackText).toContain(`${simResult.metrics.delayedFlightsCount} flights delayed`);
    expect(fallbackText).not.toContain('12000');
  });
});
