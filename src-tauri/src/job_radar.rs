use crate::{conn, job, load_user_profile, AppState};
use chrono::{DateTime, Utc};
use regex::Regex;
use reqwest::{Client, StatusCode};
use rusqlite::params;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::{HashMap, HashSet};
use std::time::Duration;
use tauri::State;

const SOURCE_NAMES: &[&str] = &[
    "justjoin",
    "rocketjobs",
    "nofluffjobs",
    "theprotocol",
    "pracuj",
    "freehire",
];
const DEFAULT_LIMIT: usize = 80;
const USER_AGENT: &str =
    "RoleTailor/0.1 job-radar (+https://github.com/wojciechsacewicz/RoleTailor)";

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct JobRadarQuery {
    #[serde(default)]
    pub query: String,
    #[serde(default = "default_true")]
    pub remote_only: bool,
    #[serde(default = "default_true")]
    pub junior_friendly: bool,
    #[serde(default = "default_age")]
    pub max_age_days: u32,
    #[serde(default)]
    pub min_salary_pln: Option<i64>,
    #[serde(default)]
    pub sources: Vec<String>,
    #[serde(default = "default_limit")]
    pub limit: usize,
}

fn default_true() -> bool {
    true
}
fn default_age() -> u32 {
    14
}
fn default_limit() -> usize {
    DEFAULT_LIMIT
}

