import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { openUrl } from "@tauri-apps/plugin-opener";
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  BriefcaseBusiness,
  Check,
  CircleUserRound,
  FileHeart,
  GraduationCap,
  ImagePlus,
  FileUp,
  Languages,
  LoaderCircle,
  LockKeyhole,
  Plus,
  Rocket,
  ShieldCheck,
  Sparkles,
  Trash2,
  X,
} from "lucide-react";
import { backend, onAuthChanged } from "./lib/backend";
import type {
  EducationEntry,
  ExperienceEntry,
  LanguageEntry,
  ProjectEntry,
  SetupState,
  UserProfile,
} from "./lib/schema";
import "./onboarding.css";

const isTauri = () => "__TAURI_INTERNALS__" in window;

const emptyProfile = (): UserProfile => ({
  fullName: "",
  email: "",
  phone: "",
  location: "",
  linkedin: "",
  portfolio: "",
  github: "",
  headline: "",
  summary: "",
  targetRoles: [],
  skills: [],
  experiences: [],
  education: [],
  projects: [],
  languages: [],
  achievements: [],
  preferredLanguage: "en",
  writingTone: "direct",
  writingNotes: "",
  additionalFacts: "",
});

const blankExperience = (): ExperienceEntry => ({ role: "", company: "", location: "", startDate: "", endDate: "", current: false, highlights: [] });
const blankEducation = (): EducationEntry => ({ school: "", degree: "", field: "", startDate: "", endDate: "" });
const blankProject = (): ProjectEntry => ({ name: "", url: "", description: "", highlights: [], technologies: [] });
const blankLanguage = (): LanguageEntry => ({ name: "", proficiency: "" });
const splitLines = (value: string) => value.split("\n").map((item) => item.trim()).filter(Boolean);
const validOptionalUrl = (value?: string) => {
  if (!value?.trim()) return true;
  try { return ["http:", "https:"].includes(new URL(value).protocol); } catch { return false; }
};

const steps = [
  { label: "Welcome", icon: Sparkles },
  { label: "About you", icon: CircleUserRound },
  { label: "Direction", icon: Rocket },
  { label: "Experience", icon: BriefcaseBusiness },
  { label: "Education", icon: GraduationCap },
  { label: "Projects", icon: FileHeart },
  { label: "Preferences", icon: Languages },
  { label: "Ready", icon: ShieldCheck },
];

function TextField({ label, value, onChange, placeholder, type = "text", required, hint }: { label:string; value:string; onChange:(value:string)=>void; placeholder?:string; type?:string; required?:boolean; hint?:string }) {
  return <label className="onboarding-field"><span>{label}{required ? <em>Required</em> : null}</span><input type={type} value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} required={required} />{hint ? <small>{hint}</small> : null}</label>;
}

function TextAreaField({ label, value, onChange, placeholder, required, hint, rows = 4 }: { label:string; value:string; onChange:(value:string)=>void; placeholder?:string; required?:boolean; hint?:string; rows?:number }) {
  return <label className="onboarding-field"><span>{label}{required ? <em>Required</em> : null}</span><textarea value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} required={required} rows={rows} />{hint ? <small>{hint}</small> : null}</label>;
}

function ListField({ label, values, onChange, placeholder, hint }: { label:string; values:string[]; onChange:(values:string[])=>void; placeholder:string; hint?:string }) {
  const [draft, setDraft] = useState(values.join("\n"));
  useEffect(() => {
    const normalized = values.join("\n");
    if (splitLines(draft).join("\n") !== normalized) setDraft(normalized);
  }, [draft, values]);
  return <TextAreaField label={label} value={draft} onChange={(value) => { setDraft(value); onChange(splitLines(value)); }} placeholder={placeholder} hint={hint || "One item per line."} rows={4} />;
}

function EmptyCollection({ children, onAdd }: { children:React.ReactNode; onAdd:()=>void }) {
  return <button type="button" className="onboarding-empty" onClick={onAdd}><Plus />{children}</button>;
}

