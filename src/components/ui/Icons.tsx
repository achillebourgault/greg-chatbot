"use client";

import React from "react";

// Icons SVG pour l'interface
export const Icons = {
	greg: (props: React.SVGProps<SVGSVGElement>) => (
		<svg viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg" {...props}>
			<defs>
				<linearGradient id="gregGradient" x1="0%" y1="0%" x2="100%" y2="100%">
					<stop offset="0%" stopColor="#10b981" />
					<stop offset="50%" stopColor="#06b6d4" />
					<stop offset="100%" stopColor="#10b981" />
				</linearGradient>
			</defs>
			<circle cx="20" cy="20" r="18" fill="url(#gregGradient)" opacity="0.15" />
			<circle cx="20" cy="20" r="16" stroke="url(#gregGradient)" strokeWidth="1.5" fill="none" />
			<text x="20" y="26" textAnchor="middle" fill="url(#gregGradient)" fontSize="16" fontWeight="bold" fontFamily="system-ui">
				G
			</text>
		</svg>
	),

	user: (props: React.SVGProps<SVGSVGElement>) => (
		<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" {...props}>
			<circle cx="12" cy="8" r="4" fill="currentColor" />
			<path d="M4 20c0-4 4-6 8-6s8 2 8 6" fill="currentColor" />
		</svg>
	),

	send: (props: React.SVGProps<SVGSVGElement>) => (
		<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" {...props}>
			<path d="M22 2L11 13" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
			<path d="M22 2L15 22L11 13L2 9L22 2Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
		</svg>
	),

	stop: (props: React.SVGProps<SVGSVGElement>) => (
		<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" {...props}>
			<rect x="6" y="6" width="12" height="12" rx="2" fill="currentColor" />
		</svg>
	),

	plus: (props: React.SVGProps<SVGSVGElement>) => (
		<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" {...props}>
			<path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
		</svg>
	),

	settings: (props: React.SVGProps<SVGSVGElement>) => (
		<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" {...props}>
			<circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="2" />
			<path d="M12 1v4M12 19v4M4.22 4.22l2.83 2.83M16.95 16.95l2.83 2.83M1 12h4M19 12h4M4.22 19.78l2.83-2.83M16.95 7.05l2.83-2.83" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
		</svg>
	),

	trash: (props: React.SVGProps<SVGSVGElement>) => (
		<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" {...props}>
			<path d="M3 6h18M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2m3 0v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6h14z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
		</svg>
	),

	edit: (props: React.SVGProps<SVGSVGElement>) => (
		<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" {...props}>
			<path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
			<path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
		</svg>
	),

	menu: (props: React.SVGProps<SVGSVGElement>) => (
		<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" {...props}>
			<path d="M3 12h18M3 6h18M3 18h18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
		</svg>
	),

	close: (props: React.SVGProps<SVGSVGElement>) => (
		<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" {...props}>
			<path d="M18 6L6 18M6 6l12 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
		</svg>
	),

	chevronDown: (props: React.SVGProps<SVGSVGElement>) => (
		<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" {...props}>
			<path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
		</svg>
	),

	chat: (props: React.SVGProps<SVGSVGElement>) => (
		<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" {...props}>
			<path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2v10z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
		</svg>
	),

	sparkles: (props: React.SVGProps<SVGSVGElement>) => (
		<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" {...props}>
			<path d="M12 3l1.5 4.5L18 9l-4.5 1.5L12 15l-1.5-4.5L6 9l4.5-1.5L12 3z" fill="currentColor" />
			<path d="M19 13l1 3 3 1-3 1-1 3-1-3-3-1 3-1 1-3z" fill="currentColor" />
			<path d="M5 17l.5 1.5L7 19l-1.5.5L5 21l-.5-1.5L3 19l1.5-.5L5 17z" fill="currentColor" />
		</svg>
	),

	copy: (props: React.SVGProps<SVGSVGElement>) => (
		<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" {...props}>
			<rect x="9" y="9" width="13" height="13" rx="2" stroke="currentColor" strokeWidth="2" />
			<path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" stroke="currentColor" strokeWidth="2" />
		</svg>
	),

	check: (props: React.SVGProps<SVGSVGElement>) => (
		<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" {...props}>
			<path d="M20 6L9 17l-5-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
		</svg>
	),

	arrowLeft: (props: React.SVGProps<SVGSVGElement>) => (
		<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" {...props}>
			<path d="M19 12H5M12 19l-7-7 7-7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
		</svg>
	),

	arrowDown: (props: React.SVGProps<SVGSVGElement>) => (
		<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" {...props}>
			<path d="M12 5v14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
			<path d="M19 12l-7 7-7-7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
		</svg>
	),
};
