"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import Image from "next/image";
import {
  ArrowLeft, Plus, Trash2, Sun, Moon, Search, PlayCircle, Loader2,
  AlertTriangle, UploadCloud, X, Film, Image as ImageIcon,
} from "lucide-react";

interface Category {
  id: string;
  name: string;
  parentId: string | null;
}

interface Video {
  id: string;
  title: string;
  thumbnailUrl: string;
  videoUrl: string;
  views: number;
  createdAt: string;
}

interface Props {
  categories: Category[];
}

export function VideoManagement({ categories }: Props) {
  const [dark, setDark] = useState(false);
  const [videos, setVideos] = useState<Video[]>([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);

  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Upload Modal State
  const [showModal, setShowModal] = useState(false);
  const [uploadState, setUploadState] = useState<"idle" | "video" | "thumbnail" | "meta" | "error" | "success">("idle");
  const [progress, setProgress] = useState(0);
  const [uploadError, setUploadError] = useState("");

  const [title, setTitle] = useState("");
  const [desc, setDesc] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [thumbFile, setThumbFile] = useState<File | null>(null);

  const videoInputRef = useRef<HTMLInputElement>(null);
  const thumbInputRef = useRef<HTMLInputElement>(null);

  const sfFont = { fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Display", "SF Pro Text", "Segoe UI", system-ui, sans-serif' } as const;

  const t = dark
    ? {
        page: "bg-[#0b0b0c] text-[#f2f2f4]", card: "bg-[#151517] ring-white/[0.08]",
        soft: "text-[#8a8a8e]", body2: "text-[#b5b5ba]",
        border: "border-white/[0.08]", divide: "divide-white/[0.06]",
        hover: "hover:bg-white/[0.03]", input: "bg-white/[0.05] text-white placeholder:text-[#8a8a8e]",
        pill: "bg-white/[0.06] text-[#e5e5e7] ring-white/[0.1] hover:bg-white/[0.1]",
        bar: "bg-[#151517]/90 border-white/10", overlay: "bg-black/70", modal: "bg-[#1c1c1e] text-[#f2f2f4] ring-white/[0.1]",
      }
    : {
        page: "bg-[#f5f5f7] text-[#1d1d1f]", card: "bg-white ring-black/[0.04]",
        soft: "text-[#6e6e73]", body2: "text-[#4e4e53]",
        border: "border-black/[0.06]", divide: "divide-black/[0.06]",
        hover: "hover:bg-black/[0.015]", input: "bg-[#f5f5f7] text-[#1d1d1f] placeholder:text-[#86868b]",
        pill: "bg-white text-[#1d1d1f] ring-black/[0.06] hover:bg-black/[0.02]",
        bar: "bg-white/80 border-black/[0.06]", overlay: "bg-slate-900/40", modal: "bg-white text-[#1d1d1f] shadow-2xl ring-black/[0.06]",
      };

  const fetchVideos = async (p: number, overwrite = false) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/videos?page=${p}&limit=20`);
      const json = await res.json();
      if (json.success) {
        if (overwrite) setVideos(json.data);
        else setVideos((prev) => [...prev, ...json.data]);
        setHasMore(json.hasMore);
        setTotal(json.total);
      }
    } catch (e) {
      console.error(e);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchVideos(1, true);
  }, []);

  const loadMore = () => {
    if (!loading && hasMore) {
      setPage(p => p + 1);
      fetchVideos(page + 1);
    }
  };

  const resetUpload = () => {
    setUploadState("idle");
    setProgress(0);
    setUploadError("");
    setTitle("");
    setDesc("");
    setCategoryId("");
    setVideoFile(null);
    setThumbFile(null);
  };

  const uploadToS3 = (file: File, url: string, fields?: Record<string, string>): Promise<void> => {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      
      if (fields) {
        // Presigned POST
        xhr.open("POST", url);
        const formData = new FormData();
        Object.entries(fields).forEach(([k, v]) => formData.append(k, v));
        formData.append("file", file);
        
        xhr.upload.onprogress = (e) => {
          if (e.lengthComputable) {
            setProgress(Math.round((e.loaded / e.total) * 100));
          }
        };
        
        xhr.onload = () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            resolve();
          } else {
            reject(new Error(`HTTP ${xhr.status}: ${xhr.responseText || xhr.statusText}`));
          }
        };
        
        xhr.onerror = () => reject(new Error("Network error"));
        xhr.send(formData);
      } else {
        // Fallback for PUT
        xhr.open("PUT", url);
        xhr.setRequestHeader("Content-Type", file.type);
        
        xhr.upload.onprogress = (e) => {
          if (e.lengthComputable) {
            setProgress(Math.round((e.loaded / e.total) * 100));
          }
        };
        
        xhr.onload = () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            resolve();
          } else {
            reject(new Error(`HTTP ${xhr.status}: ${xhr.statusText}`));
          }
        };
        
        xhr.onerror = () => reject(new Error("Network error"));
        xhr.send(file);
      }
    });
  };

  const getPresignedUrl = async (kind: "video" | "thumbnail", file: File) => {
    const res = await fetch("/api/admin/videos/upload-url", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kind, contentType: file.type })
    });
    const json = await res.json();
    if (!res.ok || !json.success) throw new Error(json.error || `Failed to get ${kind} upload URL`);
    return json;
  };

  const handleUploadSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!videoFile || !thumbFile || !title.trim()) {
      setUploadError("Video, thumbnail, and title are required.");
      return;
    }

    try {
      // 1. Get presigned URLs
      setUploadState("video");
      setProgress(0);
      const videoData = await getPresignedUrl("video", videoFile);
      
      // 2. Upload video
      await uploadToS3(videoFile, videoData.uploadUrl, videoData.uploadFields);

      // 3. Get thumb URL & Upload thumbnail
      setUploadState("thumbnail");
      setProgress(0);
      const thumbData = await getPresignedUrl("thumbnail", thumbFile);
      await uploadToS3(thumbFile, thumbData.uploadUrl, thumbData.uploadFields);

      // 4. Save metadata
      setUploadState("meta");
      setProgress(0);
      const res = await fetch("/api/videos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          description: desc,
          categoryId: categoryId || null,
          videoUrl: videoData.publicUrl,
          thumbnailUrl: thumbData.publicUrl,
        })
      });

      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error || "Failed to save video metadata.");
      }

      setUploadState("success");
      fetchVideos(1, true); // Refresh list
      setTimeout(() => {
        setShowModal(false);
        resetUpload();
      }, 2000);

    } catch (err: any) {
      console.error(err);
      setUploadState("error");
      setUploadError(err.message || "An unexpected error occurred.");
    }
  };

  const handleDelete = async (id: string) => {
    setDeleting(true);
    try {
      const res = await fetch(`/api/videos/${id}`, { method: "DELETE" });
      if (res.ok) {
        setVideos(videos.filter(v => v.id !== id));
        setTotal(t => t - 1);
      } else {
        alert("Failed to delete video");
      }
    } catch (e) {
      console.error(e);
      alert("Failed to delete video");
    }
    setDeleting(false);
    setDeleteConfirm(null);
  };

  return (
    <div style={sfFont} className={`min-h-screen ${t.page}`}>
      {/* Top bar */}
      <header className={`sticky top-0 z-30 border-b backdrop-blur-xl ${t.bar}`}>
        <div className="mx-auto flex max-w-[1600px] items-center gap-3 px-4 py-3 sm:px-6">
          <Link
            href="/admin/"
            className={`inline-flex items-center gap-1.5 rounded-xl px-2.5 py-2 text-[13px] font-semibold ring-1 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand ${t.pill}`}
          >
            <ArrowLeft size={15} aria-hidden="true" />
            <span className="hidden sm:inline">Dashboard</span>
          </Link>
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg">
            <Image src="/logo.png" alt="" width={22} height={22} className="object-contain" />
          </span>
          <div className="min-w-0 flex-1 leading-tight">
            <h1 className="truncate text-[15px] font-semibold tracking-tight">Videos</h1>
            <p className={`text-[11px] ${t.soft}`}>{total.toLocaleString()} uploaded</p>
          </div>
          <button
            onClick={() => setShowModal(true)}
            className="inline-flex items-center gap-2 rounded-xl bg-brand px-3.5 py-2 text-[13px] font-semibold text-white transition-colors hover:bg-brand-dark focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
          >
            <Plus size={15} /> Upload Video
          </button>
          <button
            type="button"
            onClick={() => setDark((d) => !d)}
            className={`ml-2 inline-flex items-center gap-2 rounded-xl px-3 py-2 text-[13px] font-semibold ring-1 transition-colors ${t.pill}`}
          >
            {dark ? <Sun size={15} /> : <Moon size={15} />}
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-[1600px] px-4 py-6 sm:px-6">
        {videos.length === 0 && !loading ? (
          <div className={`rounded-2xl px-6 py-16 text-center ring-1 ${t.card}`}>
            <PlayCircle size={32} className={`mx-auto mb-4 opacity-50 ${t.soft}`} />
            <p className="text-[14px] font-semibold">No videos found.</p>
            <p className={`mt-1 text-[13px] ${t.soft}`}>Upload your first video to start building your library.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
            {videos.map((v) => (
              <div key={v.id} className={`group relative flex flex-col overflow-hidden rounded-2xl ring-1 transition-shadow hover:shadow-md ${t.card}`}>
                <div className="relative aspect-[9/16] w-full overflow-hidden bg-black/5">
                  <Image src={v.thumbnailUrl} alt={v.title} fill className="object-cover" />
                  <div className="absolute inset-0 flex items-center justify-center bg-black/20 opacity-0 transition-opacity group-hover:opacity-100">
                    <a href={v.videoUrl} target="_blank" rel="noopener noreferrer" className="rounded-full bg-white/20 p-3 backdrop-blur-md transition-colors hover:bg-white/40">
                      <PlayCircle size={28} className="text-white" />
                    </a>
                  </div>
                </div>
                <div className={`flex flex-1 flex-col p-3 ${t.divide}`}>
                  <p className="line-clamp-2 text-[13px] font-semibold leading-tight">{v.title}</p>
                  <div className="mt-auto flex items-center justify-between pt-2">
                    <p className={`text-[11px] ${t.soft}`}>{v.views.toLocaleString()} views</p>
                    <button
                      onClick={() => setDeleteConfirm(v.id)}
                      className={`rounded-lg p-1.5 transition-colors hover:bg-red-500/10 hover:text-red-500 ${t.soft}`}
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {hasMore && (
          <div className="mt-8 flex justify-center">
            <button
              onClick={loadMore}
              disabled={loading}
              className={`rounded-xl px-5 py-2.5 text-[13px] font-semibold ring-1 transition-colors ${t.pill}`}
            >
              {loading ? <Loader2 size={16} className="animate-spin" /> : "Load more videos"}
            </button>
          </div>
        )}
      </main>

      {/* Upload Modal */}
      {showModal && (
        <div className={`fixed inset-0 z-50 flex items-center justify-center p-4 backdrop-blur-sm ${t.overlay}`}>
          <div className={`relative w-full max-w-lg overflow-hidden rounded-3xl ${t.modal}`}>
            <div className={`flex items-center justify-between border-b px-5 py-4 ${t.border}`}>
              <h2 className="text-[15px] font-semibold">Upload Video</h2>
              <button
                onClick={() => {
                  if (uploadState === "idle" || uploadState === "error" || uploadState === "success") {
                    setShowModal(false);
                    resetUpload();
                  }
                }}
                disabled={uploadState === "video" || uploadState === "thumbnail" || uploadState === "meta"}
                className={`rounded-full p-1.5 transition-colors hover:bg-black/5 disabled:opacity-50`}
              >
                <X size={16} />
              </button>
            </div>
            
            <form onSubmit={handleUploadSubmit} className="p-5">
              <div className="space-y-4">
                <div>
                  <label className="mb-1.5 block text-[12px] font-medium">Video Title *</label>
                  <input
                    type="text"
                    required
                    value={title}
                    onChange={e => setTitle(e.target.value)}
                    disabled={uploadState !== "idle" && uploadState !== "error"}
                    className={`w-full rounded-xl border-0 px-3 py-2 text-[13.5px] outline-none ring-1 ring-transparent transition-shadow focus:ring-2 focus:ring-brand ${t.input}`}
                    placeholder="Enter video title"
                  />
                </div>
                
                <div>
                  <label className="mb-1.5 block text-[12px] font-medium">Description</label>
                  <textarea
                    value={desc}
                    onChange={e => setDesc(e.target.value)}
                    disabled={uploadState !== "idle" && uploadState !== "error"}
                    rows={3}
                    className={`w-full resize-none rounded-xl border-0 px-3 py-2 text-[13.5px] outline-none ring-1 ring-transparent transition-shadow focus:ring-2 focus:ring-brand ${t.input}`}
                    placeholder="Optional description"
                  />
                </div>

                <div>
                  <label className="mb-1.5 block text-[12px] font-medium">Category</label>
                  <select
                    value={categoryId}
                    onChange={e => setCategoryId(e.target.value)}
                    disabled={uploadState !== "idle" && uploadState !== "error"}
                    className={`w-full rounded-xl border-0 px-3 py-2.5 text-[13.5px] outline-none ring-1 ring-transparent transition-shadow focus:ring-2 focus:ring-brand ${t.input}`}
                  >
                    <option value="">None</option>
                    {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  {/* Video File */}
                  <div>
                    <label className="mb-1.5 block text-[12px] font-medium">Video File * (.mp4)</label>
                    <div 
                      onClick={() => uploadState === "idle" || uploadState === "error" ? videoInputRef.current?.click() : null}
                      className={`flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed p-4 transition-colors ${videoFile ? 'border-brand bg-brand/5' : `${t.border} ${t.hover}`} ${uploadState !== "idle" && uploadState !== "error" ? 'pointer-events-none opacity-60' : ''}`}
                    >
                      <Film size={24} className={videoFile ? "text-brand" : t.soft} />
                      <p className={`mt-2 text-center text-[11px] font-medium ${videoFile ? "text-brand" : t.soft}`}>
                        {videoFile ? videoFile.name : "Select Video"}
                      </p>
                      <input 
                        type="file" 
                        accept="video/mp4,video/quicktime" 
                        className="hidden" 
                        ref={videoInputRef}
                        onChange={e => {
                          const f = e.target.files?.[0];
                          if (f) {
                            if (f.size > 100 * 1024 * 1024) { alert("Video too large (max 100MB)"); return; }
                            setVideoFile(f);
                          }
                        }}
                      />
                    </div>
                  </div>
                  
                  {/* Thumbnail File */}
                  <div>
                    <label className="mb-1.5 block text-[12px] font-medium">Thumbnail * (9:16)</label>
                    <div 
                      onClick={() => uploadState === "idle" || uploadState === "error" ? thumbInputRef.current?.click() : null}
                      className={`flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed p-4 transition-colors ${thumbFile ? 'border-brand bg-brand/5' : `${t.border} ${t.hover}`} ${uploadState !== "idle" && uploadState !== "error" ? 'pointer-events-none opacity-60' : ''}`}
                    >
                      <ImageIcon size={24} className={thumbFile ? "text-brand" : t.soft} />
                      <p className={`mt-2 text-center text-[11px] font-medium ${thumbFile ? "text-brand" : t.soft}`}>
                        {thumbFile ? thumbFile.name : "Select Image"}
                      </p>
                      <input 
                        type="file" 
                        accept="image/jpeg,image/png,image/webp" 
                        className="hidden" 
                        ref={thumbInputRef}
                        onChange={e => {
                          const f = e.target.files?.[0];
                          if (f) {
                            if (f.size > 5 * 1024 * 1024) { alert("Thumbnail too large (max 5MB)"); return; }
                            setThumbFile(f);
                          }
                        }}
                      />
                    </div>
                  </div>
                </div>

                {uploadError && (
                  <div className="flex items-center gap-2 rounded-xl bg-red-500/10 p-3 text-[12px] font-medium text-red-600">
                    <AlertTriangle size={14} />
                    {uploadError}
                  </div>
                )}

                {uploadState !== "idle" && uploadState !== "error" && (
                  <div className={`rounded-xl p-4 ring-1 ${t.card}`}>
                    <div className="mb-2 flex items-center justify-between text-[12px] font-medium">
                      <span className="flex items-center gap-2">
                        {uploadState === "success" ? (
                          <span className="text-emerald-500">Upload Complete!</span>
                        ) : (
                          <>
                            <Loader2 size={14} className="animate-spin text-brand" />
                            <span>
                              {uploadState === "video" ? "Uploading video to S3..." 
                               : uploadState === "thumbnail" ? "Uploading thumbnail to S3..."
                               : "Saving metadata..."}
                            </span>
                          </>
                        )}
                      </span>
                      {uploadState === "video" || uploadState === "thumbnail" ? <span>{progress}%</span> : null}
                    </div>
                    <div className={`h-2 w-full overflow-hidden rounded-full ${t.input}`}>
                      <div 
                        className="h-full bg-brand transition-all duration-300 ease-out"
                        style={{ width: uploadState === "meta" || uploadState === "success" ? "100%" : `${progress}%` }}
                      />
                    </div>
                  </div>
                )}
              </div>

              <div className={`mt-6 flex justify-end gap-3 border-t pt-4 ${t.border}`}>
                <button
                  type="button"
                  onClick={() => { setShowModal(false); resetUpload(); }}
                  disabled={uploadState === "video" || uploadState === "thumbnail" || uploadState === "meta"}
                  className={`rounded-xl px-4 py-2 text-[13px] font-semibold ring-1 transition-colors focus-visible:outline-none ${t.pill} disabled:opacity-50`}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={uploadState !== "idle" && uploadState !== "error"}
                  className="inline-flex items-center gap-2 rounded-xl bg-brand px-5 py-2 text-[13px] font-semibold text-white transition-colors hover:bg-brand-dark disabled:opacity-50"
                >
                  <UploadCloud size={16} />
                  Start Upload
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Modal */}
      {deleteConfirm && (
        <div className={`fixed inset-0 z-50 flex items-center justify-center p-4 backdrop-blur-sm ${t.overlay}`}>
          <div className={`relative w-full max-w-sm overflow-hidden rounded-3xl p-6 text-center ${t.modal}`}>
            <AlertTriangle size={32} className="mx-auto mb-4 text-red-500" />
            <h2 className="text-[17px] font-semibold">Delete Video?</h2>
            <p className={`mt-2 text-[13px] leading-relaxed ${t.soft}`}>
              This will permanently delete the video row from the database and remove the files from S3. This cannot be undone.
            </p>
            <div className="mt-6 flex justify-center gap-3">
              <button
                onClick={() => setDeleteConfirm(null)}
                disabled={deleting}
                className={`flex-1 rounded-xl px-4 py-2.5 text-[13px] font-semibold ring-1 transition-colors ${t.pill}`}
              >
                Cancel
              </button>
              <button
                onClick={() => handleDelete(deleteConfirm)}
                disabled={deleting}
                className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl bg-red-500 px-4 py-2.5 text-[13px] font-semibold text-white transition-colors hover:bg-red-600 disabled:opacity-50"
              >
                {deleting ? <Loader2 size={16} className="animate-spin" /> : "Delete"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
