import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getSession } from '@/lib/session';
import { getStorageProvider, isLocalPath } from '@/lib/storage';


export const dynamic = 'force-dynamic';

// GET - Listar anexos do chamado
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getSession();
    if (!session?.user) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
    }

    // Verificar acesso ao ticket
    const ticket = await prisma.ticket.findUnique({
      where: { id: params.id },
      select: { companyId: true },
    });

    if (!ticket) {
      return NextResponse.json({ error: 'Chamado não encontrado' }, { status: 404 });
    }

    if (session.user.role === 'CLIENT' && session.user.companyId !== ticket.companyId) {
      return NextResponse.json({ error: 'Sem permissão' }, { status: 403 });
    }

    const attachments = await prisma.ticketAttachment.findMany({
      where: { ticketId: params.id },
      orderBy: { createdAt: 'desc' },
    });

    // Gerar URLs de download para cada anexo
    const storage = getStorageProvider();
    const attachmentsWithUrls = await Promise.all(
      attachments.map(async (att: any) => {
        try {
          const downloadUrl = await storage.getUrl(att.cloudStoragePath, att.isPublic);
          return { ...att, downloadUrl };
        } catch {
          // Fallback: rota de download por ID
          return { ...att, downloadUrl: `/api/attachments/${att.id}` };
        }
      })
    );

    return NextResponse.json(attachmentsWithUrls);
  } catch (error) {
    console.error('Erro ao listar anexos:', error);
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 });
  }
}

// POST - Registrar anexo no chamado
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getSession();
    if (!session?.user) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
    }

    // Verificar acesso ao ticket
    const ticket = await prisma.ticket.findUnique({
      where: { id: params.id },
      select: { companyId: true },
    });

    if (!ticket) {
      return NextResponse.json({ error: 'Chamado não encontrado' }, { status: 404 });
    }

    if (session.user.role === 'CLIENT' && session.user.companyId !== ticket.companyId) {
      return NextResponse.json({ error: 'Sem permissão' }, { status: 403 });
    }

    let body: any;
    try {
      const ct = request.headers.get('content-type') || '';
      if (ct.includes('multipart/form-data')) {
        // Se veio como FormData, tratar sem JSON.parse
        const formData = await request.formData();
        body = {
          fileName: formData.get('fileName') as string,
          fileSize: Number(formData.get('fileSize') || 0),
          fileType: formData.get('fileType') as string,
          cloudStoragePath: formData.get('cloudStoragePath') as string,
          isPublic: formData.get('isPublic') === 'true',
        };
      } else {
        const rawText = await request.text();
        body = JSON.parse(rawText);
      }
    } catch (parseErr) {
      console.error('[Attachments POST] Erro ao parsear body:', parseErr);
      return NextResponse.json({ error: 'JSON inválido no corpo da requisição' }, { status: 400 });
    }
    const { fileName, fileType, cloudStoragePath, isPublic = false } = body;
    const fileSize = typeof body.fileSize === 'number' ? body.fileSize : parseInt(String(body.fileSize || '0'), 10) || 0;

    if (!fileName || !fileType || !cloudStoragePath) {
      return NextResponse.json({ error: 'Dados incompletos' }, { status: 400 });
    }

    const attachment = await prisma.ticketAttachment.create({
      data: {
        fileName,
        fileSize,
        fileType,
        cloudStoragePath,
        isPublic,
        ticketId: params.id,
        uploadedById: session.user.id,
        uploadedByName: session.user.name || 'Usuário',
      },
    });

    return NextResponse.json(attachment, { status: 201 });
  } catch (error) {
    console.error('Erro ao registrar anexo:', error);
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 });
  }
}

// DELETE - Remover anexo
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getSession();
    if (!session?.user) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const attachmentId = searchParams.get('attachmentId');

    if (!attachmentId) {
      return NextResponse.json({ error: 'ID do anexo é obrigatório' }, { status: 400 });
    }

    const attachment = await prisma.ticketAttachment.findUnique({
      where: { id: attachmentId },
      include: { ticket: { select: { companyId: true } } },
    });

    if (!attachment) {
      return NextResponse.json({ error: 'Anexo não encontrado' }, { status: 404 });
    }

    // Apenas quem fez upload ou admin pode excluir
    if (session.user.role === 'CLIENT' && attachment.uploadedById !== session.user.id) {
      return NextResponse.json({ error: 'Sem permissão' }, { status: 403 });
    }

    // Excluir do storage (S3 ou local)
    const storage = getStorageProvider();
    await storage.delete(attachment.cloudStoragePath);

    // Excluir do banco
    await prisma.ticketAttachment.delete({ where: { id: attachmentId } });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Erro ao excluir anexo:', error);
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 });
  }
}
