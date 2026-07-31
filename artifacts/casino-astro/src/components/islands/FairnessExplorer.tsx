import { useEffect, useState } from "react";

type Round = { id: number; gameType: string; status?: string; result?: string | null; serverSeedHash?: string; verified?: boolean };
type Fairness = { roundId: number; status: string; commitment: string | null; clientSeed: string | null; nonce: number | null; serverSeed: string | null; result: string | null; payout: number | null; algorithm: { name: string; version: string; replay: boolean }; chain: { id: number; previousHash: string | null } | null };

export default function FairnessExplorer({ gameType }: { gameType: string }) {
  const [rounds, setRounds] = useState<Round[]>([]);
  const [selected, setSelected] = useState<number>();
  const [fairness, setFairness] = useState<Fairness | null>(null);
  const [seed, setSeed] = useState("");
  const [verification, setVerification] = useState<{ verified: boolean; commitmentMatch: boolean; replay: { implemented: boolean }; warnings?: string[] } | null>(null);
  const [state, setState] = useState<"loading" | "empty" | "ready" | "error">("loading");

  useEffect(() => { fetch("/api/rounds", { credentials: "include" }).then(async r => { if (!r.ok) throw new Error(); return r.json(); }).then((data: Round[]) => { const mine = data.filter(r => r.gameType === gameType); setRounds(mine); setSelected(mine[0]?.id); setState(mine.length ? "ready" : "empty"); }).catch(() => setState("error")); }, [gameType]);
  useEffect(() => { if (!selected) { setFairness(null); return; } setFairness(null); setVerification(null); fetch(`/api/rounds/${selected}/fairness`, { credentials: "include" }).then(async r => { if (!r.ok) throw new Error(); return r.json(); }).then(setFairness).catch(() => setState("error")); }, [selected]);
  async function verify() { if (!selected || !seed) return; const response = await fetch(`/api/rounds/${selected}/verify`, { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ serverSeed: seed, roundId: selected }) }); setVerification(await response.json()); }

  return <section aria-labelledby="fairness-heading" className="rounded-2xl border border-white/10 bg-card p-6">
    <h2 id="fairness-heading" className="text-2xl font-bold text-white">Fairness Explorer</h2>
    <p className="mt-2 text-sm text-muted-foreground">Inspect your rounds and verify the server-seed commitment. This MVP does not replay game outcomes.</p>
    {state === "loading" && <p className="mt-4 text-muted-foreground" role="status">Loading rounds…</p>}
    {state === "empty" && <p className="mt-4 text-muted-foreground">No rounds for this game yet. Place a bet to explore its fairness.</p>}
    {state === "error" && <p className="mt-4 text-red-300" role="alert">Fairness data is unavailable. Please sign in and try again.</p>}
    {rounds.length > 0 && <div className="mt-4 flex flex-col gap-4">
      <label className="text-sm text-muted-foreground">Round <select className="ml-2 rounded bg-black p-2 text-white" value={selected} onChange={e => setSelected(Number(e.target.value))}>{rounds.map(r => <option key={r.id} value={r.id}>#{r.id} — {r.status ?? r.result}</option>)}</select></label>
      {fairness && <div className="grid gap-2 text-sm text-muted-foreground"><div>Commitment: <code className="break-all text-white">{fairness.commitment ?? "—"}</code></div><div>Client seed: <code className="text-white">{fairness.clientSeed ?? "—"}</code> · Nonce: <code className="text-white">{fairness.nonce ?? "—"}</code></div><div>Status: <strong className="text-white">{fairness.status}</strong> · Result: <strong className="text-white">{fairness.result ?? "Pending (seed hidden)"}</strong></div>{fairness.serverSeed && <div>Revealed server seed: <code className="break-all text-white">{fairness.serverSeed}</code></div>}<div>Algorithm: {fairness.algorithm.name} v{fairness.algorithm.version}</div></div>}
      {fairness?.status !== "pending" && <div className="flex flex-col gap-2 sm:flex-row"><input aria-label="Server seed" className="rounded bg-black p-2 text-white" placeholder="Paste revealed server seed" value={seed} onChange={e => setSeed(e.target.value)} /><button className="btn btn-primary" onClick={verify} disabled={!seed}>Verify commitment</button></div>}
      {verification && <div role="status" className={verification.verified ? "rounded border border-green-500/40 p-3 text-green-300" : "rounded border border-red-500/40 p-3 text-red-300"}>{verification.verified ? "Commitment verified (limited)" : "Commitment verification failed"}. {verification.warnings?.[0]}</div>}
    </div>}
  </section>;
}
