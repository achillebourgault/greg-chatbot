"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Icons, Spinner, TextArea } from "@/components/ui";
import { t, UI_LANGUAGES } from "@/i18n";
import {
	useChatStore,
	type GregGuidance,
	type GregPersonality,
	type GregPlayfulness,
	type GregTone,
	type GregVerbosity,
} from "@/stores/chat-store";

type Option<T extends string> = { id: T; title: string; description: string };

function OptionCard({
	title,
	description,
	selected,
	onClick,
}: {
	title: string;
	description: string;
	selected: boolean;
	onClick: () => void;
}) {
	return (
		<button
			type="button"
			onClick={onClick}
			className={[
				"text-left w-full rounded-xl border p-4 transition-all duration-150",
				selected
					? "bg-white/[0.06] border-white/[0.18]"
					: "bg-white/[0.03] border-white/[0.08] hover:bg-white/[0.05] hover:border-white/[0.12]",
			].join(" ")}
		>
			<div className="flex items-start justify-between gap-3">
				<div>
					<div className="text-sm font-medium text-zinc-100">{title}</div>
					<div className="text-xs text-zinc-500 mt-1 leading-relaxed">{description}</div>
				</div>
				{selected ? (
					<div className="mt-0.5 w-5 h-5 flex-shrink-0 rounded-full bg-zinc-100 grid place-items-center">
						<Icons.check className="w-3 h-3 text-zinc-900" />
					</div>
				) : (
					<div className="mt-0.5 w-5 h-5 flex-shrink-0 rounded-full border border-white/[0.12]" />
				)}
			</div>
		</button>
	);
}

const DEFAULT_PERSONALITY: GregPersonality = {
	tone: "professional",
	verbosity: "balanced",
	guidance: "neutral",
	playfulness: "none",
};

