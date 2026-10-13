import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DateButton, TimeButton } from './DeadlinePickers';

/** The task form's deadline pickers (DL-1), in the colour picker's style. Today is Tuesday 13 October 2026. */

function Harness({ date = '', time = '', onDate = vi.fn(), onTime = vi.fn() }: { date?: string; time?: string; onDate?: (d: string) => void; onTime?: (t: string) => void }) {
  const [d, setD] = useState(date);
  const [t, setT] = useState(time);
  return (
    <>
      <p>Outside</p>
      <label id="dl-l" htmlFor="dl">Deadline · optional</label>
      <DateButton id="dl" labelId="dl-l" value={d} onChange={(v) => { setD(v); onDate(v); }} />
      <label id="tm-l" htmlFor="tm">Time · optional</label>
      <TimeButton id="tm" labelId="tm-l" value={t} disabled={!d} onChange={(v) => { setT(v); onTime(v); }} />
    </>
  );
}

const dateBtn = () => screen.getByRole('button', { name: /^Deadline · optional/ });
const timeBtn = () => screen.getByRole('button', { name: /^Time · optional/ });
const openDate = async () => {
  await userEvent.click(dateBtn());
  return screen.getByRole('dialog', { name: 'Choose a date' });
};
const openTime = async () => {
  await userEvent.click(timeBtn());
  return screen.getByRole('dialog', { name: 'Choose a time' });
};

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(2026, 9, 13, 10));
});
afterEach(() => vi.useRealTimers());

describe('<DateButton>', () => {
  it('names the field and its value, and says when there is none', () => {
    render(<Harness date="2026-10-22" />);
    expect(dateBtn()).toHaveAccessibleName('Deadline · optional Thu 22 Oct 2026');
    expect(dateBtn()).toHaveAttribute('aria-haspopup', 'dialog');
  });

  it('says when there is no deadline', () => {
    render(<Harness />);
    expect(dateBtn()).toHaveAccessibleName('Deadline · optional No deadline');
  });

  it('opens on the chosen day, pressed, with focus on it, and today marked', async () => {
    render(<Harness date="2026-10-22" />);
    const dp = await openDate();
    expect(dateBtn()).toHaveAttribute('aria-expanded', 'true');
    const day = within(dp).getByRole('button', { name: 'Thursday 22 October 2026' });
    expect(day).toHaveAttribute('aria-pressed', 'true');
    expect(day).toHaveFocus();
    expect(within(dp).getByRole('button', { name: 'Tuesday 13 October 2026, today' })).toBeInTheDocument();
    expect(within(dp).getByRole('table', { name: 'October 2026' })).toBeInTheDocument();
    expect(dp).toHaveTextContent('Thu 22 Oct 2026');
  });

  it('applies a quick pick at once and returns focus to the button', async () => {
    const onDate = vi.fn();
    render(<Harness onDate={onDate} />);
    const dp = await openDate();
    await userEvent.click(within(dp).getByRole('button', { name: 'Weekend, Saturday 17 October 2026' }));
    expect(onDate).toHaveBeenCalledWith('2026-10-17');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(dateBtn()).toHaveFocus();
    expect(dateBtn()).toHaveTextContent('Sat 17 Oct 2026');
  });

  it('picks a day from the month grid, in another month too', async () => {
    const onDate = vi.fn();
    render(<Harness onDate={onDate} />);
    const dp = await openDate();
    await userEvent.click(within(dp).getByRole('button', { name: 'Next month' }));
    expect(within(dp).getByRole('table', { name: 'November 2026' })).toBeInTheDocument();
    await userEvent.click(within(dp).getByRole('button', { name: 'Thursday 5 November 2026' }));
    expect(onDate).toHaveBeenCalledWith('2026-11-05');
  });

  it('moves through the grid with the keyboard: arrows, Page Up / Down, Home / End, Enter', async () => {
    const onDate = vi.fn();
    render(<Harness onDate={onDate} />);
    const dp = await openDate();
    expect(within(dp).getByRole('button', { name: /^Tuesday 13 October/ })).toHaveFocus();
    await userEvent.keyboard('{ArrowRight}{ArrowDown}');
    expect(within(dp).getByRole('button', { name: 'Wednesday 21 October 2026' })).toHaveFocus();
    await userEvent.keyboard('{PageDown}');
    expect(within(dp).getByRole('table', { name: 'November 2026' })).toBeInTheDocument();
    expect(within(dp).getByRole('button', { name: 'Saturday 21 November 2026' })).toHaveFocus();
    await userEvent.keyboard('{Home}');
    expect(within(dp).getByRole('button', { name: 'Sunday 15 November 2026' })).toHaveFocus();
    await userEvent.keyboard('{Enter}');
    expect(onDate).toHaveBeenCalledWith('2026-11-15');
  });

  it('takes a typed date, and says so when it cannot read one', async () => {
    const onDate = vi.fn();
    render(<Harness onDate={onDate} />);
    const dp = await openDate();
    const field = within(dp).getByLabelText('Type a date');
    expect(within(dp).getByRole('button', { name: 'Use date' })).toBeDisabled();
    await userEvent.type(field, '31/02/2026{Enter}');
    expect(within(dp).getByRole('alert')).toHaveTextContent('Try 22/10/2026, 22 Oct or tomorrow.');
    expect(field).toHaveAttribute('aria-invalid', 'true');
    await userEvent.clear(field);
    await userEvent.type(field, '5 Jan');
    await userEvent.click(within(dp).getByRole('button', { name: 'Use date' }));
    expect(onDate).toHaveBeenCalledWith('2027-01-05');
  });

  it('can remove the deadline, and closes on Escape or a press outside without changing it', async () => {
    const onDate = vi.fn();
    render(<Harness date="2026-10-22" onDate={onDate} />);
    await openDate();
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(dateBtn()).toHaveFocus();
    await openDate();
    await userEvent.click(screen.getByText('Outside'));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(onDate).not.toHaveBeenCalled();
    const dp = await openDate();
    await userEvent.click(within(dp).getByRole('button', { name: 'No deadline' }));
    expect(onDate).toHaveBeenCalledWith('');
    expect(dateBtn()).toHaveTextContent('No deadline');
  });

  it('keeps Tab inside while open', async () => {
    render(<Harness />);
    const dp = await openDate();
    within(dp).getByLabelText('Type a date').focus();
    await userEvent.tab(); // Use date is disabled while the field is empty, so Tab wraps to the start
    expect(within(dp).getByRole('button', { name: 'Close date picker' })).toHaveFocus();
    await userEvent.tab({ shift: true });
    expect(within(dp).getByLabelText('Type a date')).toHaveFocus();
  });
});

