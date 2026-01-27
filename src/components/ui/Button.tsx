import React from "react";

type Props = React.ButtonHTMLAttributes<HTMLButtonElement> & {
	variant?: "primary" | "secondary" | "ghost" | "danger" | "accent";
	size?: "xs" | "sm" | "md" | "lg" | "icon";
};

const base = `
	relative inline-flex items-center justify-center font-medium 
	transition-all duration-200 ease-out
	disabled:opacity-40 disabled:pointer-events-none disabled:cursor-not-allowed
	focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-cyan)]/30 focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--bg-base)]
`;

const variants: Record<NonNullable<Props["variant"]>, string> = {
	primary: `
		bg-gradient-to-b from-[var(--accent-orange-hover)] to-[var(--accent-orange)] text-[#0F0F11] font-semibold
		shadow-[0_2px_8px_var(--accent-orange-glow),inset_0_1px_0_rgba(255,255,255,0.2)]
		hover:shadow-[0_4px_16px_var(--accent-orange-glow),inset_0_1px_0_rgba(255,255,255,0.25)]
		hover:brightness-110
		active:scale-[0.98]
	`,
	accent: `
		bg-gradient-to-b from-[var(--accent-cyan)] to-[var(--accent-cyan-alt)] text-[#0F0F11] font-semibold
		shadow-[0_2px_8px_var(--accent-cyan-glow),inset_0_1px_0_rgba(255,255,255,0.2)]
		hover:shadow-[0_4px_16px_var(--accent-cyan-glow),inset_0_1px_0_rgba(255,255,255,0.25)]
		hover:brightness-110
		active:scale-[0.98]
	`,
	secondary: `
		bg-[rgba(255,255,255,0.04)] text-[var(--text-secondary)] border border-[var(--glass-border)]
		shadow-[var(--shadow-xs)]
		hover:bg-[rgba(255,255,255,0.08)] hover:border-[var(--glass-border-hover)] hover:text-[var(--text-primary)]
		active:scale-[0.98]
	`,
	ghost: `
		bg-transparent text-[var(--text-muted)]
		hover:bg-[rgba(255,255,255,0.06)] hover:text-[var(--text-primary)]
		active:bg-[rgba(255,255,255,0.08)]
	`,
	danger: `
		bg-[var(--accent-red-glow)] text-[var(--accent-red)] border border-[rgba(255,69,58,0.2)]
		hover:bg-[rgba(255,69,58,0.2)] hover:border-[rgba(255,69,58,0.3)]
		active:scale-[0.98]
	`,
};

const sizes: Record<NonNullable<Props["size"]>, string> = {
	xs: "h-7 px-2.5 text-xs rounded-[var(--radius-sm)] gap-1.5",
	sm: "h-9 px-4 text-[13px] rounded-[var(--radius-md)] gap-2",
	md: "h-10 px-5 text-sm rounded-[var(--radius-lg)] gap-2",
	lg: "h-12 px-6 text-[15px] rounded-[var(--radius-xl)] gap-2.5",
	icon: "h-10 w-10 rounded-[var(--radius-lg)]",
};

export function Button({
	className,
	variant = "primary",
	size = "md",
	...props
}: Props) {
	return (
		<button
			className={[base, variants[variant], sizes[size], className]
				.filter(Boolean)
				.join(" ")
				.replace(/\s+/g, " ")
				.trim()}
			{...props}
		/>
	);
}
