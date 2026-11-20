import { describe, it, expect } from 'vitest';
import { parseTime, formatTime, isInWindow, formatDelay } from '../engine/timeUtils';
import { simulateDisruption } from '../engine/simulateDisruption';
import networkData from '../data/flight_network.json';
import type { FlightNetwork, Flight, Crew, Connection } from '../types/index';
import type { DisruptionInput } from '../types/simulation';

const fullNetwork = networkData as FlightNetwork;

describe('Engine: timeUtils', () => {
  it('parses "HH:MM" into minutes from midnight', () => {
    expect(parseTime('00:00')).toBe(0);
    expect(parseTime('01:30')).toBe(90);
    expect(parseTime('07:30')).toBe(450);
    expect(parseTime('12:00')).toBe(720);
    expect(parseTime('23:59')).toBe(1439);
  });

  it('formats minutes from midnight into "HH:MM"', () => {
    expect(formatTime(0)).toBe('00:00');
    expect(formatTime(90)).toBe('01:30');
    expect(formatTime(450)).toBe('07:30');
    expect(formatTime(720)).toBe('12:00');
    expect(formatTime(1439)).toBe('23:59');
    // wrap-around behavior
    expect(formatTime(1440)).toBe('00:00');
    expect(formatTime(-60)).toBe('23:00');
  });

  it('checks time window containment in [start, end)', () => {
    expect(isInWindow(450, 450, 540)).toBe(true);
    expect(isInWindow(500, 450, 540)).toBe(true);
    expect(isInWindow(539, 450, 540)).toBe(true);
    expect(isInWindow(540, 450, 540)).toBe(false);
    expect(isInWindow(449, 450, 540)).toBe(false);
  });

  it('formats delay minutes into human-readable strings', () => {
    expect(formatDelay(0)).toBe('On time');
    expect(formatDelay(-10)).toBe('On time');
    expect(formatDelay(25)).toBe('+25m');
    expect(formatDelay(60)).toBe('+1h');
    expect(formatDelay(90)).toBe('+1h 30m');
    expect(formatDelay(135)).toBe('+2h 15m');
  });
});

