import { Card, CardContent } from "@/components/ui/card";
import { LucideIcon } from "lucide-react";

interface StatsCardProps {
  icon: LucideIcon;
  label: string;
  value: string | number;
}

export default function StatsCard({ icon: Icon, label, value }: StatsCardProps) {
  return (
    <Card data-testid={`card-stats-${label.toLowerCase().replace(/\s+/g, '-')}`}>
      <CardContent className="p-6">
        <div className="flex items-center gap-4">
          <div className="p-3 rounded-md bg-primary/10">
            <Icon className="w-6 h-6 text-primary" />
          </div>
          <div>
            <p className="text-sm text-muted-foreground">{label}</p>
            <p className="text-2xl font-bold" data-testid={`text-stats-value-${label.toLowerCase().replace(/\s+/g, '-')}`}>
              {value}
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
