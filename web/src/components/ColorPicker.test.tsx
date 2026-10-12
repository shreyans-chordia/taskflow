import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { hexToHsv, hsvToHex, normalizeHex, PALETTE } from './color';
import { ColorButton } from './ColorPicker';

/** The room's colour picker, used for categories and priority levels (CAT-1, PR-1). */

describe('colour maths', () => {
  it('round-trips every preset through HSV', () => {
    for (const hex of PALETTE) {
      const { h, s, v } = hexToHsv(hex);
      expect(hsvToHex(h, s, v)).toBe(hex);
    }
    expect(PALETTE).toHaveLength(16);
  });

  it('accepts a hex code with or without #, in any case, and nothing else', () => {
    expect(normalizeHex('4f86d9')).toBe('#4F86D9');
    expect(normalizeHex(' #4F86D9 ')).toBe('#4F86D9');
    expect(normalizeHex('#4F86D')).toBeNull();
    expect(normalizeHex('blue')).toBeNull();
  });
});

function Harness({ onChange = vi.fn(), start = '#4F86D9' }: { onChange?: (h: string) => void; start?: string }) {
  const [value, setValue] = useState(start);
  return (
    <>
      <p>Outside</p>
      <ColorButton value={value} label="Colour of Study" onChange={(h) => { setValue(h); onChange(h); }} />
    </>
  );
}
const open = async () => {
  await userEvent.click(screen.getByRole('button', { name: /^Colour of Study: / }));
  return screen.getByRole('dialog', { name: 'Choose a colour' });
};

describe('<ColorButton>', () => {
  it('opens on the current colour, ticked, with focus on it', async () => {
    render(<Harness />);
    const picker = await open();
    const current = within(picker).getByRole('button', { name: '#4F86D9' });
    expect(current).toHaveAttribute('aria-pressed', 'true');
    expect(current).toHaveFocus();
    expect(within(picker).getAllByRole('button', { name: /^#/ })).toHaveLength(16);
    expect(picker).toHaveTextContent('#4F86D9');
  });

  it('applies a preset at once and returns focus to the swatch', async () => {
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    const picker = await open();
    await userEvent.click(within(picker).getByRole('button', { name: '#C2185B' }));
    expect(onChange).toHaveBeenCalledWith('#C2185B');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Colour of Study: #C2185B' })).toHaveFocus();
  });

  it('applies a typed hex code with Enter, or a custom colour with "Use colour"', async () => {
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    let picker = await open();
    const hex = within(picker).getByRole('textbox', { name: 'Hex colour code' });
    await userEvent.clear(hex);
    await userEvent.type(hex, '12ab90{Enter}');
    expect(onChange).toHaveBeenLastCalledWith('#12AB90');

    picker = await open();
    // The saturation/brightness square moves with the arrow keys: less saturated, then "Use colour".
    const square = within(picker).getByRole('slider', { name: /Saturation and brightness/ });
    fireEvent.keyDown(square, { key: 'ArrowLeft' });
    fireEvent.keyDown(square, { key: 'ArrowLeft' });
    const shown = within(picker).getByRole('textbox', { name: 'Hex colour code' }) as HTMLInputElement;
    expect(shown.value).not.toBe('#12AB90');
    await userEvent.click(within(picker).getByRole('button', { name: 'Use colour' }));
    expect(onChange).toHaveBeenLastCalledWith(shown.value);
  });

  it('changes nothing on Escape or a click outside', async () => {
    const onChange = vi.fn();
    const outerEscape = vi.fn();
    document.addEventListener('keydown', outerEscape);
    render(<Harness onChange={onChange} />);
    await open();
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(outerEscape).not.toHaveBeenCalled(); // the panel behind keeps its Escape for itself
    expect(screen.getByRole('button', { name: /^Colour of Study/ })).toHaveFocus();

    await open();
    await userEvent.click(screen.getByText('Outside'));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(onChange).not.toHaveBeenCalled();
    document.removeEventListener('keydown', outerEscape);
  });
});