describe('Engine: Turnaround slack absorption (min_turnaround_minutes: 30)', () => {
  const baseFlights: Flight[] = [
    {
      flight_id: 'TEST101',
      tail_id: 'VT-TEST',
      leg_order: 1,
      origin: 'DEL',
      destination: 'BOM',
      dep: '08:00', // 480
      arr: '10:00', // 600
      block_minutes: 120,
      pax: 150,
      turnaround_before_min: null,
    },
    {
      flight_id: 'TEST102',
      tail_id: 'VT-TEST',
      leg_order: 2,
      origin: 'BOM',
      destination: 'DEL',
      dep: '11:10', // 670 -> scheduled turnaround = 70 mins (slack = 70 - 30 = 40 mins)
      arr: '13:10', // 790
      block_minutes: 120,
      pax: 150,
      turnaround_before_min: 70,
    },
  ];

  const miniNetwork: FlightNetwork = {
    meta: {
      dataset: 'Mini Test',
      operating_day: 'single day',
      min_turnaround_minutes: 30,
      seats_per_aircraft: 180,
      notes: [],
    },
    airports: [
      { id: 'DEL', name: 'Delhi', city: 'Delhi', lat: 28.5, lng: 77.1, tier: 'mega_hub', capacity_per_hour: 40 },
      { id: 'BOM', name: 'Mumbai', city: 'Mumbai', lat: 19.1, lng: 72.8, tier: 'mega_hub', capacity_per_hour: 32 },
    ],
    flights: baseFlights,
    spare_aircraft: [],
    crews: [
      {
        crew_id: 'CR-TEST',
        tail_id: 'VT-TEST',
        base: 'DEL',
        flight_ids: ['TEST101', 'TEST102'],
        duty_start: '07:00',
        max_duty_mins: 600,
      },
    ],
    connections: [],
  };

  it('completely absorbs delay within scheduled buffer without cascading to leg 2', () => {
    // DEL closure 08:00 to 08:30 (30 min hold on TEST101)
    // TEST101 scheduled dep 08:00 (480), held until 08:30 (510), arr becomes 510 + 120 = 630 (10:30)
    // min turnaround = 30 -> earliest dep for TEST102 = 630 + 30 = 660 (11:00)
    // Scheduled dep for TEST102 is 11:10 (670), which is >= 660!
    // So TEST102 departs on time at 11:10. All 30 mins delay was absorbed by the 40 min slack.
    const disruption: DisruptionInput = {
      airport: 'DEL',
      startTime: '08:00',
      durationMinutes: 30,
    };

    const result = simulateDisruption(miniNetwork, disruption);
    const f1 = result.flights.find(f => f.flight_id === 'TEST101');
    const f2 = result.flights.find(f => f.flight_id === 'TEST102');
    expect(f1).toBeDefined();
    expect(f2).toBeDefined();
    if (!f1 || !f2) return;

    expect(f1.status).toBe('delayed');
    expect(f1.delayMinutes).toBe(30);
    expect(f1.actualDep).toBe(510);
    expect(f1.actualArr).toBe(630);

    expect(f2.status).toBe('on_time');
    expect(f2.delayMinutes).toBe(0);
    expect(f2.actualDep).toBe(670);
  });

  it('propagates only the excess delay when upstream delay exceeds turnaround slack', () => {
    // DEL closure 08:00 to 08:50 (50 min hold on TEST101)
    // TEST101 actual dep = 08:50 (530), actual arr = 530 + 120 = 650 (10:50)
    // min turnaround = 30 -> earliest dep for TEST102 = 650 + 30 = 680 (11:20)
    // Scheduled dep is 11:10 (670), so delay is 680 - 670 = 10 mins!
    // Out of 50 min upstream delay, 40 min slack was absorbed, propagating only 10 min.
    const disruption: DisruptionInput = {
      airport: 'DEL',
      startTime: '08:00',
      durationMinutes: 50,
    };

    const result = simulateDisruption(miniNetwork, disruption);
    const f1 = result.flights.find(f => f.flight_id === 'TEST101');
    const f2 = result.flights.find(f => f.flight_id === 'TEST102');
    expect(f1).toBeDefined();
    expect(f2).toBeDefined();
    if (!f1 || !f2) return;

    expect(f1.delayMinutes).toBe(50);
    expect(f2.status).toBe('delayed');
    expect(f2.delayMinutes).toBe(10);
    expect(f2.actualDep).toBe(680);
    expect(f2.reason).toBe('INBOUND_ROTATION_DELAY');
    expect(f2.causedByFlightId).toBe('TEST101');
  });
});

describe('Engine: Direct departure & arrival holds on airport closure', () => {
  it('applies direct departure hold to flights departing the closed airport during closure', () => {
    // Mumbai Monsoon: BOM closed 07:30 to 09:00 (450 to 540)
    const disruption: DisruptionInput = {
      airport: 'BOM',
      startTime: '07:30',
      durationMinutes: 90,
    };
    const result = simulateDisruption(fullNetwork, disruption);

    // Leg 1 flights with origin BOM scheduled in [450, 540) should be held to at least 540
    const directBomDepartures = result.flights.filter(
      f => f.origin === 'BOM' && f.leg_order === 1 && f.scheduledDep >= 450 && f.scheduledDep < 540
    );

    expect(directBomDepartures.length).toBeGreaterThan(0);
    for (const f of directBomDepartures) {
      expect(f.actualDep).toBeGreaterThanOrEqual(540);
      expect(f.reason).toBe('DIRECT_DEPARTURE_HOLD');
    }
  });

  it('applies direct arrival hold (holding departure at origin) so flight lands at closure end', () => {
    // BOM closed 07:30 to 09:00 (450 to 540)
    // DS0201: DEL->BOM, scheduled dep 06:00 (360), arr 08:10 (490), block 130 min
    // Since 490 is within [450, 540), departure must be held so actualArr >= 540:
    // requiredDep = 540 - 130 = 410 (06:50), actualArr = 540 (09:00)
    const disruption: DisruptionInput = {
      airport: 'BOM',
      startTime: '07:30',
      durationMinutes: 90,
    };
    const result = simulateDisruption(fullNetwork, disruption);

    const ds0201 = result.flights.find(f => f.flight_id === 'DS0201');
    expect(ds0201).toBeDefined();
    if (!ds0201) return;
    expect(ds0201.actualDep).toBe(410); // 06:50
    expect(ds0201.actualArr).toBe(540); // 09:00
    expect(ds0201.delayMinutes).toBe(50);
    expect(ds0201.reason).toBe('DIRECT_ARRIVAL_HOLD');
  });
});

