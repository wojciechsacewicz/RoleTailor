use crate::model::JobPreview;
use regex::Regex;
use scraper::{Html, Selector};
use url::Url;

const TECH: &[&str] = &[
    "TypeScript",
    "JavaScript",
    "React",
    "Rust",
    "Python",
    "Node.js",
    "Tauri",
    "AWS",
    "Azure",
    "Docker",
    "Kubernetes",
    "PostgreSQL",
    "SQL",
    "Supabase",
    "Cloudflare",
    "n8n",
    "UiPath",
    "LLM",
    "Codex",
];

pub fn extract(html: &str, url: &str) -> Result<JobPreview, String> {
    let scripts = Regex::new(r"(?is)<(?:script|style)[^>]*>.*?</(?:script|style)>").unwrap();
    let visible_html = scripts.replace_all(html, " ");
    let doc = Html::parse_document(&visible_html);
    let original = Html::parse_document(html);
    let posting = find_job_posting(&original);
    let title = Selector::parse("h1").unwrap();
    let meta = Selector::parse("meta[property='og:site_name'],meta[name='author']").unwrap();
    let body = Selector::parse("main,article,body").unwrap();
    let role = posting
        .as_ref()
        .and_then(|p| p.get("title"))
        .and_then(|v| v.as_str())
        .map(str::to_owned)
        .or_else(|| {
            doc.select(&title)
                .next()
                .map(|x| x.text().collect::<Vec<_>>().join(" "))
                .filter(|s| !s.trim().is_empty())
        })
        .unwrap_or_else(|| "Role to identify".into());
    let company = posting
        .as_ref()
        .and_then(|p| p.pointer("/hiringOrganization/name"))
        .and_then(|v| v.as_str())
        .map(str::to_owned)
        .or_else(|| {
            doc.select(&meta)
                .find_map(|x| x.value().attr("content"))
                .map(str::to_owned)
        })
        .or_else(|| {
            Url::parse(url).ok().and_then(|u| {
                u.host_str().map(|h| {
                    h.trim_start_matches("www.")
                        .split('.')
                        .next()
                        .unwrap_or(h)
                        .to_string()
                })
            })
        })
        .unwrap_or_else(|| "Company to identify".into());
    let raw = doc
        .select(&body)
        .next()
        .map(|x| x.text().collect::<Vec<_>>().join(" "))
        .unwrap_or_default();
    let content = Regex::new(r"\s+")
        .unwrap()
        .replace_all(&raw, " ")
        .trim()
        .chars()
        .take(30_000)
        .collect::<String>();
    let content = trim_job_content(&content);
    if content.len() < 80 {
        return Err(
            "The page did not contain enough readable job content. Paste the listing text instead."
                .into(),
        );
    }
    let lower = content.to_lowercase();
    let mut technologies = posting
        .as_ref()
        .and_then(|p| p.get("skills"))
        .and_then(|v| v.as_array())
        .map(|items| {
            items
                .iter()
                .filter_map(|v| v.get("value").and_then(|v| v.as_str()))
                .map(str::to_owned)
                .collect::<Vec<_>>()
        })
        .unwrap_or_default();
    technologies.extend(
        TECH.iter()
            .filter(|t| lower.contains(&t.to_lowercase()))
            .map(|s| s.to_string())
            .collect::<Vec<_>>(),
    );
    technologies.sort();
    technologies.dedup();
    let location = find_after(&content, &["Location:", "Lokalizacja:"]);
    let salary = posting.as_ref().and_then(format_salary).or_else(|| {
        Regex::new(r"(?i)(\d[\d\s.,]{2,}\s*(?:PLN|EUR|USD|zł).{0,30})")
            .unwrap()
            .captures(&content)
            .and_then(|c| c.get(1))
            .map(|m| m.as_str().trim().to_string())
    });
    Ok(JobPreview {
        company,
        role: role.trim().to_string(),
        location,
        seniority: None,
        technologies,
        salary,
        content,
        source_url: Some(url.into()),
    })
}

