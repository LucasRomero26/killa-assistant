"use client";

import { useState, useEffect } from "react";
import useSWR from "swr";
import { createSupabaseBrowserClient } from "@/lib/supabase-browser";
import { Sparkles, Zap, FileText } from "lucide-react";

type ResponseMode = "always" | "mentions_only" | "never";

interface BotConfig {
  system_prompt: string;
  response_mode: ResponseMode;
  note_include_date: boolean;
  note_tag_source: boolean;
  note_auto_summary: boolean;
  max_tokens: number;
}

const DEFAULT_CONFIG: BotConfig = {
  system_prompt:
    "You are KillaAssistant, an elite administrative assistant focused on technical precision and executive brevity.",
  response_mode: "always",
  note_include_date: true,
  note_tag_source: false,
  note_auto_summary: true,
  max_tokens: 4096,
};

async function fetchBotConfig(key: string): Promise<BotConfig> {
  const userId = key.replace("bot-config:", "");
  const supabase = createSupabaseBrowserClient();
  const { data, error } = await supabase
    .from("configuraciones_bot")
    .select(
      "system_prompt, response_mode, note_include_date, note_tag_source, note_auto_summary, max_tokens"
    )
    .eq("user_id", userId)
    .single();

  if (error && error.code !== "PGRST116") throw error;
  return (data as BotConfig) ?? DEFAULT_CONFIG;
}

export function BehaviorForm({ userId }: { userId: string }) {
  const { data: config, isLoading } = useSWR<BotConfig>(
    `bot-config:${userId}`,
    fetchBotConfig
  );

  const [localConfig, setLocalConfig] = useState<BotConfig>(DEFAULT_CONFIG);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (config) setLocalConfig(config);
  }, [config]);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setSaved(false);

    try {
      const supabase = createSupabaseBrowserClient();
      const { error: upsertError } = await supabase
        .from("configuraciones_bot")
        .upsert({
          user_id: userId,
          ...localConfig,
        });

      if (upsertError) {
        setError(upsertError.message);
      } else {
        setSaved(true);
        setTimeout(() => setSaved(false), 3000);
      }
    } catch {
      setError("Failed to save configuration");
    } finally {
      setSaving(false);
    }
  }

  if (isLoading) {
    return (
      <div className="rounded-xl p-6 border border-border">
        <div className="skeleton h-6 w-48 rounded mb-4"></div>
        <div className="skeleton h-80 w-full rounded"></div>
      </div>
    );
  }

  return (
    <form onSubmit={handleSave} className="space-y-6">
      <div className="surface rounded-xl p-6">
        <div className="flex items-center gap-2 mb-4">
          <Sparkles size={18} className="text-accent" />
          <h3 className="font-medium text-text-primary">System Prompt</h3>
        </div>
        <p className="text-sm text-text-secondary mb-4">
          Define the personality and instructions for the model.
        </p>
        <div className="relative">
          <textarea
            value={localConfig.system_prompt}
            onChange={(e) =>
              setLocalConfig({ ...localConfig, system_prompt: e.target.value })
            }
            className="w-full h-64 bg-bg-input border border-border rounded-lg p-4 text-sm text-text-primary font-mono focus:border-accent focus:ring-0 transition-colors resize-none placeholder:text-text-tertiary"
            placeholder="You are an administrative assistant..."
          />
          <div className="absolute bottom-3 right-4 text-xs text-text-tertiary font-mono tabular-nums">
            {Math.ceil(localConfig.system_prompt.length / 4)}/{localConfig.max_tokens}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-gutter">
        <div className="surface rounded-xl p-5">
          <div className="flex items-center gap-2 mb-4">
            <Zap size={18} className="text-accent" />
            <h4 className="text-sm font-medium text-text-primary">Responses</h4>
          </div>
          <div className="space-y-2">
            {(
              [
                ["always", "Always respond"],
                ["mentions_only", "Mentions only"],
                ["never", "Never respond"],
              ] as const
            ).map(([value, label]) => (
              <label
                key={value}
                className="flex items-center justify-between px-3 py-2.5 rounded-lg border border-border hover:border-border-hover cursor-pointer transition-colors"
              >
                <span className="text-sm text-text-secondary">{label}</span>
                <input
                  type="radio"
                  name="response_mode"
                  value={value}
                  checked={localConfig.response_mode === value}
                  onChange={() =>
                    setLocalConfig({ ...localConfig, response_mode: value })
                  }
                  className="w-4 h-4 accent-accent"
                />
              </label>
            ))}
          </div>
        </div>

        <div className="surface rounded-xl p-5">
          <div className="flex items-center gap-2 mb-4">
            <FileText size={18} className="text-accent" />
            <h4 className="text-sm font-medium text-text-primary">Notes</h4>
          </div>
          <div className="space-y-3">
            {(
              [
                ["note_include_date", "Include date"],
                ["note_tag_source", "Tag source"],
                ["note_auto_summary", "Auto summary"],
              ] as const
            ).map(([key, label]) => (
              <label
                key={key}
                className="flex items-center gap-3 cursor-pointer"
              >
                <input
                  type="checkbox"
                  checked={localConfig[key]}
                  onChange={(e) =>
                    setLocalConfig({ ...localConfig, [key]: e.target.checked })
                  }
                  className="w-4 h-4 rounded border-border bg-bg-input accent-accent"
                />
                <span className="text-sm text-text-secondary">{label}</span>
              </label>
            ))}
          </div>
        </div>
      </div>

      {error && (
        <div className="text-sm text-error bg-error/10 border border-error/20 rounded-lg p-3">
          {error}
        </div>
      )}
      {saved && (
        <div className="text-sm text-success bg-success/10 border border-success/20 rounded-lg p-3">
          Configuration saved.
        </div>
      )}

      <button
        type="submit"
        disabled={saving}
        className="bg-accent text-accent-foreground px-6 py-2.5 rounded-lg text-sm font-medium hover:bg-accent-hover transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {saving ? "Saving..." : "Save configuration"}
      </button>
    </form>
  );
}
