import { supabase } from './supabase';

// Wrapper around supabase.functions.invoke('anthropic-proxy') that extracts
// the actual error body when the function returns 4xx/5xx. Supabase-js v2
// returns a generic "Edge Function returned a non-2xx status code" message
// by default, hiding the real reason — we peel it back here so toasts show
// what actually went wrong (overloaded, model not allowed, bad JSON, etc).
export async function invokeAnthropic(body) {
  const { data, error } = await supabase.functions.invoke('anthropic-proxy', { body });

  if (error) {
    let detail = error.message || 'שגיאת AI';
    try {
      const ctx = error.context;
      if (ctx && typeof ctx.json === 'function') {
        const errBody = await ctx.json();
        if (errBody?.error) {
          detail = typeof errBody.error === 'string' ? errBody.error : (errBody.error.message || JSON.stringify(errBody.error));
        }
      }
    } catch {
      // ignore — keep generic message
    }
    throw new Error(detail);
  }

  // Anthropic itself may have returned an error inside data
  if (data?.error) {
    const msg = data.error?.message || data.error;
    throw new Error(typeof msg === 'string' ? msg : 'שגיאת AI');
  }

  return data;
}
