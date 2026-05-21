/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState } from "react";
import { Upload } from "lucide-react";
import ModelViewer from "./components/ModelViewer";

export default function App() {
  const [modelUrl, setModelUrl] = useState<string | null>(null);

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      if (modelUrl) {
         URL.revokeObjectURL(modelUrl);
      }
      const url = URL.createObjectURL(file);
      setModelUrl(url);
    }
  };

  if (modelUrl) {
    return (
      <div className="w-screen h-screen overflow-hidden bg-gray-50 relative">
        <ModelViewer fileUrl={modelUrl} />
        <label className="absolute top-4 right-4 z-50 cursor-pointer inline-flex items-center gap-2 px-4 py-2 bg-white/80 backdrop-blur-md border border-gray-200 text-gray-700 hover:bg-white hover:text-indigo-600 font-medium rounded-lg shadow-sm transition-all text-sm">
          <Upload className="w-4 h-4" />
          Tải file khác
          <input 
            type="file" 
            accept=".glb,.gltf" 
            className="hidden" 
            onChange={handleFileUpload}
          />
        </label>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-6 font-sans text-gray-900">
      <div className="bg-white p-8 md:p-12 rounded-3xl shadow-sm border border-gray-100 max-w-md w-full text-center flex flex-col items-center">
        <div className="w-16 h-16 bg-indigo-50 rounded-2xl flex items-center justify-center text-indigo-600 mb-6">
          <Upload className="w-8 h-8" />
        </div>
        <h2 className="text-2xl font-bold text-gray-900 mb-2">3D Web Viewer</h2>
        <p className="text-gray-500 mb-8 w-full max-w-xs mx-auto">
          Tải lên mô hình 3D của bạn để xem trên trình duyệt. Hỗ trợ định dạng .glb và .gltf.
        </p>
        <label className="cursor-pointer inline-flex items-center justify-center gap-2 w-full px-6 py-4 bg-indigo-600 hover:bg-indigo-700 text-white font-medium rounded-xl transition-colors shadow-sm">
          <Upload className="w-5 h-5" />
          Chọn File .GLB / .GLTF
          <input 
            type="file" 
            accept=".glb,.gltf" 
            className="hidden" 
            onChange={handleFileUpload}
          />
        </label>
      </div>
    </div>
  );
}

