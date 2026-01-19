"use client";

import React from "react";

type SkeletonProps = {
	className?: string;
	variant?: "text" | "circular" | "rectangular";
	width?: string | number;
	height?: string | number;
	lines?: number;
};

export function Skeleton({ 
	className = "", 
	variant = "rectangular",
	width,
	height,
	lines = 1,
}: SkeletonProps) {
	const baseClasses = "animate-pulse bg-white/[0.06]";
	
	const variantClasses = {
		text: "h-4 rounded",
		circular: "rounded-full",
		rectangular: "rounded-lg",
	};

	const style: React.CSSProperties = {
		width: width ?? "100%",
		height: height ?? (variant === "text" ? "1rem" : variant === "circular" ? width ?? "2.5rem" : "100%"),
	};

	if (variant === "text" && lines > 1) {
		return (
			<div className={`space-y-2 ${className}`}>
				{Array.from({ length: lines }).map((_, i) => (
					<div
						key={i}
						className={`${baseClasses} ${variantClasses.text}`}
						style={{
							...style,
							width: i === lines - 1 ? "75%" : "100%",
						}}
					/>
				))}
			</div>
		);
	}

	return (
		<div
			className={`${baseClasses} ${variantClasses[variant]} ${className}`}
			style={style}
		/>
	);
}

export function MessageSkeleton() {
	return (
		<div className="flex gap-3 animate-in fade-in duration-300">
			<div className="flex-shrink-0">
				<Skeleton variant="circular" width={40} height={40} />
			</div>
			<div className="flex-1 space-y-2 pt-1">
				<Skeleton variant="text" width={120} height={14} />
				<Skeleton variant="text" lines={3} />
			</div>
		</div>
	);
}

export function ConversationSkeleton() {
	return (
		<div className="space-y-2 p-2">
			{Array.from({ length: 5 }).map((_, i) => (
				<div key={i} className="flex items-center gap-3 rounded-xl p-3">
					<Skeleton variant="circular" width={32} height={32} />
					<div className="flex-1 space-y-1.5">
						<Skeleton variant="text" width="70%" height={12} />
						<Skeleton variant="text" width="40%" height={10} />
					</div>
				</div>
			))}
		</div>
	);
}
