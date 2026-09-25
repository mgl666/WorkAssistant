import { useEffect, useState } from 'react';
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
      })
      .catch(() => {
        if (!cancelled) setError('无法读取网页目录，请重新构建项目。');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, []);

  return (
    <section className="space-y-4">
      <div className="flex items-center gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300">
          <FolderOpen size={19} />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="text-base font-semibold">网页链接</h2>
          <p className="text-sm text-slate-500 dark:text-slate-400">点击后在新窗口打开</p>
        </div>
      </div>

      {files.length > 0 ? (
        <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {files.map((file) => (
            <li key={file.path}>
              <a
                className="card flex min-h-24 items-center gap-3 p-4 transition hover:border-indigo-300 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 dark:hover:border-indigo-700"
                href={fileUrl(file.path)}
                target="_blank"
                rel="noreferrer"
              >
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-indigo-50 text-indigo-600 dark:bg-indigo-500/15 dark:text-indigo-300">
                  <FileCode2 size={20} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block font-medium text-slate-800 dark:text-slate-100">{file.title}</span>
                  <span className="mt-1 block truncate text-xs text-slate-500 dark:text-slate-400">{file.path}</span>
                </span>
                <ExternalLink className="shrink-0 text-slate-400" size={17} />
              </a>
            </li>
          ))}
        </ul>
      ) : (
        <div className="card flex min-h-52 flex-col items-center justify-center gap-3 px-6 text-center text-slate-500 dark:text-slate-400">
          <FileCode2 size={36} strokeWidth={1.5} />
          <p className="text-sm">{loading ? '正在读取网页链接…' : error || '还没有可用的网页链接。'}</p>
        </div>
      )}
    </section>
  );
}
