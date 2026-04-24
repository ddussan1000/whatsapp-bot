import { STAGE_COLORS, STAGE_LABELS } from "../lib/stages";

type Props = {
  state: string;
};

export function StatusBadge({ state }: Props) {
  const label = STAGE_LABELS[state as keyof typeof STAGE_LABELS] ?? state;
  const color =
    STAGE_COLORS[state as keyof typeof STAGE_COLORS] ?? "badge badge-gray";
  return <span className={color}>{label}</span>;
}
