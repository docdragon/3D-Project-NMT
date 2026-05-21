import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

const PORT = 3000;

async function startServer() {
  const app = express();
  app.use(express.json());

  // API Routes
  app.post("/api/get-upload-url", async (req, res) => {
    try {
      const { fileName, contentType } = req.body;
      if (!fileName) {
        return res.status(400).json({ error: "fileName is required" });
      }

      const endpoint = process.env.R2_ENDPOINT;
      const accessKeyId = process.env.R2_ACCESS_KEY_ID;
      const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
      const bucketName = process.env.R2_BUCKET_NAME;
      const publicUrlBase = process.env.R2_PUBLIC_URL;

      if (!endpoint || !accessKeyId || !secretAccessKey || !bucketName) {
        return res.status(500).json({ error: "Cloudflare R2 is not configured on the server." });
      }

      const s3Client = new S3Client({
        region: "auto",
        endpoint: endpoint,
        credentials: {
          accessKeyId: accessKeyId,
          secretAccessKey: secretAccessKey,
        },
      });

      const command = new PutObjectCommand({
        Bucket: bucketName,
        Key: fileName,
        ContentType: contentType || "application/octet-stream",
      });

      // Url expires in 15 minutes
      const uploadUrl = await getSignedUrl(s3Client, command, { expiresIn: 900 });
      
      const publicUrl = publicUrlBase ? `${publicUrlBase.replace(/\/$/, '')}/${fileName}` : null;

      res.json({ uploadUrl, publicUrl, fileName });
    } catch (error) {
      console.error("Error generating presigned URL:", error);
      res.status(500).json({ error: "Failed to generate upload URL" });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    // Production static files
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
