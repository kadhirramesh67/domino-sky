import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import ErrorBoundary from '../components/ErrorBoundary';

function ProblemChild({ shouldThrow }: { shouldThrow: boolean }) {
  if (shouldThrow) {
    throw new Error('Simulated operational failure');
  }
  return <div>Normal Content</div>;
}

describe('ErrorBoundary Component Tests', () => {
  it('renders children when no error occurs', () => {
    render(
      <ErrorBoundary>
        <div>All systems operational</div>
      </ErrorBoundary>
    );

    expect(screen.getByText('All systems operational')).toBeInTheDocument();
  });

  it('catches runtime error and renders accessible fallback alert UI', () => {
    // Suppress console.error output during test intentional throw
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});

    render(
      <ErrorBoundary>
        <ProblemChild shouldThrow={true} />
      </ErrorBoundary>
    );

    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(screen.getByText('Application Error')).toBeInTheDocument();
    expect(screen.getByText(/Simulated operational failure/i)).toBeInTheDocument();

    const tryAgainBtn = screen.getByRole('button', { name: /Try Again/i });
    expect(tryAgainBtn).toBeInTheDocument();
    fireEvent.click(tryAgainBtn);

    spy.mockRestore();
  });
});