describe('Engine: Multi-leg cascade propagation & causal chain reasons', () => {
  it('propagates delays along tail rotation and constructs causal chain', () => {
    // In BOM 07:30 closure, tail VT-02 flies DS0201 -> DS0202 -> DS0203 -> DS0204
    // DS0201 is delayed by DIRECT_ARRIVAL_HOLD (arriving BOM at 09:00)
    // DS0202 (BOM->PNQ) is held or delayed, cascading to DS0203 and DS0204
    const disruption: DisruptionInput = {
      airport: 'BOM',
      startTime: '07:30',
      durationMinutes: 90,
    };
    const result = simulateDisruption(fullNetwork, disruption);

    const ds0202 = result.flights.find(f => f.flight_id === 'DS0202');
    expect(ds0202).toBeDefined();
    if (!ds0202) return;

    // Check flights with INBOUND_ROTATION_DELAY
    const cascadedFlights = result.flights.filter(f => f.reason === 'INBOUND_ROTATION_DELAY');
    expect(cascadedFlights.length).toBeGreaterThan(0);

    for (const cf of cascadedFlights) {
      expect(cf.causedByFlightId).toBeTruthy();
      expect(cf.causalChain.length).toBeGreaterThan(0);
      const lastLink = cf.causalChain[cf.causalChain.length - 1];
      expect(lastLink.flightId).toBe(cf.causedByFlightId);
      expect(lastLink.reason).toBe('INBOUND_ROTATION_DELAY');
    }
  });
});

describe('Engine: Crew 600-min max_duty_mins breach detection', () => {
  it('detects crew duty breach when actual arrival exceeds duty_start + max_duty_mins', () => {
    // Create a 2-leg chain where delay causes duty to exceed 600 mins
    const testFlights: Flight[] = [
      {
        flight_id: 'C1',
        tail_id: 'VT-CREW',
        leg_order: 1,
        origin: 'DEL',
        destination: 'BLR',
        dep: '08:00', // 480
        arr: '10:45', // 645
        block_minutes: 165,
        pax: 150,
        turnaround_before_min: null,
      },
      {
        flight_id: 'C2',
        tail_id: 'VT-CREW',
        leg_order: 2,
        origin: 'BLR',
        destination: 'DEL',
        dep: '11:30', // 690
        arr: '14:15', // 855
        block_minutes: 165,
        pax: 150,
        turnaround_before_min: 45,
      },
      {
        flight_id: 'C3',
        tail_id: 'VT-CREW',
        leg_order: 3,
        origin: 'DEL',
        destination: 'BOM',
        dep: '15:15', // 915
        arr: '17:25', // 1045
        block_minutes: 130,
        pax: 160,
        turnaround_before_min: 60,
      },
    ];

    const testCrew: Crew = {
      crew_id: 'CR-TEST',
      tail_id: 'VT-CREW',
      base: 'DEL',
      flight_ids: ['C1', 'C2', 'C3'],
      duty_start: '07:00', // 420. max 600m duty -> must finish by 1020 (17:00)
      max_duty_mins: 600,
    };

    const crewNetwork: FlightNetwork = {
      meta: {
        dataset: 'Crew Test',
        operating_day: 'single day',
        min_turnaround_minutes: 30,
        seats_per_aircraft: 180,
        notes: [],
      },
      airports: fullNetwork.airports,
      flights: testFlights,
      spare_aircraft: [],
      crews: [testCrew],
      connections: [],
    };

    // Delay DEL from 08:00 to 09:30 (90 min delay on C1)
    // C1 actualDep: 570, actualArr: 735 (duty: 735 - 420 = 315 <= 600)
    // C2 earliestDep: 735 + 30 = 765, actualArr: 765 + 165 = 930 (duty: 930 - 420 = 510 <= 600)
    // C3 earliestDep: 930 + 30 = 960, actualArr: 960 + 130 = 1090
    // Duty at C3 arrival: 1090 - 420 = 670 > 600! Breach by 70 min!
    const disruption: DisruptionInput = {
      airport: 'DEL',
      startTime: '08:00',
      durationMinutes: 90,
    };

    const result = simulateDisruption(crewNetwork, disruption);
    expect(result.crewBreaches.length).toBe(1);

    const breach = result.crewBreaches[0];
    expect(breach.crew_id).toBe('CR-TEST');
    expect(breach.breachMinutes).toBe(70);
    expect(breach.maxDutyMins).toBe(600);
    expect(breach.groundedFlightIds).toContain('C3');

    const c3Flight = result.flights.find(f => f.flight_id === 'C3');
    expect(c3Flight).toBeDefined();
    if (!c3Flight) return;
    expect(c3Flight.status).toBe('crew_grounded');
    expect(c3Flight.crewDutyBreach).toBe(true);
    expect(c3Flight.reason).toBe('CREW_DUTY_BREACH');
    expect(c3Flight.breachMinutes).toBe(70);
  });
});

