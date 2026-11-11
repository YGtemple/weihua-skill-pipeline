// 语言模型通道：OpenAI 兼容 /chat/completions 或 Anthropic /v1/messages
// 未配置密钥时由 pipeline 的模板引擎接管，页面与内置工程照常可看
export function llmReady(cfg) {
  return cfg.llm.mode === 'openai' && Boolean(cfg.llm.base_url && cfg.llm.api_key && cfg.llm.model);
}

const providerOf = (cfg) => (cfg.llm.provider === 'anthropic' ? 'anthropic' : 'openai');

async function callOpenAI(cfg, {system, user, maxTokens, temperature}) {
  const base = cfg.llm.base_url.replace(/\/$/, '');
  const res = await fetch(`${base}/chat/completions`, {
    method: 'POST',
    headers: {Authorization: `Bearer ${cfg.llm.api_key}`, 'Content-Type': 'application/json'},
    body: JSON.stringify({
      model: cfg.llm.model,
      messages: [
        {role: 'system', content: system},
        {role: 'user', content: user},
      ],
      temperature,
      max_tokens: maxTokens,
      response_format: {type: 'json_object'},
    }),
  });
  const raw = await res.text();
  if (!res.ok) throw new Error(`文本模型请求失败（${res.status}）：${raw.slice(0, 300)}`);
  const data = JSON.parse(raw);
  return data.choices?.[0]?.message?.content ?? '';
}

async function callAnthropic(cfg, {system, user, maxTokens, temperature}) {
  const base = cfg.llm.base_url.replace(/\/$/, '');
  const endpoint = /\/v\d+$/.test(base) ? `${base}/messages` : `${base}/v1/messages`;
  const res = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'x-api-key': cfg.llm.api_key,
      'anthropic-version': '2023-06-01',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: cfg.llm.model,
      max_tokens: maxTokens,
      temperature,
      system,
      messages: [{role: 'user', content: user}],
    }),
  });
  const raw = await res.text();
  if (!res.ok) throw new Error(`文本模型请求失败（${res.status}）：${raw.slice(0, 300)}`);
  const data = JSON.parse(raw);
  const blocks = data.content ?? [];
  return blocks.filter((b) => b.type === 'text').map((b) => b.text).join('\n');
}

export async function chatJson(cfg, {system, user, maxTokens = 3000, temperature = 0.7}) {
  if (!llmReady(cfg)) throw new Error('文本模型未配置，当前应使用模板引擎');
  const content = providerOf(cfg) === 'anthropic'
    ? await callAnthropic(cfg, {system, user, maxTokens, temperature})
    : await callOpenAI(cfg, {system, user, maxTokens, temperature});
  return extractJson(content);
}

// 兼容模型在 JSON 外包裹说明文字或 markdown 代码块的情况
export function extractJson(content) {
  const cleaned = String(content ?? '').replace(/```(?:json)?/g, '').trim();
  const start = cleaned.search(/[{[]/);
  if (start < 0) throw new Error(`模型未返回 JSON：${cleaned.slice(0, 200)}`);
  const open = cleaned[start];
  const close = open === '{' ? '}' : ']';
  let depth = 0;
  for (let i = start; i < cleaned.length; i += 1) {
    if (cleaned[i] === open) depth += 1;
    if (cleaned[i] === close) depth -= 1;
    if (depth === 0) return JSON.parse(cleaned.slice(start, i + 1));
  }
  throw new Error('模型返回的 JSON 不完整');
}

export async function checkLlm(cfg) {
  const data = await chatJson(cfg, {system: '只输出 JSON', user: '输出 {"ok":true}', maxTokens: 60, temperature: 0});
  return Boolean(data.ok);
}
