/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect } from "react";
import { Upload, Share2, Link as LinkIcon, Check, Loader2, CloudUpload } from "lucide-react";
import { v4 as uuidv4 } from "uuid";
import ModelViewer from "./components/ModelViewer";

export default function App() {
  const [modelUrl, setModelUrl] = useState<string | null>(null);
  const [shareCopied, setShareCopied] = useState(false);
  const [inputUrl, setInputUrl] = useState("");
  const [isUrlMode, setIsUrlMode] = useState(false);
  
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  useEffect(() => {
    const queryParams = new URLSearchParams(window.location.search);
    const sharedUrl = queryParams.get("url");

    if (sharedUrl) {
      setModelUrl(decodeURIComponent(sharedUrl));
    }
  }, []);

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      if (modelUrl && modelUrl.startsWith("blob:")) {
        URL.revokeObjectURL(modelUrl);
      }
      const url = URL.createObjectURL(file);
      window.history.pushState({}, "", window.location.pathname); // clear query param
      setModelUrl(url);
    }
  };

  const handleR2Upload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setUploading(true);
    setUploadError(null);

    const fileExt = file.name.split('.').pop();
    const fileName = `${uuidv4()}.${fileExt}`;

    try {
      // 1. Get presigned URL from our backend
      const response = await fetch("/api/get-upload-url", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fileName, contentType: file.type || "application/octet-stream" })
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || "Lỗi lấy URL upload");
      }

      const { uploadUrl, publicUrl } = await response.json();

      // 2. Try to upload file directly to R2 using the presigned URL
      try {
        const uploadResponse = await fetch(uploadUrl, {
          method: "PUT",
          headers: {
            "Content-Type": file.type || "application/octet-stream",
          },
          body: file,
        });

        if (!uploadResponse.ok) {
          throw new Error("Không thể lưu trực tiếp lên R2.");
        }

        // 3. Set public URL
        const finalUrl = publicUrl || uploadUrl.split("?")[0];
        window.history.pushState({}, "", `?url=${encodeURIComponent(finalUrl)}`);
        setModelUrl(finalUrl);
      } catch (directUploadErr: any) {
        console.warn("Direct browser upload to R2 failed (likely due to CORS or network constraints). Attempting server proxy fallback...", directUploadErr);
        
        // Proxy Fallback: bypass CORS by uploading through our backend container
        const proxyResponse = await fetch(`/api/upload-proxy?fileName=${encodeURIComponent(fileName)}&contentType=${encodeURIComponent(file.type || "application/octet-stream")}`, {
          method: "POST",
          body: file,
        });

        if (!proxyResponse.ok) {
          const proxyErrData = await proxyResponse.json().catch(() => ({}));
          throw new Error(
            proxyErrData.error || 
            "Giao thức upload trực tiếp và proxy dự phòng đều thất bại. Có thể do khóa bí mật (Secret/Key) hoặc Endpoint R2 chưa đúng."
          );
        }

        const { publicUrl: proxyPublicUrl } = await proxyResponse.json();
        const finalUrl = proxyPublicUrl;
        window.history.pushState({}, "", `?url=${encodeURIComponent(finalUrl)}`);
        setModelUrl(finalUrl);
      }
    } catch (error: any) {
      console.error("Lỗi tải lên R2:", error);
      
      const isNetworkOrCorsError = !error.message || error.message.includes("Failed to fetch") || error.message.includes("fetch");
      if (isNetworkOrCorsError) {
        setUploadError(
          "Lỗi CORS/Mạng: Không thể tải trực tiếp đến Cloudflare R2 từ trình duyệt. " +
          "Bạn hãy cấu hình CORS cho Bucket trên Cloudflare R2 dashboard (đi tới R2 -> Bucket -> Settings -> CORS Policy) " +
          "và áp dụng quy tắc sau:\n\n" +
          "[\n" +
          "  {\n" +
          "    \"AllowedOrigins\": [\"*\"],\n" +
          "    \"AllowedMethods\": [\"GET\", \"PUT\", \"POST\", \"DELETE\", \"HEAD\"],\n" +
          "    \"AllowedHeaders\": [\"*\"]\n" +
          "  }\n" +
          "]"
        );
      } else {
        setUploadError(error.message || "Không thể tải lên file. Vui lòng kiểm tra lại cấu hình thông tin R2.");
      }
    } finally {
      setUploading(false);
    }
  };

  const handleUrlSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (inputUrl) {
      window.history.pushState({}, "", `?url=${encodeURIComponent(inputUrl)}`);
      setModelUrl(inputUrl);
    }
  };

  const copyShareLink = () => {
    navigator.clipboard.writeText(window.location.href);
    setShareCopied(true);
    setTimeout(() => setShareCopied(false), 2000);
  };

  if (modelUrl) {
    return (
      <div className="w-screen h-screen overflow-hidden bg-gray-50 relative">
        <ModelViewer fileUrl={modelUrl} />

        <div className="absolute top-4 right-4 z-50 flex items-center gap-3">
          {window.location.search.includes("url=") && (
            <button
              onClick={copyShareLink}
              className="cursor-pointer inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white font-medium rounded-lg shadow-sm hover:bg-indigo-700 transition-all text-sm"
            >
              {shareCopied ? (
                <Check className="w-4 h-4" />
              ) : (
                <Share2 className="w-4 h-4" />
              )}
              {shareCopied ? "Đã copy" : "Chia sẻ URL này"}
            </button>
          )}

          <button
            onClick={() => {
               if (modelUrl && modelUrl.startsWith("blob:")) {
                 URL.revokeObjectURL(modelUrl);
               }
               setModelUrl(null);
               window.history.pushState({}, "", window.location.pathname);
            }}
            className="cursor-pointer inline-flex items-center gap-2 px-4 py-2 bg-white/80 backdrop-blur-md border border-gray-200 text-gray-700 hover:bg-white hover:text-indigo-600 font-medium rounded-lg shadow-sm transition-all text-sm"
          >
            Quay lại
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-6 font-sans text-gray-900">
      <div className="bg-white p-8 md:p-12 rounded-3xl shadow-sm border border-gray-100 max-w-md w-full text-center flex flex-col items-center relative overflow-hidden">
        
        {uploading && (
          <div className="absolute inset-0 z-10 bg-white/80 backdrop-blur flex flex-col items-center justify-center">
            <Loader2 className="w-10 h-10 animate-spin text-indigo-600 mb-4" />
            <p className="text-gray-900 font-medium font-mono text-xl">
              Đang tải lên Cloudflare R2...
            </p>
          </div>
        )}

        <div className="w-16 h-16 bg-indigo-50 rounded-2xl flex items-center justify-center text-indigo-600 mb-6">
          <Upload className="w-8 h-8" />
        </div>
        <h2 className="text-2xl font-bold text-gray-900 mb-2">3D Web Viewer</h2>
        <p className="text-gray-500 mb-8 w-full max-w-xs mx-auto">
          Tải file lên đám mây (Cloudflare R2) hoặc xem Offline.
        </p>

        {uploadError && (
          <div className="mb-6 w-full p-3 bg-red-50 text-red-600 text-sm rounded-lg border border-red-100">
            {uploadError}
          </div>
        )}

        {isUrlMode ? (
          <form onSubmit={handleUrlSubmit} className="w-full flex flex-col gap-3">
            <input 
              type="url"
              required
              placeholder="Nhập link file .glb / .gltf (Vd: Github, host riêng)"
              className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm"
              value={inputUrl}
              onChange={(e) => setInputUrl(e.target.value)}
            />
            <button
              type="submit"
              className="w-full inline-flex items-center justify-center gap-2 px-6 py-3 bg-indigo-600 hover:bg-indigo-700 text-white font-medium rounded-xl transition-colors shadow-sm"
            >
              Mở mô hình từ URL
            </button>
            <button
              type="button"
              onClick={() => setIsUrlMode(false)}
              className="text-sm text-gray-500 hover:text-indigo-600 mt-2"
            >
              Quay lại
            </button>
          </form>
        ) : (
          <div className="w-full flex flex-col gap-3">
            <label className="cursor-pointer inline-flex items-center justify-center gap-2 w-full px-6 py-4 bg-indigo-600 hover:bg-indigo-700 text-white font-medium rounded-xl transition-colors shadow-sm">
              <CloudUpload className="w-5 h-5" />
              Lưu lên Cloudflare R2 & Chia sẻ
              <input
                type="file"
                accept=".glb,.gltf"
                className="hidden"
                onChange={handleR2Upload}
                disabled={uploading}
              />
            </label>

            <label className="cursor-pointer inline-flex items-center justify-center gap-2 w-full px-6 py-4 bg-gray-100 hover:bg-gray-200 text-gray-700 font-medium rounded-xl transition-colors shadow-sm">
              <Upload className="w-5 h-5" />
              Xem Offline (Không lưu)
              <input
                type="file"
                accept=".glb,.gltf"
                className="hidden"
                onChange={handleFileUpload}
              />
            </label>
            
            <button
               onClick={() => setIsUrlMode(true)}
               className="w-full inline-flex items-center justify-center gap-2 px-6 py-4 bg-gray-100 hover:bg-gray-200 text-gray-700 font-medium rounded-xl transition-colors shadow-sm"
             >
               <LinkIcon className="w-5 h-5" />
               Mở từ đường dẫn URL
             </button>
          </div>
        )}
      </div>
    </div>
  );
}
