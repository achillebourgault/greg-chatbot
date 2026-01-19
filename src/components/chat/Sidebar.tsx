"use client";

import { usePathname, useRouter } from "next/navigation";
import { Button, Icons, SearchBar } from "@/components/ui";
import { useChatStore } from "@/stores/chat-store";
import { intlLocale, t, type UiLanguage } from "@/i18n";
import { useMemo, useState } from "react";

function formatRelativeDate(timestamp: number, lang: UiLanguage, now: number): string {
	const diff = now - timestamp;
	const minutes = Math.floor(diff / 60000);
	const hours = Math.floor(diff / 3600000);
	const days = Math.floor(diff / 86400000);

	if (minutes < 1) return t(lang, "sidebar.justNow");
	if (minutes < 60) return t(lang, "sidebar.lastUpdated", { minutes });
	if (hours < 24) return t(lang, "sidebar.lastUpdated", { hours });
	if (days < 7) return t(lang, "sidebar.lastUpdated", { days });
	return new Date(timestamp).toLocaleDateString(intlLocale(lang), {
		day: "numeric",
		month: "short",
	});
}

export function Sidebar() {
	const router = useRouter();
	const pathname = usePathname();
	const {
		state,
		active,
		setActive,
		createConversation,
		archiveConversation,
		restoreConversation,
		archiveAllConversations,
		toggleSidebar,
	} = useChatStore();

	const [searchQuery, setSearchQuery] = useState("");
	const [hoveredId, setHoveredId] = useState<string | null>(null);
	const [archivedOpen, setArchivedOpen] = useState(false);
	const [confirmArchiveAllOpen, setConfirmArchiveAllOpen] = useState(false);
	const lang = state.settings.uiLanguage;
	const [now] = useState(() => Date.now());

	const openConversation = (id: string) => {
		setActive(id);
		if (pathname !== "/") router.push("/");
	};

	const { filteredVisible, filteredArchived } = useMemo(() => {
		// Hide empty conversations from the sidebar (better default UX).
		const isDisplayable = (c: (typeof state.conversations)[number]) => (c.messages?.length ?? 0) > 0;
		const visible = state.conversations.filter((c) => !c.archivedAt && isDisplayable(c));
		const archived = state.conversations.filter((c) => c.archivedAt && isDisplayable(c));
		if (!searchQuery.trim()) return { filteredVisible: visible, filteredArchived: [] as typeof archived };
		const query = searchQuery.toLowerCase();
		const matches = (c: (typeof visible)[number]) =>
			c.title.toLowerCase().includes(query) ||
			c.messages.some((m) => m.content.toLowerCase().includes(query));
		return {
			filteredVisible: visible.filter(matches),
			filteredArchived: archived.filter(matches),
		};
	}, [state, searchQuery]);

	const groupedConversations = useMemo(() => {
		const today: typeof filteredVisible = [];
		const yesterday: typeof filteredVisible = [];
		const thisWeek: typeof filteredVisible = [];
		const older: typeof filteredVisible = [];

		for (const conv of filteredVisible) {
			const diff = now - conv.updatedAt;
			const days = Math.floor(diff / 86400000);

			if (days < 1) today.push(conv);
			else if (days < 2) yesterday.push(conv);
			else if (days < 7) thisWeek.push(conv);
			else older.push(conv);
		}

		return [
			{ label: t(lang, "sidebar.group.today"), items: today },
			{ label: t(lang, "sidebar.group.yesterday"), items: yesterday },
			{ label: t(lang, "sidebar.group.thisWeek"), items: thisWeek },
			{ label: t(lang, "sidebar.group.older"), items: older },
		].filter((g) => g.items.length > 0);
	}, [filteredVisible, lang, now]);

	const messageCountLabel = (count: number) => t(lang, "sidebar.messageCount", { count });

	return (
		<aside
			className={`
				flex h-full flex-col
				bg-zinc-950
				border-r border-white/[0.06]
				transition-all duration-300 ease-out
				${state.sidebarOpen ? "w-[320px]" : "w-0 overflow-hidden"}
			`}
		>
			{/* Header */}
			<div className="flex-shrink-0 p-4 border-b border-white/[0.04]">
				<div className="flex items-center justify-between mb-4">
					<div className="flex items-center gap-3">
						<Icons.greg className="w-10 h-10" />
						<div>
							<h1 className="text-lg font-semibold text-zinc-100">
								{t(lang, "app.name")}
							</h1>
							<p className="text-[10px] text-zinc-500 uppercase tracking-wider">{t(lang, "app.subtitle")}</p>
						</div>
					</div>
					<Button
						variant="ghost"
						size="icon"
						onClick={toggleSidebar}
						className="text-zinc-400 hover:text-zinc-100"
					>
						<Icons.close className="w-4 h-4" />
					</Button>
				</div>

				<Button
					className="w-full mb-3"
					variant="secondary"
					onClick={() => {
						createConversation(active.model);
						if (pathname !== "/") router.push("/");
					}}
					disabled={state.isStreaming}
				>
					<Icons.plus className="w-4 h-4" />
					{t(lang, "actions.newChat")}
				</Button>

				<SearchBar
					value={searchQuery}
					onChange={setSearchQuery}
					placeholder={t(lang, "sidebar.searchPlaceholder")}
				/>
			</div>

			{/* Conversations List */}
			<div className="flex-1 overflow-auto px-2 py-3 scrollbar-thin scrollbar-track-transparent scrollbar-thumb-white/10 hover:scrollbar-thumb-white/20">
				{filteredVisible.length === 0 && filteredArchived.length === 0 ? (
					<div className="flex flex-col items-center justify-center py-12 px-4 text-center">
						<Icons.chat className="w-12 h-12 text-zinc-700 mb-3" />
						<p className="text-sm text-zinc-500">
							{searchQuery ? t(lang, "sidebar.emptySearch") : t(lang, "sidebar.empty")}
						</p>
					</div>
				) : (
					<div className="space-y-4">
						{groupedConversations.map((group) => (
							<div key={group.label}>
								<div className="px-3 py-1.5 text-[10px] font-medium text-zinc-500 uppercase tracking-wider">
									{group.label}
								</div>
								<div className="space-y-0.5">
									{group.items.map((c) => {
										const isActive = c.id === state.activeId;
										const isHovered = hoveredId === c.id;

										return (
											<div
												key={c.id}
												className={`
													group relative flex items-center gap-3 rounded-xl px-3 py-2.5
													cursor-pointer transition-all duration-200
													${isActive
														? "bg-white/[0.05] border border-white/[0.10]"
														: "hover:bg-white/[0.04] border border-transparent"
													}
												`}
												onMouseEnter={() => setHoveredId(c.id)}
												onMouseLeave={() => setHoveredId(null)}
												onClick={() => openConversation(c.id)}
											>
												<div className="flex-shrink-0 w-8 h-8 rounded-lg flex items-center justify-center bg-white/[0.03]">
													<Icons.chat className={`w-4 h-4 ${isActive ? "text-zinc-200" : "text-zinc-500"}`} />
												</div>

												<div className="flex-1 min-w-0">
													<div className={`text-sm font-medium truncate ${isActive ? "text-zinc-100" : "text-zinc-300"}`}>
														{c.title || t(lang, "sidebar.untitled")}
													</div>
													<div className="text-[10px] text-zinc-500 truncate">
														{formatRelativeDate(c.updatedAt, lang, now)} • {messageCountLabel(c.messages.length)}
													</div>
												</div>

												{(isHovered || isActive) && !state.isStreaming && (
													<Button
														variant="ghost"
														size="icon"
														className="flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity w-7 h-7 text-zinc-500 hover:text-red-400 hover:bg-red-500/10"
														onClick={(e) => {
															e.stopPropagation();
																	archiveConversation(c.id);
														}}
													>
														<Icons.trash className="w-3.5 h-3.5" />
													</Button>
												)}
											</div>
										);
									})}
								</div>
							</div>
						))}

						{/* Archived */}
						{(searchQuery.trim().length > 0 || state.conversations.some((c) => c.archivedAt)) && (
							<div>
								<div className="flex items-center justify-between px-3 py-1.5">
									<div className="text-[10px] font-medium text-zinc-500 uppercase tracking-wider">
										{t(lang, "sidebar.archived")}
										{searchQuery.trim().length === 0 && (
											<span className="ml-2 text-zinc-600 normal-case">
												({state.conversations.filter((c) => c.archivedAt).length})
											</span>
										)}
									</div>
									{searchQuery.trim().length === 0 && (
										<button
											type="button"
											onClick={() => setArchivedOpen((v) => !v)}
											className="text-[10px] text-zinc-500 hover:text-zinc-200"
										>
											{archivedOpen ? t(lang, "sidebar.hide") : t(lang, "sidebar.show")}
										</button>
									)}
								</div>

								{(searchQuery.trim().length > 0 || archivedOpen) && (
									<div className="space-y-0.5">
										{(searchQuery.trim().length > 0 ? filteredArchived : state.conversations.filter((c) => c.archivedAt))
											.sort((a, b) => b.updatedAt - a.updatedAt)
											.slice(0, searchQuery.trim().length > 0 ? 50 : 15)
											.map((c) => {
												const isActive = c.id === state.activeId;
												const isHovered = hoveredId === c.id;
												return (
													<div
														key={c.id}
														className={`
															group relative flex items-center gap-3 rounded-xl px-3 py-2.5
															cursor-pointer transition-all duration-200
															${isActive
																? "bg-white/[0.05] border border-white/[0.10]"
																: "hover:bg-white/[0.04] border border-transparent"
														}
													`}
													onMouseEnter={() => setHoveredId(c.id)}
													onMouseLeave={() => setHoveredId(null)}
													onClick={() => {
														restoreConversation(c.id);
													openConversation(c.id);
													}}
												>
														<div className="flex-shrink-0 w-8 h-8 rounded-lg flex items-center justify-center bg-white/[0.03]">
															<Icons.chat className={`w-4 h-4 ${isActive ? "text-zinc-200" : "text-zinc-600"}`} />
														</div>

														<div className="flex-1 min-w-0">
															<div className={`text-sm font-medium truncate ${isActive ? "text-zinc-100" : "text-zinc-400"}`}>
																{c.title || t(lang, "sidebar.untitled")}
															</div>
															<div className="text-[10px] text-zinc-600 truncate">
																{formatRelativeDate(c.updatedAt, lang, now)} • {messageCountLabel(c.messages.length)}
															</div>
														</div>

														{(isHovered || isActive) && !state.isStreaming && (
															<Button
																variant="ghost"
																size="icon"
																className="flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity w-7 h-7 text-zinc-500 hover:text-emerald-300 hover:bg-emerald-500/10"
																onClick={(e) => {
																	e.stopPropagation();
																	restoreConversation(c.id);
																	setActive(c.id);
																}}
																title={t(lang, "actions.restore")}
															>
																<Icons.arrowLeft className="w-3.5 h-3.5" />
															</Button>
														)}
													</div>
												);
											})}
									</div>
								)}
							</div>
						)}
					</div>
				)}
			</div>

			{/* Footer */}
			<div className="flex-shrink-0 p-3 border-t border-white/[0.04]">
				<Button
					variant="ghost"
					size="sm"
					disabled={state.isStreaming}
					className="w-full justify-start text-red-300/80 hover:text-red-200 hover:bg-red-500/10"
					onClick={() => setConfirmArchiveAllOpen(true)}
				>
					<Icons.trash className="w-4 h-4" />
					{t(lang, "actions.deleteAll")}
				</Button>

				<Button
					variant="ghost"
					size="sm"
					className="w-full justify-start text-zinc-400"
					onClick={() => {
						router.push("/usages");
					}}
				>
					<Icons.sparkles className="w-4 h-4" />
					{t(lang, "actions.usages")}
				</Button>
				
				<Button
					variant="ghost"
					size="sm"
					className="w-full justify-start text-zinc-400"
					onClick={() => {
						router.push("/settings");
					}}
				>
					<Icons.settings className="w-4 h-4" />
					{t(lang, "actions.settings")}
				</Button>
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
		</aside>
	);
}
