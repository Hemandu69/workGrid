import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { SectionOccupancySummary } from './SectionOccupancySummary';
import { Room } from '../../types/room';

function buildRoom(overrides: Partial<Room>): Room {
  return {
    id: 'room-x',
    letter: 'A',
    name: 'Section A',
    subrooms: [],
    totalMembers: 0,
    totalCapacity: 16,
    occupancyPercentage: 0,
    ...overrides,
  };
}

describe('SectionOccupancySummary', () => {
  it('renders one row per room with the correct members/capacity/percentage text', () => {
    const rooms = [
      buildRoom({ letter: 'A', totalMembers: 1, totalCapacity: 16, occupancyPercentage: 6 }),
      buildRoom({ letter: 'B', totalMembers: 2, totalCapacity: 16, occupancyPercentage: 13 }),
    ];
    render(<SectionOccupancySummary rooms={rooms} />);

    expect(screen.getByText('Section A')).toBeInTheDocument();
    expect(screen.getByText('1 / 16 (6%)')).toBeInTheDocument();
    expect(screen.getByText('Section B')).toBeInTheDocument();
    expect(screen.getByText('2 / 16 (13%)')).toBeInTheDocument();
  });

  it('uses the rose threshold above 90%, amber above 75%, and green otherwise', () => {
    const rooms = [
      buildRoom({ letter: 'A', occupancyPercentage: 95 }),
      buildRoom({ letter: 'B', occupancyPercentage: 80 }),
      buildRoom({ letter: 'C', occupancyPercentage: 50 }),
    ];
    const { container } = render(<SectionOccupancySummary rooms={rooms} />);

    const bars = container.querySelectorAll('.h-full.rounded-full');
    expect(bars[0]).toHaveClass('bg-status-blocked');
    expect(bars[1]).toHaveClass('bg-status-busy');
    expect(bars[2]).toHaveClass('bg-status-available');
  });

  it('renders the detail link with the given href and label', () => {
    render(<SectionOccupancySummary rooms={[]} loading detailHref="/admin/operations" detailLabel="Detailed Grid →" />);

    const link = screen.getByRole('link', { name: 'Detailed Grid →' });
    expect(link).toHaveAttribute('href', '/admin/operations');
  });

  it('shows the loading placeholder when loading=true, even if rooms is non-empty', () => {
    render(<SectionOccupancySummary rooms={[buildRoom({})]} loading />);

    expect(screen.getByText('Loading section data...')).toBeInTheDocument();
    expect(screen.queryByText('Section A')).not.toBeInTheDocument();
  });

  it('shows an empty state (not the loading placeholder) when loading=false and rooms is empty', () => {
    render(<SectionOccupancySummary rooms={[]} loading={false} />);

    expect(screen.getByText('No section data available.')).toBeInTheDocument();
    expect(screen.queryByText('Loading section data...')).not.toBeInTheDocument();
  });

  it('renders the summary rows when loading=false and rooms is non-empty', () => {
    render(<SectionOccupancySummary rooms={[buildRoom({ letter: 'D', occupancyPercentage: 25 })]} loading={false} />);

    expect(screen.getByText('Section D')).toBeInTheDocument();
  });
});
