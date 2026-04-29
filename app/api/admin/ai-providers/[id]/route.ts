import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/session';
import { prisma } from '@/lib/db';
import { encryptSecret } from '@/lib/mfa';
import {
  invalidateProvidersCache,
  isBuiltinProvider,
} from '@/lib/ai-providers';

export const dynamic = 'force-dynamic';

/**
 * PATCH /api/admin/ai-providers/[id]
 * Atualiza um provedor.
 *  - Built-ins (id começa com "builtin:Name"): UPSERT em AIProviderConfig com isCustom=false.
 *    Apenas campos seguros podem ser editados (priority, weight, enabled, model, bestFor).
 *    NÃO editar: name, endpoint, apiKeyEnv, apiKey (built-ins usam env vars).
 *  - Custom (id real): atualiza qualquer campo, exceto name (imutável).
 *
 * Body (parcial): { priority?, weight?, enabled?, model?, bestFor?, endpoint?, apiKey?, apiFormat? }
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getSession();
  if (!session?.user || session.user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Acesso negado' }, { status: 403 });
  }

  try {
    const id = params.id;
    const body = await request.json().catch(() => ({}));
    const validBestFor = ['fast', 'creative', 'complex', 'general'];

    // Detecta built-in pelo prefixo
    const isBuiltinId = id.startsWith('builtin:');

    if (isBuiltinId) {
      const name = id.slice('builtin:'.length);
      if (!isBuiltinProvider(name)) {
        return NextResponse.json({ error: 'Built-in inválido' }, { status: 400 });
      }

      // UPSERT da config do built-in (apenas campos seguros)
      const data: Record<string, unknown> = {};
      if (typeof body.priority === 'number') data.priority = Math.max(1, Math.min(99, body.priority));
      if (typeof body.weight === 'number') data.weight = Math.max(1, Math.min(100, body.weight));
      if (typeof body.enabled === 'boolean') data.enabled = body.enabled;
      if (typeof body.model === 'string' && body.model.trim()) data.model = body.model.trim();
      if (Array.isArray(body.bestFor)) {
        data.bestFor = body.bestFor.filter((v: string) => validBestFor.includes(v)).join(',') || 'general';
      }

      // Para built-ins, endpoint/apiKey/apiKeyEnv são fixos
      // (built-in usa env var, não criptografa nova chave)
      const existing = await prisma.aIProviderConfig.findUnique({ where: { name } });

      if (existing) {
        await prisma.aIProviderConfig.update({
          where: { name },
          data,
        });
      } else {
        // Cria registro de override do built-in
        const apiKeyEnvMap: Record<string, string> = {
          'AbacusAI': 'ABACUSAI_API_KEY',
          'OpenAI': 'OPENAI_API_KEY',
          'Google Gemini': 'GEMINI_API_KEY',
        };
        const endpointMap: Record<string, string> = {
          'AbacusAI': 'https://apps.abacus.ai/v1/chat/completions',
          'OpenAI': 'https://api.openai.com/v1/chat/completions',
          'Google Gemini': 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions',
        };

        await prisma.aIProviderConfig.create({
          data: {
            name,
            endpoint: endpointMap[name] || '',
            model: (data.model as string) || '',
            apiKeyEnv: apiKeyEnvMap[name] || null,
            apiKeyEnc: null,
            priority: (data.priority as number) ?? 99,
            weight: (data.weight as number) ?? 1,
            enabled: (data.enabled as boolean) ?? true,
            bestFor: (data.bestFor as string) || 'general',
            isCustom: false,
            apiFormat: 'openai_compatible',
          },
        });
      }

      invalidateProvidersCache();
      console.log(`[AI Providers] Built-in '${name}' atualizado por ${session.user.email}`);

      return NextResponse.json({ success: true });
    }

    // CUSTOM
    const provider = await prisma.aIProviderConfig.findUnique({ where: { id } });
    if (!provider) {
      return NextResponse.json({ error: 'Provedor não encontrado' }, { status: 404 });
    }
    if (!provider.isCustom) {
      return NextResponse.json(
        { error: 'Provedor é built-in; use o id builtin:NomeDoProvedor' },
        { status: 400 }
      );
    }

    const data: Record<string, unknown> = {};
    if (typeof body.priority === 'number') data.priority = Math.max(1, Math.min(99, body.priority));
    if (typeof body.weight === 'number') data.weight = Math.max(1, Math.min(100, body.weight));
    if (typeof body.enabled === 'boolean') data.enabled = body.enabled;
    if (typeof body.model === 'string' && body.model.trim()) data.model = body.model.trim();
    if (typeof body.endpoint === 'string' && /^https?:\/\//.test(body.endpoint)) {
      data.endpoint = body.endpoint.trim();
    }
    if (Array.isArray(body.bestFor)) {
      data.bestFor = body.bestFor.filter((v: string) => validBestFor.includes(v)).join(',') || 'general';
    }
    if (typeof body.apiFormat === 'string') {
      data.apiFormat = body.apiFormat === 'anthropic' ? 'anthropic' : 'openai_compatible';
    }
    if (typeof body.apiKey === 'string' && body.apiKey.trim().length >= 10) {
      try {
        data.apiKeyEnc = encryptSecret(body.apiKey.trim());
      } catch (err) {
        console.error('[AI Providers PATCH] Erro criptografia:', err);
        return NextResponse.json({ error: 'Erro ao criptografar API key' }, { status: 500 });
      }
    }

    if (Object.keys(data).length === 0) {
      return NextResponse.json({ error: 'Nenhum campo para atualizar' }, { status: 400 });
    }

    await prisma.aIProviderConfig.update({ where: { id }, data });
    invalidateProvidersCache();

    console.log(`[AI Providers] Custom '${provider.name}' atualizado por ${session.user.email}`);

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('[AI Providers PATCH]', err);
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 });
  }
}

/**
 * DELETE /api/admin/ai-providers/[id]
 * Remove um provedor custom. Built-ins NÃO podem ser deletados.
 */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getSession();
  if (!session?.user || session.user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Acesso negado' }, { status: 403 });
  }

  try {
    const id = params.id;
    if (id.startsWith('builtin:')) {
      return NextResponse.json(
        { error: 'Provedores built-in não podem ser removidos' },
        { status: 400 }
      );
    }

    const provider = await prisma.aIProviderConfig.findUnique({ where: { id } });
    if (!provider) {
      return NextResponse.json({ error: 'Provedor não encontrado' }, { status: 404 });
    }
    if (!provider.isCustom) {
      return NextResponse.json(
        { error: 'Provedor built-in não pode ser removido' },
        { status: 400 }
      );
    }

    await prisma.aIProviderConfig.delete({ where: { id } });

    // Limpa sentinel env var
    delete process.env[`__CUSTOM_${provider.name}__`];

    invalidateProvidersCache();

    console.log(`[AI Providers] Custom '${provider.name}' removido por ${session.user.email}`);

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('[AI Providers DELETE]', err);
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 });
  }
}
