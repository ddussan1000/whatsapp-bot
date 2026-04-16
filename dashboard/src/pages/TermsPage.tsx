import { Link } from "react-router-dom";
import { ArrowLeft, FileText } from "lucide-react";
import { ModeToggle } from "@/components/mode-toggle";

export function TermsPage() {
  return (
    <div className="min-h-svh bg-background flex flex-col">
      <header className="sticky top-0 z-20 border-b border-border/60 bg-background shadow-sm">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-6 py-4">
          <Link
            to="/login"
            className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft size={15} />
            Volver al inicio
          </Link>
          <ModeToggle />
        </div>
      </header>

      <main className="relative flex-1 mx-auto w-full max-w-3xl px-6 py-12">
        <div className="pointer-events-none absolute inset-0" aria-hidden>
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_80%_40%_at_50%_0%,hsl(var(--primary)/0.08),transparent)]" />
        </div>
        <div className="mb-10 flex flex-col gap-3">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <FileText size={20} />
            </div>
            <span className="text-sm font-medium text-muted-foreground">Legal</span>
          </div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground">
            Términos de Servicio
          </h1>
          <p className="text-muted-foreground">
            Al acceder y utilizar DSS Bot, la organización o usuario acepta estos
            términos en su totalidad. Si no estás de acuerdo, no utilices el
            servicio.
          </p>
          <p className="text-xs text-muted-foreground/60">
            Última actualización: abril de 2026
          </p>
        </div>

        <div className="space-y-8">
          <Section number="1" title="Descripción del servicio">
            <p className="mt-3 text-muted-foreground">
              DSS Bot es una plataforma SaaS que permite a empresas automatizar
              conversaciones en WhatsApp mediante flujos configurables, gestionar
              pagos, validar comprobantes con IA y visualizar reportes. El servicio
              se presta a través del dashboard en{" "}
              <span className="font-medium text-foreground">dssbot.site</span> y de
              la API del bot conectada a la API de WhatsApp Business de Meta.
            </p>
          </Section>

          <Section number="2" title="Requisitos de uso">
            <ul className="mt-3 space-y-2 text-muted-foreground">
              {[
                "Ser mayor de edad según la legislación del país donde operas.",
                "Contar con una cuenta de Google válida para autenticarse en el dashboard.",
                "Disponer de un número de WhatsApp Business aprobado por Meta para conectar instancias.",
                "Cumplir con las Políticas de uso de la plataforma de WhatsApp Business de Meta.",
              ].map((item) => (
                <li key={item} className="flex gap-2.5">
                  <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-primary/60" />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </Section>

          <Section number="3" title="Uso aceptable">
            <p className="mt-3 text-muted-foreground">
              El servicio está diseñado para usos comerciales legítimos. Queda
              expresamente prohibido:
            </p>
            <ul className="mt-3 space-y-2 text-muted-foreground">
              {[
                "Enviar mensajes masivos no solicitados (spam) o campañas sin consentimiento previo de los destinatarios.",
                "Automatizar contenido ilegal, engañoso, difamatorio, pornográfico o que incite al odio o la violencia.",
                "Suplantar la identidad de otras personas, empresas o instituciones.",
                "Intentar manipular o falsificar comprobantes de pago enviados al sistema.",
                "Usar el sistema para recopilar datos personales de terceros sin su consentimiento.",
                "Realizar ingeniería inversa, explotar vulnerabilidades o intentar acceder a datos de otras organizaciones.",
                "Incumplir las Políticas de WhatsApp Business, lo que puede resultar en la suspensión de tu número por parte de Meta.",
              ].map((item) => (
                <li key={item} className="flex gap-2.5">
                  <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-destructive/60" />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </Section>

          <Section number="4" title="Responsabilidades de la organización">
            <div className="mt-3 space-y-3 text-muted-foreground">
              <p>
                Cada organización es responsable de configurar sus flujos, mensajes y
                respuestas de forma acorde con la ley y los términos de Meta. DSS Bot
                actúa como herramienta tecnológica y no tiene control sobre el
                contenido que las organizaciones deciden enviar a través de la
                plataforma.
              </p>
              <p>
                La organización también es responsable de gestionar correctamente los
                datos personales de sus contactos de WhatsApp conforme a la normativa
                de privacidad vigente en su jurisdicción (RGPD, Ley Federal de
                Protección de Datos, etc.).
              </p>
            </div>
          </Section>

          <Section number="5" title="Inteligencia artificial">
            <div className="mt-3 space-y-3 text-muted-foreground">
              <p>
                DSS Bot utiliza inteligencia artificial en dos contextos distintos:
              </p>
              <div className="space-y-3">
                <div className="rounded-lg border border-border/30 bg-muted/20 px-4 py-3">
                  <p className="text-sm font-medium text-foreground">
                    OCR de comprobantes de pago
                  </p>
                  <p className="mt-1 text-sm">
                    Las imágenes de comprobantes enviadas por los contactos se procesan
                    con Gemini Vision (Google) para extraer datos como monto, fecha y
                    banco. Esta funcionalidad está activa para todas las organizaciones
                    y usa la infraestructura de DSS Bot.
                  </p>
                </div>
                <div className="rounded-lg border border-border/30 bg-muted/20 px-4 py-3">
                  <p className="text-sm font-medium text-foreground">
                    Respuestas conversacionales post-flujo
                  </p>
                  <p className="mt-1 text-sm">
                    Las organizaciones pueden activar respuestas con IA una vez que el
                    flujo concluye. Para ello deben configurar su propio proveedor (OpenAI,
                    Gemini, Anthropic o Groq) y su propia API key. DSS Bot no garantiza
                    la exactitud, veracidad ni adecuación de las respuestas generadas por
                    modelos de IA de terceros.
                  </p>
                </div>
              </div>
            </div>
          </Section>

          <Section number="6" title="Disponibilidad del servicio">
            <p className="mt-3 text-muted-foreground">
              DSS Bot se ofrece tal como está ("as-is"). No garantizamos
              disponibilidad ininterrumpida ni un tiempo de respuesta específico.
              Podemos realizar mantenimientos programados o aplicar actualizaciones en
              cualquier momento. No somos responsables por pérdidas derivadas de
              interrupciones del servicio, errores de terceros (Meta, Google, etc.) o
              caídas de infraestructura.
            </p>
          </Section>

          <Section number="7" title="Suspensión y cancelación">
            <div className="mt-3 space-y-3 text-muted-foreground">
              <p>
                DSS Bot se reserva el derecho de suspender o cancelar el acceso de
                cualquier organización o usuario que incumpla estos términos, sin
                previo aviso y sin derecho a reembolso.
              </p>
              <p>
                Las organizaciones pueden solicitar la cancelación de su cuenta
                escribiendo a{" "}
                <a
                  href="mailto:soporte@dssbot.site"
                  className="text-primary hover:underline"
                >
                  soporte@dssbot.site
                </a>
                . Tras la cancelación se eliminarán los datos conforme a nuestra
                política de retención.
              </p>
            </div>
          </Section>

          <Section number="8" title="Limitación de responsabilidad">
            <p className="mt-3 text-muted-foreground">
              DSS Bot no será responsable por daños directos, indirectos, incidentales
              o consecuentes derivados del uso o la imposibilidad de uso del servicio,
              incluyendo pérdida de datos, lucro cesante o daños a la reputación. La
              responsabilidad total de DSS Bot no excederá el importe abonado por la
              organización en los últimos 30 días.
            </p>
          </Section>

          <Section number="9" title="Modificaciones">
            <p className="mt-3 text-muted-foreground">
              Podemos modificar estos términos en cualquier momento. La versión
              actualizada se publicará en esta página con nueva fecha. El uso
              continuado del servicio tras la publicación implica la aceptación de los
              términos modificados.
            </p>
          </Section>

          <Section number="10" title="Contacto">
            <p className="mt-3 text-muted-foreground">
              Para consultas, reclamaciones o solicitudes relacionadas con estos
              términos, escríbenos a{" "}
              <a
                href="mailto:soporte@dssbot.site"
                className="text-primary hover:underline"
              >
                soporte@dssbot.site
              </a>
              .
            </p>
          </Section>
        </div>

        <div className="mt-12 flex items-center gap-4 rounded-xl border border-border/50 bg-muted/30 p-5">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary text-sm font-bold text-primary-foreground">
            D
          </div>
          <div>
            <p className="text-sm font-medium text-foreground">DSS Bot</p>
            <p className="text-xs text-muted-foreground">
              ¿Preguntas?{" "}
              <a
                href="mailto:soporte@dssbot.site"
                className="text-primary hover:underline"
              >
                soporte@dssbot.site
              </a>
            </p>
          </div>
          <div className="ml-auto">
            <Link to="/privacy" className="text-xs text-primary hover:underline">
              Ver Política de Privacidad →
            </Link>
          </div>
        </div>
      </main>

      <footer className="relative z-10 border-t border-border/40 py-6 text-center">
        <p className="text-xs text-muted-foreground/60">
          © {new Date().getFullYear()} DSS Bot · Todos los derechos reservados
        </p>
      </footer>
    </div>
  );
}

function Section({
  number,
  title,
  children,
}: {
  number: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-border/40 bg-card/50 p-6">
      <div className="flex items-center gap-3">
        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-primary/10 text-xs font-bold text-primary">
          {number}
        </span>
        <h2 className="text-base font-semibold text-foreground">{title}</h2>
      </div>
      {children}
    </div>
  );
}
