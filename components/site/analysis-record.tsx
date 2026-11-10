"use client";

export type AnalysisOutputRecord = {
  subject: string;
  measurement: string;
  location: string;
  status: string;
  relevance: string;
};

const OUTPUT_FIELDS: { key: keyof AnalysisOutputRecord; label: string }[] = [
  { key: "subject", label: "Subject" },
  { key: "measurement", label: "Measurement" },
  { key: "location", label: "Location" },
  { key: "status", label: "Status" },
  { key: "relevance", label: "Relevance" },
];

export function AnalysisOutput({ record }: { record: AnalysisOutputRecord }) {
  return (
    <div className="site-analysis-output">
      <h3 className="site-subtitle">Site analysis output</h3>
      <dl>
        {OUTPUT_FIELDS.map((field) => (
          <div key={field.key}>
            <dt>{field.label}</dt>
            <dd>{record[field.key]}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

export function AnalysisAccuracy({ limits }: { limits: readonly string[] }) {
  return (
    <details className="site-sun-accuracy">
      <summary>Accuracy + Sources</summary>
      <ul>
        {limits.map((item) => <li key={item}>{item}</li>)}
      </ul>
    </details>
  );
}
