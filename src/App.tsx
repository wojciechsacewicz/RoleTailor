import { useCallback, useEffect, useMemo, useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import {
  Archive,
  ChevronDown,
  Clipboard,
  FileText,
  FolderOpen,
  History,
  Eye,
  Link2,
  LoaderCircle,
  Minus,
  Plus,
  Pencil,
  RotateCcw,
  Settings,
  Square,
  Star,
  Trash2,
  Wand2,
  X,
} from "lucide-react";
import CvEditor from "./CvEditor";
import DebugPeek from "./DebugPeek";
import Onboarding from "./Onboarding";
import { backend, onDebugEvent, onRunEvent, parseResult } from "./lib/backend";
import type {
  AnalysisProfile,
  JobPreview,
  RunResult,
  RunStatus,
  RunSummary,
  SetupState,
} from "./lib/schema";

const demoSetup: SetupState = {
  codexInstalled: true,
  codexVersion: "codex-cli 0.144.1",
  authenticated: true,
  accountLabel: "ChatGPT account",
  profile: undefined,
  buildValid: true,
  issues: [],
  dataPath: "~/.local/share/roletailor",
};
const isTauri = () => "__TAURI_INTERNALS__" in window;
const stages: RunStatus[] = [
  "Analysing",
  "Tailoring CV",
  "Building PDF",
  "Completed",
];
function Titlebar() {
  const win = isTauri() ? getCurrentWindow() : null;
  return (
    <header className="titlebar" data-tauri-drag-region>
      <div className="brandmark" aria-label="RoleTailor">
        <span />
        <span />
      </div>
      <div className="title" data-tauri-drag-region>
        RoleTailor
      </div>
      <div className="window-controls">
        <button onClick={() => void win?.minimize()} aria-label="Minimize">
          <Minus />
        </button>
        <button onClick={() => void win?.toggleMaximize()} aria-label="Maximize">
          <Square />
        </button>
        <button
          className="close"
          onClick={() => void win?.close()}
          aria-label="Close"
        >
          <X />
        </button>
      </div>
    </header>
  );
}
function Stars({ value = 0 }: { value?: number }) {
  return (
    <span className="stars" aria-label={`${value} out of 5 stars`}>
      {[1, 2, 3, 4, 5].map((n) => (
        <Star key={n} className={n <= value ? "filled" : ""} />
      ))}
    </span>
  );
}
function errorMessage(value: unknown) {
  const message = typeof value === "string"
    ? value
    : value instanceof Error
      ? value.message
      : "Something went wrong. Try again or open the debug log for details.";
  return message.replace(/^Error:\s*/i, "").trim() || "Something went wrong.";
}
function ErrorToast({ message, onClose }: { message: string | null; onClose: () => void }) {
  if (!message) return null;
  return (
    <div className="error-toast" role="alert" aria-live="assertive">
      <div><strong>Action failed</strong><p>{message}</p></div>
      <button onClick={onClose} aria-label="Dismiss error"><X /></button>
    </div>
  );
}
function Sidebar({
  runs,
  selected,
  onSelect,
  onNew,
  onDelete,
  onEditor,
  onSettings,
}: {
  runs: RunSummary[];
  selected: string;
  onSelect: (id: string) => void;
  onNew: () => void;
  onDelete: (id: string) => void;
  onEditor: () => void;
  onSettings: () => void;
}) {
  const [armedDelete, setArmedDelete] = useState<string | null>(null);
  return (
    <aside className="sidebar">
      <button className="new-button" onClick={onNew}>
        <Plus />
        New Application<span>⌘ N</span>
      </button>
      <button className="editor-nav-button" onClick={onEditor}>
        <Pencil /> CV Editor
      </button>
      <div className="section-label">
        <History />
        History
      </div>
      <nav className="history">
        {runs.length === 0 ? (
          <p className="empty-history">
            Completed applications will appear here.
          </p>
        ) : (
          runs.map((r) => (
            <div className="history-entry" key={r.id}>
              <button
                className={selected === r.id ? "active" : ""}
                onClick={() => onSelect(r.id)}
              >
              <span
                className={`status-dot ${r.status.toLowerCase().replaceAll(" ", "-")}`}
              />
              <span>
                <strong>{r.company || "Untitled application"}</strong>
                <small>
                  {r.role || r.status} ·{" "}
                  {new Date(r.createdAt).toLocaleDateString()}
                </small>
              </span>
              {r.stars ? (
                <em>
                  {r.stars}
                  <Star />
                </em>
              ) : null}
              </button>
              <button
                className={`history-trash ${armedDelete === r.id ? "armed" : ""}`}
                aria-label={armedDelete === r.id ? "Tap again to delete" : "Delete run"}
                title={armedDelete === r.id ? "Tap again to confirm" : "Delete"}
                onClick={() => {
                  if (armedDelete === r.id) {
                    onDelete(r.id);
                    setArmedDelete(null);
                  } else {
                    setArmedDelete(r.id);
                  }
                }}
              >
                <Trash2 />
              </button>
            </div>
          ))
        )}
      </nav>
      <button className={`settings ${selected === "settings" ? "active" : ""}`} onClick={onSettings}>
        <Settings />
        Settings
      </button>
    </aside>
  );
}

function SettingsView({ state, onChange, onError, onRestored, onEditProfile }: { state: SetupState; onChange: (next: SetupState) => void; onError: (error: unknown) => void; onRestored: () => void; onEditProfile: () => void }) {
  const [busy, setBusy] = useState(false);
  const [profileResetArmed, setProfileResetArmed] = useState(false);
  const [archived, setArchived] = useState<RunSummary[]>([]);
  useEffect(() => { void backend.archivedHistory().then(setArchived).catch(onError); }, [onError]);
  const retry = async () => { setBusy(true); try { onChange(await backend.setup()); } catch (error) { onError(error); } finally { setBusy(false); } };
  const restore = async (runId: string) => {
    try {
      await backend.setArchived(runId, false);
      setArchived((runs) => runs.filter((run) => run.id !== runId));
      onRestored();
    } catch (error) { onError(error); }
  };
  return <div className="workspace settings-view"><div className="workspace-header"><div><p className="eyebrow">Settings</p><h1>Private local workspace</h1><p>RoleTailor keeps your profile, runs and generated files on this machine.</p></div></div><section className="settings-card"><div><span>Career profile</span><strong>{state.profile?.fullName || "Not configured"}</strong><em>{profileResetArmed ? "Saving the profile regenerates Base CV and replaces manual CV Editor changes. Click again to continue." : state.profile?.headline}</em><button className={profileResetArmed ? "armed" : ""} onClick={() => { if (profileResetArmed) onEditProfile(); else setProfileResetArmed(true); }}>{profileResetArmed ? "Continue" : "Edit"}</button></div><div><span>Codex</span><strong>{state.codexInstalled ? state.codexVersion : "Not installed"}</strong><em>{state.authenticated ? state.accountLabel || "ChatGPT authenticated" : "Sign-in required"}</em></div><div><span>Writing preferences</span><strong>{state.profile ? `${state.profile.writingTone} · ${state.profile.preferredLanguage.toUpperCase()}` : "Not configured"}</strong><em>Saved with your profile, without an external skill file.</em></div><div><span>Local data</span><strong>{state.dataPath}</strong><em>Career data never needs to live in the source repository.</em></div><button className="primary" onClick={() => void retry()} disabled={busy}>{busy ? <LoaderCircle className="spin" /> : null}Retry checks</button></section><section className="archive-card"><div className="archive-heading"><div><p className="eyebrow">Archive</p><h2>Archived applications</h2></div><span>{archived.length}</span></div>{archived.length === 0 ? <p className="archive-empty">Archived applications will appear here.</p> : archived.map((run) => <div className="archive-row" key={run.id}><div><strong>{run.company}</strong><small>{run.role}</small></div><em>{run.stars ? `${run.stars}/5` : run.status}</em><button onClick={() => void restore(run.id)}>Restore</button></div>)}</section></div>;
}
function NewApplication({
  onStart,
  onError,
}: {
  onStart: (job: JobPreview, lang: "auto" | "pl" | "en", profile: AnalysisProfile) => void;
  onError: (error: unknown) => void;
}) {
  const [mode, setMode] = useState<"url" | "text">("url");
  const [input, setInput] = useState("");
  const [preview, setPreview] = useState<JobPreview | null>(null);
  const [loading, setLoading] = useState(false);
  const [cleaning, setCleaning] = useState(false);
  const [lang, setLang] = useState<"auto" | "pl" | "en">("auto");
  const [analysisProfile, setAnalysisProfile] = useState<AnalysisProfile>("luna-high");
  const extract = async () => {
    setLoading(true);
    try {
      if (mode === "url") setPreview(await backend.fetchJob(input));
      else
        setPreview({
          company: "Company to identify",
          role: "Role to identify",
          technologies: [],
          content: input,
        });
    } catch (error) {
      onError(error);
    } finally {
      setLoading(false);
    }
  };
  const cleanup = async () => {
    if (!preview) return;
    setCleaning(true);
    try {
      setPreview(await backend.cleanupJob(preview));
    } catch (error) {
      onError(error);
    } finally {
      setCleaning(false);
    }
  };
  return (
    <div className="workspace">
      <div className="workspace-header">
        <div>
          <p className="eyebrow">New application</p>
          <h1>Tailor your CV to the role.</h1>
          <p>
            Paste the listing. RoleTailor will extract the useful details before
            Codex touches your CV.
          </p>
        </div>
      </div>
      <section className="composer">
        <div className="mode-tabs">
          <button
            className={mode === "url" ? "active" : ""}
            onClick={() => setMode("url")}
          >
            <Link2 />
            Job URL
          </button>
          <button
            className={mode === "text" ? "active" : ""}
            onClick={() => setMode("text")}
          >
            <FileText />
            Paste text
          </button>
        </div>
        {mode === "url" ? (
          <input
            autoFocus
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="https://company.com/jobs/product-engineer"
          />
        ) : (
          <textarea
            autoFocus
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Paste the complete job listing here…"
          />
        )}
        <div className="composer-footer">
          <span>Job listings are treated as untrusted content.</span>
          <button
            className="primary"
            disabled={input.trim().length < 12 || loading}
            onClick={extract}
          >
            {loading ? <LoaderCircle className="spin" /> : "Extract listing"}
          </button>
        </div>
      </section>
      {preview && (
        <section className="job-preview">
          <div className="preview-head">
            <div>
              <p className="eyebrow">Extracted listing</p>
              <h2>{preview.role}</h2>
              <p>
                {preview.company}
                {preview.location ? ` · ${preview.location}` : ""}
              </p>
            </div>
            <button className="icon-button" onClick={() => setPreview(null)}>
              <X />
            </button>
          </div>
          {preview.technologies.length > 0 && (
            <div className="tags">
              {preview.technologies.map((t) => (
                <span key={t}>{t}</span>
              ))}
            </div>
          )}
          <div className="job-copy">{preview.content}</div>
          <div className="analysis-profile" aria-label="Main analysis model">
            {([
              ["luna-high", "Luna", "High"],
              ["terra-high", "Terra", "High"],
              ["sol-low", "Sol", "Low"],
            ] as const).map(([value, name, effort]) => (
              <button
                key={value}
                className={analysisProfile === value ? "active" : ""}
                onClick={() => setAnalysisProfile(value)}
                aria-pressed={analysisProfile === value}
              >
                <strong>{name}</strong>
                <span>{effort}</span>
              </button>
            ))}
          </div>
          <div className="run-row">
            <button className="secondary" disabled={cleaning} onClick={cleanup}>
              {cleaning ? <LoaderCircle className="spin" /> : <Wand2 />}
              AI cleanup
            </button>
            <label>
              CV language
              <select
                value={lang}
                onChange={(e) => setLang(e.target.value as never)}
              >
                <option value="auto">Match listing</option>
                <option value="pl">Polish</option>
                <option value="en">English</option>
              </select>
              <ChevronDown />
            </label>
            <button
              className="run-button"
              onClick={() => onStart(preview, lang, analysisProfile)}
            >
              Run application <span>↗</span>
            </button>
          </div>
        </section>
      )}
    </div>
  );
}
function Activity({
  run,
  onCancel,
  onEdit,
}: {
  run: RunSummary;
  onCancel: () => void;
  onEdit: () => void;
}) {
  const [now, setNow] = useState(Date.now());
  const [peekOpen, setPeekOpen] = useState(false);
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);
  const active = Math.max(0, stages.indexOf(run.status));
  const terminal = run.status === "Failed" || run.status === "Cancelled";
  const secondsSinceActivity = Math.max(0, Math.floor((now - new Date(run.lastActivity || run.createdAt).getTime()) / 1000));
  return (
    <div className="workspace activity-view">
      <div className="workspace-header">
        <div>
          <p className="eyebrow">{run.company}</p>
          <h1>{run.role}</h1>
          <p>
            Codex is working inside an isolated copy. The canonical CV stays
            read-only.
          </p>
        </div>
        <div className="activity-actions">
          <button className="peek-trigger" onClick={() => setPeekOpen(true)}><Eye /> Take a peek</button>
          {!terminal && <button className="secondary" onClick={onCancel}>Cancel run</button>}
        </div>
      </div>
      {terminal ? (
        <section className="timeline terminal-run">
          <h3>{run.status === "Cancelled" ? "Run cancelled" : "Run failed"}</h3>
          <p>{run.error || "No files in the canonical CV were changed."}</p>
          <button className="secondary" onClick={onEdit}><Pencil /> Open CV Editor</button>
        </section>
      ) : <section className="timeline">
        {stages.slice(0, -1).map((s, i) => (
          <div
            className={
              i < active ? "done" : i === active ? "current" : "future"
            }
            key={s}
          >
            <span>{i < active ? "✓" : i + 1}</span>
            <div>
              <small>
                {i < active
                  ? "Completed"
                  : i === active
                    ? "Working now"
                    : "Queued"}
              </small>
              <h3>{s}</h3>
              <p>
                {i === active && run.activity ? run.activity : s === "Analysing"
                  ? "Reading the listing, repository and verified career facts."
                  : s === "Tailoring CV"
                    ? "Comparing evidence, rewriting the selected source and preparing application copy."
                    : "Running the existing PDF pipeline and validating all artifacts."}
              </p>
            </div>
            {i === active && <LoaderCircle className="spin" />}
          </div>
        ))}
      </section>}
      {!terminal && <p className={`run-heartbeat ${secondsSinceActivity > 120 ? "stale" : ""}`}>{secondsSinceActivity > 120 ? "No App Server event for " : "Last Codex activity "}{secondsSinceActivity}s ago{secondsSinceActivity > 120 ? ". It may still be reasoning; Cancel remains safe." : ""}</p>}
      <div className="safety-note">
        <span /> Job content can inform the analysis, but cannot issue commands
        to Codex.
      </div>
      <DebugPeek contextId={run.id} open={peekOpen} working={!terminal} onClose={() => setPeekOpen(false)} />
    </div>
  );
}
function Result({
  result,
  onRerun,
  onEdit,
  onArchive,
}: {
  result: RunResult;
  onRerun: () => void;
  onEdit: () => void;
  onArchive: () => void;
}) {
  const [tab, setTab] = useState<
    "assessment" | "message" | "cover" | "changes"
  >("assessment");
  const [rerunArmed, setRerunArmed] = useState(false);
  useEffect(() => {
    if (!rerunArmed) return;
    const timer = window.setTimeout(() => setRerunArmed(false), 3000);
    return () => window.clearTimeout(timer);
  }, [rerunArmed]);
  const label = {
    apply: "Apply",
    "apply-with-caveats": "Apply with caveats",
    "weak-fit": "Weak fit",
    skip: "Skip",
  }[result.fit.recommendation];
  const copy = (s: string) => navigator.clipboard.writeText(s);
  return (
    <div className="workspace result-view">
      <div className="result-hero">
        <div>
          <p className="eyebrow">{result.company}</p>
          <h1>{result.role}</h1>
          <p>{result.fit.summary}</p>
        </div>
        <div className="score">
          <Stars value={result.fit.stars} />
          <strong>{result.fit.matchScore}</strong>
          <span>match score</span>
          <em>{label}</em>
        </div>
      </div>
      <div className="result-actions">
        <button className="primary" onClick={onEdit}>
          <Pencil />
          Edit CV
        </button>
        <button
          onClick={() => backend.openArtifact(result.artifacts.cvPdf)}
        >
          <FileText />
          Open PDF
        </button>
        <button onClick={() => backend.revealArtifact(result.artifacts.cvPdf)}>
          <FolderOpen />
          Reveal files
        </button>
        <button className={rerunArmed ? "confirm-action" : ""} onClick={() => rerunArmed ? onRerun() : setRerunArmed(true)}>
          <RotateCcw />
          {rerunArmed ? "Tap again to rerun" : "Rerun"}
        </button>
        <button onClick={onArchive}>
          <Archive />
          Move to archive
        </button>
      </div>
      <div className="result-tabs">
        {(["assessment", "message", "cover", "changes"] as const).map((t) => (
          <button
            className={tab === t ? "active" : ""}
            onClick={() => setTab(t)}
            key={t}
          >
            {t === "cover" ? "Cover letter" : t}
          </button>
        ))}
      </div>
      {tab === "assessment" && (
        <div className="assessment-grid">
          <section>
            <h3>Strongest matches</h3>
            <ul>
              {result.fit.strengths.map((x) => (
                <li key={x}>{x}</li>
              ))}
            </ul>
          </section>
          <section>
            <h3>Gaps & missing requirements</h3>
            <ul>
              {result.fit.gaps.map((x) => (
                <li key={x}>{x}</li>
              ))}
            </ul>
          </section>
          <section>
            <h3>Differentiators</h3>
            <ul>
              {result.fit.differentiators.map((x) => (
                <li key={x}>{x}</li>
              ))}
            </ul>
          </section>
          <section className="likelihood">
            <h3>Invite likelihood estimate</h3>
            <strong>{result.fit.inviteLikelihoodEstimate}%</strong>
            <p>Heuristic estimate · {result.fit.confidence} confidence</p>
            <small>
              This is directional, not a scientifically calibrated probability.
            </small>
          </section>
        </div>
      )}
      {tab === "message" && (
        <TextArtifact
          text={result.artifacts.applicationMessage}
          onCopy={copy}
        />
      )}{" "}
      {tab === "cover" && (
        <TextArtifact text={result.artifacts.coverLetter} onCopy={copy} />
      )}{" "}
      {tab === "changes" && (
        <section className="changes">
          <h3>What changed from the canonical CV</h3>
          <ul>
            {result.changeSummary.map((x) => (
              <li key={x}>{x}</li>
            ))}
          </ul>
          <p>The source-of-truth CV was not modified.</p>
        </section>
      )}
    </div>
  );
}
function TextArtifact({
  text,
  onCopy,
}: {
  text: string;
  onCopy: (s: string) => void;
}) {
  return (
    <section className="text-artifact">
      <button onClick={() => onCopy(text)}>
        <Clipboard />
        Copy
      </button>
      <pre>{text}</pre>
    </section>
  );
}
export default function App() {
  const [setup, setSetup] = useState<SetupState | null>(null);
  const [runs, setRuns] = useState<RunSummary[]>([]);
  const [selected, setSelected] = useState("new");
  const [editorRunId, setEditorRunId] = useState<string | null>(null);
  const [profileEditing, setProfileEditing] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const reportError = useCallback((error: unknown) => setToast(errorMessage(error)), []);
  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 9000);
    return () => window.clearTimeout(timer);
  }, [toast]);
  useEffect(() => {
    let unlisten: (() => void) | undefined;
    let unlistenDebug: (() => void) | undefined;
    let disposed = false;
    if (isTauri()) {
      void (async () => {
        const stopRun = await onRunEvent((e) =>
          setRuns((old) => old.map((r) => {
            if (r.id !== e.runId) return r;
            const terminal = r.status === "Completed" || r.status === "Failed" || r.status === "Cancelled";
            if (terminal && e.status && e.status !== r.status) return r;
            return { ...r, status: e.status ?? r.status, result: e.result ? parseResult(e.result) : r.result, error: e.error, activity: e.message, lastActivity: e.emittedAt };
          })),
        );
        if (disposed) { stopRun(); return; }
        unlisten = stopRun;
        const stopDebug = await onDebugEvent((event) => {
          setRuns((current) => current.map((run) => run.id === event.contextId ? { ...run, lastActivity: event.emittedAt } : run));
        });
        if (disposed) { stopDebug(); return; }
        unlistenDebug = stopDebug;
        const [nextSetup, history] = await Promise.all([backend.setup(), backend.history()]);
        if (!disposed) {
          setSetup(nextSetup);
          setRuns((current) => mergeRunHistory(current, history));
        }
      })().catch(reportError);
    } else setSetup(demoSetup);
    return () => { disposed = true; unlisten?.(); unlistenDebug?.(); };
  }, [reportError]);
  const current = useMemo(
    () => runs.find((r) => r.id === selected),
    [runs, selected],
  );
  if (!setup)
    return (
      <div className="loading">
        <LoaderCircle className="spin" />
        <ErrorToast message={toast} onClose={() => setToast(null)} />
      </div>
    );
  const ready =
    setup.codexInstalled &&
    setup.authenticated &&
    Boolean(setup.profile) &&
    setup.buildValid;
  if (!ready)
    return (
      <div className="app">
        <Titlebar />
        <Onboarding state={setup} onComplete={setSetup} onError={reportError} />
        <ErrorToast message={toast} onClose={() => setToast(null)} />
      </div>
    );
  if (profileEditing)
    return (
      <div className="app">
        <Titlebar />
        <Onboarding state={setup} editing onComplete={(next) => { setSetup(next); setProfileEditing(false); }} onCancel={() => setProfileEditing(false)} onError={reportError} />
        <ErrorToast message={toast} onClose={() => setToast(null)} />
      </div>
    );
  if (editorRunId)
    return (
      <div className="app">
        <Titlebar />
        <CvEditor runId={editorRunId} onBack={() => {
          setEditorRunId(null);
          void backend.history().then(setRuns).catch(reportError);
        }} onError={reportError} />
        <ErrorToast message={toast} onClose={() => setToast(null)} />
      </div>
    );
  const start = async (job: JobPreview, language: "auto" | "pl" | "en", analysisProfile: AnalysisProfile) => {
    try {
      const id = await backend.startRun(job, language, analysisProfile);
      const history = await backend.history();
      setRuns((current) => mergeRunHistory(current, history));
      setSelected(id);
    } catch (error) { reportError(error); }
  };
  const cancel = async (runId: string) => {
    setRuns((current) =>
      current.map((run) =>
        run.id === runId ? { ...run, status: "Cancelled", error: undefined } : run,
      ),
    );
    try {
      await backend.cancelRun(runId);
      setRuns(await backend.history());
    } catch (error) { reportError(error); }
  };
  const deleteRun = async (runId: string) => {
    try {
      await backend.deleteRun(runId);
      setRuns((current) => current.filter((run) => run.id !== runId));
      if (selected === runId) setSelected("new");
    } catch (error) { reportError(error); }
  };
  const archiveRun = async (runId: string) => {
    try {
      await backend.setArchived(runId, true);
      setRuns((current) => current.filter((run) => run.id !== runId));
      setSelected("new");
    } catch (error) { reportError(error); }
  };
  const openEditor = async () => {
    try {
      setEditorRunId(await backend.openBaseEditor());
    } catch (error) { reportError(error); }
  };
  return (
    <div className="app">
      <Titlebar />
      <div className="shell">
        <Sidebar
          runs={runs}
          selected={selected}
          onSelect={(id) => { setEditorRunId(null); setSelected(id); }}
          onNew={() => { setEditorRunId(null); setSelected("new"); }}
          onDelete={(id) => void deleteRun(id)}
          onEditor={() => void openEditor()}
          onSettings={() => setSelected("settings")}
        />
        <main className="main">
          {selected === "settings" ? (
            <SettingsView state={setup} onChange={setSetup} onError={reportError} onEditProfile={() => setProfileEditing(true)} onRestored={() => { void backend.history().then(setRuns).catch(reportError); }} />
          ) : selected === "new" ? (
            <NewApplication onStart={start} onError={reportError} />
          ) : current?.status === "Completed" && current.result ? (
            <Result
              result={current.result}
              onRerun={() => setSelected("new")}
              onEdit={() => setEditorRunId(current.id)}
              onArchive={() => void archiveRun(current.id)}
            />
          ) : current ? (
            <Activity
              run={current}
              onCancel={() => void cancel(current.id)}
              onEdit={() => setEditorRunId(current.id)}
            />
          ) : (
            <NewApplication onStart={start} onError={reportError} />
          )}
        </main>
      </div>
      <ErrorToast message={toast} onClose={() => setToast(null)} />
    </div>
  );
}

const statusOrder: Record<RunStatus, number> = { Draft: 0, Fetching: 1, Analysing: 2, "Tailoring CV": 3, "Building PDF": 4, Completed: 5, Failed: 5, Cancelled: 5 };
function mergeRunHistory(current: RunSummary[], history: RunSummary[]) {
  const live = new Map(current.map((run) => [run.id, run]));
  return history.map((saved) => {
    const existing = live.get(saved.id);
    if (!existing) return saved;
    return statusOrder[existing.status] >= statusOrder[saved.status] ? { ...saved, ...existing } : { ...existing, ...saved };
  });
}
