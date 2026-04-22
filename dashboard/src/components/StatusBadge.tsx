type Props = {
  state: string;
};

const colorMap: Record<string, string> = {
  // Stages actuales
  en_flujo: "badge badge-indigo",
  flujo_terminado: "badge badge-slate",
  pago_confirmado: "badge badge-green",
  revision_manual: "badge badge-purple",
  // Stages legacy (backward compat para registros existentes en DB)
  flow_started: "badge badge-indigo",
  confirmar_comprobante: "badge badge-purple",
  post_venta: "badge badge-slate",
  interesado: "badge badge-blue",
  esperando_comprobante: "badge badge-amber",
};

const labelMap: Record<string, string> = {
  // Stages actuales
  en_flujo: "En flujo",
  flujo_terminado: "Flujo terminado",
  pago_confirmado: "Pago confirmado",
  revision_manual: "Revisión manual",
  // Stages legacy
  flow_started: "En flujo",
  confirmar_comprobante: "Revisión manual",
  post_venta: "Flujo terminado",
  interesado: "Interesado",
  esperando_comprobante: "Esperando comprobante",
};

export function StatusBadge({ state }: Props) {
  const label = labelMap[state] ?? state;
  return <span className={colorMap[state] ?? "badge badge-gray"}>{label}</span>;
}
