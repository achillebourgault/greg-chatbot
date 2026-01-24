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
			<div className="flex-shrink-0 sticky bottom-0 z-40 border-t border-white/[0.06] bg-zinc-950/80 backdrop-blur">
				<div className="mx-auto max-w-3xl px-4 py-3">
					<div className="flex items-center justify-between gap-3 mb-2">
						<div className="flex items-center gap-2 min-w-0">
							<span className="text-[11px] text-zinc-600">{t(lang, "composer.model")}</span>
							<ModelPicker
								lang={lang}
								value={active.model}
								onChange={(model) => setModel(active.id, model)}
								disabled={disabled || isStreaming}
								placement="up"
							/>
						</div>
					</div>

					<div className="flex items-end gap-3 rounded-2xl border border-white/[0.10] bg-white/[0.03] px-3 py-2 focus-within:border-white/[0.16]">
						<textarea
							ref={textareaRef}
							className="composer-textarea flex-1 min-h-[28px] max-h-[200px] resize-none bg-transparent text-[15px] text-zinc-100 placeholder-zinc-600 outline-none leading-relaxed"
							placeholder={t(lang, "composer.placeholder")}
							value={text}
							onChange={(e) => setText(e.target.value)}
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
								<Button variant="secondary" size="sm" onClick={onStop} className="gap-2">
									<Icons.stop className="w-4 h-4" />
									{t(lang, "actions.stop")}
								</Button>
							) : (
								<Button
									variant="secondary"
									size="icon"
									disabled={!canSend}
									onClick={handleSubmit}
									title={t(lang, "actions.send")}
									className={canSend ? "opacity-100" : "opacity-50"}
								>
									<Icons.send className="w-4 h-4" />
								</Button>
							)}
						</div>
					</div>
				</div>
			</div>
		);
	}
