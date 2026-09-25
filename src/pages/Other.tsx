import { ExternalLink, MapPinned } from 'lucide-react';

const tripMapUrl = `${import.meta.env.BASE_URL}files/广西10.1-10.6行程地图.html`;

export default function Other() {
  return (
    <section className="flex h-[calc(100dvh-5rem)] min-h-[34rem] flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900 md:h-[calc(100dvh-6.5rem)]">
      <div className="flex shrink-0 items-center gap-3 border-b border-slate-200 px-3 py-2.5 dark:border-slate-800 sm:px-4">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300">
          <MapPinned size={19} />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-sm font-semibold sm:text-base">广西 10.1–10.6 行程地图</h2>
          <p className="truncate text-xs text-slate-500 dark:text-slate-400">自驾点位、车程与逐日行程</p>
        </div>
        <a
          className="btn-outline shrink-0 px-2.5"
          href={tripMapUrl}
          target="_blank"
          rel="noreferrer"
          title="在新窗口打开"
        >
          <ExternalLink size={16} />
          <span className="hidden sm:inline">新窗口打开</span>
        </a>
      </div>

      <iframe
        className="min-h-0 w-full flex-1 border-0 bg-slate-50"
        src={tripMapUrl}
        title="广西 10.1–10.6 行程地图"
      />
    </section>
  );
}