describe('<TimeButton>', () => {
  it('waits for a day before it can be set', () => {
    render(<Harness />);
    expect(timeBtn()).toBeDisabled();
    expect(timeBtn()).toHaveAccessibleName('Time · optional No time');
  });

  it('applies a quick pick at once', async () => {
    const onTime = vi.fn();
    render(<Harness date="2026-10-22" onTime={onTime} />);
    const tp = await openTime();
    expect(within(tp).getByRole('button', { name: '9:00 AM' })).toHaveFocus();
    await userEvent.click(within(tp).getByRole('button', { name: '6:00 PM' }));
    expect(onTime).toHaveBeenCalledWith('18:00');
    expect(timeBtn()).toHaveTextContent('6:00 PM');
    expect(timeBtn()).toHaveFocus();
  });

  it('sets a custom time with the hour and minute sliders, then "Use time"', async () => {
    const onTime = vi.fn();
    render(<Harness date="2026-10-22" time="18:00" onTime={onTime} />);
    const tp = await openTime();
    expect(within(tp).getByRole('button', { name: '6:00 PM' })).toHaveAttribute('aria-pressed', 'true');
    // jsdom does not move range inputs with the keyboard or a drag, so set them as a drag would
    const minute = within(tp).getByRole('slider', { name: 'Minute' });
    expect(minute).toHaveAttribute('aria-valuetext', 'Minute 00, 6:00 PM');
    fireEvent.change(minute, { target: { value: '45' } });
    fireEvent.change(within(tp).getByRole('slider', { name: 'Hour' }), { target: { value: '7' } });
    expect(tp).toHaveTextContent('7:45 AM · 07:45');
    await userEvent.click(within(tp).getByRole('button', { name: 'Use time' }));
    expect(onTime).toHaveBeenCalledWith('07:45');
  });

  it('takes a typed time, refuses a wrong one, and can remove the time', async () => {
    const onTime = vi.fn();
    render(<Harness date="2026-10-22" time="09:00" onTime={onTime} />);
    let tp = await openTime();
    const field = within(tp).getByLabelText('Type a time');
    await userEvent.type(field, '25:00{Enter}');
    expect(within(tp).getByRole('alert')).toHaveTextContent('Try 18:30, 6:30 pm or 6pm.');
    await userEvent.clear(field);
    await userEvent.type(field, '6:30 pm{Enter}');
    expect(onTime).toHaveBeenLastCalledWith('18:30');
    tp = await openTime();
    await userEvent.click(within(tp).getByRole('button', { name: 'No time' }));
    expect(onTime).toHaveBeenLastCalledWith('');
    expect(timeBtn()).toHaveTextContent('No time');
  });
});
