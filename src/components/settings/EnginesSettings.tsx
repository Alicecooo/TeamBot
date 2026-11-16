import { useState } from "react";
import { t } from "@/lib/ui/i18n";

type MockProvider = "openai" | "anthropic";

const DEFAULTS: Record<MockProvider, { baseUrl: string; model: string }> = {
  openai: { baseUrl: "https://api.openai.com/v1", model: "gpt-4.1" },
  anthropic: { baseUrl: "https://api.anthropic.com", model: "claude-sonnet-4-5" },
};

export function EnginesSettings() {
  const [provider, setProvider] = useState<MockProvider>("openai");
  const [baseUrl, setBaseUrl] = useState(DEFAULTS.openai.baseUrl);
  const [apiKey, setApiKey] = useState("");
  const [model, setModel] = useState(DEFAULTS.openai.model);
  const [saved, setSaved] = useState(false);

  const choose = (next: MockProvider) => {
    setProvider(next);
    setBaseUrl(DEFAULTS[next].baseUrl);
    setModel(DEFAULTS[next].model);
    setSaved(false);
  };

  const field = "w-full rounded-lg border border-hairline/40 bg-inset px-3 py-2 text-[14px] text-ink placeholder:text-ink-secondary focus:outline-none";

  return (
    <div className="flex min-w-0 flex-col gap-4 pb-2">
      <h1 className="text-[22px] font-semibold tracking-tight text-ink">{t("agentCli.title")}</h1>
      <p className="text-[13px] leading-relaxed text-ink-secondary">{t("engines.mock.note")}</p>
      <div className="flex gap-2">
        {(["openai", "anthropic"] as const).map((id) => (
          <button
            key={id}
            type="button"
            aria-pressed={provider === id}
            onClick={() => choose(id)}
            className={provider === id ? "ui-button" : "rounded-lg border border-hairline/40 px-3 py-1.5 text-[13px] text-ink-secondary hover:bg-control hover:text-ink"}
          >
            {id === "openai" ? "OpenAI" : "Anthropic"}
          </button>
        ))}
      </div>
      <label className="flex flex-col gap-1.5 text-[13px] text-ink">
        {t("engines.mock.baseUrl")}
        <input className={field} value={baseUrl} onChange={(event) => { setBaseUrl(event.target.value); setSaved(false); }} />
      </label>
      <label className="flex flex-col gap-1.5 text-[13px] text-ink">
        {t("engines.mock.apiKey")}
        <input className={field} type="password" value={apiKey} onChange={(event) => { setApiKey(event.target.value); setSaved(false); }} autoComplete="off" />
      </label>
      <label className="flex flex-col gap-1.5 text-[13px] text-ink">
        {t("engines.mock.model")}
        <input className={field} value={model} onChange={(event) => { setModel(event.target.value); setSaved(false); }} />
      </label>
      <div className="flex items-center gap-3">
        <button type="button" className="ui-button" onClick={() => setSaved(true)}>{t("engines.mock.save")}</button>
        {saved && <span role="status" className="text-[12px] text-ink-secondary">{t("engines.mock.saved")}</span>}
      </div>
    </div>
  );
}
