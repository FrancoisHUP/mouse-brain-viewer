export default function VersionBadge({
  version,
  commitSha,
  commitShort,
  commitUrl,
  theme,
}: {
  version: string;
  commitSha: string;
  commitShort: string;
  commitUrl: string | null;
  theme: "light" | "gray" | "dark";
}) {
  const isRepoFallback = !!commitUrl && commitSha === "dev";

  const containerStyle = {
    position: "fixed" as const,
    right: 12,
    bottom: 8,
    zIndex: 18,
    display: "flex",
    alignItems: "center",
    gap: 6,
    padding: "3px 7px",
    borderRadius: 8,
    border:
      theme === "light"
        ? "1px solid rgba(24,33,43,0.08)"
        : "1px solid rgba(255,255,255,0.06)",
    background:
      theme === "light"
        ? "rgba(255,255,255,0.52)"
        : theme === "gray"
          ? "rgba(46,52,60,0.48)"
          : "rgba(12,14,18,0.42)",
    color: theme === "light" ? "rgba(24,33,43,0.58)" : "rgba(255,255,255,0.5)",
    boxShadow: "0 2px 8px rgba(0,0,0,0.12)",
    backdropFilter: "blur(6px)",
    fontFamily: "sans-serif",
    fontSize: 10,
    lineHeight: 1,
    letterSpacing: 0.2,
    pointerEvents: "auto" as const,
    userSelect: "none" as const,
    textDecoration: "none",
    cursor: commitUrl ? "pointer" : "default",
    transition: "background 160ms ease, border-color 160ms ease, color 160ms ease, box-shadow 160ms ease",
  };

  const linkTitle = !commitUrl
    ? "Git commit unavailable in local development"
    : isRepoFallback
      ? "Open repository"
      : `Open deployed commit ${commitSha}`;

  const content = (
    <>
      <span title={`Viewer version ${version}`}>v{version}</span>
      <span style={{ opacity: 0.22 }}>•</span>
      <span
        title={linkTitle}
        style={{
          opacity: commitUrl ? 1 : 0.5,
          fontWeight: 500,
        }}
      >
        {commitShort}
      </span>
    </>
  );

  if (commitUrl) {
    return (
      <a
        href={commitUrl}
        target="_blank"
        rel="noreferrer"
        title={linkTitle}
        style={containerStyle}
      >
        {content}
      </a>
    );
  }

  return <div style={containerStyle}>{content}</div>;
}
