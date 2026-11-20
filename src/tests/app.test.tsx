import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import App from '../App';
import networkData from '../data/flight_network.json';

describe('App Component UI Integration Tests', () => {
  it('renders Domino Sky header and core layout components', () => {
    render(<App />);

    // Header title
    expect(screen.getByText('Domino Sky')).toBeInTheDocument();
    expect(
      screen.getByText(/Flight Disruption Cascade & Recovery Simulator/i)
    ).toBeInTheDocument();

    // Control bar, KPI strip, Network map, Flight cascade board, Dispatcher panel
    expect(screen.getByTestId('control-bar')).toBeInTheDocument();
    expect(screen.getByTestId('kpi-strip')).toBeInTheDocument();
    expect(screen.getByLabelText(/Flight network map/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Flight cascade board/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/AI dispatcher and recovery panel/i)).toBeInTheDocument();
  });

  it('renders dynamic flight counts from flight_network.json (70 flights total)', () => {
    render(<App />);

    const totalFlights = networkData.flights.length;
    expect(totalFlights).toBe(70);

    // FlightCascadeTable header displays: "Flight Cascade Board (70 of 70)"
    expect(
      screen.getByText(new RegExp(`Flight Cascade Board \\(${totalFlights} of ${totalFlights}\\)`, 'i'))
    ).toBeInTheDocument();
  });

  it('switches disruption scenarios when clicking presets and updates KPIs and flights', () => {
    render(<App />);

    // Initial preset is Mumbai Monsoon (BOM)
    const mumbaiPreset = screen.getByRole('button', { name: /Apply preset Mumbai Monsoon/i });
    expect(mumbaiPreset).toHaveAttribute('aria-pressed', 'true');

    // Read initial Delayed Flights count from KPI strip
    const kpiStrip = screen.getByTestId('kpi-strip');
    const initialDelayedText = within(kpiStrip).getByText(/Delayed Flights/i).parentElement?.textContent;

    // Click "Delhi Fog Hold" preset
    const delhiPreset = screen.getByRole('button', { name: /Apply preset Delhi Fog Hold/i });
    fireEvent.click(delhiPreset);

    // Delhi Fog Hold is now active
    expect(delhiPreset).toHaveAttribute('aria-pressed', 'true');
    expect(mumbaiPreset).toHaveAttribute('aria-pressed', 'false');

    // Airport input value should now be DEL
    const airportSelect = screen.getByLabelText(/Closed Airport/i) as HTMLSelectElement;
    expect(airportSelect.value).toBe('DEL');

    // KPI figures should update
    const updatedDelayedText = within(kpiStrip).getByText(/Delayed Flights/i).parentElement?.textContent;
    expect(updatedDelayedText).toBeDefined();
    expect(initialDelayedText).toBeTruthy();
    expect(updatedDelayedText).not.toBe(initialDelayedText);

    // Now switch to "Bengaluru Squall"
    const blrPreset = screen.getByRole('button', { name: /Apply preset Bengaluru Squall/i });
    fireEvent.click(blrPreset);

    expect(blrPreset).toHaveAttribute('aria-pressed', 'true');
    expect(airportSelect.value).toBe('BLR');
  });

  it('applies a recovery action and renders Before vs. After state and deltas', () => {
    render(<App />);

    // Find recovery candidates list
    const applyButtons = screen.getAllByRole('button', { name: /Apply recovery action:/i });
    expect(applyButtons.length).toBeGreaterThan(0);

    const firstCandidateBtn = applyButtons[0];

    // Apply the recovery candidate
    fireEvent.click(firstCandidateBtn);

    // Top banner shows recovery applied
    expect(screen.getByText(/Recovery Applied:/i)).toBeInTheDocument();

    // Button updates to "✓ Applied"
    expect(firstCandidateBtn).toHaveTextContent(/✓ Applied/i);
    expect(firstCandidateBtn).toHaveAttribute('aria-pressed', 'true');

    // "Reset to Base" button appears in the recovery engine section
    const resetBtn = screen.getByRole('button', { name: /Reset to Base/i });
    expect(resetBtn).toBeInTheDocument();

    // KPI strip renders deltas
    const kpiStrip = screen.getByTestId('kpi-strip');
    expect(kpiStrip).toBeInTheDocument();

    // Click "Reset to Base" to revert
    fireEvent.click(resetBtn);

    // Recovery is reverted
    expect(screen.queryByText(/Recovery Applied:/i)).not.toBeInTheDocument();
    expect(firstCandidateBtn).toHaveTextContent(/Apply Recovery/i);
    expect(firstCandidateBtn).toHaveAttribute('aria-pressed', 'false');
  });

  it('filters flight table rows by status filter buttons', () => {
    render(<App />);

    // Click Delayed filter
    const delayedFilterBtn = screen.getByRole('button', { name: /^Delayed/i });
    fireEvent.click(delayedFilterBtn);

    // Verify filter is active
    expect(delayedFilterBtn).toHaveAttribute('aria-pressed', 'true');

    // Click Cancelled filter
    const cancelledFilterBtn = screen.getByRole('button', { name: /^Cancelled/i });
    fireEvent.click(cancelledFilterBtn);
    expect(cancelledFilterBtn).toHaveAttribute('aria-pressed', 'true');

    // Reset back to All
    const allFilterBtn = screen.getByRole('button', { name: /^All/i });
    fireEvent.click(allFilterBtn);
    expect(allFilterBtn).toHaveAttribute('aria-pressed', 'true');
  });
});
