export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getSession } from '@/lib/session';

// POST - Block IP via Windows Firewall on machine
export async function POST(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session?.user || !['ADMIN', 'SUPPORT'].includes(session.user.role)) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
    }

    const { machineId, ipAddress, alertId } = await request.json();
    if (!machineId || !ipAddress) {
      return NextResponse.json({ error: 'machineId e ipAddress obrigatórios' }, { status: 400 });
    }

    // Validate IP format
    const ipRegex = /^(\d{1,3}\.){3}\d{1,3}$/;
    if (!ipRegex.test(ipAddress)) {
      return NextResponse.json({ error: 'IP inválido' }, { status: 400 });
    }

    // Don't block private/local IPs
    if (ipAddress.startsWith('127.') || ipAddress.startsWith('10.') || ipAddress.startsWith('192.168.') || ipAddress === '0.0.0.0') {
      return NextResponse.json({ error: 'Não é possível bloquear IPs locais/privados' }, { status: 400 });
    }

    // Create RMM task to block IP via Windows Firewall
    const command = `netsh advfirewall firewall add rule name="WinnerRMM_Block_${ipAddress}" dir=in action=block remoteip=${ipAddress}\nnetsh advfirewall firewall add rule name="WinnerRMM_Block_${ipAddress}_out" dir=out action=block remoteip=${ipAddress}\nWrite-Output "IP ${ipAddress} bloqueado com sucesso via Windows Firewall"`;

    const task = await prisma.rmmTask.create({
      data: {
        command,
        scriptType: 'powershell',
        machineId,
        createdBy: session.user.id,
        createdByName: session.user.name || 'Sistema',
      },
    });

    // Resolve alert if provided
    if (alertId) {
      await prisma.securityAlert.update({
        where: { id: alertId },
        data: { resolved: true, resolvedAt: new Date(), resolvedBy: session.user.name || 'Sistema' },
      });
    }

    return NextResponse.json({ success: true, taskId: task.id, message: `Comando de bloqueio do IP ${ipAddress} enviado para a máquina` });
  } catch (error) {
    console.error('Block IP error:', error);
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 });
  }
}
