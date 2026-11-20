import { VALIDATION_LIMITS } from '../constants/index';

export interface ValidationResult {
  verified: boolean;
  mismatchedNumbers: number[];
}

/**
 * Builds the mathematical set of authorized numbers from simulation metrics.
 *
 * @param validNumbers Array of ground-truth numbers from engine calculation
 * @returns Set containing authorized numbers
 */
export function buildValidNumbersSet(validNumbers: number[]): Set<number> {
  return new Set(validNumbers);
}

/**
 * Extracts all numeric tokens from AI generated briefing text.
 *
 * @param text Generated AI text
 * @returns Array of numeric values
 */
function extractNumbers(text: string): number[] {
  const matches = text.match(/\b\d+(\.\d+)?\b/g);
  if (!matches) return [];
  return matches.map(Number).filter((n) => !isNaN(n));
}

/**
 * Validates every significant numeric token cited in an AI dispatcher response against
 * the exact whitelist of numbers produced by the simulation engine.
 *
 * Numbers below SIGNIFICANT_NUMBER_THRESHOLD (0-9) are treated as conversational
 * counters (e.g. "1 hour", "3 airports"). Numbers >= 10 must strictly match
 * simulation output to guarantee zero hallucination.
 *
 * @param aiText Generated AI response text
 * @param validNumbers Set of validated simulation values
 * @returns ValidationResult with verification status and unverified tokens
 */
export function validateDispatcherResponse(
  aiText: string,
  validNumbers: Set<number>
): ValidationResult {
  const extracted = extractNumbers(aiText);
  const mismatchedNumbers: number[] = [];

  const significantNumbers = extracted.filter(
    (n) => n >= VALIDATION_LIMITS.SIGNIFICANT_NUMBER_THRESHOLD
  );

  for (const num of significantNumbers) {
    if (!validNumbers.has(num) && !validNumbers.has(Math.round(num))) {
      mismatchedNumbers.push(num);
    }
  }

  return {
    verified: mismatchedNumbers.length === 0,
    mismatchedNumbers: [...new Set(mismatchedNumbers)],
  };
}
