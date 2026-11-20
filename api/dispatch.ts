import { z } from 'zod';

export interface VercelRequest {
  method?: string;
  body: unknown;
  query?: Record<string, string | string[]>;
}

export interface VercelResponse {
  status: (code: number) => VercelResponse;
  json: (body: unknown) => void;
  send?: (body: unknown) => void;
}

/** Maximum allowed payload size in bytes */
const MAX_PAYLOAD_BYTES = 50000;
/** Minimum numeric value evaluated for ground verification */
const SIGNIFICANT_NUMBER_THRESHOLD = 10;
/** Minimum character length of AI briefing to avoid stub responses */
const MIN_AI_TEXT_LENGTH = 20;

// ── Zod schema for request validation ──────────────────────────────────────
const MetricsSchema = z.object({
  delayedFlightsCount: z.number().int().min(0),
  cancelledFlightsCount: z.number().int().min(0),
  crewBreachCount: z.number().int().min(0),
  brokenConnectionsCount: z.number().int().min(0),
  totalDelayMinutes: z.number().min(0),
  maxDelayMinutes: z.number().min(0),
  affectedAirportsCount: z.number().int().min(0),
  cancelledOrGroundedPax: z.number().int().min(0),
  missedConnectionPax: z.number().int().min(0),
  totalStrandedPax: z.number().int().min(0),
});

const RecoveryStatSchema = z.object({
  label: z.string().max(200),
  description: z.string().max(500),
  deltaDelayMinutes: z.number(),
  deltaStrandedPax: z.number(),
  deltaDelayedFlights: z.number(),
  deltaBrokenConnections: z.number(),
  deltaCrewBreaches: z.number(),
  score: z.number(),
});

const RequestSchema = z.object({
  airport: z.string().length(3),
  startTime: z.string().regex(/^\d{2}:\d{2}$/),
  durationMinutes: z.number().int().min(10).max(480),
  metrics: MetricsSchema,
  topChains: z.array(z.string().max(300)).max(5),
  recoveryStats: z.array(RecoveryStatSchema).max(6),
});

export type DispatchRequest = z.infer<typeof RequestSchema>;

export interface DispatchResponse {
  text: string;
  source: 'ai' | 'deterministic';
  verified: boolean;
  mismatchedNumbers: number[];
}

/**
 * Builds a 100% deterministic, grounded plain-language operational briefing.
 *
 * @param data Validated dispatch request payload
 * @returns Grounded operational summary string
 */
export function buildFallback(data: DispatchRequest): string {
  const { airport, startTime, durationMinutes, metrics, recoveryStats } = data;
  const startParts = startTime.split(':');
  const startH = parseInt(startParts[0] ?? '0', 10);
  const startM = parseInt(startParts[1] ?? '0', 10);
  const startMins = startH * 60 + startM;
  const endH = Math.floor((startMins + durationMinutes) / 60);
  const endM = (startMins + durationMinutes) % 60;
  const closeEnd = `${String(endH).padStart(2, '0')}:${String(endM).padStart(2, '0')}`;

  let text = `${airport} closed ${startTime}–${closeEnd} IST (${durationMinutes} min). `;
  text += `${metrics.delayedFlightsCount} flights delayed (${metrics.totalDelayMinutes} min total), `;
  text += `${metrics.cancelledFlightsCount} cancelled/grounded. `;
  text += `${metrics.totalStrandedPax} passengers stranded `;
  text += `(${metrics.cancelledOrGroundedPax} cancelled + ${metrics.missedConnectionPax} missed connections). `;
  text += `${metrics.brokenConnectionsCount} broken connections, ${metrics.crewBreachCount} crew breach(es). `;
  text += `${metrics.affectedAirportsCount} airports affected. `;

  if (recoveryStats.length > 0) {
    const top = recoveryStats[0];
    if (top) {
      const paxSaved = -top.deltaStrandedPax;
      const delaySaved = -top.deltaDelayMinutes;
      text += `Top recommendation: ${top.label}. `;
      if (paxSaved > 0) text += `Saves ${paxSaved} stranded passengers. `;
      if (delaySaved > 0) text += `Cuts ${delaySaved} total delay minutes.`;
    }
  }

  return text;
}

/**
 * Builds the mathematical whitelist of approved engine numbers
 * for cross-checking AI output against simulation data.
 *
 * @param data Validated dispatch request payload
 * @returns Set of approved numeric tokens
 */
export function buildValidNumberSet(data: DispatchRequest): Set<number> {
  const nums = new Set<number>();
  const m = data.metrics;
  const baseNums = [
    m.delayedFlightsCount,
    m.cancelledFlightsCount,
    m.crewBreachCount,
    m.brokenConnectionsCount,
    m.totalDelayMinutes,
    m.maxDelayMinutes,
    m.affectedAirportsCount,
    m.cancelledOrGroundedPax,
    m.missedConnectionPax,
    m.totalStrandedPax,
    data.durationMinutes,
  ];

  for (const n of baseNums) {
    nums.add(n);
  }

  for (const stat of data.recoveryStats) {
    const statNums = [
      stat.deltaDelayMinutes,
      stat.deltaStrandedPax,
      stat.deltaDelayedFlights,
      stat.deltaBrokenConnections,
      stat.deltaCrewBreaches,
      -stat.deltaDelayMinutes,
      -stat.deltaStrandedPax,
    ];
    for (const n of statNums) {
      nums.add(Math.round(Math.abs(n)));
    }
  }

  return nums;
}

/**
 * Validates extracted numeric tokens from AI generated content
 * against the whitelist of approved simulation values.
 *
 * @param aiText Generated AI response text
 * @param validNums Set of authorized simulation values
 * @returns Object with verification flag and list of ungrounded numbers
 */
