'use client';
import { useState, useRef } from 'react';
import { Upload, X, Image as ImageIcon } from 'lucide-react';

interface Props {
  value: string;
  onChange: (url: string) => void;
  recommended?: string;
  accentColor?: 'blue' | 'orange';
}

/**
 * Componente para escolher imagem por upload local OU URL externa.
 * - Upload via /api/upload/direct (auth required), retorna cloudStoragePath
 * - URL final servida via /api/public-image?path=...
 */
export default function ImageUploader({ value, onChange, recommended, accentColor = 'blue' }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');

  const accent = accentColor === 'orange'
    ? 'border-orange-300 text-orange-600 hover:bg-orange-50'
    : 'border-blue-300 text-blue-600 hover:bg-blue-50';

  async function handleFile(file: File) {
    setError('');
    if (!file.type.startsWith('image/')) {
      setError('Selecione uma imagem (JPG, PNG, WEBP).');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setError('Imagem muito grande. Máximo 5MB recomendado.');
      return;
    }
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('isPublic', 'true');
      const r = await fetch('/api/upload/direct', { method: 'POST', body: fd });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || 'Erro ao subir imagem');
      const url = `/api/public-image?path=${encodeURIComponent(data.cloudStoragePath)}`;
      onChange(url);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="space-y-3">
      {/* Preview */}
      {value && (
        <div className="relative inline-block">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={value} alt="preview" className="max-h-40 rounded-lg border border-slate-200" />
          <button type="button" onClick={() => onChange('')} className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full p-1 hover:bg-red-600">
            <X className="w-3 h-3" />
          </button>
        </div>
      )}

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={uploading}
          className={`inline-flex items-center gap-2 px-4 py-2 border-2 border-dashed rounded-lg text-sm font-medium ${accent} disabled:opacity-50`}
        >
          {uploading ? (
            <><div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" /> Enviando...</>
          ) : (
            <><Upload className="w-4 h-4" /> Carregar do computador</>
          )}
        </button>
        <span className="text-xs text-slate-500">ou cole uma URL abaixo</span>
      </div>

      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/gif"
        className="hidden"
        onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
      />

      <input
        type="text"
        className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        placeholder="https://... (URL externa)"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />

      {recommended && (
        <p className="text-xs text-slate-500 flex items-start gap-1">
          <ImageIcon className="w-3 h-3 mt-0.5 flex-shrink-0" />
          <span>{recommended}</span>
        </p>
      )}
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  );
}
