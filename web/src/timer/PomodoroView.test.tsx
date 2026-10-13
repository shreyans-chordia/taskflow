import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createPomodoro, type Pomodoro } from './pomodoro';
import { PomodoroView } from './PomodoroView';
import { TimerNotices } from './TimerNotices';

/** The Pomodoro panel the desk clock opens, and the notices it raises (POM-1..POM-5). */

let store: Pomodoro;
const advance = (ms: number) => act(() => void vi.advanceTimersByTime(ms));
// fireEvent rather than userEvent: user-event waits on real timers, and these tests run on fake ones.
const click = (el: HTMLElement) => act(() => void fireEvent.click(el));

function renderTimer() {
  return render(
    <>
      <PomodoroView titleId="tm-title" store={store} />
      <TimerNotices store={store} />
    </>,
  );
}

beforeEach(() => {
  vi.useFakeTimers();
  store = createPomodoro({ chime: () => undefined, unlockAudio: () => undefined });
});
afterEach(() => {
  store.dispose();
  vi.useRealTimers();
});

describe('Pomodoro panel', () => {
  it('is ready for a 25-minute focus session (POM-1)', () => {
    renderTimer();
    expect(screen.getByRole('heading', { name: 'Focus timer' })).toBeInTheDocument();
    expect(screen.getByRole('timer')).toHaveTextContent('25:00');
    expect(screen.getByText('Ready')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '25 min' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('radio', { name: 'Focus' })).toBeChecked();
    expect(screen.getByRole('status')).toHaveTextContent('it is not linked to any task'); // POM-5
  });

  it('starts, counts down and locks the settings while running; pause and resume (POM-1, POM-4)', () => {
    renderTimer();
    click(screen.getByRole('button', { name: 'Start' }));
    advance(61_000);
    expect(screen.getByRole('timer')).toHaveTextContent('23:59');
    expect(screen.getByText('Focusing')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '45 min' })).toBeDisabled();
    expect(screen.getByLabelText('Focus · minutes')).toBeDisabled();
    expect(screen.getByRole('radiogroup', { name: 'Session type' })).toHaveAttribute('aria-disabled', 'true');
    click(screen.getByRole('button', { name: 'Pause' }));
    expect(screen.getByText('Paused')).toBeInTheDocument();
    advance(60_000);
    expect(screen.getByRole('timer')).toHaveTextContent('23:59');
    click(screen.getByRole('button', { name: 'Resume' }));
    expect(screen.getByText('Focusing')).toBeInTheDocument();
    click(screen.getByRole('button', { name: 'Reset' }));
    expect(screen.getByRole('timer')).toHaveTextContent('25:00');
    expect(screen.getByRole('button', { name: 'Start' })).toBeInTheDocument();
  });

  it('drains the Ring a segment per minute', () => {
    const { container } = renderTimer();
    const ring = () => container.querySelector('.tm-ring')!;
    expect(ring()).toHaveAttribute('data-segments', '25');
    expect(ring()).toHaveAttribute('data-lit', '25');
    click(screen.getByRole('button', { name: 'Start' }));
    advance(5 * 60_000);
    expect(ring()).toHaveAttribute('data-lit', '20');
  });

  it('takes a preset or typed lengths, and switches to a break while stopped', () => {
    renderTimer();
    click(screen.getByRole('button', { name: '45 min' }));
    expect(screen.getByRole('timer')).toHaveTextContent('45:00');
    expect(screen.getByLabelText('Focus · minutes')).toHaveValue(45);
    act(() => void fireEvent.change(screen.getByLabelText('Focus · minutes'), { target: { value: '' } }));
    expect(screen.getByRole('timer')).toHaveTextContent('45:00'); // an empty box while you retype changes nothing
    act(() => void fireEvent.change(screen.getByLabelText('Focus · minutes'), { target: { value: '50' } }));
    expect(screen.getByRole('timer')).toHaveTextContent('50:00');
    act(() => void fireEvent.change(screen.getByLabelText('Break · minutes'), { target: { value: '99' } }));
    act(() => void fireEvent.blur(screen.getByLabelText('Break · minutes')));
    expect(screen.getByLabelText('Break · minutes')).toHaveValue(30);
    // The switch takes pointer drags and arrow keys (a radio group); the keys are what this test can drive.
    act(() => void fireEvent.keyDown(screen.getByRole('radio', { name: 'Focus' }), { key: 'ArrowRight' }));
    expect(screen.getByRole('radio', { name: 'Break' })).toBeChecked();
    expect(screen.getByRole('timer')).toHaveTextContent('30:00');
    expect(screen.getByText('Break · 30 min')).toBeInTheDocument();
  });

  it('starts the break itself and says so; at the end of the break offers the next session (POM-2, POM-3)', () => {
    renderTimer();
    click(screen.getByRole('button', { name: '15 min' }));
    click(screen.getByRole('button', { name: 'Start' }));
    advance(15 * 60_000);
    expect(screen.getByText('On a break')).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('Focus session done. 5-minute break started.');
    expect(screen.getByText('1')).toHaveClass('tm-big');
    expect(screen.getByText('focus session finished today')).toBeInTheDocument();
    const notices = document.querySelector('.toasts') as HTMLElement;
    expect(within(notices).getByText('Focus session done. 5-minute break started.')).toBeInTheDocument();

    advance(5 * 60_000);
    expect(screen.getByRole('timer')).toHaveTextContent('15:00');
    expect(screen.getByRole('status')).toHaveTextContent('Break over. Ready for the next session.');
    click(within(notices).getByRole('button', { name: 'Start focus' }));
    expect(screen.getByText('Focusing')).toBeInTheDocument();
    advance(300);
    expect(within(notices).queryByText('Break over. Ready for the next session.')).not.toBeInTheDocument();
  });

  it('notices go away on their own, or when dismissed', () => {
    renderTimer();
    click(screen.getByRole('button', { name: '15 min' }));
    click(screen.getByRole('button', { name: 'Start' }));
    advance(15 * 60_000);
    const notices = document.querySelector('.toasts') as HTMLElement;
    expect(within(notices).getAllByRole('button', { name: 'Dismiss' })).toHaveLength(1);
    advance(12_500);
    expect(within(notices).queryByRole('button', { name: 'Dismiss' })).not.toBeInTheDocument();
    advance(5 * 60_000);
    click(within(notices).getByRole('button', { name: 'Dismiss' }));
    advance(300);
    expect(notices).toBeEmptyDOMElement();
  });
});
