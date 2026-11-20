import type { DisruptionInput } from '../types/simulation';

export interface Preset extends DisruptionInput {
  label: string;
  icon: string;
  description: string;
}

export const PRESETS: Preset[] = [
  {
    label: 'Mumbai Monsoon',
    icon: '🌧️',
    airport: 'BOM',
    startTime: '07:30',
    durationMinutes: 90,
    description: 'Hits morning hub wave & connections CX01–CX05',
  },
  {
    label: 'Delhi Fog Hold',
    icon: '🌫️',
    airport: 'DEL',
    startTime: '08:00',
    durationMinutes: 120,
    description: 'Cascades across northern spokes & tests VT-DS18 spare at DEL',
  },
  {
    label: 'Bengaluru Squall',
    icon: '⛈️',
    airport: 'BLR',
    startTime: '11:00',
    durationMinutes: 90,
    description: 'Breaks southern connections & tests VT-DS17 spare at BLR',
  },
];
