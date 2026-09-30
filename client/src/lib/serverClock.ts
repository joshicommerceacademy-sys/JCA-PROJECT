// Corrects for the candidate's device clock being wrong (common on shared exam-centre PCs) by
// measuring the offset to the server's clock once per page load. The exam deadline is enforced
// server-side regardless — this only makes the on-screen countdown match that real deadline
// instead of whatever the local OS clock happens to say.
let offsetMs = 0
let initPromise: Promise<void> | null = null

async function measureOffset() {
    const t0 = Date.now()
    try {
        const res = await fetch("/api/health")
        const data = await res.json()
        const t1 = Date.now()
        const serverNow = new Date(data.now).getTime()
        const roundTripMs = t1 - t0
        // Assume the request and response each took half the round trip — the server's
        // timestamp was generated roughly roundTripMs/2 before we received the response.
        offsetMs = serverNow + roundTripMs / 2 - t1
    } catch {
        offsetMs = 0
    }
}

export function initServerClock() {
    if (!initPromise) initPromise = measureOffset()
    return initPromise
}

export function serverNow() {
    return Date.now() + offsetMs
}
