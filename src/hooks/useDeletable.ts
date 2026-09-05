import { useCallback } from 'react';
import { useStore, type Tombstone } from '@/store/useStore';
import { useToast } from '@/components/ui';

/**
 * 带撤销能力的删除。
 *
 * 所有删除动作都会在 store 里留下墓碑（含完整快照），
 * 这里在删除前后对比墓碑列表，拿到本次新增的部分，
 * 撤销时用快照原样恢复，并重新标记为待推送。
 *
 * 用法：
 *   const deletable = useDeletable();
 *   deletable('已删除备忘录', () => store.removeNote(id));
 */
export function useDeletable() {
  const toast = useToast();
  const restore = useStore((s) => s.restore);

  return useCallback(
    (text: string, run: () => void, options?: { confirm?: string }) => {
      if (options?.confirm && !window.confirm(options.confirm)) return;

      const before = useStore.getState().tombstones;
      run();
      const created: Tombstone[] = useStore
        .getState()
        .tombstones.filter((t) => !before.includes(t));

      if (created.length === 0) return;
      toast(text, {
        action: {
          label: '撤销',
          onClick: () => {
            restore(created);
            toast('已撤销删除');
          },
        },
        duration: 6000,
      });
    },
    [toast, restore],
  );
}
