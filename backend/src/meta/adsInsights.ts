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
  account_currency?: string;
}

interface InsightsResponse {
  data: InsightsRow[];
  paging?: { cursors: { after: string }; next?: string };
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

export async function fetchDailyAdSpend(
  accessToken: string,
  accountId: string,
  from: string,
  to: string,
): Promise<DailySpend[]> {
  const params = new URLSearchParams({
    fields: "spend,account_currency",
    time_increment: "1",
    time_range: JSON.stringify({ since: from, until: to }),
    access_token: accessToken,
    limit: "500",
  });

  const url = `${GRAPH_BASE}/${accountId}/insights?${params}`;
  const res = await fetch(url, { signal: AbortSignal.timeout(15_000) });
  const body = (await res.json()) as InsightsResponse;

  if (body.error) {
    const { code, error_subcode, message } = body.error;
    if (code === 4 || (code === 100 && error_subcode === 1487534)) {
      throw new MetaAdsError(`Rate limit alcanzado. Intenta más tarde.`, code, error_subcode);
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

  if (!res.ok) {
    throw new MetaAdsError(`Meta Ads API respondió con HTTP ${res.status}`);
  }

  return (body.data ?? []).map((row) => ({
    date: row.date_start,
    spend: parseFloat(row.spend ?? "0"),
    currency: row.account_currency ?? "USD",
  }));
}
