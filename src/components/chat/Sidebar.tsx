"use client";

import { usePathname, useRouter } from "next/navigation";
import { Button, Icons, SearchBar, Spinner } from "@/components/ui";
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

	const isMobile = () => {
		if (typeof window === "undefined") return false;
		return window.matchMedia?.("(max-width: 767px)")?.matches ?? false;
	};
	const closeOnMobile = () => {
		if (state.sidebarOpen && isMobile()) toggleSidebar();
	};

	const openConversation = (id: string) => {
		setActive(id);
		if (pathname !== "/") router.push("/");
		closeOnMobile();
	};

	const goTo = (href: string) => {
		router.push(href);
		closeOnMobile();
	};

	const isPathActive = (href: string) => {
		if (href === "/") return pathname === "/";
		return pathname?.startsWith(href);
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
		<>
			{state.sidebarOpen ? (
				<div
					className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm md:hidden"
					onClick={toggleSidebar}
				/>
			) : null}

			<aside
				className={`
					fixed inset-y-0 left-0 z-50 w-[340px]
					bg-zinc-950 border-r border-white/[0.06]
					transition-all duration-300 ease-out
					${state.sidebarOpen ? "translate-x-0" : "-translate-x-full"}
					md:relative md:translate-x-0
					${state.sidebarOpen ? "md:w-[340px]" : "md:w-0 md:overflow-hidden"}
				`}
				aria-label="Sidebar"
			>
				<div className="flex h-full flex-col">
					{/* Top */}
					<div className="sticky top-0 z-10 border-b border-white/[0.06] bg-zinc-950/85 backdrop-blur">
						<div className="p-4">
							<div className="flex items-center justify-between">
								<div className="flex items-center gap-3 min-w-0">
									<Icons.greg className="w-9 h-9" />
									<div className="min-w-0">
										<div className="text-sm font-semibold text-zinc-100 truncate">{t(lang, "app.name")}</div>
										<div className="text-[10px] text-zinc-500 uppercase tracking-wider truncate">{t(lang, "app.subtitle")}</div>
									</div>
								</div>
								<Button
									variant="ghost"
									size="icon"
									onClick={toggleSidebar}
									className="md:hidden text-zinc-400 hover:text-zinc-100"
									title={t(lang, "actions.close")}
								>
									<Icons.close className="w-4 h-4" />
								</Button>
							</div>

							{/* Nav */}
							<div className="mt-4 grid grid-cols-3 rounded-2xl border border-white/[0.08] bg-white/[0.03] p-1">
								<button
									type="button"
									onClick={() => goTo("/")}
									className={`h-9 rounded-xl text-xs font-medium transition-colors flex items-center justify-center gap-2 ${
										isPathActive("/") ? "bg-white/[0.10] text-zinc-100" : "text-zinc-400 hover:text-zinc-200"
									}`}
									title={t(lang, "actions.chat")}
								>
									<Icons.chat className="w-4 h-4" />
									<span className="hidden sm:inline">{t(lang, "actions.chat")}</span>
								</button>
								<button
									type="button"
									onClick={() => goTo("/usages")}
									className={`h-9 rounded-xl text-xs font-medium transition-colors flex items-center justify-center gap-2 ${
										isPathActive("/usages") ? "bg-white/[0.10] text-zinc-100" : "text-zinc-400 hover:text-zinc-200"
									}`}
									title={t(lang, "actions.usages")}
								>
									<Icons.sparkles className="w-4 h-4" />
									<span className="hidden sm:inline">{t(lang, "actions.usages")}</span>
								</button>
								<button
									type="button"
									onClick={() => goTo("/settings")}
									className={`h-9 rounded-xl text-xs font-medium transition-colors flex items-center justify-center gap-2 ${
										isPathActive("/settings") ? "bg-white/[0.10] text-zinc-100" : "text-zinc-400 hover:text-zinc-200"
									}`}
									title={t(lang, "actions.settings")}
								>
									<Icons.settings className="w-4 h-4" />
									<span className="hidden sm:inline">{t(lang, "actions.settings")}</span>
								</button>
							</div>

							{/* Primary action */}
							<Button
								className="w-full mt-4"
								variant="gradient"
								onClick={() => {
									createConversation(active.model);
									if (pathname !== "/") router.push("/");
									closeOnMobile();
								}}
								disabled={false}
							>
								<Icons.plus className="w-4 h-4" />
								{t(lang, "actions.newChat")}
							</Button>

							<div className="mt-3">
								<SearchBar
									value={searchQuery}
									onChange={setSearchQuery}
									placeholder={t(lang, "sidebar.searchPlaceholder")}
								/>
							</div>
						</div>
					</div>

					{/* Content */}
					<div className="flex-1 overflow-auto p-3 scrollbar-thin scrollbar-track-transparent scrollbar-thumb-white/10 hover:scrollbar-thumb-white/20">
						{filteredVisible.length === 0 && filteredArchived.length === 0 ? (
							<div className="flex flex-col items-center justify-center py-14 px-4 text-center">
								<Icons.chat className="w-12 h-12 text-zinc-700 mb-3" />
								<p className="text-sm text-zinc-500">
									{searchQuery ? t(lang, "sidebar.emptySearch") : t(lang, "sidebar.empty")}
								</p>
							</div>
						) : (
							<div className="space-y-5">
								{groupedConversations.map((group) => (
									<div key={group.label}>
										<div className="px-1 py-2 text-[10px] font-semibold text-zinc-500 uppercase tracking-widest">
											{group.label}
										</div>
										<div className="space-y-2">
											{group.items.map((c) => {
												const isActive = c.id === state.activeId;
												const isHovered = hoveredId === c.id;
												const isStreamingThis = state.isStreaming && state.streamingConversationId === c.id;

												return (
													<div
														key={c.id}
														onMouseEnter={() => setHoveredId(c.id)}
														onMouseLeave={() => setHoveredId(null)}
														onClick={() => openConversation(c.id)}
														className={`group relative rounded-2xl border p-3 cursor-pointer transition-all ${
														isActive
															? "border-white/[0.14] bg-white/[0.06]"
															: "border-white/[0.06] bg-white/[0.02] hover:bg-white/[0.04] hover:border-white/[0.10]"
													}`}
												>
													<div
														className={`absolute left-0 top-3 bottom-3 w-1 rounded-r ${
															isActive ? "bg-emerald-400/50" : "bg-transparent group-hover:bg-white/10"
														}`}
													/>
													<div className="flex items-start gap-3">
														<div className="mt-0.5 flex-shrink-0 w-9 h-9 rounded-xl flex items-center justify-center bg-white/[0.03] border border-white/[0.06]">
															<Icons.chat className={`w-4 h-4 ${isActive ? "text-zinc-200" : "text-zinc-500"}`} />
														</div>
														<div className="flex-1 min-w-0">
															<div className={`text-sm font-semibold truncate ${isActive ? "text-zinc-100" : "text-zinc-200"}`}>
																{c.title || t(lang, "sidebar.untitled")}
															</div>
															<div className="mt-0.5 text-[11px] text-zinc-500 truncate">
																{formatRelativeDate(c.updatedAt, lang, now)} • {messageCountLabel(c.messages.length)}
															</div>
														</div>

														<div className="flex-shrink-0 flex items-center gap-1">
															{isStreamingThis ? (
																<div className="px-2 py-1 rounded-lg border border-white/[0.08] bg-white/[0.03]" title={t(lang, "actions.stop")}>
																	<Spinner size="sm" />
																</div>
															) : null}

															{(isHovered || isActive) && !isStreamingThis ? (
																<Button
																	variant="ghost"
																	size="icon"
																	className="opacity-0 group-hover:opacity-100 transition-opacity w-8 h-8 text-zinc-500 hover:text-red-300 hover:bg-red-500/10"
																	onClick={(e) => {
																	e.stopPropagation();
																	archiveConversation(c.id);
																}}
																	title={t(lang, "actions.archive")}
																>
																	<Icons.trash className="w-4 h-4" />
																</Button>
															) : null}
														</div>
													</div>
												</div>
											);
										})}
										</div>
									</div>
								))}

								{/* Archived */}
								{(searchQuery.trim().length > 0 || state.conversations.some((c) => c.archivedAt)) ? (
									<div>
										<div className="flex items-center justify-between gap-3 pt-2">
											<div className="text-[10px] font-semibold text-zinc-500 uppercase tracking-widest">
												{t(lang, "sidebar.archived")}
												{searchQuery.trim().length === 0 ? (
													<span className="ml-2 text-zinc-600 normal-case">({state.conversations.filter((c) => c.archivedAt).length})</span>
												) : null}
											</div>
											{searchQuery.trim().length === 0 ? (
												<button
													type="button"
													onClick={() => setArchivedOpen((v) => !v)}
													className="inline-flex items-center gap-1 text-[11px] text-zinc-400 hover:text-zinc-200"
												>
													<span>{archivedOpen ? t(lang, "sidebar.hide") : t(lang, "sidebar.show")}</span>
													<Icons.chevronDown className={`w-3.5 h-3.5 transition-transform ${archivedOpen ? "rotate-180" : "rotate-0"}`} />
												</button>
											) : null}
										</div>

									{(searchQuery.trim().length > 0 || archivedOpen) ? (
										<div className="mt-2 space-y-2">
											{(searchQuery.trim().length > 0 ? filteredArchived : state.conversations.filter((c) => c.archivedAt))
												.sort((a, b) => b.updatedAt - a.updatedAt)
												.slice(0, searchQuery.trim().length > 0 ? 50 : 15)
												.map((c) => {
													const isActive = c.id === state.activeId;
													const isHovered = hoveredId === c.id;
													return (
														<div
															key={c.id}
															onMouseEnter={() => setHoveredId(c.id)}
															onMouseLeave={() => setHoveredId(null)}
															onClick={() => {
															restoreConversation(c.id);
															openConversation(c.id);
														}}
															className={`group relative rounded-2xl border p-3 cursor-pointer transition-all ${
															isActive
																? "border-white/[0.14] bg-white/[0.06]"
																: "border-white/[0.06] bg-white/[0.02] hover:bg-white/[0.04] hover:border-white/[0.10]"
														}`}
													>
														<div
															className={`absolute left-0 top-3 bottom-3 w-1 rounded-r ${
																isActive ? "bg-emerald-400/50" : "bg-transparent group-hover:bg-white/10"
															}`}
														/>
														<div className="flex items-start gap-3">
															<div className="mt-0.5 flex-shrink-0 w-9 h-9 rounded-xl flex items-center justify-center bg-white/[0.03] border border-white/[0.06]">
																<Icons.chat className={`w-4 h-4 ${isActive ? "text-zinc-200" : "text-zinc-600"}`} />
															</div>
															<div className="flex-1 min-w-0">
																<div className={`text-sm font-semibold truncate ${isActive ? "text-zinc-100" : "text-zinc-300"}`}>
																	{c.title || t(lang, "sidebar.untitled")}
																</div>
																<div className="mt-0.5 text-[11px] text-zinc-600 truncate">
																	{formatRelativeDate(c.updatedAt, lang, now)} • {messageCountLabel(c.messages.length)}
																</div>
															</div>
															{(isHovered || isActive) && !state.isStreaming ? (
																<Button
																	variant="ghost"
																	size="icon"
																	className="opacity-0 group-hover:opacity-100 transition-opacity w-8 h-8 text-zinc-500 hover:text-emerald-300 hover:bg-emerald-500/10"
																	onClick={(e) => {
																	e.stopPropagation();
																	restoreConversation(c.id);
																	setActive(c.id);
																}}
																	title={t(lang, "actions.restore")}
																>
																	<Icons.arrowLeft className="w-4 h-4" />
																</Button>
															) : null}
														</div>
													</div>
												);
											})}
										</div>
									) : null}
								</div>
							) : null}
						</div>
					)}
					</div>

					{/* Bottom */}
					<div className="flex-shrink-0 p-4 border-t border-white/[0.06]">
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
					</div>
				</div>

				{/* Confirm archive all modal */}
				{confirmArchiveAllOpen ? (
					<div className="fixed inset-0 z-[60] flex items-center justify-center">
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
				) : null}
			</aside>
		</>
	);
}
