type Props = {
  state: string;
};

const colorMap: Record<string, string> = {
  flow_started: "badge badge-indigo",
  interesado: "badge badge-blue",
  listo_pagar: "badge badge-amber",
  necesita_agente: "badge badge-orange",
  confirmar_comprobante: "badge badge-purple",
  pago_confirmado: "badge badge-green",
};

const labelMap: Record<string, string> = {
  flow_started: "En flujo",
  interesado: "Interesado",
  listo_pagar: "Listo para pagar",
  necesita_agente: "Necesita agente",
  confirmar_comprobante: "En revisión",
  pago_confirmado: "Pago confirmado",
};

export function StatusBadge({ state }: Props) {
  const label = labelMap[state] ?? state;
  return <span className={colorMap[state] ?? "badge badge-gray"}>{label}</span>;
}
