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
import { z } from 'zod';

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

type DispatchRequest = z.infer<typeof RequestSchema>;

// ── Deterministic template fallback ────────────────────────────────────────
function buildFallback(data: DispatchRequest): string {
  const { airport, startTime, durationMinutes, metrics, recoveryStats } = data;
  const startMins = parseInt(startTime.split(':')[0], 10) * 60 + parseInt(startTime.split(':')[1], 10);
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
    const paxSaved = -top.deltaStrandedPax;
    const delaySaved = -top.deltaDelayMinutes;
    text += `Top recommendation: ${top.label}. `;
    if (paxSaved > 0) text += `Saves ${paxSaved} stranded passengers. `;
    if (delaySaved > 0) text += `Cuts ${delaySaved} total delay minutes.`;
  }

  return text;
}

// ── Build set of valid numbers for verification ────────────────────────────
function buildValidNumberSet(data: DispatchRequest): Set<number> {
  const nums = new Set<number>();
  const m = data.metrics;
  [
    m.delayedFlightsCount, m.cancelledFlightsCount, m.crewBreachCount,
    m.brokenConnectionsCount, m.totalDelayMinutes, m.maxDelayMinutes,
    m.affectedAirportsCount, m.cancelledOrGroundedPax, m.missedConnectionPax,
    m.totalStrandedPax, data.durationMinutes,
  ].forEach(n => nums.add(n));

  for (const stat of data.recoveryStats) {
    [
      stat.deltaDelayMinutes, stat.deltaStrandedPax, stat.deltaDelayedFlights,
      stat.deltaBrokenConnections, stat.deltaCrewBreaches,
      -stat.deltaDelayMinutes, -stat.deltaStrandedPax,
    ].forEach(n => nums.add(Math.round(Math.abs(n))));
  }

  return nums;
}

// ── Validate AI numbers against engine output ─────────────────────────────
function validateNumbers(aiText: string, validNums: Set<number>): { verified: boolean; mismatched: number[] } {
  const matches = aiText.match(/\b\d+(\.\d+)?\b/g) ?? [];
  const mismatched: number[] = [];
  for (const m of matches) {
    const n = parseFloat(m);
    if (n >= 10 && !validNums.has(n) && !validNums.has(Math.round(n))) {
      mismatched.push(n);
    }
  }
  return { verified: mismatched.length === 0, mismatched: [...new Set(mismatched)] };
}

// ── Main handler ───────────────────────────────────────────────────────────
export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  // Validate input
  const parsed = RequestSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid request', details: parsed.error.flatten() });
    return;
  }

  const data = parsed.data;
  const apiKey = process.env['GEMINI_API_KEY'];

  // Always compute fallback
  const fallbackText = buildFallback(data);
  const validNums = buildValidNumberSet(data);

  if (!apiKey) {
    res.status(200).json({
      text: fallbackText,
      source: 'deterministic',
      verified: true,
      mismatchedNumbers: [],
    });
    return;
  }

  try {
    const { GoogleGenAI } = await import('@google/genai');
    const ai = new GoogleGenAI({ apiKey });

    const prompt = `You are an airline operations control center AI dispatcher. 
Analyze this flight disruption and explain it in clear operational language.
Use ONLY the exact numbers provided below — do not invent or estimate any statistics.

DISRUPTION DATA:
Airport: ${data.airport}
Closure: ${data.startTime} – ${(() => {
      const startMins = parseInt(data.startTime.split(':')[0], 10) * 60 + parseInt(data.startTime.split(':')[1], 10);
      const endH = Math.floor((startMins + data.durationMinutes) / 60);
      const endM = (startMins + data.durationMinutes) % 60;
      return `${String(endH).padStart(2, '0')}:${String(endM).padStart(2, '0')}`;
    })()} IST (${data.durationMinutes} minutes)

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

    if (!verified || aiText.trim().length < 20) {
      res.status(200).json({
        text: fallbackText,
        source: 'deterministic',
        verified: true,
        mismatchedNumbers: [],
      });
      return;
    }

    res.status(200).json({
      text: aiText,
      source: 'ai',
      verified,
      mismatchedNumbers: mismatched,
    });
  } catch (_err) {
    res.status(200).json({
      text: fallbackText,
      source: 'deterministic',
      verified: true,
      mismatchedNumbers: [],
    });
  }
}
