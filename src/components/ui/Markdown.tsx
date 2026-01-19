"use client";

import React from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

export function Markdown({ content }: { content: string }) {
	return (
		<div className="greg-markdown">
			<ReactMarkdown
				remarkPlugins={[remarkGfm]}
				components={{
					p: ({ children, ...props }) => <p {...props}>{children}</p>,
					pre: ({ children, ...props }) => (
						<pre
							{...props}
							className="greg-md-pre"
						>
							{children}
						</pre>
					),
					code: ({ children, className, ...props }) => {
						const isBlock = typeof className === "string" && className.includes("language-");
						return isBlock ? (
							<code {...props} className={"greg-md-code-block " + (className ?? "")}>
								{children}
							</code>
						) : (
							<code {...props} className="greg-md-code-inline">
								{children}
							</code>
						);
					},
					a: ({ children, href, ...props }) => (
						<a
							{...props}
							href={href}
							target="_blank"
							rel="noreferrer"
							className="greg-md-link"
						>
							{children}
						</a>
					),
					ul: ({ children, ...props }) => (
						<ul {...props} className="greg-md-ul">
							{children}
						</ul>
					),
					ol: ({ children, ...props }) => (
						<ol {...props} className="greg-md-ol">
							{children}
						</ol>
					),
					blockquote: ({ children, ...props }) => (
						<blockquote {...props} className="greg-md-quote">
							{children}
						</blockquote>
					),
				}}
			>
				{content}
			</ReactMarkdown>
		</div>
	);
}
