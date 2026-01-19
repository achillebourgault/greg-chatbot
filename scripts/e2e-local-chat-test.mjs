const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

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
	const prompt = process.argv.slice(2).join(" ") || "C quoi la derniere video d'underscore sur youtube";
	await waitForServer("http://localhost:3000/api/openrouter/models", 20000);

	const body = {
		model: "mistralai/devstral-2512:free",
		messages: [{ role: "user", content: prompt }],
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
	console.log(JSON.stringify({ status: res.status, leaked }, null, 2));
	console.log("--- preview ---");
	console.log(text.slice(0, 1800));
	process.exit(leaked ? 2 : 0);
}

main().catch((e) => {
	console.error(e);
	process.exit(1);
});
