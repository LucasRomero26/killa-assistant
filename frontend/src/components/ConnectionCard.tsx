import Link from "next/link";
import { Check, AlertCircle, Clock, Unlink } from "lucide-react";
import { ServiceLogo } from "./ServiceLogo";

interface ConnectionCardProps {
  title: string;
  subtitle: string;
  logo: "whatsapp" | "telegram" | "calendar" | "drive";
  status: "on" | "off" | "pending";
  action: { label: string; href?: string };
  onActionClick?: () => void;
  onDisconnect?: () => void;
}

const STATUS_CONFIG = {
  on: {
    badgeBg: "bg-success/10",
    badgeText: "text-success",
    label: "Connected",
    Indicator: Check,
  },
  off: {
    badgeBg: "bg-error/10",
    badgeText: "text-error",
    label: "Disconnected",
    Indicator: AlertCircle,
  },
  pending: {
    badgeBg: "bg-warning/10",
    badgeText: "text-warning",
    label: "Pending",
    Indicator: Clock,
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
}: ConnectionCardProps) {
  const cfg = STATUS_CONFIG[status];
  const Indicator = cfg.Indicator;
  const isConnected = status === "on";

  const primaryButtonClass = "w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-lg bg-accent text-accent-foreground text-sm font-medium hover:bg-accent-hover transition-all duration-200 shadow-sm";

  const secondaryButtonClass = "w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-lg bg-transparent border border-border text-text-secondary text-sm font-medium hover:bg-bg-elevated hover:text-text-primary hover:border-error/30 transition-all duration-200";

  const primaryButton = action.href ? (
    <Link href={action.href} className={primaryButtonClass}>
      {action.label}
    </Link>
  ) : (
    <button className={primaryButtonClass} onClick={onActionClick} disabled={!onActionClick}>
      {action.label}
    </button>
  );

  return (
    <div className="surface rounded-xl p-5 flex flex-col gap-4 group transition-all duration-200 hover:border-border-hover">
      <div className="flex items-start justify-between">
        <div className="w-11 h-11 rounded-lg flex items-center justify-center bg-bg-elevated">
          <ServiceLogo name={logo} size={24} />
        </div>
        <span className={`flex items-center gap-1.5 text-xs font-medium px-2 py-1 rounded ${cfg.badgeBg} ${cfg.badgeText}`}>
          <Indicator size={12} />
          {cfg.label}
        </span>
      </div>

      <div>
        <h4 className="text-text-primary font-medium">{title}</h4>
        <p className="text-sm text-text-secondary mt-0.5">{subtitle}</p>
      </div>

      <div className="border-t border-border pt-4 mt-auto space-y-2">
        {isConnected && onDisconnect ? (
          <button
            className={secondaryButtonClass}
            onClick={onDisconnect}
          >
            <Unlink size={14} />
            Disconnect
          </button>
        ) : (
          primaryButton
        )}
      </div>
    </div>
  );
}
