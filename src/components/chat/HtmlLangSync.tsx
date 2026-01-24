"use client";

import { useEffect } from "react";
import type { UiLanguage } from "@/i18n";

export function HtmlLangSync({ lang }: { lang: UiLanguage }) {
	useEffect(() => {
		// Keep <html lang="..."> aligned with the UI language for accessibility/SEO.
		document.documentElement.lang = lang;
	}, [lang]);

	return null;
}
