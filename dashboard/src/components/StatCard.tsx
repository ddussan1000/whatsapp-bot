import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { Skeleton } from "./ui/skeleton";

type Props = {
  title: string;
  value: string;
  hint?: string;
  loading?: boolean;
};

export function StatCard({ title, value, hint, loading }: Props) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent>
        {loading ? (
          <Skeleton className="h-8 w-28" />
        ) : (
          <p className="card-value">{value}</p>
        )}
      </CardContent>
      {hint ? <p className="card-hint">{hint}</p> : null}
    </Card>
  );
}
