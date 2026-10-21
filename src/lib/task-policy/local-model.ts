export function localModelConfig(env: Record<string, string | undefined> = process.env): {url: string; model: string} {
  try {
    if (!env.AGENTOS_LOCAL_MODEL_URL || !env.AGENTOS_LOCAL_MODEL?.trim()) throw new Error();
    const url = new URL(env.AGENTOS_LOCAL_MODEL_URL);
    if (!['http:', 'https:'].includes(url.protocol) || !['127.0.0.1', '[::1]'].includes(url.hostname) || url.username || url.password || url.search || url.hash || url.pathname !== '/') throw new Error();
    return {url: url.origin, model: env.AGENTOS_LOCAL_MODEL.trim()};
  } catch { throw new Error('LOCAL_MODEL_NOT_CONFIGURED'); }
}
