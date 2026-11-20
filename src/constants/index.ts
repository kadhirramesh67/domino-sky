/**
 * Domino Sky Engine & System Constants
 * Centralized constant definitions with strict literal typing (`as const`).
 */

/** Turnaround and Connection Buffers (minutes) */
export const BUFFER_LIMITS = {
  MIN_TURNAROUND_MINUTES: 30,
  MIN_CONNECT_MINUTES_DEFAULT: 45,
  SPARE_MAX_HORIZON_MINUTES: 240,
} as const;

export const MIN_TURNAROUND_MINUTES = BUFFER_LIMITS.MIN_TURNAROUND_MINUTES;

/** Crew Duty Limits (minutes) */
export const CREW_LIMITS = {
  MAX_CREW_DUTY_MINUTES: 600,
} as const;

export const MAX_CREW_DUTY_MINUTES = CREW_LIMITS.MAX_CREW_DUTY_MINUTES;

/** Simulation Time Bounds and Defaults */
export const TIME_CONSTANTS = {
  MINUTES_IN_DAY: 1440,
  MINUTES_IN_HOUR: 60,
  MIN_CLOSURE_MINUTES: 10,
  MAX_CLOSURE_MINUTES: 480,
  DEFAULT_CLOSURE_MINUTES: 90,
  SPARE_DEFAULT_AVAILABLE_TIME: '05:00',
} as const;

/** Operational Recovery Scoring Weights */
export const SCORING_WEIGHTS = {
  STRANDED_PAX: 3,
  DELAY_MINUTES: 0.1,
  CREW_BREACH: 50,
} as const;

/** Validation & Grounding Thresholds */
export const VALIDATION_LIMITS = {
  SIGNIFICANT_NUMBER_THRESHOLD: 10,
  AI_RESPONSE_MIN_LENGTH: 20,
  MAX_PAYLOAD_BYTES: 50000,
  MAX_TOP_CHAINS: 5,
  MAX_RECOVERY_CANDIDATES: 6,
  MAX_DISPLAYED_RECOVERY_ACTIONS: 3,
} as const;

/** Flight Status String Literals */
export const FLIGHT_STATUS = {
  ON_TIME: 'on_time',
  DELAYED: 'delayed',
  CANCELLED: 'cancelled',
  CREW_GROUNDED: 'crew_grounded',
} as const;

/** Causal Delay Reason String Literals */
export const DELAY_REASONS = {
  DIRECT_DEPARTURE_HOLD: 'DIRECT_DEPARTURE_HOLD',
  DIRECT_ARRIVAL_HOLD: 'DIRECT_ARRIVAL_HOLD',
  INBOUND_ROTATION_DELAY: 'INBOUND_ROTATION_DELAY',
  CREW_DUTY_BREACH: 'CREW_DUTY_BREACH',
} as const;

/** Connection Break Reason String Literals */
export const CONNECTION_BREAK_REASONS = {
  FROM_CANCELLED: 'FROM_CANCELLED',
  TO_CANCELLED: 'TO_CANCELLED',
  MISSED_CONNECTION: 'MISSED_CONNECTION',
} as const;

/** Recovery Action Types */
export const RECOVERY_ACTION_TYPES = {
  SPARE_SWAP: 'SPARE_SWAP',
  CANCEL_FLIGHT: 'CANCEL_FLIGHT',
  CANCEL_TURN_PAIR: 'CANCEL_TURN_PAIR',
} as const;

/** Geographic Projection & Visual Geometry for India Network Map */
export const MAP_GEOMETRY = {
  MIN_LAT: 7.5,
  MAX_LAT: 32.5,
  MIN_LNG: 68.0,
  MAX_LNG: 93.5,
  SVG_WIDTH: 540,
  SVG_HEIGHT: 580,
  PADDING: 45,
  CURVE_FACTOR: 0.12,
} as const;

export const AIRPORT_NODE_RADIUS = {
  MEGA_HUB: 7,
  REGIONAL_HUB: 5.5,
  SPOKE: 4,
} as const;
