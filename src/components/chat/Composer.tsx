"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ModelPicker } from "@/components/chat";
import { Button, Icons } from "@/components/ui";
import { t } from "@/i18n";
import { useChatStore } from "@/stores/chat-store";

type Props = {
	disabled?: boolean;
	isStreaming: boolean;
	onSend: (text: string) => void;
	onStop: () => void;
};

export function Composer({ disabled, isStreaming, onSend, onStop }: Props) {
	const { active, setModel, state, clearComposerPrefill } = useChatStore();
	const lang = state.settings.uiLanguage;
	const [text, setText] = useState("");
	const [isFocused, setIsFocused] = useState(false);
	const textareaRef = useRef<HTMLTextAreaElement>(null);
	const lastPrefillNonceRef = useRef<number | null>(null);
	const prevStreamingRef = useRef<boolean>(isStreaming);

	const canSend = useMemo(() => {
		return !disabled && !isStreaming && text.trim().length > 0;
	}, [disabled, isStreaming, text]);

	useEffect(() => {
		const textarea = textareaRef.current;
		if (!textarea) return;
		textarea.style.height = "auto";
		textarea.style.height = `${Math.min(textarea.scrollHeight, 200)}px`;
	}, [text]);

	useEffect(() => {
		const prefill = state.composerPrefill;
		if (!prefill) return;
		if (prefill.conversationId !== active.id) return;
		if (lastPrefillNonceRef.current === prefill.nonce) return;
		lastPrefillNonceRef.current = prefill.nonce;
		const id = requestAnimationFrame(() => {
			setText(prefill.text);
			textareaRef.current?.focus();
			clearComposerPrefill(prefill.conversationId, prefill.nonce);
		});
		return () => cancelAnimationFrame(id);
	}, [active.id, clearComposerPrefill, state.composerPrefill]);

	useEffect(() => {
		const prev = prevStreamingRef.current;
		prevStreamingRef.current = isStreaming;
		if (!prev || isStreaming) return;
		if (disabled) return;
		requestAnimationFrame(() => textareaRef.current?.focus());
	}, [disabled, isStreaming]);

	const handleSubmit = () => {
		if (!canSend) return;
		const value = text.trim();
		setText("");
		onSend(value);
	};

	return (
		<div className="flex-shrink-0 sticky bottom-0 z-40">
			<div className="h-4" />
			
			<div className="glass-strong border-t border-[var(--glass-border)] pb-safe">
				<div className="mx-auto max-w-3xl px-5 py-5">
					
					<div className="flex items-center justify-between gap-3 mb-4">
						<div className="flex items-center gap-3 min-w-0">
							<span className="text-[11px] text-[var(--text-subtle)] font-medium uppercase tracking-wide">{t(lang, "composer.model")}</span>
							<ModelPicker
								lang={lang}
								value={active.model}
								onChange={(model) => setModel(active.id, model)}
								disabled={disabled || isStreaming}
								placement="up"
							/>
						</div>
					</div>

					
					<div 
						className={[
							"relative rounded-[16px] border",
							"transition-all duration-200",
							isFocused
								? "bg-[rgba(18,18,22,0.9)] border-[rgba(0,212,255,0.25)] shadow-[0_0_0_1px_var(--accent-cyan-glow),var(--shadow-md)]"
								: "bg-[var(--glass-bg)] border-[var(--glass-border)] hover:bg-[rgba(18,18,22,0.85)] hover:border-[var(--glass-border-hover)]",
						].join(" ")}
					>
						
						<div className="relative flex items-end gap-3 px-5 py-4">
							<textarea
								ref={textareaRef}
								className="composer-textarea flex-1 min-h-[28px] max-h-[200px] resize-none bg-transparent text-[15px] text-[var(--text-primary)] placeholder-[var(--text-subtle)] outline-none leading-relaxed"
								placeholder={t(lang, "composer.placeholder")}
								value={text}
								onChange={(e) => setText(e.target.value)}
								onFocus={() => setIsFocused(true)}
								onBlur={() => setIsFocused(false)}
								disabled={disabled}
								rows={1}
								onKeyDown={(e) => {
									if (e.key === "Enter" && !e.shiftKey) {
										e.preventDefault();
										handleSubmit();
									}
								}}
							/>

							<div className="flex items-center gap-2 pb-0.5">
								{isStreaming ? (
									<Button 
										variant="danger" 
										size="sm" 
										onClick={onStop} 
										className="gap-2"
									>
										<Icons.stop className="w-4 h-4" />
										{t(lang, "actions.stop")}
									</Button>
								) : (
									<button
										type="button"
										disabled={!canSend}
										onClick={handleSubmit}
										title={t(lang, "actions.send")}
										className={`
											relative h-11 w-11 rounded-[12px] flex items-center justify-center
											transition-all duration-200
											${canSend 
												? "bg-gradient-to-b from-[#00D4FF] to-[#00B4E0] text-[#050508] shadow-[0_2px_12px_rgba(0,212,255,0.3)] hover:shadow-[0_4px_20px_rgba(0,212,255,0.4)] hover:brightness-110 active:scale-95" 
												: "bg-[rgba(255,255,255,0.04)] text-[#5A5F6B] border border-[rgba(255,255,255,0.06)] cursor-not-allowed"
											}
										`}
									>
										<Icons.send className="w-4.5 h-4.5 relative z-10" />
									</button>
								)}
							</div>
						</div>
					</div>

					
					<div className="mt-3 text-center">
<span className="text-[10px] text-[var(--text-subtle)]">
								<kbd className="px-1.5 py-0.5 rounded-[6px] bg-[rgba(255,255,255,0.04)] border border-[var(--glass-border)] text-[var(--text-muted)] font-mono">Enter</kbd>
								<span className="mx-1.5">to send</span>
								<kbd className="px-1.5 py-0.5 rounded-[6px] bg-[rgba(255,255,255,0.04)] border border-[var(--glass-border)] text-[var(--text-muted)] font-mono">Shift+Enter</kbd>
							<span className="mx-1.5">for new line</span>
						</span>
					</div>
				</div>
			</div>
		</div>
	);
}
