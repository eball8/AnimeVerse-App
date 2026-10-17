import React, { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, Image as ImageIcon, Video, X, Loader2 } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { uploadVideoToCloudinary } from '../services/cloudinaryService';
import { createPost } from '../services/postService';

const CreatePost: React.FC = () => {
  const navigate = useNavigate();
  const { user, profile } = useAuth();
  const [content, setContent] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [mediaType, setMediaType] = useState<'image' | 'video' | null>(null);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!user || !profile) {
    navigate('/login');
    return null;
  }

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0];
    if (!selected) return;

    if (selected.size > 50 * 1024 * 1024) {
      setError('حجم الملف كبير جداً (الحد الأقصى 50 ميجابايت).');
      return;
    }

    const type = selected.type.startsWith('video/') ? 'video' : 'image';
    setFile(selected);
    setMediaType(type);
    setError('');
    
    const objectUrl = URL.createObjectURL(selected);
    setPreview(objectUrl);
  };

  const handlePublish = async () => {
    if (!content.trim() && !file) {
      setError('أضف نصاً أو صورة/فيديو قبل النشر.');
      return;
    }

    setUploading(true);
    setError('');
    
    try {
      let mediaUrl = '';
      if (file) {
        mediaUrl = await uploadVideoToCloudinary(file, (percent: number) => setProgress(percent));
      }

      await createPost({
        authorId: user.uid,
        authorName: profile.displayName,
        authorPhotoURL: profile.photoURL,
        content: content.trim(),
        mediaUrl,
        mediaType: mediaType || undefined,
      });

      navigate('/community');
    } catch (err: any) {
      console.error(err);
      setError(err.message || 'حدث خطأ أثناء النشر.');
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="min-h-screen bg-dark-950 pb-10">
      <div className="sticky top-0 z-40 bg-dark-950/90 backdrop-blur-md px-4 py-3 border-b border-white/10 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate(-1)} className="p-2 rounded-xl hover:bg-white/10 text-slate-300">
            <ArrowRight className="w-5 h-5" />
          </button>
          <h1 className="text-sm font-black text-white">إنشاء منشور</h1>
        </div>
        
        <button onClick={handlePublish} disabled={uploading || (!content.trim() && !file)} className="px-4 py-1.5 rounded-xl bg-primary-500 text-white text-xs font-bold disabled:opacity-50 flex items-center gap-2">
          {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'نشر'}
        </button>
      </div>

      <div className="p-4 space-y-4">
        <textarea value={content} onChange={(e) => setContent(e.target.value)} placeholder="ماذا تفكر؟ أو اكتب تعليقك على الأنمي..." className="w-full h-32 bg-transparent text-white text-sm placeholder:text-slate-500 outline-none resize-none" disabled={uploading} />

        {error && <p className="text-xs text-red-400 bg-red-500/10 p-2 rounded-lg">{error}</p>}

        {uploading && file && (
          <div className="p-4 rounded-xl bg-white/5 border border-white/10 space-y-2">
            <div className="flex justify-between text-xs text-slate-400">
              <span>جاري رفع الوسائط...</span>
              <span>{progress}%</span>
            </div>
            <div className="w-full h-2 bg-dark-900 rounded-full overflow-hidden">
              <div className="h-full bg-primary-500 transition-all duration-300" style={{ width: `${progress}%` }} />
            </div>
          </div>
        )}

        {preview && (
          <div className="relative rounded-2xl overflow-hidden border border-white/10 bg-black">
            <button onClick={() => { setFile(null); setPreview(null); setMediaType(null); }} className="absolute top-2 right-2 z-10 p-1.5 bg-black/60 rounded-full text-white hover:bg-black" disabled={uploading}>
              <X className="w-4 h-4" />
            </button>
            {mediaType === 'video' ? (
              <video src={preview} controls className="w-full max-h-64 object-contain" />
            ) : (
              <img src={preview} alt="Preview" className="w-full max-h-64 object-contain" />
            )}
          </div>
        )}

        <div className="flex gap-2">
          <input type="file" accept="image/*,video/*" ref={fileInputRef} onChange={handleFileChange} className="hidden" />
          <button onClick={() => fileInputRef.current?.click()} disabled={uploading} className="flex-1 py-3 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center gap-2 text-slate-300 hover:bg-white/10 transition">
            <ImageIcon className="w-5 h-5 text-emerald-400" />
            <span className="text-xs font-bold">صورة</span>
          </button>
          
          <button onClick={() => fileInputRef.current?.click()} disabled={uploading} className="flex-1 py-3 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center gap-2 text-slate-300 hover:bg-white/10 transition">
            <Video className="w-5 h-5 text-blue-400" />
            <span className="text-xs font-bold">فيديو / ريلز</span>
          </button>
        </div>
      </div>
    </div>
  );
};

export default CreatePost;
