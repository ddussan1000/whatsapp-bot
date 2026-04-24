import { useState } from "react";
import {
  Workflow,
  Smartphone,
  MessagesSquare,
  BarChart3,
  Receipt,
  Building2,
  Library,
  LayoutDashboard,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Zap,
  Clock,
  MessageSquare,
  Megaphone,
  ImageIcon,
  ExternalLink,
  ShieldCheck,
  Key,
  AlertTriangle,
  Webhook,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";

// ── Pasos de configuración ────────────────────────────────────────────────

const SETUP_STEPS = [
  {
    step: 1,
    title: "Registrá tu número de WhatsApp",
    nav: "Números de WhatsApp",
    icon: Smartphone,
    required: true,
    description:
      "En la sección Números de WhatsApp agregá tu número con el Phone Number ID, el token de acceso (META_TOKEN) y el WABA ID. Estos los encontrás en developers.facebook.com → tu app → WhatsApp → API Setup.",
    tip: "Usá el botón Verificar conexión después de guardar para confirmar que el token tiene los permisos correctos y la app está suscripta al número.",
  },
  {
    step: 2,
    title: "Configurá el webhook en Meta",
    nav: "Números de WhatsApp",
    icon: Webhook,
    required: true,
    description:
      "Copiá la Callback URL y el Verify Token que aparecen en la tarjeta azul de la sección Números de WhatsApp. Pegálos en developers.facebook.com → tu app → WhatsApp → Configuración → Webhooks.",
    substeps: [
      "En Números de WhatsApp copiá la Callback URL y el Verify Token",
      "En Meta: tu app → WhatsApp → Configuración → Webhooks → Editar",
      "Pegá la Callback URL y el Verify Token → Verificar y guardar",
      "En Campos del webhook suscribite a: messages y messaging_postbacks",
    ],
    tip: "Si Meta devuelve error al verificar, revisá que la app esté publicada o en modo desarrollo con vos como administrador.",
  },
  {
    step: 3,
    title: "Permisos requeridos en el token",
    nav: "developers.facebook.com",
    icon: ShieldCheck,
    required: true,
    description:
      "El token de acceso necesita los permisos whatsapp_business_messaging y whatsapp_business_management. Para el análisis de comprobantes de pago (descarga de imágenes), el permiso whatsapp_business_messaging es obligatorio.",
    tip: "Usá un System User Token generado desde Business Manager → Usuarios del sistema. No vence y evita interrupciones. Los tokens de usuario vencen en 1-2 hs; los de larga duración en 60 días.",
  },
  {
    step: 4,
    title: "Armá tu primer flow",
    nav: "Flows o Plantillas",
    icon: Workflow,
    required: true,
    description:
      "Un flow define qué mensajes envía el bot, en qué orden y con qué tiempos de espera entre pasos. Podés crear uno desde cero o guardar uno existente como plantilla para reutilizarlo.",
    tip: "Los tiempos mínimos recomendados entre mensajes son 15-30 segundos para que el cliente no reciba todo de golpe.",
  },
  {
    step: 5,
    title: "Asigná el flow al número y configurá la divisa",
    nav: "Números de WhatsApp",
    icon: Zap,
    required: true,
    description:
      "En Números de WhatsApp editá tu instancia, seleccioná el flow activo y elegí la divisa (COP, USD, EUR, etc.). La divisa se usa para interpretar los montos en los comprobantes de pago y se muestra en el módulo de Pagos.",
    tip: "Cada número puede tener su propia divisa. Si tu negocio opera en varios países con distintas monedas, creá un número por divisa.",
  },
  {
    step: 6,
    title: "Configurá tu API key de IA (opcional)",
    nav: "Configuración",
    icon: MessageSquare,
    required: false,
    description:
      "Si querés que el bot responda con IA cuando un cliente escribe después de terminar un flujo, configurá tu propio proveedor en Configuración → API Key de IA. Podés elegir entre OpenAI, Gemini, Anthropic o Groq, e ingresar tu API key personal. Sin esto el bot simplemente no responde mensajes fuera de los pasos del flujo.",
    tip: "Usá el botón «Verificar conexión» para confirmar que la API key y el modelo elegido funcionan antes de guardar. El reconocimiento de comprobantes de pago es independiente y no requiere esta configuración.",
  },
  {
    step: 7,
    title: "Conectá tus anuncios CTWA",
    nav: "CTWA Ads",
    icon: Megaphone,
    required: false,
    description:
      "Si tenés anuncios Click-to-WhatsApp en Meta, podés asignarle un flow específico a cada anuncio. Cuando alguien hace click y te escribe, la plataforma detecta de qué anuncio proviene y lo registra en Reportes → Anuncios.",
    tip: "Si el token tiene el permiso ads_read, la plataforma muestra automáticamente el nombre del anuncio, la campaña y el conjunto de anuncios junto con cada registro.",
  },
];

// ── Permisos ──────────────────────────────────────────────────────────────

const PERMISSIONS = [
  {
    permission: "whatsapp_business_messaging",
    level: "Requerido",
    levelColor: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
    what: "Enviar mensajes, recibir webhooks de mensajes entrantes y descargar media (imágenes, documentos) enviados por usuarios.",
    without:
      "Sin este permiso el bot no puede enviar mensajes ni analizar comprobantes de pago. Causa el error «META_TOKEN no configurado» al intentar descargar imágenes.",
  },
  {
    permission: "whatsapp_business_management",
    level: "Requerido",
    levelColor: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
    what: "Gestionar números de teléfono, configurar webhooks y acceder a metadata de la cuenta WABA.",
    without:
      "El health check del número fallará y algunas operaciones de gestión de cuenta no funcionarán.",
  },
  {
    permission: "ads_read",
    level: "Recomendado",
    levelColor:
      "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
    what: "Leer datos de campañas y anuncios de la cuenta publicitaria. La plataforma lo usa para enriquecer ad_click_logs con nombre de anuncio, campaña y adset vía Graph API.",
    without:
      "Los registros de anuncios solo tendrán el headline que llega en el referral del webhook. No se consultará la Graph API para datos adicionales.",
  },
];

// ── Módulos ───────────────────────────────────────────────────────────────

const MODULES = [
  {
    name: "Resumen",
    nav: "Resumen",
    icon: LayoutDashboard,
    description:
      "Overview del día: conversaciones activas, mensajes procesados y estado del bot.",
    details: "No requiere configuración. Refleja la actividad en tiempo real.",
  },
  {
    name: "Conversaciones",
    nav: "Conversaciones",
    icon: MessagesSquare,
    description:
      "Lista completa de conversaciones con historial de mensajes, filtros avanzados y composer para responder manualmente.",
    details:
      "Filtrá por estado, flujo activo o anuncio de origen. El historial de chat carga los mensajes más recientes; al subir carga los anteriores. Desde el detalle podés ver la información del cliente, cambiar el estado de la conversación manualmente y ver de qué anuncio llegó.",
    tip: "El número de teléfono del cliente es el identificador principal. No se guardan nombres de contacto de Meta.",
  },
  {
    name: "Pagos",
    nav: "Pagos",
    icon: Receipt,
    description:
      "Comprobantes de pago procesados por IA con monto, divisa, fecha y estado.",
    details:
      "Cuando un cliente manda una imagen de comprobante, la plataforma la analiza automáticamente con IA, extrae el monto, la divisa y la fecha, y valida que sea de las últimas 24 horas. La divisa mostrada corresponde a la configurada en el número de WhatsApp que recibió el comprobante.",
    tip: "Si los comprobantes quedan en pending_manual_review, generalmente es porque no se pudo extraer la fecha. El monto sí se registra.",
  },
  {
    name: "Reportes",
    nav: "Reportes",
    icon: BarChart3,
    description:
      "Analytics de conversaciones, ventas y performance de anuncios CTWA con filtros por fecha y flow.",
    details:
      "La sección Anuncios muestra métricas agrupadas por source_id: clicks, unique leads (teléfonos únicos), conversiones (pagos) y revenue. Si el token tiene ads_read, también muestra el nombre del anuncio y la campaña.",
  },
  {
    name: "Flows",
    nav: "Flows",
    icon: Workflow,
    description:
      "Editor de flujos: pasos con tiempo de espera entre mensajes, soporte para texto, imágenes, documentos y videos.",
    details:
      "Cada flujo tiene una frase de activación (lo que el cliente debe escribir para iniciarlo), palabras clave alternativas, tiempo de sesión y un prompt de IA propio que sobreescribe el global. También podés personalizar los mensajes de respuesta de pago (pendiente, rechazado y confirmado) por flujo.",
    tip: "Con tiempo de sesión en 0, el bot trata cada mensaje como una conversación nueva y siempre requiere que el cliente escriba la frase de activación.",
  },
  {
    name: "Plantillas",
    nav: "Plantillas",
    icon: Library,
    description:
      "Guardá flows como plantillas reutilizables para tu organización.",
    details:
      'Desde el editor de flows usá el botón "Guardar como plantilla" para capturar la configuración actual. Podés ponerle nombre, descripción y categoría. Luego desde Plantillas podés previsualizar los pasos y cargar cualquier plantilla en el editor con un clic.',
  },
  {
    name: "Números de WhatsApp",
    nav: "WhatsApp",
    icon: Smartphone,
    description:
      "Gestión de instancias: credenciales Meta, webhook config y asignación de flow.",
    details:
      "Cada número tiene su propio token de acceso (guardado de forma segura), el flujo que tiene asignado y la divisa configurada para sus pagos. El botón «Verificar conexión» confirma en tiempo real que el token es válido y tiene los permisos necesarios.",
    tip: "Si el health check retorna insufficient_permissions, el token existe pero le faltan permisos. Regenerálo con los permisos correctos.",
  },
  {
    name: "CTWA Ads",
    nav: "CTWA Ads",
    icon: Megaphone,
    description:
      "Mapeo de ctwa_clid → flow para personalizar la experiencia según el anuncio de origen.",
    details:
      'Cuando llega un mensaje con referral.source_type=="ad", la plataforma busca en flow_referrals si hay un flow mapeado para ese ctwa_clid. Si existe, usa ese flow en vez del asignado a la instancia.',
  },
  {
    name: "Organización",
    nav: "Organización",
    icon: Building2,
    description: "Gestión de miembros con roles: owner, admin, agent, viewer.",
    details:
      "Los owners y admins pueden modificar configuración e invitar nuevos miembros por correo. Los agents pueden ver conversaciones y pagos. Los viewers tienen acceso de solo lectura. Las invitaciones pendientes pueden reenviarse desde la misma pantalla.",
  },
];

// ── FAQ ───────────────────────────────────────────────────────────────────

const FAQS = [
  {
    q: "¿Por qué el bot no responde a los mensajes?",
    a: "Verificá en este orden: (1) el número tiene un flow activo asignado; (2) el webhook está configurado en Meta y suscripto a messages; (3) el META_TOKEN tiene whatsapp_business_messaging; (4) usá Verificar conexión para ver el error exacto.",
  },
  {
    q: "¿Por qué los comprobantes de pago no se analizan?",
    a: "El error más común es que el META_TOKEN no tiene el permiso whatsapp_business_messaging — este permiso es el que permite descargar la imagen enviada por el usuario. Verificá los permisos del token en el Token Debugger de Meta.",
  },
  {
    q: "¿Puedo personalizar los mensajes de respuesta de pago por flow?",
    a: "Sí. En el editor de flows, en la sección Configuración de pagos, podés definir mensajes específicos para comprobante pendiente, rechazado y confirmado. Si no se configuran, se usan los mensajes globales de Configuración Bot.",
  },
  {
    q: "¿Cómo actualizo el estado de una conversación manualmente?",
    a: "Abrí la conversación y presioná el ícono de información (ⓘ) en la parte superior derecha. En el modal de detalles encontrarás el selector de Estado donde podés cambiarlo al valor que necesites.",
  },
  {
    q: "¿Qué diferencia hay entre tiempo de sesión en 0 y un valor mayor?",
    a: "Con tiempo de sesión en 0, el bot trata cada mensaje como el inicio de una conversación nueva y siempre necesita que el cliente escriba la frase de activación. Con un valor mayor (por ejemplo, 24 horas), una vez que el flujo arrancó el bot responde con IA sin reiniciar el flujo durante ese período.",
  },
  {
    q: "¿Qué pasa si el cliente escribe algo que no coincide con ningún flujo?",
    a: "Depende de la configuración del flujo: si está en modo «responder», el bot le responde con IA si hay sesión activa. Si está en modo «ignorar», el bot no responde mensajes que no coincidan con ninguna palabra clave o frase de activación.",
  },
  {
    q: "¿Por qué se envían dos pasos del flujo al mismo tiempo?",
    a: "Los tiempos de espera entre pasos se respetan con una precisión de pocos segundos. Si configurás tiempos muy cortos (menos de 10 segundos) entre pasos consecutivos, podrían llegar juntos. Usá tiempos de al menos 15 segundos para garantizar entrega separada.",
  },
  {
    q: "¿Qué token debo usar para producción?",
    a: "System User Token generado desde Business Manager → Usuarios del sistema. No vence. Los tokens de usuario expiran en 1-2 horas y los de larga duración en 60 días, causando interrupciones en producción.",
  },
  {
    q: "¿Cómo conecto un anuncio CTWA con un flow específico?",
    a: "Una vez que alguien hace click en el anuncio, el ctwa_clid aparece en Reportes → Anuncios. Copiás ese ctwa_clid y lo mapeás al flow deseado en la sección CTWA Ads.",
  },
  {
    q: "¿Qué proveedor de IA elijo para las respuestas automáticas?",
    a: "Todos funcionan bien. Groq es el más rápido y económico. OpenAI (GPT) es el más conocido. Anthropic (Claude) y Gemini son excelentes alternativas si ya tenés cuenta en esos servicios. Todos se configuran desde Configuración → API Key de IA con tu propia clave.",
  },
  {
    q: "¿Cómo verifico que el token tiene los permisos correctos?",
    a: "Usá el Token Debugger de Meta (developers.facebook.com/tools/debug/accesstoken) para ver exactamente qué permisos tiene el token. También podés usar el botón Verificar conexión en la instancia.",
  },
  {
    q: "¿Por qué los datos del anuncio muestran solo el headline y no el nombre de la campaña?",
    a: "Para enriquecer los datos con nombre de campaña y adset, el token necesita el permiso ads_read. Sin ese permiso la plataforma solo muestra lo que llega directamente en el referral del webhook (headline, body, source_url).",
  },
];

// ── Sub-components ────────────────────────────────────────────────────────

function FAQItem({ item }: { item: (typeof FAQS)[0] }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border-b last:border-0">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-start justify-between gap-4 py-4 text-left"
      >
        <span className="text-base font-medium">{item.q}</span>
        {open ? (
          <ChevronUp
            size={15}
            className="mt-0.5 shrink-0 text-muted-foreground"
          />
        ) : (
          <ChevronDown
            size={15}
            className="mt-0.5 shrink-0 text-muted-foreground"
          />
        )}
      </button>
      {open && <p className="pb-4 text-sm text-muted-foreground">{item.a}</p>}
    </div>
  );
}

