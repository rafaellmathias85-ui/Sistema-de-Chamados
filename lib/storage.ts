/**
 * Storage Provider Abstraction Layer
 * Permite alternar entre S3 (Abacus/AWS) e Local (VPS) via STORAGE_PROVIDER env var.
 * 
 * Uso:
 *   import { getStorageProvider } from '@/lib/storage';
 *   const storage = getStorageProvider();
 *   await storage.save(key, buffer, contentType);
 *   const url = await storage.getUrl(key, isPublic);
 *   await storage.delete(key);
 */

import path from 'path';
import fs from 'fs/promises';
import { createReadStream, existsSync } from 'fs';
import { Readable } from 'stream';
import { v4 as uuidv4 } from 'uuid';

// ============================
// Interface
// ============================

export interface StorageProvider {
  /** Salva um arquivo e retorna o cloudStoragePath (key) */
  save(fileName: string, data: Buffer, contentType: string, isPublic?: boolean): Promise<{ cloudStoragePath: string }>;
  /** Retorna URL de acesso ao arquivo (presigned para S3, ou rota interna para local) */
  getUrl(cloudStoragePath: string, isPublic?: boolean): Promise<string>;
  /** Retorna um readable stream do arquivo */
  getStream(cloudStoragePath: string): Promise<Readable>;
  /** Deleta o arquivo */
  delete(cloudStoragePath: string): Promise<void>;
  /** Identifica o tipo de provider */
  readonly type: 'local' | 's3';
}

// ============================
// S3 Storage Provider
// ============================

class S3StorageProvider implements StorageProvider {
  readonly type = 's3' as const;

  async save(fileName: string, data: Buffer, contentType: string, isPublic = false): Promise<{ cloudStoragePath: string }> {
    const { PutObjectCommand } = await import('@aws-sdk/client-s3');
    const { createS3Client, getBucketConfig } = await import('./aws-config');
    const s3 = createS3Client();
    const { bucketName, folderPrefix } = getBucketConfig();

    const timestamp = Date.now();
    const sanitized = fileName.replace(/[^a-zA-Z0-9.-]/g, '_');
    const cloudStoragePath = isPublic
      ? `${folderPrefix}public/uploads/${timestamp}-${sanitized}`
      : `${folderPrefix}uploads/${timestamp}-${sanitized}`;

    await s3.send(new PutObjectCommand({
      Bucket: bucketName,
      Key: cloudStoragePath,
      Body: data,
      ContentType: contentType,
      ContentDisposition: isPublic ? 'attachment' : undefined,
    }));

    return { cloudStoragePath };
  }

  async getUrl(cloudStoragePath: string, isPublic = false): Promise<string> {
    const { getFileUrl } = await import('./s3');
    return getFileUrl(cloudStoragePath, isPublic);
  }

  async getStream(cloudStoragePath: string): Promise<Readable> {
    const { GetObjectCommand } = await import('@aws-sdk/client-s3');
    const { createS3Client, getBucketConfig } = await import('./aws-config');
    const s3 = createS3Client();
    const { bucketName } = getBucketConfig();

    const res = await s3.send(new GetObjectCommand({
      Bucket: bucketName,
      Key: cloudStoragePath,
    }));
    return res.Body as Readable;
  }

  async delete(cloudStoragePath: string): Promise<void> {
    const { deleteFile } = await import('./s3');
    await deleteFile(cloudStoragePath);
  }
}

// ============================
// Local Storage Provider (VPS)
// ============================

class LocalStorageProvider implements StorageProvider {
  readonly type = 'local' as const;
  private baseDir: string;

  constructor() {
    this.baseDir = process.env.UPLOADS_DIR || '/var/lib/helpdesk/uploads';
  }

  private buildLocalPath(fileName: string): { relativePath: string; fullPath: string } {
    const now = new Date();
    const year = now.getFullYear().toString();
    const month = (now.getMonth() + 1).toString().padStart(2, '0');
    const ext = path.extname(fileName) || '';
    const uniqueName = `${uuidv4()}${ext}`;
    const relativePath = `${year}/${month}/${uniqueName}`;
    const fullPath = path.join(this.baseDir, relativePath);
    return { relativePath, fullPath };
  }

  async save(fileName: string, data: Buffer, _contentType: string, _isPublic = false): Promise<{ cloudStoragePath: string }> {
    const { relativePath, fullPath } = this.buildLocalPath(fileName);
    const dir = path.dirname(fullPath);

    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(fullPath, data, { mode: 0o640 });

    // Prefixo "local:" para distinguir no banco
    return { cloudStoragePath: `local:${relativePath}` };
  }

  async getUrl(cloudStoragePath: string, _isPublic = false): Promise<string> {
    // Para local, retorna a rota interna da API que faz streaming
    // O ID do attachment é usado pela rota /api/attachments/[id]
    // Aqui retornamos um placeholder — o caller deve usar getStream diretamente
    return `/api/attachments/download?path=${encodeURIComponent(cloudStoragePath)}`;
  }

  async getStream(cloudStoragePath: string): Promise<Readable> {
    const relPath = cloudStoragePath.replace(/^local:/, '');
    const fullPath = path.join(this.baseDir, relPath);

    if (!existsSync(fullPath)) {
      throw new Error(`Arquivo não encontrado: ${fullPath}`);
    }

    // Prevenir path traversal
    const resolved = path.resolve(fullPath);
    if (!resolved.startsWith(path.resolve(this.baseDir))) {
      throw new Error('Acesso negado: path traversal detectado');
    }

    return createReadStream(fullPath);
  }

  async delete(cloudStoragePath: string): Promise<void> {
    const relPath = cloudStoragePath.replace(/^local:/, '');
    const fullPath = path.join(this.baseDir, relPath);

    const resolved = path.resolve(fullPath);
    if (!resolved.startsWith(path.resolve(this.baseDir))) {
      throw new Error('Acesso negado: path traversal detectado');
    }

    try {
      await fs.unlink(fullPath);
    } catch (err: any) {
      if (err.code !== 'ENOENT') throw err;
    }
  }
}

// ============================
// Factory / Singleton
// ============================

let _provider: StorageProvider | null = null;

export function getStorageProvider(): StorageProvider {
  if (!_provider) {
    const providerType = (process.env.STORAGE_PROVIDER || 's3').toLowerCase();
    if (providerType === 'local') {
      _provider = new LocalStorageProvider();
      console.log('[Storage] Usando LocalStorageProvider →', process.env.UPLOADS_DIR || '/var/lib/helpdesk/uploads');
    } else {
      _provider = new S3StorageProvider();
      console.log('[Storage] Usando S3StorageProvider');
    }
  }
  return _provider;
}

/** Helper para determinar se um path é local ou S3 */
export function isLocalPath(cloudStoragePath: string): boolean {
  return cloudStoragePath.startsWith('local:');
}
