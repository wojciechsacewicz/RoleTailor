use serde::{Deserialize, Serialize};
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct JobPreview {
    pub company: String,
    pub role: String,
    pub location: Option<String>,
    pub seniority: Option<String>,
    pub technologies: Vec<String>,
    pub salary: Option<String>,
    pub content: String,
    pub source_url: Option<String>,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SetupState {
    pub codex_installed: bool,
    pub codex_version: Option<String>,
    pub authenticated: bool,
    pub account_label: Option<String>,
    pub profile: Option<UserProfile>,
    pub build_valid: bool,
    pub issues: Vec<String>,
    pub data_path: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct UserProfile {
    pub full_name: String,
    pub email: String,
    pub phone: Option<String>,
    pub location: Option<String>,
    pub linkedin: Option<String>,
    pub portfolio: Option<String>,
    pub github: Option<String>,
    pub headline: String,
    pub summary: String,
    pub target_roles: Vec<String>,
    pub skills: Vec<String>,
    pub experiences: Vec<ExperienceEntry>,
    pub education: Vec<EducationEntry>,
    pub projects: Vec<ProjectEntry>,
    pub languages: Vec<LanguageEntry>,
    pub achievements: Vec<String>,
    pub preferred_language: PreferredLanguage,
    pub writing_tone: WritingTone,
    pub writing_notes: String,
    pub additional_facts: String,
    pub photo_filename: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ExperienceEntry {
    pub role: String,
    pub company: String,
    pub location: Option<String>,
    pub start_date: String,
    pub end_date: Option<String>,
    pub current: bool,
    pub highlights: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct EducationEntry {
    pub school: String,
    pub degree: String,
    pub field: Option<String>,
    pub start_date: Option<String>,
    pub end_date: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ProjectEntry {
    pub name: String,
    pub url: Option<String>,
    pub description: String,
    pub highlights: Vec<String>,
    pub technologies: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct LanguageEntry {
    pub name: String,
    pub proficiency: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum PreferredLanguage {
    Pl,
    En,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum WritingTone {
    Direct,
    Warm,
    Formal,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RunSummary {
    pub id: String,
    pub company: String,
    pub role: String,
    pub status: String,
    pub created_at: String,
    pub stars: Option<u8>,
    pub result: Option<serde_json::Value>,
    pub error: Option<String>,
    pub archived: bool,
}
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RunEvent {
    pub run_id: String,
    pub status: Option<String>,
    pub message: String,
    pub result: Option<serde_json::Value>,
    pub error: Option<String>,
    pub emitted_at: String,
}
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DebugEvent {
    pub context_id: String,
    pub generation: u64,
    pub sequence: u64,
    pub source: String,
    pub kind: String,
    pub message: String,
    pub emitted_at: String,
}
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LoginStart {
    pub auth_url: String,
    pub login_id: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct EditorDocument {
    pub run_id: String,
    pub is_base: bool,
    pub html: String,
    pub css: String,
    pub image_path: Option<String>,
    pub asset_root: String,
    pub pdf_path: Option<String>,
    pub fit_gaps: Vec<String>,
    pub annotations: Vec<CvAnnotation>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct CvAnnotation {
    pub target: String,
    pub title: String,
    pub comment: String,
    pub priority: u8,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EditorChatLine {
    pub role: String,
    pub text: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct EditorChatReply {
    pub message: String,
    pub document: EditorDocument,
    pub result: Option<serde_json::Value>,
}
