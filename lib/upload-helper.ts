/**
 * Upload helper que funciona tanto com S3 (presigned) quanto com local storage (direct).
 * Usado no frontend (client-side).
 */
export async function uploadFile(
  file: File,
  isPublic: boolean = false
): Promise<{ cloudStoragePath: string }> {
  // 1. Obter configuração de upload
  const presignedRes = await fetch('/api/upload/presigned', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      fileName: file.name,
      contentType: file.type,
      isPublic,
    }),
  });

  if (!presignedRes.ok) {
    const err = await presignedRes.json();
    throw new Error(err.error || 'Erro ao obter URL de upload');
  }

  const data = await presignedRes.json();

  if (data.mode === 'direct') {
    // Local storage: upload via FormData POST
    const formData = new FormData();
    formData.append('file', file);
    formData.append('isPublic', String(isPublic));

    const uploadRes = await fetch('/api/upload/direct', {
      method: 'POST',
      body: formData,
    });

    if (!uploadRes.ok) {
      const errData = await uploadRes.json().catch(() => ({}));
      throw new Error(errData.error || 'Erro ao fazer upload do arquivo');
    }

    const result = await uploadRes.json();
    return { cloudStoragePath: result.cloudStoragePath };
  } else {
    // S3: upload via presigned PUT
    const { uploadUrl, cloudStoragePath } = data;

    // Verificar headers assinados
    let signedHeaders = '';
    try {
      signedHeaders = new URL(uploadUrl).searchParams.get('X-Amz-SignedHeaders') || '';
    } catch {}
    const headers: Record<string, string> = { 'Content-Type': file.type };
    if (signedHeaders.includes('content-disposition')) {
      headers['Content-Disposition'] = 'attachment';
    }

    const uploadRes = await fetch(uploadUrl, {
      method: 'PUT',
      headers,
      body: file,
    });

    if (!uploadRes.ok) {
      throw new Error('Erro ao fazer upload do arquivo');
    }

    return { cloudStoragePath };
  }
}
