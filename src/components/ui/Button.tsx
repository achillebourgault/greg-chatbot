import React from "react";

type Props = React.ButtonHTMLAttributes<HTMLButtonElement> & {
	variant?: "primary" | "secondary" | "ghost" | "danger" | "gradient";
	size?: "xs" | "sm" | "md" | "lg" | "icon";
};

const base = `
	relative inline-flex items-center justify-center font-medium 
	transition-all duration-150 ease-out
	disabled:opacity-50 disabled:pointer-events-none disabled:cursor-not-allowed
	focus:outline-none focus-visible:ring-2 focus-visible:ring-white/20 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-950
`;

const variants: Record<NonNullable<Props["variant"]>, string> = {
	primary: `
		bg-zinc-100 text-zinc-950
		hover:bg-white
		active:scale-[0.98]
	`,
	secondary: `
		bg-white/[0.06] text-zinc-100 border border-white/[0.08]
		hover:bg-white/[0.1] hover:border-white/[0.12]
		active:scale-[0.98]
	`,
	ghost: `
		bg-transparent text-zinc-400
		hover:bg-white/[0.06] hover:text-zinc-100
		active:bg-white/[0.08]
	`,
	danger: `
		bg-red-500/10 text-red-400 border border-red-500/20
		hover:bg-red-500/20 hover:border-red-500/30 hover:text-red-300
		active:scale-[0.98]
	`,
	gradient: `
		bg-white/[0.08] text-zinc-100 border border-white/[0.1]
		hover:bg-white/[0.12] hover:border-white/[0.16]
		active:scale-[0.98]
	`,
};

const sizes: Record<NonNullable<Props["size"]>, string> = {
	xs: "h-7 px-2.5 text-xs rounded-lg gap-1.5",
	sm: "h-8 px-3 text-sm rounded-lg gap-2",
	md: "h-10 px-4 text-sm rounded-xl gap-2",
	lg: "h-12 px-6 text-base rounded-xl gap-2.5",
	icon: "h-9 w-9 rounded-xl",
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
