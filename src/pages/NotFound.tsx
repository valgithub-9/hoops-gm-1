import { Link } from "react-router-dom";
import { tr } from "../i18n";

export function NotFound({ what = tr("找不到這個頁面", "Page not found") }: { what?: string }) {
  return (
    <div className="min-h-dvh grid place-items-center p-4 text-center">
      <div className="space-y-3">
        <h1 className="font-display text-xl uppercase">{what}</h1>
        <p className="text-text-muted">{tr("可能已經被刪除，或網址打錯了。", "It may have been deleted, or the address is wrong.")}</p>
        <Link to="/" className="text-accent-text underline">{tr("回到首頁", "Back to home")}</Link>
      </div>
    </div>
  );
}