describe('Engine: Broken connections (min_connect_minutes)', () => {
  it('detects broken connections when actual arrival to departure gap falls below min_connect_minutes', () => {
    const connFlights: Flight[] = [
      {
        flight_id: 'CONN-F1',
        tail_id: 'VT-T1',
        leg_order: 1,
        origin: 'DEL',
        destination: 'BOM',
        dep: '08:00',
        arr: '10:00', // 600
        block_minutes: 120,
        pax: 150,
        turnaround_before_min: null,
      },
      {
        flight_id: 'CONN-F2',
        tail_id: 'VT-T2',
        leg_order: 1,
        origin: 'BOM',
        destination: 'GOI',
        dep: '11:00', // 660 (normal gap = 60 min, min connect = 45 min)
        arr: '12:00',
        block_minutes: 60,
        pax: 140,
        turnaround_before_min: null,
      },
    ];

    const conn: Connection = {
      connection_id: 'CX-TEST',
      airport: 'BOM',
      from_flight: 'CONN-F1',
      to_flight: 'CONN-F2',
      passengers: 28,
      min_connect_minutes: 45,
    };

    const connNetwork: FlightNetwork = {
      meta: { dataset: 'Conn Test', operating_day: '1 day', min_turnaround_minutes: 30, seats_per_aircraft: 180, notes: [] },
      airports: fullNetwork.airports,
      flights: connFlights,
      spare_aircraft: [],
      crews: [],
      connections: [conn],
    };

    // Delay CONN-F1 by 30 mins: actualArr = 630 (10:30)
    // CONN-F2 scheduled dep = 660 (11:00)
    // Gap = 660 - 630 = 30 mins < 45 min required! Connection broken!
    const disruption: DisruptionInput = {
      airport: 'DEL',
      startTime: '08:00',
      durationMinutes: 30,
    };

    const result = simulateDisruption(connNetwork, disruption);
    expect(result.brokenConnections.length).toBe(1);

    const b = result.brokenConnections[0];
    expect(b.connection_id).toBe('CX-TEST');
    expect(b.passengers).toBe(28);
    expect(b.actualGapMinutes).toBe(30);
    expect(b.min_connect_minutes).toBe(45);
    expect(b.reason).toBe('MISSED_CONNECTION');
    expect(b.countsInMissedPax).toBe(true);
  });
});

