export function cn(...classes: Array<string | false | null | undefined>): string {
  return classes.filter(Boolean).join(' ');
}

export function uid(): string {
  return Math.random().toString(36).slice(2, 8) + Date.now().toString(36).slice(-4);
}

/** 去掉 Markdown 标记，用于列表摘要 */
export function plainText(md: string): string {
  return (md ?? '')
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`[^`]*`/g, ' ')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/[*_~>]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/* ------------------------------ 提示音 / 通知 ------------------------------ */

let timerAudio: AudioContext | null = null;
let alarmNodes: OscillatorNode[] = [];
let alarmLoopTimer: number | null = null;
let alarmRequest = 0;

function getTimerAudio(): AudioContext | null {
  try {
    const Ctor =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return null;
    if (!timerAudio || timerAudio.state === 'closed') timerAudio = new Ctor();
    return timerAudio;
  } catch {
    return null;
  }
}

/** 在用户点击开始时解锁音频，避免倒计时结束后被移动端浏览器拦截。 */
export function prepareTimerSound(): void {
  const ctx = getTimerAudio();
  if (ctx?.state === 'suspended') void ctx.resume().catch(() => {});
}

export function stopTimerAlarm(): void {
  alarmRequest += 1;
  if (alarmLoopTimer !== null) window.clearInterval(alarmLoopTimer);
  alarmLoopTimer = null;
  for (const node of alarmNodes) {
    try { node.stop(); } catch { /* 已停止 */ }
  }
  alarmNodes = [];
}

function scheduleTimerChime(ctx: AudioContext): void {
  const start = ctx.currentTime + 0.04;
  const notes = [523.25, 659.25, 783.99];
  notes.forEach((frequency, index) => {
    const at = start + index * 0.18;
    const oscillator = ctx.createOscillator();
    const gain = ctx.createGain();
    oscillator.type = 'sine';
    oscillator.frequency.setValueAtTime(frequency, at);
    gain.gain.setValueAtTime(0.0001, at);
    gain.gain.exponentialRampToValueAtTime(0.14, at + 0.035);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.62);
    oscillator.connect(gain);
    gain.connect(ctx.destination);
    oscillator.onended = () => { alarmNodes = alarmNodes.filter((node) => node !== oscillator); };
    oscillator.start(at);
    oscillator.stop(at + 0.65);
    alarmNodes.push(oscillator);
  });
}

/** 柔和的三音提示会持续循环，直到用户停止铃声或开始下一段。 */
export function playTimerAlarm(): boolean {
  try {
    const ctx = getTimerAudio();
    if (!ctx) return false;
    stopTimerAlarm();
    const request = alarmRequest;
    const begin = () => {
      // 页面离开或用户已经停止时，不再启动迟到的音频 Promise。
      if (request !== alarmRequest) return;
      scheduleTimerChime(ctx);
      alarmLoopTimer = window.setInterval(() => scheduleTimerChime(ctx), 1500);
    };
    if (ctx.state === 'running') begin();
    else void ctx.resume().then(begin).catch(() => {});
    return true;
  } catch {
    stopTimerAlarm();
    return false;
  }
}

export function notify(title: string, body?: string): void {
  try {
    if (typeof Notification === 'undefined') return;
    if (Notification.permission === 'granted') {
      new Notification(title, { body });
    }
  } catch {
    /* 忽略通知失败 */
  }
}

export function requestNotifyPermission(): void {
  try {
    if (typeof Notification === 'undefined') return;
    if (Notification.permission === 'default') void Notification.requestPermission();
  } catch {
    /* 忽略 */
  }
}

/* ------------------------------ 文件 / 剪贴板 ------------------------------ */

export function downloadFile(filename: string, content: string, mime = 'text/plain;charset=utf-8'): void {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}
