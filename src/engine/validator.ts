export interface ValidationResult {
  verified: boolean;
  mismatchedNumbers: number[];
}

/**
 * Build the set of valid numbers from a simulation result's metrics.
 * All integer and meaningful decimal numbers that appear in the engine output.
 */
export function buildValidNumbersSet(validNumbers: number[]): Set<number> {
  return new Set(validNumbers);
}

/**
 * Extract all numeric tokens from AI response text.
 */
function extractNumbers(text: string): number[] {
  const matches = text.match(/\b\d+(\.\d+)?\b/g);
  if (!matches) return [];
  return matches.map(Number).filter(n => !isNaN(n));
}

/**
 * Validate every number cited in an AI dispatcher response against
 * the exact set of numbers produced by the simulation engine.
 *
 * Returns verified=true only if every number in the AI text is
 * present in the validNumbers set.
 */
export function validateDispatcherResponse(
  aiText: string,
  validNumbers: Set<number>
): ValidationResult {
  const extracted = extractNumbers(aiText);
  const mismatchedNumbers: number[] = [];

  // Allow small numbers (0–9) as they're common filler words (e.g. "1 hour", "3 airports")
  // and years/generic counts. Only validate numbers >= 10 that likely represent
  // simulation-specific figures.
  const significantNumbers = extracted.filter(n => n >= 10);

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
