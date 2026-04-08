type Props = {
  state: string;
};

const colorMap: Record<string, string> = {
  flow_started: "badge badge-indigo",
  interesado: "badge badge-blue",
  esperando_comprobante: "badge badge-amber",
  confirmar_comprobante: "badge badge-purple",
  pago_confirmado: "badge badge-green",
  post_venta: "badge badge-orange",
};

const labelMap: Record<string, string> = {
  flow_started: "En flujo",
  interesado: "Interesado",
  esperando_comprobante: "Esperando comprobante",
  confirmar_comprobante: "Revisión manual",
  pago_confirmado: "Pago confirmado",
  post_venta: "Post venta",
};

export function StatusBadge({ state }: Props) {
  const label = labelMap[state] ?? state;
  return <span className={colorMap[state] ?? "badge badge-gray"}>{label}</span>;
}
