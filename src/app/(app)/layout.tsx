import { AppShell } from "@/components/chat";

export default function AppLayout({ children }: { children: React.ReactNode }) {
	return <AppShell>{children}</AppShell>;
}
