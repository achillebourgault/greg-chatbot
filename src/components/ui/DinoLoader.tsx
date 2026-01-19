"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";

type Props = {
	className?: string;
	subtitle: string;
};

type ObstacleKind = "cactusTiny" | "cactusSmall" | "cactusBig" | "cactusCluster" | "birdLow" | "birdHigh";
type Obstacle = {
	slot: number;
	kind: ObstacleKind;
	x: number;
	offsetY: number;
	w: number;
	h: number;
};

function runnerSpec(kind: ObstacleKind) {
	switch (kind) {
		case "cactusTiny":
			return { w: 14, h: 26, offsetY: 0, action: "jump" as const, jumpHeight: 56, collides: true };
		case "cactusSmall":
			return { w: 18, h: 34, offsetY: 0, action: "jump" as const, jumpHeight: 64, collides: true };
		case "cactusBig":
			return { w: 26, h: 48, offsetY: 0, action: "jump" as const, jumpHeight: 84, collides: true };
		case "cactusCluster":
			return { w: 44, h: 40, offsetY: 0, action: "jump" as const, jumpHeight: 84, collides: true };
		case "birdLow":
			// No ducking: low birds are cleared by jumping.
			return { w: 30, h: 18, offsetY: 18, action: "jump" as const, jumpHeight: 74, collides: true };
		case "birdHigh":
			// Harmless high birds (visual variety): don't require duck/jump.
			return { w: 34, h: 18, offsetY: 56, action: "stay" as const, jumpHeight: 0, collides: false };
	}
}

function pickObstacleKind(rng: () => number, elapsedMs: number): ObstacleKind {
	const r = rng();
	// Mix of cacti and birds. Birds start appearing after a short warmup.
	if (elapsedMs > 2200) {
		if (r < 0.18) return "birdLow";
		if (r < 0.30) return "birdHigh";
	}
	if (r < 0.18) return "cactusTiny";
	if (r < 0.62) return "cactusSmall";
	if (r < 0.84) return "cactusBig";
	return "cactusCluster";
}

