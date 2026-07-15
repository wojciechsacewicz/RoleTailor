import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { convertFileSrc } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import { ArrowDown, ArrowLeft, ArrowUp, Bold, Copy, Eye, FilePlus2, Hand, Italic, LayoutTemplate, List, LoaderCircle, MousePointer2, Move, Plus, Redo2, RotateCcw, Save, Send, Trash2, Type, Undo2, ZoomIn, ZoomOut } from "lucide-react";
import { backend } from "./lib/backend";
import type { EditorDocument } from "./lib/schema";
import DebugPeek from "./DebugPeek";

type ChatLine = { role: "user" | "assistant"; text: string };
type Effort = "low" | "medium" | "high";
type Model = "luna" | "terra" | "sol";
type EditorTool = "select" | "text" | "move" | "pan";

const efforts: Effort[] = ["low", "medium", "high"];
const annotationSelectors = {
  headline: ".hero-copy h1",
  contact: ".contact",
  proof: ".proof-strip",
  experience: ".main-column",
  profile: ".side-column > p",
  skills: ".skill-groups",
  education: ".side-column h2:nth-of-type(3)",
  projects: ".project-grid",
} as const;
const leftAnnotationTargets = new Set(["headline", "proof", "experience", "projects"]);

function previewHtml(document: EditorDocument) {
  const resolveAssets = (value: string) => value.replace(
    /\.\.\/assets\/([^"')\s]+)/g,
    (_match, name: string) => convertFileSrc(`${document.assetRoot}/${name}`),
  );
  const editorCss = `
    html, body { background: transparent !important; }
    body { position: relative; padding: 0 !important; }
    .language-switch { display: none !important; }
    .sheet { margin: 0 auto 24px !important; box-shadow: 0 3px 16px rgba(28, 40, 34, .16) !important; }
    .rt-review-target { position: relative; outline: 2px solid #4477d7 !important; outline-offset: 4px; }
    .rt-review-target[data-review-priority="2"] { outline-color: #16a3a3 !important; }
    .rt-review-target[data-review-priority="3"] { outline-color: #7856d8 !important; }
    .rt-selected { outline: 2px solid #3e7189 !important; outline-offset: 3px; }
    body[data-rt-tool="select"] .rt-editable, body[data-rt-tool="move"] .rt-editable { cursor: default; }
    body[data-rt-tool="text"] .rt-editable { cursor: text; }
    body[data-rt-tool="move"] .role, body[data-rt-tool="move"] .project, body[data-rt-tool="move"] .rt-custom-block { cursor: grab; }
    body[data-rt-tool="pan"], body[data-rt-tool="pan"] * { cursor: grab !important; user-select: none !important; }
    body[data-rt-panning="true"], body[data-rt-panning="true"] * { cursor: grabbing !important; }
    .rt-custom-block { margin: 16px 0; }
    .rt-annotation-card { position: absolute; z-index: 20; width: 202px; padding: 12px 12px 13px; border: 1px solid #d7dde3; border-radius: 12px; background: rgba(255,255,255,.97); box-shadow: 0 8px 24px rgba(17,24,32,.13); color: #26313c; font: 500 13px/1.35 Geist, Arial, sans-serif; }
    .rt-annotation-card b { display: grid; width: 23px; height: 23px; margin-bottom: 8px; place-items: center; border-radius: 50%; background: #315dba; color: white; font-size: 12px; }
    .rt-annotation-card strong { display: block; margin-bottom: 6px; font-size: 13px; line-height: 1.3; }
    .rt-annotation-card p { margin: 0; color: #5c6670; font-size: 11px; line-height: 1.4; }
    .rt-resolve-review { margin-top: 10px; padding: 5px 8px; border: 1px solid #cbd7d1; border-radius: 6px; background: #f4f8f6; color: #3f6a57; font: 600 10px/1 Geist, Arial, sans-serif; cursor: pointer; }
    .rt-resolve-review:hover { background: #e8f1ed; }
    .rt-resolve-review:disabled { opacity: .55; cursor: wait; }
  `;
  const style = `<style id="rt-editor-css">${resolveAssets(document.css)}\n${editorCss}</style>`;
  const html = document.html.replace(/<link[^>]+href=["']\.\/print\.css["'][^>]*>/i, style);
  return resolveAssets(html);
}

function serializeCanvas(doc: Document, editorDocument: EditorDocument) {
  const clone = doc.documentElement.cloneNode(true) as HTMLElement;
  clone.querySelectorAll(".rt-annotation-card").forEach((element) => element.remove());
  clone.querySelectorAll(".rt-editable,.rt-dragging,.rt-review-target,.rt-selected").forEach((element) => {
    element.classList.remove("rt-editable", "rt-dragging", "rt-review-target", "rt-selected");
    element.removeAttribute("data-review-priority");
    element.removeAttribute("contenteditable");
    element.removeAttribute("spellcheck");
  });
  clone.querySelector("body")?.removeAttribute("data-rt-tool");
  clone.querySelectorAll("[draggable]").forEach((element) => element.removeAttribute("draggable"));
  const style = clone.querySelector("#rt-editor-css");
  if (style) {
    const link = doc.createElement("link");
    link.rel = "stylesheet";
    link.href = "./print.css";
    style.replaceWith(link);
  }
  const assetNames = new Set(Array.from(
    `${editorDocument.html}\n${editorDocument.css}`.matchAll(/\.\.\/assets\/([^"')\s]+)/g),
    (match) => match[1],
  ));
  assetNames.forEach((name) => {
    clone.innerHTML = clone.innerHTML.replaceAll(convertFileSrc(`${editorDocument.assetRoot}/${name}`), `../assets/${name}`);
  });
  return `<!doctype html>\n${clone.outerHTML}`;
}

export default function CvEditor({ runId, onBack, onError }: { runId: string; onBack: () => void; onError: (error: unknown) => void }) {
  const iframe = useRef<HTMLIFrameElement>(null);
  const canvasViewport = useRef<HTMLDivElement>(null);
  const selectedElement = useRef<HTMLElement | null>(null);
  const undoStack = useRef<string[]>([]);
  const redoStack = useRef<string[]>([]);
  const toolRef = useRef<EditorTool>("select");
  const panState = useRef<{ x: number; y: number; left: number; top: number } | null>(null);
  const centeredCanvas = useRef(false);
  const [document, setDocument] = useState<EditorDocument | null>(null);
  const [language, setLanguage] = useState<"pl" | "en">("en");
  const [zoom, setZoom] = useState(0.72);
  const [documentHeight, setDocumentHeight] = useState(2400);
  const [dirty, setDirty] = useState(false);
  const [tool, setTool] = useState<EditorTool>("select");
  const [selectionName, setSelectionName] = useState("Nothing selected");
  const [, setHistoryVersion] = useState(0);
  const [resetArmed, setResetArmed] = useState(false);
  const [backArmed, setBackArmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [codexBusy, setCodexBusy] = useState(false);
  const [resolvingReview, setResolvingReview] = useState(false);
  const [peekOpen, setPeekOpen] = useState(false);
  const [model, setModel] = useState<Model>("luna");
  const [effort, setEffort] = useState<Effort>("medium");
  const [message, setMessage] = useState("");
  const [attachments, setAttachments] = useState<string[]>([]);
  const [gapInterviewStarted, setGapInterviewStarted] = useState(false);
  const [chat, setChat] = useState<ChatLine[]>([]);

  const changeZoom = useCallback((next: number | ((current: number) => number)) => {
    setZoom((current) => {
      const value = typeof next === "function" ? next(current) : next;
      return Math.min(1.4, Math.max(.4, value));
    });
  }, []);

  const beginPan = useCallback((x: number, y: number) => {
    const viewport = canvasViewport.current;
    if (!viewport) return;
    panState.current = { x, y, left: viewport.scrollLeft, top: viewport.scrollTop };
    viewport.classList.add("is-panning");
    const doc = iframe.current?.contentDocument;
    if (doc?.body) doc.body.dataset.rtPanning = "true";
  }, []);

  const movePan = useCallback((x: number, y: number) => {
    const viewport = canvasViewport.current;
    const start = panState.current;
    if (!viewport || !start) return;
    viewport.scrollLeft = start.left - (x - start.x);
    viewport.scrollTop = start.top - (y - start.y);
  }, []);

  const endPan = useCallback(() => {
    panState.current = null;
    canvasViewport.current?.classList.remove("is-panning");
    const doc = iframe.current?.contentDocument;
    if (doc?.body) delete doc.body.dataset.rtPanning;
  }, []);

  useEffect(() => {
    const viewport = canvasViewport.current;
    if (!viewport) return;
    const handleWheel = (event: WheelEvent) => {
      if (!event.ctrlKey && !event.metaKey) return;
      event.preventDefault();
      changeZoom((value) => value - event.deltaY * .001);
    };
    const handleMove = (event: PointerEvent) => movePan(event.screenX, event.screenY);
    viewport.addEventListener("wheel", handleWheel, { passive: false });
    window.addEventListener("pointermove", handleMove);
    window.addEventListener("pointerup", endPan);
    window.addEventListener("pointercancel", endPan);
    window.addEventListener("blur", endPan);
    return () => {
      viewport.removeEventListener("wheel", handleWheel);
      window.removeEventListener("pointermove", handleMove);
      window.removeEventListener("pointerup", endPan);
      window.removeEventListener("pointercancel", endPan);
      window.removeEventListener("blur", endPan);
      endPan();
    };
  }, [changeZoom, endPan, movePan]);

  useEffect(() => {
    setBusy(true);
    backend.loadEditor(runId).then((next) => {
      setDocument(next);
      setChat([{ role: "assistant", text: next.isBase ? "This is your Base CV. Update factual profile details in Settings; visual edits saved here become the starting point for new applications." : "Tell me what you want to improve. I will edit only this application CV." }]);
    }).catch(onError).finally(() => setBusy(false));
  }, [runId, onError]);

  const srcDoc = useMemo(() => document ? previewHtml(document) : "", [document]);

  const renderAnnotations = useCallback((doc: Document, activeLanguage: "pl" | "en") => {
    doc.querySelectorAll(".rt-annotation-card").forEach((element) => element.remove());
    doc.querySelectorAll(".rt-review-target").forEach((element) => {
      element.classList.remove("rt-review-target");
      element.removeAttribute("data-review-priority");
    });
    if (!document?.annotations.length) return;
    const languageRoot = doc.querySelector<HTMLElement>(`.language-${activeLanguage}`);
    if (!languageRoot) return;
    const lanes = new Map<string, number>();
    document.annotations.forEach((annotation, index) => {
      const target = languageRoot.querySelector<HTMLElement>(annotationSelectors[annotation.target]);
      const sheet = target?.closest<HTMLElement>(".sheet");
      if (!target || !sheet) return;
      target.classList.add("rt-review-target");
      target.dataset.reviewPriority = String(annotation.priority);
      const targetBox = target.getBoundingClientRect();
      const sheetBox = sheet.getBoundingClientRect();
      const side = leftAnnotationTargets.has(annotation.target) ? "left" : "right";
      const laneKey = `${sheet.offsetTop}-${side}`;
      const naturalTop = targetBox.top + (doc.defaultView?.scrollY ?? 0);
      const top = Math.max(naturalTop, (lanes.get(laneKey) ?? sheetBox.top) + 10);
      lanes.set(laneKey, top + 118);
      const card = doc.createElement("aside");
      card.className = `rt-annotation-card rt-annotation-${side}`;
      card.style.top = `${top}px`;
      card.style.left = side === "left" ? `${Math.max(12, sheetBox.left - 220)}px` : `${sheetBox.right + 16}px`;
      card.innerHTML = `<b>${index + 1}</b><strong></strong><p></p><button type="button" class="rt-resolve-review">✓ Resolve</button>`;
      const strong = card.querySelector("strong");
      const paragraph = card.querySelector("p");
      if (strong) strong.textContent = annotation.title;
      if (paragraph) paragraph.textContent = annotation.comment;
      const resolve = card.querySelector<HTMLButtonElement>(".rt-resolve-review");
      if (resolve && (busy || resolvingReview)) {
        resolve.disabled = true;
        resolve.textContent = "Working…";
      }
      resolve?.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        resolve.disabled = true;
        resolve.textContent = "Resolving…";
        setResolvingReview(true);
        void backend.resolveCvAnnotation(runId, annotation).then((next) => {
          selectedElement.current = null;
          setSelectionName("Nothing selected");
          setDocument((current) => current ? { ...current, annotations: next.annotations } : next);
        }).catch((error) => {
          resolve.disabled = false;
          resolve.textContent = "✓ Resolve";
          onError(error);
        }).finally(() => setResolvingReview(false));
      });
      doc.body.append(card);
    });
  }, [busy, document, onError, resolvingReview, runId]);

  const prepareCanvas = () => {
    const doc = iframe.current?.contentDocument;
    if (!doc) return;
    const measureDocument = () => {
      setDocumentHeight(Math.max(
        doc.documentElement.scrollHeight,
        doc.body?.scrollHeight ?? 0,
        Math.ceil(doc.body?.getBoundingClientRect().height ?? 0),
      ));
    };
    doc.documentElement.dataset.lang = language;
    doc.documentElement.lang = language;
    if (doc.body) doc.body.dataset.rtTool = toolRef.current;
    doc.addEventListener("wheel", (event) => {
      event.preventDefault();
      if (event.ctrlKey || event.metaKey) {
        changeZoom((value) => value - event.deltaY * .001);
        return;
      }
      canvasViewport.current?.scrollBy({
        left: event.shiftKey ? event.deltaY : event.deltaX,
        top: event.shiftKey ? 0 : event.deltaY,
      });
    }, { capture: true, passive: false });
    doc.addEventListener("pointerdown", (event) => {
      if (toolRef.current !== "pan" && event.button !== 1) return;
      event.preventDefault();
      (event.target as Element).setPointerCapture?.(event.pointerId);
      beginPan(event.screenX, event.screenY);
    }, true);
    doc.addEventListener("pointermove", (event) => movePan(event.screenX, event.screenY), true);
    doc.addEventListener("pointerup", endPan, true);
    doc.addEventListener("pointercancel", endPan, true);
    doc.querySelectorAll<HTMLAnchorElement>("[data-set-lang]").forEach((link) => {
      link.addEventListener("click", (event) => {
        event.preventDefault();
        const next = link.dataset.setLang === "en" ? "en" : "pl";
        setLanguage(next);
        doc.documentElement.dataset.lang = next;
        doc.documentElement.lang = next;
      });
    });
    const editableSelector = "h1,h2,h3,p,li,dt,dd,time,address a,address span,.stack,.project-head a,.portfolio-link,.cv-footer a,.rt-custom-block";
    doc.querySelectorAll<HTMLElement>(editableSelector).forEach((element) => {
      element.contentEditable = toolRef.current === "text" ? "true" : "false";
      element.spellcheck = true;
      element.classList.add("rt-editable");
    });
    const select = (element: HTMLElement | null) => {
      selectedElement.current?.classList.remove("rt-selected");
      selectedElement.current = element;
      element?.classList.add("rt-selected");
      setSelectionName(element ? element.dataset.rtName || element.getAttribute("aria-label") || element.tagName.toLowerCase() : "Nothing selected");
    };
    doc.addEventListener("click", (event) => {
      if (toolRef.current === "pan") {
        event.preventDefault();
        return;
      }
      const target = event.target as HTMLElement;
      const candidate = toolRef.current === "move"
        ? target.closest<HTMLElement>(".role,.project,.rt-custom-block")
        : target.closest<HTMLElement>(editableSelector);
      if (!candidate || !candidate.closest(`.language-${doc.documentElement.dataset.lang}`)) return;
      select(candidate);
      if (toolRef.current !== "text" || target.closest("a")) event.preventDefault();
    }, true);
    let editing = false;
    doc.addEventListener("focusin", (event) => {
      if (editing || !(event.target as HTMLElement).matches(editableSelector) || !document) return;
      undoStack.current.push(serializeCanvas(doc, document));
      redoStack.current = [];
      setHistoryVersion((value) => value + 1);
      editing = true;
    });
    doc.addEventListener("focusout", () => { editing = false; });
    let dragged: HTMLElement | null = null;
    doc.querySelectorAll<HTMLElement>(".role,.project,.rt-custom-block").forEach((element) => {
      element.draggable = true;
      element.addEventListener("dragstart", (event) => {
        if (toolRef.current !== "move") { event.preventDefault(); return; }
        dragged = element; element.classList.add("rt-dragging");
      });
      element.addEventListener("dragend", () => { element.classList.remove("rt-dragging"); dragged = null; });
      element.addEventListener("dragover", (event) => event.preventDefault());
      element.addEventListener("drop", (event) => {
        event.preventDefault();
        if (dragged && dragged !== element && dragged.parentElement === element.parentElement) {
          if (document) undoStack.current.push(serializeCanvas(doc, document));
          redoStack.current = [];
          const box = element.getBoundingClientRect();
          const after = event.clientY > box.top + box.height / 2;
          element.parentElement?.insertBefore(dragged, after ? element.nextSibling : element);
          setDirty(true);
          setBackArmed(false);
          setHistoryVersion((value) => value + 1);
        }
      });
    });
    doc.addEventListener("input", () => { setDirty(true); setBackArmed(false); });
    renderAnnotations(doc, language);
    measureDocument();
    if (!centeredCanvas.current) {
      centeredCanvas.current = true;
      requestAnimationFrame(() => {
        const viewport = canvasViewport.current;
        if (!viewport) return;
        viewport.scrollLeft = Math.max(0, (viewport.scrollWidth - viewport.clientWidth) / 2);
        viewport.scrollTop = 140;
      });
    }
    doc.fonts.ready.then(() => { measureDocument(); renderAnnotations(doc, language); }).catch(() => undefined);
    new ResizeObserver(measureDocument).observe(doc.body);
  };

  useEffect(() => {
    const doc = iframe.current?.contentDocument;
    if (doc) {
      doc.documentElement.dataset.lang = language;
      doc.documentElement.lang = language;
      renderAnnotations(doc, language);
    }
  }, [language, renderAnnotations]);

  useEffect(() => {
    toolRef.current = tool;
    const doc = iframe.current?.contentDocument;
    if (!doc?.body) return;
    doc.body.dataset.rtTool = tool;
    doc.querySelectorAll<HTMLElement>(".rt-editable").forEach((element) => {
      element.contentEditable = tool === "text" ? "true" : "false";
    });
  }, [tool]);

  const serialize = () => {
    const doc = iframe.current?.contentDocument;
    if (!doc || !document) throw new Error("CV canvas is not ready");
    return serializeCanvas(doc, document);
  };

  const remember = () => {
    undoStack.current.push(serialize());
    if (undoStack.current.length > 40) undoStack.current.shift();
    redoStack.current = [];
    setHistoryVersion((value) => value + 1);
    setBackArmed(false);
  };

  const clearSelection = () => {
    selectedElement.current?.classList.remove("rt-selected");
    selectedElement.current = null;
    setSelectionName("Nothing selected");
  };

  const restore = (html: string) => {
    if (!document) return;
    clearSelection();
    setDocument({ ...document, html });
    setDirty(true);
    setHistoryVersion((value) => value + 1);
  };

  const undo = () => {
    const previous = undoStack.current.pop();
    if (!previous) return;
    redoStack.current.push(serialize());
    restore(previous);
  };

  const redo = () => {
    const next = redoStack.current.pop();
    if (!next) return;
    undoStack.current.push(serialize());
    restore(next);
  };

  const mutateSelected = (action: "duplicate" | "delete" | "up" | "down") => {
    const element = selectedElement.current;
    if (!element?.parentElement) return;
    remember();
    if (action === "duplicate") {
      const clone = element.cloneNode(true) as HTMLElement;
      clone.classList.remove("rt-selected");
      element.after(clone);
    }
    if (action === "delete") element.remove();
    if (action === "up" && element.previousElementSibling) element.parentElement.insertBefore(element, element.previousElementSibling);
    if (action === "down" && element.nextElementSibling) element.parentElement.insertBefore(element.nextElementSibling, element);
    if (action === "delete") {
      selectedElement.current = null;
      setSelectionName("Nothing selected");
    }
    setDirty(true);
  };

  const addBlock = (kind: "text" | "section") => {
    const doc = iframe.current?.contentDocument;
    if (!doc) return;
    const root = doc.querySelector<HTMLElement>(`.language-${language} .main-column`) || doc.querySelector<HTMLElement>(`.language-${language} .sheet`);
    if (!root) return;
    remember();
    const block = doc.createElement(kind === "section" ? "section" : "p");
    block.className = "rt-custom-block rt-editable";
    block.contentEditable = "true";
    block.spellcheck = true;
    block.innerHTML = kind === "section" ? "<h2>New section</h2><p>Add your content here.</p>" : "Add your text here.";
    root.append(block);
    selectedElement.current?.classList.remove("rt-selected");
    selectedElement.current = block;
    block.classList.add("rt-selected");
    setSelectionName(kind === "section" ? "New section" : "New text");
    setTool("text");
    setDirty(true);
    block.focus();
  };

  const formatSelection = (command: "bold" | "italic" | "insertUnorderedList") => {
    const doc = iframe.current?.contentDocument;
    if (!doc) return;
    remember();
    doc.execCommand(command);
    setDirty(true);
  };

  const save = async () => {
    setBusy(true);
    try {
      const next = await backend.saveEditor(runId, serialize());
      clearSelection(); setDocument(next); setDirty(false); setBackArmed(false);
    } catch (value) { onError(value); }
    finally { setBusy(false); }
  };

  const resetBase = async () => {
    if (!resetArmed) {
      setResetArmed(true);
      window.setTimeout(() => setResetArmed(false), 3500);
      return;
    }
    setBusy(true);
    try {
      const next = await backend.resetBaseEditor();
      clearSelection();
      setDocument(next);
      setDirty(false);
      undoStack.current = [];
      redoStack.current = [];
      setResetArmed(false);
      setBackArmed(false);
    } catch (value) { onError(value); }
    finally { setBusy(false); }
  };

  const leaveEditor = () => {
    if (busy) return;
    if (dirty && !backArmed) {
      setBackArmed(true);
      window.setTimeout(() => setBackArmed(false), 3500);
      return;
    }
    onBack();
  };

  const attach = async () => {
    const picked = await open({ multiple: true, directory: false });
    if (!picked) return;
    setAttachments(Array.isArray(picked) ? picked : [picked]);
  };

  const send = async (override?: string, intent: "edit" | "gap-interview" = "edit") => {
    const text = (override ?? message).trim();
    if (!text || busy || resolvingReview) return;
    setChat((lines) => [...lines, { role: "user", text }]);
    setMessage(""); setBusy(true); setCodexBusy(true);
    if (intent === "gap-interview") setGapInterviewStarted(true);
    try {
      if (dirty) await backend.saveEditor(runId, serialize());
      const reply = await backend.editorChat(runId, text, chat, attachments, model, effort, intent);
      clearSelection(); setDocument(reply.document); setDirty(false); setAttachments([]); setBackArmed(false);
      setChat((lines) => [...lines, { role: "assistant", text: reply.message || "CV updated and PDF rebuilt." }]);
    } catch (value) { onError(value); }
    finally { setBusy(false); setCodexBusy(false); }
  };

  return (
    <div className="cv-editor-screen">
      <header className="editor-header">
        <button className={backArmed ? "confirm-leave" : ""} disabled={busy} onClick={leaveEditor}><ArrowLeft /> {backArmed ? "Discard changes?" : "Back"}</button>
        <div><strong>{document?.isBase ? "Base CV Editor" : "Application CV Editor"}</strong><span>{dirty ? "Unsaved changes" : document?.isBase ? "Source for every new application" : "Application workspace"}</span></div>
        <div className="editor-header-actions">
          <button className="peek-trigger" onClick={() => setPeekOpen(true)}><Eye /> Take a peek</button>
          <button className="editor-save" disabled={!dirty || busy || resolvingReview} onClick={() => void save()}>{busy ? <LoaderCircle className="spin" /> : <Save />} Save & build</button>
        </div>
      </header>
      <div className="editor-body">
        <section className="canvas-panel">
          <div className="canvas-toolbar">
            <div className="language-pill"><button className={language === "pl" ? "active" : ""} onClick={() => setLanguage("pl")}>PL</button><button className={language === "en" ? "active" : ""} onClick={() => setLanguage("en")}>EN</button></div>
            <div className="editor-tool-group">
              <button title="Select" className={tool === "select" ? "active" : ""} onClick={() => setTool("select")}><MousePointer2 /></button>
              <button title="Edit text" className={tool === "text" ? "active" : ""} onClick={() => setTool("text")}><Type /></button>
              <button title="Move and reorder blocks" className={tool === "move" ? "active" : ""} onClick={() => setTool("move")}><Move /></button>
              <button title="Pan canvas" className={tool === "pan" ? "active" : ""} onClick={() => setTool("pan")}><Hand /></button>
            </div>
            <div className="editor-tool-group">
              <button title="Add text" onClick={() => addBlock("text")}><Type /><Plus /></button>
              <button title="Add section" onClick={() => addBlock("section")}><LayoutTemplate /><Plus /></button>
              <button title="Bold selected text" onClick={() => formatSelection("bold")}><Bold /></button>
              <button title="Italic selected text" onClick={() => formatSelection("italic")}><Italic /></button>
              <button title="Bulleted list" onClick={() => formatSelection("insertUnorderedList")}><List /></button>
            </div>
            <div className="editor-tool-group">
              <button title="Move block up" disabled={!selectedElement.current} onClick={() => mutateSelected("up")}><ArrowUp /></button>
              <button title="Move block down" disabled={!selectedElement.current} onClick={() => mutateSelected("down")}><ArrowDown /></button>
              <button title="Duplicate selected block" disabled={!selectedElement.current} onClick={() => mutateSelected("duplicate")}><Copy /></button>
              <button title="Delete selected block" disabled={!selectedElement.current} onClick={() => mutateSelected("delete")}><Trash2 /></button>
            </div>
            <div className="editor-tool-group">
              <button title="Undo" disabled={undoStack.current.length === 0} onClick={undo}><Undo2 /></button>
              <button title="Redo" disabled={redoStack.current.length === 0} onClick={redo}><Redo2 /></button>
            </div>
            <span className="selection-status">{selectionName}</span>
            {document?.pdfPath && <button onClick={() => void backend.openArtifact(document.pdfPath!)}>Open PDF</button>}
            {document?.isBase && <button className={resetArmed ? "danger armed" : ""} onClick={() => void resetBase()}><RotateCcw />{resetArmed ? "Tap again to reset" : "Reset base"}</button>}
          </div>
          <div
            className="canvas-viewport"
            ref={canvasViewport}
            onPointerDown={(event) => {
              if (tool !== "pan" && event.button !== 1) return;
              if (event.target !== event.currentTarget && !(event.target as HTMLElement).classList.contains("canvas-world")) return;
              event.preventDefault();
              event.currentTarget.setPointerCapture(event.pointerId);
              beginPan(event.screenX, event.screenY);
            }}
            onPointerMove={(event) => movePan(event.screenX, event.screenY)}
            onPointerUp={endPan}
            onPointerCancel={endPan}
          >
            <div className="canvas-zoom" aria-label="Canvas zoom controls">
              <button title="Zoom out" onClick={() => changeZoom((value) => value - .08)}><ZoomOut /></button>
              <input aria-label="Canvas zoom" type="range" min="0.4" max="1.4" step="0.01" value={zoom} onChange={(event) => changeZoom(Number(event.target.value))} />
              <span>{Math.round(zoom * 100)}%</span>
              <button title="Zoom in" onClick={() => changeZoom((value) => value + .08)}><ZoomIn /></button>
            </div>
            {document ? <div className="canvas-world" style={{ width: 1280 * zoom + 800, height: documentHeight * zoom + 480 }}><div className="canvas-scale" style={{ width: 1280 * zoom, height: documentHeight * zoom }}><iframe ref={iframe} title="Editable CV" sandbox="allow-same-origin" srcDoc={srcDoc} onLoad={prepareCanvas} scrolling="no" style={{ height: documentHeight, transform: `scale(${zoom})` }} /></div></div> : <LoaderCircle className="spin canvas-loader" />}
          </div>
        </section>
        <aside className="editor-chat">
          <div className="chat-settings">
            <label>Model<select value={model} onChange={(event) => setModel(event.target.value as Model)}><option value="luna">GPT-5.6 Luna</option><option value="terra">GPT-5.6 Terra</option><option value="sol">GPT-5.6 Sol</option></select></label>
            <label>Effort <strong>{effort}</strong><input type="range" min="0" max="2" step="1" value={efforts.indexOf(effort)} onChange={(event) => setEffort(efforts[Number(event.target.value)])} /><span className="effort-labels"><i>Low</i><i>Medium</i><i>High</i></span></label>
          </div>
          <div className="chat-log">
            {chat.map((line, index) => <div className={`chat-line ${line.role}`} key={`${line.role}-${index}`}>{line.text}</div>)}
            {document && !document.isBase && document.fitGaps.length > 0 && !gapInterviewStarted && <button className="gap-helper" disabled={busy || resolvingReview} onClick={() => void send(`Help me fix these analysis findings:\n${document.fitGaps.map((gap) => `- ${gap}`).join("\n")}`, "gap-interview")}>Help me fix missing stuff</button>}
            {busy && <div className="chat-line assistant working"><LoaderCircle className="spin" /> {document?.isBase ? "Updating your Base CV…" : "Working in the application CV…"}</div>}
          </div>
          {attachments.length > 0 && <div className="attachment-list">{attachments.map((path) => <span key={path}>{path.split("/").pop()}</span>)}</div>}
          <div className="chat-composer">
            <textarea value={message} onChange={(event) => setMessage(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); void send(); } }} placeholder="Shorten the profile, move the strongest project first, rewrite this bullet…" />
            <div><button title="Attach files" disabled={resolvingReview} onClick={() => void attach()}><FilePlus2 /></button><button className="send" disabled={!message.trim() || busy || resolvingReview} onClick={() => void send()}><Send /></button></div>
          </div>
        </aside>
      </div>
      <DebugPeek contextId={runId} open={peekOpen} working={codexBusy} onClose={() => setPeekOpen(false)} />
    </div>
  );
}
