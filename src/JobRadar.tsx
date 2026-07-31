import { useEffect, useMemo, useState } from "react";
import {
  Banknote,
  BriefcaseBusiness,
  Clock3,
  ExternalLink,
  LoaderCircle,
  MapPin,
  RefreshCw,
  Search,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  WifiOff,
} from "lucide-react";
import { backend } from "./lib/backend";
import type { JobOffer, JobRadarQuery, JobRadarResult, UserProfile } from "./lib/schema";
import "./job-radar.css";

const sourceLabels: Record<string, string> = {
  justjoin: "Just Join IT",
  rocketjobs: "RocketJobs",
  nofluffjobs: "No Fluff Jobs",
  theprotocol: "TheProtocol",
  pracuj: "Pracuj.pl",
  freehire: "Startup / ATS",
};
const allSources = Object.keys(sourceLabels);

function defaultQuery(profile: UserProfile): JobRadarQuery {
  return {
    query: profile.targetRoles[0] || "product engineer AI full stack",
    remoteOnly: true,
    juniorFriendly: true,
    maxAgeDays: 14,
    sources: allSources,
    limit: 100,
  };
}

function formatDate(value?: string) {
  if (!value) return "date unknown";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value.slice(0, 10);
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function OfferCard({
  offer,
  onTailor,
  onError,
}: {
  offer: JobOffer;
  onTailor: (offer: JobOffer) => Promise<void>;
  onError: (error: unknown) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [validation, setValidation] = useState<string | null>(null);
  const tailor = async () => {
    setBusy(true);
    setValidation(null);
    try {
      const result = await backend.validateJobOffer(offer.url);
      setValidation(result.status);
      if (result.status === "expired") return;
      await onTailor(offer);
    } catch (error) {
      onError(error);
    } finally {
      setBusy(false);
    }
  };
  return (
    <article className={`radar-offer ${offer.betterThanIdego ? "step-up" : ""}`}>
      <div className="radar-offer-head">
        <div>
          <div className="radar-offer-meta">
            <span className={`radar-source source-${offer.source}`}>
              {sourceLabels[offer.source] || offer.source}
            </span>
            <span className={`radar-status status-${offer.status}`}>{offer.status}</span>
            {offer.betterThanIdego ? <span className="step-up-pill">Better than IDEGO</span> : null}
          </div>
          <h2>{offer.title}</h2>
          <p className="radar-company">{offer.company}</p>
        </div>
        <div className="radar-score" aria-label={`${offer.score} fit score`}>
          <strong>{offer.score}</strong>
          <span>fit</span>
        </div>
      </div>

      <div className="radar-facts">
        <span><MapPin />{offer.location || offer.workMode || "Location unknown"}</span>
        <span><BriefcaseBusiness />{offer.seniority || offer.workMode || "Seniority unknown"}</span>
        <span><Banknote />{offer.salary || "Salary hidden"}</span>
        <span><Clock3 />{formatDate(offer.publishedAt)}</span>
      </div>

      {offer.technologies.length ? (
        <div className="radar-tech">
          {offer.technologies.slice(0, 8).map((technology) => <span key={technology}>{technology}</span>)}
        </div>
      ) : null}

      <div className="radar-evidence">
        <div>
          <h3><Sparkles /> Why it may fit</h3>
          <ul>{offer.reasons.slice(0, 4).map((reason) => <li key={reason}>{reason}</li>)}</ul>
        </div>
        <div className="risks">
          <h3><ShieldAlert /> Risks</h3>
          <ul>{offer.risks.slice(0, 4).map((risk) => <li key={risk}>{risk}</li>)}</ul>
        </div>
      </div>

      <div className="radar-actions">
        <a href={offer.url} target="_blank" rel="noreferrer"><ExternalLink /> Original posting</a>
        {validation === "expired" ? <span className="validation expired"><WifiOff /> Posting expired</span> : null}
        {validation === "active" ? <span className="validation active"><ShieldCheck /> Revalidated</span> : null}
        <button className="primary" onClick={() => void tailor()} disabled={busy || validation === "expired"}>
          {busy ? <LoaderCircle className="spin" /> : <Sparkles />}
          {busy ? "Checking…" : "Tailor CV"}
        </button>
      </div>
    </article>
  );
}

export default function JobRadar({
  profile,
  onTailor,
  onError,
}: {
  profile: UserProfile;
  onTailor: (offer: JobOffer) => Promise<void>;
  onError: (error: unknown) => void;
}) {
  const [query, setQuery] = useState<JobRadarQuery>(() => defaultQuery(profile));
  const [result, setResult] = useState<JobRadarResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [cacheLoaded, setCacheLoaded] = useState(false);

  useEffect(() => {
    let disposed = false;
    void backend.cachedJobs(query)
      .then((cached) => {
        if (!disposed && cached.offers.length) setResult(cached);
      })
      .catch(() => undefined)
      .finally(() => { if (!disposed) setCacheLoaded(true); });
    return () => { disposed = true; };
  // Load the local cache once; explicit searches use the current filters.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const sourceSet = useMemo(() => new Set(query.sources), [query.sources]);
  const toggleSource = (source: string) => {
    setQuery((current) => ({
      ...current,
      sources: sourceSet.has(source)
        ? current.sources.filter((candidate) => candidate !== source)
        : [...current.sources, source],
    }));
  };
  const search = async () => {
    setLoading(true);
    try {
      setResult(await backend.searchJobs(query));
    } catch (error) {
      onError(error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="workspace radar-view">
      <div className="workspace-header radar-header">
        <div>
          <p className="eyebrow">Job Radar</p>
          <h1>Find the next role, not another internship.</h1>
          <p>Fresh offers are checked at their source, deduplicated and ranked against your RoleTailor profile.</p>
        </div>
        <div className="radar-summary">
          <strong>{result?.offers.length || 0}</strong>
          <span>matching offers</span>
          <small>{result ? `Updated ${new Date(result.fetchedAt).toLocaleTimeString()}` : cacheLoaded ? "Ready to scan" : "Loading cache…"}</small>
        </div>
      </div>

      <section className="radar-controls">
        <label className="radar-query">
          <Search />
          <input
            value={query.query}
            onChange={(event) => setQuery({ ...query, query: event.target.value })}
            placeholder="Product engineer, AI, full stack…"
            onKeyDown={(event) => { if (event.key === "Enter") void search(); }}
          />
        </label>
        <div className="radar-filter-row">
          <label><input type="checkbox" checked={query.remoteOnly} onChange={(event) => setQuery({ ...query, remoteOnly: event.target.checked })} /> Remote only</label>
          <label><input type="checkbox" checked={query.juniorFriendly} onChange={(event) => setQuery({ ...query, juniorFriendly: event.target.checked })} /> Early-career friendly</label>
          <label>Max age <select value={query.maxAgeDays} onChange={(event) => setQuery({ ...query, maxAgeDays: Number(event.target.value) })}><option value={3}>3 days</option><option value={7}>7 days</option><option value={14}>14 days</option><option value={30}>30 days</option></select></label>
          <label>Min PLN <input className="salary-input" inputMode="numeric" value={query.minSalaryPln || ""} placeholder="optional" onChange={(event) => setQuery({ ...query, minSalaryPln: event.target.value ? Number(event.target.value) : undefined })} /></label>
          <button className="run-button radar-search-button" onClick={() => void search()} disabled={loading || !query.sources.length}>
            {loading ? <LoaderCircle className="spin" /> : <RefreshCw />}
            {loading ? "Scanning sources…" : "Scan now"}
          </button>
        </div>
        <div className="radar-sources">
          {allSources.map((source) => (
            <button key={source} className={sourceSet.has(source) ? "active" : ""} onClick={() => toggleSource(source)}>
              <span />{sourceLabels[source]}
            </button>
          ))}
        </div>
      </section>

      {result?.sources.length ? (
        <div className="source-health">
          {result.sources.map((source) => (
            <span key={source.source} className={source.status} title={source.message || undefined}>
              {source.status === "ok" ? <ShieldCheck /> : source.status === "error" ? <WifiOff /> : null}
              {sourceLabels[source.source] || source.source}: {source.status === "ok" ? source.found : source.status}
            </span>
          ))}
        </div>
      ) : null}

      <div className="radar-list">
        {loading && !result?.offers.length ? (
          <div className="radar-empty"><LoaderCircle className="spin" /><h2>Scanning live job feeds</h2><p>Sources fail independently, so one blocked portal will not stop the radar.</p></div>
        ) : result?.offers.length ? (
          result.offers.map((offer) => <OfferCard key={offer.id} offer={offer} onTailor={onTailor} onError={onError} />)
        ) : (
          <div className="radar-empty"><Search /><h2>No cached matches yet</h2><p>Run the first scan. Try a broad role such as “product engineer” or “full stack”.</p></div>
        )}
      </div>
    </div>
  );
}