function mulberry32(seed: number) {
	let a = seed >>> 0;
	return function rng() {
		a += 0x6d2b79f5;
		let t = a;
		t = Math.imul(t ^ (t >>> 15), t | 1);
		t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

function clamp(n: number, min: number, max: number) {
	return Math.max(min, Math.min(max, n));
}

function DinoRunner({ ariaLabel, hudText }: { ariaLabel: string; hudText: string }) {
	const WIDTH = 860;
	const HEIGHT = 160;
	const GROUND_Y = 128;
	const DINO_X = 92;
	const DINO_W = 30;
	const DINO_H_RUN = 28;

	const svgRef = useRef<SVGSVGElement | null>(null);
	const dinoRef = useRef<SVGGElement | null>(null);
	const groundRef = useRef<SVGGElement | null>(null);
	const cloudARef = useRef<SVGGElement | null>(null);
	const cloudBRef = useRef<SVGGElement | null>(null);
	const slotRefs = useRef<Array<SVGGElement | null>>([null, null, null]);
	const hudRef = useRef<SVGTextElement | null>(null);

	const [seed] = useState(() => Math.floor(Math.random() * 1_000_000_000));
	const rng = useMemo(() => mulberry32(seed), [seed]);

	useEffect(() => {
		const slots = slotRefs.current;
		if (!slots.length) return;

		let raf = 0;
		let lastTs = performance.now();
		let elapsedMs = 0;
		let score = 0;
		let speed = 0.42; // px/ms
		let groundShift = 0;
		let cloudShiftA = 0;
		let cloudShiftB = 0;

		// Vertical position (px above ground), with upward velocity (px/ms)
		let y = 0;
		let vy = 0;
		let jumpCooldownMs = 0;

		const gravity = -0.0032; // px/ms^2 (negative pulls back to ground)
		const obstacles: Obstacle[] = [];
		let lastKinds: ObstacleKind[] = [];
		let nextSpawnInMs = 680 + rng() * 680;
		let theme: "day" | "night" = "day";
		let nextThemeFlip = 9000 + rng() * 8000;

		function allocSlot(): number {
			for (let i = 0; i < slots.length; i++) {
				const used = obstacles.some((o) => o.slot === i);
				if (!used) return i;
			}
			return -1;
		}

		function renderObstacle(o: Obstacle) {
			const el = slots[o.slot];
			if (!el) return;
			el.setAttribute("data-kind", o.kind);
			el.setAttribute("opacity", "1");
			el.setAttribute("transform", `translate(${o.x.toFixed(2)} ${(GROUND_Y - o.offsetY).toFixed(2)})`);
		}

		function hideSlot(slot: number) {
			const el = slots[slot];
			if (!el) return;
			el.setAttribute("opacity", "0");
		}

		function spawnObstacle() {
			const slot = allocSlot();
			if (slot < 0) return;
			let kind = pickObstacleKind(rng, elapsedMs);
			// Anti-repeat: avoid long streaks of the same obstacle kind.
			// (Especially noticeable with combo spawns.)
			for (let attempt = 0; attempt < 6; attempt++) {
				const a = lastKinds[0];
				const b = lastKinds[1];
				// Never allow 3 in a row.
				if (a && b && kind === a && kind === b) {
					kind = pickObstacleKind(rng, elapsedMs);
					continue;
				}
				// Strongly discourage immediate repeats.
				if (a && kind === a && rng() < 0.85) {
					kind = pickObstacleKind(rng, elapsedMs);
					continue;
				}
				break;
			}
			const spec = runnerSpec(kind);
			const x = WIDTH + 40 + rng() * 120;
			const o: Obstacle = { slot, kind, x, offsetY: spec.offsetY, w: spec.w, h: spec.h };
			obstacles.push(o);
			lastKinds = [kind, ...lastKinds].slice(0, 3);
			renderObstacle(o);
		}

		function aabbIntersect(ax: number, ay: number, aw: number, ah: number, bx: number, by: number, bw: number, bh: number) {
			return ax < bx + bw && ax + aw > bx && ay < by + bh && ay + ah > by;
		}

		function updateHud() {
			const hud = hudRef.current;
			if (!hud) return;
			hud.textContent = `RUNNING • score ${score} • AI never loses`;
		}

		function setTheme(next: "day" | "night") {
			if (!svgRef.current) return;
			svgRef.current.setAttribute("data-theme", next);
		}

		function frame(ts: number) {
			const dino = dinoRef.current;
			const ground = groundRef.current;
			const cloudA = cloudARef.current;
			const cloudB = cloudBRef.current;
			if (!dino || !ground || !cloudA || !cloudB) {
				raf = requestAnimationFrame(frame);
				return;
			}
			const dt = clamp(ts - lastTs, 0, 34);
			lastTs = ts;
			elapsedMs += dt;
			score = Math.floor(elapsedMs / 90);
			speed = 0.42 + Math.min(0.22, elapsedMs / 120000); // gradual speedup
			if (jumpCooldownMs > 0) jumpCooldownMs = Math.max(0, jumpCooldownMs - dt);

			// theme flip
			if (elapsedMs >= nextThemeFlip) {
				theme = theme === "day" ? "night" : "day";
				setTheme(theme);
				nextThemeFlip = elapsedMs + 9000 + rng() * 9000;
			}

			// scenery
			groundShift = (groundShift + speed * dt * 0.9) % 180;
			ground.setAttribute("transform", `translate(${-groundShift.toFixed(2)} 0)`);
			cloudShiftA = (cloudShiftA + speed * dt * 0.18) % 1200;
			cloudShiftB = (cloudShiftB + speed * dt * 0.24) % 1200;
			cloudA.setAttribute("transform", `translate(${-cloudShiftA.toFixed(2)} 0)`);
			cloudB.setAttribute("transform", `translate(${-cloudShiftB.toFixed(2)} 0)`);

			// obstacles: spawn + move (denser + more varied)
			nextSpawnInMs -= dt;
			if (nextSpawnInMs <= 0) {
				spawnObstacle();
				// Occasionally spawn a quick follow-up obstacle (clusters / combos)
				const combo = rng() < 0.32;
				if (combo) {
					nextSpawnInMs = 140 + rng() * 190;
				} else {
					// Base gap in ms (shortens slightly as speed increases)
					const baseGap = 360 + rng() * 520;
					nextSpawnInMs = baseGap * (1 - Math.min(0.35, (speed - 0.42) * 0.95));
				}
			}

			for (const o of obstacles) {
				o.x -= speed * dt;
				renderObstacle(o);
			}
			for (let i = obstacles.length - 1; i >= 0; i--) {
				const o = obstacles[i];
				if (o.x < -120) {
					hideSlot(o.slot);
					obstacles.splice(i, 1);
				}
			}

			// AI decision (jump-only; never duck)
			const grounded = y <= 0.01 && Math.abs(vy) < 0.0001;
			let nextObstacle: Obstacle | undefined;
			for (const o of obstacles) {
				if (!runnerSpec(o.kind).collides) continue;
				if (o.x + o.w < DINO_X) continue;
				if (!nextObstacle || o.x < nextObstacle.x) nextObstacle = o;
			}

			if (nextObstacle) {
				const spec = runnerSpec(nextObstacle.kind);
				const distance = nextObstacle.x - (DINO_X + DINO_W);
				const timeToImpact = distance / Math.max(0.001, speed);
				if (spec.action === "jump") {
					const desiredH = spec.jumpHeight;
					const triggerMax = desiredH >= 80 ? 255 : 230;
					const triggerMin = desiredH >= 80 ? 120 : 105;
					const emergency = 80;
					const shouldJump = timeToImpact < triggerMax && timeToImpact > triggerMin;
					const shouldEmergencyJump = timeToImpact <= triggerMin && timeToImpact > emergency;
					if (grounded && jumpCooldownMs === 0 && (shouldJump || shouldEmergencyJump)) {
						vy = Math.sqrt(2 * Math.abs(gravity) * desiredH);
						jumpCooldownMs = 220;
					}
				}
			}

			// physics
			vy += gravity * dt;
			y += vy * dt;
			// Safety: never leave the frame.
			y = clamp(y, 0, 92);
			if (y === 0 && vy < 0) vy = 0;

			// apply dino state
			dino.setAttribute("data-state", "run");
			dino.setAttribute("transform", `translate(${DINO_X} ${(GROUND_Y - y).toFixed(2)})`);

			// collision check (safety net: if collision would occur, auto-correct)
			const dinoH = DINO_H_RUN;
			const dinoW = DINO_W;
			const dinoBox = {
				x: DINO_X,
				y: (GROUND_Y - y) - dinoH,
				w: dinoW,
				h: dinoH,
			};
			for (const o of obstacles) {
				if (!runnerSpec(o.kind).collides) continue;
				const obBox = {
					x: o.x,
					y: (GROUND_Y - o.offsetY) - o.h,
					w: o.w,
					h: o.h,
				};
				if (aabbIntersect(dinoBox.x, dinoBox.y, dinoBox.w, dinoBox.h, obBox.x, obBox.y, obBox.w, obBox.h)) {
					// Guarantee "never lose": only apply a stronger jump if we're basically grounded
					// (avoid mid-air "double jumps" that look buggy).
					if (grounded && jumpCooldownMs === 0) {
						const spec = runnerSpec(o.kind);
						const desiredH = (spec.action === "jump" ? spec.jumpHeight : 80) + 28;
						vy = Math.sqrt(2 * Math.abs(gravity) * desiredH);
						jumpCooldownMs = 260;
					}
				}
			}

			updateHud();
			raf = requestAnimationFrame(frame);
		}

		setTheme("day");
		// hide unused slots
		for (let i = 0; i < slots.length; i++) hideSlot(i);
		raf = requestAnimationFrame(frame);
		return () => cancelAnimationFrame(raf);
	}, [rng]);

	return (
		<svg ref={svgRef} viewBox={`0 0 ${WIDTH} ${HEIGHT}`} className="w-full h-[160px]" role="img" aria-label={ariaLabel}>
			<style>{`
				:root { color-scheme: dark; }
				svg[data-theme="day"] .bg { fill: transparent; }
				svg[data-theme="night"] .bg { fill: transparent; }
				svg[data-theme="night"] .gridLine { fill: rgba(255,255,255,0.03); }
				.gridLine { fill: rgba(255,255,255,0.05); }
				.hud { fill: rgba(255,255,255,0.28); font: 12px ui-sans-serif, system-ui, -apple-system, Segoe UI; }
				.groundLine { stroke: rgba(255,255,255,0.16); }
				.cloudFill { fill: rgba(255,255,255,0.12); }
				.slot .kind { display: none; }
				.slot[data-kind="cactusTiny"] .cactusTiny { display: block; }
				.slot[data-kind="cactusSmall"] .cactusSmall { display: block; }
				.slot[data-kind="cactusBig"] .cactusBig { display: block; }
				.slot[data-kind="cactusCluster"] .cactusCluster { display: block; }
				.slot[data-kind="birdLow"] .birdLow { display: block; }
				.slot[data-kind="birdHigh"] .birdHigh { display: block; }
				.dinoPose { display: none; }
				.dino[data-state="run"] .poseRun { display: block; }
				@keyframes legA { 0%, 100% { transform: translateY(0px);} 50% { transform: translateY(1px);} }
				@keyframes legB { 0%, 100% { transform: translateY(1px);} 50% { transform: translateY(0px);} }
				.legA { animation: legA 0.24s linear infinite; }
				.legB { animation: legB 0.24s linear infinite; }
				@keyframes flap { 0%, 100% { transform: rotate(10deg);} 50% { transform: rotate(-12deg);} }
				.wing { transform-origin: 6px 0px; animation: flap 0.22s ease-in-out infinite; }
			`}</style>
			<defs>
				<linearGradient id="dinoGrad" x1="0" y1="0" x2="1" y2="0">
					<stop offset="0%" stopColor="rgba(16,185,129,0.95)" />
					<stop offset="60%" stopColor="rgba(56,189,248,0.92)" />
					<stop offset="100%" stopColor="rgba(16,185,129,0.85)" />
				</linearGradient>
			</defs>

			<rect className="bg" x="0" y="0" width={WIDTH} height={HEIGHT} />
			{Array.from({ length: 36 }).map((_, i) => (
				<rect key={i} className="gridLine" x={i * 24} y={0} width={1} height={HEIGHT} />
			))}

			{/* clouds */}
			<g className="cloudFill">
				<g ref={cloudARef}>
					<circle cx="760" cy="38" r="10" />
					<circle cx="776" cy="40" r="12" />
					<circle cx="794" cy="38" r="10" />
				</g>
				<g ref={cloudBRef} opacity="0.75">
					<circle cx="420" cy="54" r="9" />
					<circle cx="434" cy="56" r="10" />
					<circle cx="450" cy="54" r="9" />
				</g>
			</g>

			{/* ground */}
			<line x1="0" y1={GROUND_Y + 0.5} x2={WIDTH} y2={GROUND_Y + 0.5} className="groundLine" strokeWidth="2" />
			<g ref={groundRef} fill="rgba(16,185,129,0.42)">
				{[0, 120, 240, 360, 480, 600, 720, 840, 960, 1080].map((x) => (
					<rect key={x} x={x} y={GROUND_Y + 10} width={3} height={1} />
				))}
			</g>

			{/* dino */}
			<g ref={dinoRef} className="dino" data-state="run" transform={`translate(${DINO_X} ${GROUND_Y})`}>
				<g className="dinoPose poseRun">
					<rect x="0" y={-DINO_H_RUN} width={DINO_W} height={DINO_H_RUN} rx="2" fill="rgba(255,255,255,0.30)" />
					<rect x="3" y={-DINO_H_RUN + 4} width={DINO_W - 6} height={DINO_H_RUN - 8} rx="2" fill="url(#dinoGrad)" opacity="0.55" />
					<rect x={DINO_W - 10} y={-DINO_H_RUN + 8} width="3" height="3" fill="rgba(255,255,255,0.9)" />
					<rect x="6" y={-3} width="6" height="3" fill="rgba(255,255,255,0.30)" className="legA" />
					<rect x="16" y={-3} width="6" height="3" fill="rgba(255,255,255,0.30)" className="legB" />
				</g>
			</g>

			{/* obstacle slots (render 3 concurrently) */}
			{[0, 1, 2].map((i) => (
				<g
					key={i}
					ref={(el) => {
						slotRefs.current[i] = el;
					}}
					className="slot"
					data-kind="cactusSmall"
					opacity="0"
					transform={`translate(${WIDTH + 200} ${GROUND_Y})`}
				>
					{/* cactus tiny */}
					<g className="kind cactusTiny">
						<rect x="0" y="-26" width="14" height="26" fill="rgba(255,255,255,0.22)" />
						<rect x="2" y="-22" width="10" height="18" fill="rgba(16,185,129,0.45)" />
						<rect x="9" y="-18" width="6" height="6" fill="rgba(255,255,255,0.10)" />
					</g>
					{/* cactus small */}
					<g className="kind cactusSmall">
						<rect x="0" y="-34" width="18" height="34" fill="rgba(255,255,255,0.22)" />
						<rect x="2" y="-28" width="14" height="22" fill="rgba(16,185,129,0.45)" />
						<rect x="12" y="-26" width="8" height="8" fill="rgba(255,255,255,0.10)" />
					</g>
					{/* cactus big */}
					<g className="kind cactusBig">
						<rect x="0" y="-48" width="26" height="48" fill="rgba(255,255,255,0.22)" />
						<rect x="3" y="-40" width="20" height="34" fill="rgba(16,185,129,0.45)" />
						<rect x="18" y="-34" width="10" height="10" fill="rgba(255,255,255,0.10)" />
						<rect x="-6" y="-34" width="10" height="10" rx="2" fill="rgba(16,185,129,0.32)" />
					</g>
					{/* cactus cluster */}
					<g className="kind cactusCluster">
						<rect x="0" y="-40" width="18" height="40" fill="rgba(255,255,255,0.20)" />
						<rect x="2" y="-34" width="14" height="28" fill="rgba(16,185,129,0.44)" />
						<rect x="16" y="-48" width="26" height="48" fill="rgba(255,255,255,0.18)" />
						<rect x="19" y="-40" width="20" height="34" fill="rgba(16,185,129,0.38)" />
						<rect x="8" y="-18" width="10" height="10" rx="2" fill="rgba(16,185,129,0.24)" />
					</g>
					{/* bird low (duck) */}
					<g className="kind birdLow" opacity="0.95">
						<rect x="0" y="-18" width="30" height="18" rx="3" fill="rgba(255,255,255,0.18)" />
						<rect x="2" y="-16" width="26" height="14" rx="3" fill="rgba(56,189,248,0.22)" />
						<rect x="22" y="-14" width="6" height="4" rx="2" fill="rgba(255,255,255,0.18)" />
						<rect className="wing" x="6" y="-18" width="10" height="2" fill="rgba(255,255,255,0.35)" />
					</g>
					{/* bird high (jump) */}
					<g className="kind birdHigh" opacity="0.95">
						<rect x="0" y="-18" width="34" height="18" rx="3" fill="rgba(255,255,255,0.16)" />
						<rect x="2" y="-16" width="30" height="14" rx="3" fill="rgba(56,189,248,0.20)" />
						<rect x="26" y="-14" width="6" height="4" rx="2" fill="rgba(255,255,255,0.18)" />
						<rect className="wing" x="8" y="-18" width="12" height="2" fill="rgba(255,255,255,0.35)" />
					</g>
				</g>
			))}

			{/* HUD */}
			<text ref={hudRef} x={WIDTH - 320} y="22" className="hud">
				{hudText}
			</text>
		</svg>
	);
}

export function DinoLoader({ className, subtitle }: Props) {
	return (
		<div
			className={["w-full rounded-2xl border border-white/[0.10] bg-white/[0.02] overflow-hidden", className]
			.filter(Boolean)
			.join(" ")}
		>
			<div className="p-4">
				<DinoRunner ariaLabel={subtitle} hudText={subtitle} />
				<div className="mt-3 text-sm text-zinc-300">{subtitle}</div>
			</div>
		</div>
	);
}
