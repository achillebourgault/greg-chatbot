import React from "react";

type Props = React.InputHTMLAttributes<HTMLInputElement> & {
	variant?: "default" | "ghost";
};

export function TextInput({ className, variant = "default", ...props }: Props) {
	const baseClasses = `
		w-full text-[14px] text-[var(--text-primary)] placeholder-[var(--text-subtle)]
		outline-none focus-visible:outline-none transition-all duration-200
		disabled:opacity-50 disabled:cursor-not-allowed
	`;
	
	const variants = {
		default: `
			h-11 px-4 rounded-[var(--radius-lg)]
			bg-[rgba(255,255,255,0.02)] backdrop-blur-sm
			border border-[var(--glass-border)]
			hover:bg-[rgba(255,255,255,0.03)] hover:border-[var(--glass-border-hover)]
			focus:bg-[rgba(255,255,255,0.04)]
			focus:border-[var(--accent-cyan)]/40
			focus:shadow-[0_0_0_3px_var(--accent-cyan-glow)]
		`,
		ghost: `
			h-9 px-3 rounded-[var(--radius-md)]
			bg-transparent
			border border-transparent
			hover:bg-[rgba(255,255,255,0.04)]
			focus:bg-[rgba(255,255,255,0.05)]
			focus:border-[var(--glass-border-hover)]
		`,
	};

	return (
		<input
			className={[baseClasses, variants[variant], className]
				.filter(Boolean)
				.join(" ")
				.replace(/\s+/g, " ")
				.trim()}
			{...props}
		/>
	);
}

type TextAreaProps = React.TextareaHTMLAttributes<HTMLTextAreaElement>;

export function TextArea({ className, ...props }: TextAreaProps) {
	return (
		<textarea
			className={[
				`w-full text-[14px] text-[var(--text-primary)] placeholder-[var(--text-subtle)]
				outline-none focus:outline-none focus-visible:outline-none transition-all duration-200
				disabled:opacity-50 disabled:cursor-not-allowed
				px-4 py-3 rounded-[var(--radius-xl)] resize-none
				bg-[rgba(255,255,255,0.02)] backdrop-blur-sm
				border border-[var(--glass-border)]
				hover:bg-[rgba(255,255,255,0.03)] hover:border-[var(--glass-border-hover)]
				focus:bg-[rgba(255,255,255,0.04)]
				focus:border-[var(--accent-cyan)]/40
				focus:shadow-[0_0_0_3px_var(--accent-cyan-glow)]
				scrollbar-premium`,
				className,
			]
				.filter(Boolean)
				.join(" ")
				.replace(/\s+/g, " ")
				.trim()}
			{...props}
		/>
	);
}
