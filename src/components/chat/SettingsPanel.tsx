"use client";

import { useEffect, useState } from "react";
import { Button, Icons, TextArea } from "@/components/ui";
import { useChatStore, type GregPersonality, type GregTone, type GregVerbosity, type GregGuidance, type GregPlayfulness } from "@/stores/chat-store";
import { t, UI_LANGUAGES } from "@/i18n";

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
				"group text-left w-full rounded-[12px] border p-4 transition-all duration-200",
				selected
					? "bg-[var(--accent-cyan-glow)] border-[rgba(0,212,255,0.20)]"
					: "bg-[rgba(255,255,255,0.02)] border-[var(--glass-border)] hover:bg-[rgba(255,255,255,0.04)] hover:border-[var(--glass-border-hover)]",
			].join(" ")}
		>
			<div className="flex items-start justify-between gap-3">
				<div>
					<div className={`text-[13px] font-medium transition-colors ${selected ? "text-[var(--text-primary)]" : "text-[var(--text-secondary)] group-hover:text-[var(--text-primary)]"}`}>{title}</div>
					<div className="text-[11px] text-[var(--text-subtle)] mt-1 leading-relaxed">{description}</div>
				</div>
				{selected ? (
					<div className="mt-0.5 w-5 h-5 flex-shrink-0 rounded-full bg-[var(--accent-cyan-glow)] border border-[rgba(0,212,255,0.30)] grid place-items-center">
						<Icons.check className="w-3 h-3 text-[var(--accent-cyan)]" />
					</div>
				) : (
					<div className="mt-0.5 w-5 h-5 flex-shrink-0 rounded-full border border-[var(--glass-border-hover)] group-hover:border-[rgba(255,255,255,0.20)] transition-colors" />
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

	const toneOptions: Array<{ id: GregTone; title: string; description: string }> = [
		{
			id: "professional",
			title: t(lang, "settings.tone.professional.title"),
			description: t(lang, "settings.tone.professional.desc"),
		},
		{ id: "friendly", title: t(lang, "settings.tone.friendly.title"), description: t(lang, "settings.tone.friendly.desc") },
		{ id: "direct", title: t(lang, "settings.tone.direct.title"), description: t(lang, "settings.tone.direct.desc") },
	];

	type Option<T extends string> = { id: T; title: string; description: string };
	const verbosityOptions: Option<GregVerbosity>[] = [
		{ id: "minimal", title: t(lang, "settings.verbosity.minimal.title"), description: t(lang, "settings.verbosity.minimal.desc") },
		{ id: "balanced", title: t(lang, "settings.verbosity.balanced.title"), description: t(lang, "settings.verbosity.balanced.desc") },
		{ id: "detailed", title: t(lang, "settings.verbosity.detailed.title"), description: t(lang, "settings.verbosity.detailed.desc") },
	];
	const guidanceOptions: Option<GregGuidance>[] = [
		{ id: "neutral", title: t(lang, "settings.guidance.neutral.title"), description: t(lang, "settings.guidance.neutral.desc") },
		{ id: "coach", title: t(lang, "settings.guidance.coach.title"), description: t(lang, "settings.guidance.coach.desc") },
	];
	const playfulOptions: Option<GregPlayfulness>[] = [
		{ id: "none", title: t(lang, "settings.playfulness.none.title"), description: t(lang, "settings.playfulness.none.desc") },
		{ id: "light", title: t(lang, "settings.playfulness.light.title"), description: t(lang, "settings.playfulness.light.desc") },
	];

	return (
		<div className="fixed inset-0 z-50 flex items-center justify-center p-4">
			
			<div 
				className="absolute inset-0 bg-[var(--bg-overlay)] backdrop-blur-md animate-fade-in"
				onClick={onClose}
			/>

			
			<div className="relative w-full max-w-5xl max-h-[88vh] rounded-[var(--radius-2xl)] glass-strong shadow-[var(--shadow-xl)] animate-scale-in overflow-hidden flex flex-col">
				
				<div className="flex-shrink-0 flex items-center justify-between p-6 border-b border-[var(--glass-border)] bg-[rgba(255,255,255,0.02)]">
					<div className="flex items-center gap-4">
						<div className="w-12 h-12 rounded-[var(--radius-xl)] bg-[rgba(255,255,255,0.04)] border border-[var(--glass-border)] flex items-center justify-center">
							<Icons.settings className="w-6 h-6 text-[var(--text-primary)]" />
						</div>
						<div>
							<h2 className="text-[18px] font-bold text-[var(--text-primary)]">{t(lang, "settings.title")}</h2>
							<p className="text-[13px] text-[var(--text-subtle)] mt-0.5">{t(lang, "settings.subtitle")}</p>
						</div>
					</div>
					<button
						onClick={onClose}
						className="w-10 h-10 rounded-[var(--radius-lg)] flex items-center justify-center text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[rgba(255,255,255,0.06)] transition-all duration-200"
					>
						<Icons.close className="w-5 h-5" />
					</button>
				</div>

				
				<div className="flex-1 overflow-auto p-6 scrollbar-premium">
					<div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
						
						<div className="space-y-6">
							
							<div className="flex items-start justify-between gap-4 p-5 rounded-[var(--radius-xl)] bg-[rgba(255,255,255,0.02)] border border-[var(--glass-border)]">
								<div>
									<h3 className="text-[13px] font-semibold text-[var(--text-primary)]">{t(lang, "settings.language")}</h3>
									<p className="text-[11px] text-[var(--text-subtle)] mt-1">
										{t(lang, "settings.language.defaultHint")}
									</p>
								</div>
								<div className="flex items-center p-0.5 rounded-[var(--radius-lg)] bg-[rgba(255,255,255,0.04)] border border-[var(--glass-border)]">
									{UI_LANGUAGES.map((l) => (
										<button
											key={l}
											type="button"
											onClick={() => {
												updateSettings({ uiLanguage: l });
											}}
											className={[
												"h-8 px-4 rounded-[var(--radius-sm)] text-[11px] font-semibold transition-all duration-200",
												lang === l
													? "bg-[rgba(255,255,255,0.08)] text-[var(--text-primary)]"
													: "text-[var(--text-muted)] hover:text-[var(--text-primary)]",
											].join(" ")}
										>
											{l.toUpperCase()}
										</button>
									))}
								</div>
							</div>

							
							<div>
<h3 className="text-[15px] font-bold text-[var(--text-primary)]">{t(lang, "settings.personality")}</h3>
									<p className="text-[13px] text-[var(--text-muted)] mt-1">{t(lang, "settings.personality.help")}</p>
							</div>

							
							<div className="space-y-3">
								<div className="text-[10px] font-semibold text-[var(--text-subtle)] uppercase tracking-wider">{t(lang, "settings.tone")}</div>
								<div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
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

							
							<div className="space-y-3">
								<div className="text-[10px] font-semibold text-[var(--text-subtle)] uppercase tracking-wider">{t(lang, "settings.verbosity")}</div>
								<div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
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

							
							<div className="space-y-3">
								<div className="text-[10px] font-semibold text-[var(--text-subtle)] uppercase tracking-wider">{t(lang, "settings.guidance")}</div>
								<div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
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

							
							<div className="space-y-3">
								<div className="text-[10px] font-semibold text-[var(--text-subtle)] uppercase tracking-wider">{t(lang, "settings.playfulness")}</div>
								<div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
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

						
						<div className="space-y-5">
							<div className="flex items-start justify-between gap-4">
								<div>
									<h3 className="text-[15px] font-bold text-[var(--text-primary)]">{t(lang, "settings.instructions")}</h3>
									<p className="text-[13px] text-[var(--text-muted)] mt-1 leading-relaxed">
										{t(lang, "settings.instructions.help")}
									</p>
								</div>
								<button
									onClick={handleReset}
									className="flex-shrink-0 px-3 py-1.5 rounded-[var(--radius-lg)] text-[12px] font-medium text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[rgba(255,255,255,0.06)] transition-all duration-200"
									disabled={loading}
								>
									{t(lang, "settings.reset")}
								</button>
							</div>

							<TextArea
								value={customInstructions}
								onChange={(e) => setCustomInstructions(e.target.value)}
								className="min-h-[320px] font-mono text-[12px] leading-relaxed rounded-[var(--radius-xl)] bg-[rgba(0,0,0,0.3)] border-[var(--glass-border)] focus:border-[rgba(0,212,255,0.25)] focus:ring-2 focus:ring-[var(--accent-cyan-glow)]"
								placeholder={t(lang, "settings.instructions.placeholder.panel")}
								disabled={loading}
							/>

							<div className="flex items-center justify-between gap-3">
								<div className="text-[11px] text-[var(--text-subtle)]">
									{t(lang, "settings.instructions.alwaysActive")}{" "}
									<span className="text-[var(--text-secondary)]">{t(lang, "settings.instructions.alwaysActiveItems")}</span>
								</div>
								{error ? <div className="text-[11px] text-[var(--accent-red)]">{error}</div> : null}
							</div>

							
<div className="flex gap-4 p-5 rounded-[var(--radius-xl)] bg-[rgba(255,255,255,0.02)] border border-[var(--glass-border)]">
									<div className="w-10 h-10 rounded-[var(--radius-lg)] bg-[rgba(255,255,255,0.04)] border border-[var(--glass-border)] flex items-center justify-center flex-shrink-0">
										<Icons.sparkles className="w-5 h-5 text-[var(--text-secondary)]" />
									</div>
									<div className="text-[13px] text-[var(--text-muted)] leading-relaxed">
										<p className="font-semibold text-[var(--text-primary)] mb-1">{t(lang, "settings.instructions.noteTitle")}</p>
									<p className="text-[11px]">
										{t(lang, "settings.instructions.noteBody", { filePath: "src/instructions/DEFAULT_GREG_INSTRUCTIONS.md" })}
									</p>
								</div>
							</div>

							
<div className="p-5 rounded-[var(--radius-xl)] bg-[var(--accent-red-glow)] border border-[rgba(255,69,58,0.15)]">
									<div className="flex items-start justify-between gap-4">
										<div>
											<h3 className="text-[13px] font-semibold text-[var(--text-primary)]">{t(lang, "settings.data.title")}</h3>
											<p className="text-[11px] text-[var(--text-subtle)] mt-1">{t(lang, "settings.data.subtitle")}</p>
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
								<p className="text-[11px] text-[var(--text-subtle)] mt-3 leading-relaxed">{t(lang, "settings.archiveAll.help")}</p>
							</div>
						</div>
					</div>
				</div>

				
				<div className="flex-shrink-0 flex items-center justify-between gap-3 p-6 border-t border-[var(--glass-border)] bg-[rgba(255,255,255,0.02)]">
					<div className="flex items-center gap-2">
						{saved && (
							<div className="flex items-center gap-2 px-3 py-1.5 rounded-[var(--radius-lg)] bg-[var(--accent-green-glow)] border border-[rgba(52,199,89,0.20)] text-[var(--accent-green)] text-[12px] font-medium animate-fade-in">
								<Icons.check className="w-4 h-4" />
								{t(lang, "status.saved.long")}
							</div>
						)}
					</div>
					<div className="flex items-center gap-3">
						<Button variant="secondary" onClick={onClose} disabled={loading}>
							{t(lang, "actions.cancel")}
						</Button>
						<Button variant="primary" onClick={handleSave} disabled={loading}>
							{t(lang, "settings.save")}
						</Button>
					</div>
				</div>
			</div>

			
			{confirmArchiveAllOpen && (
				<div className="absolute inset-0 z-10 flex items-center justify-center p-4">
					<div
						className="absolute inset-0 bg-[var(--bg-overlay)] backdrop-blur-sm"
						onClick={() => setConfirmArchiveAllOpen(false)}
					/>
					<div className="relative w-full max-w-md rounded-[var(--radius-2xl)] glass-strong border-[rgba(255,69,58,0.20)] shadow-[var(--shadow-xl)] p-6 animate-scale-in">
						<div className="flex items-start gap-4">
							<div className="w-12 h-12 rounded-[var(--radius-xl)] bg-[var(--accent-red-glow)] border border-[rgba(255,69,58,0.25)] flex items-center justify-center flex-shrink-0">
								<Icons.trash className="w-6 h-6 text-[var(--accent-red)]" />
							</div>
							<div>
								<div className="text-[15px] font-bold text-[var(--text-primary)]">{t(lang, "settings.archiveAll.confirmTitle")}</div>
								<div className="text-[13px] text-[var(--text-muted)] mt-2 leading-relaxed">{t(lang, "settings.archiveAll.confirmBody")}</div>
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
