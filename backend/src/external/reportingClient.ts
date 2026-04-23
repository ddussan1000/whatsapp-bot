export interface ExternalAccount {
  account_name: string;
  has_sheet: boolean;
}

export interface DetailItem {
  label?: string;
  amount: number;
}

export interface SheetEntryPayload {
  account_name: string;
  date: string;
  amount: number;
  currency: string;
  meta_spend?: number;
  meta_currency?: string;
  detail?: DetailItem[];
}

export interface SheetEntryResult {
  ok: boolean;
  warnings: string[];
}

export class ExternalReportingError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = "ExternalReportingError";
  }
}

async function callApi<T>(
  baseUrl: string,
  apiKey: string,
  method: "GET" | "POST",
  path: string,
  body?: unknown,
): Promise<T> {
  const url = `${baseUrl.replace(/\/$/, "")}${path}`;
  const res = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(20_000),
  });

  const data = (await res.json()) as { error?: string | Array<{ msg: string }> };

  if (!res.ok) {
    const msg =
      typeof data?.error === "string"
        ? data.error
        : Array.isArray(data?.error)
          ? data.error.map((e) => e.msg).join("; ")
          : `HTTP ${res.status}`;
    throw new ExternalReportingError(msg, res.status);
  }

  return data as T;
}

export async function getExternalAccounts(
  baseUrl: string,
  apiKey: string,
): Promise<ExternalAccount[]> {
  return callApi<ExternalAccount[]>(baseUrl, apiKey, "GET", "/api/external/v1/accounts");
}

export async function sendSheetEntry(
  baseUrl: string,
  apiKey: string,
  payload: SheetEntryPayload,
): Promise<SheetEntryResult> {
  return callApi<SheetEntryResult>(baseUrl, apiKey, "POST", "/api/external/v1/sheet-entry", payload);
}
