import { useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  MessageSquare,
  Image as ImageIcon,
  FileText,
  Clock,
  ShoppingCart,
  HeadphonesIcon,
  Megaphone,
  Star,
  Users,
  Zap,
  ChevronDown,
  ChevronUp,
  ArrowRight,
  Plus,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";

// ── Draft types (same as FlowsPage, kept local) ──────────────────────────

type MsgType = "text" | "image" | "document" | "video";

type TemplateMsgDraft = {
  position: number;
  messageType: MsgType;
  textContent?: string | null;
  mediaUrl?: string | null;
  filename?: string | null;
  caption?: string | null;
};

type TemplateStepDraft = {
  position: number;
  delaySeconds: number;
  label?: string;
  messages: TemplateMsgDraft[];
};

type FlowTemplateDraft = {
  name: string;
  triggerPhrase: string;
  keywords: string[];
  noMatchBehavior: "trigger" | "ignore";
  systemPrompt?: string | null;
  isActive: boolean;
  steps: TemplateStepDraft[];
};

// ── Template definitions ──────────────────────────────────────────────────

type FlowTemplate = {
  id: string;
  name: string;
  description: string;
  category: string;
  icon: React.ElementType;
  color: string;
  draft: FlowTemplateDraft;
};

const MSG_ICONS: Record<MsgType, React.ElementType> = {
  text: MessageSquare,
  image: ImageIcon,
  document: FileText,
  video: Megaphone,
};

const TEMPLATES: FlowTemplate[] = [
  {
    id: "bienvenida-captacion",
    name: "Bienvenida y captación",
    description:
      "Saluda al cliente, presenta tu oferta y hace seguimiento 24h después si no hubo respuesta.",
    category: "Ventas",
    icon: Star,
    color: "text-amber-500",
    draft: {
      name: "Bienvenida y captación",
      triggerPhrase: "Hola, quiero información",
      keywords: ["hola", "info", "información", "buenas"],
      noMatchBehavior: "trigger",
      systemPrompt:
        "Eres un asistente de ventas amable. Responde preguntas sobre el producto de forma clara y concisa. Si el cliente quiere comprar, pídele sus datos de contacto.",
      isActive: true,
      steps: [
        {
          position: 0,
          delaySeconds: 0,
          label: "Bienvenida",
          messages: [
            {
              position: 0,
              messageType: "text",
              textContent:
                "👋 ¡Hola! Gracias por contactarnos.\n\nSoy el asistente virtual de [tu empresa]. Estoy aquí para ayudarte con cualquier consulta sobre nuestros productos y servicios.",
            },
            {
              position: 1,
              messageType: "text",
              textContent:
                "¿En qué te puedo ayudar hoy? Puedes preguntarme sobre:\n• Precios y disponibilidad\n• Características del producto\n• Proceso de compra\n• Tiempo de entrega",
            },
          ],
        },
        {
          position: 1,
          delaySeconds: 300,
          label: "Seguimiento rápido",
          messages: [
            {
              position: 0,
              messageType: "text",
              textContent:
                "¿Pudiste ver la información? Si tenés alguna duda o querés avanzar con tu pedido, estoy aquí para ayudarte. 😊",
            },
          ],
        },
        {
          position: 2,
          delaySeconds: 86400,
          label: "Seguimiento 24h",
          messages: [
            {
              position: 0,
              messageType: "text",
              textContent:
                "¡Hola de nuevo! Queríamos saber si pudiste revisar nuestra propuesta.\n\nSi tenés preguntas o querés conocer más opciones, con gusto te ayudamos. ¿Hablamos?",
            },
          ],
        },
      ],
    },
  },
  {
    id: "consulta-precios",
    name: "Consulta de precios",
    description:
      "Responde de forma inmediata a consultas de precio con tu lista o catálogo, y ofrece asesoría personalizada.",
    category: "Ventas",
    icon: ShoppingCart,
    color: "text-emerald-500",
    draft: {
      name: "Consulta de precios",
      triggerPhrase: "precio",
      keywords: ["precio", "costo", "cuánto", "cuanto", "cotización", "cotizacion", "vale", "valor"],
      noMatchBehavior: "trigger",
      systemPrompt:
        "Eres un asesor de ventas especializado en precios. Proporciona información clara sobre los precios disponibles y ofrece alternativas según el presupuesto del cliente.",
      isActive: true,
      steps: [
        {
          position: 0,
          delaySeconds: 0,
          label: "Lista de precios",
          messages: [
            {
              position: 0,
              messageType: "text",
              textContent:
                "¡Hola! Con gusto te cuento sobre nuestros precios 💰\n\nAquí te comparto nuestras opciones:\n\n📦 *Plan Básico*: $XXX\n📦 *Plan Estándar*: $XXX\n📦 *Plan Premium*: $XXX\n\n_(Reemplaza con tus precios reales)_",
            },
          ],
        },
        {
          position: 1,
          delaySeconds: 60,
          label: "Oferta de asesoría",
          messages: [
            {
              position: 0,
              messageType: "text",
              textContent:
                "¿Te gustaría que te ayude a elegir la opción que mejor se adapta a lo que necesitás? Cuéntame un poco más sobre tu caso y te doy una recomendación personalizada. 🎯",
            },
          ],
        },
      ],
    },
  },
  {
    id: "soporte-tecnico",
    name: "Soporte técnico",
    description:
      "Recibe consultas de soporte, pide detalles del problema y ofrece una resolución guiada.",
    category: "Soporte",
    icon: HeadphonesIcon,
    color: "text-blue-500",
    draft: {
      name: "Soporte técnico",
      triggerPhrase: "ayuda",
      keywords: ["ayuda", "problema", "error", "falla", "no funciona", "soporte", "help"],
      noMatchBehavior: "trigger",
      systemPrompt:
        "Eres un agente de soporte técnico. Escucha el problema del cliente, pide información específica si la necesitas (modelo, versión, síntomas) y proporciona pasos claros para resolver el inconveniente.",
      isActive: true,
      steps: [
        {
          position: 0,
          delaySeconds: 0,
          label: "Recepción de ticket",
          messages: [
            {
              position: 0,
              messageType: "text",
              textContent:
                "¡Hola! Soy el asistente de soporte de [empresa]. Voy a ayudarte a resolver tu consulta 🔧\n\nPara poder asistirte mejor, ¿podés contarme con más detalle qué está pasando?\n\n• ¿Qué producto o servicio te está dando problemas?\n• ¿Cuándo empezó el inconveniente?\n• ¿Hay algún mensaje de error que veas?",
            },
          ],
        },
        {
          position: 1,
          delaySeconds: 180,
          label: "Check de resolución",
          messages: [
            {
              position: 0,
              messageType: "text",
              textContent:
                "¿Pudiste avanzar con la solución? Si seguís teniendo problemas o necesitás asistencia adicional, no dudes en contarme. Estoy aquí para ayudarte. 💪",
            },
          ],
        },
      ],
    },
  },
  {
    id: "seguimiento-post-venta",
    name: "Seguimiento post-venta",
    description:
      "Confirma la recepción del pago o compra, da instrucciones de siguiente paso y pide feedback.",
    category: "Ventas",
    icon: Users,
    color: "text-violet-500",
    draft: {
      name: "Seguimiento post-venta",
      triggerPhrase: "compré",
      keywords: ["compré", "compre", "pagué", "pague", "pedido", "compra", "pago"],
      noMatchBehavior: "ignore",
      systemPrompt:
        "Eres un asistente post-venta. Tu objetivo es asegurar que el cliente tenga todo lo que necesita después de su compra y recoger su experiencia.",
      isActive: true,
      steps: [
        {
          position: 0,
          delaySeconds: 0,
          label: "Confirmación",
          messages: [
            {
              position: 0,
              messageType: "text",
              textContent:
                "¡Muchas gracias por tu compra! 🎉\n\nTu pedido fue recibido correctamente. En breve recibirás la confirmación con todos los detalles.\n\n¿Hay algo más en lo que te pueda ayudar?",
            },
          ],
        },
        {
          position: 1,
          delaySeconds: 86400,
          label: "Seguimiento entrega",
          messages: [
            {
              position: 0,
              messageType: "text",
              textContent:
                "¡Hola! ¿Cómo va todo con tu pedido? Queríamos asegurarnos de que recibiste todo correctamente y que estás satisfecho con tu compra. 😊",
            },
          ],
        },
        {
          position: 2,
          delaySeconds: 259200,
          label: "Pedido de feedback (3 días)",
          messages: [
            {
              position: 0,
              messageType: "text",
              textContent:
                "¡Esperamos que estés disfrutando tu compra! 🌟\n\nNos encantaría saber tu experiencia. ¿Podés contarnos cómo te fue? Tu opinión nos ayuda mucho a mejorar.",
            },
          ],
        },
      ],
    },
  },
  {
    id: "campana-ctwa",
    name: "Campaña desde anuncio",
    description:
      "Flujo optimizado para usuarios que llegan desde un anuncio de Meta. Oferta directa + CTA.",
    category: "Marketing",
    icon: Megaphone,
    color: "text-rose-500",
    draft: {
      name: "Campaña desde anuncio",
      triggerPhrase: "quiero saber más",
      keywords: ["anuncio", "oferta", "promoción", "promocion", "descuento"],
      noMatchBehavior: "trigger",
      systemPrompt:
        "Eres un asistente de ventas enfocado en convertir leads de anuncios. Sé directo, presenta la oferta claramente y facilita el siguiente paso de compra.",
      isActive: true,
      steps: [
        {
          position: 0,
          delaySeconds: 0,
          label: "Oferta principal",
          messages: [
            {
              position: 0,
              messageType: "text",
              textContent:
                "¡Hola! Vi que te interesó nuestra oferta 🎯\n\n*[Nombre del producto/servicio]*\n✅ [Beneficio 1]\n✅ [Beneficio 2]\n✅ [Beneficio 3]\n\n💥 *Precio especial: $XXX* (oferta válida por tiempo limitado)",
            },
          ],
        },
        {
          position: 1,
          delaySeconds: 120,
          label: "Call to action",
          messages: [
            {
              position: 0,
              messageType: "text",
              textContent:
                "¿Te interesa aprovechar esta oferta? Puedo asesorarte en el proceso de compra ahora mismo. Solo dime «quiero» y te explico cómo continuar. 🚀",
            },
          ],
        },
      ],
    },
  },
  {
    id: "agenda-cita",
    name: "Agendamiento de cita",
    description:
      "Recoge datos básicos del cliente para agendar una reunión o cita presencial/virtual.",
    category: "Servicios",
    icon: Clock,
    color: "text-cyan-500",
    draft: {
      name: "Agendamiento de cita",
      triggerPhrase: "cita",
      keywords: ["cita", "reunión", "reunion", "agendar", "turno", "appointment", "reserva"],
      noMatchBehavior: "trigger",
      systemPrompt:
        "Eres un asistente de agendamiento. Recoge el nombre del cliente, la fecha y hora preferida, y confirma la disponibilidad. Sé claro con las instrucciones.",
      isActive: true,
      steps: [
        {
          position: 0,
          delaySeconds: 0,
          label: "Solicitud de datos",
          messages: [
            {
              position: 0,
              messageType: "text",
              textContent:
                "¡Hola! Con gusto te ayudo a agendar tu cita 📅\n\nPara coordinar, necesito algunos datos:\n\n1️⃣ Tu nombre completo\n2️⃣ ¿Qué servicio necesitás?\n3️⃣ ¿Qué días y horarios te vendrían bien?\n\nCuéntame y te confirmo disponibilidad.",
            },
          ],
        },
        {
          position: 1,
          delaySeconds: 3600,
          label: "Confirmación de cita",
          messages: [
            {
              position: 0,
              messageType: "text",
              textContent:
                "¡Perfecto! Tu cita está en proceso de confirmación. En breve te enviamos los detalles finales. Si necesitás cambiar algo, avisanos con anticipación. ✅",
            },
          ],
        },
      ],
    },
  },
];

const CATEGORIES = ["Todos", ...Array.from(new Set(TEMPLATES.map((t) => t.category)))];

// ── Step preview ──────────────────────────────────────────────────────────

function delayLabel(seconds: number): string {
  if (seconds === 0) return "Inmediato";
  if (seconds >= 86400) return `${Math.round(seconds / 86400)}d`;
  if (seconds >= 3600) return `${Math.round(seconds / 3600)}h`;
  if (seconds >= 60) return `${Math.round(seconds / 60)}min`;
  return `${seconds}s`;
}

function StepPreview({ steps }: { steps: TemplateStepDraft[] }) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {steps.map((step, i) => (
        <div key={i} className="flex items-center gap-1.5">
          {i > 0 && (
            <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
              <Clock size={9} />
              {delayLabel(step.delaySeconds)}
            </span>
          )}
          <span className="flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium">
            <span className="text-muted-foreground">P{i + 1}</span>
            {step.messages.map((m, j) => {
              const Icon = MSG_ICONS[m.messageType];
              return <Icon key={j} size={10} className="text-muted-foreground" />;
            })}
          </span>
        </div>
      ))}
    </div>
  );
}

