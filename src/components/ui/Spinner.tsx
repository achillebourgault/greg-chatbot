export function Spinner({ className, size = "md" }: { className?: string; size?: "sm" | "md" | "lg" }) {
	const sizes = {
		sm: "h-3 w-3 border",
		md: "h-4 w-4 border-2",
		lg: "h-6 w-6 border-2",
	};
	
	return (
		<div
			className={[
				"animate-spin rounded-full border-emerald-500/20 border-t-emerald-400",
				sizes[size],
				className,
			]
				.filter(Boolean)
				.join(" ")}
		/>
	);
}

export function LoadingDots({ className }: { className?: string }) {
	return (
		<div className={`flex items-center gap-1 ${className ?? ""}`}>
			<span className="h-2 w-2 rounded-full bg-emerald-400 animate-bounce [animation-delay:-0.3s]" />
			<span className="h-2 w-2 rounded-full bg-cyan-400 animate-bounce [animation-delay:-0.15s]" />
			<span className="h-2 w-2 rounded-full bg-emerald-400 animate-bounce" />
		</div>
	);
}
