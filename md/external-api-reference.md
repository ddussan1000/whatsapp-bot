# API Externa — Referencia

Permite que sistemas externos (chatbots, automatizaciones, etc.) escriban datos de ventas directamente en Google Sheets usando la infraestructura de la plataforma.

**Base URL:** `https://tu-dominio.com/api/external/v1`  
**Autenticación:** Bearer token en el header `Authorization`  
**Formato:** JSON (`Content-Type: application/json`)

---

## Autenticación

Todas las rutas requieren un API Key generado desde **Configuración → Integración externa**.

```
Authorization: Bearer <api_key>
```

- La key se genera una sola vez y no se puede recuperar después de cerrar el modal.
- Si se regenera, la key anterior queda inválida inmediatamente.
- Disponible solo en **planes de pago** (no trial).

---

## Endpoints

### `GET /accounts`

Lista las cuentas activas del usuario disponibles para recibir entradas.

**Request**

```bash
curl https://tu-dominio.com/api/external/v1/accounts \
  -H "Authorization: Bearer <api_key>"
```

**Response 200**

```json
[
  {
    "account_name": "DSS Bot",
    "has_sheet": true
  },
  {
    "account_name": "TIENDA COLOMBIA",
    "has_sheet": false
  }
]
```

| Campo | Tipo | Descripción |
|-------|------|-------------|
| `account_name` | string | Nombre exacto a usar en `sheet-entry` |
| `has_sheet` | boolean | Si `false`, la cuenta no tiene hoja de Sheets configurada y `sheet-entry` devolverá 422 |

---

### `POST /sheet-entry`

Escribe facturación y gasto publicitario en Google Sheets para una cuenta y fecha.

**Request body**

```json
{
  "account_name": "DSS Bot",
  "date": "2026-04-23",
  "amount": 250000,
  "currency": "COP",
  "meta_spend": 45000,
  "meta_currency": "COP",
  "detail": [
    { "label": "Plan Mensual", "amount": 150000 },
    { "label": "Plan Anual",   "amount": 100000 }
  ]
}
```

| Campo | Tipo | Requerido | Descripción |
|-------|------|-----------|-------------|
| `account_name` | string | ✅ | Nombre exacto de la cuenta (obtenido de `GET /accounts`) |
| `date` | string `YYYY-MM-DD` | ✅ | Fecha de la entrada. Debe existir en la columna de fechas del sheet |
| `amount` | number ≥ 0 | ✅ | Total de facturación en la moneda indicada |
| `currency` | string | ✅ | Código ISO de 3 letras: `COP`, `USD`, `ARS`, etc. |
| `meta_spend` | number ≥ 0 | ❌ | Gasto publicitario (Meta Ads u otra plataforma) |
| `meta_currency` | string | ❌ | Moneda del gasto. Si se omite, usa la misma que `currency` |
| `detail` | array | ❌ | Desglose por producto o concepto (ver abajo) |

**Objeto `detail`**

| Campo | Tipo | Requerido | Descripción |
|-------|------|-----------|-------------|
| `label` | string | ❌ | Nombre del producto o concepto. Default: `"—"` |
| `amount` | number ≥ 0 | ✅ | Monto de ese concepto |

Si `detail` se omite o es un array vacío, se escribe `amount` como una sola línea con etiqueta `—`.

**Response 200 — éxito**

```json
{ "ok": true, "warnings": [] }
```

**Response 200 — éxito con advertencias**

```json
{
  "ok": true,
  "warnings": [
    "No se encontró la fecha 2026-04-23 en la columna C de la hoja 'DSS Bot'."
  ]
}
```

> ⚠️ Un `ok: true` con warnings significa que la solicitud fue válida pero **no se escribió nada** en Sheets. El caso más común es que la fecha no exista en la hoja. El chatbot debe revisar el array `warnings` y notificar al usuario.

---

## Errores

Todos los errores devuelven un objeto `{ "error": "..." }` con el código HTTP correspondiente.

| HTTP | `error` | Causa |
|------|---------|-------|
| `400` | array de objetos `{loc, msg, type}` | Payload inválido — campo faltante, tipo incorrecto, o valor negativo |
| `401` | `"Authorization header requerido"` | No se envió el header `Authorization` |
| `401` | `"API key inválida"` | La key no existe o fue revocada |
| `403` | `"Tu plan no incluye acceso a la API externa"` | El usuario está en trial o plan sin acceso |
| `404` | `"Cuenta 'X' no encontrada"` | `account_name` no existe o la cuenta está inactiva |
| `422` | `"El usuario no tiene Spreadsheet configurado"` | Falta `google_spreadsheet_id` en la configuración del usuario |
| `422` | `"La cuenta no tiene hoja de Sheets configurada"` | La cuenta existe pero `has_sheet` es `false` |