// ── Template card ─────────────────────────────────────────────────────────

function TemplateCard({
  template,
  onUse,
}: {
  template: FlowTemplate;
  onUse: (t: FlowTemplate) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const Icon = template.icon;

  return (
    <Card className="flex flex-col overflow-hidden transition-shadow hover:shadow-md">
      <CardHeader className="pb-3">
        <div className="flex items-start gap-3">
          <div className={`mt-0.5 rounded-lg bg-muted p-2 ${template.color}`}>
            <Icon size={18} />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-2">
              <h3 className="font-semibold leading-tight">{template.name}</h3>
              <Badge variant="outline" className="shrink-0 text-[10px]">
                {template.category}
              </Badge>
            </div>
            <p className="mt-1 text-xs text-muted-foreground line-clamp-2">
              {template.description}
            </p>
          </div>
        </div>
      </CardHeader>

      <CardContent className="flex flex-1 flex-col gap-3 pt-0">
        {/* Step preview */}
        <StepPreview steps={template.draft.steps} />

        {/* Trigger info */}
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Zap size={11} className="text-muted-foreground" />
          <span>
            Trigger:{" "}
            <span className="font-mono text-foreground">
              "{template.draft.triggerPhrase}"
            </span>
          </span>
        </div>

        {/* Expand steps detail */}
        <button
          type="button"
          onClick={() => setExpanded((o) => !o)}
          className="flex items-center gap-1 self-start text-xs text-muted-foreground hover:text-foreground"
        >
          {expanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
          {expanded ? "Ocultar pasos" : `Ver ${template.draft.steps.length} pasos`}
        </button>

        {expanded && (
          <div className="flex flex-col gap-2 rounded-lg bg-muted/40 p-3">
            {template.draft.steps.map((step, i) => (
              <div key={i} className="flex flex-col gap-1">
                {i > 0 && (
                  <div className="flex items-center gap-1.5 py-0.5 text-xs text-muted-foreground">
                    <Clock size={10} />
                    Espera: {delayLabel(step.delaySeconds)}
                  </div>
                )}
                <div className="flex items-start gap-2">
                  <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary text-[10px] font-bold text-primary-foreground">
                    {i + 1}
                  </span>
                  <div className="flex flex-col gap-1">
                    {step.label && (
                      <span className="text-xs font-medium">{step.label}</span>
                    )}
                    {step.messages.map((m, j) => {
                      const MIcon = MSG_ICONS[m.messageType];
                      return (
                        <div key={j} className="flex items-start gap-1.5">
                          <MIcon size={11} className="mt-0.5 shrink-0 text-muted-foreground" />
                          <p className="text-xs text-muted-foreground line-clamp-2">
                            {m.textContent || `[${m.messageType}]`}
                          </p>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Action */}
        <div className="mt-auto pt-2">
          <Button
            size="sm"
            className="w-full gap-2"
            onClick={() => onUse(template)}
          >
            Usar plantilla
            <ArrowRight size={14} />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

// ── TemplatesPage ─────────────────────────────────────────────────────────

export function TemplatesPage() {
  const navigate = useNavigate();
  const [activeCategory, setActiveCategory] = useState("Todos");

  const filtered =
    activeCategory === "Todos"
      ? TEMPLATES
      : TEMPLATES.filter((t) => t.category === activeCategory);

  const useTemplate = (template: FlowTemplate) => {
    // Store the draft in localStorage so FlowsPage picks it up
    localStorage.setItem("flow_new_draft", JSON.stringify(template.draft));
    // Dispatch event in case FlowsPage is already mounted
    window.dispatchEvent(new Event("flow_template_loaded"));
    navigate("/flows");
  };

  const startBlank = () => {
    navigate("/flows");
  };

  return (
    <div className="flex flex-col gap-6 p-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight">Plantillas</h2>
          <p className="mt-1 max-w-xl text-sm text-muted-foreground">
            Elegí una plantilla y el editor se abre con todo listo. Solo
            cambiás los textos por los tuyos y guardás.
          </p>
        </div>
        <Button variant="outline" size="sm" className="shrink-0 gap-2" onClick={startBlank}>
          <Plus size={14} />
          Flow en blanco
        </Button>
      </div>

      <Separator />

      {/* Category filter */}
      <div className="flex flex-wrap gap-2">
        {CATEGORIES.map((cat) => (
          <button
            key={cat}
            type="button"
            onClick={() => setActiveCategory(cat)}
            className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
              activeCategory === cat
                ? "border-primary bg-primary/10 text-primary"
                : "border-border text-muted-foreground hover:bg-muted"
            }`}
          >
            {cat}
          </button>
        ))}
      </div>

      {/* Templates grid */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {filtered.map((template) => (
          <TemplateCard key={template.id} template={template} onUse={useTemplate} />
        ))}
      </div>
    </div>
  );
}
