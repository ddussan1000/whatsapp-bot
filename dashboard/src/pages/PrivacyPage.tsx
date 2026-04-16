import { Link } from "react-router-dom";
import { ArrowLeft, Shield } from "lucide-react";
import { ModeToggle } from "@/components/mode-toggle";

export function PrivacyPage() {
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
              <Shield size={20} />
            </div>
            <span className="text-sm font-medium text-muted-foreground">Legal</span>
          </div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground">
            Política de Privacidad
          </h1>
          <p className="text-muted-foreground">
            En DSS Bot nos tomamos en serio la privacidad de quienes usan nuestra
            plataforma. Esta política explica qué información recopilamos, cómo la
            usamos y cómo la protegemos cuando utilizas nuestro servicio de
            automatización de WhatsApp.
          </p>
          <p className="text-xs text-muted-foreground/60">
            Última actualización: abril de 2026
          </p>
        </div>

        <div className="space-y-8">
          <Section number="1" title="Qué es DSS Bot">
            <p className="mt-3 text-muted-foreground">
              DSS Bot es una plataforma B2B de automatización de WhatsApp. Permite a
              empresas (organizaciones) crear flujos conversacionales, gestionar
              conversaciones con sus clientes, validar comprobantes de pago mediante
              inteligencia artificial y visualizar reportes de actividad. El acceso se
              gestiona desde un dashboard web en{" "}
              <span className="font-medium text-foreground">dssbot.site</span>.
            </p>
          </Section>

          <Section number="2" title="Información que recopilamos">
            <p className="mt-3 text-muted-foreground">
              Recopilamos dos tipos de información:
            </p>
            <p className="mt-4 text-sm font-medium text-foreground">
              Información de usuarios del dashboard (administradores y agentes):
            </p>
            <ul className="mt-2 space-y-2 text-muted-foreground">
              {[
                "Nombre y correo electrónico obtenidos mediante autenticación con Google (OAuth 2.0).",
                "Foto de perfil de Google (solo para visualización en el dashboard).",
                "Rol dentro de la organización (owner, admin, agente o viewer).",
              ].map((item) => (
                <li key={item} className="flex gap-2.5">
                  <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-primary/60" />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
            <p className="mt-4 text-sm font-medium text-foreground">
              Información procesada en nombre de la organización (conversaciones de WhatsApp):
            </p>
            <ul className="mt-2 space-y-2 text-muted-foreground">
              {[
                "Número de teléfono de los contactos finales.",
                "Contenido de los mensajes: texto, imágenes, audios y documentos.",
                "Comprobantes de pago enviados por los contactos (imágenes).",
                "Metadatos de mensajes: fecha, hora, estado de entrega.",
                "Origen del contacto si proviene de un anuncio de WhatsApp (CTWA): nombre de campaña, anuncio y conjunto de anuncios.",
                "Estado de la conversación en el flujo (etapa actual).",
              ].map((item) => (
                <li key={item} className="flex gap-2.5">
                  <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-primary/60" />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </Section>

          <Section number="3" title="Cómo usamos la información">
            <ul className="mt-3 space-y-2 text-muted-foreground">
              {[
                "Operar los flujos conversacionales automatizados de cada organización.",
                "Validar comprobantes de pago mediante OCR con inteligencia artificial (Gemini Vision).",
                "Mostrar conversaciones, pagos y reportes en el dashboard.",
                "Enviar notificaciones por correo electrónico (por ejemplo, invitaciones a la organización).",
                "Mantener el estado de la sesión de conversación de forma temporal en caché.",
                "Detectar y prevenir mensajes duplicados del webhook de WhatsApp.",
              ].map((item) => (
                <li key={item} className="flex gap-2.5">
                  <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-primary/60" />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </Section>

          <Section number="4" title="Almacenamiento y retención de datos">
            <div className="mt-3 space-y-3 text-muted-foreground">
              <p>
                Los datos se almacenan en servidores seguros de{" "}
                <span className="font-medium text-foreground">Supabase</span>{" "}
                (PostgreSQL). Los comprobantes de pago se almacenan temporalmente y
                se eliminan de forma automática a los{" "}
                <span className="font-medium text-foreground">7 días</span> de su
                recepción.
              </p>
              <p>
                El estado de las conversaciones activas se guarda en caché temporal
                (Redis) con una vigencia máxima de{" "}
                <span className="font-medium text-foreground">72 horas</span>. Una
                vez que la sesión expira, el estado se elimina automáticamente.
              </p>
            </div>
          </Section>

          <Section number="5" title="Servicios de terceros">
            <p className="mt-3 text-muted-foreground">
              Para operar el servicio utilizamos los siguientes proveedores:
            </p>
            <div className="mt-3 space-y-3">
              {[
                {
                  name: "Meta (WhatsApp Business API)",
                  desc: "Envío y recepción de mensajes de WhatsApp. Los mensajes pasan por la infraestructura de Meta conforme a sus propios términos.",
                },
                {
                  name: "Google (OAuth 2.0)",
                  desc: "Autenticación segura de los usuarios del dashboard. No almacenamos contraseñas.",
                },
                {
                  name: "Google Gemini",
                  desc: "Reconocimiento óptico de caracteres (OCR) en comprobantes de pago enviados por los contactos.",
                },
                {
                  name: "Supabase",
                  desc: "Base de datos PostgreSQL, autenticación y almacenamiento de archivos.",
                },
                {
                  name: "Upstash Redis",
                  desc: "Caché temporal para el estado de conversaciones activas.",
                },
                {
                  name: "Resend",
                  desc: "Envío de correos transaccionales (invitaciones y notificaciones).",
                },
                {
                  name: "Railway / Vercel",
                  desc: "Infraestructura de despliegue del backend y el dashboard.",
                },
              ].map(({ name, desc }) => (
                <div
                  key={name}
                  className="rounded-lg border border-border/30 bg-muted/20 px-4 py-3"
                >
                  <p className="text-sm font-medium text-foreground">{name}</p>
                  <p className="mt-0.5 text-sm text-muted-foreground">{desc}</p>
                </div>
              ))}
            </div>
            <p className="mt-4 text-sm text-muted-foreground">
              Algunas organizaciones pueden configurar su propio proveedor de IA
              (OpenAI, Anthropic, Groq, Gemini) para respuestas conversacionales
              post-flujo. En ese caso, los mensajes de los contactos se envían al
              proveedor elegido por la organización usando su propia API key. DSS Bot
              no almacena ni accede a dichas claves en texto plano; se guardan
              cifradas con AES-256-GCM.
            </p>
          </Section>

          <Section number="6" title="Seguridad">
            <ul className="mt-3 space-y-2 text-muted-foreground">
              {[
                "Todas las comunicaciones usan HTTPS/TLS.",
                "La autenticación del dashboard se basa en tokens JWT firmados por Supabase Auth.",
                "Las API keys de IA de cada organización se almacenan cifradas (AES-256-GCM).",
                "El acceso a datos está restringido por políticas de seguridad a nivel de fila (RLS) en la base de datos.",
                "La firma de cada webhook entrante de Meta se verifica criptográficamente.",
              ].map((item) => (
                <li key={item} className="flex gap-2.5">
                  <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-primary/60" />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </Section>

          <Section number="7" title="Tus derechos">
            <p className="mt-3 text-muted-foreground">
              Como usuario del dashboard puedes solicitar el acceso, rectificación o
              eliminación de tu información personal escribiéndonos a{" "}
              <a
                href="mailto:soporte@dssbot.site"
                className="text-primary hover:underline"
              >
                soporte@dssbot.site
              </a>
              . Las organizaciones son responsables de gestionar los datos de sus
              propios contactos de WhatsApp conforme a la legislación aplicable en su
              país.
            </p>
          </Section>

          <Section number="8" title="Cambios en esta política">
            <p className="mt-3 text-muted-foreground">
              Podemos actualizar esta política cuando sea necesario. Publicaremos la
              versión actualizada en esta misma página con la fecha de revisión. El
              uso continuado del servicio tras una actualización implica la aceptación
              de los cambios.
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
              ¿Preguntas sobre privacidad?{" "}
              <a
                href="mailto:soporte@dssbot.site"
                className="text-primary hover:underline"
              >
                soporte@dssbot.site
              </a>
            </p>
          </div>
          <div className="ml-auto">
            <Link to="/terms" className="text-xs text-primary hover:underline">
              Ver Términos de Servicio →
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
