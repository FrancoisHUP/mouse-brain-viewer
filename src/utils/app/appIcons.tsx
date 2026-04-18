import type { SVGProps } from "react";

type IconProps = SVGProps<SVGSVGElement>;

function baseProps(props?: IconProps): IconProps {
  return {
    width: 17,
    height: 17,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.9,
    strokeLinecap: "round",
    strokeLinejoin: "round",
    ...props,
  };
}

export function MenuHamburgerIcon(props?: IconProps) {
  return (
    <svg {...baseProps({ strokeWidth: 2, ...props })}>
      <path d="M4 7h16" />
      <path d="M4 12h16" />
      <path d="M4 17h16" />
    </svg>
  );
}

export function NewViewerIcon(props?: IconProps) {
  return (
    <svg {...baseProps(props)}>
      <rect x="4" y="5" width="16" height="14" rx="2.5" />
      <path d="M12 9v6" />
      <path d="M9 12h6" />
    </svg>
  );
}

export function LibraryMenuIcon(props?: IconProps) {
  return (
    <svg {...baseProps(props)}>
      <path d="M3.5 7.5A2.5 2.5 0 016 5h4l2 2h6A2.5 2.5 0 0120.5 9.5v8A2.5 2.5 0 0118 20H6a2.5 2.5 0 01-2.5-2.5z" />
      <path d="M3.5 9h17" />
    </svg>
  );
}

export function SaveMenuIcon(props?: IconProps) {
  return (
    <svg {...baseProps(props)}>
      <path d="M5 4h11l3 3v13a1 1 0 01-1 1H6a1 1 0 01-1-1V4z" />
      <path d="M8 4v6h8V4" />
      <path d="M9 16h6" />
    </svg>
  );
}

export function ImportDataMenuIcon(props?: IconProps) {
  return (
    <svg {...baseProps(props)}>
      <ellipse cx="12" cy="6" rx="7" ry="3" />
      <path d="M5 6v6c0 1.7 3.1 3 7 3s7-1.3 7-3V6" />
      <path d="M5 12v6c0 1.7 3.1 3 7 3s7-1.3 7-3v-6" />
    </svg>
  );
}

export function ManageDataMenuIcon(props?: IconProps) {
  return (
    <svg {...baseProps(props)}>
      <path d="M4 6h10" />
      <path d="M4 12h16" />
      <path d="M4 18h12" />
      <circle cx="17" cy="6" r="2" />
      <circle cx="8" cy="18" r="2" />
    </svg>
  );
}

export function ShareMenuIcon(props?: IconProps) {
  return (
    <svg {...baseProps(props)}>
      <circle cx="18" cy="5" r="2.5" />
      <circle cx="6" cy="12" r="2.5" />
      <circle cx="18" cy="19" r="2.5" />
      <path d="M8.2 10.8l7.6-4.6" />
      <path d="M8.2 13.2l7.6 4.6" />
    </svg>
  );
}

export function ImportStateMenuIcon(props?: IconProps) {
  return (
    <svg {...baseProps(props)}>
      <path d="M12 21V10" />
      <path d="M8 17l4 4 4-4" />
      <path d="M5 10V6a2 2 0 012-2h10a2 2 0 012 2v4" />
    </svg>
  );
}

export function ExportStateMenuIcon(props?: IconProps) {
  return (
    <svg {...baseProps(props)}>
      <path d="M12 3v11" />
      <path d="M8 7l4-4 4 4" />
      <path d="M5 14v4a2 2 0 002 2h10a2 2 0 002-2v-4" />
    </svg>
  );
}

export function ProfileMenuIcon(props?: IconProps) {
  return (
    <svg {...baseProps(props)}>
      <circle cx="12" cy="8" r="3.5" />
      <path d="M5 20a7 7 0 0114 0" />
    </svg>
  );
}

export function AboutMenuIcon(props?: IconProps) {
  return (
    <svg {...baseProps(props)}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 10v6" />
      <path d="M12 7.5h.01" />
    </svg>
  );
}
