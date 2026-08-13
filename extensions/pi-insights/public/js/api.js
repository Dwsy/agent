/**
 * Transport only. No formatting, no state, no DOM.
 *
 * When the page is opened with `?fixture=1` a failed request falls back to
 * `fixture.js`, which is dynamically imported so it is never even downloaded
 * on the production path.
 */

const FIXTURE_ENABLED = new URLSearchParams(location.search).get("fixture") === "1";

let servingFixture = false;

/** True when the data currently on screen came from the fixture, not the server. */
export function isFixtureData() {
	return servingFixture;
}

async function readError(response) {
	try {
		const body = await response.json();
		if (body && typeof body.error === "string") return body.error;
	} catch {}
	return `${response.status} ${response.statusText}`.trim();
}

async function getJson(path, init) {
	const response = await fetch(path, { cache: "no-store", ...init });
	if (!response.ok) throw new Error(await readError(response));
	return response.json();
}

async function withFixture(request, fallback) {
	try {
		const data = await request();
		servingFixture = false;
		return data;
	} catch (error) {
		if (!FIXTURE_ENABLED || error?.name === "AbortError") throw error;
		const fixture = await import("./fixture.js");
		const data = fallback(fixture);
		if (data === undefined) throw error;
		servingFixture = true;
		return data;
	}
}

export function fetchStatus(signal) {
	return getJson("/api/status", { signal });
}

export function fetchReport(range, { refresh = false, signal } = {}) {
	const query = new URLSearchParams({ range });
	if (refresh) query.set("refresh", "1");
	return withFixture(
		() => getJson(`/api/report?${query}`, { signal }),
		(fixture) => fixture.fixtureReport(range),
	);
}

export function fetchSessionDetail(path, signal) {
	const query = new URLSearchParams({ path });
	return withFixture(
		() => getJson(`/api/session?${query}`, { signal }),
		(fixture) => fixture.fixtureSessionDetail(path),
	);
}

export function requestRescan(signal) {
	return withFixture(
		() => getJson("/api/refresh", { method: "POST", signal }),
		(fixture) => ({ scan: fixture.fixtureScan() }),
	);
}
