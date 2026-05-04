# Plan de Suscripciones — DSS Bot

## Decisión

**MercadoPago** como pasarela principal de pagos y suscripciones.
- Razón: Stripe requiere entidad en USA. MercadoPago acepta cuenta colombiana (cédula/RUT), soporta PSE, Nequi, tarjetas, y tiene API de suscripciones nativa.
- Hotmart como opción futura si se necesita soporte multi-país LATAM o clientes que prefieran ese método.

---

## Métodos de pago aceptados (MercadoPago Colombia)

- PSE
- Nequi
- Bancolombia
- Tarjetas crédito/débito
- Efecty
- Comisión: ~3.49% + IVA por transacción

---

## Arquitectura

### Tabla en Supabase

```sql
-- Agregar columnas a organizations
ALTER TABLE organizations ADD COLUMN subscription_status text DEFAULT 'trialing'
  CHECK (subscription_status IN ('trialing', 'active', 'past_due', 'canceled', 'paused'));
ALTER TABLE organizations ADD COLUMN subscription_plan text DEFAULT 'starter'
  CHECK (subscription_plan IN ('starter', 'pro', 'enterprise'));
ALTER TABLE organizations ADD COLUMN mp_preapproval_id text;       -- ID de suscripción en MP
ALTER TABLE organizations ADD COLUMN mp_customer_id text;          -- ID del pagador en MP
ALTER TABLE organizations ADD COLUMN current_period_end timestamptz;
ALTER TABLE organizations ADD COLUMN trial_ends_at timestamptz;
```

### Flujo completo

```
Cliente elige plan en dashboard
       ↓
Backend crea Preaprobación en MP API
       ↓
Redirige a MP Checkout (cliente autoriza débito automático)
       ↓
MP cobra automáticamente cada mes
       ↓
Webhook → POST /webhooks/mercadopago (backend Hono)
       ↓
Actualiza organizations.subscription_status en Supabase
       ↓
Middleware verifica estado en cada request → acceso permitido/bloqueado
```

---

## Eventos de Webhook a manejar

| Evento MercadoPago | Acción en sistema |
|--------------------|-------------------|
| `preapproval` → status `authorized` | `subscription_status = active`, actualizar `current_period_end` |
| `payment` → status `approved` | Extender `current_period_end` +1 mes |
| `payment` → status `rejected` | `subscription_status = past_due`, enviar alerta al dueño de la org |
| `preapproval` → status `cancelled` | `subscription_status = canceled` |
| `preapproval` → status `paused` | `subscription_status = paused` |

---

## Archivos a crear/modificar

### Backend

```
backend/src/
├── payments/
│   └── mercadopago.ts        # Cliente MP + funciones: createPreapproval, getPreapproval
├── webhooks/
│   └── mercadopago.ts        # Handler del webhook (verificar firma, procesar evento)
└── api/
    └── billing.ts            # Rutas: GET /billing/plans, POST /billing/subscribe, GET /billing/status
```

### Frontend (Dashboard)

```
dashboard/src/
└── pages/
    └── BillingPage.tsx       # Plan actual, botón upgrade, historial de pagos, cancelar
```

### Rutas backend a agregar

| Método | Ruta | Descripción |
|--------|------|-------------|
| GET | `/billing/plans` | Lista de planes disponibles y precios |
| POST | `/billing/subscribe` | Crea preaprobación y retorna URL de checkout |
| GET | `/billing/status` | Estado actual de la suscripción de la org |
| POST | `/billing/cancel` | Cancela la suscripción activa |
| POST | `/webhooks/mercadopago` | Recibe eventos de MP (sin auth, verificar firma) |

---

## Planes sugeridos

| Plan | Precio/mes | Límites sugeridos |
|------|-----------|-------------------|
| Starter | $XX.000 COP | 1 instancia WhatsApp, 500 conversaciones/mes |
| Pro | $XX.000 COP | 3 instancias, conversaciones ilimitadas, reportes |
| Enterprise | $XX.000 COP | Instancias ilimitadas, soporte prioritario |

> Definir precios según modelo de negocio.

---

## Middleware de acceso

```ts
// En cada ruta del dashboard verificar:
const org = await getOrg(orgId);
if (!['active', 'trialing'].includes(org.subscription_status)) {
  return c.json({ error: 'subscription_required' }, 402);
}
```

---

## Referencias

- API Preaprobaciones MP: https://www.mercadopago.com.co/developers/es/reference/subscriptions/_preapproval/post
- Webhooks MP: https://www.mercadopago.com.co/developers/es/docs/your-integrations/notifications/webhooks
- SDK Node MP: `npm install mercadopago`

---

## Notas

- Abrir cuenta MercadoPago como empresa o persona natural con RUT/cédula colombiana.
- Guardar `mp_preapproval_id` en la org para poder cancelar/pausar desde el backend.
- El webhook de MP no tiene firma HMAC estándar — validar por IP o secret en query param.
- Considerar agregar Hotmart como método alternativo si hay demanda de clientes en otros países LATAM.
