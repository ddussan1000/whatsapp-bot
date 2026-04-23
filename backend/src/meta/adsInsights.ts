const GRAPH_API_VERSION = "v25.0";
const GRAPH_BASE = `https://graph.facebook.com/${GRAPH_API_VERSION}`;

export interface DailySpend {
  date: string;    // YYYY-MM-DD
  spend: number;
  currency: string;
}

interface InsightsRow {
  spend: string;
  date_start: string;
}

interface InsightsResponse {
  data: InsightsRow[];
  paging?: { cursors?: { after: string }; next?: string };
  error?: { code: number; message: string; error_subcode?: number };
}

export class MetaAdsError extends Error {
  constructor(
    message: string,
    public readonly code?: number,
    public readonly subcode?: number,
  ) {
    super(message);
    this.name = "MetaAdsError";
  }
}

async function fetchAccountCurrency(accessToken: string, normalizedId: string): Promise<string> {
  try {
    const params = new URLSearchParams({ fields: "currency", access_token: accessToken });
    const res = await fetch(`${GRAPH_BASE}/${normalizedId}?${params}`, {
      signal: AbortSignal.timeout(15_000),
    });
    const body = (await res.json()) as { currency?: string };
    return body.currency ?? "USD";
  } catch {
    return "USD";
  }
}

function throwIfMetaError(error: { code: number; message: string; error_subcode?: number }) {
  const { code, error_subcode, message } = error;
  if (code === 4 || (code === 100 && error_subcode === 1487534)) {
    throw new MetaAdsError(`Rate limit alcanzado. Intenta más tarde.`, code, error_subcode);
  }
  if (code === 100) {
    throw new MetaAdsError(
      `ID de cuenta publicitaria inválido. Verifica que sea el ID numérico de tu cuenta de anuncios (ej: 1234567890).`,
      code,
    );
  }
  if (code === 190) {
    throw new MetaAdsError(`Token inválido o expirado. Verifica el token de la instancia.`, code);
  }
  if (code === 200 || code === 273) {
    throw new MetaAdsError(
      `El token no tiene el permiso 'ads_read' para esta cuenta publicitaria.`,
      code,
    );
  }
  throw new MetaAdsError(message ?? "Error desconocido de Meta Ads API", code);
}

export async function fetchDailyAdSpend(
  accessToken: string,
  accountId: string,
  from: string,
  to: string,
): Promise<DailySpend[]> {
  const normalizedId = accountId.startsWith("act_") ? accountId : `act_${accountId}`;

  const currency = await fetchAccountCurrency(accessToken, normalizedId);

  const params = new URLSearchParams({
    fields: "spend",
    level: "account",
    time_increment: "1",
    time_range: JSON.stringify({ since: from, until: to }),
    access_token: accessToken,
    limit: "500",
  });

  let url: string | null = `${GRAPH_BASE}/${normalizedId}/insights?${params}`;
  const rows: InsightsRow[] = [];

  while (url) {
    const res = await fetch(url, { signal: AbortSignal.timeout(30_000) });
    const body = (await res.json()) as InsightsResponse;

    if (body.error) throwIfMetaError(body.error);
    if (!res.ok) throw new MetaAdsError(`Meta Ads API respondió con HTTP ${res.status}`);

    rows.push(...(body.data ?? []));
    url = body.paging?.next ?? null;
  }

  return rows.map((row) => ({
    date: row.date_start,
    spend: parseFloat(row.spend ?? "0"),
    currency,
  }));
}
