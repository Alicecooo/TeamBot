import { t } from "../ui/i18n";

/** Localize the factory title while preserving titles chosen by the user. */
export function localizedTaskTitle(title: string): string {
  return title === "New thread" ? t("task.newShort") : title;
}