export default function SettingsRoute() {
	const router = useRouter();
	const { state, updateSettings, archiveAllConversations } = useChatStore();
	const lang = state.settings.uiLanguage;

	const [customInstructions, setCustomInstructions] = useState<string>(state.settings.customInstructions ?? "");
	const [personality, setPersonality] = useState<GregPersonality>(state.settings.personality);
	const [loading, setLoading] = useState(false);
	const [saved, setSaved] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [confirmArchiveAllOpen, setConfirmArchiveAllOpen] = useState(false);

	const setPersonalityAndStore = (next: GregPersonality) => {
		setPersonality(next);
		updateSettings({ personality: next });
	};

	useEffect(() => {
		setError(null);
		setCustomInstructions(state.settings.customInstructions ?? "");
		setPersonality(state.settings.personality);
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, []);

	const toneOptions: Option<GregTone>[] = [
		{
			id: "professional",
			title: t(lang, "settings.tone.professional.title"),
			description: t(lang, "settings.tone.professional.desc"),
		},
		{ id: "friendly", title: t(lang, "settings.tone.friendly.title"), description: t(lang, "settings.tone.friendly.desc") },
		{ id: "direct", title: t(lang, "settings.tone.direct.title"), description: t(lang, "settings.tone.direct.desc") },
	];

	const verbosityOptions: Option<GregVerbosity>[] = [
		{ id: "minimal", title: t(lang, "settings.verbosity.minimal.title"), description: t(lang, "settings.verbosity.minimal.desc") },
		{ id: "balanced", title: t(lang, "settings.verbosity.balanced.title"), description: t(lang, "settings.verbosity.balanced.desc") },
		{ id: "detailed", title: t(lang, "settings.verbosity.detailed.title"), description: t(lang, "settings.verbosity.detailed.desc") },
	];

	const guidanceOptions: Option<GregGuidance>[] = useMemo(
		() => [
			{ id: "neutral", title: t(lang, "settings.guidance.neutral.title"), description: t(lang, "settings.guidance.neutral.desc") },
			{ id: "coach", title: t(lang, "settings.guidance.coach.title"), description: t(lang, "settings.guidance.coach.desc") },
		],
		[lang],
	);

	const playfulnessOptions: Option<GregPlayfulness>[] = [
		{ id: "none", title: t(lang, "settings.playfulness.none.title"), description: t(lang, "settings.playfulness.none.desc") },
		{ id: "light", title: t(lang, "settings.playfulness.light.title"), description: t(lang, "settings.playfulness.light.desc") },
	];

	const handleSave = async () => {
		setError(null);
		setLoading(true);
		try {
			updateSettings({ personality, customInstructions });
			setSaved(true);
			setTimeout(() => setSaved(false), 2000);
		} catch (e) {
			setError(e instanceof Error ? e.message : t(lang, "errors.saveFailed"));
		} finally {
			setLoading(false);
		}
	};

	const handleClearInstructions = async () => {
		setError(null);
		setLoading(true);
		try {
			setCustomInstructions("");
			updateSettings({ customInstructions: "" });
		} catch (e) {
			setError(e instanceof Error ? e.message : t(lang, "errors.resetFailed"));
		} finally {
			setLoading(false);
		}
	};

	return (
		<div className="h-full w-full overflow-auto">
			<header className="sticky top-0 z-10 flex items-center justify-between gap-3 px-5 py-3 border-b border-white/[0.06] bg-zinc-950/80 backdrop-blur">
				<div className="flex items-center gap-3">
					<Button
						variant="ghost"
						size="icon"
						onClick={() => router.push("/")}
						className="text-zinc-400 hover:text-zinc-100"
						title={t(lang, "actions.back")}
					>
						<Icons.arrowLeft className="w-4 h-4" />
					</Button>
					<div>
						<div className="text-sm font-semibold text-zinc-100">{t(lang, "settings.title")}</div>
						<div className="text-[11px] text-zinc-500">{t(lang, "settings.subtitle")}</div>
					</div>
				</div>

				<div className="flex items-center gap-2">
					{loading ? (
						<div className="flex items-center gap-2 text-[11px] text-zinc-500">
							<Spinner size="sm" />
							<span>{t(lang, "status.loading")}</span>
						</div>
					) : saved ? (
						<div className="text-[11px] text-emerald-300">{t(lang, "status.saved.short")}</div>
					) : null}
					<Button variant="secondary" onClick={handleSave} disabled={loading}>
						{t(lang, "settings.save")}
					</Button>
				</div>
			</header>

			<div className="px-5 py-5">
				<div className="w-full space-y-4">
					{error ? (
						<div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
							{error}
						</div>
					) : null}

					<div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
						<section className="rounded-2xl bg-white/[0.02] border border-white/[0.08] overflow-hidden">
							<div className="px-5 py-4 border-b border-white/[0.06]">
								<div className="text-sm font-semibold text-zinc-100">
									{t(lang, "settings.profile.title")}
								</div>
								<div className="text-xs text-zinc-500 mt-1">
									{t(lang, "settings.profile.subtitle")}
								</div>
							</div>
							<div className="p-5 space-y-5">
								<div className="rounded-xl bg-white/[0.02] border border-white/[0.06] p-4">
									<div className="flex items-start justify-between gap-4">
										<div>
											<div className="text-sm font-semibold text-zinc-100">{t(lang, "settings.language")}</div>
											<div className="text-xs text-zinc-500 mt-1">
												{t(lang, "settings.language.help")}
											</div>
										</div>
										<div className="flex items-center gap-1">
											{UI_LANGUAGES.map((l) => (
												<button
													key={l}
													type="button"
													onClick={() => updateSettings({ uiLanguage: l })}
													className={[
														"h-8 px-3 rounded-lg text-[11px] border transition-colors",
														lang === l
															? "bg-white/[0.12] border-white/[0.20] text-zinc-100"
															: "bg-transparent border-white/[0.08] text-zinc-400 hover:bg-white/[0.06] hover:text-zinc-200",
													].join(" ")}
												>
													{l.toUpperCase()}
												</button>
											))}
										</div>
									</div>
								</div>

								<div className="flex items-center justify-between gap-3">
									<div>
										<div className="text-sm font-semibold text-zinc-100">{t(lang, "settings.personality")}</div>
										<div className="text-xs text-zinc-500 mt-1">{t(lang, "settings.personality.help")}</div>
									</div>
									<Button
										variant="ghost"
										onClick={() => setPersonalityAndStore(DEFAULT_PERSONALITY)}
										disabled={loading}
										className="text-zinc-300 hover:text-zinc-100"
									>
										{t(lang, "actions.restore")}
									</Button>
								</div>

								<div className="space-y-2">
									<div className="text-xs font-medium text-zinc-300">{t(lang, "settings.tone")}</div>
									<div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
										{toneOptions.map((opt) => (
											<OptionCard
												key={opt.id}
												title={opt.title}
												description={opt.description}
												selected={personality.tone === opt.id}
												onClick={() => setPersonalityAndStore({ ...personality, tone: opt.id })}
											/>
										))}
									</div>
								</div>

								<div className="space-y-2">
									<div className="text-xs font-medium text-zinc-300">{t(lang, "settings.verbosity")}</div>
									<div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
										{verbosityOptions.map((opt) => (
											<OptionCard
												key={opt.id}
												title={opt.title}
												description={opt.description}
												selected={personality.verbosity === opt.id}
												onClick={() => setPersonalityAndStore({ ...personality, verbosity: opt.id })}
											/>
										))}
									</div>
								</div>

								<div className="space-y-2">
									<div className="text-xs font-medium text-zinc-300">{t(lang, "settings.guidance")}</div>
									<div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
										{guidanceOptions.map((opt) => (
											<OptionCard
												key={opt.id}
												title={opt.title}
												description={opt.description}
												selected={personality.guidance === opt.id}
												onClick={() => setPersonalityAndStore({ ...personality, guidance: opt.id })}
											/>
										))}
									</div>
								</div>

								<div className="space-y-2">
									<div className="text-xs font-medium text-zinc-300">{t(lang, "settings.playfulness")}</div>
									<div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
										{playfulnessOptions.map((opt) => (
											<OptionCard
												key={opt.id}
												title={opt.title}
												description={opt.description}
												selected={personality.playfulness === opt.id}
												onClick={() => setPersonalityAndStore({ ...personality, playfulness: opt.id })}
											/>
										))}
									</div>
								</div>
							</div>
						</section>

						<section className="rounded-2xl bg-white/[0.02] border border-white/[0.08] overflow-hidden">
							<div className="px-5 py-4 border-b border-white/[0.06]">
								<div className="text-sm font-semibold text-zinc-100">{t(lang, "settings.instructions")}</div>
								<div className="text-xs text-zinc-500 mt-1">{t(lang, "settings.instructions.help")}</div>
							</div>

							<div className="p-5 space-y-4">
								<div className="rounded-xl bg-white/[0.02] border border-white/[0.06] p-4">
									<div className="flex items-start justify-between gap-4">
										<div className="text-sm font-semibold text-zinc-100">{t(lang, "settings.instructions.editorTitle")}</div>
										<div className="text-[10px] text-zinc-500">{customInstructions.length}/5000</div>
									</div>
									<div className="mt-3">
										<TextArea
											value={customInstructions}
											onChange={(e) => setCustomInstructions(e.target.value.slice(0, 5000))}
											rows={12}
											placeholder={t(lang, "settings.instructions.placeholder.page")}
										/>
									</div>

									<div className="mt-3 flex items-center justify-between gap-2">
										<Button
											variant="ghost"
											onClick={handleClearInstructions}
											disabled={loading}
											className="text-zinc-300 hover:text-zinc-100"
										>
											{t(lang, "settings.reset")}
										</Button>
										<div className="text-[11px] text-zinc-500">
											{t(lang, "settings.instructions.reminderSave")}
										</div>
									</div>
								</div>

								<div className="rounded-xl bg-white/[0.02] border border-white/[0.06] p-4">
									<div>
										<div className="text-sm font-semibold text-zinc-100">{t(lang, "settings.data.title")}</div>
										<div className="text-xs text-zinc-500 mt-1">{t(lang, "settings.data.subtitle")}</div>
									</div>
									<div className="mt-3 text-xs text-zinc-500">{t(lang, "settings.archiveAll.help")}</div>
									<div className="mt-3 flex items-center justify-between gap-3">
										<Button variant="danger" onClick={() => setConfirmArchiveAllOpen(true)} disabled={loading}>
											{t(lang, "actions.deleteAll")}
										</Button>
										<div className="text-[11px] text-zinc-500">{t(lang, "settings.data.archiveHint")}</div>
									</div>

									{confirmArchiveAllOpen ? (
										<div className="mt-3 rounded-xl border border-red-500/30 bg-red-500/10 p-3">
											<div className="text-sm text-red-100 font-medium">{t(lang, "settings.archiveAll.confirmTitle")}</div>
											<div className="text-xs text-red-200/80 mt-1">{t(lang, "settings.archiveAll.confirmBody")}</div>
											<div className="mt-3 flex items-center gap-2">
												<Button variant="secondary" onClick={() => setConfirmArchiveAllOpen(false)}>
													{t(lang, "actions.cancel")}
												</Button>
												<Button
													variant="danger"
													onClick={() => {
														archiveAllConversations();
														setConfirmArchiveAllOpen(false);
													}}
												>
													{t(lang, "actions.confirm")}
												</Button>
											</div>
										</div>
									) : null}
								</div>
							</div>
						</section>
					</div>
				</div>
			</div>
		</div>
	);
}
