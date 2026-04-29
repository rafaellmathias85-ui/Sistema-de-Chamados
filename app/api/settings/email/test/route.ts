import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import nodemailer from 'nodemailer';
import { getSession } from '@/lib/session';

export const dynamic = 'force-dynamic';

// POST - Enviar email de teste
export async function POST(request: NextRequest) {
  try {
    const session = await getSession();
    
    if (!session || session.user.role !== 'ADMIN') {
      return NextResponse.json(
        { error: 'Acesso não autorizado' },
        { status: 403 }
      );
    }

    const { email } = await request.json();

    if (!email) {
      return NextResponse.json(
        { error: 'Email é obrigatório' },
        { status: 400 }
      );
    }

    // Buscar configurações SMTP do banco
    const config = await prisma.emailConfig.findUnique({
      where: { key: 'main' },
    });

    if (!config || !config.smtpHost || !config.smtpUser || !config.smtpPass) {
      return NextResponse.json(
        { error: 'Configure o servidor SMTP antes de testar' },
        { status: 400 }
      );
    }

    const testEmailTemplate = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; background: #f8fafc;">
        <div style="background: linear-gradient(135deg, #0A1628 0%, #1E3A5F 100%); padding: 30px; text-align: center;">
          <h1 style="color: white; margin: 0; font-size: 24px;">✅ Email de Teste</h1>
        </div>
        <div style="padding: 30px; background: white;">
          <div style="background: #22C55E15; border: 2px solid #22C55E; padding: 20px; border-radius: 8px; text-align: center; margin-bottom: 20px;">
            <span style="color: #22C55E; font-size: 18px; font-weight: bold;">
              Configuração de email funcionando corretamente!
            </span>
          </div>
          
          <p style="color: #1e293b; margin: 20px 0;">
            Este é um email de teste enviado pelo sistema de chamados da Winner Tecnologia.
          </p>
          
          <p style="color: #64748b; margin: 20px 0;">
            Se você recebeu este email, significa que o servidor SMTP está configurado corretamente.
          </p>
          
          <table style="width: 100%; border-collapse: collapse; margin: 20px 0;">
            <tr>
              <td style="padding: 8px 0; border-bottom: 1px solid #e2e8f0;">
                <strong style="color: #64748b;">Servidor:</strong>
              </td>
              <td style="padding: 8px 0; border-bottom: 1px solid #e2e8f0; text-align: right;">
                ${config.smtpHost}:${config.smtpPort}
              </td>
            </tr>
            <tr>
              <td style="padding: 8px 0; border-bottom: 1px solid #e2e8f0;">
                <strong style="color: #64748b;">Enviado para:</strong>
              </td>
              <td style="padding: 8px 0; border-bottom: 1px solid #e2e8f0; text-align: right;">
                ${email}
              </td>
            </tr>
            <tr>
              <td style="padding: 8px 0; border-bottom: 1px solid #e2e8f0;">
                <strong style="color: #64748b;">Data/Hora:</strong>
              </td>
              <td style="padding: 8px 0; border-bottom: 1px solid #e2e8f0; text-align: right;">
                ${new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}
              </td>
            </tr>
          </table>
        </div>
        <div style="background: #1e293b; padding: 20px; text-align: center;">
          <p style="color: #94a3b8; margin: 0; font-size: 12px;">
            Winner Tecnologia - Sistema de Chamados
          </p>
        </div>
      </div>
    `;

    try {
      const transporter = nodemailer.createTransport({
        host: config.smtpHost,
        port: config.smtpPort || 587,
        secure: config.smtpSecure,
        auth: {
          user: config.smtpUser,
          pass: config.smtpPass,
        },
        tls: {
          ciphers: 'SSLv3',
          rejectUnauthorized: false,
        },
      });

      const fromEmail = config.smtpFrom || config.smtpUser;
      const fromName = config.smtpFromName || 'Winner Tecnologia';

      await transporter.sendMail({
        from: `"${fromName}" <${fromEmail}>`,
        to: email,
        subject: '✅ Teste de Notificação - Winner Tecnologia',
        html: testEmailTemplate,
      });

      return NextResponse.json({ 
        success: true, 
        message: `Email de teste enviado com sucesso para ${email}` 
      });
    } catch (smtpError: any) {
      console.error('SMTP Error:', smtpError);
      
      let errorMessage = 'Erro ao enviar email';
      
      if (smtpError.code === 'EAUTH') {
        errorMessage = 'Falha na autenticação. Verifique email e senha.';
      } else if (smtpError.code === 'ESOCKET' || smtpError.code === 'ECONNECTION') {
        errorMessage = 'Não foi possível conectar ao servidor SMTP. Verifique host e porta.';
      } else if (smtpError.responseCode === 535) {
        errorMessage = 'Autenticação negada. Para Microsoft 365, verifique se precisa usar App Password.';
      } else if (smtpError.message) {
        errorMessage = smtpError.message;
      }
      
      return NextResponse.json(
        { error: errorMessage },
        { status: 500 }
      );
    }
  } catch (error) {
    console.error('Error sending test email:', error);
    return NextResponse.json(
      { error: 'Erro ao enviar email de teste' },
      { status: 500 }
    );
  }
}
