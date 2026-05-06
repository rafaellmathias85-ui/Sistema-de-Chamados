export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import net from 'net';
import { getSession } from '@/lib/session';
import { updateDeviceStatus } from '@/lib/snmp-utils';

/**
 * Verifica conectividade TCP em portas comuns para o tipo de dispositivo.
 * Usado como FALLBACK quando não há máquina vigia disponível.
 */
async function checkDeviceDirect(ip: string, type: string): Promise<{ online: boolean; latency: number }> {
  const portMap: Record<string, number[]> = {
    router: [80, 443, 22, 23],
    switch: [80, 443, 22, 23],
    firewall: [443, 80, 22, 8443],
    ap: [80, 443, 22],
    other: [80, 443, 22, 9100],
  };
  const ports = portMap[type] || [80, 443, 22];

  for (const port of ports) {
    try {
      const start = Date.now();
      const result = await new Promise<boolean>((resolve) => {
        const socket = new net.Socket();
        socket.setTimeout(3000);
        socket.on('connect', () => { socket.destroy(); resolve(true); });
        socket.on('timeout', () => { socket.destroy(); resolve(false); });
        socket.on('error', () => { socket.destroy(); resolve(false); });
        socket.connect(port, ip);
      });
      if (result) return { online: true, latency: Date.now() - start };
    } catch { continue; }
  }
  return { online: false, latency: 0 };
}

/**
 * Gera script PowerShell para a máquina vigia executar probe de rede local.
 * O script testa ICMP (ping) + portas TCP comuns e retorna JSON com resultado.
 */
function buildSnmpProbeScript(deviceId: string, ip: string, type: string, community: string): string {
  const portMap: Record<string, string> = {
    router: '80,443,22,23,161',
    switch: '80,443,22,23,161',
    firewall: '443,80,22,8443',
    ap: '80,443,22',
    other: '80,443,22,9100',
  };
  const ports = portMap[type] || '80,443,22';

  return `# @@SNMP_PROBE:${deviceId}@@
$ErrorActionPreference = "SilentlyContinue"
$ip = "${ip}"
$community = "${community}"
$ports = @(${ports})
$result = @{ deviceId = "${deviceId}"; ip = $ip; online = $false; latency = 0; openPorts = @(); snmpOk = $false }

# 1. ICMP Ping
try {
  $ping = Test-Connection -ComputerName $ip -Count 2 -ErrorAction SilentlyContinue
  if ($ping) {
    $result.online = $true
    $result.latency = [math]::Round(($ping | Measure-Object ResponseTime -Average).Average, 0)
  }
} catch {}

# 2. TCP Port Scan
foreach ($port in $ports) {
  try {
    $tcp = New-Object System.Net.Sockets.TcpClient
    $connect = $tcp.BeginConnect($ip, $port, $null, $null)
    $wait = $connect.AsyncWaitHandle.WaitOne(2000, $false)
    if ($wait -and $tcp.Connected) {
      $result.openPorts += $port
      if (-not $result.online) { $result.online = $true }
    }
    $tcp.Close()
  } catch {}
}

# 3. SNMP GET (sysName) via UDP - tenta comunidade informada
try {
  $udp = New-Object System.Net.Sockets.UdpClient
  $udp.Client.ReceiveTimeout = 2000
  # SNMP GET .1.3.6.1.2.1.1.5.0 (sysName), community = $community, version 2c
  # Build SNMPv2c GET packet
  $communityBytes = [System.Text.Encoding]::ASCII.GetBytes($community)
  $oid = @(0x2B,0x06,0x01,0x02,0x01,0x01,0x05,0x00) # 1.3.6.1.2.1.1.5.0
  $varbind = @(0x30) + @([byte]($oid.Length + 4)) + @(0x06) + @([byte]$oid.Length) + $oid + @(0x05, 0x00) # OID + NULL
  $varbindList = @(0x30) + @([byte]$varbind.Length) + $varbind
  $requestId = @(0x02, 0x04) + [BitConverter]::GetBytes([int](Get-Random -Maximum 2147483647))
  $pdu = @(0xA0) # GetRequest
  $pduContent = $requestId + @(0x02, 0x01, 0x00) + @(0x02, 0x01, 0x00) + $varbindList
  $pdu += @([byte]$pduContent.Length) + $pduContent
  $msgContent = @(0x02, 0x01, 0x01) + @(0x04) + @([byte]$communityBytes.Length) + $communityBytes + $pdu
  $packet = @(0x30) + @([byte]$msgContent.Length) + $msgContent
  $udp.Send($packet, $packet.Length, $ip, 161) | Out-Null
  $ep = New-Object System.Net.IPEndPoint([System.Net.IPAddress]::Any, 0)
  $recv = $udp.Receive([ref]$ep)
  if ($recv.Length -gt 0) {
    $result.snmpOk = $true
    if (-not $result.online) { $result.online = $true; $result.latency = 1 }
  }
  $udp.Close()
} catch { try { $udp.Close() } catch {} }

# Output JSON result
$result | ConvertTo-Json -Compress
`;
}

// updateDeviceStatus importado de @/lib/snmp-utils

// POST - Poll a device
export async function POST(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session?.user || !['ADMIN', 'SUPPORT'].includes(session.user.role)) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
    }

    const { deviceId } = await request.json();
    if (!deviceId) return NextResponse.json({ error: 'deviceId obrigatório' }, { status: 400 });

    const device = await prisma.snmpDevice.findUnique({
      where: { id: deviceId },
      include: { watcherMachine: { select: { id: true, status: true } } },
    });
    if (!device) return NextResponse.json({ error: 'Dispositivo não encontrado' }, { status: 404 });

    const prevStatus = device.status;

    // === ESTRATÉGIA: Se tem máquina vigia ONLINE, delegar probe via RmmTask ===
    if (device.watcherMachineId && device.watcherMachine?.status === 'Ligado') {
      const script = buildSnmpProbeScript(device.id, device.ipAddress, device.type, device.community);
      const task = await prisma.rmmTask.create({
        data: {
          machineId: device.watcherMachineId,
          command: script,
          scriptType: 'powershell',
          status: 'PENDING',
          createdBy: session.user.id,
          createdByName: session.user.name || 'Sistema',
        },
      });

      return NextResponse.json({
        success: true,
        mode: 'proxy',
        taskId: task.id,
        message: `Verificação enviada para máquina vigia. Aguarde o resultado (agente verifica a cada ~60s).`,
        status: device.status,
        latency: device.latency,
      });
    }

    // === FALLBACK: Probe direto do servidor (limitado a redes acessíveis) ===
    const { online, latency } = await checkDeviceDirect(device.ipAddress, device.type);
    const { newStatus, changed } = await updateDeviceStatus(deviceId, online, latency, prevStatus);

    return NextResponse.json({
      success: true,
      mode: 'direct',
      status: newStatus,
      latency: online ? latency : null,
      changed,
    });
  } catch (error) {
    console.error('SNMP poll error:', error);
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 });
  }
}


