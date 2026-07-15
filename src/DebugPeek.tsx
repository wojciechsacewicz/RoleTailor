import { useEffect, useRef, useState } from "react";
import { Code2, Eye, FilePenLine, LoaderCircle, Terminal, X } from "lucide-react";
import { backend, onDebugEvent } from "./lib/backend";
import type { DebugEvent } from "./lib/schema";

function upsert(events: DebugEvent[], next: DebugEvent) {
  const currentGeneration = events[0]?.generation;
  if (currentGeneration !== undefined && next.generation < currentGeneration) return events;
  if (currentGeneration !== undefined && next.generation > currentGeneration) return [next];
  const index = events.findIndex((event) => event.sequence === next.sequence);
  if (index === -1) return [...events, next].sort((a, b) => a.sequence - b.sequence);
  if (new Date(events[index].emittedAt).getTime() > new Date(next.emittedAt).getTime()) return events;
  const copy = [...events];
  copy[index] = next;
  return copy;
}

function EventIcon({ kind }: { kind: DebugEvent["kind"] }) {
  if (kind === "command" || kind === "output") return <Terminal />;
  if (kind === "file" || kind === "build") return <FilePenLine />;
  if (kind === "agent" || kind === "reasoning") return <Code2 />;
  return <Eye />;
}

export default function DebugPeek({ contextId, open, working, onClose }: { contextId: string; open: boolean; working: boolean; onClose: () => void }) {
  const [events, setEvents] = useState<DebugEvent[]>([]);
  const end = useRef<HTMLDivElement>(null);
  const close = useRef(onClose);
  close.current = onClose;

  useEffect(() => {
    if (!open) return;
    setEvents([]);
    let disposed = false;
    let unlisten: (() => void) | undefined;
    void (async () => {
      const stop = await onDebugEvent((event) => {
        if (event.contextId === contextId) setEvents((current) => upsert(current, event));
      });
      if (disposed) {
        stop();
        return;
      }
      unlisten = stop;
      const history = await backend.debugLog(contextId);
      if (!disposed) setEvents((current) => history.reduce(upsert, current));
    })().catch(() => undefined);
    const escape = (event: KeyboardEvent) => { if (event.key === "Escape") close.current(); };
    window.addEventListener("keydown", escape);
    return () => {
      disposed = true;
      unlisten?.();
      window.removeEventListener("keydown", escape);
    };
  }, [contextId, open]);

  useEffect(() => {
    if (open) end.current?.scrollIntoView({ block: "end" });
  }, [events, open]);

  if (!open) return null;
  return (
    <div className="peek-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section className="peek-modal" role="dialog" aria-modal="true" aria-labelledby="peek-title">
        <header>
          <div><Eye /><div><strong id="peek-title">Take a peek</strong><span>Live Codex activity</span></div></div>
          <div className={`peek-status ${working ? "live" : "done"}`}>{working ? <LoaderCircle className="spin" /> : <span />}{working ? "Working" : "Idle"}</div>
          <button onClick={onClose} aria-label="Close activity preview"><X /></button>
        </header>
        <div className="peek-log">
          {events.length === 0 ? <div className="peek-empty"><LoaderCircle className={working ? "spin" : ""} /><p>{working ? "Waiting for the first App Server event…" : "No activity was captured for this operation."}</p></div> : events.map((event) => (
            <article className={`peek-event ${event.kind}`} key={event.sequence}>
              <div className="peek-event-icon"><EventIcon kind={event.kind} /></div>
              <div><header><strong>{event.source}</strong><span>{new Date(event.emittedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}</span></header><pre>{event.message}</pre></div>
            </article>
          ))}
          <div ref={end} />
        </div>
        <footer>This local preview is kept in memory only. Commands are summarized, process output is hidden, and credential-like text is redacted.</footer>
      </section>
    </div>
  );
}
