/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect } from "react";
import { Upload, Share2, Loader2, LogIn, Check } from "lucide-react";
import { v4 as uuidv4 } from "uuid";
import { ref, uploadBytesResumable, getDownloadURL } from "firebase/storage";
import {
  signInWithPopup,
  GoogleAuthProvider,
  onAuthStateChanged,
  User,
} from "firebase/auth";
import { doc, setDoc, getDoc, serverTimestamp } from "firebase/firestore";
import { auth, storage, db } from "./lib/firebase";
import ModelViewer from "./components/ModelViewer";

export default function App() {
  const [modelUrl, setModelUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [user, setUser] = useState<User | null>(null);
  const [authChecking, setAuthChecking] = useState(true);
  const [shareCopied, setShareCopied] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  useEffect(() => {
    const queryParams = new URLSearchParams(window.location.search);
    const sharedModelId = queryParams.get("model");

    if (sharedModelId) {
      // Load model from Firestore
      const loadSharedModel = async () => {
        try {
          const docRef = doc(db, "models", sharedModelId);
          const docSnap = await getDoc(docRef);
          if (docSnap.exists()) {
            setModelUrl(docSnap.data().url);
          } else {
            console.error("Model not found in database");
          }
        } catch (error) {
          console.error("Error loading shared model:", error);
        }
      };
      loadSharedModel();
    }

    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setAuthChecking(false);
    });

    return () => unsubscribe();
  }, []);

  const login = async () => {
    setAuthError(null);
    const provider = new GoogleAuthProvider();
    provider.setCustomParameters({ prompt: "select_account" });
    try {
      await signInWithPopup(auth, provider);
    } catch (error: any) {
      console.error("Error signing in", error);
      if (error.code === "auth/popup-closed-by-user") {
        setAuthError("Đăng nhập bị hủy.");
      } else if (error.code === "auth/popup-blocked") {
        setAuthError("Vui lòng cho phép popup để đăng nhập.");
      } else {
        setAuthError("Lỗi đăng nhập, vui lòng thử lại sau.");
      }
    }
  };

  const handleFileUpload = async (
    event: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const file = event.target.files?.[0];
    if (file && user) {
      setUploading(true);
      setProgress(0);

      const fileId = uuidv4();
      const storageRef = ref(
        storage,
        `models/${user.uid}/${fileId}_${file.name}`,
      );

      const uploadTask = uploadBytesResumable(storageRef, file);

      uploadTask.on(
        "state_changed",
        (snapshot) => {
          const p = Math.round(
            (snapshot.bytesTransferred / snapshot.totalBytes) * 100,
          );
          setProgress(p);
        },
        (error) => {
          console.error("Upload failed", error);
          setUploading(false);
        },
        async () => {
          const downloadURL = await getDownloadURL(uploadTask.snapshot.ref);

          // Save metadata to Firestore
          try {
            await setDoc(doc(db, "models", fileId), {
              name: file.name,
              url: downloadURL,
              ownerId: user.uid,
              createdAt: serverTimestamp(),
            });

            // Update URL to make it shareable
            window.history.pushState({}, "", `?model=${fileId}`);
            setModelUrl(downloadURL);
            setUploading(false);
          } catch (err) {
            console.error("Error saving metadata", err);
            setUploading(false);
          }
        },
      );
    } else if (file && !user) {
      // If no user, just load locally
      if (modelUrl && !modelUrl.includes("firebasestorage")) {
        URL.revokeObjectURL(modelUrl);
      }
      const url = URL.createObjectURL(file);
      setModelUrl(url);
    }
  };

  const copyShareLink = () => {
    navigator.clipboard.writeText(window.location.href);
    setShareCopied(true);
    setTimeout(() => setShareCopied(false), 2000);
  };

  if (authChecking) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-indigo-500" />
      </div>
    );
  }

  if (modelUrl) {
    return (
      <div className="w-screen h-screen overflow-hidden bg-gray-50 relative">
        <ModelViewer fileUrl={modelUrl} />

        <div className="absolute top-4 right-4 z-50 flex items-center gap-3">
          {window.location.search.includes("model=") && (
            <button
              onClick={copyShareLink}
              className="cursor-pointer inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white font-medium rounded-lg shadow-sm hover:bg-indigo-700 transition-all text-sm"
            >
              {shareCopied ? (
                <Check className="w-4 h-4" />
              ) : (
                <Share2 className="w-4 h-4" />
              )}
              {shareCopied ? "Đã copy link" : "Chia sẻ"}
            </button>
          )}

          <label className="cursor-pointer inline-flex items-center gap-2 px-4 py-2 bg-white/80 backdrop-blur-md border border-gray-200 text-gray-700 hover:bg-white hover:text-indigo-600 font-medium rounded-lg shadow-sm transition-all text-sm">
            {uploading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" /> {progress}%
              </>
            ) : (
              <>
                <Upload className="w-4 h-4" /> Tải file khác
              </>
            )}
            <input
              type="file"
              accept=".glb,.gltf"
              className="hidden"
              onChange={handleFileUpload}
              disabled={uploading}
            />
          </label>
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
              {progress}%
            </p>
            <p className="text-gray-500 text-sm mt-1">
              Đang tải lên máy chủ...
            </p>
          </div>
        )}

        <div className="w-16 h-16 bg-indigo-50 rounded-2xl flex items-center justify-center text-indigo-600 mb-6">
          <Upload className="w-8 h-8" />
        </div>
        <h2 className="text-2xl font-bold text-gray-900 mb-2">3D Web Viewer</h2>
        <p className="text-gray-500 mb-8 w-full max-w-xs mx-auto">
          Tải lên mô hình 3D của bạn để xem trên trình duyệt và chia sẻ. Hỗ trợ
          định dạng .glb và .gltf.
        </p>

        {authError && (
          <div className="mb-4 w-full p-3 bg-red-50 text-red-600 text-sm rounded-lg border border-red-100">
            {authError}
          </div>
        )}

        {!user ? (
          <div className="w-full flex flex-col gap-3">
            <button
              onClick={login}
              className="w-full inline-flex items-center justify-center gap-2 px-6 py-4 bg-indigo-600 hover:bg-indigo-700 text-white font-medium rounded-xl transition-colors shadow-sm"
            >
              <LogIn className="w-5 h-5" />
              Đăng nhập Google để Lưu & Chia Sẻ
            </button>

            <label className="cursor-pointer inline-flex items-center justify-center gap-2 w-full px-6 py-4 bg-gray-100 hover:bg-gray-200 text-gray-700 font-medium rounded-xl transition-colors shadow-sm">
              Xem Offline (Không lưu)
              <input
                type="file"
                accept=".glb,.gltf"
                className="hidden"
                onChange={handleFileUpload}
              />
            </label>
          </div>
        ) : (
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
        )}
      </div>
    </div>
  );
}
