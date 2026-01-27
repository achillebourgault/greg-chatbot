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
				"group text-left w-full rounded-[var(--radius-lg)] border p-4 transition-all duration-200",
				selected
					? "bg-[var(--glass-bg)] border-[var(--glass-border-hover)]"
					: "bg-[var(--glass-bg-subtle)] border-[var(--glass-border)] hover:bg-[var(--glass-bg)] hover:border-[var(--glass-border-hover)]",
			].join(" ")}
		>
			<div className="flex items-start justify-between gap-3">
				<div>
					<div
						className={`text-sm font-medium transition-colors ${
							selected ? "text-[var(--text-primary)]" : "text-[var(--text-secondary)] group-hover:text-[var(--text-primary)]"
						}`}
					>
						{title}
					</div>
					<div className="text-xs text-[var(--text-muted)] mt-1 leading-relaxed">{description}</div>
				</div>
				{selected ? (
					<div className="mt-0.5 w-5 h-5 flex-shrink-0 rounded-full bg-[var(--glass-bg)] border border-[var(--glass-border-hover)] grid place-items-center">
						<Icons.check className="w-3 h-3 text-[var(--accent-cyan)]" />
					</div>
				) : (
					<div className="mt-0.5 w-5 h-5 flex-shrink-0 rounded-full border border-[var(--glass-border)] group-hover:border-[var(--glass-border-hover)] transition-colors" />
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
		<div className="h-full w-full overflow-auto scrollbar-premium">
			
			<header className="sticky top-0 z-10 flex items-center justify-between gap-3 px-6 py-4 border-b border-[var(--glass-border)] bg-[var(--glass-bg-strong)] backdrop-blur-xl">
				<div className="flex items-center gap-4">
					<button
						onClick={() => router.push("/")}
						className="w-10 h-10 rounded-[var(--radius-lg)] flex items-center justify-center text-[var(--text-tertiary)] hover:text-[var(--text-primary)] hover:bg-[var(--glass-bg)] transition-all duration-200"
						title={t(lang, "actions.back")}
					>
						<Icons.arrowLeft className="w-5 h-5" />
					</button>
					<div className="flex items-center gap-3">
						<div className="w-10 h-10 rounded-[var(--radius-lg)] bg-[var(--glass-bg-subtle)] border border-[var(--glass-border)] flex items-center justify-center">
							<Icons.settings className="w-5 h-5 text-[var(--text-primary)]" />
						</div>
						<div>
							<div className="text-base font-bold text-[var(--text-primary)]">{t(lang, "settings.title")}</div>
							<div className="text-xs text-[var(--text-muted)]">{t(lang, "settings.subtitle")}</div>
						</div>
					</div>
				</div>

				<div className="flex items-center gap-3">
					{loading ? (
						<div className="flex items-center gap-2 px-3 py-1.5 rounded-[var(--radius-md)] bg-[var(--glass-bg)] text-xs text-[var(--text-tertiary)]">
							<Spinner size="sm" />
							<span>{t(lang, "status.loading")}</span>
						</div>
					) : saved ? (
						<div className="flex items-center gap-2 px-3 py-1.5 rounded-[var(--radius-md)] bg-[var(--glass-bg)] border border-[var(--glass-border)] text-xs text-[var(--text-secondary)] font-medium animate-fade-up">
							<Icons.check className="w-3.5 h-3.5" />
							{t(lang, "status.saved.short")}
						</div>
					) : null}
					<Button variant="primary" onClick={handleSave} disabled={loading}>
						{t(lang, "settings.save")}
					</Button>
				</div>
			</header>

			<div className="px-6 py-6">
				<div className="w-full space-y-6">
					{error ? (
						<div className="rounded-[var(--radius-xl)] border border-[var(--accent-red)]/30 bg-[var(--accent-red)]/10 px-5 py-4 text-sm text-[var(--text-primary)] flex items-center gap-3">
							<div className="w-10 h-10 rounded-[var(--radius-lg)] bg-[var(--accent-red)]/20 flex items-center justify-center flex-shrink-0">
								<Icons.close className="w-5 h-5 text-[var(--accent-red)]" />
							</div>
							{error}
						</div>
					) : null}

					<div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
						
						<section className="rounded-[var(--radius-xl)] glass overflow-hidden">
							<div className="px-6 py-5 border-b border-[var(--glass-border)] bg-[var(--glass-bg-subtle)]">
								<div className="text-base font-bold text-[var(--text-primary)]">
									{t(lang, "settings.profile.title")}
								</div>
								<div className="text-sm text-[var(--text-muted)] mt-1">
									{t(lang, "settings.profile.subtitle")}
								</div>
							</div>
							<div className="p-6 space-y-6">
								
								<div className="rounded-[var(--radius-lg)] bg-[var(--glass-bg-subtle)] border border-[var(--glass-border)] p-5">
									<div className="flex items-start justify-between gap-4">
										<div>
											<div className="text-sm font-semibold text-[var(--text-primary)]">{t(lang, "settings.language")}</div>
											<div className="text-xs text-[var(--text-muted)] mt-1">
												{t(lang, "settings.language.help")}
											</div>
										</div>
										<div className="flex items-center p-0.5 rounded-[var(--radius-md)] bg-[var(--glass-bg)] border border-[var(--glass-border)]">
											{UI_LANGUAGES.map((l) => (
												<button
													key={l}
													type="button"
													onClick={() => updateSettings({ uiLanguage: l })}
													className={[
														"h-8 px-4 rounded-[var(--radius-sm)] text-xs font-semibold transition-all duration-200",
														lang === l
															? "bg-[var(--glass-bg)] text-[var(--text-primary)]"
															: "text-[var(--text-tertiary)] hover:text-[var(--text-primary)]",
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
										<div className="text-base font-bold text-[var(--text-primary)]">{t(lang, "settings.personality")}</div>
										<div className="text-sm text-[var(--text-muted)] mt-1">{t(lang, "settings.personality.help")}</div>
									</div>
									<button
										onClick={() => setPersonalityAndStore(DEFAULT_PERSONALITY)}
										disabled={loading}
										className="px-3 py-1.5 rounded-[var(--radius-md)] text-xs font-medium text-[var(--text-tertiary)] hover:text-[var(--text-primary)] hover:bg-[var(--glass-bg)] transition-all duration-200"
									>
										{t(lang, "actions.restore")}
									</button>
								</div>

								
								<div className="space-y-3">
									<div className="text-xs font-semibold text-[var(--text-tertiary)] uppercase tracking-wider">{t(lang, "settings.tone")}</div>
									<div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
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

								
								<div className="space-y-3">
									<div className="text-xs font-semibold text-[var(--text-tertiary)] uppercase tracking-wider">{t(lang, "settings.verbosity")}</div>
									<div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
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

								
								<div className="space-y-3">
									<div className="text-xs font-semibold text-[var(--text-tertiary)] uppercase tracking-wider">{t(lang, "settings.guidance")}</div>
									<div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
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

								
								<div className="space-y-3">
									<div className="text-xs font-semibold text-[var(--text-tertiary)] uppercase tracking-wider">{t(lang, "settings.playfulness")}</div>
									<div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
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

						
						<section className="rounded-[var(--radius-xl)] glass overflow-hidden">
							<div className="px-6 py-5 border-b border-[var(--glass-border)] bg-[var(--glass-bg-subtle)]">
								<div className="text-base font-bold text-[var(--text-primary)]">{t(lang, "settings.instructions")}</div>
								<div className="text-sm text-[var(--text-muted)] mt-1">{t(lang, "settings.instructions.help")}</div>
							</div>

							<div className="p-6 space-y-5">
								
								<div className="rounded-[var(--radius-lg)] bg-[var(--glass-bg-subtle)] border border-[var(--glass-border)] p-5">
									<div className="flex items-start justify-between gap-4">
										<div className="text-sm font-semibold text-[var(--text-primary)]">{t(lang, "settings.instructions.editorTitle")}</div>
										<div className="text-[10px] text-[var(--text-muted)] px-2 py-1 rounded-[var(--radius-sm)] bg-[var(--glass-bg)] border border-[var(--glass-border)]">
											{customInstructions.length}/5000
										</div>
									</div>
									<div className="mt-4">
										<TextArea
											value={customInstructions}
											onChange={(e) => setCustomInstructions(e.target.value.slice(0, 5000))}
											rows={12}
											placeholder={t(lang, "settings.instructions.placeholder.page")}
											className="font-mono text-xs"
										/>
									</div>

									<div className="mt-4 flex items-center justify-between gap-2">
										<button
											onClick={handleClearInstructions}
											disabled={loading}
											className="px-3 py-1.5 rounded-[var(--radius-md)] text-xs font-medium text-[var(--text-tertiary)] hover:text-[var(--text-primary)] hover:bg-[var(--glass-bg)] transition-all duration-200"
										>
											{t(lang, "settings.reset")}
										</button>
										<div className="text-[11px] text-[var(--text-muted)]">
											{t(lang, "settings.instructions.reminderSave")}
										</div>
									</div>
								</div>

								
								<div className="rounded-[var(--radius-lg)] bg-[var(--accent-red-glow)] border border-[var(--glass-border)] ring-1 ring-[var(--accent-red)] ring-opacity-20 p-5">
									<div>
										<div className="text-sm font-semibold text-[var(--text-primary)]">{t(lang, "settings.data.title")}</div>
										<div className="text-xs text-[var(--text-muted)] mt-1">{t(lang, "settings.data.subtitle")}</div>
									</div>
									<div className="mt-3 text-xs text-[var(--text-muted)]">{t(lang, "settings.archiveAll.help")}</div>
									<div className="mt-4 flex items-center justify-between gap-3">
										<Button variant="danger" onClick={() => setConfirmArchiveAllOpen(true)} disabled={loading}>
											<Icons.trash className="w-4 h-4" />
											{t(lang, "actions.deleteAll")}
										</Button>
										<div className="text-[11px] text-[var(--text-muted)]">{t(lang, "settings.data.archiveHint")}</div>
									</div>

									{confirmArchiveAllOpen ? (
										<div className="mt-4 rounded-[var(--radius-lg)] border border-[var(--glass-border)] bg-[var(--accent-red-glow)] ring-1 ring-[var(--accent-red)] ring-opacity-30 p-4">
											<div className="flex items-start gap-3">
												<div className="w-10 h-10 rounded-[var(--radius-lg)] bg-[var(--accent-red-glow)] border border-[var(--glass-border)] flex items-center justify-center flex-shrink-0">
													<Icons.trash className="w-5 h-5 text-[var(--accent-red)]" />
												</div>
												<div>
													<div className="text-sm text-[var(--text-primary)] font-semibold">{t(lang, "settings.archiveAll.confirmTitle")}</div>
													<div className="text-xs text-[var(--text-secondary)] mt-1">{t(lang, "settings.archiveAll.confirmBody")}</div>
												</div>
											</div>
											<div className="mt-4 flex items-center gap-2">
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
