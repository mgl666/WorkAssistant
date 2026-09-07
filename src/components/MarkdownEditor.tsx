import { useEffect, useRef } from 'react';
import type { Crepe } from '@milkdown/crepe';

interface MarkdownEditorProps {
  /** 仅作为初始值使用；切换内容请通过改变 key 强制重挂载 */
  value: string;
  onChange: (markdown: string) => void;
  placeholder?: string;
}

/**
 * Markdown 原生 WYSIWYG 编辑器（Milkdown Crepe，底层是 remark AST）。
 *
 * 之前的实现是 contentEditable + Turndown 做 HTML↔Markdown 字符串互转，
 * 表格、任务列表这类 GFM 结构在往返中必然损坏。
 * Crepe 的内部状态本身就是 Markdown 文档树，序列化时直接输出 Markdown，
 * 从结构上消除了往返转换的损耗。
 *
 * SDK 体积较大（约 200 KB），用动态 import 拆成独立分包，只在进入笔记页时加载。
 * Crepe 没有提供「替换全部内容」的 API，切换笔记由父组件用 key 重挂载实现。
 */
export default function MarkdownEditor({ value, onChange, placeholder }: MarkdownEditorProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  useEffect(() => {
    let crepe: Crepe | null = null;
    let disposed = false;
    /** create 完成前的 markdownUpdated 是载入时的格式归一化，不是用户输入 */
    let ready = false;

    void (async () => {
      const [{ Crepe: CrepeClass }] = await Promise.all([
        import('@milkdown/crepe'),
        import('@milkdown/crepe/theme/common/style.css'),
        import('@milkdown/crepe/theme/frame.css'),
        // 暗色变量跟随应用的手动主题切换（见文件头部说明）
        import('@/styles/milkdown-theme.css'),
      ]);
      if (disposed || !hostRef.current) return;

      crepe = new CrepeClass({
        root: hostRef.current,
        defaultValue: value,
        // LaTeX 依赖 KaTeX，工作笔记用不上，关掉以减小分包体积
        features: { [CrepeClass.Feature.Latex]: false },
        featureConfigs: {
          [CrepeClass.Feature.Placeholder]: { text: placeholder ?? '开始记录…' },
        },
      });

      crepe.on((listener) => {
        listener.markdownUpdated((_ctx, markdown) => {
          if (ready) onChangeRef.current(markdown);
        });
      });

      await crepe.create();
      ready = true;
    })();

    return () => {
      disposed = true;
      try {
        crepe?.destroy();
      } catch {
        /* 组件卸载与编辑器销毁的时序竞争，忽略即可 */
      }
    };
    // value 只在挂载时读取，后续更新走 onChange，避免外部写入打断输入
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return <div ref={hostRef} className="w-full px-1 py-2 sm:px-2" />;
}
