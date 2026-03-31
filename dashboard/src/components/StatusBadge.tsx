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
  ayuda: "badge badge-gray",
  interesado: "badge badge-purple",
};

export function StatusBadge({ state }: Props) {
  return <span className={colorMap[state] ?? "badge badge-gray"}>{state}</span>;
}
