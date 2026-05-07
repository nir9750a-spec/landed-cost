function validRate(r) {
  // קבל כל שער סביר של ILS/USD (1–20)
  return typeof r === 'number' && r > 1 && r < 20;
}

export async function fetchUsdRate() {
  // ── ראשי: API רשמי של בנק ישראל ──────────────────────────────────────
  try {
    const res = await fetch(
      'https://boi.org.il/PublicApi/GetExchangeRates?currencyCode=USD',
      { headers: { 'Accept': 'application/json' } }
    );
    const data = await res.json();
    // המבנה: { exchangeRates: [{ key, currentExchangeRate, ... }] }
    const rate = data?.exchangeRates?.find(r => r.key === 'USD')?.currentExchangeRate;
    if (validRate(Number(rate))) return Number(rate);
  } catch {}

  // ── Fallback: open.er-api עם ILS כבסיס → הפוך לקבל ILS/USD ──────────
  try {
    const res2 = await fetch('https://open.er-api.com/v6/latest/ILS');
    if (!res2.ok) return null;
    const data2 = await res2.json();
    const usdPerIls = data2?.rates?.USD;
    if (usdPerIls && usdPerIls > 0) {
      const ilsPerUsd = 1 / usdPerIls;
      if (validRate(ilsPerUsd)) return Number(ilsPerUsd.toFixed(4));
    }
  } catch {}

  return null;
}
