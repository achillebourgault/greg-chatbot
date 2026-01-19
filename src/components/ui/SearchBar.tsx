"use client";

import React, { useState, useRef } from "react";

type SearchBarProps = {
	value: string;
	onChange: (value: string) => void;
	placeholder?: string;
	className?: string;
};

export function SearchBar({ value, onChange, placeholder = "Rechercher...", className = "" }: SearchBarProps) {
	const inputRef = useRef<HTMLInputElement>(null);
	const [isFocused, setIsFocused] = useState(false);

	return (
		<div 
			className={`relative group ${className}`}
			onClick={() => inputRef.current?.focus()}
		>
			<div className={`
				relative flex items-center gap-3 rounded-xl px-3.5 py-2
				bg-white/[0.03]
				border border-white/[0.06] 
				transition-all duration-150
				${isFocused 
					? "border-white/[0.15] bg-white/[0.05]" 
					: "hover:border-white/[0.1] hover:bg-white/[0.04]"
				}
			`}>
				<svg 
					className={`w-4 h-4 transition-colors duration-150 ${isFocused ? "text-zinc-300" : "text-zinc-500"}`}
					fill="none" 
					viewBox="0 0 24 24" 
					stroke="currentColor"
				>
					<path 
						strokeLinecap="round" 
						strokeLinejoin="round" 
						strokeWidth={2} 
						d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" 
					/>
				</svg>
				
				<input
					ref={inputRef}
					type="text"
					value={value}
					onChange={(e) => onChange(e.target.value)}
					onFocus={() => setIsFocused(true)}
					onBlur={() => setIsFocused(false)}
					placeholder={placeholder}
					className="flex-1 bg-transparent text-sm text-zinc-100 placeholder-zinc-500 outline-none"
				/>
				
				{value && (
					<button
						onClick={(e) => {
							e.stopPropagation();
							onChange("");
							inputRef.current?.focus();
						}}
						className="p-1 rounded-full hover:bg-white/10 transition-colors"
					>
						<svg className="w-3.5 h-3.5 text-zinc-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
							<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
						</svg>
					</button>
				)}
			</div>
		</div>
	);
}
