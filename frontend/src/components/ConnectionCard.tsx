import Link from "next/link";
import { Unlink } from "lucide-react";
import { ServiceLogo, SERVICE_COLOR } from "./ServiceLogo";

interface ConnectionCardProps {
  title: string;
  subtitle: string;
  logo: "telegram" | "calendar" | "drive";
  status: "on" | "off" | "pending";
  action: { label: string; href?: string };
  onActionClick?: () => void;
  onDisconnect?: () => void;
  disconnecting?: boolean;
}

const STATUS_CONFIG = {
  on: {
    className: "text-success bg-success/10 border-success/20",
    label: "Connected",
    pulse: false,
  },
  off: {
    className: "text-text-tertiary bg-bg-elevated/60 border-border",
    label: "Disconnected",
    pulse: false,
  },
  pending: {
    className: "text-warning bg-warning/10 border-warning/20",
    label: "Pending",
    pulse: true,
  },
} as const;

export function ConnectionCard({
  title,
  subtitle,
  logo,
  status,
  action,
  onActionClick,
  onDisconnect,
  disconnecting = false,
}: ConnectionCardProps) {
  const cfg = STATUS_CONFIG[status];
  const isConnected = status === "on";
  const brand = SERVICE_COLOR[logo];

  const primaryButton = action.href ? (
    <Link href={action.href} className="btn btn-primary w-full">
      {action.label}
    </Link>
  ) : (
    <button className="btn btn-primary w-full" onClick={onActionClick} disabled={!onActionClick}>
      {action.label}
    </button>
  );

  return (
    <div
      className="surface relative rounded-xl p-5 flex flex-col gap-5 overflow-hidden"
      data-status={status}
    >
      {/* Brand tint in the top-left corner */}
      <div
        className="pointer-events-none absolute -top-16 -left-16 h-40 w-40 rounded-full opacity-[0.14] blur-3xl"
        style={{ backgroundColor: brand }}
        aria-hidden="true"
      />

      <div className="relative flex items-start justify-between">
        <div
          className="w-11 h-11 rounded-lg flex items-center justify-center border"
          style={{
            backgroundColor: `color-mix(in oklab, ${brand} 55%, var(--bg-elevated))`,
            borderColor: `color-mix(in oklab, ${brand} 40%, transparent)`,
          }}
        >
          <ServiceLogo name={logo} size={22} />
        </div>
        <span className={`pill border ${cfg.className}`}>
          <span className={`pill-dot ${cfg.pulse ? "animate-pulse" : ""}`} />
          {cfg.label}
        </span>
      </div>

      <div className="relative">
        <h4 className="text-text-primary font-semibold tracking-tight">{title}</h4>
        <p className="text-sm text-text-secondary mt-0.5">{subtitle}</p>
      </div>

      <div className="relative mt-auto">
        {isConnected && onDisconnect ? (
          <button
            className="btn btn-danger-ghost w-full"
            onClick={onDisconnect}
            disabled={disconnecting}
          >
            <Unlink size={14} />
            {disconnecting ? "Disconnecting..." : "Disconnect"}
          </button>
        ) : (
          primaryButton
        )}
      </div>
    </div>
  );
}
