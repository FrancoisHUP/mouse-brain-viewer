export default function VersionBadge({ version, commitSha, commitShort, commitUrl, theme }: { version: string; commitSha: string; commitShort: string; commitUrl: string | null; theme: "light" | "gray" | "dark"; }) {
  return (
    <div style={{ position: "fixed", right: 12, bottom: 8, zIndex: 18, display: "flex", alignItems: "center", gap: 6, padding: "3px 7px", borderRadius: 8, border: theme === "light" ? "1px solid rgba(24,33,43,0.08)" : "1px solid rgba(255,255,255,0.06)", background: theme === "light" ? "rgba(255,255,255,0.52)" : theme === "gray" ? "rgba(46,52,60,0.48)" : "rgba(12,14,18,0.42)", color: theme === "light" ? "rgba(24,33,43,0.58)" : "rgba(255,255,255,0.5)", boxShadow: "0 2px 8px rgba(0,0,0,0.12)", backdropFilter: "blur(6px)", fontFamily: "sans-serif", fontSize: 10, lineHeight: 1, letterSpacing: 0.2, pointerEvents: "auto", userSelect: "none" }}>
      <span title={`Viewer version ${version}`}>v{version}</span>
      <span style={{ opacity: 0.22 }}>•</span>
      {commitUrl ? <a href={commitUrl} target="_blank" rel="noreferrer" title={`Open deployed commit ${commitSha}`} style={{ color: theme === "light" ? "rgba(24,33,43,0.56)" : "rgba(255,255,255,0.46)", textDecoration: "none", fontWeight: 500 }}>{commitShort}</a> : <span title="Git commit unavailable in local development" style={{ opacity: 0.5 }}>{commitShort}</span>}
    </div>
  );
}
