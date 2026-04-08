type Props = {
  state: string;
};

const colorMap: Record<string, string> = {
  flow_started: "badge badge-indigo",
  interesado: "badge badge-blue",
  esperando_comprobante: "badge badge-amber",
  confirmar_comprobante: "badge badge-purple",
  pago_confirmado: "badge badge-green",
  comprobante_rechazado: "badge badge-red",
  comprobante_ilegible: "badge badge-red",
  comprobante_vencido: "badge badge-red",
  post_venta: "badge badge-orange",
};

const labelMap: Record<string, string> = {
  flow_started: "En flujo",
  interesado: "Interesado",
  esperando_comprobante: "Esperando comprobante",
  confirmar_comprobante: "En revisión",
  pago_confirmado: "Pago confirmado",
  comprobante_rechazado: "Rechazado",
  comprobante_ilegible: "Ilegible",
  comprobante_vencido: "Vencido",
  post_venta: "Post venta",
};

export function StatusBadge({ state }: Props) {
  const label = labelMap[state] ?? state;
  return <span className={colorMap[state] ?? "badge badge-gray"}>{label}</span>;
}
