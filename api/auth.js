const DEFAULT_USERS = [
  { username: "ilyes", password: "ilyes", name: "Ilyes (المدير)", role: "admin" },
  { username: "vendeur", password: "1234", name: "بائع المحل", role: "cashier" }
];

export default function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  if (req.method === "GET") {
    return res.status(200).json({
      authReady: true,
      defaultAdmin: "ilyes",
      users: DEFAULT_USERS.map(({ username, name, role }) => ({ username, name, role }))
    });
  }

  if (req.method === "POST") {
    try {
      const body = typeof req.body === "string" ? JSON.parse(req.body) : (req.body || {});
      const { username, password } = body;
      const cleanUser = String(username || "").trim().toLowerCase();
      const cleanPass = String(password || "").trim();

      const matched = DEFAULT_USERS.find(
        (u) => u.username.toLowerCase() === cleanUser && u.password === cleanPass
      );

      if (matched) {
        return res.status(200).json({
          success: true,
          user: {
            username: matched.username,
            name: matched.name,
            role: matched.role
          },
          token: `token_${matched.username}_${Date.now()}`
        });
      }

      return res.status(401).json({
        success: false,
        error: "اسم المستخدم أو كلمة المرور غير صحيحة"
      });
    } catch (err) {
      return res.status(500).json({ success: false, error: err.message });
    }
  }

  return res.status(405).json({ error: "Method not allowed" });
}
