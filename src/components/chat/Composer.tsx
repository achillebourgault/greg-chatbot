"use client";

import { useMemo, useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/Button";
import { Icons } from "@/components/ui/Icons";
import { ModelPicker } from "@/components/chat/ModelPicker";
import { useChatStore } from "@/stores/chat-store";
import { t } from "@/lib/i18n";

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
	const textareaRef = useRef<HTMLTextAreaElement>(null);
	const lastPrefillNonceRef = useRef<number | null>(null);
	const prevStreamingRef = useRef<boolean>(isStreaming);

	const canSend = useMemo(() => {
		return !disabled && !isStreaming && text.trim().length > 0;
	}, [disabled, isStreaming, text]);

	// Auto-resize textarea
	useEffect(() => {
		const textarea = textareaRef.current;
		if (!textarea) return;
		textarea.style.height = "auto";
		textarea.style.height = `${Math.min(textarea.scrollHeight, 200)}px`;
	}, [text]);

	// If the store requests a prefill (restart/edit), apply it once and focus.
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

	// After an answer finishes streaming, re-focus the input.
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
		<div className="flex-shrink-0 border-t border-white/[0.06] bg-zinc-950">
			<div className="mx-auto max-w-5xl px-4 py-4">
				<div className="flex items-center justify-between gap-3 mb-3">
					<div className="flex items-center gap-2 min-w-0">
						<span className="text-[11px] text-zinc-500">{t(lang, "composer.model")}</span>
						<ModelPicker
							lang={lang}
							value={active.model}
							onChange={(model) => setModel(active.id, model)}
							disabled={disabled || isStreaming}
						/>
					</div>
					<div className="hidden sm:flex items-center gap-3 text-[10px] text-zinc-600">
						<span>
							<kbd className="px-1.5 py-0.5 rounded bg-white/[0.03] border border-white/[0.08] font-mono">Enter</kbd> {t(lang, "composer.hint.send")}
						</span>
						<span>
							<kbd className="px-1.5 py-0.5 rounded bg-white/[0.03] border border-white/[0.08] font-mono">Shift+Enter</kbd> {t(lang, "composer.hint.newline")}
						</span>
					</div>
				</div>

				{/* Input container */}
				<div className="relative group">
					<div className="relative flex items-end gap-3 rounded-xl bg-white/[0.03] border border-white/[0.08] p-3 transition-all duration-150">
						<textarea
							ref={textareaRef}
							className="flex-1 min-h-[24px] max-h-[200px] resize-none bg-transparent text-sm text-zinc-100 placeholder-zinc-500 outline-none leading-relaxed"
							placeholder={t(lang, "composer.placeholder")}
							value={text}
							onChange={(e) => setText(e.target.value)}
							disabled={disabled || isStreaming}
							rows={1}
							onKeyDown={(e) => {
								if (e.key === "Enter" && !e.shiftKey) {
									e.preventDefault();
									handleSubmit();
								}
							}}
						/>

						<div className="flex items-center gap-2">
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
								<Button
									variant="primary"
									size="icon"
									disabled={!canSend}
									onClick={handleSubmit}
									className={`
										transition-all duration-300
										${canSend 
											? "opacity-100 scale-100" 
											: "opacity-50 scale-95"
										}
									`}
								>
									<Icons.send className="w-4 h-4" />
								</Button>
							)}
						</div>
					</div>
				</div>


				{/* Hint (mobile) */}
				<div className="flex sm:hidden items-center justify-center gap-4 mt-3">
					<span className="text-[10px] text-zinc-600">
						<kbd className="px-1.5 py-0.5 rounded bg-white/[0.03] border border-white/[0.08] font-mono">Enter</kbd>
						{" "}{t(lang, "composer.hint.send")}
					</span>
					<span className="text-[10px] text-zinc-600">
						<kbd className="px-1.5 py-0.5 rounded bg-white/[0.03] border border-white/[0.08] font-mono">Shift+Enter</kbd>
						{" "}{t(lang, "composer.hint.newline")}
					</span>
				</div>
			</div>
		</div>
	);
}
