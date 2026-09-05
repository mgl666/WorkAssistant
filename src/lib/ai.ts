import type { Settings } from '@/store/useStore';

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

function endpointUrl(endpoint: string): string {
  const base = endpoint.trim().replace(/\/$/, '');
  return base.endsWith('/chat/completions') ? base : `${base}/chat/completions`;
}

/**
 * 把常见失败翻译成用户能自行排查的提示，
 * 明确区分网络、鉴权（Key 无效）、模型/地址、额度四类问题。
 */
export function describeAiFailure(status: number, detail: string): string {
  if (status === 401 || status === 403) return 'API Key 无效或没有权限：请确认 Key 正确、且账号有该模型的访问权限。';
  if (status === 404) return '接口地址或模型不存在：请确认 API 地址以 /v1 结尾、模型名称拼写正确。';
  if (status === 429) return '额度不足或请求过于频繁：请检查账户余额、套餐额度与限流设置。';
  if (status >= 500) return `AI 服务端异常（${status}），请稍后重试。`;
  return detail || `请求失败（${status}）`;
}

/** 调用 OpenAI 兼容的 chat/completions 接口，返回模型回复文本 */
export async function chatCompletion(
  settings: Settings,
  messages: ChatMessage[],
  signal?: AbortSignal,
): Promise<string> {
  const apiKey = settings.aiApiKey.trim();
  if (!apiKey) throw new Error('请先在设置中填写 API Key。');
  if (!settings.aiEndpoint.trim()) throw new Error('请先在设置中填写 API 地址。');
  if (!settings.aiModel.trim()) throw new Error('请先在设置中填写模型名称。');

  let response: Response;
  try {
    response = await fetch(endpointUrl(settings.aiEndpoint), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({ model: settings.aiModel.trim(), messages }),
      signal,
    });
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') throw err;
    throw new Error(
      '无法连接到 API 地址：请检查网络、地址拼写，以及该服务是否允许浏览器跨域访问（CORS）。',
    );
  }

  const raw = await response.text();
  let json: { choices?: Array<{ message?: { content?: string } }>; error?: { message?: string } } = {};
  try {
    json = raw ? (JSON.parse(raw) as typeof json) : {};
  } catch {
    /* 非 JSON 响应，交给下面的状态码分支处理 */
  }

  if (!response.ok) {
    throw new Error(describeAiFailure(response.status, json.error?.message ?? raw.slice(0, 200)));
  }

  const content = json.choices?.[0]?.message?.content?.trim();
  if (!content) throw new Error('AI 返回了空内容，请更换模型或稍后重试。');
  return content;
}