**Ejemplo de error 400** (amount negativo):

```json
{
  "error": [
    {
      "type": "value_error",
      "loc": ["amount"],
      "msg": "Value error, amount no puede ser negativo",
      "input": -100,
      "url": "https://errors.pydantic.dev/..."
    }
  ]
}
```

---

## Comportamiento de escritura en Sheets

La plataforma busca la fila cuya columna de fechas (C) coincide con `date` y escribe:

- **Columna de facturación** → suma de todos los `amount` del `detail` (o `amount` si no hay detail)
- **Columna de detalle de anuncios** → texto agrupado: `Plan Mensual: 1 ventas / $150,000 | Plan Anual: 1 ventas / $100,000`
- **Columna de gasto** → `meta_spend` si fue enviado (en la columna correspondiente según la plantilla local o internacional)

Si la fecha no existe en la hoja, **no se escribe nada** y se devuelve un warning.

---

## Ejemplo completo en Python

```python
import httpx

BASE_URL = "https://tu-dominio.com"
API_KEY  = "tu_api_key"

def get_accounts() -> list[dict]:
    r = httpx.get(
        f"{BASE_URL}/api/external/v1/accounts",
        headers={"Authorization": f"Bearer {API_KEY}"},
        timeout=10,
    )
    r.raise_for_status()
    return r.json()


def registrar_venta(
    account_name: str,
    date: str,
    amount: float,
    currency: str,
    detail: list[dict] | None = None,
    meta_spend: float | None = None,
    meta_currency: str | None = None,
) -> dict:
    payload = {
        "account_name": account_name,
        "date": date,
        "amount": amount,
        "currency": currency,
    }
    if detail:
        payload["detail"] = detail
    if meta_spend is not None:
        payload["meta_spend"] = meta_spend
        payload["meta_currency"] = meta_currency or currency

    r = httpx.post(
        f"{BASE_URL}/api/external/v1/sheet-entry",
        headers={"Authorization": f"Bearer {API_KEY}"},
        json=payload,
        timeout=15,
    )
    r.raise_for_status()
    result = r.json()

    if result.get("warnings"):
        print(f"[ADVERTENCIA] {result['warnings']}")

    return result


# Uso
cuentas = get_accounts()
# [{"account_name": "DSS Bot", "has_sheet": True}]

resultado = registrar_venta(
    account_name="DSS Bot",
    date="2026-04-23",
    amount=250000,
    currency="COP",
    meta_spend=45000,
    meta_currency="COP",
    detail=[
        {"label": "Plan Mensual", "amount": 150000},
        {"label": "Plan Anual",   "amount": 100000},
    ],
)
# {"ok": True, "warnings": []}
```

---

## Cuentas locales vs. internacionales

El chatbot **no necesita distinguir** entre plantillas locales e internacionales — la plataforma lo resuelve automáticamente usando la configuración de la cuenta.

Cuando se creó la pestaña en Google Sheets se guardó qué columnas corresponden a cada dato. La API lee esa configuración y escribe en la columna correcta sin que el chatbot lo sepa.

**Facturación (`amount`)**

| Plantilla | Columna donde escribe |
|-----------|-----------------------|
| Local | E (col 5) |
| Internacional | G (col 7) — moneda nativa de la cuenta |

**Gasto publicitario (`meta_spend`)**

La plataforma compara `meta_currency` con la moneda local del usuario y la moneda de la cuenta para decidir cómo escribir:

| Caso | Comportamiento |
|------|----------------|
| `meta_currency` == moneda local | Escribe el valor directo en la columna de gasto local |
| `meta_currency` == moneda nativa de la cuenta (internacional) | Escribe en columna de gasto nativo, la columna local queda como fórmula derivada |
| `meta_currency` distinta a ambas | Inserta fórmula `GOOGLEFINANCE` para conversión automática en el sheet |

En todos los casos el chatbot solo envía el número y la moneda — la lógica de columnas y conversión la resuelve la plataforma.

---

## Notas

- `account_name` es **case-sensitive** — debe coincidir exactamente con el nombre en la plataforma.
- Se recomienda llamar `GET /accounts` al iniciar el chatbot para obtener los nombres válidos, en lugar de hardcodearlos.
- Cada llamada queda registrada en el log de auditoría de la plataforma con IP y datos enviados.
- El timeout recomendado es **15 segundos** — la escritura en Sheets puede tardar si el spreadsheet es grande.