describe('Engine: Zero double-counting of stranded passengers', () => {
  it('does NOT count broken connection passengers when a leg is already cancelled/grounded', () => {
    // If from_flight is cancelled, the passengers are counted under cancelledOrGroundedPax.
    // They must NOT be re-counted under missedConnectionPax!
    const testFlights: Flight[] = [
      {
        flight_id: 'FX1',
        tail_id: 'VT-Z1',
        leg_order: 1,
        origin: 'BOM',
        destination: 'DEL',
        dep: '08:00',
        arr: '10:00',
        block_minutes: 120,
        pax: 150,
        turnaround_before_min: null,
      },
      {
        flight_id: 'FX2',
        tail_id: 'VT-Z2',
        leg_order: 1,
        origin: 'DEL',
        destination: 'ATQ',
        dep: '11:00',
        arr: '12:00',
        block_minutes: 60,
        pax: 120,
        turnaround_before_min: null,
      },
    ];

    const testConn: Connection = {
      connection_id: 'CX-FX',
      airport: 'DEL',
      from_flight: 'FX1',
      to_flight: 'FX2',
      passengers: 20,
      min_connect_minutes: 45,
    };

    const network: FlightNetwork = {
      meta: { dataset: 'Double Count Test', operating_day: '1 day', min_turnaround_minutes: 30, seats_per_aircraft: 180, notes: [] },
      airports: fullNetwork.airports,
      flights: testFlights,
      spare_aircraft: [],
      crews: [],
      connections: [testConn],
    };

    // Cancel FX1 via recovery action or test cancellation directly
    const disruption: DisruptionInput = {
      airport: 'BOM',
      startTime: '08:00',
      durationMinutes: 60,
    };

    const cancelAction = {
      id: 'CANCEL_FX1',
      type: 'CANCEL_FLIGHT' as const,
      label: 'Cancel FX1',
      description: 'Cancel FX1',
      targetFlightIds: ['FX1'],
    };

    const result = simulateDisruption(network, disruption, cancelAction);

    // FX1 is cancelled (150 pax)
    expect(result.metrics.cancelledFlightsCount).toBe(1);
    expect(result.metrics.cancelledOrGroundedPax).toBe(150);

    // Connection CX-FX is broken because from_flight is cancelled
    expect(result.brokenConnections.length).toBe(1);
    const broken = result.brokenConnections[0];
    expect(broken.reason).toBe('FROM_CANCELLED');
    expect(broken.countsInMissedPax).toBe(false);

    // Missed connection pax must be 0 (NOT 20), because connection was broken by cancellation
    expect(result.metrics.missedConnectionPax).toBe(0);

    // Total stranded pax must equal cancelledOrGroundedPax + missedConnectionPax = 150 + 0 = 150
    expect(result.metrics.totalStrandedPax).toBe(150);
  });

  it('guarantees totalStrandedPax strictly equals cancelledOrGroundedPax + missedConnectionPax on full network presets', () => {
    const presets: DisruptionInput[] = [
      { airport: 'BOM', startTime: '07:30', durationMinutes: 90 },
      { airport: 'DEL', startTime: '08:00', durationMinutes: 120 },
      { airport: 'BLR', startTime: '11:00', durationMinutes: 90 },
    ];

    for (const p of presets) {
      const result = simulateDisruption(fullNetwork, p);
      const { cancelledOrGroundedPax, missedConnectionPax, totalStrandedPax } = result.metrics;

      // Mathematically verified
      expect(totalStrandedPax).toBe(cancelledOrGroundedPax + missedConnectionPax);

      // Verify that every broken connection with countsInMissedPax === false has reason FROM_CANCELLED or TO_CANCELLED
      for (const bc of result.brokenConnections) {
        if (!bc.countsInMissedPax) {
          expect(['FROM_CANCELLED', 'TO_CANCELLED']).toContain(bc.reason);
        } else {
          expect(bc.reason).toBe('MISSED_CONNECTION');
        }
      }
    }
  });
});
