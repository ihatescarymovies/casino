import { useState } from "react";

const emptyReceipt = JSON.stringify(
  {
    game: "dice",
    roundId: 1,
    serverSeedHash: "",
    clientSeed: "",
    nonce: 0,
    outcome: "",
  },
  null,
  2,
);

export default function FairnessVerifier() {
  const [receipt, setReceipt] = useState(emptyReceipt);
  const [serverSeed, setServerSeed] = useState("");
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(
    null,
  );
  const verify = async () => {
    try {
      const response = await fetch("/api/fairness/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ receipt: JSON.parse(receipt), serverSeed }),
      });
      const result = await response.json();
      setMessage({
        ok: result.verified === true,
        text: result.verified
          ? result.reason
          : (result.error ?? result.reason ?? "Verification failed."),
      });
    } catch {
      setMessage({
        ok: false,
        text: "Enter valid receipt JSON and a revealed server seed.",
      });
    }
  };
  return (
    <div className="mx-auto max-w-3xl px-4 py-12">
      <h1 className="text-3xl font-bold text-white">Fairness verifier</h1>
      <p className="mt-2 text-muted-foreground">
        Check that a revealed server seed matches the commitment published for a
        settled round. This verifies the seed commitment only.
      </p>
      <label className="mt-8 block text-sm text-white">
        Receipt JSON
        <textarea
          value={receipt}
          onChange={(e) => setReceipt(e.target.value)}
          rows={10}
          className="mt-2 w-full rounded-xl border border-white/10 bg-card p-3 font-mono text-xs text-white"
        />
      </label>
      <label className="mt-4 block text-sm text-white">
        Revealed server seed
        <input
          value={serverSeed}
          onChange={(e) => setServerSeed(e.target.value)}
          className="mt-2 w-full rounded-xl border border-white/10 bg-card p-3 font-mono text-sm text-white"
        />
      </label>
      <button
        onClick={verify}
        className="mt-5 rounded-lg bg-primary px-5 py-2 font-semibold text-black"
      >
        Verify receipt
      </button>
      {message && (
        <div
          role="status"
          className={`mt-5 rounded-xl border p-4 ${message.ok ? "border-emerald-400/40 text-emerald-300" : "border-red-400/40 text-red-300"}`}
        >
          {message.ok ? "✓ Verified — " : "✕ Not verified — "}
          {message.text}
        </div>
      )}
    </div>
  );
}