function RemoveButton({ onClick, label }: { onClick:()=>void; label:string }) {
  return <button type="button" className="collection-remove" onClick={onClick} aria-label={label}><Trash2 /></button>;
}

function StepIntro() {
  return <div className="onboarding-intro">
    <div className="onboarding-orbit" aria-hidden="true"><span /><span /><span /></div>
    <p className="onboarding-kicker"><LockKeyhole /> Private by design</p>
    <h1>Build a CV workspace<br />that starts with <i>you.</i></h1>
    <p>RoleTailor creates a private career profile on this device, then uses it to tailor honest, role-specific applications. You stay in control of the facts, wording and files it works from.</p>
    <div className="privacy-points">
      <div><ShieldCheck /><span><strong>Local profile</strong>Your career data stays in RoleTailor's application folder.</span></div>
      <div><Sparkles /><span><strong>Your facts only</strong>Every generated claim must trace back to information you provide.</span></div>
      <div><Rocket /><span><strong>Reusable base CV</strong>Update once, then tailor a fresh copy for each application.</span></div>
    </div>
  </div>;
}

function StepBasics({ profile, update, photoPath, onPhoto }: { profile:UserProfile; update:(patch:Partial<UserProfile>)=>void; photoPath:string|null; onPhoto:()=>void }) {
  return <div>
    <header className="step-heading"><p>01 · About you</p><h2>Let's get the essentials right.</h2><span>These details appear in your CV header. Optional fields can stay blank.</span></header>
    <div className="field-grid two">
      <TextField label="Full name" value={profile.fullName} onChange={(fullName) => update({ fullName })} placeholder="Alex Morgan" required />
      <TextField label="Email" type="email" value={profile.email} onChange={(email) => update({ email })} placeholder="alex@example.com" required />
      <TextField label="Phone" type="tel" value={profile.phone || ""} onChange={(phone) => update({ phone })} placeholder="+48 500 000 000" />
      <TextField label="Location" value={profile.location || ""} onChange={(location) => update({ location })} placeholder="Warsaw, Poland · Remote" />
      <TextField label="LinkedIn" type="url" value={profile.linkedin || ""} onChange={(linkedin) => update({ linkedin })} placeholder="https://linkedin.com/in/..." />
      <TextField label="Portfolio" type="url" value={profile.portfolio || ""} onChange={(portfolio) => update({ portfolio })} placeholder="https://your-site.com" />
      <TextField label="GitHub" type="url" value={profile.github || ""} onChange={(github) => update({ github })} placeholder="https://github.com/..." />
      <div className="photo-picker"><span>Portrait <em>Optional</em></span><button type="button" onClick={onPhoto}><ImagePlus />{photoPath ? photoPath.split("/").at(-1) : profile.photoFilename ? "Replace current photo" : "Choose a photo"}</button><small>Stored only in your local CV workspace.</small></div>
    </div>
  </div>;
}

function StepDirection({ profile, update }: { profile:UserProfile; update:(patch:Partial<UserProfile>)=>void }) {
  return <div>
    <header className="step-heading"><p>02 · Direction</p><h2>Tell recruiters where you're going.</h2><span>Use language you can defend in an interview. RoleTailor will sharpen it for each listing.</span></header>
    <TextField label="Professional headline" value={profile.headline} onChange={(headline) => update({ headline })} placeholder="Product engineer building reliable AI workflows" required />
    <TextAreaField label="Professional summary" value={profile.summary} onChange={(summary) => update({ summary })} placeholder="What do you build, who do you help, and what makes your work credible?" required rows={5} />
    <div className="field-grid two">
      <ListField label="Target roles" values={profile.targetRoles} onChange={(targetRoles) => update({ targetRoles })} placeholder={"Product Engineer\nAI Engineer\nFrontend Developer"} />
      <ListField label="Skills and tools" values={profile.skills} onChange={(skills) => update({ skills })} placeholder={"TypeScript\nReact\nPython\nPostgreSQL"} hint="Include only skills you would be comfortable discussing." />
    </div>
  </div>;
}

