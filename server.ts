import "dotenv/config";
import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

const PORT = 3000;

async function startServer() {
  const app = express();

  // Proxy upload route to upload large files directly from the server, bypassing R2 CORS entirely.
  // Must be registered before express.json() to prevent JSON body-parsing of binary models.
  app.post("/api/upload-proxy", async (req, res) => {
    try {
      const fileName = req.query.fileName as string;
      const contentType = req.query.contentType as string || "application/octet-stream";

      if (!fileName) {
        return res.status(400).json({ error: "fileName is required" });
      }

      let endpoint = process.env.R2_ENDPOINT;
      const accessKeyId = process.env.R2_ACCESS_KEY_ID;
      const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
      const bucketName = process.env.R2_BUCKET_NAME;
      const publicUrlBase = process.env.R2_PUBLIC_URL;

      if (!endpoint || !accessKeyId || !secretAccessKey || !bucketName) {
        return res.status(500).json({ error: "Cloudflare R2 is not fully configured on the server." });
      }

      // Automatically clean the endpoint if it contains the bucket name path at the end
      const cleanEndpointMatch = endpoint.match(/^(https:\/\/[a-zA-Z0-9-]+\.r2\.cloudflarestorage\.com)/i);
      if (cleanEndpointMatch) {
        endpoint = cleanEndpointMatch[1];
      }

      // Collect the stream manually into a Buffer to guarantee the AWS S3 client receives
      // a concrete buffer and does not throw "Unable to calculate hash for flowing readable stream".
      const chunks: Buffer[] = [];
      for await (const chunk of req) {
        chunks.push(chunk);
      }
      const buffer = Buffer.concat(chunks);

      const s3Client = new S3Client({
        region: "auto",
        endpoint: endpoint,
        credentials: {
          accessKeyId: accessKeyId,
          secretAccessKey: secretAccessKey,
        },
        forcePathStyle: true,
      });

      const command = new PutObjectCommand({
        Bucket: bucketName,
        Key: fileName,
        Body: buffer,
        ContentType: contentType,
        ContentLength: buffer.length,
      });

      await s3Client.send(command);

      const publicUrl = publicUrlBase ? `${publicUrlBase.replace(/\/$/, '')}/${fileName}` : `https://${bucketName}.r2.cloudflarestorage.com/${fileName}`;

      res.json({ publicUrl, fileName });
    } catch (error: any) {
      console.error("Error direct-proxying upload to R2:", error);
      res.status(500).json({ error: error.message || "Failed to proxy upload to R2" });
    }
  });

  app.use(express.json());

  // API Routes
  app.get("/api/get-upload-url", (req, res) => {
    res.json({ status: "ok", message: "Cloudflare R2 API is ready. Please use POST to generate presigned URLs." });
  });

  app.post("/api/get-upload-url", async (req, res) => {
    try {
      const { fileName, contentType } = req.body;
      if (!fileName) {
        return res.status(400).json({ error: "fileName is required" });
      }

      let endpoint = process.env.R2_ENDPOINT;
      const accessKeyId = process.env.R2_ACCESS_KEY_ID;
      const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
      const bucketName = process.env.R2_BUCKET_NAME;
      const publicUrlBase = process.env.R2_PUBLIC_URL;

      if (!endpoint || !accessKeyId || !secretAccessKey || !bucketName) {
        return res.status(500).json({ error: "Cloudflare R2 is not configured on the server." });
      }

      // Tự động làm sạch endpoint nếu người dùng dán kèm tên bucket ở cuối
      // Ví dụ: https://<account_id>.r2.cloudflarestorage.com/nmt3d -> https://<account_id>.r2.cloudflarestorage.com
      const cleanEndpointMatch = endpoint.match(/^(https:\/\/[a-zA-Z0-9-]+\.r2\.cloudflarestorage\.com)/i);
      if (cleanEndpointMatch) {
        endpoint = cleanEndpointMatch[1];
      }

      const s3Client = new S3Client({
        region: "auto",
        endpoint: endpoint,
        credentials: {
          accessKeyId: accessKeyId,
          secretAccessKey: secretAccessKey,
        },
        forcePathStyle: true,
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
