import { Construction } from "lucide-react";
import { Card } from "../../components/ui/Card";
import { LeagueShell } from "./LeagueShell";
import { tr } from "../../i18n";

export function ComingSoon({ title, screen, about }: { title: string; screen: string; about: string }) {
  return (
    <LeagueShell title={title}>
      <Card>
        <div className="flex items-start gap-3">
          <Construction className="size-5 text-warning shrink-0" aria-hidden />
          <div>
            <h2 className="font-semibold">{tr(`這個畫面還在建置中（${screen}）`, `This screen is coming soon (${screen})`)}</h2>
            <p className="mt-1 text-text-muted">{about}</p>
          </div>
        </div>
      </Card>
    </LeagueShell>
  );
}
