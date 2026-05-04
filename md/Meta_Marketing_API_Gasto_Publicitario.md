# Meta Marketing API — Documentación de Gasto Publicitario

> **Última actualización:** Abril 2026  
> **Versión actual de la API:** v25.0  
> **Fuente oficial:** [developers.facebook.com/docs/marketing-api/insights](https://developers.facebook.com/docs/marketing-api/insights/)

---

## 1. Descripción General

La **Insights API** es el componente de la Marketing API de Meta diseñado específicamente para reportes de rendimiento. A diferencia del resto de la Marketing API (que muestra *qué es* un anuncio), la Insights API muestra *cómo se desempeñó*. Proporciona una interfaz única y consistente para obtener estadísticas publicitarias de campañas ejecutadas en Facebook, Instagram, Messenger y Audience Network.

La API ofrece acceso a más de 70 métricas de rendimiento con control total sobre rangos de fechas, desgloses (breakdowns) y ventanas de atribución.

---

## 2. Requisitos Previos

### 2.1 Componentes Necesarios

| Componente | Descripción |
|---|---|
| **Cuenta de Meta Business Manager** | Hub central para organizar cuentas publicitarias y gestionar permisos |
| **Cuenta publicitaria activa** | Maneja facturación, límites de gasto y gestión programática de campañas |
| **Cuenta de desarrollador Meta** | Acceso a las herramientas de desarrollador en [developers.facebook.com](https://developers.facebook.com/) |
| **App registrada** | Identificador único de tu aplicación dentro del ecosistema de Meta |
| **Verificación de negocio** | Requerida para acceder a funciones avanzadas y ciertos permisos de la API |

### 2.2 Permisos Requeridos

| Permiso | Uso | Nivel |
|---|---|---|
| `ads_read` | Lectura de datos de campañas, métricas e insights | **Obligatorio para reportes** |
| `ads_management` | Creación, edición y eliminación de campañas, ad sets y anuncios | Solo si necesitas escribir |
| `business_management` | Acceso a funciones de Business Manager | Para gestión multi-cuenta |
| `pages_read_engagement` | Lectura de datos de interacción en páginas | Solo si trabajas con datos de Pages |

### 2.3 Niveles de Acceso

| Nivel | Descripción |
|---|---|
| **Development Access** | Nivel por defecto. Permite acceso limitado para desarrollo y pruebas. Rate limiting más bajo. |
| **Standard Access** | Acceso básico funcional. Se obtiene solicitando "Advanced Access" a la feature *Ads Management Standard Access*. Habilita rate limiting más generoso. |
| **Advanced Access** | Desbloquea funciones avanzadas. Requiere App Review por parte de Meta y, en algunos casos, verificación de negocio con documentos legales. |

> **Importante:** Para aplicaciones en producción que acceden a cuentas de terceros, se requiere Advanced Access. El proceso de aprobación puede tomar semanas, por lo que se recomienda solicitarlo temprano en el ciclo de desarrollo.

### 2.4 Tokens de Acceso

| Tipo | Duración | Uso |
|---|---|---|
| **Short-Lived User Token** | ~1-2 horas | Pruebas rápidas via Graph API Explorer |
| **Long-Lived User Token** | ~60 días | Se extiende desde un short-lived token usando el Access Token Debugger |
| **System User Token** | No expira | Ideal para integraciones servidor-servidor y scripts de larga duración |

---

## 3. Endpoints Principales

La Insights API está disponible como un *edge* en cualquier objeto publicitario:

| Nivel | Endpoint |
|---|---|
| **Cuenta publicitaria** | `GET /act_{AD_ACCOUNT_ID}/insights` |
| **Campaña** | `GET /{CAMPAIGN_ID}/insights` |
| **Conjunto de anuncios (Ad Set)** | `GET /{ADSET_ID}/insights` |
| **Anuncio individual** | `GET /{AD_ID}/insights` |

### Ejemplo básico

```bash
curl -G \
  -d "fields=campaign_name,spend,impressions,clicks,actions" \
  -d "date_preset=last_7d" \
  -d "access_token=ACCESS_TOKEN" \
  "https://graph.facebook.com/v25.0/act_{AD_ACCOUNT_ID}/insights"
```

### Respuesta típica

```json
{
  "data": [
    {
      "campaign_name": "Mi Campaña",
      "spend": "2352.45",
      "impressions": "2466376",
      "clicks": "6608",
      "actions": [
        {
          "action_type": "link_click",
          "value": "6608"
        }
      ],
      "date_start": "2026-04-15",
      "date_stop": "2026-04-22"
    }
  ],
  "paging": {
    "cursors": {
      "before": "MAZDZD",
      "after": "MAZDZD"
    }
  }
}
```

---

## 4. Métricas Disponibles Relacionadas con Gasto

### 4.1 Métricas Directas de Gasto

| Campo | Descripción |
|---|---|
| `spend` | Monto total gastado durante el período seleccionado (en la moneda de la cuenta) |
| `cpc` | Costo por clic (todos los clics) |
| `cpm` | Costo por cada 1,000 impresiones |
| `cpp` | Costo por cada 1,000 personas alcanzadas |
| `cost_per_action_type` | Costo promedio por cada tipo de acción |
| `cost_per_unique_click` | Costo promedio por clic único |
| `cost_per_unique_action_type` | Costo promedio por tipo de acción única |
| `cost_per_thruplay` | Costo por reproducción completa de video (o 15 segundos) |
| `cost_per_estimated_ad_recallers` | Costo estimado por persona que recuerda el anuncio |

### 4.2 Métricas de Rendimiento Complementarias

| Campo | Descripción |
|---|---|
| `impressions` | Número total de veces que se mostró el anuncio |
| `reach` | Número de personas únicas que vieron el anuncio |
| `frequency` | Promedio de veces que cada persona vio el anuncio |
| `clicks` | Total de clics (todos los tipos) en el anuncio |
| `unique_clicks` | Número de personas únicas que hicieron clic |
| `ctr` | Tasa de clics (Click-Through Rate) |
| `unique_ctr` | CTR basado en clics únicos |
| `actions` | Desglose de acciones realizadas (link_click, purchase, mobile_app_install, etc.) |
| `action_values` | Valores monetarios de las conversiones |
| `conversions` | Número de conversiones registradas |
| `conversion_values` | Valor monetario de las conversiones |
| `purchase_roas` | Return on Ad Spend (ROAS) de compras |

### 4.3 Métricas de Video

| Campo | Descripción |
|---|---|
| `video_thruplay_watched_actions` | Reproducciones completas de video (ThruPlay) |
| `video_p25_watched_actions` | Reproducciones al 25% |
| `video_p50_watched_actions` | Reproducciones al 50% |
| `video_p75_watched_actions` | Reproducciones al 75% |
| `video_p100_watched_actions` | Reproducciones al 100% |
| `video_avg_time_watched_actions` | Tiempo promedio de visualización |

---

## 5. Parámetros de Consulta

### 5.1 Control de Fechas

**Date Presets disponibles:**

`today`, `yesterday`, `last_3d`, `last_7d`, `last_14d`, `last_28d`, `last_30d`, `last_90d`, `this_week_mon_today`, `this_week_sun_today`, `last_week_mon_sun`, `last_week_sun_sat`, `this_month`, `last_month`, `this_quarter`, `last_quarter`, `this_year`, `last_year`, `lifetime`

**Rango personalizado:**

```bash
-d 'time_range={"since":"2026-01-01","until":"2026-03-31"}'
```

### 5.2 Incremento de Tiempo (time_increment)

Divide los resultados en intervalos:

| Valor | Descripción |
|---|---|
| `1` | Datos por día |
| `7` | Datos por semana |
| `monthly` | Datos por mes |
| `all_days` | Datos agregados del período completo (por defecto) |

Ejemplo para obtener gasto diario:

```bash
curl -G \
  -d "fields=spend,impressions" \
  -d "time_increment=1" \
  -d "date_preset=last_30d" \
  -d "access_token=ACCESS_TOKEN" \
  "https://graph.facebook.com/v25.0/act_{AD_ACCOUNT_ID}/insights"
```

### 5.3 Nivel de Agregación (level)

| Valor | Descripción |
|---|---|
| `account` | Agregado a nivel de cuenta |
| `campaign` | Desglose por campaña |
| `adset` | Desglose por conjunto de anuncios |
| `ad` | Desglose por anuncio individual |

```bash
-d "level=campaign"
```

### 5.4 Ordenamiento (sort)

```bash
-d "sort=spend_descending"
# o
-d "sort=impressions_ascending"
```

### 5.5 Filtrado (filtering)

```bash
-d 'filtering=[{"field":"ad.effective_status","operator":"IN","value":["ACTIVE","PAUSED"]}]'
```

Operadores disponibles: `EQUAL`, `NOT_EQUAL`, `GREATER_THAN`, `GREATER_THAN_OR_EQUAL`, `LESS_THAN`, `LESS_THAN_OR_EQUAL`, `IN`, `NOT_IN`, `CONTAIN`, `NOT_CONTAIN`, `STARTS_WITH`, `ANY`, `ALL`, `NONE`.

---

## 6. Breakdowns (Desgloses)

Los breakdowns permiten agrupar los resultados por diferentes dimensiones.

### 6.1 Breakdowns Genéricos

| Breakdown | Descripción |
|---|---|
| `age` | Rango de edad de la audiencia alcanzada |
| `gender` | Género de las personas alcanzadas |
| `country` | País donde se encuentran las personas alcanzadas |
| `region` | Región geográfica |
| `dma` | Designated Market Area (solo EE.UU., 210 áreas geográficas) |
| `publisher_platform` | Plataforma donde se mostró el anuncio (Facebook, Instagram, Audience Network, Messenger) |
| `platform_position` | Posición dentro de la plataforma (Feed, Stories, Reels, Right Column, etc.) |
| `device_platform` | Tipo de dispositivo (mobile, desktop) |
| `impression_device` | Dispositivo específico donde se mostró el anuncio (iPhone, Android, Desktop, etc.) |
| `product_id` | ID del producto (para campañas de catálogo) |
| `user_segment_key` | Segmento de usuario en campañas Advantage+ Shopping (nuevo, existente) |

### 6.2 Breakdowns por Hora

| Breakdown | Descripción |
|---|---|
| `hourly_stats_aggregated_by_advertiser_time_zone` | Desglose por hora según la zona horaria del anunciante |
| `hourly_stats_aggregated_by_audience_time_zone` | Desglose por hora según la zona horaria de la audiencia |

> **Nota:** Los breakdowns por hora no soportan métricas únicas (`reach`, `frequency`, campos con prefijo `unique_*`). Estos campos retornan 0 cuando se usan breakdowns horarios.

### 6.3 Action Breakdowns

Se aplican al campo `actions` y desglosan las acciones por dimensión:

| Action Breakdown | Descripción |
|---|---|
| `action_type` | Tipo de acción (link_click, purchase, mobile_app_install, etc.) — **se aplica por defecto** |
| `action_device` | Dispositivo donde ocurrió la conversión |
| `action_destination` | Destino al que van los usuarios (página de Facebook, URL externa, app) |
| `action_target_id` | ID del destino de la acción |
| `action_carousel_card_id` | ID de la tarjeta de carrusel con la que interactuaron |
| `action_carousel_card_name` | Nombre de la tarjeta de carrusel |
| `action_video_sound` | Estado del sonido (on/off) durante reproducción de video |
| `action_video_type` | Tipo de métrica de video |
| `action_reaction` | Tipo de reacción (Like, Love, Haha, Wow, Sad, Angry) |
| `conversion_destination` | Destino de la conversión |
| `action_canvas_component_name` | Componente dentro de un anuncio Canvas |

### 6.4 Breakdowns de Assets (Dynamic Creative)

| Breakdown | Métricas soportadas |
|---|---|
| `image_asset` | `impressions`, `clicks`, `spend`, `reach`, `actions`, `action_values` |
| `video_asset` | (mismas métricas) |
| `title_asset` | (mismas métricas) |
| `body_asset` | (mismas métricas) |
| `call_to_action_asset` | (mismas métricas) |
| `description_asset` | (mismas métricas) |
| `link_url_asset` | (mismas métricas) |

### 6.5 Combinaciones de Breakdowns Permitidas

No todas las combinaciones son posibles. Algunas combinaciones válidas incluyen:

- `age, gender`
- `publisher_platform, platform_position`
- `publisher_platform, platform_position, impression_device`
- `action_device, publisher_platform`
- `action_device, publisher_platform, platform_position, impression_device`
- `country` (solo)
- `region` (solo)

Las combinaciones marcadas con asterisco (*) en la documentación oficial pueden combinarse adicionalmente con `action_type`, `action_target_id` y `action_destination`.

### 6.6 Restricciones para Métricas Off-Meta

Desde abril de 2021, ciertos breakdowns tienen restricciones para métricas fuera de Meta:

**Tipo 1** (no retornan métricas offsite): `region`, `dma`, `hourly_stats_aggregated_by_audience_time_zone`, `hourly_stats_aggregated_by_advertiser_time_zone`

**Tipo 2** (retornan métricas web pero sin valor de breakdown; no retornan métricas móviles): `action_device`, `action_destination`, `action_target_id`, `product_id`, `action_carousel_card_id`, `action_canvas_component_name`

---

## 7. Ventanas de Atribución

La ventana de atribución define el período en el que Meta atribuye una conversión a un anuncio.

### 7.1 Ventanas Disponibles

| Ventana | Descripción |
|---|---|
| `1d_click` | Conversiones dentro de 1 día después del clic |
| `7d_click` | Conversiones dentro de 7 días después del clic (**valor por defecto**) |
| `28d_click` | Conversiones dentro de 28 días después del clic |
| `1d_view` | Conversiones dentro de 1 día después de la impresión |

> **Cambio enero 2026:** Meta eliminó el soporte para las ventanas `7d_view` y `28d_view`. Solo `1d_view` permanece disponible.

### 7.2 Ejemplo de Uso

```bash
-d "action_attribution_windows=['1d_click','7d_click','1d_view']"
```

La respuesta incluye los valores por cada ventana:

```json
{
  "action_type": "offsite_conversion.fb_pixel_purchase",
  "value": "150",
  "1d_click": "120",
  "7d_click": "150",
  "1d_view": "30"
}
```

### 7.3 Cambios de Atribución Unificada (Junio 2025)

Desde junio de 2025, los parámetros `use_unified_attribution_setting` y `action_report_time` son ignorados. La API ahora refleja automáticamente la configuración de Ads Manager:

- Los valores atribuidos se basan en la configuración de atribución a nivel de Ad Set.
- Las acciones on-Meta (como Link Clicks) usan tiempo de reporte basado en impresión.
- Las acciones off-Meta (como compras web) usan tiempo de reporte basado en conversión (`action_report_time=mixed`).
- Los datos de atribución `inline` ya no se retornan por separado.

---

## 8. Consultas Asíncronas

Para conjuntos de datos grandes, se recomienda usar jobs asíncronos.

### 8.1 Flujo de Trabajo

**Paso 1: Crear el job**

```bash
curl -X POST \
  -d "level=ad" \
  -d "fields=spend,impressions,clicks,actions" \
  -d "time_increment=1" \
  -d "date_preset=last_90d" \
  -d "access_token=ACCESS_TOKEN" \
  "https://graph.facebook.com/v25.0/act_{AD_ACCOUNT_ID}/insights"
```

Respuesta:

```json
{
  "report_run_id": "6023920149050"
}
```

**Paso 2: Consultar el estado del job**

```bash
curl -G \
  -d "access_token=ACCESS_TOKEN" \
  "https://graph.facebook.com/v25.0/{REPORT_RUN_ID}"
```

Monitorear `async_status` hasta que sea `Job Completed` y `async_percent_completion` sea `100`.

| Estado | Descripción |
|---|---|
| `Job Not Started` | El job aún no inicia |
| `Job Started` | Iniciado pero aún no se ejecuta |
| `Job Running` | En ejecución |
| `Job Completed` | Completado exitosamente |
| `Job Failed` | Falló. Revisar la consulta e intentar de nuevo |
| `Job Skipped` | Expirado. Re-enviar el job |

**Paso 3: Obtener los resultados**

```bash
curl -G \
  -d "access_token=ACCESS_TOKEN" \
  "https://graph.facebook.com/v25.0/{REPORT_RUN_ID}/insights"
```

> **Nota:** Los `report_run_id` expiran después de 30 días. No almacenarlos para uso a largo plazo.

### 8.2 Exportar Reportes

Se puede exportar un report run a formato CSV o XLS:

```bash
curl -G \
  -d "report_run_id={AD_REPORT_RUN_ID}" \
  -d "name=mi_reporte" \
  -d "format=csv" \
  "https://www.facebook.com/ads/ads_insights/export_report/"
```

---

## 9. Batch Requests

Para múltiples consultas simultáneas:

```bash
curl \
  -F 'access_token=ACCESS_TOKEN' \
  -F 'batch=[
    {
      "method": "GET",
      "relative_url": "v25.0/{CAMPAIGN_ID_1}/insights?fields=impressions,spend&level=ad"
    },
    {
      "method": "GET",
      "relative_url": "v25.0/{CAMPAIGN_ID_2}/insights?fields=impressions,spend&level=ad"
    }
  ]' \
  'https://graph.facebook.com'
```

---

## 10. Objetos Eliminados y Archivados

Los anuncios eliminados o archivados siguen contribuyendo a los datos agregados del objeto padre. Sin embargo, al consultar con filtros, el filtrado por estado se aplica por defecto y solo retorna objetos activos.

**Consultar objetos archivados:**

```bash
-d 'filtering=[{"field":"ad.effective_status","operator":"IN","value":["ARCHIVED"]}]'
```

**Consultar objetos eliminados:**

```bash
-d 'filtering=[{"field":"ad.effective_status","operator":"IN","value":["DELETED"]}]'
```

---

## 11. Límites y Rate Limiting

### 11.1 Tipos de Límites

| Tipo | Descripción |
|---|---|
| **Rate Limits por App** | Límite fijo por aplicación por segundo, basado en la frecuencia de llamadas y los recursos que requieren |
| **Rate Limits por Cuenta** | Límite por cuenta publicitaria |
| **Límites de Datos por Llamada** | Restricción por número de filas en respuesta y por cantidad de data points requeridos |
| **Rate Limits Globales** | Durante períodos de carga elevada del sistema |

### 11.2 Headers de Monitoreo

**`x-fb-ads-insights-throttle`:**

```json
{
  "app_id_util_pct": 45,
  "acc_id_util_pct": 10,
  "ads_api_access_tier": "standard_access"
}
```

- `app_id_util_pct` — Porcentaje de capacidad consumida por la app
- `acc_id_util_pct` — Porcentaje de capacidad consumida por la cuenta publicitaria
- `ads_api_access_tier` — Nivel de acceso actual

**`x-Fb-Ads-Insights-Reach-Throttle`:** Monitorea el límite para consultas de `reach` con breakdowns y fechas mayores a 13 meses (máximo 10 requests asíncronos por cuenta por día).

### 11.3 Errores Comunes

| Código | Descripción |
|---|---|
| `error_code = 4` | Rate limit alcanzado. Reducir frecuencia y reintentar. |
| `error_code = 100, subcode 1487534` | Límite de datos por llamada excedido. Reducir rango de fechas o campos. |
| `error_code = 4, subcode 1504022` | Throttling global. Esperar y reintentar. |

### 11.4 Mejores Prácticas

1. Los datos se refrescan cada 15 minutos y no cambian después de 28 días de ser reportados.
2. Usar `date_preset` cuando sea posible (más eficiente que rangos personalizados).
3. Intentar llamadas síncronas primero; usar asíncronas solo cuando las síncronas fallan por timeout.
4. Separar métricas únicas (`reach`, `unique_clicks`, etc.) en llamadas aparte.
5. Solicitar solo los campos que se necesitan.
6. Implementar mecanismos de *back-off* basados en los headers de throttle.
7. Espaciar las consultas en el tiempo en lugar de enviarlas todas a la vez.
8. Evitar consultas a nivel de cuenta con breakdowns de alta cardinalidad (`action_target_id`, `product_id`) y rangos amplios como `lifetime`.
9. Desde junio 2025, `reach` con breakdowns no se retorna para fechas de inicio mayores a 13 meses (excepto vía jobs asíncronos, máximo 10/día/cuenta).

---

## 12. Casos de Uso Prácticos

### 12.1 Gasto Diario por Campaña

```bash
curl -G \
  -d "fields=campaign_name,spend,impressions,clicks,cpc,cpm" \
  -d "time_increment=1" \
  -d "level=campaign" \
  -d "date_preset=last_30d" \
  -d "access_token=ACCESS_TOKEN" \
  "https://graph.facebook.com/v25.0/act_{AD_ACCOUNT_ID}/insights"
```

### 12.2 Gasto por Plataforma y Posición

```bash
curl -G \
  -d "fields=spend,impressions,clicks" \
  -d "breakdowns=publisher_platform,platform_position" \
  -d "date_preset=last_7d" \
  -d "access_token=ACCESS_TOKEN" \
  "https://graph.facebook.com/v25.0/act_{AD_ACCOUNT_ID}/insights"
```

### 12.3 Gasto por Edad y Género

```bash
curl -G \
  -d "fields=spend,impressions,reach" \
  -d "breakdowns=age,gender" \
  -d "date_preset=last_30d" \
  -d "access_token=ACCESS_TOKEN" \
  "https://graph.facebook.com/v25.0/{CAMPAIGN_ID}/insights"
```

### 12.4 Gasto por País

```bash
curl -G \
  -d "fields=spend,impressions,actions" \
  -d "breakdowns=country" \
  -d "date_preset=last_30d" \
  -d "access_token=ACCESS_TOKEN" \
  "https://graph.facebook.com/v25.0/act_{AD_ACCOUNT_ID}/insights"
```

### 12.5 Gasto con Desglose de Conversiones y ROAS

```bash
curl -G \
  -d "fields=spend,actions,action_values,purchase_roas,cost_per_action_type" \
  -d "action_breakdowns=action_type" \
  -d "time_increment=1" \
  -d "date_preset=last_7d" \
  -d "level=campaign" \
  -d "access_token=ACCESS_TOKEN" \
  "https://graph.facebook.com/v25.0/act_{AD_ACCOUNT_ID}/insights"
```

### 12.6 Gasto por Hora del Día

```bash
curl -G \
  -d "fields=spend,impressions,clicks" \
  -d "breakdowns=hourly_stats_aggregated_by_advertiser_time_zone" \
  -d "date_preset=yesterday" \
  -d "access_token=ACCESS_TOKEN" \
  "https://graph.facebook.com/v25.0/{CAMPAIGN_ID}/insights"
```

### 12.7 Ejemplo con Python SDK

```python
from facebook_business.api import FacebookAdsApi
from facebook_business.adobjects.adaccount import AdAccount

app_id = 'TU_APP_ID'
app_secret = 'TU_APP_SECRET'
access_token = 'TU_ACCESS_TOKEN'

FacebookAdsApi.init(app_id, app_secret, access_token)

params = {
    'date_preset': 'last_7d',
    'time_increment': 1,
    'level': 'campaign',
    'breakdowns': ['publisher_platform'],
}

fields = [
    'campaign_name',
    'spend',
    'impressions',
    'clicks',
    'cpm',
    'ctr',
    'actions',
    'cost_per_action_type',
]

account = AdAccount('act_TU_ACCOUNT_ID')
insights = account.get_insights(params=params, fields=fields)

for row in insights:
    print(f"{row['campaign_name']} | {row['date_start']} | ${row['spend']}")
```

---

## 13. Versionamiento de la API

Meta actualiza la versión de la API aproximadamente cada trimestre, con dos versiones mayores por año. Cada versión tiene soporte garantizado por al menos 2 años desde su lanzamiento.

| Aspecto | Detalle |
|---|---|
| Versión actual | v25.0 |
| Frecuencia de actualización | Trimestral (aprox.) |
| Soporte por versión | Mínimo 2 años |
| Deprecación importante (Q1 2026) | APIs legadas de Advantage Shopping y App Campaign serán deprecadas en v25 |

**Recomendación:** Fijar la integración a una versión específica (ej. `v25.0`) y monitorear los anuncios de deprecación para planificar la migración antes del fin de vida de la versión.

---

## 14. Cambios Recientes y Deprecaciones

| Fecha | Cambio |
|---|---|
| **Junio 2025** | `use_unified_attribution_setting` y `action_report_time` son ignorados; la API replica el comportamiento de Ads Manager |
| **Junio 2025** | `reach` con breakdowns limitado a 13 meses de historial para consultas estándar |
| **Enero 2026** | Eliminación de ventanas de atribución `7d_view` y `28d_view` |
| **Q1 2026** | Deprecación de APIs legadas de Advantage Shopping y App Campaign |

---

## 15. Enlaces de Referencia

| Recurso | URL |
|---|---|
| Insights API (principal) | https://developers.facebook.com/docs/marketing-api/insights/ |
| Breakdowns | https://developers.facebook.com/docs/marketing-api/insights/breakdowns/ |
| Límites y mejores prácticas | https://developers.facebook.com/docs/marketing-api/insights/best-practices/ |
| Jobs asíncronos | https://developers.facebook.com/docs/marketing-api/insights/async |
| Referencia de Ad Account Insights | https://developers.facebook.com/docs/marketing-api/reference/ad-account/insights |
| Referencia de Campaign Insights | https://developers.facebook.com/docs/marketing-api/reference/ad-campaign-group/insights |
| Referencia de Ad Set Insights | https://developers.facebook.com/docs/marketing-api/reference/ad-campaign/insights |
| Referencia de Ad Insights | https://developers.facebook.com/docs/marketing-api/reference/adgroup/insights/ |
| Changelog | https://developers.facebook.com/docs/marketing-api/marketing-api-changelog |
| Términos de plataforma | https://developers.facebook.com/terms |
| Políticas de desarrollador | https://developers.facebook.com/devpolicy/#marketingapi |
| Graph API Explorer | https://developers.facebook.com/tools/explorer/ |
| Access Token Debugger | https://developers.facebook.com/tools/debug/accesstoken/ |
