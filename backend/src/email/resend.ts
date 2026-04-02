import { Resend } from "resend";
import { env } from "../config/env";

const client = env.RESEND_API_KEY ? new Resend(env.RESEND_API_KEY) : null;

export async function sendEmail(params: {
  to: string;
  subject: string;
  html: string;
  from?: string;
}): Promise<void> {
  if (!client) {
    console.warn("[email] RESEND_API_KEY no configurado — email no enviado");
    return;
  }

  const from = params.from ?? env.RESEND_FROM_EMAIL;
  const { error } = await client.emails.send({
    from,
    to: [params.to],
    subject: params.subject,
    html: params.html,
  });

  if (error) {
    console.error("[email] Error al enviar email:", error);
  }
}
