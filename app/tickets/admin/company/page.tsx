'use client';

import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { useEffect, useState, useCallback } from 'react';
import {
  Building2,
  Upload,
  Save,
  Palette,
  Image as ImageIcon,
  CheckCircle,
  AlertCircle,
  ArrowLeft,
  Trash2,
} from 'lucide-react';


interface TenantData {
  id: string;
  name: string;
  logoUrl: string | null;
  primaryColor: string | null;
  domain: string | null;
  planType: string;
  settingsJson: string | null;
}

export default function AdminSettingsPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [tenant, setTenant] = useState<TenantData | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Form state
  const [name, setName] = useState('');
  const [primaryColor, setPrimaryColor] = useState('#3B82F6');
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const [faviconUrl, setFaviconUrl] = useState<string | null>(null);
  const [faviconPreview, setFaviconPreview] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  const loadTenant = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/tenant');
      if (res.ok) {
        const data = await res.json();
        setTenant(data);
        setName(data.name || '');
        setPrimaryColor(data.primaryColor || '#3B82F6');
        setLogoUrl(data.logoUrl || null);
        setLogoPreview(data.logoUrl || null);
        // Parse settingsJson for extra logos
        if (data.settingsJson) {
          try {
            const s = JSON.parse(data.settingsJson);
            if (s.faviconUrl) { setFaviconUrl(s.faviconUrl); setFaviconPreview(s.faviconUrl); }
          } catch {}
        }
      }
    } catch (err) {
      console.error('Erro ao carregar configurações:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (status === 'authenticated') {
      if (session?.user?.role !== 'ADMIN') {
        router.replace('/tickets');
        return;
      }
      loadTenant();
    }
  }, [status, session, router, loadTenant]);

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      setMessage({ type: 'error', text: 'Selecione um arquivo de imagem válido.' });
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      setMessage({ type: 'error', text: 'A imagem deve ter no máximo 5MB.' });
      return;
    }

    setUploading(true);
    setMessage(null);

    try {
      // Use unified upload helper (auto-detects S3 vs Local storage)
      const { uploadFile } = await import('@/lib/upload-helper');
      const { cloudStoragePath } = await uploadFile(file, true);

      // Get public URL from the API
      const publicUrlRes = await fetch('/api/upload/public-url', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cloudStoragePath, isPublic: true }),
      });
      if (publicUrlRes.ok) {
        const { url } = await publicUrlRes.json();
        setLogoUrl(url);
      } else {
        setLogoUrl(cloudStoragePath);
      }
      
      // Show local preview
      const reader = new FileReader();
      reader.onload = (ev) => {
        setLogoPreview(ev.target?.result as string);
      };
      reader.readAsDataURL(file);

      setMessage({ type: 'success', text: 'Logo enviado com sucesso!' });
    } catch (err) {
      console.error('Erro no upload:', err);
      setMessage({ type: 'error', text: 'Erro ao enviar logo. Tente novamente.' });
    } finally {
      setUploading(false);
    }
  };

  const handleExtraUpload = async (e: React.ChangeEvent<HTMLInputElement>, type: 'favicon') => {
    const file = e.target.files?.[0];
    if (!file || !file.type.startsWith('image/')) return;
    if (file.size > 2 * 1024 * 1024) { setMessage({ type: 'error', text: 'Máximo 2MB' }); return; }
    setUploading(true);
    try {
      const { uploadFile } = await import('@/lib/upload-helper');
      const { cloudStoragePath } = await uploadFile(file, true);
      const pubRes = await fetch('/api/upload/public-url', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cloudStoragePath, isPublic: true }),
      });
      const url = pubRes.ok ? (await pubRes.json()).url : cloudStoragePath;
      if (type === 'favicon') { setFaviconUrl(url); setFaviconPreview(url); }
      setMessage({ type: 'success', text: `${type === 'favicon' ? 'Favicon' : 'Arquivo'} enviado!` });
    } catch { setMessage({ type: 'error', text: 'Erro no upload' }); }
    finally { setUploading(false); }
  };

  const handleRemoveLogo = () => {
    setLogoUrl(null);
    setLogoPreview(null);
  };

  const handleSave = async () => {
    if (!name.trim()) {
      setMessage({ type: 'error', text: 'O nome da empresa é obrigatório.' });
      return;
    }

    setSaving(true);
    setMessage(null);

    try {
      const res = await fetch('/api/admin/tenant', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          primaryColor,
          logoUrl,
          settingsJson: JSON.stringify({ faviconUrl }),
        }),
      });

      if (res.ok) {
        const data = await res.json();
        setTenant(data);
        setMessage({ type: 'success', text: 'Configurações salvas com sucesso!' });
      } else {
        const err = await res.json();
        setMessage({ type: 'error', text: err.error || 'Erro ao salvar.' });
      }
    } catch (err) {
      console.error('Erro ao salvar:', err);
      setMessage({ type: 'error', text: 'Erro ao salvar configurações.' });
    } finally {
      setSaving(false);
    }
  };

  if (status === 'loading' || loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (session?.user?.role !== 'ADMIN') return null;

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <button
          onClick={() => router.back()}
          className="p-2 rounded-lg hover:bg-white/5 text-gray-400 hover:text-white transition"
        >
          <ArrowLeft size={20} />
        </button>
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <Building2 size={28} className="text-blue-400" />
            Configurações da Empresa
          </h1>
          <p className="text-gray-400 text-sm mt-1">
            Personalize a identidade visual e informações do sistema
          </p>
        </div>
      </div>

      {/* Message */}
      {message && (
        <div
          className={`flex items-center gap-2 p-4 rounded-lg border ${
            message.type === 'success'
              ? 'bg-green-500/10 border-green-500/30 text-green-400'
              : 'bg-red-500/10 border-red-500/30 text-red-400'
          }`}
        >
          {message.type === 'success' ? <CheckCircle size={18} /> : <AlertCircle size={18} />}
          <span className="text-sm">{message.text}</span>
        </div>
      )}

      {/* Company Name */}
      <div className="rounded-xl border border-white/10 p-6" style={{ background: 'var(--bg-card)' }}>
        <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
          <Building2 size={20} className="text-blue-400" />
          Informações da Empresa
        </h2>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1.5">
              Nome da Empresa *
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ex: Winner Tecnologia"
              className="w-full px-4 py-2.5 rounded-lg bg-white/5 border border-white/10 text-white placeholder-gray-500 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none transition"
            />
            <p className="text-xs text-gray-500 mt-1">
              Este nome aparece nos relatórios, PDFs e no sistema em geral.
            </p>
          </div>
        </div>
      </div>

      {/* Logo */}
      <div className="rounded-xl border border-white/10 p-6" style={{ background: 'var(--bg-card)' }}>
        <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
          <ImageIcon size={20} className="text-blue-400" />
          Logo da Empresa
        </h2>
        <div className="space-y-4">
          {/* Preview */}
          <div className="flex items-start gap-6">
            <div className="w-32 h-32 rounded-xl border-2 border-dashed border-white/20 flex items-center justify-center overflow-hidden bg-white/5 flex-shrink-0">
              {logoPreview ? (
                <div className="relative w-full h-full">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={logoPreview}
                    alt="Logo da empresa"
                    className="w-full h-full object-contain p-2"
                  />
                </div>
              ) : (
                <div className="text-center">
                  <ImageIcon size={32} className="text-gray-600 mx-auto" />
                  <span className="text-xs text-gray-500 mt-1 block">Sem logo</span>
                </div>
              )}
            </div>
            <div className="flex-1 space-y-3">
              <p className="text-sm text-gray-400">
                Faça upload do logo da sua empresa. Ele será exibido nos relatórios PDF e no cabeçalho do sistema.
              </p>
              <p className="text-xs text-gray-500">
                Formatos: PNG, JPG, WEBP. Tamanho máximo: 5MB. Recomendado: 200x200px ou maior.
              </p>
              <div className="flex items-center gap-3">
                <label className="cursor-pointer">
                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    onChange={handleLogoUpload}
                    className="hidden"
                  />
                  <span className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium transition">
                    <Upload size={16} />
                    {uploading ? 'Enviando...' : 'Enviar Logo'}
                  </span>
                </label>
                {logoPreview && (
                  <button
                    onClick={handleRemoveLogo}
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-red-600/20 hover:bg-red-600/30 text-red-400 text-sm font-medium transition"
                  >
                    <Trash2 size={16} />
                    Remover
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Favicon Upload */}
      <div className="rounded-xl border border-white/10 p-6" style={{ background: 'var(--bg-card)' }}>
        <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
          <ImageIcon size={20} className="text-blue-400" />
          Favicon (Ícone do Site)
        </h2>
        <div className="space-y-4">
          <div className="flex items-start gap-6">
            <div className="w-16 h-16 rounded-lg border-2 border-dashed border-white/20 flex items-center justify-center overflow-hidden bg-white/5 flex-shrink-0">
              {faviconPreview ? (
                <img src={faviconPreview} alt="Favicon" className="w-full h-full object-contain p-1" />
              ) : (
                <ImageIcon size={24} className="text-gray-600" />
              )}
            </div>
            <div className="flex-1 space-y-2">
              <p className="text-sm text-gray-400">Ícone exibido na aba do navegador. Recomendado: 32x32px ou 64x64px, formato PNG.</p>
              <div className="flex items-center gap-3">
                <label className="cursor-pointer">
                  <input type="file" accept="image/png,image/x-icon,image/svg+xml" onChange={(e) => handleExtraUpload(e, 'favicon')} className="hidden" />
                  <span className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm transition">
                    <Upload size={14} /> {uploading ? 'Enviando...' : 'Upload Favicon'}
                  </span>
                </label>
                {faviconPreview && (
                  <button onClick={() => { setFaviconUrl(null); setFaviconPreview(null); }} className="text-xs text-red-400 hover:underline">Remover</button>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Primary Color */}
      <div className="rounded-xl border border-white/10 p-6" style={{ background: 'var(--bg-card)' }}>
        <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
          <Palette size={20} className="text-blue-400" />
          Cor Principal
        </h2>
        <div className="space-y-4">
          <p className="text-sm text-gray-400">
            A cor principal é usada nos relatórios PDF e em elementos de destaque do sistema.
          </p>
          <div className="flex items-center gap-4">
            <input
              type="color"
              value={primaryColor}
              onChange={(e) => setPrimaryColor(e.target.value)}
              className="w-12 h-12 rounded-lg cursor-pointer border border-white/10 bg-transparent"
            />
            <input
              type="text"
              value={primaryColor}
              onChange={(e) => setPrimaryColor(e.target.value)}
              placeholder="#3B82F6"
              className="w-32 px-4 py-2.5 rounded-lg bg-white/5 border border-white/10 text-white font-mono text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none transition"
            />
            <div
              className="w-24 h-10 rounded-lg border border-white/10"
              style={{ backgroundColor: primaryColor }}
            />
          </div>
          <div className="flex gap-2 flex-wrap">
            {['#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899', '#06B6D4', '#F97316'].map((color) => (
              <button
                key={color}
                onClick={() => setPrimaryColor(color)}
                className={`w-8 h-8 rounded-full border-2 transition ${
                  primaryColor === color ? 'border-white scale-110' : 'border-transparent hover:border-white/50'
                }`}
                style={{ backgroundColor: color }}
              />
            ))}
          </div>
        </div>
      </div>

      {/* Save Button */}
      <div className="flex justify-end pb-8">
        <button
          onClick={handleSave}
          disabled={saving}
          className="inline-flex items-center gap-2 px-6 py-3 rounded-lg bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-medium transition shadow-lg shadow-blue-600/20"
        >
          <Save size={18} />
          {saving ? 'Salvando...' : 'Salvar Configurações'}
        </button>
      </div>
    </div>
  );
}
