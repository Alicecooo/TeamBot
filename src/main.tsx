import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import { bootstrapBrand } from "./lib/session/brand";
import { applySkin, readSkin } from "./lib/ui/skins";
import { applyChatWidth, readChatWidth } from "./lib/ui/chat-width";
import { applyFont, readFont } from "./lib/ui/fonts";
import { setLocale } from "./lib/ui/i18n";
import { languageChoice } from "./lib/ui/language-preference";
import "./styles.css";

setLocale(languageChoice() || navigator.language);
applySkin(readSkin());
applyFont(readFont());
applyChatWidth(readChatWidth());

void bootstrapBrand().finally(() => {
  createRoot(document.getElementById("root")!).render(<StrictMode><App /></StrictMode>);
});
