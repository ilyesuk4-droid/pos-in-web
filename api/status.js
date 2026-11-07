export default function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.status(200).json({
    status: "ok",
    backend: "Node/Vercel Serverless Backend",
    version: "1.0.0",
    appName: "Mobile Shop Manager",
    serverTime: new Date().toISOString()
  });
}
