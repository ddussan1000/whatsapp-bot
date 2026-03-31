import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";

type Props = {
  title: string;
  value: string;
  hint?: string;
};

export function StatCard({ title, value, hint }: Props) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <p className="card-value">{value}</p>
      </CardContent>
      {hint ? <p className="card-hint">{hint}</p> : null}
    </Card>
  );
}