fn find_job_posting(doc: &Html) -> Option<serde_json::Value> {
    let selector = Selector::parse("script[type='application/ld+json']").unwrap();
    doc.select(&selector).find_map(|node| {
        serde_json::from_str::<serde_json::Value>(&node.text().collect::<String>())
            .ok()
            .and_then(find_posting_value)
    })
}
fn find_posting_value(value: serde_json::Value) -> Option<serde_json::Value> {
    if value.get("@type").and_then(|v| v.as_str()) == Some("JobPosting") {
        return Some(value);
    }
    if let Some(items) = value.get("@graph").and_then(|v| v.as_array()) {
        return items
            .iter()
            .find(|v| v.get("@type").and_then(|v| v.as_str()) == Some("JobPosting"))
            .cloned();
    }
    None
}
fn trim_job_content(content: &str) -> String {
    let starts = ["Opis wymagań", "Requirements", "Job description"];
    let ends = [
        "Szczegóły oferty",
        "About the company",
        "Zobacz podobne oferty",
    ];
    let start = starts
        .iter()
        .filter_map(|x| content.find(x))
        .min()
        .unwrap_or(0);
    let tail = &content[start..];
    let end = ends
        .iter()
        .filter_map(|x| tail.find(x))
        .min()
        .unwrap_or(tail.len());
    tail[..end].trim().chars().take(20_000).collect()
}
fn format_salary(posting: &serde_json::Value) -> Option<String> {
    let currency = posting
        .pointer("/baseSalary/currency")
        .and_then(|v| v.as_str())?;
    let value = posting
        .pointer("/baseSalary/value/value")
        .and_then(|v| v.as_f64())?;
    let unit = posting
        .pointer("/baseSalary/value/unitText")
        .and_then(|v| v.as_str())
        .unwrap_or("month");
    Some(format!("{value:.0} {currency} / {}", unit.to_lowercase()))
}

fn find_after(s: &str, needles: &[&str]) -> Option<String> {
    needles.iter().find_map(|n| {
        s.find(n).map(|i| {
            s[i + n.len()..]
                .trim()
                .chars()
                .take_while(|c| *c != '\n' && *c != '|')
                .take(80)
                .collect()
        })
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn extracts_job() {
        let p = extract("<html><meta property='og:site_name' content='Acme'><main><h1>Rust Engineer</h1><p>We need a Rust and TypeScript engineer to build local desktop tools. Location: Gdynia | Salary 20 000 PLN monthly.</p></main></html>", "https://jobs.acme.test/1").unwrap();
        assert_eq!(p.company, "Acme");
        assert!(p.technologies.contains(&"Rust".into()));
    }
    #[test]
    fn prefers_job_posting_and_drops_page_scripts() {
        let html = r#"<body>Navigation Opis wymagań Real requirements for backend and frontend engineering with commercial delivery experience and strong communication skills. Zakres obowiązków Build and maintain business software, APIs and user interfaces with the product team. Szczegóły oferty Related jobs<script type='application/ld+json'>{"@graph":[{"@type":"JobPosting","title":"Fullstack Developer","hiringOrganization":{"name":"Directio"},"skills":[{"value":"C#"}],"baseSalary":{"currency":"PLN","value":{"value":16500,"unitText":"Month"}}},{"countries":["Afghanistan","Zimbabwe"]}]}</script></body>"#;
        let result = extract(html, "https://nofluffjobs.com/job").unwrap();
        assert_eq!(result.company, "Directio");
        assert_eq!(result.role, "Fullstack Developer");
        assert_eq!(result.salary.as_deref(), Some("16500 PLN / month"));
        assert!(result.content.contains("Real requirements"));
        assert!(!result.content.contains("Afghanistan"));
        assert!(!result.content.contains("Related jobs"));
    }
}
