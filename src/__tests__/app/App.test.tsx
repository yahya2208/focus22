import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import App from '../../App';

describe('App', () => {
  it('should render the home screen by default', () => {
    render(<App />);
    expect(screen.getByRole('main', { name: 'Main navigation' })).toBeTruthy();
    expect(screen.getAllByRole('button', { name: '▶ Start Test' }).length).toBeGreaterThanOrEqual(1);
  });

  it('should render all home screen buttons', () => {
    render(<App />);
    expect(screen.getAllByRole('button', { name: '▶ Start Test' }).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByRole('button').length).toBeGreaterThanOrEqual(3);
    expect(screen.getByRole('button', { name: 'Menu' })).toBeTruthy();
  });
});