function StepExperience({ profile, update }: { profile:UserProfile; update:(patch:Partial<UserProfile>)=>void }) {
  const setEntry = (index:number, patch:Partial<ExperienceEntry>) => update({ experiences: profile.experiences.map((entry, position) => position === index ? { ...entry, ...patch } : entry) });
  const add = () => update({ experiences: [...profile.experiences, blankExperience()] });
  return <div>
    <header className="step-heading"><p>03 · Experience</p><h2>Add the work that proves your claims.</h2><span>Jobs, internships, freelance work and substantial volunteer roles all belong here.</span></header>
    {profile.experiences.length === 0 ? <EmptyCollection onAdd={add}>Add your first experience</EmptyCollection> : <div className="collection-list">{profile.experiences.map((entry, index) => <section className="collection-card" key={index}>
      <div className="collection-title"><strong>Experience {index + 1}</strong><RemoveButton label={`Remove experience ${index + 1}`} onClick={() => update({ experiences: profile.experiences.filter((_, position) => position !== index) })} /></div>
      <div className="field-grid two"><TextField label="Role" value={entry.role} onChange={(role) => setEntry(index, { role })} placeholder="Software Engineer" /><TextField label="Company" value={entry.company} onChange={(company) => setEntry(index, { company })} placeholder="Company name" /><TextField label="Location" value={entry.location || ""} onChange={(location) => setEntry(index, { location })} placeholder="City · Remote" /><div className="date-grid"><TextField label="Start" value={entry.startDate} onChange={(startDate) => setEntry(index, { startDate })} placeholder="2024-02" /><TextField label="End" value={entry.endDate || ""} onChange={(endDate) => setEntry(index, { endDate })} placeholder="2026-04" /></div></div>
      <label className="check-field"><input type="checkbox" checked={entry.current} onChange={(event) => setEntry(index, { current: event.target.checked, endDate: event.target.checked ? "" : entry.endDate })} /><span><Check />I currently work here</span></label>
      <ListField label="Evidence and outcomes" values={entry.highlights} onChange={(highlights) => setEntry(index, { highlights })} placeholder={"Shipped ...\nReduced ... by ...\nOwned ..."} hint="One factual contribution or measurable outcome per line." />
    </section>)}</div>}
    {profile.experiences.length > 0 ? <button type="button" className="add-row" onClick={add}><Plus />Add another experience</button> : null}
  </div>;
}

function StepEducation({ profile, update }: { profile:UserProfile; update:(patch:Partial<UserProfile>)=>void }) {
  const setEntry = (index:number, patch:Partial<EducationEntry>) => update({ education: profile.education.map((entry, position) => position === index ? { ...entry, ...patch } : entry) });
  const add = () => update({ education: [...profile.education, blankEducation()] });
  return <div>
    <header className="step-heading"><p>04 · Education</p><h2>Capture your learning path.</h2><span>Formal education is optional. Add certifications and focused programmes under achievements on the next steps.</span></header>
    {profile.education.length === 0 ? <EmptyCollection onAdd={add}>Add education</EmptyCollection> : <div className="collection-list">{profile.education.map((entry, index) => <section className="collection-card" key={index}>
      <div className="collection-title"><strong>Education {index + 1}</strong><RemoveButton label={`Remove education ${index + 1}`} onClick={() => update({ education: profile.education.filter((_, position) => position !== index) })} /></div>
      <div className="field-grid two"><TextField label="School" value={entry.school} onChange={(school) => setEntry(index, { school })} placeholder="University or programme" /><TextField label="Degree" value={entry.degree} onChange={(degree) => setEntry(index, { degree })} placeholder="BSc, bootcamp, certificate" /><TextField label="Field" value={entry.field || ""} onChange={(field) => setEntry(index, { field })} placeholder="Computer Science" /><div className="date-grid"><TextField label="Start" value={entry.startDate || ""} onChange={(startDate) => setEntry(index, { startDate })} placeholder="2022" /><TextField label="End" value={entry.endDate || ""} onChange={(endDate) => setEntry(index, { endDate })} placeholder="2026" /></div></div>
    </section>)}</div>}
    {profile.education.length > 0 ? <button type="button" className="add-row" onClick={add}><Plus />Add another</button> : null}
  </div>;
}

