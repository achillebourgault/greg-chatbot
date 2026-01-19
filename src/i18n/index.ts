import type { Dict, I18nParams } from "@/i18n/types";
import { enDict } from "@/i18n/locales/en";
import { frDict } from "@/i18n/locales/fr";

export const UI_LANGUAGES = ["en", "fr"] as const;
export type UiLanguage = (typeof UI_LANGUAGES)[number];

export const DEFAULT_UI_LANGUAGE: UiLanguage = "en";

const INTL_LOCALES: Record<UiLanguage, string> = {
	en: "en-US",
	fr: "fr-FR",
};

export function intlLocale(lang: UiLanguage): string {
	return INTL_LOCALES[lang] ?? lang;
}

export type I18nKey = keyof typeof enDict;

const DICTS: Record<UiLanguage, Dict> = {
	en: enDict,
	fr: frDict,
};

export function isUiLanguage(value: unknown): value is UiLanguage {
	return typeof value === "string" && (UI_LANGUAGES as readonly string[]).includes(value);
}

export function normalizeUiLanguage(value: unknown): UiLanguage {
	return isUiLanguage(value) ? value : DEFAULT_UI_LANGUAGE;
}

export function t(lang: UiLanguage, key: I18nKey, params?: I18nParams): string;
export function t(lang: UiLanguage, key: string, params?: I18nParams): string;
export function t(lang: UiLanguage, key: string, params?: I18nParams): string {
	const value = DICTS[lang]?.[key] ?? DICTS[DEFAULT_UI_LANGUAGE][key] ?? key;
	if (typeof value === "function") return value(params ?? {});
	return value;
}
