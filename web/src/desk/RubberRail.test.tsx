import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { RubberRail, type RailItem } from './RubberRail';

/** The desk's shortcut rail with the rubber thumb: still plain buttons in a nav, so every shortcut stays reachable. */

beforeAll(() => {
  // jsdom has no ResizeObserver; the rail only uses it to re-measure.
  vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} });
});

const items = (onClick = vi.fn()): RailItem[] => [
  { key: 'board', label: 'Tasks', onClick },
  { key: 'calendar', label: 'Calendar', onClick },
  { key: 'lamp', label: 'Lamp', ariaLabel: 'Lamp: switch to dark mode', onClick },
];

describe('<RubberRail>', () => {
  it('keeps the shortcuts as buttons in a navigation landmark, with the thumb hidden from assistive tech', () => {
    render(<RubberRail label="Desk shortcuts" items={items()} active={null} />);
    const nav = screen.getByRole('navigation', { name: 'Desk shortcuts' });
    expect(within(nav).getAllByRole('button').map((b) => b.getAttribute('aria-label') ?? b.textContent)).toEqual(['Tasks', 'Calendar', 'Lamp: switch to dark mode']);
    // The thumb's copy of the labels is decoration only: no duplicate names for screen readers.
    expect(within(nav).getAllByText('Calendar')).toHaveLength(2);
    expect(within(nav).getAllByText('Calendar')[1]!.closest('[aria-hidden="true"]')).not.toBeNull();
  });

  it('runs the shortcut on click', async () => {
    const onClick = vi.fn();
    render(<RubberRail label="Desk shortcuts" items={items(onClick)} active={null} />);
    await userEvent.click(screen.getByRole('button', { name: 'Calendar' }));
    expect(onClick).toHaveBeenCalledOnce();
  });

  it('marks the item whose panel is open, and disables the rail while it is', () => {
    const { rerender } = render(<RubberRail label="Desk shortcuts" items={items()} active={null} />);
    expect(screen.getByRole('button', { name: 'Calendar' })).not.toHaveAttribute('aria-current');
    rerender(<RubberRail label="Desk shortcuts" items={items()} active="calendar" disabled />);
    expect(screen.getByRole('button', { name: 'Calendar' })).toHaveAttribute('aria-current', 'true');
    expect(screen.getByRole('button', { name: 'Tasks' })).toBeDisabled();
  });

  it('shows the thumb on hover and fades it when the pointer leaves with nothing open', async () => {
    const { container } = render(<RubberRail label="Desk shortcuts" items={items()} active={null} />);
    const thumb = container.querySelector<HTMLElement>('.desk-rail-thumb')!;
    expect(thumb.style.opacity).toBe('0');
    fireEvent.pointerEnter(screen.getByRole('button', { name: 'Tasks' }), { pointerType: 'mouse' });
    await vi.waitFor(() => expect(Number(thumb.style.opacity)).toBe(1));
    fireEvent.pointerLeave(container.querySelector('.desk-rail-inner')!, { pointerType: 'mouse' });
    await vi.waitFor(() => expect(Number(thumb.style.opacity)).toBe(0));
  });
});
