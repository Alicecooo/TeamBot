import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { Check, ChevronDown, Search, X } from "lucide-react";
import { useStore, currentTaskBot, type Bot, type InstanceInfo, type ModelSelection } from "@/state/store";
import type { EffortLevel } from "../../../shared/thread/wire";
import type { ModelVariantOption } from "../../../shared/thread/runtime-events";
import { InstanceProviderMark } from "../chrome/ProviderIcons";
import { needsCli } from "../settings/EngineSetup";
import { ConfirmDialog } from "../chrome/ConfirmDialog";
import { approvalModeFor, modelSwitchNeedsAsk } from "../../../shared/tool/approval-mode";
import { cn } from "@/lib/ui/cn";
import { useMenuMotion } from "../chrome/MenuMotion";

import { t } from "@/lib/ui/i18n";
import { COMPACT_SQUARE } from "@/lib/chat/compact-chip";
import { threadsOnOwnModel } from "../../../shared/thread/thread-model";
import { ThreadModelsLine } from "./ThreadModelsLine";
import { Select } from "../chrome/Select";

function modelLabel(instance: InstanceInfo | undefined, model: string): string {
  return instance?.models.options.find((option) => option.id === model)?.label ?? model;
}

export function engineStatus(instance: InstanceInfo): string {
  if (needsCli(instance)) return t("agentCli.missing");
  return instance.snapshot.version ?? t("model.ready");
}

export function effortLabel(level: EffortLevel): string {
  const key = level === "xhigh" ? "model.effort.xhigh" : `model.effort.${level}`;
  return t(key as Parameters<typeof t>[0]);
}

/**
 * Default (undefined) sends nothing and lets the engine decide; `none` is a level the engine is told to use. Only pi
 * offers both.
 */
export function EffortRow({
  bot,
  threadId,
  updateBotDefault,
  className,
  label,
  compact = false,
}: {
  bot: Bot;
  threadId?: string;
  updateBotDefault?: boolean;
  className?: string;
  label?: ReactNode;
  compact?: boolean;
}) {
  const { state, dispatch } = useStore();
  const selection = bot.modelSelection;
  const instance = state.instances.find((candidate) => candidate.instanceId === selection.instanceId);
  if (instance?.capabilities?.modelVariants) {
    return <ModelVariantRow bot={bot} threadId={threadId} updateBotDefault={updateBotDefault} className={className} label={label} compact={compact} />;
  }
  const levels = instance?.capabilities?.effortLevels;
  if (!levels?.length) return null;

  if (compact) return (
    <label className={cn("flex items-center justify-between gap-3", className)}>
      {label}
      <Select size="sm" className="max-w-[65%]" aria-label={t("model.effort.label")} value={selection.effort ?? ""} disabled={bot.busy}
        onChange={(event) => dispatch({ type: "setModel", botId: bot.id, threadId, ...(updateBotDefault ? { updateBotDefault: true } : {}),
          selection: { ...selection, effort: levels.find((level) => level === event.target.value) } })}>
        <option value="">{t("model.effort.default")}</option>
        {levels.map((level) => <option key={level} value={level}>{effortLabel(level)}</option>)}
      </Select>
    </label>
  );

  return (
    <div className={className}>
      {label}
      <div className="mt-2 flex flex-wrap gap-1" role="group" aria-label={t("model.effort.label")}>
        {[undefined, ...levels].map((level) => (
          <button
            key={level ?? "default"}
            type="button"
            aria-pressed={selection.effort === level}
            title={
              level === undefined
                ? t("model.effort.noLevel")
                : t("model.effort.ask", { level: effortLabel(level) })
            }
            onClick={() => dispatch({ type: "setModel", botId: bot.id, threadId, ...(updateBotDefault ? { updateBotDefault: true } : {}), selection: { ...selection, effort: level } })}
            className={cn(
              "rounded-full border px-2.5 py-1 text-[12px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/70",
              selection.effort === level
                ? "border-accent/60 bg-control text-ink"
                : "border-hairline/40 text-ink-secondary hover:bg-control/60 hover:text-ink",
            )}
          >
            {level === undefined ? t("model.effort.default") : effortLabel(level)}
          </button>
        ))}
      </div>
    </div>
  );
}

function variantLabel(option: ModelVariantOption): string {
  return option.id === "default" ? t("model.variant.openCodeDefault") : option.label;
}

