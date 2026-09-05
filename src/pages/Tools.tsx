import { Construction, Wrench } from 'lucide-react';

export default function Tools() {
  return (
    <div className="card flex min-h-[420px] flex-col items-center justify-center p-8 text-center">
      <span className="mb-4 rounded-2xl bg-indigo-50 p-4 text-indigo-600 dark:bg-indigo-500/15 dark:text-indigo-300">
        <Wrench size={34} />
      </span>
      <h2 className="text-xl font-semibold">小工具正在规划中</h2>
      <p className="mt-2 max-w-md text-sm leading-6 text-slate-500 dark:text-slate-400">
        原有实验性工具已移除。这个页面会保留，方便以后加入真正能融入工作流程的小工具。
      </p>
      <span className="chip mt-5 bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-300">
        <Construction size={13} /> 待开发
      </span>
    </div>
  );
}
