"use client";

import { FormEvent, useMemo, useState } from "react";

type ProcessedResume = {
  fileName: string;
  summary: string;
  sheetStatus: "queued" | "appended" | "skipped" | "error";
  sheetMessage?: string;
};

export default function Home() {
  const [sheetId, setSheetId] = useState("");
  const [sheetName, setSheetName] = useState("Sheet1");
  const [clientEmail, setClientEmail] = useState("");
  const [privateKey, setPrivateKey] = useState("");
  const [results, setResults] = useState<ProcessedResume[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const googleConfigReady = useMemo(
    () => sheetId.trim() && sheetName.trim() && clientEmail.trim() && privateKey.trim(),
    [sheetId, sheetName, clientEmail, privateKey],
  );

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setSuccessMessage(null);
    setResults([]);

    const form = event.currentTarget;
    const filesInput = form.elements.namedItem("files") as HTMLInputElement | null;
    const files = filesInput?.files ? Array.from(filesInput.files) : [];

    if (!files.length) {
      setError("Upload at least one CV file.");
      return;
    }

    if (files.length > 100) {
      setError("You can upload up to 100 CVs at a time.");
      return;
    }

    setIsSubmitting(true);

    try {
      const payload = new FormData();
      files.forEach((file) => payload.append("files", file));
      payload.append("sheetId", sheetId);
      payload.append("sheetName", sheetName);
      payload.append("clientEmail", clientEmail);
      payload.append("privateKey", privateKey);

      const response = await fetch("/api/process", {
        method: "POST",
        body: payload,
      });

      if (!response.ok) {
        const { message } = await response.json();
        throw new Error(message ?? "Unexpected error while processing CVs.");
      }

      const data = await response.json();
      setResults(data.results as ProcessedResume[]);
      if (data.globalMessage) {
        setSuccessMessage(data.globalMessage as string);
      } else {
        setSuccessMessage("Processed CVs successfully.");
      }
    } catch (processingError) {
      setError(processingError instanceof Error ? processingError.message : "Failed to process CVs.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 bg-[radial-gradient(circle_at_top,_#1f2937_0%,_rgba(2,6,23,1)_60%)] py-12 text-slate-100">
      <main className="mx-auto flex w-full max-w-5xl flex-col gap-10 px-5">
        <header className="space-y-3">
          <p className="rounded-full border border-slate-700/50 bg-slate-900/40 px-4 py-1 text-sm font-medium uppercase tracking-[0.2em] text-slate-300 shadow-lg shadow-blue-500/10 backdrop-blur">
            ATS Assistant
          </p>
          <h1 className="text-4xl font-semibold sm:text-5xl">Bulk CV summariser with Google Sheets sync</h1>
          <p className="max-w-2xl text-base text-slate-300 sm:text-lg">
            Upload up to 100 CVs in PDF or TXT format, generate concise summaries, and append the results straight
            into your tracking sheet powered by a Google service-account.
          </p>
        </header>

        <section className="rounded-3xl border border-slate-700/40 bg-slate-900/40 p-8 shadow-xl shadow-cyan-500/10 backdrop-blur">
          <form className="grid gap-8" onSubmit={handleSubmit}>
            <div className="grid gap-4 lg:grid-cols-2">
              <div className="space-y-3">
                <h2 className="text-lg font-medium">Google Sheets connection</h2>
                <p className="text-sm text-slate-400">
                  Use a Google Cloud service account with the Sheets API enabled. Share your target spreadsheet with the
                  service email and paste the credentials below.
                </p>
                <label className="block space-y-1 text-sm">
                  <span className="text-slate-300">Spreadsheet ID</span>
                  <input
                    className="w-full rounded-xl border border-slate-700 bg-slate-950/70 px-3 py-2 text-base text-slate-100 outline-none transition focus:border-cyan-400 focus:ring-2 focus:ring-cyan-500/30"
                    placeholder="1abc...XYZ"
                    value={sheetId}
                    onChange={(event) => setSheetId(event.target.value)}
                    name="sheetId"
                    required
                  />
                </label>
                <label className="block space-y-1 text-sm">
                  <span className="text-slate-300">Worksheet name</span>
                  <input
                    className="w-full rounded-xl border border-slate-700 bg-slate-950/70 px-3 py-2 text-base text-slate-100 outline-none transition focus:border-cyan-400 focus:ring-2 focus:ring-cyan-500/30"
                    placeholder="Sheet1"
                    value={sheetName}
                    onChange={(event) => setSheetName(event.target.value)}
                    name="sheetName"
                    required
                  />
                </label>
              </div>

              <div className="space-y-3">
                <h3 className="text-lg font-medium">Service account credentials</h3>
                <label className="block space-y-1 text-sm">
                  <span className="text-slate-300">Client email</span>
                  <input
                    className="w-full rounded-xl border border-slate-700 bg-slate-950/70 px-3 py-2 text-base text-slate-100 outline-none transition focus:border-cyan-400 focus:ring-2 focus:ring-cyan-500/30"
                    placeholder="example@project.iam.gserviceaccount.com"
                    value={clientEmail}
                    onChange={(event) => setClientEmail(event.target.value)}
                    name="clientEmail"
                    required
                  />
                </label>
                <label className="block space-y-1 text-sm">
                  <span className="text-slate-300">Private key</span>
                  <textarea
                    className="min-h-[120px] w-full rounded-xl border border-slate-700 bg-slate-950/70 px-3 py-2 text-sm text-slate-100 outline-none transition focus:border-cyan-400 focus:ring-2 focus:ring-cyan-500/30"
                    placeholder={"-----BEGIN PRIVATE KEY-----\\n...\\n-----END PRIVATE KEY-----\\n"}
                    value={privateKey}
                    onChange={(event) => setPrivateKey(event.target.value)}
                    name="privateKey"
                    required
                  />
                </label>
              </div>
            </div>

            <div className="space-y-3 rounded-2xl border border-slate-700/40 bg-slate-950/60 p-6">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h2 className="text-lg font-medium">Upload CV files</h2>
                  <p className="text-sm text-slate-400">Supported formats: PDF, TXT. Maximum 100 files per batch.</p>
                </div>
                <label className="inline-flex cursor-pointer items-center justify-center rounded-xl border border-cyan-500 bg-cyan-500/10 px-4 py-2 text-sm font-semibold text-cyan-200 shadow-inner shadow-cyan-400/20 transition hover:bg-cyan-500/20">
                  <input className="hidden" type="file" accept=".pdf,.txt" multiple name="files" />
                  Select files
                </label>
              </div>
            </div>

            <button
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-cyan-500 px-6 py-3 text-base font-semibold text-slate-950 transition hover:bg-cyan-400 focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-200 disabled:cursor-not-allowed disabled:bg-cyan-600/60"
              type="submit"
              disabled={isSubmitting || !googleConfigReady}
            >
              {isSubmitting ? "Processing CVs..." : "Generate summaries & sync"}
            </button>

            {!googleConfigReady && (
              <p className="rounded-lg border border-amber-400/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">
                Provide and validate all Google Sheets credentials before running the agent.
              </p>
            )}

            {error && (
              <p className="rounded-lg border border-rose-400/40 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">{error}</p>
            )}

            {successMessage && (
              <p className="rounded-lg border border-emerald-400/40 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200">
                {successMessage}
              </p>
            )}
          </form>
        </section>

        {results.length > 0 && (
          <section className="space-y-4 rounded-3xl border border-slate-700/40 bg-slate-900/40 p-8 shadow-xl shadow-cyan-500/10 backdrop-blur">
            <div>
              <h2 className="text-xl font-semibold">Batch results</h2>
              <p className="text-sm text-slate-400">
                Each CV summary is saved to your sheet with a timestamp for quick filtering and follow-up.
              </p>
            </div>
            <div className="grid gap-4">
              {results.map((resume) => (
                <article
                  key={resume.fileName}
                  className="space-y-3 rounded-2xl border border-slate-700/40 bg-slate-950/70 p-5 shadow-inner shadow-black/20"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h3 className="text-lg font-semibold text-cyan-300">{resume.fileName}</h3>
                    <StatusPill status={resume.sheetStatus} message={resume.sheetMessage} />
                  </div>
                  <p className="whitespace-pre-wrap text-sm leading-relaxed text-slate-200">{resume.summary}</p>
                </article>
              ))}
            </div>
          </section>
        )}
      </main>
    </div>
  );
}

function StatusPill({
  status,
  message,
}: {
  status: ProcessedResume["sheetStatus"];
  message?: string;
}) {
  const visual = {
    appended: {
      label: "Synced to sheet",
      className: "border-emerald-400/50 bg-emerald-500/10 text-emerald-200",
    },
    skipped: {
      label: "Skipped sheet",
      className: "border-slate-500/50 bg-slate-500/10 text-slate-200",
    },
    error: {
      label: "Sheet error",
      className: "border-rose-400/50 bg-rose-500/10 text-rose-200",
    },
    queued: {
      label: "Queued",
      className: "border-cyan-400/50 bg-cyan-500/10 text-cyan-200",
    },
  } as const;

  const { label, className } = visual[status];

  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-3 py-1 text-xs font-semibold ${className}`}
      title={message}
    >
      {label}
    </span>
  );
}