impl Default for JobRadarQuery {
    fn default() -> Self {
        Self {
            query: String::new(),
            remote_only: true,
            junior_friendly: true,
            max_age_days: default_age(),
            min_salary_pln: None,
            sources: SOURCE_NAMES
                .iter()
                .map(|value| (*value).to_string())
                .collect(),
            limit: DEFAULT_LIMIT,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct JobOffer {
    pub id: String,
    pub source: String,
    pub external_id: String,
    pub title: String,
    pub company: String,
    pub location: Option<String>,
    pub work_mode: Option<String>,
    pub seniority: Option<String>,
    pub salary: Option<String>,
    pub salary_min_pln: Option<i64>,
    pub technologies: Vec<String>,
    pub description: Option<String>,
    pub published_at: Option<String>,
    pub deadline: Option<String>,
    pub url: String,
    pub status: String,
    pub score: i32,
    pub better_than_idego: bool,
    pub reasons: Vec<String>,
    pub risks: Vec<String>,
    pub first_seen_at: String,
    pub last_seen_at: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct JobSourceStatus {
    pub source: String,
    pub status: String,
    pub found: usize,
    pub message: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct JobRadarResult {
    pub offers: Vec<JobOffer>,
    pub sources: Vec<JobSourceStatus>,
    pub fetched_at: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct JobValidationResult {
    pub status: String,
    pub checked_at: String,
    pub message: String,
}

fn http_client() -> Result<Client, String> {
    Client::builder()
        .user_agent(USER_AGENT)
        .timeout(Duration::from_secs(18))
        .redirect(reqwest::redirect::Policy::limited(5))
        .build()
        .map_err(|error| format!("Could not initialise the job source client: {error}"))
}

#[tauri::command]
pub async fn search_jobs(
    query: JobRadarQuery,
    state: State<'_, AppState>,
) -> Result<JobRadarResult, String> {
    let query = normalize_query(query);
    let profile = load_user_profile(&state)?;
    let client = http_client()?;
    let selected = selected_sources(&query);

    let justjoin = run_source(
        "justjoin",
        selected.contains("justjoin"),
        fetch_justjoin(&client, &query),
    );
    let rocketjobs = run_source(
        "rocketjobs",
        selected.contains("rocketjobs"),
        fetch_rocketjobs(&client, &query),
    );
    let nofluffjobs = run_source(
        "nofluffjobs",
        selected.contains("nofluffjobs"),
        fetch_nofluffjobs(&client, &query),
    );
    let theprotocol = run_source(
        "theprotocol",
        selected.contains("theprotocol"),
        fetch_theprotocol(&client, &query),
    );
    let pracuj = run_source(
        "pracuj",
        selected.contains("pracuj"),
        fetch_pracuj(&client, &query),
    );
    let freehire = run_source(
        "freehire",
        selected.contains("freehire"),
        fetch_freehire(&client, &query),
    );

    let results = tokio::join!(
        justjoin,
        rocketjobs,
        nofluffjobs,
        theprotocol,
        pracuj,
        freehire
    );

    let mut offers = Vec::new();
    let mut statuses = Vec::new();
    for (source, outcome) in [
        ("justjoin", results.0),
        ("rocketjobs", results.1),
        ("nofluffjobs", results.2),
        ("theprotocol", results.3),
        ("pracuj", results.4),
        ("freehire", results.5),
    ] {
        match outcome {
            SourceOutcome::Skipped => statuses.push(JobSourceStatus {
                source: source.to_string(),
                status: "skipped".into(),
                found: 0,
                message: None,
            }),
            SourceOutcome::Success(found) => {
                statuses.push(JobSourceStatus {
                    source: source.to_string(),
                    status: "ok".into(),
                    found: found.len(),
                    message: None,
                });
                offers.extend(found);
            }
            SourceOutcome::Failure(message) => statuses.push(JobSourceStatus {
                source: source.to_string(),
                status: "error".into(),
                found: 0,
                message: Some(message),
            }),
        }
    }

    let mut offers = deduplicate(offers);
    offers.retain(|offer| passes_filters(offer, &query));
    for offer in &mut offers {
        score_offer(offer, &query, profile.as_ref());
    }
    offers.sort_by(|left, right| {
        right
            .score
            .cmp(&left.score)
            .then_with(|| right.published_at.cmp(&left.published_at))
    });
    offers.truncate(query.limit.clamp(1, 250));

    persist_offers(&state, &offers)?;
    Ok(JobRadarResult {
        offers,
        sources: statuses,
        fetched_at: Utc::now().to_rfc3339(),
    })
}

#[tauri::command]
pub fn cached_jobs(
    query: JobRadarQuery,
    state: State<'_, AppState>,
) -> Result<JobRadarResult, String> {
    let query = normalize_query(query);
    let profile = load_user_profile(&state)?;
    let connection = conn(&state)?;
    ensure_schema(&connection)?;
    let mut statement = connection
        .prepare(
            "SELECT data_json FROM job_offers ORDER BY score DESC, last_seen_at DESC LIMIT 1000",
        )
        .map_err(|error| error.to_string())?;
    let rows = statement
        .query_map([], |row| row.get::<_, String>(0))
        .map_err(|error| error.to_string())?;
    let mut offers = rows
        .filter_map(Result::ok)
        .filter_map(|raw| serde_json::from_str::<JobOffer>(&raw).ok())
        .filter(|offer| selected_sources(&query).contains(offer.source.as_str()))
        .filter(|offer| passes_filters(offer, &query))
        .collect::<Vec<_>>();
    for offer in &mut offers {
        score_offer(offer, &query, profile.as_ref());
    }
    offers.sort_by(|left, right| right.score.cmp(&left.score));
    offers.truncate(query.limit.clamp(1, 250));
    Ok(JobRadarResult {
        offers,
        sources: Vec::new(),
        fetched_at: Utc::now().to_rfc3339(),
    })
}

#[tauri::command]
pub async fn validate_job_offer(
    url: String,
    state: State<'_, AppState>,
) -> Result<JobValidationResult, String> {
    let parsed = url::Url::parse(url.trim()).map_err(|_| "Job URL is invalid".to_string())?;
    if !matches!(parsed.scheme(), "http" | "https") {
        return Err("Job URL must use HTTP or HTTPS".into());
    }
    let client = http_client()?;
    let checked_at = Utc::now().to_rfc3339();
    let result = match client.get(parsed.clone()).send().await {
        Ok(response) if matches!(response.status(), StatusCode::NOT_FOUND | StatusCode::GONE) => {
            JobValidationResult {
                status: "expired".into(),
                checked_at,
                message: format!("The original posting returned HTTP {}.", response.status()),
            }
        }
        Ok(response) if response.status().is_success() => {
            let body = response.text().await.unwrap_or_default();
            classify_live_body(&body, checked_at)
        }
        Ok(response)
            if response.status() == StatusCode::FORBIDDEN
                || response.status() == StatusCode::TOO_MANY_REQUESTS
                || response.status().is_server_error() =>
        {
            JobValidationResult {
                status: "uncertain".into(),
                checked_at,
                message: format!(
                    "The source returned HTTP {}; RoleTailor cannot confirm whether the posting is still open.",
                    response.status()
                ),
            }
        }
        Ok(response) => JobValidationResult {
            status: "uncertain".into(),
            checked_at,
            message: format!("The source returned HTTP {}.", response.status()),
        },
        Err(error) => JobValidationResult {
            status: "uncertain".into(),
            checked_at,
            message: format!("Could not reach the original posting: {error}"),
        },
    };
    update_validation_status(&state, parsed.as_str(), &result.status)?;
    Ok(result)
}

async fn run_source<F>(source: &'static str, enabled: bool, future: F) -> SourceOutcome
where
    F: std::future::Future<Output = Result<Vec<JobOffer>, String>>,
{
    if !enabled {
        return SourceOutcome::Skipped;
    }
    match future.await {
        Ok(offers) => SourceOutcome::Success(offers),
        Err(error) => SourceOutcome::Failure(format!("{source}: {error}")),
    }
}

enum SourceOutcome {
    Skipped,
    Success(Vec<JobOffer>),
    Failure(String),
}

fn normalize_query(mut query: JobRadarQuery) -> JobRadarQuery {
    query.query = query.query.trim().to_string();
    query.sources = query
        .sources
        .into_iter()
        .map(|source| source.trim().to_ascii_lowercase())
        .filter(|source| SOURCE_NAMES.contains(&source.as_str()))
        .collect();
    if query.sources.is_empty() {
        query.sources = SOURCE_NAMES
            .iter()
            .map(|value| (*value).to_string())
            .collect();
    }
    if query.max_age_days == 0 {
        query.max_age_days = default_age();
    }
    if query.limit == 0 {
        query.limit = DEFAULT_LIMIT;
    }
    query
}

fn selected_sources(query: &JobRadarQuery) -> HashSet<&str> {
    query.sources.iter().map(String::as_str).collect()
}

fn new_offer(
    source: &str,
    external_id: String,
    title: String,
    company: String,
    url: String,
) -> JobOffer {
    let now = Utc::now().to_rfc3339();
    JobOffer {
        id: format!("{source}:{external_id}"),
        source: source.to_string(),
        external_id,
        title,
        company,
        location: None,
        work_mode: None,
        seniority: None,
        salary: None,
        salary_min_pln: None,
        technologies: Vec::new(),
        description: None,
        published_at: None,
        deadline: None,
        url,
        status: "active".into(),
        score: 0,
        better_than_idego: false,
        reasons: Vec::new(),
        risks: Vec::new(),
        first_seen_at: now.clone(),
        last_seen_at: now,
    }
}

async fn fetch_justjoin(client: &Client, query: &JobRadarQuery) -> Result<Vec<JobOffer>, String> {
    let mut cursor = 0_i64;
    let mut offers = Vec::new();
    for _ in 0..6 {
        let url = if cursor == 0 {
            "https://api.justjoin.it/v2/user-panel/offers/by-cursor".to_string()
        } else {
            format!("https://api.justjoin.it/v2/user-panel/offers/by-cursor?from={cursor}")
        };
        let payload = get_json(client, &url).await?;
        let data = payload
            .get("data")
            .and_then(Value::as_array)
            .ok_or("Just Join IT returned an unexpected response")?;
        for raw in data {
            let external_id = value_string(raw, &["/guid", "/id"]).unwrap_or_default();
            let slug = value_string(raw, &["/slug"]).unwrap_or_default();
            let title = value_string(raw, &["/title"]).unwrap_or_default();
            let company = value_string(raw, &["/companyName", "/company/name"]).unwrap_or_default();
            if external_id.is_empty() || slug.is_empty() || title.is_empty() || company.is_empty() {
                continue;
            }
            let mut offer = new_offer(
                "justjoin",
                external_id,
                title,
                company,
                format!("https://justjoin.it/job-offer/{slug}"),
            );
            offer.location = value_string(raw, &["/city", "/location"]);
            offer.work_mode =
                value_string(raw, &["/workplaceType"]).map(|value| normalize_work_mode(&value));
            offer.published_at = value_string(raw, &["/publishedAt", "/lastPublishedAt"]);
            offer.seniority = value_string(raw, &["/experienceLevel/value", "/experienceLevel"]);
            let (salary, salary_min) = salary_from_employment_types(raw.get("employmentTypes"));
            offer.salary = salary;
            offer.salary_min_pln = salary_min;
            offer.technologies = string_list(raw.get("requiredSkills"), &["name", "value"]);
            if matches_query(&offer, &query.query) {
                offers.push(offer);
            }
        }
        let next = payload.pointer("/meta/next/cursor").and_then(Value::as_i64);
        match next {
            Some(next) if next > cursor => cursor = next,
            _ => break,
        }
    }
    Ok(offers)
}

async fn fetch_rocketjobs(client: &Client, query: &JobRadarQuery) -> Result<Vec<JobOffer>, String> {
    let response = client
        .get("https://rocketjobs.pl/api/candidate-api/offers")
        .query(&[("keywords", query.query.as_str()), ("limit", "50")])
        .header("Origin", "https://rocketjobs.pl")
        .header(
            "Referer",
            "https://rocketjobs.pl/oferty-pracy/wszystkie-lokalizacje",
        )
        .send()
        .await
        .map_err(|error| error.to_string())?;
    if !response.status().is_success() {
        return Err(format!("HTTP {}", response.status()));
    }
    let payload: Value = response.json().await.map_err(|error| error.to_string())?;
    let data = payload
        .get("data")
        .and_then(Value::as_array)
        .ok_or("RocketJobs returned an unexpected response")?;
    let mut offers = Vec::new();
    for raw in data {
        let slug = value_string(raw, &["/slug"]).unwrap_or_default();
        let title = value_string(raw, &["/title"]).unwrap_or_default();
        if slug.is_empty() || title.is_empty() {
            continue;
        }
        let company = value_string(raw, &["/companyName", "/company/name"])
            .unwrap_or_else(|| "Unknown company".into());
        let mut offer = new_offer(
            "rocketjobs",
            slug.clone(),
            title,
            company,
            format!("https://rocketjobs.pl/oferta-pracy/{slug}"),
        );
        offer.location = value_string(raw, &["/city", "/location"]);
        offer.work_mode =
            value_string(raw, &["/workplaceType"]).map(|value| normalize_work_mode(&value));
        offer.published_at = value_string(raw, &["/publishedAt", "/lastPublishedAt"]);
        offer.description = value_string(
            raw,
            &["/shortDescription", "/lead", "/description", "/snippet"],
        );
        let (salary, salary_min) = salary_from_employment_types(raw.get("employmentTypes"));
        offer.salary = salary;
        offer.salary_min_pln = salary_min;
        offer.technologies = string_list(raw.get("skills"), &["name", "value"]);
        if matches_query(&offer, &query.query) {
            offers.push(offer);
        }
    }
    Ok(offers)
}

async fn fetch_freehire(client: &Client, query: &JobRadarQuery) -> Result<Vec<JobOffer>, String> {
    let mut request = client
        .get("https://freehire.me/api/v1/agent/jobs/search")
        .query(&[
            ("q", query.query.as_str()),
            ("limit", "80"),
            ("regions", "eu"),
            ("include_description", "false"),
            ("sort", "posted_at"),
            ("order", "desc"),
        ]);
    if query.remote_only {
        request = request.query(&[("work_mode", "remote")]);
    }
    if query.junior_friendly {
        request = request.query(&[("seniority", "intern"), ("seniority", "junior")]);
    }
    let response = request.send().await.map_err(|error| error.to_string())?;
    if !response.status().is_success() {
        return Err(format!("HTTP {}", response.status()));
    }
    let payload: Value = response.json().await.map_err(|error| error.to_string())?;
    let data = payload
        .get("data")
        .and_then(Value::as_array)
        .ok_or("freehire returned an unexpected response")?;
    let mut offers = Vec::new();
    for raw in data {
        let slug = value_string(raw, &["/public_slug", "/publicSlug", "/slug"]).unwrap_or_default();
        let title = value_string(raw, &["/title"]).unwrap_or_default();
        if slug.is_empty() || title.is_empty() {
            continue;
        }
        let company = value_string(raw, &["/company_name", "/companyName", "/company/name"])
            .unwrap_or_else(|| "Unknown company".into());
        let url = value_string(raw, &["/url", "/apply_url", "/applyUrl"])
            .unwrap_or_else(|| format!("https://freehire.me/jobs/{slug}"));
        let mut offer = new_offer("freehire", slug, title, company, url);
        offer.location = value_string(raw, &["/location"]);
        offer.work_mode = value_string(raw, &["/work_mode", "/workMode"])
            .map(|value| normalize_work_mode(&value));
        offer.seniority = value_string(raw, &["/seniority"]);
        offer.description = value_string(raw, &["/description"]);
        offer.published_at = value_string(raw, &["/posted_at", "/postedAt", "/created_at"]);
        offer.technologies = value_string_array(raw, &["/skills", "/technologies"]);
        let currency = value_string(raw, &["/salary_currency", "/salaryCurrency"]);
        let min = value_i64(raw, &["/salary_min", "/salaryMin"]);
        let max = value_i64(raw, &["/salary_max", "/salaryMax"]);
        offer.salary = format_salary(min, max, currency.as_deref(), None);
        if currency
            .as_deref()
            .map(|value| value.eq_ignore_ascii_case("PLN"))
            == Some(true)
        {
            offer.salary_min_pln = min;
        }
        if matches_query(&offer, &query.query) {
            offers.push(offer);
        }
    }
    Ok(offers)
}

async fn fetch_pracuj(client: &Client, query: &JobRadarQuery) -> Result<Vec<JobOffer>, String> {
    let response = client
        .get("https://it.pracuj.pl/praca")
        .query(&[
            ("et", "21,6,20"),
            ("wm", "hybrid,remote"),
            ("pn", "1"),
            ("pd", &query.max_age_days.to_string()),
            ("q", query.query.as_str()),
        ])
        .header("Accept-Language", "pl-PL,pl;q=0.9,en;q=0.8")
        .send()
        .await
        .map_err(|error| error.to_string())?;
    if !response.status().is_success() {
        return Err(format!("HTTP {}", response.status()));
    }
    let html = response.text().await.map_err(|error| error.to_string())?;
    let next = extract_next_data(&html).ok_or("Pracuj.pl did not expose its listing payload")?;
    let groups = next
        .pointer("/props/pageProps/dehydratedState/queries")
        .and_then(Value::as_array)
        .and_then(|queries| {
            queries.iter().find_map(|candidate| {
                let is_job_offers = candidate
                    .get("queryKey")
                    .and_then(Value::as_array)
                    .and_then(|key| key.first())
                    .and_then(Value::as_str)
                    == Some("jobOffers");
                is_job_offers
                    .then(|| candidate.pointer("/state/data/groupedOffers"))
                    .flatten()
                    .and_then(Value::as_array)
            })
        })
        .ok_or("Pracuj.pl returned an unexpected listing payload")?;
    let mut offers = Vec::new();
    for group in groups {
        let title = value_string(group, &["/jobTitle"]).unwrap_or_default();
        let company = value_string(group, &["/companyName"]).unwrap_or_default();
        if title.is_empty() || company.is_empty() {
            continue;
        }
        for raw in group
            .get("offers")
            .and_then(Value::as_array)
            .into_iter()
            .flatten()
        {
            let external_id =
                value_string(raw, &["/offerId", "/partitionId", "/id"]).unwrap_or_default();
            let url = value_string(raw, &["/offerAbsoluteUri"]).unwrap_or_default();
            if external_id.is_empty() || url.is_empty() {
                continue;
            }
            let mut offer = new_offer("pracuj", external_id, title.clone(), company.clone(), url);
            offer.location = value_string(raw, &["/displayWorkplace"]);
            offer.work_mode = infer_work_mode(offer.location.as_deref(), Some(&offer.title));
            offer.published_at = value_string(group, &["/lastPublicated"]);
            offer.deadline = value_string(group, &["/expirationDate"]);
            offer.description = value_string(group, &["/jobDescription"]);
            offer.salary = value_string(group, &["/salaryDisplayText"])
                .or_else(|| value_string(raw, &["/salaryDisplayText"]));
            offer.salary_min_pln = offer.salary.as_deref().and_then(parse_salary_min_pln);
            if matches_query(&offer, &query.query) {
                offers.push(offer);
            }
        }
    }
    Ok(offers)
}

async fn fetch_theprotocol(
    client: &Client,
    query: &JobRadarQuery,
) -> Result<Vec<JobOffer>, String> {
    let base = "https://theprotocol.it/filtry/trainee,assistant,junior;p/warszawa,krakow,wroclaw,gdansk,poznan;wp/zdalna,hybrydowa;rw";
    let response = client
        .get(base)
        .query(&[("sort", "date"), ("pageNumber", "1")])
        .header("Accept-Language", "pl-PL,pl;q=0.9,en;q=0.8")
        .send()
        .await
        .map_err(|error| error.to_string())?;
    if !response.status().is_success() {
        return Err(format!("HTTP {}", response.status()));
    }
    let html = response.text().await.map_err(|error| error.to_string())?;
    let next = extract_next_data(&html).ok_or("TheProtocol did not expose its listing payload")?;
    let raw_offers = next
        .pointer("/props/pageProps/offersResponse/offers")
        .and_then(Value::as_array)
        .ok_or("TheProtocol returned an unexpected listing payload")?;
    let mut offers = Vec::new();
    for raw in raw_offers {
        let external_id = value_string(raw, &["/id"]).unwrap_or_default();
        let slug = value_string(raw, &["/offerUrlName"]).unwrap_or_default();
        let title = value_string(raw, &["/title"]).unwrap_or_default();
        let company = value_string(raw, &["/employer"]).unwrap_or_default();
        if external_id.is_empty() || slug.is_empty() || title.is_empty() || company.is_empty() {
            continue;
        }
        let mut offer = new_offer(
            "theprotocol",
            external_id.clone(),
            title,
            company,
            format!("https://theprotocol.it/szczegoly/praca/{slug},oferta,{external_id}"),
        );
        offer.location = value_string(raw, &["/locationDisplay"]);
        offer.work_mode = value_string(raw, &["/workMode", "/employmentType"])
            .map(|value| normalize_work_mode(&value));
        offer.published_at = value_string(raw, &["/publicationDateUtc"]);
        offer.technologies = value_string_array(raw, &["/technologies"]);
        if let Some(salary) = raw.get("salary") {
            let min = value_i64(salary, &["/from"]);
            let max = value_i64(salary, &["/to"]);
            let currency = value_string(salary, &["/currency"]);
            offer.salary = format_salary(min, max, currency.as_deref(), None);
            if currency
                .as_deref()
                .unwrap_or("PLN")
                .eq_ignore_ascii_case("PLN")
            {
                offer.salary_min_pln = min;
            }
        }
        if matches_query(&offer, &query.query) {
            offers.push(offer);
        }
    }
    Ok(offers)
}

async fn fetch_nofluffjobs(
    client: &Client,
    query: &JobRadarQuery,
) -> Result<Vec<JobOffer>, String> {
    let paths = [
        "/pl/artificial-intelligence",
        "/pl/fullstack",
        "/pl/frontend",
        "/pl/backend",
    ];
    let link_regex = Regex::new(r#"href=[\"']([^\"']*/pl/job/[^\"'?#]+)"#).unwrap();
    let mut links = Vec::new();
    let mut seen = HashSet::new();
    for path in paths {
        let url = format!("https://nofluffjobs.com{path}");
        let response = client
            .get(&url)
            .header("Accept-Language", "pl-PL,pl;q=0.9,en;q=0.8")
            .send()
            .await
            .map_err(|error| error.to_string())?;
        if !response.status().is_success() {
            continue;
        }
        let html = response.text().await.map_err(|error| error.to_string())?;
        for capture in link_regex.captures_iter(&html) {
            let href = capture
                .get(1)
                .map(|value| value.as_str())
                .unwrap_or_default();
            let full = if href.starts_with("http") {
                href.to_string()
            } else {
                format!("https://nofluffjobs.com{href}")
            };
            if seen.insert(full.clone()) {
                links.push(full);
            }
        }
    }
    let mut offers = Vec::new();
    for url in links.into_iter().take(14) {
        let response = match client
            .get(&url)
            .header("Accept-Language", "pl-PL,pl;q=0.9,en;q=0.8")
            .send()
            .await
        {
            Ok(response) if response.status().is_success() => response,
            _ => continue,
        };
        let html = response.text().await.unwrap_or_default();
        let preview = match job::extract(&html, &url) {
            Ok(preview) => preview,
            Err(_) => continue,
        };
        let external_id = url.rsplit('/').next().unwrap_or(&url).to_string();
        let mut offer = new_offer(
            "nofluffjobs",
            external_id,
            preview.role,
            preview.company,
            url,
        );
        offer.location = preview.location;
        offer.work_mode = infer_work_mode(offer.location.as_deref(), Some(&offer.title));
        offer.seniority = preview.seniority;
        offer.technologies = preview.technologies;
        offer.salary = preview.salary;
        offer.salary_min_pln = offer.salary.as_deref().and_then(parse_salary_min_pln);
        offer.description = Some(preview.content);
        if matches_query(&offer, &query.query) {
            offers.push(offer);
        }
    }
    Ok(offers)
}

async fn get_json(client: &Client, url: &str) -> Result<Value, String> {
    let response = client
        .get(url)
        .send()
        .await
        .map_err(|error| error.to_string())?;
    if !response.status().is_success() {
        return Err(format!("HTTP {}", response.status()));
    }
    response.json().await.map_err(|error| error.to_string())
}

fn extract_next_data(html: &str) -> Option<Value> {
    let regex =
        Regex::new(r#"(?is)<script[^>]+id=[\"']__NEXT_DATA__[\"'][^>]*>(.*?)</script>"#).ok()?;
    let raw = regex.captures(html)?.get(1)?.as_str();
    serde_json::from_str(raw).ok()
}

fn value_string(value: &Value, pointers: &[&str]) -> Option<String> {
    pointers.iter().find_map(|pointer| {
        value
            .pointer(pointer)
            .and_then(|candidate| match candidate {
                Value::String(text) if !text.trim().is_empty() => Some(text.trim().to_string()),
                Value::Number(number) => Some(number.to_string()),
                _ => None,
            })
    })
}

fn value_i64(value: &Value, pointers: &[&str]) -> Option<i64> {
    pointers.iter().find_map(|pointer| {
        value.pointer(pointer).and_then(|candidate| {
            candidate
                .as_i64()
                .or_else(|| candidate.as_f64().map(|number| number.round() as i64))
                .or_else(|| {
                    candidate
                        .as_str()
                        .and_then(|text| text.parse::<f64>().ok())
                        .map(|number| number.round() as i64)
                })
        })
    })
}

fn value_string_array(value: &Value, pointers: &[&str]) -> Vec<String> {
    pointers
        .iter()
        .find_map(|pointer| value.pointer(pointer).and_then(Value::as_array))
        .map(|items| {
            items
                .iter()
                .filter_map(|item| match item {
                    Value::String(text) => Some(text.trim().to_string()),
                    Value::Object(_) => value_string(item, &["/name", "/value", "/label"]),
                    _ => None,
                })
                .filter(|item| !item.is_empty())
                .collect()
        })
        .unwrap_or_default()
}

fn string_list(value: Option<&Value>, keys: &[&str]) -> Vec<String> {
    value
        .and_then(Value::as_array)
        .map(|items| {
            items
                .iter()
                .filter_map(|item| match item {
                    Value::String(text) => Some(text.trim().to_string()),
                    Value::Object(_) => keys.iter().find_map(|key| {
                        item.get(*key)
                            .and_then(Value::as_str)
                            .map(|text| text.trim().to_string())
                    }),
                    _ => None,
                })
                .filter(|item| !item.is_empty())
                .collect()
        })
        .unwrap_or_default()
}

fn salary_from_employment_types(value: Option<&Value>) -> (Option<String>, Option<i64>) {
    let Some(items) = value.and_then(Value::as_array) else {
        return (None, None);
    };
    let selected = items
        .iter()
        .find(|item| value_string(item, &["/currency"]).as_deref() == Some("PLN"))
        .or_else(|| items.first());
    let Some(selected) = selected else {
        return (None, None);
    };
    let min = value_i64(selected, &["/from"]);
    let max = value_i64(selected, &["/to"]);
    let currency = value_string(selected, &["/currency"]);
    let unit = value_string(selected, &["/unit", "/type"]);
    let salary = format_salary(min, max, currency.as_deref(), unit.as_deref());
    let min_pln = currency
        .as_deref()
        .filter(|currency| currency.eq_ignore_ascii_case("PLN"))
        .and(min);
    (salary, min_pln)
}

fn format_salary(
    min: Option<i64>,
    max: Option<i64>,
    currency: Option<&str>,
    unit: Option<&str>,
) -> Option<String> {
    if min.is_none() && max.is_none() {
        return None;
    }
    let currency = currency.unwrap_or("PLN");
    let range = match (min, max) {
        (Some(min), Some(max)) => format!("{min}–{max}"),
        (Some(min), None) => format!("from {min}"),
        (None, Some(max)) => format!("up to {max}"),
        _ => return None,
    };
    Some(match unit {
        Some(unit) if !unit.trim().is_empty() => {
            format!("{range} {currency} / {}", unit.to_lowercase())
        }
        _ => format!("{range} {currency}"),
    })
}

fn parse_salary_min_pln(text: &str) -> Option<i64> {
    let lower = text.to_lowercase();
    if !(lower.contains("pln") || lower.contains("zł")) {
        return None;
    }
    let regex = Regex::new(r"(?i)(\d{1,3}(?:\s\d{3})+|\d+)").ok()?;
    let raw = regex.captures(text)?.get(1)?.as_str();
    let digits = raw
        .chars()
        .filter(|character| character.is_ascii_digit())
        .collect::<String>();
    let value = digits.parse::<i64>().ok()?;
    if lower.contains("hour") || lower.contains("godz") || lower.contains("/h") {
        Some(value.saturating_mul(160))
    } else {
        Some(value)
    }
}

fn normalize_work_mode(value: &str) -> String {
    let lower = value.to_lowercase();
    if lower.contains("remote") || lower.contains("zdal") {
        "remote".into()
    } else if lower.contains("hybrid") || lower.contains("hybryd") {
        "hybrid".into()
    } else if lower.contains("onsite") || lower.contains("office") || lower.contains("stacjon") {
        "onsite".into()
    } else {
        lower.trim().to_string()
    }
}

fn infer_work_mode(location: Option<&str>, title: Option<&str>) -> Option<String> {
    let text = format!(
        "{} {}",
        location.unwrap_or_default(),
        title.unwrap_or_default()
    );
    let normalized = normalize_work_mode(&text);
    matches!(normalized.as_str(), "remote" | "hybrid" | "onsite").then_some(normalized)
}

fn matches_query(offer: &JobOffer, query: &str) -> bool {
    let tokens = query_tokens(query);
    if tokens.is_empty() {
        return true;
    }
    let haystack = format!(
        "{} {} {} {} {}",
        offer.title,
        offer.company,
        offer.description.as_deref().unwrap_or_default(),
        offer.technologies.join(" "),
        offer.seniority.as_deref().unwrap_or_default()
    )
    .to_lowercase();
    let phrase = query.trim().to_lowercase();
    haystack.contains(&phrase) || tokens.iter().any(|token| haystack.contains(token))
}

fn query_tokens(query: &str) -> Vec<String> {
    const STOP: &[&str] = &[
        "and",
        "or",
        "the",
        "with",
        "developer",
        "engineer",
        "remote",
        "junior",
    ];
    query
        .to_lowercase()
        .split(|character: char| {
            !character.is_alphanumeric() && character != '+' && character != '#'
        })
        .filter(|token| token.len() >= 2 && !STOP.contains(token))
        .map(str::to_string)
        .collect()
}

fn passes_filters(offer: &JobOffer, query: &JobRadarQuery) -> bool {
    if !matches_query(offer, &query.query) {
        return false;
    }
    if query.remote_only && offer.work_mode.as_deref() != Some("remote") {
        return false;
    }
    if query.junior_friendly && is_explicitly_senior(offer) {
        return false;
    }
    if let Some(minimum) = query.min_salary_pln {
        if let Some(actual) = offer.salary_min_pln {
            if actual < minimum {
                return false;
            }
        }
    }
    if query.max_age_days > 0 {
        if let Some(date) = offer.published_at.as_deref().and_then(parse_date) {
            if (Utc::now() - date).num_days() > i64::from(query.max_age_days) {
                return false;
            }
        }
    }
    true
}

fn parse_date(value: &str) -> Option<DateTime<Utc>> {
    DateTime::parse_from_rfc3339(value)
        .ok()
        .map(|date| date.with_timezone(&Utc))
        .or_else(|| {
            chrono::NaiveDate::parse_from_str(value.get(..10).unwrap_or(value), "%Y-%m-%d")
                .ok()
                .and_then(|date| date.and_hms_opt(0, 0, 0))
                .map(|date| DateTime::<Utc>::from_naive_utc_and_offset(date, Utc))
        })
}

fn is_explicitly_senior(offer: &JobOffer) -> bool {
    let text = format!(
        "{} {}",
        offer.title.to_lowercase(),
        offer
            .seniority
            .as_deref()
            .unwrap_or_default()
            .to_lowercase()
    );
    [
        "senior",
        "lead",
        "staff",
        "principal",
        "director",
        "head of",
        "manager",
    ]
    .iter()
    .any(|marker| text.contains(marker))
}

fn score_offer(
    offer: &mut JobOffer,
    query: &JobRadarQuery,
    profile: Option<&crate::model::UserProfile>,
) {
    let mut score = 35_i32;
    let mut reasons = Vec::new();
    let mut risks = Vec::new();
    match offer.work_mode.as_deref() {
        Some("remote") => {
            score += 20;
            reasons.push("Fully remote".into());
        }
        Some("hybrid") => {
            score += 6;
            risks.push("Hybrid rather than fully remote".into());
        }
        Some("onsite") => {
            score -= 18;
            risks.push("On-site role".into());
        }
        _ => risks.push("Work mode is not explicit".into()),
    }

    let role_text = format!(
        "{} {}",
        offer.title.to_lowercase(),
        offer
            .seniority
            .as_deref()
            .unwrap_or_default()
            .to_lowercase()
    );
    if ["intern", "trainee", "graduate", "junior", "assistant"]
        .iter()
        .any(|marker| role_text.contains(marker))
    {
        score += 18;
        reasons.push("Early-career seniority".into());
    } else if is_explicitly_senior(offer) {
        score -= 35;
        risks.push("Explicitly senior role".into());
    } else if role_text.contains("mid") || role_text.contains("middle") {
        score -= 5;
        risks.push("Mid-level positioning".into());
    } else {
        score += 4;
    }

    let all_text = format!(
        "{} {} {} {}",
        offer.title,
        offer.description.as_deref().unwrap_or_default(),
        offer.technologies.join(" "),
        query.query
    )
    .to_lowercase();
    if [
        "ai",
        "llm",
        "agent",
        "codex",
        "automation",
        "product engineer",
        "full stack",
        "fullstack",
    ]
    .iter()
    .any(|marker| all_text.contains(marker))
    {
        score += 10;
        reasons.push("Matches AI-native/product work".into());
    }

    if let Some(profile) = profile {
        let target_hits = profile
            .target_roles
            .iter()
            .filter(|target| token_overlap(&offer.title, target) > 0)
            .count();
        if target_hits > 0 {
            score += 12;
            reasons.push("Matches a target role from your profile".into());
        }
        let skills_text = format!(
            "{} {}",
            all_text,
            offer.technologies.join(" ").to_lowercase()
        );
        let skill_hits = profile
            .skills
            .iter()
            .filter(|skill| {
                let skill = skill.trim().to_lowercase();
                skill.len() >= 2 && skills_text.contains(&skill)
            })
            .take(5)
            .count();
        if skill_hits > 0 {
            score += (skill_hits as i32) * 4;
            reasons.push(format!("{skill_hits} profile skill matches"));
        }
    }

    if let Some(years) = required_years(&all_text) {
        match years {
            0 | 1 => {
                score += 6;
                reasons.push("Experience requirement is within reach".into());
            }
            2 => risks.push("Asks for 2 years; likely a soft stretch".into()),
            3 => {
                score -= 8;
                risks.push("Asks for about 3 years of experience".into());
            }
            _ => {
                score -= 25;
                risks.push(format!("Asks for {years}+ years of experience"));
            }
        }
    }

    match offer.salary_min_pln {
        Some(value) if value >= 10_000 => {
            score += 12;
            reasons.push("Salary is a clear step up".into());
        }
        Some(value) if value >= 8_000 => {
            score += 7;
            reasons.push("Salary meets the minimum step-up range".into());
        }
        Some(value) if value < 7_000 => {
            score -= 10;
            risks.push("Salary may not beat the current IDEGO path".into());
        }
        None => risks.push("Salary is not published".into()),
        _ => {}
    }

    if offer.description.is_none() {
        score -= 2;
    }
    offer.score = score.clamp(0, 100);
    offer.better_than_idego = offer.score >= 68
        && !is_explicitly_senior(offer)
        && (offer.salary_min_pln.unwrap_or(0) >= 8_000
            || (offer.work_mode.as_deref() == Some("remote") && offer.score >= 76));
    offer.reasons = reasons;
    offer.risks = risks;
}

fn required_years(text: &str) -> Option<u32> {
    let regex = Regex::new(r"(?i)(\d{1,2})\s*\+?\s*(?:years?|yrs?|lat(?:a)?)").ok()?;
    regex
        .captures_iter(text)
        .filter_map(|capture| capture.get(1)?.as_str().parse::<u32>().ok())
        .max()
}

fn token_overlap(left: &str, right: &str) -> usize {
    let left = query_tokens(left).into_iter().collect::<HashSet<_>>();
    query_tokens(right)
        .into_iter()
        .filter(|token| left.contains(token))
        .count()
}

fn deduplicate(offers: Vec<JobOffer>) -> Vec<JobOffer> {
    let mut unique: HashMap<String, JobOffer> = HashMap::new();
    for offer in offers {
        let key = format!(
            "{}:{}",
            normalize_key(&offer.company),
            normalize_key(&offer.title)
        );
        match unique.get(&key) {
            Some(existing) if source_rank(existing) >= source_rank(&offer) => {}
            _ => {
                unique.insert(key, offer);
            }
        }
    }
    unique.into_values().collect()
}

fn source_rank(offer: &JobOffer) -> usize {
    let direct = if offer.source == "freehire" { 0 } else { 10 };
    direct + usize::from(offer.description.is_some()) + usize::from(offer.salary.is_some())
}

fn normalize_key(value: &str) -> String {
    value
        .to_lowercase()
        .chars()
        .filter(|character| character.is_alphanumeric())
        .collect()
}

fn ensure_schema(connection: &rusqlite::Connection) -> Result<(), String> {
    connection
        .execute_batch(
            "CREATE TABLE IF NOT EXISTS job_offers(
                id TEXT PRIMARY KEY,
                source TEXT NOT NULL,
                external_id TEXT NOT NULL,
                title TEXT NOT NULL,
                company TEXT NOT NULL,
                url TEXT NOT NULL,
                status TEXT NOT NULL,
                score INTEGER NOT NULL,
                first_seen_at TEXT NOT NULL,
                last_seen_at TEXT NOT NULL,
                data_json TEXT NOT NULL,
                UNIQUE(source, external_id)
            );
            CREATE INDEX IF NOT EXISTS job_offers_score_idx ON job_offers(score DESC, last_seen_at DESC);
            CREATE INDEX IF NOT EXISTS job_offers_url_idx ON job_offers(url);",
        )
        .map_err(|error| error.to_string())?;
    Ok(())
}

fn persist_offers(state: &State<'_, AppState>, offers: &[JobOffer]) -> Result<(), String> {
    let mut connection = conn(state)?;
    ensure_schema(&connection)?;
    let transaction = connection
        .transaction()
        .map_err(|error| error.to_string())?;
    for offer in offers {
        let existing_first_seen = transaction
            .query_row(
                "SELECT first_seen_at FROM job_offers WHERE id=?",
                [&offer.id],
                |row| row.get::<_, String>(0),
            )
            .ok();
        let mut stored = offer.clone();
        if let Some(first_seen) = existing_first_seen {
            stored.first_seen_at = first_seen;
        }
        let data = serde_json::to_string(&stored).map_err(|error| error.to_string())?;
        transaction
            .execute(
                "INSERT INTO job_offers(id,source,external_id,title,company,url,status,score,first_seen_at,last_seen_at,data_json)
                 VALUES(?,?,?,?,?,?,?,?,?,?,?)
                 ON CONFLICT(id) DO UPDATE SET
                    title=excluded.title,
                    company=excluded.company,
                    url=excluded.url,
                    status=excluded.status,
                    score=excluded.score,
                    last_seen_at=excluded.last_seen_at,
                    data_json=excluded.data_json",
                params![
                    stored.id,
                    stored.source,
                    stored.external_id,
                    stored.title,
                    stored.company,
                    stored.url,
                    stored.status,
                    stored.score,
                    stored.first_seen_at,
                    stored.last_seen_at,
                    data,
                ],
            )
            .map_err(|error| error.to_string())?;
    }
    transaction.commit().map_err(|error| error.to_string())
}

fn update_validation_status(
    state: &State<'_, AppState>,
    url: &str,
    status: &str,
) -> Result<(), String> {
    let connection = conn(state)?;
    ensure_schema(&connection)?;
    let mut statement = connection
        .prepare("SELECT id,data_json FROM job_offers WHERE url=?")
        .map_err(|error| error.to_string())?;
    let rows = statement
        .query_map([url], |row| {
            Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
        })
        .map_err(|error| error.to_string())?
        .filter_map(Result::ok)
        .collect::<Vec<_>>();
    drop(statement);
    for (id, raw) in rows {
        let Ok(mut offer) = serde_json::from_str::<JobOffer>(&raw) else {
            continue;
        };
        offer.status = status.to_string();
        offer.last_seen_at = Utc::now().to_rfc3339();
        let data = serde_json::to_string(&offer).map_err(|error| error.to_string())?;
        connection
            .execute(
                "UPDATE job_offers SET status=?,last_seen_at=?,data_json=? WHERE id=?",
                params![offer.status, offer.last_seen_at, data, id],
            )
            .map_err(|error| error.to_string())?;
    }
    Ok(())
}

fn classify_live_body(body: &str, checked_at: String) -> JobValidationResult {
    let normalized = body.to_lowercase();
    let expired_patterns = [
        "no longer accepting applications",
        "job is no longer available",
        "position has been filled",
        "offer has expired",
        "oferta wygasła",
        "oferta jest nieaktualna",
        "rekrutacja zakończona",
        "ogłoszenie nie jest już dostępne",
        "nie znaleziono oferty",
    ];
    if expired_patterns
        .iter()
        .any(|pattern| normalized.contains(pattern))
    {
        return JobValidationResult {
            status: "expired".into(),
            checked_at,
            message:
                "The original page says the recruitment is closed or the posting is unavailable."
                    .into(),
        };
    }
    if normalized.len() < 300 {
        return JobValidationResult {
            status: "uncertain".into(),
            checked_at,
            message:
                "The source returned a very small page, so RoleTailor cannot confirm liveness."
                    .into(),
        };
    }
    JobValidationResult {
        status: "active".into(),
        checked_at,
        message: "The original posting is reachable and contains no expiry signal.".into(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn test_offer(title: &str) -> JobOffer {
        let mut offer = new_offer(
            "test",
            "1".into(),
            title.into(),
            "Acme".into(),
            "https://example.com/job".into(),
        );
        offer.work_mode = Some("remote".into());
        offer.description = Some(
            "Build AI products with TypeScript and React. One year of experience is welcome."
                .into(),
        );
        offer.salary_min_pln = Some(10_000);
        offer
    }

    #[test]
    fn junior_remote_product_role_is_ranked_as_step_up() {
        let mut offer = test_offer("Junior AI Product Engineer");
        score_offer(&mut offer, &JobRadarQuery::default(), None);
        assert!(offer.score >= 80);
        assert!(offer.better_than_idego);
    }

    #[test]
    fn senior_role_is_penalised_and_filtered() {
        let mut offer = test_offer("Senior Staff Engineer");
        score_offer(&mut offer, &JobRadarQuery::default(), None);
        assert!(offer.score < 68);
        assert!(!passes_filters(&offer, &JobRadarQuery::default()));
    }

    #[test]
    fn two_year_requirement_is_a_stretch_not_a_rejection() {
        assert_eq!(
            required_years("Minimum 2 years of commercial experience"),
            Some(2)
        );
        let mut offer = test_offer("Product Engineer");
        offer.description = Some("Minimum 2 years of commercial experience with React".into());
        score_offer(&mut offer, &JobRadarQuery::default(), None);
        assert!(offer.risks.iter().any(|risk| risk.contains("soft stretch")));
        assert!(offer.score >= 60);
    }

    #[test]
    fn validation_detects_closed_posting_copy() {
        let result = classify_live_body(
            "This position has been filled and is no longer accepting applications.",
            "now".into(),
        );
        assert_eq!(result.status, "expired");
    }

    #[test]
    fn parses_hourly_polish_salary_to_monthly_floor() {
        assert_eq!(parse_salary_min_pln("60–80 PLN / godz."), Some(9_600));
    }

    #[test]
    fn parses_monthly_salary_range_floor() {
        assert_eq!(parse_salary_min_pln("8 000–12 000 PLN"), Some(8_000));
    }

    #[test]
    fn direct_source_wins_over_freehire_duplicate() {
        let direct = test_offer("Junior AI Engineer");
        let mut aggregate = direct.clone();
        aggregate.source = "freehire".into();
        aggregate.id = "freehire:1".into();
        let result = deduplicate(vec![aggregate, direct]);
        assert_eq!(result.len(), 1);
        assert_ne!(result[0].source, "freehire");
    }
}
