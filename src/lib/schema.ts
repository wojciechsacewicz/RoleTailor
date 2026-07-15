import { z } from 'zod';
export const cvReviewSchema=z.object({target:z.enum(['headline','contact','proof','experience','profile','skills','education','projects']),title:z.string().min(1),comment:z.string().min(1),priority:z.number().int().min(1).max(3)}).strict();
export const resultSchema=z.object({runId:z.string().min(1),company:z.string().min(1),role:z.string().min(1),jobUrl:z.string().nullable(),language:z.enum(['pl','en']),fit:z.object({stars:z.number().int().min(1).max(5),matchScore:z.number().int().min(0).max(100),inviteLikelihoodEstimate:z.number().int().min(0).max(100),confidence:z.enum(['low','medium','high']),recommendation:z.enum(['apply','apply-with-caveats','weak-fit','skip']),summary:z.string(),strengths:z.array(z.string()),gaps:z.array(z.string()),dealbreakers:z.array(z.string()),differentiators:z.array(z.string())}).strict(),artifacts:z.object({cvPdf:z.string(),cvSource:z.string(),applicationMessage:z.string(),coverLetter:z.string()}).strict(),changeSummary:z.array(z.string()),cvReview:z.array(cvReviewSchema).max(8).default([])}).strict();
export type RunResult=z.infer<typeof resultSchema>;
export type RunStatus='Draft'|'Fetching'|'Analysing'|'Tailoring CV'|'Building PDF'|'Completed'|'Failed'|'Cancelled';
export type AnalysisProfile='luna-high'|'terra-high'|'sol-low';
export interface JobPreview {company:string;role:string;location?:string;seniority?:string;technologies:string[];salary?:string;content:string;sourceUrl?:string}
export interface RunSummary {id:string;company:string;role:string;status:RunStatus;createdAt:string;stars?:number;result?:RunResult;error?:string;activity?:string;lastActivity?:string;archived?:boolean}
export interface ExperienceEntry {role:string;company:string;location?:string;startDate:string;endDate?:string;current:boolean;highlights:string[]}
export interface EducationEntry {school:string;degree:string;field?:string;startDate?:string;endDate?:string}
export interface ProjectEntry {name:string;url?:string;description:string;highlights:string[];technologies:string[]}
export interface LanguageEntry {name:string;proficiency:string}
export interface UserProfile {
  fullName:string;
  email:string;
  phone?:string;
  location?:string;
  linkedin?:string;
  portfolio?:string;
  github?:string;
  headline:string;
  summary:string;
  targetRoles:string[];
  skills:string[];
  experiences:ExperienceEntry[];
  education:EducationEntry[];
  projects:ProjectEntry[];
  languages:LanguageEntry[];
  achievements:string[];
  preferredLanguage:'pl'|'en';
  writingTone:'direct'|'warm'|'formal';
  writingNotes:string;
  additionalFacts:string;
  photoFilename?:string;
}
export interface ProfileImportSource {path:string;name:string;kind:'file'|'folder';eligibleFiles:number;totalBytes:number}
export interface ProfileImportResult {profile:UserProfile;warnings:string[];sourceSummary:string;processedFiles:number}
export interface SetupState {codexInstalled:boolean;codexVersion?:string;authenticated:boolean;accountLabel?:string;profile?:UserProfile;buildValid:boolean;issues:string[];dataPath:string}
export type CvReview=z.infer<typeof cvReviewSchema>;
export interface EditorDocument {runId:string;isBase:boolean;html:string;css:string;imagePath?:string;assetRoot:string;pdfPath?:string;fitGaps:string[];annotations:CvReview[]}
export interface EditorChatLine {role:'user'|'assistant';text:string}
export interface EditorChatReply {message:string;document:EditorDocument;result?:RunResult}
export interface DebugEvent {contextId:string;generation:number;sequence:number;source:string;kind:'system'|'agent'|'reasoning'|'command'|'output'|'file'|'build';message:string;emittedAt:string}
