# Análisis de Costos — dssbot.site

> Fecha: Abril 2026 | Stack: Bun + Hono · React/Vite · Supabase · Railway · Vercel · Upstash · Gemini · Resend

---

## Estado Actual — Fase Beta

| Servicio | Uso actual | Plan | Costo/mes |
|----------|-----------|------|-----------|
| **Railway** (backend API + bot) | 1 servicio Bun, ~150MB RAM idle | Hobby | ~$5–10 |
| **Vercel** (dashboard SPA) | SPA estático, sin SSR | Hobby (Free) | $0 |
| **Supabase** (DB + Auth + Storage) | PostgreSQL + Google OAuth + buckets `receipts`/`flow-media` | Free | $0 |
| **Upstash Redis** (estado de conversaciones) | ~100–500 comandos/día en beta | Pay as You Go | ~$0–1 |
| **Gemini API** (OCR comprobantes) | `gemini-2.0-flash-lite`, pocas imágenes/día | Free tier | $0 |
| **Resend** (emails de invitación) | <100 emails/mes | Free (3,000/mes) | $0 |
| **Meta WhatsApp Business API** | Mensajes entrantes gratis; salientes de negocio: $0.005–0.009/msg | Por uso | ~$0–5 |
| **Dominio** (`dssbot.site`) | DNS + SSL | Namecheap/similar | ~$1–2 |

### **Total estimado beta: $6–18/mes**

---

## Límites del Free Tier que debes monitorear

| Servicio | Límite Free | Riesgo |
|----------|------------|--------|
| Supabase DB | 500 MB PostgreSQL | Bajo por ahora |
| Supabase Storage | 1 GB total | **Medio** — los videos de flujos pueden acumularse |
| Supabase Bandwidth | 2 GB/mes | **Medio** — si sirves media directamente desde el dashboard |
| Supabase Auth | 50,000 MAU | Bajo |
| Gemini Free | 15 RPM / 1M tokens/día | Bajo — solo OCR de comprobantes |
| Resend Free | 100 emails/día | Bajo |
| Vercel Hobby | 100 GB bandwidth/mes | Muy bajo |

---

## Escala Media — 10–30 organizaciones, miles de mensajes/día

| Servicio | Cambio | Plan recomendado | Costo/mes |
|----------|--------|-----------------|-----------|
| **Railway** (backend) | Más memoria, mayor CPU en picos de webhooks | Pro (más RAM/CPU) | ~$20–40 |
| **Vercel** (dashboard) | Sin cambios necesarios, el SPA es ligero | Hobby sigue bien | $0 |
| **Supabase** | Superas 500MB DB y 1GB storage con seguridad | **Pro** | $25 |
| **Upstash Redis** | ~30,000–100,000 comandos/día | Pay as You Go | ~$1–5 |
| **Gemini API** | Más comprobantes procesados | Pay as You Go (`flash-lite` ~$0.075/1M tokens) | ~$2–8 |
| **Resend** | Más invitaciones, reportes automáticos | Starter | $20 |
| **Meta API** | Más mensajes business-initiated | Por uso | ~$10–30 |

### **Total estimado escala media: $78–128/mes**

---

## Escala Alta — 50+ organizaciones, decenas de miles de mensajes/día

### Arquitectura recomendada

```
┌─────────────┐     ┌──────────────────────────────────────┐
│  Vercel     │     │  Railway                              │
│  (SPA)      │────▶│  ┌──────────────┐ ┌───────────────┐  │
│  $0–20/mes  │     │  │ API Dashboard│ │ Bot / Webhook │  │
└─────────────┘     │  │   (lectura)  │ │  (escritura)  │  │
                    │  └──────────────┘ └───────────────┘  │
                    └──────────────────────────────────────┘
                              │                │
                    ┌─────────┘                └──────────┐
                    ▼                                      ▼
          ┌─────────────────┐                   ┌──────────────────┐
          │  Supabase Pro   │                   │  Upstash Redis   │
          │  DB + Auth      │                   │  Pay as You Go   │
          │  + PgBouncer    │                   └──────────────────┘
          └─────────────────┘
                    │ Storage
                    ▼
          ┌─────────────────────┐
          │  Cloudflare R2      │  ← migrar aquí cuando storage/bandwidth escale
          │  $0 egress          │
          └─────────────────────┘
```

