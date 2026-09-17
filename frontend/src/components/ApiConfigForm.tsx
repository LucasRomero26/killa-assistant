"use client";

import { useState, useEffect } from "react";
import useSWR from "swr";
import { Cpu, Mic, Check, Trash2 } from "lucide-react";
import { apiFetcher } from "@/lib/swr-fetcher";
import { apiFetch } from "@/lib/api";

type Provider = "nvidia_nim" | "groq";

interface ApiConfigFromBackend {
  provider: Provider;
  has_key: boolean;
  model: string | null;
  is_enabled: boolean;
  last_tested_at: string | null;
  last_test_status: string | null;
}

const PROVIDER_INFO: Record<
  Provider,
  { name: string; icon: typeof Cpu; defaultModel: string; placeholder: string }
> = {
  nvidia_nim: {
    name: "NVIDIA NIM",
    icon: Cpu,
    defaultModel: "meta/llama-3.1-70b-instruct",
    placeholder: "nvapi-...",
  },
  groq: {
    name: "Groq",
    icon: Mic,
    defaultModel: "whisper-large-v3",
    placeholder: "gsk_...",
  },
};

export function ApiConfigForm({ userId }: { userId: string }) {
  const { data: apiConfigs, isLoading } = useSWR<ApiConfigFromBackend[]>(
    "/api/api-config/config",
    apiFetcher
  );

  const [configs, setConfigs] = useState<Record<Provider, ApiConfigFromBackend | null>>({
    nvidia_nim: null,
    groq: null,
  });
  const [newKeys, setNewKeys] = useState<Record<Provider, string>>({
    nvidia_nim: "",
    groq: "",
  });
  const [models, setModels] = useState<Record<Provider, string>>({
    nvidia_nim: PROVIDER_INFO.nvidia_nim.defaultModel,
    groq: PROVIDER_INFO.groq.defaultModel,
  });
  const [saving, setSaving] = useState<Provider | null>(null);
  const [deleting, setDeleting] = useState<Provider | null>(null);
  const [savedProvider, setSavedProvider] = useState<Provider | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!apiConfigs) return;
    const next: Record<Provider, ApiConfigFromBackend | null> = {
      nvidia_nim: null,
      groq: null,
    };
    for (const row of apiConfigs) {
      next[row.provider] = row;
      if (row.model) {
        setModels((prev) => ({ ...prev, [row.provider]: row.model! }));
      }
    }
    setConfigs(next);
  }, [apiConfigs]);

  async function saveProvider(provider: Provider) {
    setSaving(provider);
    setError(null);
    setSavedProvider(null);

    try {
      const apiKey = newKeys[provider].trim();
      if (!apiKey) {
        setError("API key cannot be empty");
        return;
      }

      const res = await apiFetch("/api/api-config/config", {
        method: "POST",
        body: {
          provider,
          api_key: apiKey,
          model: models[provider],
          is_enabled: true,
        },
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        setError(errData.error ?? "Failed to save API key");
        return;
      }

      setSavedProvider(provider);
      setNewKeys((prev) => ({ ...prev, [provider]: "" }));
      setConfigs((prev) => ({
        ...prev,
        [provider]: {
          provider,
          has_key: true,
          model: models[provider],
          is_enabled: true,
          last_tested_at: prev[provider]?.last_tested_at ?? null,
          last_test_status: prev[provider]?.last_test_status ?? null,
        },
      }));
      setTimeout(() => setSavedProvider(null), 3000);
    } catch {
      setError("Failed to save API configuration");
    } finally {
      setSaving(null);
    }
  }

  async function deleteProvider(provider: Provider) {
    setDeleting(provider);
    setError(null);

    try {
      const res = await apiFetch("/api/api-config/config", {
        method: "DELETE",
        body: { provider },
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        setError(errData.error ?? "Failed to delete API key");
        return;
      }

      setConfigs((prev) => ({ ...prev, [provider]: null }));
      setNewKeys((prev) => ({ ...prev, [provider]: "" }));
    } catch {
      setError("Failed to delete API key");
    } finally {
      setDeleting(null);
    }
  }

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 gap-gutter">
        {[0, 1].map((i) => (
          <div key={i} className="surface rounded-xl p-6">
            <div className="skeleton h-6 w-32 rounded mb-4"></div>
            <div className="skeleton h-10 w-full rounded mb-3"></div>
            <div className="skeleton h-10 w-full rounded mb-3"></div>
            <div className="skeleton h-10 w-full rounded"></div>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {error && (
        <div className="text-sm text-error bg-error/10 border border-error/20 rounded-lg p-3">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-gutter">
        {(Object.keys(PROVIDER_INFO) as Provider[]).map((provider) => {
          const info = PROVIDER_INFO[provider];
          const Icon = info.icon;
          const cfg = configs[provider];
          const hasKey = Boolean(cfg?.has_key);

          return (
            <div key={provider} className="surface rounded-xl p-6">
              <div className="flex items-center gap-3 mb-6">
                <div className="w-11 h-11 rounded-lg bg-accent/10 border border-accent/20 flex items-center justify-center">
                  <Icon size={20} className="text-accent" />
                </div>
                <div className="flex-1 min-w-0">
                  <h4 className="text-text-primary font-semibold tracking-tight">{info.name}</h4>
                  <p className="text-xs text-text-tertiary font-mono truncate">{info.defaultModel}</p>
                </div>
                <span
                  className={`pill border ${
                    hasKey
                      ? "text-success bg-success/10 border-success/20"
                      : "text-text-tertiary bg-bg-elevated/60 border-border"
                  }`}
                >
                  <span className="pill-dot" />
                  {hasKey ? "Configured" : "Not set"}
                </span>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-medium text-text-secondary mb-2">
                    API Key {hasKey && "(stored, enter new to replace)"}
                  </label>
                  <input
                    type="password"
                    value={newKeys[provider]}
                    onChange={(e) =>
                      setNewKeys((prev) => ({
                        ...prev,
                        [provider]: e.target.value,
                      }))
                    }
                    placeholder={info.placeholder}
                    className="input font-mono"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-text-secondary mb-2">
                    Model
                  </label>
                  <input
                    type="text"
                    value={models[provider]}
                    onChange={(e) =>
                      setModels((prev) => ({
                        ...prev,
                        [provider]: e.target.value,
                      }))
                    }
                    className="input font-mono"
                  />
                </div>

                {savedProvider === provider && (
                  <div className="flex items-center gap-2 text-sm text-success bg-success/10 border border-success/20 rounded-lg p-2">
                    <Check size={14} />
                    Saved successfully.
                  </div>
                )}

                <button
                  onClick={() => saveProvider(provider)}
                  disabled={saving === provider || !newKeys[provider].trim()}
                  className="btn btn-primary w-full"
                >
                  {saving === provider ? "Saving..." : "Save API Key"}
                </button>

                {hasKey && (
                  <button
                    onClick={() => deleteProvider(provider)}
                    disabled={deleting === provider}
                    className="btn btn-danger-ghost w-full"
                  >
                    <Trash2 size={14} />
                    {deleting === provider ? "Deleting..." : "Delete API Key"}
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
