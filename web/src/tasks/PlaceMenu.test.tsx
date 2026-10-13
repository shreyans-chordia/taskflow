import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { QuickAdd } from './QuickAdd';

/** Where a new priority level sits (PR-2), picked from the room-style menu in the quick-add row. */

const levels = [
  { id: 'hi', name: 'High', color: '#E04A2F', order: 0, isDefault: false, filled: 3 },
  { id: 'md', name: 'Medium', color: '#F0A81C', order: 1, isDefault: true, filled: 2 },
  { id: 'lo', name: 'Low', color: '#4E9E78', order: 2, isDefault: false, filled: 1 },
];

function renderQuick(create = vi.fn(async () => 'new')) {
  render(
    <>
      <p>Outside</p>
      <QuickAdd kind="priority" existing={levels} create={create} onAdded={vi.fn()} onCancel={vi.fn()} />
    </>,
  );
  return create;
}
const place = () => screen.getByRole('button', { name: /^Where it sits: / });
const open = async () => {
  await userEvent.click(place());
  return screen.getByRole('dialog', { name: 'Where it sits' });
};

describe('position menu', () => {
  it('starts at the bottom and lists every slot, the chosen one ticked and focused', async () => {
    renderQuick();
    expect(place()).toHaveAccessibleName('Where it sits: Below Low');
    const menu = await open();
    const options = within(menu).getAllByRole('option');
    expect(options.map((o) => o.textContent)).toEqual([
      'At the top1st of 4 · highest',
      'Below High2nd of 4',
      'Below Medium3rd of 4',
      'Below Low4th of 4 · lowest',
    ]);
    expect(options[3]).toHaveAttribute('aria-selected', 'true');
    expect(options[3]).toHaveFocus();
    expect(menu).toHaveTextContent('4th of 4');
  });

  it('picks a slot with a click, closes and returns focus', async () => {
    const create = renderQuick();
    const menu = await open();
    await userEvent.click(within(menu).getByRole('option', { name: /^At the top/ }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(place()).toHaveAccessibleName('Where it sits: At the top');
    expect(place()).toHaveFocus();
    await userEvent.type(screen.getByLabelText('Level name'), 'Urgent');
    await userEvent.click(screen.getByRole('button', { name: 'Add' }));
    expect(create).toHaveBeenCalledWith(expect.objectContaining({ name: 'Urgent', position: 0 }));
  });

  it('moves with the arrow keys, Home and End, previews the slot, and Enter picks it', async () => {
    const create = renderQuick();
    const menu = await open();
    await userEvent.keyboard('{ArrowUp}{ArrowUp}');
    expect(within(menu).getByRole('option', { name: /^Below High/ })).toHaveFocus();
    expect(menu).toHaveTextContent('2nd of 4');
    await userEvent.keyboard('{Home}');
    expect(within(menu).getByRole('option', { name: /^At the top/ })).toHaveFocus();
    await userEvent.keyboard('{End}{ArrowUp}{Enter}');
    expect(place()).toHaveAccessibleName('Where it sits: Below Medium');
    expect(create).not.toHaveBeenCalled(); // Enter picked the slot, it did not add the level
  });

  it('closes on Escape or a press outside without changing the slot', async () => {
    renderQuick();
    await open();
    await userEvent.keyboard('{ArrowUp}{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(place()).toHaveFocus();
    await open();
    await userEvent.click(screen.getByText('Outside'));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(place()).toHaveAccessibleName('Where it sits: Below Low');
  });
});
