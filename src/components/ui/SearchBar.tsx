"use client";

import React, { useState, useRef } from "react";

type SearchBarProps = {
	value: string;
	onChange: (value: string) => void;
	placeholder?: string;
	className?: string;
};

export function SearchBar({ value, onChange, placeholder, className = "" }: SearchBarProps) {
	const inputRef = useRef<HTMLInputElement>(null);
	const [isFocused, setIsFocused] = useState(false);

	return (
		<div 
			className={`relative group ${className}`}
			onClick={() => inputRef.current?.focus()}
		>
			<div className={`
				relative flex items-center gap-3 rounded-[var(--radius-lg)] px-4 py-3
				bg-[rgba(255,255,255,0.02)]
				border transition-all duration-200 ease-out
				${isFocused 
					? "border-[var(--accent-cyan)]/40 bg-[rgba(255,255,255,0.04)] shadow-[0_0_0_3px_var(--accent-cyan-glow)]" 
					: "border-[var(--glass-border)] hover:border-[var(--glass-border-hover)] hover:bg-[rgba(255,255,255,0.03)]"
				}
			`}>
				
				<svg 
					className={`w-4 h-4 transition-all duration-200 flex-shrink-0 ${
						isFocused ? "text-[var(--accent-cyan)]" : "text-[var(--text-subtle)]"
					}`}
					fill="none" 
					viewBox="0 0 24 24" 
					stroke="currentColor"
					strokeWidth={2}
				>
					<circle cx="11" cy="11" r="7" />
					<path strokeLinecap="round" d="M21 21l-4.35-4.35" />
				</svg>
				
				<input
					ref={inputRef}
					type="text"
					value={value}
					onChange={(e) => onChange(e.target.value)}
					onFocus={() => setIsFocused(true)}
					onBlur={() => setIsFocused(false)}
					placeholder={placeholder ?? ""}
					className="flex-1 bg-transparent text-[14px] text-[var(--text-primary)] placeholder-[var(--text-subtle)] outline-none min-w-0"
				/>
				
				{value && (
					<button
						onClick={(e) => {
							e.stopPropagation();
							onChange("");
							inputRef.current?.focus();
						}}
						className="p-1.5 rounded-[var(--radius-sm)] hover:bg-[rgba(255,255,255,0.08)] transition-all duration-200 flex-shrink-0 text-[var(--text-subtle)] hover:text-[var(--text-primary)]"
					>
						<svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
							<path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
						</svg>
					</button>
				)}
			</div>
		</div>
	);
}
