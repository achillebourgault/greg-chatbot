const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

import { spawn } from "node:child_process";

async function killProcessTree(pid) {
	if (!pid) return;
	try {
		if (process.platform === "win32") {
			// /T kills child processes too.
			spawn("taskkill", ["/PID", String(pid), "/T", "/F"], { stdio: "ignore", shell: true });
		} else {
			process.kill(pid, "SIGTERM");
		}
	} catch {
		// ignore
	}
}

function startDevServer(port = 3000) {
	const child = spawn("npm", ["run", "dev", "--", "-p", String(port)], {
		cwd: process.cwd(),
		shell: true,
		stdio: "pipe",
		env: { ...process.env, PORT: String(port) },
	});

	let output = "";
	const onData = (chunk) => {
		const text = chunk.toString("utf8");
		output += text;
		if (output.length > 20000) output = output.slice(-20000);
		process.stdout.write(text);
	};
	child.stdout.on("data", onData);
	child.stderr.on("data", onData);

	return { child };
}

async function waitForServer(url, timeoutMs = 15000) {
	const start = Date.now();
	let lastErr;
	while (Date.now() - start < timeoutMs) {
		try {
			const r = await fetch(url, { method: "GET" });
			if (r.ok) return true;
			lastErr = new Error(`HTTP ${r.status}`);
		} catch (e) {
			lastErr = e;
		}
		await sleep(500);
	}
	throw lastErr ?? new Error("Server not ready");
}

async function main() {
	const argv = process.argv.slice(2);
	let promptParts = [];
	let model = "mistralai/devstral-2512:free";
	let verbosity = "balanced";
	let tone = "professional";
	let guidance = "neutral";
	let playfulness = "none";
	let compare = false;

	for (let i = 0; i < argv.length; i++) {
		const a = argv[i];
		if (a === "--compare") {
			compare = true;
			continue;
		}
		if (a === "--model" && argv[i + 1]) {
			model = argv[++i];
			continue;
		}
		if (a === "--verbosity" && argv[i + 1]) {
			verbosity = argv[++i];
			continue;
		}
		if (a === "--tone" && argv[i + 1]) {
			tone = argv[++i];
			continue;
		}
		if (a === "--guidance" && argv[i + 1]) {
			guidance = argv[++i];
			continue;
		}
		if (a === "--playfulness" && argv[i + 1]) {
			playfulness = argv[++i];
			continue;
		}
		promptParts.push(a);
	}

	// Safety: avoid accidentally burning paid credits during local tests.
	// Allow override with: set GREG_E2E_ALLOW_PAID=1
	const allowPaid = process.env.GREG_E2E_ALLOW_PAID === "1";
	const looksFree = (m) => typeof m === "string" && (m.includes(":free") || m === "mistralai/devstral-2512:free");
	if (!allowPaid && !looksFree(model)) {
		console.error(
			`[e2e] Refusing to run with non-free model: ${model}\n` +
				"[e2e] Use a :free model (default is mistralai/devstral-2512:free) or set GREG_E2E_ALLOW_PAID=1 to override.",
		);
		process.exit(2);
	}

	const prompt = promptParts.join(" ") || "Derniere video d'underscore sur youtube ?";
	let dev = null;
	try {
		await waitForServer("http://localhost:3000/api/openrouter/models", 4000);
	} catch {
		// Sometimes the server is already starting (or the port is occupied by an existing dev server).
		// Give it a bit more time before attempting to spawn a new one.
		try {
			await waitForServer("http://localhost:3000/api/openrouter/models", 15000);
		} catch {
			console.log("\n[e2e] Dev server not reachable; starting it...\n");
			try {
				dev = startDevServer(3000);
			} catch {
				dev = null;
			}
			await waitForServer("http://localhost:3000/api/openrouter/models", 30000);
		}
	}

	const runOnce = async (p) => {
		const body = {
			model,
			messages: [{ role: "user", content: prompt }],
			personality: p,
		};

		const res = await fetch("http://localhost:3000/api/openrouter/chat", {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				"x-ui-language": "fr",
			},
			body: JSON.stringify(body),
		});

		const text = await res.text();
		const leaked = /URL sources \(server-extracted\)/i.test(text) || /##\s*URL sources \(server-extracted\)/i.test(text);
		return { res, text, leaked };
	};

	if (compare) {
		const a = await runOnce({ tone, verbosity: "minimal", guidance, playfulness });
		const b = await runOnce({ tone, verbosity: "detailed", guidance, playfulness });
		console.log(
			JSON.stringify(
				{
					compare: true,
					model,
					minimal: { status: a.res.status, leaked: a.leaked, bytes: a.text.length },
					detailed: { status: b.res.status, leaked: b.leaked, bytes: b.text.length },
				},
				null,
				2,
			),
		);
		console.log("--- minimal preview ---");
		console.log(a.text.slice(0, 1200));
		console.log("--- detailed preview ---");
		console.log(b.text.slice(0, 1200));
		if (dev?.child?.pid) await killProcessTree(dev.child.pid);
		process.exit(a.leaked || b.leaked ? 2 : 0);
	}

	const { res, text, leaked } = await runOnce({ tone, verbosity, guidance, playfulness });
	console.log(
		JSON.stringify(
			{ status: res.status, leaked, bytes: text.length, model, personality: { tone, verbosity, guidance, playfulness } },
			null,
			2,
		),
	);
	console.log("--- preview ---");
	console.log(text.slice(0, 1800));
	if (dev?.child?.pid) await killProcessTree(dev.child.pid);
	process.exit(leaked ? 2 : 0);
}

main().catch((e) => {
	console.error(e);
	process.exit(1);
});
