import { describe, it, expect } from 'vitest';
import handler, { buildFallback, buildValidNumberSet, validateNumbers, type VercelRequest, type VercelResponse } from '../../api/dispatch';

function createMockResponse() {
  const res: VercelResponse & { statusCode: number; data: unknown } = {
    statusCode: 200,
    data: null,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(body: unknown) {
      this.data = body;
    },
  };
  return res;
}

const samplePayload = {
  airport: 'BOM',
  startTime: '07:30',
  durationMinutes: 90,
  metrics: {
    delayedFlightsCount: 12,
    cancelledFlightsCount: 2,
    crewBreachCount: 1,
    brokenConnectionsCount: 4,
    totalDelayMinutes: 540,
    maxDelayMinutes: 90,
    affectedAirportsCount: 6,
    cancelledOrGroundedPax: 320,
    missedConnectionPax: 85,
    totalStrandedPax: 405,
  },
  topChains: ['DS101: delayed +90m'],
  recoveryStats: [
    {
      label: 'Swap VT-DS17',
      description: 'Deploy spare at BLR',
      deltaDelayMinutes: -120,
      deltaStrandedPax: -85,
      deltaDelayedFlights: -2,
      deltaBrokenConnections: -3,
      deltaCrewBreaches: -1,
      score: -300,
    },
  ],
};

describe('API Dispatch Handler & Verification Tests', () => {
  it('enforces POST HTTP method with 405 error', async () => {
    const req: VercelRequest = { method: 'GET', body: {} };
    const res = createMockResponse();

    await handler(req, res);

    expect(res.statusCode).toBe(405);
    expect(res.data).toEqual({ error: 'Method not allowed' });
  });

  it('rejects missing or non-object body with 400', async () => {
    const req: VercelRequest = { method: 'POST', body: null };
    const res = createMockResponse();

    await handler(req, res);

    expect(res.statusCode).toBe(400);
    expect(res.data).toEqual({ error: 'Invalid payload: body must be a JSON object' });
  });

  it('rejects oversized payloads with 400', async () => {
    const hugeString = 'x'.repeat(60000);
    const req: VercelRequest = { method: 'POST', body: { huge: hugeString } };
    const res = createMockResponse();

    await handler(req, res);

    expect(res.statusCode).toBe(400);
    expect(res.data).toEqual({ error: 'Payload too large' });
  });

  it('rejects schema-invalid payloads with 400 and structured validation errors', async () => {
    const req: VercelRequest = { method: 'POST', body: { airport: 'INVALID_LONG_CODE' } };
    const res = createMockResponse();

    await handler(req, res);

    expect(res.statusCode).toBe(400);
    expect((res.data as { error: string }).error).toBe('Invalid request');
  });

  it('returns grounded deterministic dispatch when GEMINI_API_KEY is not set', async () => {
    const req: VercelRequest = { method: 'POST', body: samplePayload };
    const res = createMockResponse();

    await handler(req, res);

    expect(res.statusCode).toBe(200);
    const responseData = res.data as { source: string; verified: boolean; text: string };
    expect(responseData.source).toBe('deterministic');
    expect(responseData.verified).toBe(true);
    expect(responseData.text).toContain('BOM closed 07:30–09:00 IST');
    expect(responseData.text).toContain('405 passengers stranded');
  });

  it('accurately verifies numbers in validateNumbers against engine whitelist', () => {
    const validNums = buildValidNumberSet(samplePayload);
    expect(validNums.has(405)).toBe(true);
    expect(validNums.has(540)).toBe(true);
    expect(validNums.has(85)).toBe(true);

    const validText = 'BOM had 405 stranded passengers and 540 delay minutes, saving 85 passengers.';
    const validation = validateNumbers(validText, validNums);
    expect(validation.verified).toBe(true);
    expect(validation.mismatchedNumbers).toHaveLength(0);

    const hallucinatedText = 'BOM suffered 9999 delayed flights and 8888 cancellations.';
    const invalidValidation = validateNumbers(hallucinatedText, validNums);
    expect(invalidValidation.verified).toBe(false);
    expect(invalidValidation.mismatchedNumbers).toContain(9999);
    expect(invalidValidation.mismatchedNumbers).toContain(8888);
  });

  it('generates deterministic fallback text with correct closure window and recovery savings', () => {
    const text = buildFallback(samplePayload);
    expect(text).toContain('BOM closed 07:30–09:00 IST (90 min)');
    expect(text).toContain('Top recommendation: Swap VT-DS17');
    expect(text).toContain('Saves 85 stranded passengers');
    expect(text).toContain('Cuts 120 total delay minutes');
  });
});
