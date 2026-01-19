"use client";

import { useEffect, useState } from "react";
import { Button, Icons, TextArea } from "@/components/ui";
import { useChatStore, type GregPersonality, type GregTone, type GregVerbosity, type GregGuidance, type GregPlayfulness } from "@/stores/chat-store";
import { t, type UiLanguage } from "@/lib/i18n";

type Props = {
	isOpen: boolean;
	onClose: () => void;
};

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

export function SettingsPanel({ isOpen, onClose }: Props) {
	const { state, updateSettings, archiveAllConversations } = useChatStore();
	const lang = state.settings.uiLanguage;
	const [customInstructions, setCustomInstructions] = useState<string>(state.settings.customInstructions ?? "");
	const [personality, setPersonality] = useState<GregPersonality>(state.settings.personality);
	const [loading, setLoading] = useState(false);
	const [saved, setSaved] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [confirmArchiveAllOpen, setConfirmArchiveAllOpen] = useState(false);

	useEffect(() => {
		if (!isOpen) return;
		const id = requestAnimationFrame(() => {
			setError(null);
			setCustomInstructions(state.settings.customInstructions ?? "");
			setPersonality(state.settings.personality);
		});
		return () => cancelAnimationFrame(id);
	}, [isOpen, state.settings.customInstructions, state.settings.personality]);

	const handleSave = () => {
		setError(null);
		setLoading(true);
		updateSettings({ personality, customInstructions });
		setSaved(true);
		setTimeout(() => setSaved(false), 2000);
		setLoading(false);
	};

	const handleReset = () => {
		setError(null);
		setLoading(true);
		setCustomInstructions("");
		updateSettings({ customInstructions: "" });
		setLoading(false);
	};

	if (!isOpen) return null;

	const toneOptions: Array<{ id: GregTone; title: string; description: string }> =
		lang === "fr"
			? [
					{ id: "professional", title: "Pro", description: "Carré, structuré, fiable." },
					{ id: "friendly", title: "Friendly", description: "Chaleureux, mais efficace." },
					{ id: "direct", title: "Direct", description: "Court, net, actionnable." },
				]
			: [
					{ id: "professional", title: "Pro", description: "Structured, reliable, no fluff." },
					{ id: "friendly", title: "Friendly", description: "Warm, but still efficient." },
					{ id: "direct", title: "Direct", description: "Short, sharp, actionable." },
				];

	type Option<T extends string> = { id: T; title: string; description: string };
	const verbosityOptions: Option<GregVerbosity>[] =
		lang === "fr"
			? [
					{ id: "minimal", title: "Minimal", description: "Juste l'essentiel." },
					{ id: "balanced", title: "Balanced", description: "Concis mais complet." },
					{ id: "detailed", title: "Detailed", description: "Détaillé + étapes." },
				]
			: [
					{ id: "minimal", title: "Minimal", description: "Just the essentials." },
					{ id: "balanced", title: "Balanced", description: "Concise, but complete." },
					{ id: "detailed", title: "Detailed", description: "More detail + step-by-step." },
				];
	const guidanceOptions: Option<GregGuidance>[] = [
		{ id: "neutral", title: t(lang, "settings.guidance.neutral.title"), description: t(lang, "settings.guidance.neutral.desc") },
		{ id: "coach", title: t(lang, "settings.guidance.coach.title"), description: t(lang, "settings.guidance.coach.desc") },
	];
	const playfulOptions: Option<GregPlayfulness>[] =
		lang === "fr"
			? [
					{ id: "none", title: "None", description: "Pas de fun, 100% pro." },
					{ id: "light", title: "Light", description: "Léger, jamais enfantin." },
				]
			: [
					{ id: "none", title: "None", description: "No jokes, fully professional." },
					{ id: "light", title: "Light", description: "A touch of humor, never childish." },
				];

	return (
		<div className="fixed inset-0 z-50 flex items-center justify-center">
			{/* Backdrop */}
			<div 
				className="absolute inset-0 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200"
				onClick={onClose}
			/>

			{/* Panel */}
			<div className="relative w-full max-w-5xl max-h-[88vh] mx-4 rounded-2xl bg-zinc-900 border border-white/[0.08] shadow-2xl shadow-black/50 animate-in zoom-in-95 fade-in duration-300 overflow-hidden flex flex-col">
				{/* Header */}
				<div className="flex-shrink-0 flex items-center justify-between p-6 border-b border-white/[0.06]">
					<div className="flex items-center gap-3">
						<div className="w-10 h-10 rounded-xl bg-white/[0.04] border border-white/[0.08] flex items-center justify-center">
							<Icons.settings className="w-5 h-5 text-zinc-200" />
						</div>
						<div>
							<h2 className="text-lg font-semibold text-zinc-100">{t(lang, "settings.title")}</h2>
							<p className="text-xs text-zinc-500">{t(lang, "settings.subtitle")}</p>
						</div>
					</div>
					<Button
						variant="ghost"
						size="icon"
						onClick={onClose}
						className="text-zinc-400 hover:text-zinc-100"
					>
						<Icons.close className="w-5 h-5" />
					</Button>
				</div>

				{/* Content */}
				<div className="flex-1 overflow-auto p-6">
					<div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
						{/* Personality */}
						<div className="space-y-5">
							<div className="flex items-start justify-between gap-4 p-4 rounded-xl bg-white/[0.02] border border-white/[0.06]">
								<div>
									<h3 className="text-sm font-semibold text-zinc-100">{t(lang, "settings.language")}</h3>
									<p className="text-xs text-zinc-500 mt-1">
										{lang === "fr" ? "EN par défaut." : "EN is the default."}
									</p>
								</div>
								<div className="flex items-center gap-1">
									{(["en", "fr"] as UiLanguage[]).map((l) => (
										<button
											key={l}
											type="button"
											onClick={() => {
												updateSettings({ uiLanguage: l });
											}}
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

							<div>
								<h3 className="text-sm font-semibold text-zinc-100">{t(lang, "settings.personality")}</h3>
								<p className="text-xs text-zinc-500 mt-1">{t(lang, "settings.personality.help")}</p>
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
											onClick={() =>
												setPersonality((p) => ({ ...p, tone: opt.id }))
											}
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
											onClick={() =>
												setPersonality((p) => ({ ...p, verbosity: opt.id }))
											}
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
											onClick={() =>
												setPersonality((p) => ({ ...p, guidance: opt.id }))
											}
										/>
									))}
								</div>
							</div>

							<div className="space-y-2">
								<div className="text-xs font-medium text-zinc-300">{t(lang, "settings.playfulness")}</div>
								<div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
									{playfulOptions.map((opt) => (
										<OptionCard
											key={opt.id}
											title={opt.title}
											description={opt.description}
											selected={personality.playfulness === opt.id}
											onClick={() =>
												setPersonality((p) => ({ ...p, playfulness: opt.id }))
											}
										/>
									))}
								</div>
							</div>
						</div>

						{/* Instructions */}
						<div className="space-y-4">
							<div className="flex items-start justify-between gap-4">
								<div>
									<h3 className="text-sm font-semibold text-zinc-100">{t(lang, "settings.instructions")}</h3>
									<p className="text-xs text-zinc-500 mt-1 leading-relaxed">
										{t(lang, "settings.instructions.help")}
								</p>
								</div>
								<Button
									variant="ghost"
									size="xs"
									onClick={handleReset}
									className="flex-shrink-0 text-zinc-500 hover:text-zinc-300"
									disabled={loading}
								>
									{t(lang, "settings.reset")}
								</Button>
							</div>

							<TextArea
								value={customInstructions}
								onChange={(e) => setCustomInstructions(e.target.value)}
								className="min-h-[340px] font-mono text-xs leading-relaxed"
								placeholder={lang === "fr" ? "(optionnel) Ajoute des règles spécifiques à ce projet…" : "(optional) Add project-specific rules…"}
								disabled={loading}
							/>

							<div className="flex items-center justify-between gap-3">
								<div className="text-xs text-zinc-500">
									{lang === "fr" ? "Toujours actifs:" : "Always active:"}{" "}
									<span className="text-zinc-300">DEFAULT_GREG_INSTRUCTIONS + Creator</span>
								</div>
								{error ? <div className="text-xs text-red-300">{error}</div> : null}
							</div>

							<div className="flex gap-3 p-4 rounded-xl bg-white/[0.03] border border-white/[0.06]">
								<Icons.sparkles className="w-5 h-5 text-zinc-400 flex-shrink-0 mt-0.5" />
								<div className="text-xs text-zinc-400 leading-relaxed">
									<p className="font-medium text-zinc-200 mb-1">{lang === "fr" ? "Note" : "Note"}</p>
									<p>
										{lang === "fr"
											? "Les instructions par défaut ne sont pas éditées ici. Pour changer la base, édite le fichier "
											: "Default instructions aren’t edited here. To change the base, edit "}
										<span className="text-zinc-200">DEFAULT_GREG_INSTRUCTIONS.md</span>.
									</p>
								</div>
							</div>

							{/* Data / archive */}
							<div className="p-4 rounded-xl bg-white/[0.02] border border-white/[0.06]">
								<div className="flex items-start justify-between gap-4">
									<div>
										<h3 className="text-sm font-semibold text-zinc-100">{t(lang, "settings.data.title")}</h3>
										<p className="text-xs text-zinc-500 mt-1">{t(lang, "settings.data.subtitle")}</p>
									</div>
									<Button
										variant="danger"
										size="sm"
										disabled={state.isStreaming}
										onClick={() => setConfirmArchiveAllOpen(true)}
									>
										<Icons.trash className="w-4 h-4" />
										{t(lang, "actions.deleteAll")}
									</Button>
								</div>
								<p className="text-xs text-zinc-500 mt-3 leading-relaxed">{t(lang, "settings.archiveAll.help")}</p>
							</div>
						</div>
					</div>
				</div>

				{/* Footer */}
				<div className="flex-shrink-0 flex items-center justify-between gap-3 p-6 border-t border-white/[0.06] bg-zinc-950/50">
					<div className="flex items-center gap-2">
						{saved && (
							<div className="flex items-center gap-2 text-zinc-300 text-sm animate-in fade-in duration-200">
								<Icons.check className="w-4 h-4" />
								{lang === "fr" ? "Sauvegardé" : "Saved"}
							</div>
						)}
					</div>
					<div className="flex items-center gap-3">
						<Button variant="secondary" onClick={onClose} disabled={loading}>
							{lang === "fr" ? "Annuler" : "Cancel"}
						</Button>
						<Button variant="primary" onClick={handleSave} disabled={loading}>
							{t(lang, "settings.save")}
						</Button>
					</div>
				</div>
			</div>

			{/* Confirm archive all modal */}
			{confirmArchiveAllOpen && (
				<div className="absolute inset-0 z-10 flex items-center justify-center">
					<div
						className="absolute inset-0 bg-black/60 backdrop-blur-sm"
						onClick={() => setConfirmArchiveAllOpen(false)}
					/>
					<div className="relative w-full max-w-md mx-4 rounded-2xl bg-zinc-950 border border-white/[0.08] shadow-2xl p-6">
						<div className="flex items-start gap-3">
							<div className="w-10 h-10 rounded-xl bg-red-500/10 border border-red-500/20 flex items-center justify-center">
								<Icons.trash className="w-5 h-5 text-red-300" />
							</div>
							<div>
								<div className="text-sm font-semibold text-zinc-100">{t(lang, "settings.archiveAll.confirmTitle")}</div>
								<div className="text-xs text-zinc-500 mt-1 leading-relaxed">{t(lang, "settings.archiveAll.confirmBody")}</div>
							</div>
						</div>
						<div className="flex items-center justify-end gap-3 mt-6">
							<Button variant="secondary" onClick={() => setConfirmArchiveAllOpen(false)}>
								{t(lang, "actions.cancel")}
							</Button>
							<Button
								variant="danger"
								disabled={state.isStreaming}
								onClick={() => {
									archiveAllConversations();
									setConfirmArchiveAllOpen(false);
								}}
							>
								{t(lang, "actions.deleteAll")}
							</Button>
						</div>
					</div>
				</div>
			)}
		</div>
	);
}