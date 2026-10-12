import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { categoriesApi, prioritiesApi, tasksApi } from '../api/endpoints';
import type { NewTask, Subtask, Task, TaskPatch } from '../api/types';

const TASKS = ['tasks'] as const;

/** The three lists every task view needs. They share one cache with the 3D desk, so the notes repaint on any change. */
export function useTaskData() {
  const tasks = useQuery({ queryKey: TASKS, queryFn: () => tasksApi.list() });
  const priorities = useQuery({ queryKey: ['priorities'], queryFn: prioritiesApi.list });
  const categories = useQuery({ queryKey: ['categories'], queryFn: categoriesApi.list });
  return { tasks, priorities, categories };
}

/**
 * Every change a task view can make. Ticks (task done, checklist item done) show at once and roll back if the
 * server refuses; everything else waits for the server and then puts its answer straight into the cache.
 */
export function useTaskActions() {
  const qc = useQueryClient();
  const put = (t: Task) => qc.setQueryData<Task[]>(TASKS, (list) => list?.map((x) => (x.id === t.id ? t : x)));
  const refresh = () => qc.invalidateQueries({ queryKey: TASKS });
  const snapshot = async () => {
    await qc.cancelQueries({ queryKey: TASKS });
    return qc.getQueryData<Task[]>(TASKS);
  };
  const edit = (id: string, change: (t: Task) => Task) => qc.setQueryData<Task[]>(TASKS, (list) => list?.map((t) => (t.id === id ? change(t) : t)));
  const rollback = (_e: unknown, _v: unknown, ctx: { previous?: Task[] } | undefined) => {
    if (ctx?.previous) qc.setQueryData(TASKS, ctx.previous);
  };

  const create = useMutation({
    mutationFn: (t: NewTask) => tasksApi.create(t),
    onSuccess: (t) => {
      qc.setQueryData<Task[]>(TASKS, (list) => (list ? [...list, t] : list));
      void refresh();
    },
  });

  const update = useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: TaskPatch }) => tasksApi.update(id, patch),
    onSuccess: put,
    onSettled: refresh,
  });

  const setDone = useMutation({
    mutationFn: ({ id, done }: { id: string; done: boolean }) => tasksApi.update(id, { done }),
    onMutate: async ({ id, done }) => {
      const previous = await snapshot();
      edit(id, (t) => ({ ...t, done }));
      return { previous };
    },
    onError: rollback,
    onSuccess: put,
    onSettled: refresh,
  });

  const remove = useMutation({
    mutationFn: (id: string) => tasksApi.remove(id),
    onSuccess: (_r, id) => {
      qc.setQueryData<Task[]>(TASKS, (list) => list?.filter((t) => t.id !== id));
      void refresh();
    },
  });

  const addSubtask = useMutation({
    mutationFn: ({ id, title }: { id: string; title: string }) => tasksApi.addSubtask(id, title),
    onSuccess: put,
  });

  const setSubtaskDone = useMutation({
    mutationFn: ({ id, sub, done }: { id: string; sub: string; done: boolean }) => tasksApi.updateSubtask(id, sub, { done }),
    onMutate: async ({ id, sub, done }) => {
      const previous = await snapshot();
      edit(id, (t) => ({ ...t, subtasks: t.subtasks.map((s: Subtask) => (s.id === sub ? { ...s, done } : s)) }));
      return { previous };
    },
    onError: rollback,
    onSuccess: put,
  });

  const removeSubtask = useMutation({
    mutationFn: ({ id, sub }: { id: string; sub: string }) => tasksApi.removeSubtask(id, sub),
    onMutate: async ({ id, sub }) => {
      const previous = await snapshot();
      edit(id, (t) => ({ ...t, subtasks: t.subtasks.filter((s) => s.id !== sub) }));
      return { previous };
    },
    onError: rollback,
    onSuccess: put,
  });

  const createCategory = useMutation({
    mutationFn: (b: { name: string; color: string }) => categoriesApi.create(b),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['categories'] }),
  });

  const createPriority = useMutation({
    mutationFn: (b: { name: string; color: string; position?: number }) => prioritiesApi.create(b),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['priorities'] }),
  });

  return { create, update, setDone, remove, addSubtask, setSubtaskDone, removeSubtask, createCategory, createPriority };
}