export function validateNumbers(
  aiText: string,
  validNums: Set<number>
): { verified: boolean; mismatched: number[]; mismatchedNumbers: number[] } {
  const matches = aiText.match(/\b\d+(\.\d+)?\b/g) ?? [];
  const mismatched: number[] = [];
  for (const m of matches) {
    const n = parseFloat(m);
    if (n >= SIGNIFICANT_NUMBER_THRESHOLD && !validNums.has(n) && !validNums.has(Math.round(n))) {
      mismatched.push(n);
    }
  }
  const uniqueMismatched = [...new Set(mismatched)];
  return {
    verified: uniqueMismatched.length === 0,
    mismatched: uniqueMismatched,
    mismatchedNumbers: uniqueMismatched,
  };
}

/**
 * Invokes Gemini AI to synthesize an operational dispatch summary.
 * If response validation fails or fails ground checks, returns deterministic fallback.
 */
async function generateAiBriefing(
  data: DispatchRequest,
  apiKey: string,
  validNums: Set<number>,
  fallbackText: string
): Promise<DispatchResponse> {
  try {
    const { GoogleGenAI } = await import('@google/genai');
    const ai = new GoogleGenAI({ apiKey });

    const startParts = data.startTime.split(':');
    const startH = parseInt(startParts[0] ?? '0', 10);
    const startM = parseInt(startParts[1] ?? '0', 10);
    const startMins = startH * 60 + startM;
    const endH = Math.floor((startMins + data.durationMinutes) / 60);
    const endM = (startMins + data.durationMinutes) % 60;
    const closureEndFormatted = `${String(endH).padStart(2, '0')}:${String(endM).padStart(2, '0')}`;

    const prompt = `You are an airline operations control center AI dispatcher. 
Analyze this flight disruption and explain it in clear operational language.
Use ONLY the exact numbers provided below — do not invent or estimate any statistics.

DISRUPTION DATA:
Airport: ${data.airport}
Closure: ${data.startTime} – ${closureEndFormatted} IST (${data.durationMinutes} minutes)

CASCADE METRICS:
- Delayed flights: ${data.metrics.delayedFlightsCount}
- Cancelled/grounded flights: ${data.metrics.cancelledFlightsCount}
- Total delay: ${data.metrics.totalDelayMinutes} minutes (max single flight: ${data.metrics.maxDelayMinutes} min)
- Stranded passengers: ${data.metrics.totalStrandedPax} (${data.metrics.cancelledOrGroundedPax} on cancelled + ${data.metrics.missedConnectionPax} missed connections)
- Broken connections: ${data.metrics.brokenConnectionsCount}
- Crew duty breaches: ${data.metrics.crewBreachCount}
- Affected airports: ${data.metrics.affectedAirportsCount}

TOP CASCADE CHAINS:
${data.topChains.map((c, i) => `${i + 1}. ${c}`).join('\n')}

RECOVERY OPTIONS:
${data.recoveryStats.map((s, i) => `${i + 1}. ${s.label}: ${s.description} (Δpax: ${s.deltaStrandedPax}, Δdelay: ${s.deltaDelayMinutes} min, score: ${s.score.toFixed(1)})`).join('\n')}

Write a 3-4 sentence operational briefing explaining the cascade chain and domino effects, 
then rank the recovery options. Be concise and professional. Use only the numbers above.`;

    const response = await ai.models.generateContent({
      model: 'gemini-2.0-flash',
      contents: prompt,
    });

    const aiText = response.text ?? '';
    const { verified, mismatched } = validateNumbers(aiText, validNums);

    if (!verified || aiText.trim().length < MIN_AI_TEXT_LENGTH) {
      return {
        text: fallbackText,
        source: 'deterministic',
        verified: true,
        mismatchedNumbers: [],
      };
    }

    return {
      text: aiText,
      source: 'ai',
      verified,
      mismatchedNumbers: mismatched,
    };
  } catch {
    return {
      text: fallbackText,
      source: 'deterministic',
      verified: true,
      mismatchedNumbers: [],
    };
  }
}

/**
 * Serverless API handler for OCC AI Dispatcher briefing.
 * Enforces strict POST method, payload size validation, deterministic fallback,
 * and zero-leakage safe error handling.
 *
 * @param req Incoming Vercel HTTP request
 * @param res Outgoing Vercel HTTP response
 */
export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  // 1. Strict HTTP Method Enforcement
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  // 2. Strict Payload Type and Size Validation
  if (!req.body || typeof req.body !== 'object') {
    res.status(400).json({ error: 'Invalid payload: body must be a JSON object' });
    return;
  }

  let payloadSize = 0;
  try {
    payloadSize = JSON.stringify(req.body).length;
  } catch {
    res.status(400).json({ error: 'Malformed JSON payload' });
    return;
  }

  if (payloadSize > MAX_PAYLOAD_BYTES) {
    res.status(400).json({ error: 'Payload too large' });
    return;
  }

  // 3. Schema Validation
  const parsed = RequestSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({
      error: 'Invalid request',
      details: parsed.error.flatten().fieldErrors,
    });
    return;
  }

  const data = parsed.data;
  const apiKey = process.env['GEMINI_API_KEY'];

  // Grounded deterministic fallback and valid numbers
  const fallbackText = buildFallback(data);
  const validNums = buildValidNumberSet(data);

  if (!apiKey) {
    res.status(200).json({
      text: fallbackText,
      source: 'deterministic',
      verified: true,
      mismatchedNumbers: [],
    } satisfies DispatchResponse);
    return;
  }

  const briefing = await generateAiBriefing(data, apiKey, validNums, fallbackText);
  res.status(200).json(briefing satisfies DispatchResponse);
}
