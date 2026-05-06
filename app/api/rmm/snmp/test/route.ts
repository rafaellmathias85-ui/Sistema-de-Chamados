export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/session';
import { prisma } from '@/lib/db';
import net from 'net';

// ============================================================
// SNMP / NETWORK DEVICE DIAGNOSTIC ENDPOINT
// ============================================================
// Faz uma bateria detalhada de checks TCP e retorna um LOG
// completo (cada porta, timeout, latencia, erro) para que o
// admin entenda exatamente porque um dispositivo aparece como
// offline.
//
// NOTA: o ambiente Node.js do Next.js NAO suporta UDP/SNMP
// nativo sem deps externas (net-snmp). Por isso o teste eh TCP
// (portas comuns por tipo) + DNS resolve. Se no futuro entrar
// 'net-snmp' como dependencia, este endpoint pode ser estendido
// para fazer GET de OIDs reais (.1.3.6.1.2.1.1.5.0 = sysName).
// ============================================================

const PORT_MAP: Record<string, { port: number; label: string }[]> = {
  router: [
    { port: 80, label: 'HTTP (admin web)' },
    { port: 443, label: 'HTTPS (admin web)' },
    { port: 22, label: 'SSH' },
    { port: 23, label: 'Telnet' },
    { port: 161, label: 'SNMP UDP (TCP probe)' },
  ],
  switch: [
    { port: 80, label: 'HTTP' },
    { port: 443, label: 'HTTPS' },
    { port: 22, label: 'SSH' },
    { port: 23, label: 'Telnet' },
    { port: 161, label: 'SNMP' },
  ],
  firewall: [
    { port: 443, label: 'HTTPS (admin)' },
    { port: 80, label: 'HTTP' },
    { port: 22, label: 'SSH' },
    { port: 8443, label: 'HTTPS alt' },
  ],
  ap: [
    { port: 80, label: 'HTTP' },
    { port: 443, label: 'HTTPS' },
    { port: 22, label: 'SSH' },
  ],
  other: [
    { port: 80, label: 'HTTP' },
    { port: 443, label: 'HTTPS' },
    { port: 22, label: 'SSH' },
  ],
};

function probeTcp(host: string, port: number, timeoutMs = 3000): Promise<{ ok: boolean; ms: number; error: string | null }> {
  return new Promise((resolve) => {
    const start = Date.now();
    const socket = new net.Socket();
    let done = false;
    const finalize = (ok: boolean, error: string | null) => {
      if (done) return;
      done = true;
      try { socket.destroy(); } catch {}
      resolve({ ok, ms: Date.now() - start, error });
    };
    socket.setTimeout(timeoutMs);
    socket.on('connect', () => finalize(true, null));
    socket.on('timeout', () => finalize(false, `timeout apos ${timeoutMs}ms`));
    socket.on('error', (err: any) => {
      const code = err?.code || 'ERR';
      const msg = err?.message || String(err);
      finalize(false, `${code}: ${msg}`);
    });
    try {
      socket.connect(port, host);
    } catch (e: any) {
      finalize(false, `connect throw: ${e?.message || e}`);
    }
  });
}

export async function POST(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session?.user || !['ADMIN', 'SUPPORT'].includes(session.user.role)) {
      return NextResponse.json({ error: 'Nao autorizado' }, { status: 401 });
    }

    const body = await request.json();
    let { deviceId, ipAddress, community, type } = body || {};

    // Se vier deviceId, busca configuracao do banco
    if (deviceId && (!ipAddress || !type)) {
      const dev = await prisma.snmpDevice.findUnique({ where: { id: deviceId } });
      if (!dev) {
        return NextResponse.json({ error: 'Dispositivo nao encontrado' }, { status: 404 });
      }
      ipAddress = ipAddress || dev.ipAddress;
      community = community || dev.community;
      type = type || dev.type;
    }

    if (!ipAddress) {
      return NextResponse.json({ error: 'ipAddress obrigatorio' }, { status: 400 });
    }
    type = type || 'other';

    const log: { ts: string; level: 'info' | 'ok' | 'warn' | 'error'; msg: string }[] = [];
    const stamp = () => new Date().toISOString().replace('T', ' ').slice(0, 19);
    const push = (level: 'info' | 'ok' | 'warn' | 'error', msg: string) =>
      log.push({ ts: stamp(), level, msg });

    push('info', `Iniciando diagnostico para ${ipAddress} (tipo=${type}, community=${community || 'public'})`);

    // 1. Validacao basica do IP
    const ipv4Regex = /^(\d{1,3}\.){3}\d{1,3}$/;
    if (!ipv4Regex.test(ipAddress)) {
      push('warn', `IP "${ipAddress}" nao parece IPv4 valido (formato a.b.c.d).`);
    } else {
      push('ok', `IP ${ipAddress} tem formato valido.`);
    }

    // 2. Probe das portas conforme tipo
    const ports = PORT_MAP[type] || PORT_MAP.other;
    push('info', `Testando ${ports.length} portas TCP comuns para tipo "${type}"...`);

    const portResults: { port: number; label: string; ok: boolean; ms: number; error: string | null }[] = [];
    for (const p of ports) {
      const r = await probeTcp(ipAddress, p.port, 3000);
      portResults.push({ port: p.port, label: p.label, ...r });
      if (r.ok) {
        push('ok', `Porta ${p.port} (${p.label}): ABERTA, latencia ${r.ms}ms`);
      } else {
        push('warn', `Porta ${p.port} (${p.label}): FECHADA/INACESSIVEL - ${r.error}`);
      }
    }

    const anyOpen = portResults.some((r) => r.ok);
    const onlinePorts = portResults.filter((r) => r.ok);
    const minLatency = onlinePorts.length
      ? Math.min(...onlinePorts.map((r) => r.ms))
      : null;

    if (anyOpen) {
      push(
        'ok',
        `RESULTADO: dispositivo ONLINE. ${onlinePorts.length}/${ports.length} portas abertas. Latencia min: ${minLatency}ms.`,
      );
    } else {
      push(
        'error',
        `RESULTADO: dispositivo OFFLINE ou bloqueado. Nenhuma porta TCP respondeu.`,
      );
      push(
        'info',
        'Causas comuns: (a) IP errado; (b) firewall bloqueando saida do servidor; (c) dispositivo desligado; (d) ACL no roteador permite apenas LAN; (e) este servidor nao esta na mesma rede do dispositivo.',
      );
    }

    // 3. SNMP UDP nativo? Avisar limitacao
    if (type === 'router' || type === 'switch') {
      push(
        'info',
        'NOTA: SNMP roda em UDP/161. Este teste fez probe TCP/161 (que pode mostrar fechado mesmo com SNMP UDP funcionando). Para SNMP UDP real, use uma maquina-vigia (RmmMachine) na mesma rede do dispositivo.',
      );
    }

    return NextResponse.json({
      ok: anyOpen,
      ipAddress,
      type,
      community: community || 'public',
      portResults,
      onlineCount: onlinePorts.length,
      totalPorts: ports.length,
      minLatencyMs: minLatency,
      log,
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error('SNMP test error:', error);
    return NextResponse.json(
      { error: 'Erro interno', detail: error?.message || String(error) },
      { status: 500 },
    );
  }
}