/** ACP variant ids are opaque; their model/session declares the available choices. */
export function ModelVariantRow({ bot, threadId, updateBotDefault, className, label, compact = false, wide = false }: {
  bot: Bot;
  threadId?: string;
  updateBotDefault?: boolean;
  className?: string;
  label?: ReactNode;
  compact?: boolean;
  wide?: boolean;
}) {
  const { state, dispatch } = useStore();
  const selection = bot.modelSelection;
  const instance = state.instances.find((candidate) => candidate.instanceId === selection.instanceId);
  if (!instance?.capabilities?.modelVariants) return null;
  const session = state.modelVariantSessions[threadId ?? bot.threadId];
  const reported = session?.instanceId === selection.instanceId && session.model === selection.model ? session.variants : undefined;
  const options = reported?.options ?? instance.models.options.find((option) => option.id === selection.model)?.variants ?? [];
  if (!options.length && selection.variant === undefined) return null;
  const missing = selection.variant !== undefined && !options.some((option) => option.id === selection.variant);
  const unavailable = missing && reported !== undefined;
  const current = reported?.currentValue;
  const choose = (variant?: string) => {
    const { effort: _effort, variant: _variant, ...model } = selection;
    dispatch({ type: "setModel", botId: bot.id, threadId, ...(updateBotDefault ? { updateBotDefault: true } : {}),
      selection: { ...model, ...(variant !== undefined ? { variant } : {}) } });
  };
  if (compact) return (
    <div className={className}>
      <label className="flex items-center justify-between gap-3">
        {label}
        <Select size="sm" aria-label={t("model.variant.label")} disabled={bot.busy} className={wide ? "flex-1" : "max-w-[65%]"}
          value={selection.variant === undefined ? "unset" : missing ? "missing" : String(options.findIndex((option) => option.id === selection.variant))}
          onChange={(event) => choose(options[Number(event.target.value)]?.id)}>
          <option value="unset">{t("model.variant.session")}</option>
          {missing && <option value="missing" disabled>{selection.variant} ({unavailable ? t("model.variant.unavailable") : t("model.variant.unverified")})</option>}
          {options.map((option, index) => <option key={option.id} value={String(index)}>{variantLabel(option)}</option>)}
        </Select>
      </label>
      {missing && <p className="mt-1 text-[11px] text-ink-secondary">{unavailable ? t("model.variant.unavailableHelp") : t("model.variant.unverifiedHelp")}</p>}
    </div>
  );
  return (
    <div className={className}>
      {label}
      {(selection.variant === undefined || missing) && (
        <p className="mt-2 text-[12px] text-ink-secondary">
          {unavailable ? t("model.variant.unavailableChoice", { variant: selection.variant ?? "" })
            : missing ? t("model.variant.unverifiedChoice", { variant: selection.variant ?? "" }) : t("model.variant.none")}
          {current !== undefined && ` ${t("model.variant.sessionValue", { variant: variantLabel(options.find((option) => option.id === current) ?? { id: current, label: current }) })}`}
        </p>
      )}
      {selection.variant !== undefined && (
        <button type="button" disabled={bot.busy} onClick={() => choose()}
          title={t("model.variant.clearHint")}
          className="mt-2 block text-[12px] text-ink-secondary underline underline-offset-2 hover:text-ink disabled:opacity-50">
          {t("model.variant.clear")}
        </button>
      )}
      {options.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1" role="group" aria-label={t("model.variant.label")}>
          {options.map((option) => (
            <button
              key={option.id}
              type="button"
              disabled={bot.busy}
              aria-pressed={selection.variant === option.id}
              title={t("model.variant.use", { variant: variantLabel(option) })}
              onClick={() => choose(option.id)}
              className={cn(
                "rounded-full border px-2.5 py-1 text-[12px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/70 disabled:opacity-50",
                selection.variant === option.id ? "border-accent/60 bg-control text-ink" : "border-hairline/40 text-ink-secondary hover:bg-control/60 hover:text-ink",
              )}
            >
              {variantLabel(option)}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function modelSelectionForPick(selection: ModelSelection, instance: InstanceInfo, model: string): ModelSelection {
  const next: ModelSelection = { instanceId: instance.instanceId, model };
  if (instance.instanceId === selection.instanceId) {
    if (instance.capabilities?.modelVariants) {
      if (model === selection.model && selection.variant !== undefined) next.variant = selection.variant;
    } else if (selection.effort) next.effort = selection.effort;
  }
  return next;
}

export function FollowBotModelRow({ name, model, follows, onPick }: { name: string; model: string; follows: boolean; onPick: () => void }) {
  return (
    <button
      type="button"
      data-follow-bot-model
      aria-pressed={follows}
      onClick={onPick}
      className={cn(
        "flex w-full shrink-0 items-center justify-between gap-2 border-b border-hairline/40 px-4 py-2.5 text-left text-[13px] text-ink hover:bg-control/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus",
        follows && "bg-control/40",
      )}
    >
      <span className="flex min-w-0 items-baseline gap-2">
        <span className="shrink-0 font-medium">{t("model.useBotModel", { name })}</span>
        <span className="truncate text-[12px] text-ink-secondary">{model}</span>
      </span>
      {follows && <Check size={14} className="shrink-0 text-accent" aria-hidden="true" />}
    </button>
  );
}

function ModelSearch({
  value,
  onChange,
  onEscape,
}: {
  value: string;
  onChange: (value: string) => void;
  onEscape: () => void;
}) {
  return (
    <div className="shrink-0 px-2 pb-2">
      <div className="flex items-center gap-2 rounded-lg border border-hairline/40 bg-inset px-2.5 py-1.5 focus-within:border-focus">
        <Search size={13} className="shrink-0 text-ink-secondary" />
        <input
          value={value}
          onChange={(event) => onChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key !== "Escape") return;
            event.stopPropagation();
            onEscape();
          }}
          placeholder={t("model.search")}
          aria-label={t("model.search")}
          className="w-full bg-transparent text-[12.5px] text-ink placeholder:text-ink-secondary focus:outline-none"
        />
      </div>
    </div>
  );
}

export function ModelEngineRail({ instances, selectedInstance, onSelect }: {
  instances: InstanceInfo[];
  selectedInstance?: InstanceInfo;
  onSelect: (instance: InstanceInfo) => void;
}) {
  return (
    <div className="flex w-14 shrink-0 flex-col gap-1 overflow-y-auto border-r border-hairline/40 bg-panel p-2">
      {instances.map((instance) => {
        const selected = instance.instanceId === selectedInstance?.instanceId;
        const attention = needsCli(instance);
        return (
          <button type="button" key={instance.instanceId} onClick={() => onSelect(instance)}
            aria-label={instance.displayName} aria-pressed={selected}
            title={`${instance.displayName} · ${engineStatus(instance)}`}
            className={cn("relative flex size-9 items-center justify-center rounded-lg", selected ? "bg-control ring-1 ring-hairline/50" : "hover:bg-control/60")}>
            <InstanceProviderMark instance={instance} size={18} />
            {attention && <span className="absolute bottom-0.5 right-0.5 size-1.5 rounded-full bg-warning ring-2 ring-panel" />}
          </button>
        );
      })}
    </div>
  );
}
const POPOVER_WIDTH = 420;

export function ModelPicker({
  bot,
  threadId,
  className,
  contained = false,
  label,
}: {
  bot: Bot;
  threadId?: string;
  className?: string;
  contained?: boolean;
  label?: ReactNode;
}) {
  const { state, dispatch, refreshInstances } = useStore();
  const [open, setOpen] = useState(false);
  const motion = useMenuMotion(open && !bot.busy);
  const [query, setQuery] = useState("");
  const [pendingSwitch, setPendingSwitch] = useState<{ botId: string; threadId: string;
    selection: ModelSelection; updateBotDefault: boolean; name: string } | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const [placement, setPlacement] = useState<{ left: number; maxHeight: number }>();
  const [changedBotModel, setChangedBotModel] = useState(false);
  const refreshingRef = useRef(false);
  const popoverWidth = POPOVER_WIDTH;
  useLayoutEffect(() => {
    if (!open || contained) return;
    const place = () => {
      const rect = rootRef.current?.getBoundingClientRect();
      if (!rect) return;
      const width = Math.min(popoverWidth, window.innerWidth - 32);
      setPlacement({ left: Math.max(16, Math.min(rect.right - width, window.innerWidth - width - 16)) - rect.left,
        maxHeight: Math.max(0, Math.min(600, window.innerHeight - rect.bottom - 24)) });
    };
    place();
    window.addEventListener("resize", place);
    return () => window.removeEventListener("resize", place);
  }, [open, contained, popoverWidth]);

  const selection = bot.modelSelection;
  const active = state.instances.find((instance) => instance.instanceId === selection.instanceId);
  const selectedVariantLabel = selection.variant === undefined ? undefined : variantLabel(
    active?.models.options.find((option) => option.id === selection.model)?.variants?.find((option) => option.id === selection.variant)
      ?? { id: selection.variant, label: selection.variant },
  );
  const catalog = state.instances.flatMap((instance) =>
    instance.policy ? [] : instance.models.options.map((option) => ({ instance, option })),
  );
  const needle = query.trim().toLowerCase();
  const shownModels = needle
    ? catalog.filter((row) => row.option.label.toLowerCase().includes(needle) || row.option.id.toLowerCase().includes(needle))
    : catalog;

  const refreshLocalInstances = useCallback(() => {
    if (refreshingRef.current) return;
    refreshingRef.current = true;
    void refreshInstances()
      .catch(() => {
      })
      .finally(() => {
        refreshingRef.current = false;
      });
  }, [refreshInstances]);

  useEffect(() => {
    if (open) refreshLocalInstances();
  }, [open, refreshLocalInstances]);

  useEffect(() => {
    if (bot.busy) setOpen(false);
  }, [bot.busy]);

  useEffect(() => {
    if (!open) return;
    const closeOnOutsideClick = (event: MouseEvent) => {
      const clickedNode = event.target instanceof Node ? event.target : null;
      if (!rootRef.current?.contains(clickedNode)) setOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      if (query) setQuery("");
      else setOpen(false);
    };
    window.addEventListener("mousedown", closeOnOutsideClick);
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      window.removeEventListener("mousedown", closeOnOutsideClick);
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [open, query]);

  const resetList = () => {
    setQuery("");
  };

  const profile = state.bots.find((candidate) => candidate.id === bot.id) ?? bot;
  const ownModelThreads = threadsOnOwnModel(profile.modelSelection, profile.tasks ?? []).length;

  const pick = (instance: InstanceInfo, model: string) => {
    if (bot.busy || instance.policy) return;
    const nextSelection = modelSelectionForPick(selection, instance, model);
    const thread = threadId ?? bot.threadId;
    const targets = [currentTaskBot(profile, thread), profile];
    if (targets.some((target) => modelSwitchNeedsAsk(approvalModeFor(target),
      state.instances.find((candidate) => candidate.instanceId === target.modelSelection.instanceId)?.driverKind,
      instance.driverKind))) {
      setPendingSwitch({ botId: bot.id, threadId: thread,
        selection: nextSelection, updateBotDefault: true, name: modelLabel(instance, model) });
      setOpen(false);
      return;
    }
    dispatch({
      type: "setModel",
      botId: bot.id,
      threadId: thread,
      updateBotDefault: true,
      selection: nextSelection,
    });
    if (threadId) setChangedBotModel(true);
    setOpen(false);
  };

  const currentListed = catalog.some((row) => row.instance.instanceId === selection.instanceId && row.option.id === selection.model);
  const currentLabel = modelLabel(active, selection.model);
  const showCurrent = !currentListed && (!needle || currentLabel.toLowerCase().includes(needle) || selection.model.toLowerCase().includes(needle));

  const summary = active
    ? `${currentLabel}${selectedVariantLabel ? ` · ${selectedVariantLabel}` : selection.effort ? ` · ${t("model.effort.summary", { level: effortLabel(selection.effort) })}` : ""}`
    : selection.model;

  const trigger = 
    <button data-tour="model"
      type="button"
      disabled={Boolean(bot.busy)}
      onClick={() => {
        if (bot.busy) return;
        setChangedBotModel(false);
        setOpen((wasOpen) => {
          const next = !wasOpen;
          if (next) {
            resetList();
          }
          return next;
        });
      }}
      aria-expanded={open && !bot.busy}
      aria-haspopup="dialog"
      className={cn(
        "flex items-center gap-1.5 rounded-full border border-hairline/40 bg-control/60 py-1 pl-2 pr-2.5 text-[13px] text-ink hover:bg-raised-hover disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-control/60",
        contained && "min-w-0 max-w-[75%]",
        !contained && active && COMPACT_SQUARE,
      )}
      title={bot.busy ? `${summary}\n${t(threadId ? "model.threadBusy" : "model.busy")}` : summary}
    >
      <span className={cn("flex min-w-0 items-center gap-1", !contained && active && "@max-4xl/chathead:hidden")}>
        <span className="max-w-[160px] truncate">{currentLabel}</span>
        {(!contained || threadId) && (selectedVariantLabel !== undefined ? (
          <span data-model-variant className="max-w-[120px] truncate text-ink-secondary">· {selectedVariantLabel}</span>
        ) : selection.effort && (
          <span data-model-effort className="shrink-0 text-ink-secondary">
            · {effortLabel(selection.effort)}
          </span>
        ))}
      </span>
      <ChevronDown
        size={14}
        className={cn(
          "shrink-0 text-ink-secondary transition-transform",
          open && "rotate-180",
          !contained && active && "@max-4xl/chathead:hidden",
        )}
      />
    </button>
  ;

  return (
    <div ref={rootRef} className={cn(contained ? "w-full" : "relative", className)}>
      {contained ? (
        <div className="flex items-center justify-between gap-4">
          {label}
          {trigger}
        </div>
      ) : (
        trigger
      )}

      {motion.shown && (
        <div
          data-model-picker-content
          role="dialog"
          aria-label={t("model.choose")}
          {...motion.exitProps}
          style={contained ? undefined : { ...placement, width: popoverWidth }}
          className={cn(
            "flex flex-col overflow-hidden rounded-2xl border border-hairline/50 bg-card",
            contained
              ? "relative mt-3 w-full max-h-[min(420px,50dvh)]"
              : "absolute right-0 top-full z-30 mt-2 max-w-[calc(100vw-2rem)] max-h-[min(600px,calc(100dvh-7rem))] shadow-2xl shadow-black/50",
            motion.className,
          )}
        >
          {catalog.length > 8 && (
            <div className="shrink-0 px-2 pt-2">
              <ModelSearch value={query} onChange={setQuery} onEscape={() => setQuery("")} />
            </div>
          )}
          <div data-model-list className="min-h-0 flex-1 overflow-y-auto p-1.5">
            {showCurrent && (
              <button type="button" aria-pressed className="flex w-full items-center justify-between gap-3 rounded-lg bg-control px-2.5 py-2 text-left text-[13px] text-ink" onClick={() => setOpen(false)}>
                <span className="min-w-0 truncate">{currentLabel}</span>
                <Check size={14} className="shrink-0" aria-hidden="true" />
              </button>
            )}
            {shownModels.map((row) => {
              const current = row.instance.instanceId === selection.instanceId && row.option.id === selection.model;
              return (
                <button
                  key={`${row.instance.instanceId}:${row.option.id}`}
                  type="button"
                  aria-pressed={current}
                  onClick={() => pick(row.instance, row.option.id)}
                  className={cn(
                    "flex w-full items-center justify-between gap-3 rounded-lg px-2.5 py-2 text-left text-[13px]",
                    current ? "bg-control text-ink" : "text-ink hover:bg-control/60",
                  )}
                >
                  <span className="min-w-0 truncate">{row.option.label}</span>
                  {current && <Check size={14} className="shrink-0" aria-hidden="true" />}
                </button>
              );
            })}
            {shownModels.length === 0 && !showCurrent && (
              <p className="px-3 py-5 text-center text-[13px] text-ink-secondary">
                {needle ? t("model.noMatch", { query: query.trim() }) : t("model.simple.noModels")}
              </p>
            )}
          </div>
        </div>
      )}
      {!contained && changedBotModel && !open && ownModelThreads > 0 && (
        <div data-thread-models-notice role="status"
          className="absolute right-0 top-full z-30 mt-2 flex max-w-[calc(100vw-2rem)] items-center gap-2 rounded-xl border border-hairline/50 bg-card py-2 pl-3 pr-2 shadow-xl shadow-black/30">
          <ThreadModelsLine bot={profile} />
          <button type="button" aria-label={t("common.close")} onClick={() => setChangedBotModel(false)}
            className="shrink-0 rounded-md p-1 text-ink-secondary hover:bg-control/60 hover:text-ink">
            <X size={13} aria-hidden="true" />
          </button>
        </div>
      )}
      <ConfirmDialog
        open={pendingSwitch !== null}
        title={t("model.providerSwitch.title")}
        body={t(pendingSwitch?.updateBotDefault ? "model.providerSwitch.botBody" : "model.providerSwitch.threadBody", {
          model: pendingSwitch?.name ?? "",
        })}
        tone="neutral"
        confirmLabel={t("model.providerSwitch.confirm")}
        onCancel={() => setPendingSwitch(null)}
        onConfirm={() => {
          if (!pendingSwitch || bot.busy || pendingSwitch.botId !== bot.id || pendingSwitch.threadId !== (threadId ?? bot.threadId)) {
            setPendingSwitch(null); return;
          }
          dispatch({ type: "setModel", botId: pendingSwitch.botId, threadId: pendingSwitch.threadId,
            selection: pendingSwitch.selection, updateBotDefault: pendingSwitch.updateBotDefault,
            resetApprovalToAsk: true });
          if (pendingSwitch.updateBotDefault && threadId) setChangedBotModel(true);
          setPendingSwitch(null);
        }}
      />
    </div>
  );
}
