type Props = {
  state: string;
};

const colorMap: Record<string, string> = {
  saludo: "badge badge-blue",
  catalogo: "badge badge-indigo",
  esperando_comprobante: "badge badge-amber",
  confirmar_comprobante: "badge badge-purple",
  pago_confirmado: "badge badge-green",
  comprobante_vencido: "badge badge-red",
  comprobante_rechazado: "badge badge-red",
  comprobante_ilegible: "badge badge-red",
  flow_started: "badge badge-indigo",
  ayuda: "badge badge-gray",
  interesado: "badge badge-purple",
};

const labelMap: Record<string, string> = {
  saludo: "Saludo",
  catalogo: "Catálogo",
  esperando_comprobante: "Esp. comprobante",
  confirmar_comprobante: "En revisión",
  pago_confirmado: "Pago confirmado",
  comprobante_vencido: "Vencido",
  comprobante_rechazado: "Rechazado",
  comprobante_ilegible: "Ilegible",
  flow_started: "En flujo",
  ayuda: "Ayuda",
  interesado: "Interesado",
};

export function StatusBadge({ state }: Props) {
  const label = labelMap[state] ?? state;
  return <span className={colorMap[state] ?? "badge badge-gray"}>{label}</span>;
}