function SubSteps({ steps }: { steps: string[] }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="mt-2">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-1 text-sm text-primary hover:underline"
      >
        {open ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
        {open ? "Ocultar pasos" : "Ver pasos detallados"}
      </button>
      {open && (
        <ol className="mt-2 flex flex-col gap-1.5 pl-1">
          {steps.map((s, i) => (
            <li
              key={i}
              className="flex items-start gap-2 text-sm text-muted-foreground"
            >
              <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border text-[9px] font-bold">
                {i + 1}
              </span>
              {s}
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

// ── InstructionsPage ──────────────────────────────────────────────────────

export function InstructionsPage() {
  return (
    <div className="flex flex-col gap-6 p-3 max-w-4xl sm:gap-8 sm:p-6">
      <div>
        <h2 className="text-2xl font-semibold tracking-tight">
          Guía de configuración
        </h2>
        <p className="mt-1 text-base text-muted-foreground">
          Todo lo que necesitás para conectar la plataforma con Meta y sacarle
          el máximo provecho.
        </p>
      </div>

      {/* Setup steps */}
      <div>
        <h3 className="mb-4 text-lg font-semibold">Pasos de configuración</h3>
        <div className="flex flex-col gap-3">
          {SETUP_STEPS.map((s) => {
            const Icon = s.icon;
            return (
              <div
                key={s.step}
                className="flex gap-4 rounded-xl border bg-card p-4"
              >
                <div className="flex flex-col items-center gap-1 pt-0.5">
                  <div className="flex h-7 w-7 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground shrink-0">
                    {s.step}
                  </div>
                  {s.step < SETUP_STEPS.length && (
                    <div className="mt-1 h-full w-px bg-border" />
                  )}
                </div>
                <div className="flex flex-1 flex-col gap-1.5 pb-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <Icon size={15} className="text-muted-foreground" />
                    <span className="font-medium text-base">{s.title}</span>
                    <Badge
                      variant={s.required ? "default" : "outline"}
                      className="text-[10px]"
                    >
                      {s.required ? "Requerido" : "Opcional"}
                    </Badge>
                    <span className="ml-auto text-sm text-muted-foreground">
                      {s.nav}
                    </span>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {s.description}
                  </p>
                  {s.tip && (
                    <p className="mt-1 rounded-md border border-border/60 bg-muted/30 px-3 py-2 text-sm text-muted-foreground">
                      <span className="font-medium text-foreground">Tip: </span>
                      {s.tip}
                    </p>
                  )}
                  {s.substeps && <SubSteps steps={s.substeps} />}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <Separator />

      {/* Permissions */}
      <div>
        <div className="flex items-center gap-2 mb-1">
          <ShieldCheck size={16} className="text-blue-500" />
          <h3 className="text-lg font-semibold">
            Permisos necesarios en el token de Meta
          </h3>
        </div>
        <p className="mb-4 text-base text-muted-foreground">
          El token que configurás en cada número debe tener estos permisos
          activos. Podés verificarlos con el{" "}
          <a
            href="https://developers.facebook.com/tools/debug/accesstoken"
            target="_blank"
            rel="noreferrer"
            className="text-primary hover:underline inline-flex items-center gap-0.5"
          >
            Token Debugger de Meta <ExternalLink size={11} />
          </a>
          .
        </p>

        <div className="flex flex-col gap-3 mb-5">
          {PERMISSIONS.map((p) => (
            <div
              key={p.permission}
              className="rounded-xl border bg-card p-4 flex flex-col gap-2"
            >
              <div className="flex flex-wrap items-center gap-2">
                <code className="text-sm bg-muted px-2 py-0.5 rounded font-mono">
                  {p.permission}
                </code>
                <span
                  className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${p.levelColor}`}
                >
                  {p.level}
                </span>
              </div>
              <p className="text-sm text-muted-foreground">
                <span className="font-medium text-foreground">Permite: </span>
                {p.what}
              </p>
              <p className="text-xs text-amber-700 dark:text-amber-400 flex items-center justify-start gap-1.5">
                <AlertTriangle size={13} className="shrink-0 mt-0.5" />
                {p.without}
              </p>
            </div>
          ))}
        </div>

        {/* Token types */}
        <div className="rounded-xl border bg-card p-4 flex flex-col gap-3">
          <div className="flex items-center gap-2">
            <Key size={14} className="text-muted-foreground" />
            <span className="text-base font-semibold">Tipos de token</span>
          </div>
          <div className="grid gap-2 sm:grid-cols-3 text-sm">
            {[
              {
                type: "Token de usuario",
                dur: "1–2 horas",
                use: "Solo para pruebas en el Playground de Meta. No usar en producción.",
                warn: true,
              },
              {
                type: "Token de larga duración",
                dur: "60 días",
                use: "Para desarrollo. Requiere renovación manual o automatizada antes del vencimiento.",
                warn: true,
              },
              {
                type: "System User Token",
                dur: "No vence",
                use: "Generado desde Business Manager → Usuarios del sistema. Recomendado para producción.",
                warn: false,
              },
            ].map((t) => (
              <div
                key={t.type}
                className={`rounded-lg p-3 flex flex-col gap-1 border ${t.warn ? "border-amber-200 bg-amber-50 dark:bg-amber-900/10" : "border-emerald-200 bg-emerald-50 dark:bg-emerald-900/10"}`}
              >
                <span className="font-semibold">{t.type}</span>
                <span className="flex items-center gap-1 text-muted-foreground">
                  Duración: {t.dur}
                  {!t.warn && (
                    <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
                  )}
                </span>
                <span className="text-muted-foreground">{t.use}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <Separator />

      {/* How flows work */}
      <div>
        <h3 className="mb-1 text-lg font-semibold">
          Cómo funciona el motor de flows
        </h3>
        <p className="mb-4 text-base text-muted-foreground">
          Cada mensaje entrante pasa por este pipeline antes de llegar al
          cliente.
        </p>
        <div className="grid gap-3 sm:grid-cols-3">
          {[
            {
              icon: Zap,
              title: "1. Activación del flujo",
              desc: "Cuando el cliente escribe, el bot verifica si el mensaje coincide con la frase de activación o las palabras clave del flujo. Si hay una sesión activa y vigente, el mensaje se envía directamente al asistente de IA.",
              color: "text-amber-500",
            },
            {
              icon: Clock,
              title: "2. Envío con tiempos de espera",
              desc: "El primer mensaje se envía de inmediato. Los siguientes se programan con el tiempo de espera configurado en cada paso, para que el cliente los reciba de forma natural y escalonada.",
              color: "text-blue-500",
            },
            {
              icon: MessageSquare,
              title: "3. Respuestas con IA",
              desc: "Si el cliente escribe después de que el flujo terminó, el bot lo responde usando la IA configurada en tu cuenta. Si no configuraste una API key de IA, el bot no responde esos mensajes.",
              color: "text-emerald-500",
            },
          ].map((item) => {
            const Icon = item.icon;
            return (
              <div
                key={item.title}
                className="flex flex-col gap-2 rounded-xl border bg-card p-4"
              >
                <Icon size={20} className={item.color} />
                <p className="font-medium text-base">{item.title}</p>
                <p className="text-sm text-muted-foreground">{item.desc}</p>
              </div>
            );
          })}
        </div>
      </div>

      <Separator />

      {/* Receipt analysis */}
      <div>
        <div className="flex items-center gap-2 mb-1">
          <ImageIcon size={16} className="text-violet-500" />
          <h3 className="text-lg font-semibold">
            Pipeline de comprobantes de pago
          </h3>
        </div>
        <p className="mb-3 text-base text-muted-foreground">
          Cuando llega una imagen se ejecuta este pipeline automáticamente.
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          {[
            {
              title: "1. Descarga con META_TOKEN",
              desc: "Usa el token de la instancia para llamar a graph.facebook.com/v19.0/{mediaId} y descargar la imagen. Requiere whatsapp_business_messaging.",
            },
            {
              title: "2. Reconocimiento con IA",
              desc: "La imagen se analiza con IA (Gemini Vision) indicándole la divisa configurada en tu número. Extrae si es un comprobante válido, el monto, la divisa y la fecha.",
            },
            {
              title: "3. Verificación de fecha",
              desc: "Se valida que el comprobante tenga una fecha de las últimas 24 horas. Si la fecha no se puede leer, el pago queda en revisión manual para que vos lo verifiques.",
            },
            {
              title: "4. Registro del pago",
              desc: "Se guarda el pago con monto, divisa del número y estado: confirmado, en revisión manual o rechazado. También se le envía al cliente el mensaje de respuesta configurado.",
            },
          ].map((item) => (
            <div
              key={item.title}
              className="rounded-xl border bg-card p-3 flex flex-col gap-1.5"
            >
              <p className="text-sm font-semibold">{item.title}</p>
              <p className="text-sm text-muted-foreground">{item.desc}</p>
            </div>
          ))}
        </div>
      </div>

      <Separator />

      {/* Modules */}
      <div>
        <h3 className="mb-4 text-lg font-semibold">Referencia de secciones</h3>
        <div className="grid gap-4 md:grid-cols-2">
          {MODULES.map((mod) => {
            const Icon = mod.icon;
            return (
              <Card key={mod.nav}>
                <CardHeader className="pb-2">
                  <div className="flex items-center gap-2">
                    <Icon size={16} className="text-muted-foreground" />
                    <CardTitle className="text-base">{mod.name}</CardTitle>
                    <span className="ml-auto text-sm text-muted-foreground">
                      {mod.nav}
                    </span>
                  </div>
                </CardHeader>
                <CardContent className="flex flex-col gap-2">
                  <p className="text-sm font-medium text-foreground">
                    {mod.description}
                  </p>
                  <p className="text-sm text-muted-foreground">{mod.details}</p>
                  {mod.tip && (
                    <p className="rounded-md border border-border/60 bg-muted/30 px-3 py-2 text-sm text-muted-foreground">
                      <span className="font-medium text-foreground">Tip: </span>
                      {mod.tip}
                    </p>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>

      <Separator />

      {/* FAQ */}
      <div>
        <h3 className="mb-2 text-lg font-semibold">Preguntas frecuentes</h3>
        <Card>
          <CardContent className="pt-2 pb-0">
            {FAQS.map((faq, i) => (
              <FAQItem key={i} item={faq} />
            ))}
          </CardContent>
        </Card>
      </div>

      {/* Quick checklist */}
      <Card className="bg-muted/30">
        <CardHeader className="pb-2">
          <div className="flex items-center gap-2">
            <CheckCircle2 size={16} className="text-emerald-500" />
            <CardTitle className="text-base">
              Checklist de configuración completa
            </CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          <ol className="flex flex-col gap-1.5 text-base text-muted-foreground">
            {[
              "Token con permisos whatsapp_business_messaging + whatsapp_business_management (idealmente System User Token)",
              "Número registrado en Números de WhatsApp con Phone Number ID, token y WABA ID",
              "Webhook configurado en Meta con Callback URL y Verify Token — suscripto a messages y messaging_postbacks",
              "Flow creado con al menos un paso y trigger phrase definido",
              "Flow asignado al número en Números de WhatsApp",
              "Verificar conexión: status connected",
              "API key de IA configurada en Configuración si querés que el bot responda cuando el cliente escribe después de un flujo (opcional)",
              "ads_read en el token si querés enriquecimiento automático de datos de anuncios (opcional)",
            ].map((item, i) => (
              <li key={i} className="flex items-start gap-2">
                <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border text-[10px] font-bold">
                  {i + 1}
                </span>
                {item}
              </li>
            ))}
          </ol>
        </CardContent>
      </Card>

      {/* External links */}
      <div className="flex flex-wrap gap-2">
        {[
          {
            label: "Token Debugger",
            href: "https://developers.facebook.com/tools/debug/accesstoken",
          },
          {
            label: "WhatsApp Cloud API docs",
            href: "https://developers.facebook.com/docs/whatsapp/cloud-api",
          },
          { label: "Business Manager", href: "https://business.facebook.com" },
          {
            label: "Graph API Explorer",
            href: "https://developers.facebook.com/tools/explorer",
          },
          {
            label: "Permissions reference",
            href: "https://developers.facebook.com/docs/permissions",
          },
        ].map((link) => (
          <a
            key={link.href}
            href={link.href}
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-1 rounded-lg border bg-card px-3 py-1.5 text-sm text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
          >
            <ExternalLink size={11} />
            {link.label}
          </a>
        ))}
      </div>
    </div>
  );
}
