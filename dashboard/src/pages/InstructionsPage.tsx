import { useState } from "react";
import {
  Workflow,
  Smartphone,
  MessagesSquare,
  BarChart3,
  Receipt,
  Link2,
  Building2,
  Library,
  LayoutDashboard,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Zap,
  Clock,
  MessageSquare,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";

// ── Setup steps ───────────────────────────────────────────────────────────

const SETUP_STEPS = [
  {
    step: 1,
    title: "Conectá tu número de WhatsApp",
    nav: "WhatsApp",
    icon: Smartphone,
    required: true,
    description:
      "En la sección WhatsApp del menú, registrá el número que usás con tus clientes. Para hacerlo necesitás los datos de conexión que tu proveedor o equipo técnico te entregó cuando configuraron tu cuenta de WhatsApp Business.",
    tip: "Si no sabés cuáles son esos datos, consultá con quien te ayudó a crear la cuenta de WhatsApp Business. Sin esto el bot no puede funcionar.",
  },
  {
    step: 2,
    title: "Armá tu primer flow",
    nav: "Flows o Plantillas",
    icon: Workflow,
    required: true,
    description:
      "Un flow es el guion que sigue el bot en cada conversación: qué dice, cuándo y en qué orden. Lo podés armar desde cero en Flows, o usar una de las plantillas ya preparadas que encontrás en Plantillas.",
    tip: "Si es tu primera vez, empezá por Plantillas. Elegí la que más se parezca a lo que necesitás, cambiá los textos por los tuyos y listo.",
  },
  {
    step: 3,
    title: "Activá el flow en tu número",
    nav: "WhatsApp",
    icon: Zap,
    required: true,
    description:
      "Volvé a la sección WhatsApp, entrá al número que registraste y elegí el flow que querés usar. A partir de ahí el bot empieza a responder automáticamente a tus clientes.",
    tip: "Cada número tiene un solo flow activo a la vez. Si querés probar con otro, solo cambiás la selección.",
  },
  {
    step: 4,
    title: "Sumá a tu equipo (opcional)",
    nav: "Equipo",
    icon: Building2,
    required: false,
    description:
      "Desde Equipo podés invitar a otras personas por correo. Vos elegís si van a poder hacer cambios o solo ver la información.",
  },
  {
    step: 5,
    title: "Conectá tus anuncios de WhatsApp (opcional)",
    nav: "CTWA Ads",
    icon: Link2,
    required: false,
    description:
      "Si tenés anuncios en Instagram o Facebook que abren un chat de WhatsApp, podés conectar cada anuncio con un flow distinto. Así el bot saluda diferente según de dónde viene el cliente.",
  },
];

// ── Module descriptions ───────────────────────────────────────────────────

type Module = {
  name: string;
  nav: string;
  icon: React.ElementType;
  description: string;
  details: string;
  tip?: string;
};

const MODULES: Module[] = [
  {
    name: "Resumen",
    nav: "Resumen",
    icon: LayoutDashboard,
    description: "Lo primero que ves al entrar: cuántas conversaciones hubo hoy, mensajes recibidos y si el bot está funcionando.",
    details:
      "No requiere ninguna configuración. Solo entrás y revisás. Si el bot tuvo actividad, lo vas a ver acá.",
  },
  {
    name: "Conversaciones",
    nav: "Conversaciones",
    icon: MessagesSquare,
    description: "Todos los chats que tuvieron tus clientes con el bot, en un solo lugar.",
    details:
      "Elegís una conversación de la lista y ves todo lo que se habló. Muy útil para revisar cómo está respondiendo el bot o para hacer un seguimiento puntual a mano.",
    tip: "Si no ves conversaciones, revisá que el número de WhatsApp tenga un flow activo asignado.",
  },
  {
    name: "Pagos",
    nav: "Pagos",
    icon: Receipt,
    description: "Los pagos que tus clientes enviaron como comprobante y el bot registró automáticamente.",
    details:
      "Podés ver el monto, la fecha y el detalle de cada pago. Sirve para llevar el control sin tener que revisar el celular.",
  },
  {
    name: "Reportes",
    nav: "Reportes",
    icon: BarChart3,
    description: "Gráficos de lo que pasó en un período: conversaciones, mensajes y tendencias.",
    details:
      "Elegís las fechas que querés ver y el panel te muestra cómo evolucionó la actividad. Útil para reuniones de equipo o para entender qué semanas fueron más activas.",
  },
  {
    name: "Flows",
    nav: "Flows",
    icon: Workflow,
    description: "Acá creás y editás los flows: el guion completo que sigue el bot en cada conversación.",
    details:
      "Cada flow tiene una palabra de activación (lo que escribe el cliente para iniciar la conversación), una serie de mensajes en orden, y tiempos de espera entre ellos. Podés usar texto, imágenes, documentos o videos. Cuando el flow está listo, lo asignás a tu número de WhatsApp.",
    tip: "Guardá el flow completo cuando esté listo. El botón de guardar está abajo y envía todo junto.",
  },
  {
    name: "Plantillas",
    nav: "Plantillas",
    icon: Library,
    description: "Flows ya armados para los casos más comunes: bienvenida, precios, soporte, post-venta y más.",
    details:
      "Elegís una, le das un vistazo y hacés click en 'Usar plantilla'. Se abre el editor con todo pre-cargado. Solo cambiás los textos por los tuyos y guardás.",
    tip: "Las plantillas son un punto de partida, no un molde fijo. Podés agregar, quitar o cambiar cualquier cosa antes de guardar.",
  },
  {
    name: "WhatsApp",
    nav: "WhatsApp",
    icon: Smartphone,
    description: "Tus números de WhatsApp Business conectados a la plataforma.",
    details:
      "Registrás cada número con los datos de conexión que te dieron al configurar tu cuenta. Desde la misma pantalla elegís qué flow va a usar ese número. Podés tener varios números y pausar los que no uses sin perder la configuración.",
    tip: "Si el bot deja de responder, lo más probable es que los datos de conexión del número hayan vencido. Consultá con quien te los dio.",
  },
  {
    name: "CTWA Ads",
    nav: "CTWA Ads",
    icon: Link2,
    description: "Conectá tus anuncios de Instagram o Facebook con flows distintos según el anuncio.",
    details:
      "Cuando alguien hace click en un anuncio que abre WhatsApp, podés hacer que el bot arranque con un flow específico para ese anuncio. Así cada campaña tiene su propia bienvenida.",
  },
  {
    name: "Equipo",
    nav: "Equipo",
    icon: Building2,
    description: "El nombre de tu negocio en el sistema y las personas que tienen acceso.",
    details:
      "Podés invitar a tu equipo por correo y elegir si van a poder hacer cambios o solo consultar. Cada persona entra con su propia cuenta.",
  },
];

// ── FAQ ───────────────────────────────────────────────────────────────────

type FAQ = { q: string; a: string };

const FAQS: FAQ[] = [
  {
    q: "¿El bot responde a cualquier hora?",
    a: "Sí. En cuanto el flow está activo en tu número, el bot responde solo a toda hora, todos los días, sin que tengas que hacer nada.",
  },
  {
    q: "¿Qué pasa si el cliente escribe algo diferente a lo que esperabas?",
    a: "Depende de cómo configuraste el flow. Si elegiste 'Disparar el flow igual', el bot arranca la conversación aunque el mensaje no coincida exactamente. Si elegiste 'No hacer nada', ese mensaje se ignora. Podés cambiarlo cuando quieras desde el editor del flow.",
  },
  {
    q: "¿Puedo tener flows distintos para un mismo número?",
    a: "Por ahora cada número tiene un solo flow activo a la vez. Si querés que distintos tipos de clientes reciban mensajes diferentes, podés conectar cada anuncio de WhatsApp con un flow distinto desde la sección CTWA Ads.",
  },
  {
    q: "¿Cuánto tarda el bot en responder?",
    a: "El primer mensaje llega en segundos. Los mensajes siguientes se envían después del tiempo de espera que vos configuraste en cada paso: pueden ser minutos, horas o incluso días.",
  },
  {
    q: "¿Qué puedo enviarle al cliente?",
    a: "Texto, imágenes, documentos (como PDF, Word o Excel) y video. Dentro de un mismo paso podés combinar varios tipos de mensaje, uno detrás del otro.",
  },
  {
    q: "¿Cómo sé si el bot está funcionando bien antes de usarlo con clientes?",
    a: "La forma más fácil es escribirte vos mismo al número desde tu celular. En unos segundos deberías recibir el primer mensaje del flow. Después podés revisar la conversación desde el panel para ver cómo quedó.",
  },
  {
    q: "¿El bot puede contestar preguntas que no están en el guion?",
    a: "Sí. Cuando el cliente manda algo que no está dentro del flow, el bot responde con inteligencia artificial usando las instrucciones que vos escribiste en el campo 'Prompt del bot' dentro del flow. Cuanto más claro sea ese texto, mejor responde.",
  },
];

// ── FAQ item ──────────────────────────────────────────────────────────────

function FAQItem({ item }: { item: FAQ }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border-b last:border-0">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-start justify-between gap-4 py-4 text-left"
      >
        <span className="text-sm font-medium">{item.q}</span>
        {open ? (
          <ChevronUp size={15} className="mt-0.5 shrink-0 text-muted-foreground" />
        ) : (
          <ChevronDown size={15} className="mt-0.5 shrink-0 text-muted-foreground" />
        )}
      </button>
      {open && (
        <p className="pb-4 text-sm text-muted-foreground">{item.a}</p>
      )}
    </div>
  );
}

