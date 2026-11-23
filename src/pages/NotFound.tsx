import { Link } from "react-router-dom";

export function NotFound({ what = "找不到這個頁面" }: { what?: string }) {
  return (
    <div className="min-h-dvh grid place-items-center p-4 text-center">
      <div className="space-y-3">
        <h1 className="font-display text-xl uppercase">{what}</h1>
        <p className="text-text-muted">可能已經被刪除，或網址打錯了。</p>
        <Link to="/" className="text-accent-text underline">回到首頁</Link>
      </div>
    </div>
  );
}
