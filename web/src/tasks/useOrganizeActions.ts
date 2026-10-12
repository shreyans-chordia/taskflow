import { useMutation, useQueryClient } from '@tanstack/react-query';
import { categoriesApi, prioritiesApi } from '../api/endpoints';
import type { Category, Priority } from '../api/types';

const CATS = ['categories'] as const;
const PRIOS = ['priorities'] as const;
const TASKS = ['tasks'] as const;

/** Puts `ids` first-to-last into `list`'s order (what the server will answer), keeping anything unknown at the end. */
export function inOrder<T extends { id: string; order: number }>(list: T[], ids: string[]): T[] {
  const at = new Map(ids.map((id, i) => [id, i]));
  return [...list].sort((a, b) => (at.get(a.id) ?? 1e9) - (at.get(b.id) ?? 1e9)).map((x, order) => ({ ...x, order }));
}

/** `ids` with the item at `from` moved one step up (-1) or down (+1). */
export function moved(ids: string[], from: number, step: -1 | 1): string[] {
  const to = from + step;
  if (to < 0 || to >= ids.length) return ids;
  const next = [...ids];
  [next[from], next[to]] = [next[to]!, next[from]!];
  return next;
}

/**
 * Every change the categories & priorities manager makes. Reordering shows at once (the desk's trays move with it)
 * and rolls back if the server refuses; renames and colours wait for the server's answer; deletes also refresh the
 * tasks, which lose the category (CAT-4) or move to another level.
 */
export function useOrganizeActions() {
  const qc = useQueryClient();

  const putCategory = (c: Category) => qc.setQueryData<Category[]>(CATS, (list) => list?.map((x) => (x.id === c.id ? c : x)));
  const putPriority = (p: Priority) => qc.setQueryData<Priority[]>(PRIOS, (list) => list?.map((x) => (x.id === p.id ? p : x)));

  const updateCategory = useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: { name?: string; color?: string } }) => categoriesApi.update(id, patch),
    onSuccess: putCategory,
  });

  const removeCategory = useMutation({
    mutationFn: (id: string) => categoriesApi.remove(id),
    onSuccess: (_r, id) => {
      qc.setQueryData<Category[]>(CATS, (list) => list?.filter((x) => x.id !== id));
      void qc.invalidateQueries({ queryKey: CATS });
      void qc.invalidateQueries({ queryKey: TASKS });
    },
  });

  const reorderCategories = useMutation({
    mutationFn: (ids: string[]) => categoriesApi.reorder(ids),
    onMutate: async (ids) => {
      await qc.cancelQueries({ queryKey: CATS });
      const previous = qc.getQueryData<Category[]>(CATS);
      if (previous) qc.setQueryData(CATS, inOrder(previous, ids));
      return { previous };
    },
    onError: (_e, _ids, ctx) => ctx?.previous && qc.setQueryData(CATS, ctx.previous),
    onSuccess: (list) => qc.setQueryData(CATS, list),
  });

  const updatePriority = useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: { name?: string; color?: string; isDefault?: true } }) => prioritiesApi.update(id, patch),
    onSuccess: (p, { patch }) => {
      // Making one level the default unsets it on the others, so fetch the whole list again.
      if (patch.isDefault) void qc.invalidateQueries({ queryKey: PRIOS });
      else putPriority(p);
    },
  });

  const removePriority = useMutation({
    mutationFn: (id: string) => prioritiesApi.remove(id),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: PRIOS });
      void qc.invalidateQueries({ queryKey: TASKS });
    },
  });

  const reorderPriorities = useMutation({
    mutationFn: (ids: string[]) => prioritiesApi.reorder(ids),
    onMutate: async (ids) => {
      await qc.cancelQueries({ queryKey: PRIOS });
      const previous = qc.getQueryData<Priority[]>(PRIOS);
      if (previous) qc.setQueryData(PRIOS, inOrder(previous, ids));
      return { previous };
    },
    onError: (_e, _ids, ctx) => ctx?.previous && qc.setQueryData(PRIOS, ctx.previous),
    onSuccess: (list) => qc.setQueryData(PRIOS, list),
  });

  return { updateCategory, removeCategory, reorderCategories, updatePriority, removePriority, reorderPriorities };
}