| Servicio | Recomendación | Costo/mes |
|----------|--------------|-----------|
| **Railway** | Separar en 2 servicios: `api` + `bot-webhook` para escalar independientemente | ~$40–80 |
| **Vercel** | Pro si necesitas analytics o team features | $0–20 |
| **Supabase Pro** | Pro + read replica para reportes pesados | $25–50 |
| **Upstash Redis** | Pay as You Go, considerar `maxmemory-policy allkeys-lru` | ~$10–20 |
| **Gemini API** | Evaluar batch processing para OCR en horarios valle | ~$15–30 |
| **Cloudflare R2** | Migrar `flow-media` (videos/imágenes de flujos). `receipts` puede quedarse en Supabase con retención 7 días | ~$5–15 |
| **Resend** | Business plan o considerar SendGrid para volumen | $20–35 |
| **Meta API** | Principal variable — depende del modelo de negocio (cuántos mensajes business-initiated) | $50–200+ |

### **Total estimado escala alta: $165–450/mes**
> El rango es amplio porque Meta API domina el costo a escala.

---

## Decisiones clave cuando escales

### 1. Separar bot-webhook del API dashboard (Railway)
El webhook de Meta recibe miles de eventos concurrentes. El dashboard tiene carga predecible y baja.
Separar los servicios permite escalar solo el webhook sin pagar por más RAM en el dashboard API.

### 2. Supabase Pro → activar PgBouncer
Con muchas organizaciones y el bot escribiendo conversaciones en paralelo, el pool de conexiones se satura rápido en el Free tier. Pro incluye PgBouncer (connection pooling) que resuelve esto sin cambiar código.

### 3. Migrar `flow-media` a Cloudflare R2
Los videos/imágenes de pasos de flujo se descargan cada vez que Meta entrega un mensaje. Con 50+ orgs activas el egress de Supabase ($0.09/GB) supera con creces el costo de R2 ($0 egress). La migración es S3-compatible — solo cambia las credenciales y el bucket URL.

### 4. NO migrar `receipts` a R2
Los comprobantes tienen retención de 7 días y solo los acceden los agentes en el dashboard. El volumen de bandwidth es bajo. Quédate en Supabase Storage para mantener RLS automático.

### 5. Gemini OCR — vigilar rate limits
`gemini-2.0-flash-lite` en free tier: 15 RPM. Con muchas organizaciones enviando comprobantes simultáneamente puedes saturarlo. Al pasarte a pay-as-you-go el costo es mínimo (~$0.075/1M tokens) pero el rate limit sube significativamente.

---

## Resumen de evolución de costos

```
Beta (hoy)          Escala media (10-30 orgs)    Escala alta (50+ orgs)
    │                        │                           │
  $6–18                  $78–128                    $165–450
    │                        │                           │
  Railway+               + Supabase Pro              + Separar servicios
  Dominio                + Resend Starter             + R2 para media
                         + más Redis/Gemini           + PgBouncer activo
```

---

## Acción inmediata recomendada

- [ ] Monitorear uso de Supabase Storage en el dashboard de Supabase (especialmente `flow-media`)
- [ ] Activar alertas de billing en Railway (evitar sorpresas)
- [ ] Al pasar de 5 orgs activas → migrar a **Supabase Pro** ($25/mes, sin riesgo de límites)
- [ ] Al superar $15/mes en Gemini → revisar si el modelo `flash-lite` sigue siendo suficiente vs `flash`

---

*Precios aproximados a Abril 2026. Verificar siempre las páginas oficiales de cada servicio antes de tomar decisiones.*