function StepProjects({ profile, update }: { profile:UserProfile; update:(patch:Partial<UserProfile>)=>void }) {
  const setEntry = (index:number, patch:Partial<ProjectEntry>) => update({ projects: profile.projects.map((entry, position) => position === index ? { ...entry, ...patch } : entry) });
  const add = () => update({ projects: [...profile.projects, blankProject()] });
  return <div>
    <header className="step-heading"><p>05 · Projects</p><h2>Show work people can understand.</h2><span>Personal products, open source and strong case studies can carry as much weight as a job title.</span></header>
    {profile.projects.length === 0 ? <EmptyCollection onAdd={add}>Add a project</EmptyCollection> : <div className="collection-list">{profile.projects.map((entry, index) => <section className="collection-card" key={index}>
      <div className="collection-title"><strong>Project {index + 1}</strong><RemoveButton label={`Remove project ${index + 1}`} onClick={() => update({ projects: profile.projects.filter((_, position) => position !== index) })} /></div>
      <div className="field-grid two"><TextField label="Name" value={entry.name} onChange={(name) => setEntry(index, { name })} placeholder="Project name" /><TextField label="Link" type="url" value={entry.url || ""} onChange={(url) => setEntry(index, { url })} placeholder="https://..." /></div>
      <TextAreaField label="What it is" value={entry.description} onChange={(description) => setEntry(index, { description })} placeholder="Who it serves and what problem it solves." rows={3} />
      <div className="field-grid two"><ListField label="Highlights" values={entry.highlights} onChange={(highlights) => setEntry(index, { highlights })} placeholder={"Built ...\nReached ...\nImproved ..."} /><ListField label="Technologies" values={entry.technologies} onChange={(technologies) => setEntry(index, { technologies })} placeholder={"React\nNode.js\nPostgreSQL"} /></div>
    </section>)}</div>}
    {profile.projects.length > 0 ? <button type="button" className="add-row" onClick={add}><Plus />Add another project</button> : null}
  </div>;
}

