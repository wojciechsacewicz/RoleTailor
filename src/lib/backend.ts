import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import type { AnalysisProfile, CvReview, DebugEvent, EditorChatLine, EditorChatReply, EditorDocument, JobPreview, RunResult, RunSummary, SetupState, UserProfile } from "./schema";
import { resultSchema } from "./schema";
export const backend = {
  setup: () => invoke<SetupState>("setup_state"),
  saveProfile: (profile: UserProfile, photoPath?: string | null) =>
    invoke<SetupState>("save_user_profile", { profile, photoPath: photoPath ?? null }),
  chooseProfilePhoto: () => invoke<string | null>("choose_profile_photo"),
  chooseWritingProfile: () => invoke<string | null>("choose_writing_profile"),
  login: () =>
    invoke<{ authUrl: string; loginId: string }>(
      "login_chatgpt",
    ),
  cancelLogin: (loginId: string) =>
    invoke<void>("cancel_chatgpt_login", { loginId }),
  fetchJob: (url: string) => invoke<JobPreview>("fetch_job", { url }),
  cleanupJob: (job: JobPreview) => invoke<JobPreview>("cleanup_job", { job }),
  startRun: (job: JobPreview, language: "auto" | "pl" | "en", analysisProfile: AnalysisProfile) =>
    invoke<string>("start_run", { job, language, analysisProfile }),
  openBaseEditor: () => invoke<string>("open_base_editor"),
  resetBaseEditor: () => invoke<EditorDocument>("reset_base_editor"),
  cancelRun: (runId: string) => invoke<void>("cancel_run", { runId }),
  deleteRun: (runId: string) => invoke<void>("delete_run", { runId }),
  history: () => invoke<RunSummary[]>("list_runs"),
  archivedHistory: () => invoke<RunSummary[]>("list_archived_runs"),
  setArchived: (runId: string, archived: boolean) => invoke<void>("set_run_archived", { runId, archived }),
  loadEditor: (runId: string) => invoke<EditorDocument>("load_editor", { runId }),
  saveEditor: (runId: string, html: string) => invoke<EditorDocument>("save_editor", { runId, html }),
  editorChat: (runId: string, message: string, history: EditorChatLine[], attachmentPaths: string[], model: "luna"|"terra"|"sol", effort: "low"|"medium"|"high", intent: "edit"|"gap-interview" = "edit") => invoke<EditorChatReply>("editor_chat", { runId, message, history, attachmentPaths, model, effort, intent }),
  resolveCvAnnotation: (runId: string, annotation: CvReview) => invoke<EditorDocument>("resolve_cv_annotation", { runId, annotation }),
  debugLog: (contextId: string) => invoke<DebugEvent[]>("debug_log", { contextId }),
  openArtifact: (path: string) => invoke<void>("open_artifact", { path }),
  revealArtifact: (path: string) => invoke<void>("reveal_artifact", { path }),
};
export const onRunEvent = (
  cb: (event: {
    runId: string;
    status?: RunSummary["status"];
    message: string;
    result?: unknown;
    error?: string;
    emittedAt: string;
  }) => void,
) => listen("run-event", (e) => cb(e.payload as never));
export const onAuthChanged = (
  cb: (event: { loginId: string; authenticated: boolean; error?: string | null }) => void,
) => listen("auth-changed", (event) => cb(event.payload as never));
export const onDebugEvent = (cb: (event: DebugEvent) => void) =>
  listen("codex-debug-event", (event) => cb(event.payload as DebugEvent));
export const parseResult = (value: unknown): RunResult =>
  resultSchema.parse(value);
