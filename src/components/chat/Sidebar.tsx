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
					className="fixed inset-0 z-40 bg-black/70 backdrop-blur-md md:hidden animate-fade-in"
					onClick={toggleSidebar}
				/>
			) : null}

			<aside
				className={`
					fixed inset-y-0 left-0 z-50 w-[280px]
					glass-strong
					transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)]
					${state.sidebarOpen ? "translate-x-0" : "-translate-x-full"}
					md:relative md:translate-x-0
					${state.sidebarOpen ? "md:w-[280px]" : "md:w-0 md:overflow-hidden"}
				`}
				aria-label="Sidebar"
			>
				<div className="flex h-full flex-col">
					
					<div className="sticky top-0 z-10 glass-strong border-b border-[var(--glass-border)]">
						<div className="p-[var(--space-lg)]">
							
							<div className="flex items-center justify-between">
								<div className="flex items-center gap-3.5 min-w-0">
									<div className="relative">
										<div className="relative w-11 h-11 rounded-[var(--radius-xl)] bg-[var(--glass-bg)] border border-[var(--glass-border)] flex items-center justify-center shadow-[var(--shadow-sm)]">
											<Icons.greg className="w-7 h-7 text-[var(--text-primary)]" />
										</div>
									</div>
									<div className="min-w-0">
										<div className="text-[15px] font-semibold text-[var(--text-primary)] tracking-tight truncate">{t(lang, "app.name")}</div>
										<div className="text-[10px] text-[var(--text-subtle)] uppercase tracking-[0.2em] truncate font-medium">{t(lang, "app.subtitle")}</div>
									</div>
								</div>
								<Button
									variant="ghost"
									size="icon"
									onClick={toggleSidebar}
									className="md:hidden text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[rgba(255,255,255,0.06)]"
									title={t(lang, "actions.close")}
								>
									<Icons.close className="w-4 h-4" />
								</Button>
							</div>

							
							<div className="mt-5 flex gap-1 p-1 rounded-[var(--radius-xl)] bg-[rgba(255,255,255,0.03)] border border-[var(--border-subtle)]">
								{[
									{ href: "/", icon: Icons.chat, label: t(lang, "actions.chat") },
									{ href: "/usages", icon: Icons.sparkles, label: t(lang, "actions.usages") },
									{ href: "/settings", icon: Icons.settings, label: t(lang, "actions.settings") },
								].map((item) => {
									const isActive = isPathActive(item.href);
									return (
										<button
											key={item.href}
											type="button"
											onClick={() => goTo(item.href)}
											className={`
												flex-1 h-9 rounded-[10px] text-[12px] font-medium transition-all duration-200
												flex items-center justify-center gap-2
												${isActive 
													? "bg-[rgba(255,255,255,0.06)] text-[var(--text-primary)] border border-[var(--glass-border-hover)] shadow-sm" 
													: "text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[rgba(255,255,255,0.04)]"
												}
											`}
											title={item.label}
										>
											<item.icon className="w-4 h-4" />
											<span className="hidden sm:inline">{item.label}</span>
										</button>
									);
								})}
							</div>

							
							<Button
								className="w-full mt-4 group"
								variant="accent"
								size="sm"
								onClick={() => {
									createConversation(active.model);
									if (pathname !== "/") router.push("/");
									closeOnMobile();
								}}
							>
								<Icons.plus className="w-4 h-4 transition-transform group-hover:rotate-90 duration-300" />
								{t(lang, "actions.newChat")}
							</Button>

							
							<div className="mt-4">
								<SearchBar
									value={searchQuery}
									onChange={setSearchQuery}
									placeholder={t(lang, "sidebar.searchPlaceholder")}
								/>
							</div>
						</div>
					</div>

					
					<div className="flex-1 overflow-auto px-3 py-2 scrollbar-premium">
						{filteredVisible.length === 0 && filteredArchived.length === 0 ? (
							<div className="flex flex-col items-center justify-center py-16 px-4 text-center animate-fade-up">
<div className="w-16 h-16 rounded-[var(--radius-2xl)] bg-[rgba(255,255,255,0.03)] border border-[var(--glass-border)] flex items-center justify-center mb-4 shadow-[var(--shadow-sm)]">
										<Icons.chat className="w-7 h-7 text-[var(--text-subtle)]" />
									</div>
									<p className="text-[13px] text-[var(--text-muted)] max-w-[200px]">
									{searchQuery ? t(lang, "sidebar.emptySearch") : t(lang, "sidebar.empty")}
								</p>
							</div>
						) : (
							<div className="space-y-6 stagger-children">
								{groupedConversations.map((group) => (
									<div key={group.label}>
										<div className="px-2 py-2.5 text-[10px] font-semibold text-[var(--text-subtle)] uppercase tracking-[0.15em]">
											{group.label}
										</div>
										<div className="space-y-1">
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
														className={`
															group relative rounded-[12px] p-3 cursor-pointer
															transition-all duration-200 ease-out
															${isActive
																? "bg-[rgba(255,255,255,0.06)] border border-[var(--glass-border-hover)] shadow-sm"
																: "hover:bg-[rgba(255,255,255,0.04)] border border-transparent hover:border-[var(--glass-border)]"
															}
														`}
													>
														
														<div
															className={`
																absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-7 rounded-r-full
																transition-all duration-300
																${isActive 
																	? "bg-[var(--accent-cyan)] opacity-100" 
																	: "opacity-0 group-hover:opacity-40 group-hover:bg-[var(--accent-cyan)]"
																}
															`}
														/>
														
														<div className="flex items-start gap-3 pl-2">
															
															<div className={`
																mt-0.5 flex-shrink-0 w-8 h-8 rounded-[10px] flex items-center justify-center
																transition-all duration-200
																${isActive 
																	? "bg-[var(--accent-cyan-glow)] border border-[rgba(0,212,255,0.2)]" 
																	: "bg-[rgba(255,255,255,0.04)] border border-[var(--glass-border)] group-hover:border-[var(--glass-border-hover)]"
																}
															`}>
																<Icons.chat className={`w-3.5 h-3.5 transition-colors ${isActive ? "text-[var(--accent-cyan)]" : "text-[var(--text-muted)] group-hover:text-[var(--text-secondary)]"}`} />
															</div>
															
															
															<div className="flex-1 min-w-0">
																<div className={`text-[13px] font-medium truncate transition-colors ${isActive ? "text-[var(--text-primary)]" : "text-[var(--text-secondary)] group-hover:text-[var(--text-primary)]"}`}>
																	{c.title || t(lang, "sidebar.untitled")}
																</div>
																<div className="mt-0.5 text-[11px] text-[var(--text-subtle)] truncate">
																	{formatRelativeDate(c.updatedAt, lang, now)} • {messageCountLabel(c.messages.length)}
																</div>
															</div>

															
															<div className="flex-shrink-0 flex items-center gap-1">
																	{isStreamingThis ? (
																		<div className="px-2 py-1 rounded-[var(--radius-lg)] bg-[var(--accent-cyan-glow)] border border-[rgba(0,212,255,0.2)]">
																		<Spinner size="sm" />
																	</div>
																) : null}

																{(isHovered || isActive) && !isStreamingThis ? (
																	<Button
																		variant="ghost"
																		size="icon"
																		className="opacity-0 group-hover:opacity-100 transition-all w-7 h-7 text-[var(--text-subtle)] hover:text-[var(--accent-red)] hover:bg-[var(--accent-red-glow)]"
																		onClick={(e) => {
																			e.stopPropagation();
																			archiveConversation(c.id);
																		}}
																		title={t(lang, "actions.archive")}
																	>
																		<Icons.trash className="w-3.5 h-3.5" />
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

								
								{(searchQuery.trim().length > 0 || state.conversations.some((c) => c.archivedAt)) ? (
									<div className="pt-2">
										<div className="flex items-center justify-between gap-3 px-2 py-2">
											<div className="text-[10px] font-semibold text-[var(--text-subtle)] uppercase tracking-[0.15em]">
												{t(lang, "sidebar.archived")}
												{searchQuery.trim().length === 0 ? (
													<span className="ml-2 text-[var(--text-subtle)] normal-case font-normal">({state.conversations.filter((c) => c.archivedAt).length})</span>
												) : null}
											</div>
											{searchQuery.trim().length === 0 ? (
												<button
													type="button"
													onClick={() => setArchivedOpen((v) => !v)}
													className="inline-flex items-center gap-1.5 text-[11px] text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors"
												>
													<span>{archivedOpen ? t(lang, "sidebar.hide") : t(lang, "sidebar.show")}</span>
													<Icons.chevronDown className={`w-3.5 h-3.5 transition-transform duration-200 ${archivedOpen ? "rotate-180" : "rotate-0"}`} />
												</button>
											) : null}
										</div>

										{(searchQuery.trim().length > 0 || archivedOpen) ? (
											<div className="mt-1 space-y-1">
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
																className={`
																	group relative rounded-[12px] p-3 cursor-pointer
																	transition-all duration-200 ease-out opacity-60 hover:opacity-100
																	${isActive
																		? "bg-[rgba(255,255,255,0.04)] border border-[rgba(255,255,255,0.06)]"
																		: "hover:bg-[rgba(255,255,255,0.03)] border border-transparent"
																	}
																`}
															>
																<div className="flex items-start gap-3 pl-2">
																	<div className="mt-0.5 flex-shrink-0 w-8 h-8 rounded-[var(--radius-lg)] flex items-center justify-center bg-[rgba(255,255,255,0.03)] border border-[var(--border-subtle)]">
																		<Icons.chat className="w-3.5 h-3.5 text-[var(--text-subtle)]" />
																	</div>
																	<div className="flex-1 min-w-0">
																		<div className="text-[13px] font-medium truncate text-[var(--text-muted)] group-hover:text-[var(--text-secondary)]">
																			{c.title || t(lang, "sidebar.untitled")}
																		</div>
																		<div className="mt-0.5 text-[11px] text-[var(--text-subtle)] truncate">
																			{formatRelativeDate(c.updatedAt, lang, now)} • {messageCountLabel(c.messages.length)}
																		</div>
																	</div>
																	{(isHovered || isActive) && !state.isStreaming ? (
																		<Button
																			variant="ghost"
																			size="icon"
																			className="opacity-0 group-hover:opacity-100 transition-all w-7 h-7 text-[var(--text-subtle)] hover:text-[var(--accent-green)] hover:bg-[var(--accent-green-glow)]"
																			onClick={(e) => {
																				e.stopPropagation();
																				restoreConversation(c.id);
																				setActive(c.id);
																			}}
																			title={t(lang, "actions.restore")}
																		>
																			<Icons.arrowLeft className="w-3.5 h-3.5" />
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

					
					<div className="flex-shrink-0 p-4 border-t border-[var(--divider)]">
						<Button
							variant="ghost"
							size="sm"
							disabled={state.isStreaming}
							className="w-full justify-start text-[var(--text-subtle)] hover:text-[var(--accent-red)] hover:bg-[var(--accent-red-glow)]"
							onClick={() => setConfirmArchiveAllOpen(true)}
						>
							<Icons.trash className="w-4 h-4" />
							{t(lang, "actions.deleteAll")}
						</Button>
					</div>
				</div>

				
				{confirmArchiveAllOpen ? (
					<div className="fixed inset-0 z-[60] flex items-center justify-center animate-fade-in">
						<div
							className="absolute inset-0 bg-black/80 backdrop-blur-xl"
							onClick={() => setConfirmArchiveAllOpen(false)}
						/>
						<div className="relative w-full max-w-md mx-4 rounded-[var(--radius-2xl)] glass-strong shadow-[var(--shadow-xl)] p-6 animate-scale-in">
							<div className="relative">
								<div className="flex items-start gap-4">
<div className="w-12 h-12 rounded-[var(--radius-xl)] bg-[var(--accent-red-glow)] border border-[rgba(255,69,58,0.2)] flex items-center justify-center flex-shrink-0">
											<Icons.trash className="w-5 h-5 text-[var(--accent-red)]" />
									</div>
									<div>
<div className="text-[16px] font-semibold text-[var(--text-primary)]">{t(lang, "settings.archiveAll.confirmTitle")}</div>
												<div className="text-[13px] text-[var(--text-muted)] mt-1.5 leading-relaxed">{t(lang, "settings.archiveAll.confirmBody")}</div>
									</div>
								</div>
								<div className="flex items-center justify-end gap-3 mt-8">
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
					</div>
				) : null}
			</aside>
		</>
	);
}