function StepPreferences({ profile, update, onImportWritingProfile }: { profile:UserProfile; update:(patch:Partial<UserProfile>)=>void; onImportWritingProfile:()=>void }) {
  const [tutorialOpen, setTutorialOpen] = useState(false);
  const addLanguage = () => update({ languages: [...profile.languages, blankLanguage()] });
  const setLanguage = (index:number, patch:Partial<LanguageEntry>) => update({ languages: profile.languages.map((entry, position) => position === index ? { ...entry, ...patch } : entry) });
  return <div>
    <header className="step-heading"><p>06 · Preferences</p><h2>Teach RoleTailor how you communicate.</h2><span>This replaces any private writing profile or machine-specific instruction file.</span></header>
    <div className="choice-group"><span>Default CV language</span><div>{([['en','English'],['pl','Polish']] as const).map(([value, label]) => <button type="button" key={value} className={profile.preferredLanguage === value ? "selected" : ""} onClick={() => update({ preferredLanguage: value })}>{profile.preferredLanguage === value ? <Check /> : null}{label}</button>)}</div></div>
    <div className="choice-group"><span>Application writing tone</span><div>{([['direct','Direct and concise'],['warm','Warm and conversational'],['formal','Formal and reserved']] as const).map(([value, label]) => <button type="button" key={value} className={profile.writingTone === value ? "selected" : ""} onClick={() => update({ writingTone: value })}>{profile.writingTone === value ? <Check /> : null}{label}</button>)}</div></div>
    <section className="writing-profile-box"><div className="writing-profile-heading"><div><span>Writing profile</span><small>Paste your own instructions or import an existing Markdown skill.</small></div><div><button type="button" onClick={onImportWritingProfile}><FileUp />Import SKILL.md</button><button type="button" onClick={() => setTutorialOpen(true)}><BookOpen />How to create one</button></div></div><TextAreaField label="Your style instructions" value={profile.writingNotes} onChange={(writingNotes) => update({ writingNotes })} placeholder="Words you avoid, phrases that sound like you, preferred greeting, sentence rhythm, how assertive you want to be..." hint="The imported text stays editable and is saved inside your local RoleTailor profile." rows={7} /></section>
    <ListField label="Achievements, certifications and proof points" values={profile.achievements} onChange={(achievements) => update({ achievements })} placeholder={"AWS certification — 2025\nSpeaker at ...\nReduced processing time by 30%"} />
    <div className="language-list"><div className="inline-heading"><span>Languages</span><button type="button" onClick={addLanguage}><Plus />Add</button></div>{profile.languages.map((entry, index) => <div className="language-row" key={index}><TextField label="Language" value={entry.name} onChange={(name) => setLanguage(index, { name })} placeholder="English" /><TextField label="Proficiency" value={entry.proficiency} onChange={(proficiency) => setLanguage(index, { proficiency })} placeholder="C1 · Professional" /><RemoveButton label={`Remove language ${index + 1}`} onClick={() => update({ languages: profile.languages.filter((_, position) => position !== index) })} /></div>)}</div>
    <TextAreaField label="Anything else RoleTailor should know" value={profile.additionalFacts} onChange={(additionalFacts) => update({ additionalFacts })} placeholder="Career breaks, work authorisation, relocation, domain knowledge, preferred work setup, verified metrics, or context that doesn't fit above." rows={5} />
    {tutorialOpen ? createPortal(<div className="writing-tutorial-backdrop" role="presentation" onMouseDown={() => setTutorialOpen(false)}><section className="writing-tutorial" role="dialog" aria-modal="true" aria-labelledby="writing-tutorial-title" onMouseDown={(event) => event.stopPropagation()}><button type="button" className="tutorial-close" onClick={() => setTutorialOpen(false)} aria-label="Close tutorial"><X /></button><p className="onboarding-kicker"><Sparkles />Make it sound like you</p><h3 id="writing-tutorial-title">Create your writing profile in a few minutes.</h3><ol><li><span>1</span><div><strong>Collect messages you wrote.</strong><p>Export your Codex or ChatGPT conversations, then extract only your own messages. A representative sample from different conversations works too.</p></div></li><li><span>2</span><div><strong>Ask AI to analyse your style.</strong><p>Tell it to study only your messages and describe your vocabulary, rhythm, tone, sentence length, formatting habits, phrases you use, and patterns you avoid.</p></div></li><li><span>3</span><div><strong>Review before saving.</strong><p>Remove sensitive facts and anything that doesn't feel like you. Paste the result here, or save it as <code>SKILL.md</code> and import it.</p></div></li></ol><div className="tutorial-prompt"><span>Prompt to copy</span><p>Analyse only the messages written by me in this export. Create practical writing instructions that another AI can follow to reproduce my natural style without copying topic-specific facts. Cover tone, vocabulary, sentence rhythm, formatting, characteristic phrases, and things to avoid.</p><button type="button" onClick={() => void navigator.clipboard.writeText("Analyse only the messages written by me in this export. Create practical writing instructions that another AI can follow to reproduce my natural style without copying topic-specific facts. Cover tone, vocabulary, sentence rhythm, formatting, characteristic phrases, and things to avoid.")}>Copy prompt</button></div><button type="button" className="tutorial-done" onClick={() => setTutorialOpen(false)}>Got it</button></section></div>, document.body) : null}
  </div>;
}

function StepReady({ profile, state, saved }: { profile:UserProfile; state:SetupState; saved:boolean }) {
  const facts = profile.experiences.length + profile.projects.length + profile.education.length;
  return <div className="ready-step">
    <div className="ready-mark"><ShieldCheck /></div><p className="onboarding-kicker">Your private workspace</p><h2>{saved ? "Profile saved. You're ready." : `Ready to build ${profile.fullName.split(" ")[0] || "your"}’s base CV.`}</h2><p>RoleTailor will turn these facts into a local, editable CV workspace. Future runs receive a copy, so the source stays safe.</p>
    <div className="ready-summary"><div><strong>{profile.skills.length}</strong><span>skills</span></div><div><strong>{facts}</strong><span>career entries</span></div><div><strong>{profile.targetRoles.length}</strong><span>target roles</span></div></div>
    <div className="system-checks"><div className={state.codexInstalled ? "ok" : "bad"}><span>{state.codexInstalled ? <Check /> : "!"}</span><p><strong>{state.codexInstalled ? "Codex CLI detected" : "Codex CLI is required"}</strong><small>{state.codexVersion || "Install Codex, then retry this step."}</small></p></div><div className={state.authenticated ? "ok" : "pending"}><span>{state.authenticated ? <Check /> : <LockKeyhole />}</span><p><strong>{state.authenticated ? "ChatGPT connected" : "Connect your ChatGPT account"}</strong><small>{state.accountLabel || "RoleTailor never receives or stores your token."}</small></p></div><div className="ok"><span><Check /></span><p><strong>Local-only career data</strong><small>Saved under {state.dataPath || "RoleTailor application data"}.</small></p></div></div>
    {state.issues.filter((issue) => !issue.toLowerCase().includes("profile")).map((issue) => <p className="onboarding-issue" key={issue}>{issue}</p>)}
  </div>;
}

export default function Onboarding({ state: initialState, editing = false, onComplete, onCancel, onError }: { state:SetupState; editing?:boolean; onComplete:(state:SetupState)=>void; onCancel?:()=>void; onError:(error:unknown)=>void }) {
  const recovering = !editing && Boolean(initialState.profile);
  const [step, setStep] = useState(editing ? 1 : recovering ? 7 : 0);
  const [profile, setProfile] = useState<UserProfile>(() => initialState.profile ? structuredClone(initialState.profile) : emptyProfile());
  const [state, setState] = useState(initialState);
  const [photoPath, setPhotoPath] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const loginId = useRef<string | null>(null);
  const update = (patch:Partial<UserProfile>) => { setProfile((current) => ({ ...current, ...patch })); setSaved(false); };
  useEffect(() => {
    let dispose: (() => void) | undefined;
    void onAuthChanged(async (event) => {
      if (!loginId.current || event.loginId !== loginId.current) return;
      loginId.current = null;
      if (!event.authenticated) { setBusy(false); onError(event.error || "ChatGPT sign-in was not completed."); return; }
      try { const next = await backend.setup(); setState(next); onComplete(next); } catch (error) { onError(error); } finally { setBusy(false); }
    }).then((unlisten) => { dispose = unlisten; }).catch(() => undefined);
    return () => { dispose?.(); if (loginId.current) void backend.cancelLogin(loginId.current); };
  }, [onComplete, onError]);
  const valid = useMemo(() => {
    const basicsValid = profile.fullName.trim().length >= 2
      && /^\S+@\S+\.\S+$/.test(profile.email.trim())
      && [profile.linkedin, profile.portfolio, profile.github].every(validOptionalUrl);
    const directionValid = profile.headline.trim().length >= 3
      && profile.summary.trim().length >= 20
      && profile.targetRoles.length > 0
      && profile.skills.length > 0;
    const experienceValid = profile.experiences.every((entry) => entry.role.trim() && entry.company.trim() && entry.startDate.trim());
    const educationValid = profile.education.every((entry) => entry.school.trim() && entry.degree.trim());
    const projectsValid = profile.projects.every((entry) => entry.name.trim() && entry.description.trim() && validOptionalUrl(entry.url));
    const preferencesValid = profile.languages.every((entry) => entry.name.trim() && entry.proficiency.trim());
    if (step === 1) return basicsValid;
    if (step === 2) return directionValid;
    if (step === 3) return experienceValid;
    if (step === 4) return educationValid;
    if (step === 5) return projectsValid;
    if (step === 6) return preferencesValid;
    if (step === 7) return basicsValid && directionValid && experienceValid && educationValid && projectsValid && preferencesValid;
    return true;
  }, [profile, step]);
  const choosePhoto = async () => {
    try { const path = isTauri() ? await backend.chooseProfilePhoto() : "/demo/profile-photo.jpg"; if (path) setPhotoPath(path); } catch (error) { onError(error); }
  };
  const importWritingProfile = async () => {
    try {
      const content = isTauri()
        ? await backend.chooseWritingProfile()
        : "# My writing style\n\n- Keep sentences short and concrete.\n- Prefer specific examples over generic claims.\n- Avoid inflated language and corporate filler.";
      if (content) update({ writingNotes: content });
    } catch (error) { onError(error); }
  };
  const finish = async () => {
    setBusy(true);
    try {
      const next = recovering
        ? state
        : isTauri()
          ? await backend.saveProfile(profile, photoPath)
          : { ...state, profile, buildValid: true, issues: [] };
      setState(next); setProfile(next.profile || profile); setSaved(true);
      if (!next.codexInstalled || !next.buildValid) { setBusy(false); return; }
      if (editing || next.authenticated) { onComplete(next); setBusy(false); return; }
      const login = await backend.login(); loginId.current = login.loginId; await openUrl(login.authUrl);
    } catch (error) { setBusy(false); onError(error); }
  };
  const retry = async () => {
    setBusy(true);
    try {
      const next = isTauri() ? await backend.setup() : state;
      setState(next);
      if (next.codexInstalled && next.authenticated && next.profile && next.buildValid) onComplete(next);
    } catch (error) { onError(error); } finally { setBusy(false); }
  };
  const renderStep = () => {
    if (step === 0) return <StepIntro />;
    if (step === 1) return <StepBasics profile={profile} update={update} photoPath={photoPath} onPhoto={() => void choosePhoto()} />;
    if (step === 2) return <StepDirection profile={profile} update={update} />;
    if (step === 3) return <StepExperience profile={profile} update={update} />;
    if (step === 4) return <StepEducation profile={profile} update={update} />;
    if (step === 5) return <StepProjects profile={profile} update={update} />;
    if (step === 6) return <StepPreferences profile={profile} update={update} onImportWritingProfile={() => void importWritingProfile()} />;
    return <StepReady profile={profile} state={state} saved={saved} />;
  };
  return <main className="onboarding-shell">
    <aside className="onboarding-rail"><div className="onboarding-logo"><span><i /><i /></span><strong>RoleTailor</strong></div><nav>{steps.map(({ label, icon: Icon }, index) => <button type="button" key={label} className={index === step ? "active" : index < step ? "done" : ""} disabled={recovering && index !== step} onClick={() => index < step && setStep(index)}><span>{index < step ? <Check /> : <Icon />}</span><em>{String(index).padStart(2, "0")}</em><strong>{label}</strong></button>)}</nav><div className="rail-note"><LockKeyhole /><span><strong>Stored on this device</strong>No career data is committed to the repository.</span></div></aside>
    <section className="onboarding-stage"><div className="onboarding-progress"><span style={{ width: `${(step / (steps.length - 1)) * 100}%` }} /></div><div className="onboarding-card" key={step}>{renderStep()}</div><footer className="onboarding-actions">{step > 0 && !recovering ? <button type="button" className="back" onClick={() => setStep((current) => current - 1)} disabled={busy}><ArrowLeft />Back</button> : editing && onCancel ? <button type="button" className="back" onClick={onCancel}>Cancel</button> : <span />}{step < steps.length - 1 ? <button type="button" className="continue" onClick={() => setStep((current) => current + 1)} disabled={!valid}>Continue<ArrowRight /></button> : <div className="finish-actions">{!state.codexInstalled || !state.buildValid ? <button type="button" className="retry" onClick={() => void retry()} disabled={busy}>Retry checks</button> : null}{!recovering || (state.codexInstalled && state.buildValid) ? <button type="button" className="continue finish" onClick={() => void finish()} disabled={busy}>{busy ? <LoaderCircle className="spin" /> : <Sparkles />}{busy ? (loginId.current ? "Waiting for ChatGPT…" : "Building your workspace…") : editing ? "Save profile" : state.authenticated ? "Finish setup" : "Save & connect ChatGPT"}</button> : null}</div>}</footer></section>
  </main>;
}
