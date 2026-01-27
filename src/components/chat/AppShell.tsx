"use client";

import { ChatProvider } from "@/stores/chat-store";
import { Sidebar } from "@/components/chat";

export function AppShell({ children }: { children: React.ReactNode }) {
	return (
		<ChatProvider>
			<div className="flex h-screen w-screen overflow-hidden bg-immersive bg-mesh">
				<Sidebar />
				<main className="relative flex h-full flex-1 flex-col min-w-0 z-10">{children}</main>
			</div>
		</ChatProvider>
	);
}
