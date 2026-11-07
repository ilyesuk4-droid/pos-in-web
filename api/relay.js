// Real-time scan relay for QR-connected phones and PC POS
const sessions = new Map();

// Periodically clean stale sessions (older than 30 minutes)
function cleanStale() {
  const now = Date.now();
  for (const [id, data] of sessions.entries()) {
    if (now - data.lastActive > 30 * 60 * 1000) {
      sessions.delete(id);
    }
  }
}

export default function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  cleanStale();

  // 1. Phone sends a scan to the session: POST /api/relay
  if (req.method === "POST") {
    try {
      const body = typeof req.body === "string" ? JSON.parse(req.body) : (req.body || {});
      const { session, code, format } = body;

      if (!session || !code) {
        return res.status(400).json({ success: false, error: "Session and code required" });
      }

      if (!sessions.has(session)) {
        sessions.set(session, { scans: [], lastActive: Date.now() });
      }

      const sessData = sessions.get(session);
      sessData.lastActive = Date.now();

      const newScan = {
        id: Date.now() + Math.random().toString(36).substring(2, 7),
        code: String(code).trim(),
        format: format || "auto",
        timestamp: Date.now()
      };

      sessData.scans.push(newScan);
      // Keep only last 20 scans
      if (sessData.scans.length > 20) {
        sessData.scans.shift();
      }

      return res.status(200).json({ success: true, scan: newScan });
    } catch (err) {
      return res.status(500).json({ success: false, error: err.message });
    }
  }

  // 2. PC polls for scans: GET /api/relay?session=xyz&lastScanId=abc
  if (req.method === "GET") {
    const { session, lastScanId } = req.query;

    if (!session) {
      return res.status(400).json({ success: false, error: "Session query param required" });
    }

    if (!sessions.has(session)) {
      sessions.set(session, { scans: [], lastActive: Date.now() });
    }

    const sessData = sessions.get(session);
    sessData.lastActive = Date.now();

    let newScans = sessData.scans;
    if (lastScanId) {
      const idx = sessData.scans.findIndex((s) => s.id === lastScanId);
      if (idx >= 0) {
        newScans = sessData.scans.slice(idx + 1);
      }
    }

    return res.status(200).json({
      success: true,
      scans: newScans,
      active: true,
      totalCount: sessData.scans.length
    });
  }

  return res.status(405).json({ error: "Method not allowed" });
}
