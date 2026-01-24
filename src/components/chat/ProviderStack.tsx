"use client";

import Image from "next/image";
import { useEffect, useMemo, useState } from "react";
import { approxTokens, getProviderInfo, providerFromModelId } from "@/lib/providers";
import { getModelDisplayName, type Conversation, useChatStore } from "@/stores/chat-store";
import { fetchModels, type ModelListItem } from "@/lib/client/openrouter";
import { t } from "@/i18n";

type Pricing = { promptPerToken: number | null; completionPerToken: number | null };

function parsePrice(value?: string): number | null {
	if (!value) return null;
	const n = Number(value);
	return Number.isFinite(n) ? n : null;
}

function formatMoneyUsd(value: number): string {
	if (!Number.isFinite(value)) return "$0";
	if (value === 0) return "$0";
	if (value < 0.01) return `$${value.toFixed(4)}`;
	if (value < 1) return `$${value.toFixed(3)}`;
	if (value < 10) return `$${value.toFixed(2)}`;
	return `$${value.toFixed(1)}`;
}

function useModelPricingMap() {
	const [models, setModels] = useState<ModelListItem[] | null>(null);

	useEffect(() => {
		const controller = new AbortController();
		fetchModels(controller.signal).then(setModels).catch(() => setModels([]));
		return () => controller.abort();
	}, []);

	return useMemo(() => {
		const map = new Map<string, Pricing>();
		for (const m of models ?? []) {
			map.set(m.id, {
				promptPerToken: parsePrice(m.pricing?.prompt),
				completionPerToken: parsePrice(m.pricing?.completion),
			});
		}
		return { map, ready: models !== null };
	}, [models]);
}

type ProviderUsage = {
	modelId: string;
	label: string;
	providerLabel: string;
	iconUrl: string;
	fallbackIconSrc: string;
	totalUsd: number;
	free: boolean;
};

function ProviderIcon({
	src,
	fallback,
	alt,
	size,
	className,
}: {
	src: string;
	fallback: string;
	alt: string;
	size: number;
	className?: string;
}) {
	const [currentSrc, setCurrentSrc] = useState(src);

	useEffect(() => {
		setCurrentSrc(src);
	}, [src]);

	return (
		<Image
			src={currentSrc}
			alt={alt}
			width={size}
			height={size}
			unoptimized
			className={className}
			onError={() => {
				if (currentSrc === fallback) return;
				setCurrentSrc(fallback);
			}}
		/>
	);
}

export function ProviderStack({ conversation }: { conversation: Conversation }) {
	const { state } = useChatStore();
	const lang = state.settings.uiLanguage;
	const { map: pricingMap, ready } = useModelPricingMap();

	const usage = useMemo((): ProviderUsage[] => {
		const messages = conversation.messages;
		const perModel = new Map<string, ProviderUsage>();

		const record = (modelId: string, costUsd: number, free: boolean) => {
			const providerId = providerFromModelId(modelId);
			const info = getProviderInfo(providerId);
			const iconUrl = `/api/tools/icon?url=${encodeURIComponent(info.siteUrl)}`;
			const providerLabel = providerId === "unknown" ? t(lang, "providers.unknown") : info.label;

			const existing = perModel.get(modelId) ?? {
				modelId,
				label: getModelDisplayName(modelId),
				providerLabel,
				iconUrl,
				fallbackIconSrc: info.iconSrc,
				totalUsd: 0,
				free,
			};

			existing.totalUsd += costUsd;
			existing.free = existing.free && free;
			perModel.set(modelId, existing);
		};

		for (let i = 0; i < messages.length; i++) {
			const msg = messages[i];
			if (msg.role !== "assistant") continue;
			const modelId = msg.model ?? conversation.model;

			const prevUser = (() => {
				for (let j = i - 1; j >= 0; j--) {
					if (messages[j].role === "user") return messages[j];
				}
				return null;
			})();

			const inTokens = prevUser ? approxTokens(prevUser.content) : 0;
			const outTokens = approxTokens(msg.content);

			const pricing = pricingMap.get(modelId);
			const p = pricing?.promptPerToken;
			const c = pricing?.completionPerToken;

			const free = (p ?? 0) === 0 && (c ?? 0) === 0 && pricing !== undefined;
			const costUsd = (p ?? 0) * inTokens + (c ?? 0) * outTokens;
			record(modelId, costUsd, free);
		}

		// If no assistant messages yet, show the currently selected model
		if (messages.filter((m) => m.role === "assistant").length === 0) {
			record(conversation.model, 0, false);
		}

		return Array.from(perModel.values()).sort((a, b) => b.totalUsd - a.totalUsd);
	}, [conversation.messages, conversation.model, lang, pricingMap]);

	const modelIcons = usage.map((u) => ({
		label: u.label,
		providerLabel: u.providerLabel,
		src: u.iconUrl,
		fallback: u.fallbackIconSrc,
		id: u.modelId,
	}));

	return (
		<div className="relative group">
			<div className="flex items-center -space-x-2">
				{modelIcons.slice(0, 6).map((p) => (
					<div
						key={p.id}
						className="w-8 h-8 rounded-full border border-white/[0.10] bg-zinc-900 overflow-hidden shadow-sm"
						title={`${p.label} (${p.providerLabel})`}
					>
						<ProviderIcon
							src={p.src}
							fallback={p.fallback}
							alt={p.label}
							size={32}
							className="w-full h-full object-cover"
						/>
					</div>
				))}
				{modelIcons.length > 6 ? (
					<div className="w-8 h-8 rounded-full border border-white/[0.10] bg-zinc-800 flex items-center justify-center text-[11px] text-zinc-200">
						+{modelIcons.length - 6}
					</div>
				) : null}
			</div>

			{/* Hover panel */}
			<div className="pointer-events-none opacity-0 group-hover:opacity-100 group-hover:pointer-events-auto transition-all duration-200 absolute left-0 top-full mt-2 w-[360px] z-50">
				<div className="rounded-xl bg-zinc-900 border border-white/[0.10] shadow-xl shadow-black/50 overflow-hidden">
					<div className="px-4 py-3 border-b border-white/[0.06]">
						<div className="text-sm font-medium text-zinc-100">{t(lang, "providerStack.title")}</div>
						<div className="text-[11px] text-zinc-500 mt-0.5">
							{t(lang, "providerStack.subtitle", { loadingPricing: !ready })}
						</div>
					</div>
					<div className="p-2 max-h-[340px] overflow-auto scrollbar-thin scrollbar-track-transparent scrollbar-thumb-white/10">
						{usage.map((m) => (
							<div key={m.modelId} className="p-2">
								<div className="flex items-center justify-between gap-3 px-2">
									<div className="flex items-center gap-2 min-w-0">
										<div className="w-7 h-7 rounded-full border border-white/[0.10] bg-zinc-950 overflow-hidden">
											<ProviderIcon
												src={m.iconUrl}
												fallback={m.fallbackIconSrc}
												alt={m.providerLabel}
												size={28}
												className="w-full h-full object-cover"
											/>
										</div>
										<div className="min-w-0">
											<div className="text-[13px] text-zinc-200 truncate">{m.label}</div>
											<div className="text-[11px] text-zinc-500 truncate">{m.modelId}</div>
											<div className="text-[11px] text-zinc-500 truncate">{m.providerLabel}</div>
										</div>
									</div>
									<div className="text-[13px] text-zinc-200 flex-shrink-0">
										{m.free ? t(lang, "modelPicker.badge.free") : formatMoneyUsd(m.totalUsd)}
									</div>
								</div>
							</div>
						))}
					</div>
				</div>
			</div>
		</div>
	);
}
