import { useEffect, useMemo, useState } from 'react';
import { ExternalLink, FileCode2, FolderOpen } from 'lucide-react';

interface HtmlFile {
  path: string;
  title: string;
}

const filesBaseUrl = `${import.meta.env.BASE_URL}files/`;

function fileUrl(filePath: string) {
  return `${filesBaseUrl}${filePath.split('/').map(encodeURIComponent).join('/')}`;
}

export default function Other() {
  const [files, setFiles] = useState<HtmlFile[]>([]);
  const [selectedPath, setSelectedPath] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    fetch(`${filesBaseUrl}index.json`, { cache: 'no-store' })
      .then((response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return response.json() as Promise<HtmlFile[]>;
      })
      .then((items) => {
        if (cancelled) return;
        const validItems = items.filter((item) => item.path && item.title);
        setFiles(validItems);
        setSelectedPath((current) => current || validItems[0]?.path || '');
      })
      .catch(() => {
        if (!cancelled) setError('无法读取网页目录，请重新构建项目。');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, []);

  const selectedFile = useMemo(
    () => files.find((file) => file.path === selectedPath) ?? files[0],
    [files, selectedPath],
  );
  const selectedUrl = selectedFile ? fileUrl(selectedFile.path) : '';

  return (
    <section className="flex h-[calc(100dvh-5rem)] min-h-[34rem] flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900 md:h-[calc(100dvh-6.5rem)]">
      <div className="flex shrink-0 items-center gap-3 border-b border-slate-200 px-3 py-2.5 dark:border-slate-800 sm:px-4">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300">
          <FolderOpen size={19} />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-sm font-semibold sm:text-base">{selectedFile?.title ?? '其他网页'}</h2>
          <p className="truncate text-xs text-slate-500 dark:text-slate-400">
            {selectedFile?.path ?? '将 HTML 文件放入 public/files'}
          </p>
        </div>
        {files.length > 1 && (
          <select
            className="input w-auto max-w-44 py-1.5 sm:max-w-64"
            aria-label="选择网页"
            value={selectedFile?.path ?? ''}
            onChange={(event) => setSelectedPath(event.target.value)}
          >
            {files.map((file) => <option key={file.path} value={file.path}>{file.title}</option>)}
          </select>
        )}
        {selectedUrl && (
          <a
            className="btn-outline shrink-0 px-2.5"
            href={selectedUrl}
            target="_blank"
            rel="noreferrer"
            title="在新窗口打开"
          >
            <ExternalLink size={16} />
            <span className="hidden sm:inline">新窗口打开</span>
          </a>
        )}
      </div>

      {selectedFile ? (
        <iframe
          key={selectedFile.path}
          className="min-h-0 w-full flex-1 border-0 bg-slate-50"
          src={selectedUrl}
          title={selectedFile.title}
        />
      ) : (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 text-center text-slate-500 dark:text-slate-400">
          <FileCode2 size={36} strokeWidth={1.5} />
          <p className="text-sm">{loading ? '正在读取网页…' : error || '还没有可展示的 HTML 文件。'}</p>
        </div>
      )}
    </section>
  );
}
