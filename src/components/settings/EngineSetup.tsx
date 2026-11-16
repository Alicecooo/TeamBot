import { RotateCw } from "lucide-react";
import { type InstanceInfo, useStore } from "@/state/store";
import { cn } from "@/lib/ui/cn";
import { t } from "@/lib/ui/i18n";

export function needsSignIn(instance: InstanceInfo | undefined): boolean {
  return instance?.snapshot.state === "available" && instance.snapshot.authenticated === false;
}

export function offersSignIn(instance: InstanceInfo | undefined): boolean {
  if (!instance || !needsSignIn(instance) || !instance.install || instance.snapshot.authenticationUnavailableReason) return false;
  return true;
}

export function needsCli(instance: InstanceInfo | undefined): boolean {
  return instance?.snapshot.state !== "available";
}

export function EngineSetup({ className, unframed = false }: {
  instance: InstanceInfo;
  className?: string;
  unframed?: boolean;
}) {
  const { dispatch } = useStore();
  return (
    <div className={cn("flex items-center justify-between gap-3", !unframed && "rounded-xl border border-hairline/40 bg-control/30 p-3", className)}>
      <button type="button" className="ui-button shrink-0" onClick={() => dispatch({ type: "toggleAppSettings", open: true, section: "engines" })}>
        <RotateCw size={13} aria-hidden="true" />{t("model.detectSwitch")}
      </button>
    </div>
  );
}
