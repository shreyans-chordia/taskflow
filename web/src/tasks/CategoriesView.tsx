import { boardOrder, CategoryChips, Cork } from './board';
import { rankLevels } from './format';
import { useTaskData } from './useTaskActions';

/**
 * Categories, as in the room: a chip per category with its count, and that category's tasks pinned to a cork board
 * as sticky notes (CAT-2 browse by category, TASK-3 a note opens its task). "All" shows every task.
 * Managing the categories themselves (and the priority levels) is one step further: `onManage`.
 */
export function CategoriesView({ titleId, categoryId, onPick, onOpen, onManage }: {
  titleId: string;
  /** The chosen category; undefined is "All". */
  categoryId?: string;
  onPick: (categoryId: string | undefined) => void;
  onOpen: (taskId: string) => void;
  onManage: () => void;
}) {
  const { tasks, priorities, categories } = useTaskData();
  const cats = categories.data ?? [];
  const all = tasks.data ?? [];
  const levels = rankLevels(priorities.data ?? []);
  const chosen = categoryId ? cats.find((c) => c.id === categoryId) : undefined; // deleted meanwhile: All
  const shown = boardOrder(chosen ? all.filter((t) => t.categoryIds.includes(chosen.id)) : all, levels);
  const heading = chosen ? `${chosen.name} tasks` : 'All tasks';

  return (
    <>
      <div className="tv-head">
        <div>
          <div className="eyebrow">Categories</div>
          <h1 id={titleId} className="title" tabIndex={-1}>
            {heading}
          </h1>
        </div>
      </div>

      <CategoryChips cats={cats} tasks={all} current={chosen?.id} onPick={onPick} />

      {tasks.isPending ? (
        <p className="wb-note">Loading your tasks…</p>
      ) : (
        <Cork tasks={shown} levels={levels} cats={cats} label={heading} empty={chosen ? `No tasks in ${chosen.name} yet.` : 'Nothing pinned yet.'} onNote={(t) => onOpen(t.id)} />
      )}

      <div className="tv-row cat-foot">
        <button type="button" className="btn cat-manage" onClick={onManage}>
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M4 20h4L19 9l-4-4L4 16v4zM14 6l4 4" />
          </svg>
          Manage categories &amp; priorities
        </button>
      </div>
    </>
  );
}