// ── InstructionsPage ──────────────────────────────────────────────────────

export function InstructionsPage() {
  return (
    <div className="flex flex-col gap-8 p-6">
      {/* Header */}
      <div>
        <h2 className="text-2xl font-semibold tracking-tight">Guía de inicio</h2>
        <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
          Todo lo que necesitás para empezar a usar el bot y entender qué hace cada sección del panel.
        </p>
      </div>

      {/* Setup checklist */}
      <div>
        <h3 className="mb-4 text-base font-semibold">¿Por dónde empezar?</h3>
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
                <div className="flex flex-1 flex-col gap-1 pb-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <Icon size={15} className="text-muted-foreground" />
                    <span className="font-medium">{s.title}</span>
                    <Badge
                      variant={s.required ? "default" : "outline"}
                      className="text-[10px]"
                    >
                      {s.required ? "Requerido" : "Opcional"}
                    </Badge>
                    <span className="ml-auto text-xs text-muted-foreground">
                      Menú: {s.nav}
                    </span>
                  </div>
                  <p className="text-sm text-muted-foreground">{s.description}</p>
                  {s.tip && (
                    <p className="mt-1 rounded-md border border-border/60 bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
                      <span className="font-medium text-foreground">Tip: </span>
                      {s.tip}
                    </p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <Separator />

      {/* How a flow works */}
      <div>
        <h3 className="mb-1 text-base font-semibold">¿Cómo funciona un flow?</h3>
        <p className="mb-4 text-sm text-muted-foreground">
          Un flow es el guion que sigue el bot: qué dice, cuándo y en qué orden.
        </p>
        <div className="grid gap-3 sm:grid-cols-3">
          {[
            {
              icon: Zap,
              title: "1. Palabra de activación",
              desc: "El cliente manda su primer mensaje. Si contiene la palabra que vos configuraste, el bot arranca la conversación.",
              color: "text-amber-500",
            },
            {
              icon: Clock,
              title: "2. Mensajes en secuencia",
              desc: "El primer mensaje llega al instante. Los siguientes esperan el tiempo que vos definiste: minutos, horas o días.",
              color: "text-blue-500",
            },
            {
              icon: MessageSquare,
              title: "3. Respuestas libres",
              desc: "Si el cliente escribe algo fuera del guion, el bot responde de forma natural usando las instrucciones que vos le diste.",
              color: "text-emerald-500",
            },
          ].map((item) => {
            const Icon = item.icon;
            return (
              <div key={item.title} className="flex flex-col gap-2 rounded-xl border bg-card p-4">
                <Icon size={20} className={item.color} />
                <p className="font-medium text-sm">{item.title}</p>
                <p className="text-xs text-muted-foreground">{item.desc}</p>
              </div>
            );
          })}
        </div>
      </div>

      <Separator />

      {/* Modules reference */}
      <div>
        <h3 className="mb-4 text-base font-semibold">¿Para qué sirve cada sección?</h3>
        <div className="grid gap-4 md:grid-cols-2">
          {MODULES.map((mod) => {
            const Icon = mod.icon;
            return (
              <Card key={mod.nav}>
                <CardHeader className="pb-2">
                  <div className="flex items-center gap-2">
                    <Icon size={16} className="text-muted-foreground" />
                    <CardTitle className="text-sm">{mod.name}</CardTitle>
                    <span className="ml-auto text-xs text-muted-foreground">
                      {mod.nav}
                    </span>
                  </div>
                </CardHeader>
                <CardContent className="flex flex-col gap-2 text-sm">
                  <p className="font-medium text-foreground text-xs">{mod.description}</p>
                  <p className="text-xs text-muted-foreground">{mod.details}</p>
                  {mod.tip && (
                    <p className="rounded-md border border-border/60 bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
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
        <h3 className="mb-2 text-base font-semibold">Dudas comunes</h3>
        <Card>
          <CardContent className="pt-2 pb-0">
            {FAQS.map((faq, i) => (
              <FAQItem key={i} item={faq} />
            ))}
          </CardContent>
        </Card>
      </div>

      {/* Quick reference */}
      <Card className="bg-muted/30">
        <CardHeader className="pb-2">
          <div className="flex items-center gap-2">
            <CheckCircle2 size={16} className="text-emerald-500" />
            <CardTitle className="text-sm">Resumen rápido: qué hacer primero</CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          <ol className="flex flex-col gap-1.5 text-sm text-muted-foreground">
            {[
              "WhatsApp → registrá tu número con los datos de conexión que te dieron",
              "Plantillas o Flows → armá tu primer flow con los mensajes que va a mandar el bot",
              "WhatsApp → asigná el flow al número para activarlo",
              "Probá → escribite al número desde tu celular y chequeá que responda bien",
              "Equipo → invitá a quienes necesiten acceso (si aplica)",
              "CTWA Ads → conectá tus anuncios de WhatsApp si tenés campañas activas",
            ].map((item, i) => (
              <li key={i} className="flex items-start gap-2">
                <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border text-[10px] font-bold">
                  {i + 1}
                </span>
                {item}
              </li>
            ))}
          </ol>
        </CardContent>
      </Card>
    </div>
  );
}
