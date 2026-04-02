export function buildInviteEmail(opts: {
  orgName: string;
  role: string;
  inviterEmail: string | null;
  dashboardUrl: string;
}) {
  const roleLabel: Record<string, string> = {
    owner: "Propietario",
    admin: "Administrador",
    agent: "Agente",
    viewer: "Solo lectura",
  };

  const label = roleLabel[opts.role] ?? opts.role;
  const inviterLine = opts.inviterEmail
    ? `<strong>${opts.inviterEmail}</strong> te invitó a unirte`
    : "Te invitaron a unirte";

  return {
    subject: `Invitación a ${opts.orgName} en DSS Bot`,
    html: `<!DOCTYPE html>
<html lang="es">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:system-ui,-apple-system,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="padding:40px 16px;">
    <tr>
      <td align="center">
        <table width="100%" style="max-width:520px;background:#ffffff;border-radius:12px;border:1px solid #e4e4e7;overflow:hidden;">

          <!-- Header -->
          <tr>
            <td style="background:#000;padding:24px 32px;">
              <p style="margin:0;color:#fff;font-size:18px;font-weight:700;">⚡ DSS Bot</p>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="padding:32px;">
              <h1 style="margin:0 0 8px;font-size:22px;font-weight:700;color:#09090b;">
                Tienes una invitación
              </h1>
              <p style="margin:0 0 24px;font-size:15px;color:#52525b;line-height:1.6;">
                ${inviterLine} a <strong>${opts.orgName}</strong> como <strong>${label}</strong>.
              </p>

              <table cellpadding="0" cellspacing="0" style="margin:0 0 24px;">
                <tr>
                  <td style="background:#000;border-radius:8px;padding:12px 24px;">
                    <a href="${opts.dashboardUrl}"
                       style="color:#fff;text-decoration:none;font-size:15px;font-weight:600;display:inline-block;">
                      Aceptar invitación →
                    </a>
                  </td>
                </tr>
              </table>

              <p style="margin:0;font-size:13px;color:#a1a1aa;line-height:1.5;">
                Al hacer clic serás redirigido al panel de DSS Bot. Inicia sesión con la cuenta asociada a este correo para completar el proceso.<br><br>
                Si no esperabas esta invitación, puedes ignorar este mensaje.
              </p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding:16px 32px;border-top:1px solid #f4f4f5;">
              <p style="margin:0;font-size:12px;color:#a1a1aa;">DSS Bot · Panel de administración</p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`,
  };
}
