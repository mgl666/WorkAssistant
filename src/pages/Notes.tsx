import { useEffect, useMemo, useState } from 'react';
import { ChevronLeft, Copy, Download, NotebookPen, Pin, Plus, Search, Trash2 } from 'lucide-react';
import { cn, copyText, downloadFile, plainText } from '@/lib/utils';
import { formatDateTime } from '@/lib/date';
import { useStore } from '@/store/useStore';
import MarkdownEditor from '@/components/MarkdownEditor';
import { useDeletable } from '@/hooks/useDeletable';
import { Empty, useToast } from '@/components/ui';

export default function Notes() {
  const notes = useStore((s) => s.notes);
  const addNote = useStore((s) => s.addNote);
  const updateNote = useStore((s) => s.updateNote);
  const removeNote = useStore((s) => s.removeNote);
  const toast = useToast();
  const deletable = useDeletable();

  const [activeId, setActiveId] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  /** 小屏时备忘录是「列表 → 编辑器」两个界面，大屏（lg+）始终并排显示 */
  const [mobileView, setMobileView] = useState<'list' | 'editor'>('list');

  const sorted = useMemo(() => {
    return [...notes].sort((a, b) => {
      if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
      return b.updatedAt - a.updatedAt;
    });
  }, [notes]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return sorted;
    return sorted.filter(
      (n) => n.title.toLowerCase().includes(q) || n.content.toLowerCase().includes(q),
    );
  }, [sorted, query]);

  const active = notes.find((n) => n.id === activeId) ?? null;

  useEffect(() => {
    if (!activeId && sorted.length) setActiveId(sorted[0].id);
    if (activeId && !notes.some((n) => n.id === activeId)) setActiveId(sorted[0]?.id ?? null);
  }, [sorted, notes, activeId]);

  // 编辑器内部就是 Markdown 文档树，序列化结果直接落库，不做任何 HTML 往返转换
  const handleChange = (markdown: string) => {
    if (!active || markdown === active.content) return;
    updateNote(active.id, { content: markdown });
  };

  return (
    <div className="grid items-stretch gap-4 lg:grid-cols-[260px_1fr]">
      {/* ------------------------------- 备忘录列表 ------------------------------ */}
      <div
        className={cn(
          'card flex h-[420px] flex-col overflow-hidden lg:h-[calc(100vh-7rem)] lg:min-h-[620px]',
          mobileView === 'editor' && 'hidden lg:flex',
        )}
      >
        <div className="space-y-2 border-b border-slate-200 p-3 dark:border-slate-800">
          <button
            className="btn-primary w-full"
            onClick={() => {
              const id = addNote();
              setActiveId(id);
              setMobileView('editor');
            }}
          >
            <Plus size={16} />
            新建备忘录
          </button>
          <div className="relative">
            <Search size={15} className="absolute left-2.5 top-2.5 text-slate-400" />
            <input
              className="input pl-8"
              placeholder="搜索标题或内容"
              aria-label="搜索备忘录"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-2">
          {visible.length === 0 ? (
            <Empty
              icon={NotebookPen}
              text={query ? '没有匹配的备忘录' : '还没有备忘录'}
              action={query
                ? <button className="btn-outline mt-2" onClick={() => setQuery('')}>清除搜索</button>
                : <button className="btn-primary mt-2" onClick={() => { const id = addNote(); setActiveId(id); setMobileView('editor'); }}><Plus size={16} />新建备忘录</button>}
            />
          ) : (
            <ul className="space-y-1">
              {visible.map((n) => {
                const title = n.title.trim() || plainText(n.content).slice(0, 20) || '无标题备忘录';
                return (
                  <li key={n.id}>
                    <button
                      onClick={() => {
                        setActiveId(n.id);
                        setMobileView('editor');
                      }}
                      className={cn(
                        'w-full rounded-lg px-3 py-2 text-left transition',
                        n.id === activeId
                          ? 'bg-indigo-50 dark:bg-indigo-500/15'
                          : 'hover:bg-slate-100 dark:hover:bg-slate-800',
                      )}
                    >
                      <div className="flex items-center gap-1">
                        {n.pinned && <Pin size={12} className="shrink-0 text-amber-500" />}
                        <span
                          className={cn(
                            'truncate text-sm font-medium',
                            n.id === activeId && 'text-indigo-700 dark:text-indigo-300',
                          )}
                        >
                          {title}
                        </span>
                      </div>
                      <div className="truncate text-xs text-slate-400">
                        {plainText(n.content).slice(0, 40) || '空白内容'}
                      </div>
                      <div className="mt-0.5 text-[11px] text-slate-400">
                        {formatDateTime(n.updatedAt)}
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>

      {/* --------------------------------- 编辑器 -------------------------------- */}
      <div
        className={cn(
          'card flex h-[calc(100dvh-5rem)] min-h-[480px] flex-col overflow-hidden lg:h-[calc(100vh-7rem)] lg:min-h-[620px]',
          mobileView === 'list' && 'hidden lg:flex',
        )}
      >
        {!active ? (
          <Empty
            icon={NotebookPen}
            text="还没有备忘录，点击左上角新建一个吧"
            action={
              <button
                className="btn-primary mt-2"
                onClick={() => {
                  const id = addNote();
                  setActiveId(id);
                  setMobileView('editor');
                }}
              >
                <Plus size={16} />
                新建备忘录
              </button>
            }
          />
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 p-3 dark:border-slate-800">
              <button
                className="btn-ghost -ml-1 px-1 lg:hidden"
                onClick={() => setMobileView('list')}
                aria-label="返回备忘录列表"
              >
                <ChevronLeft size={18} />
              </button>
              <input
                className="min-w-0 flex-1 border-none bg-transparent text-base font-semibold outline-none placeholder:text-slate-400"
                placeholder="备忘录标题"
                aria-label="备忘录标题"
                value={active.title}
                onChange={(e) => updateNote(active.id, { title: e.target.value })}
              />
              <div className="flex items-center gap-0.5">
                <button
                  className={cn('btn-ghost px-1.5', active.pinned && 'text-amber-500')}
                  onClick={() => updateNote(active.id, { pinned: !active.pinned })}
                  title={active.pinned ? '取消置顶' : '置顶'}
                  aria-label={active.pinned ? '取消置顶备忘录' : '置顶备忘录'}
                >
                  <Pin size={16} />
                </button>
                <button
                  className="btn-ghost px-1.5"
                  title="复制 Markdown"
                  aria-label="复制 Markdown"
                  onClick={async () => {
                    const ok = await copyText(active.content);
                    toast(ok ? '已复制 Markdown' : '复制失败');
                  }}
                >
                  <Copy size={16} />
                </button>
                <button
                  className="btn-ghost px-1.5"
                  title="导出 .md 文件"
                  aria-label="导出 Markdown 文件"
                  onClick={() =>
                    downloadFile(
                      `${(active.title.trim() || '未命名备忘录').replace(/[\\/:*?"<>|]/g, '_')}.md`,
                      active.content,
                      'text/markdown;charset=utf-8',
                    )
                  }
                >
                  <Download size={16} />
                </button>
                <button
                  className="btn-danger px-1.5"
                  title="删除备忘录"
                  aria-label="删除备忘录"
                  onClick={() => {
                    const title = active.title.trim() || '无标题备忘录';
                    deletable(`已删除「${title}」`, () => removeNote(active.id));
                    setActiveId(null);
                  }}
                >
                  <Trash2 size={16} />
                </button>
              </div>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto bg-white dark:bg-slate-900">
              <MarkdownEditor
                key={active.id}
                value={active.content}
                onChange={handleChange}
                placeholder="开始记录…支持表格、任务列表、删除线、代码块等完整 GFM 语法"
              />
            </div>

            <div className="border-t border-slate-200 px-4 py-1.5 text-[11px] text-slate-400 dark:border-slate-800">
              {active.content.length} 字符 · 更新于 {formatDateTime(active.updatedAt)} · 自动保存
            </div>
          </>
        )}
      </div>
    </div>
  );
}
