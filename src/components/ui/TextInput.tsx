import React from "react";

type Props = React.InputHTMLAttributes<HTMLInputElement> & {
	variant?: "default" | "ghost";
};

export function TextInput({ className, variant = "default", ...props }: Props) {
	const baseClasses = `
		w-full text-sm text-zinc-100 placeholder-zinc-500
		outline-none focus-visible:outline-none transition-all duration-150
		disabled:opacity-50 disabled:cursor-not-allowed
	`;
	
	const variants = {
		default: `
			h-10 px-4 rounded-xl
			bg-white/[0.03] backdrop-blur-sm
			border border-white/[0.08]
			focus:bg-white/[0.05]
		`,
		ghost: `
			h-9 px-3 rounded-lg
			bg-transparent
			border border-transparent
			hover:bg-white/[0.03]
			focus:bg-white/[0.05]
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
				`w-full text-sm text-zinc-100 placeholder-zinc-500
				outline-none focus:outline-none focus-visible:outline-none transition-all duration-150
				disabled:opacity-50 disabled:cursor-not-allowed
				px-4 py-3 rounded-xl resize-none
				bg-white/[0.03] backdrop-blur-sm
				border border-white/[0.08]
				focus:bg-white/[0.05]`,
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
