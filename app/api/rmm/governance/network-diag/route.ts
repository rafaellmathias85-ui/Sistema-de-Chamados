export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getSession } from '@/lib/session';

// ============================================================
// Thresholds de diagnóstico
// ============================================================
const WIFI_THRESHOLDS = {
  channel_utilization_warning: 70,
  channel_utilization_critical: 85,
  clients_per_radio_warning: 25,
  clients_per_radio_critical: 40,
  retry_rate_warning: 15,
  retry_rate_critical: 25,
  noise_floor_warning: -85,
  satisfaction_warning: 60,
  satisfaction_critical: 40,
};

const WAN_THRESHOLDS = {
  latency_warning: 80,
  latency_critical: 150,
  jitter_warning: 15,
  jitter_critical: 30,
  packet_loss_warning: 1.0,
  packet_loss_critical: 3.0,
};

const SWITCH_THRESHOLDS = {
  error_rate_warning: 50,
  error_rate_critical: 200,
  poe_budget_warning: 80,
  speed_mismatch: 100, // porta giga operando a 100Mbps
};

const DEVICE_THRESHOLDS = {
  cpu_warning: 80,
  cpu_critical: 95,
  mem_warning: 85,
  mem_critical: 95,
  temp_warning: 65,
  temp_critical: 80,
};

// ============================================================
// Engine de diagnóstico
// ============================================================
interface DiagEntry {
  severity: string;
  category: string;
  diagnosticType: string;
  title: string;
  description: string;
  recommendation: string;
  metricValue: string;
  thresholdValue: string;
}

function runDiagnosticEngine(device: any, wifiData: any[], switchPorts: any[], wanData: any): DiagEntry[] {
  const diags: DiagEntry[] = [];
  const type = device.type || '';
  const vendor = device.vendor || '';

  // --- Diagnósticos de dispositivo genérico ---
  if (device.cpuPercent != null && device.cpuPercent >= DEVICE_THRESHOLDS.cpu_critical) {
    diags.push({ severity: 'critical', category: 'performance', diagnosticType: 'cpu_critical', title: 'CPU em nível crítico', description: `CPU do dispositivo ${device.name} em ${device.cpuPercent.toFixed(1)}%.`, recommendation: 'Verificar processos, considerar upgrade ou redistribuição de carga.', metricValue: device.cpuPercent.toFixed(1) + '%', thresholdValue: DEVICE_THRESHOLDS.cpu_critical + '%' });
  } else if (device.cpuPercent != null && device.cpuPercent >= DEVICE_THRESHOLDS.cpu_warning) {
    diags.push({ severity: 'warning', category: 'performance', diagnosticType: 'cpu_high', title: 'CPU elevada', description: `CPU do dispositivo ${device.name} em ${device.cpuPercent.toFixed(1)}%.`, recommendation: 'Monitorar. Se persistir, verificar carga de regras de firewall ou DPI.', metricValue: device.cpuPercent.toFixed(1) + '%', thresholdValue: DEVICE_THRESHOLDS.cpu_warning + '%' });
  }

  if (device.memPercent != null && device.memPercent >= DEVICE_THRESHOLDS.mem_critical) {
    diags.push({ severity: 'critical', category: 'performance', diagnosticType: 'mem_critical', title: 'Memória em nível crítico', description: `RAM do dispositivo ${device.name} em ${device.memPercent.toFixed(1)}%.`, recommendation: 'Reiniciar dispositivo. Se recorrente, considerar upgrade de hardware.', metricValue: device.memPercent.toFixed(1) + '%', thresholdValue: DEVICE_THRESHOLDS.mem_critical + '%' });
  }

  if (device.temperature != null && device.temperature >= DEVICE_THRESHOLDS.temp_critical) {
    diags.push({ severity: 'critical', category: 'performance', diagnosticType: 'temp_critical', title: 'Temperatura crítica', description: `Temperatura de ${device.temperature.toFixed(0)}°C no dispositivo ${device.name}.`, recommendation: 'Verificar ventilação, ambiente e funcionamento dos coolers.', metricValue: device.temperature.toFixed(0) + '°C', thresholdValue: DEVICE_THRESHOLDS.temp_critical + '°C' });
  }

  // --- WiFi (AP) ---
  for (const radio of wifiData) {
    const radioLabel = (radio.radio || '').toUpperCase();
    if (radio.utilization != null && radio.utilization >= WIFI_THRESHOLDS.channel_utilization_critical) {
      diags.push({ severity: 'critical', category: 'wifi', diagnosticType: 'channel_congestion', title: `Canal ${radioLabel} congestionado`, description: `Utilização do canal ${radioLabel} em ${radio.utilization.toFixed(1)}%.`, recommendation: 'Trocar para canal menos congestionado ou reduzir largura de canal.', metricValue: radio.utilization.toFixed(1) + '%', thresholdValue: WIFI_THRESHOLDS.channel_utilization_critical + '%' });
    } else if (radio.utilization != null && radio.utilization >= WIFI_THRESHOLDS.channel_utilization_warning) {
      diags.push({ severity: 'warning', category: 'wifi', diagnosticType: 'channel_congestion', title: `Canal ${radioLabel} com alta utilização`, description: `Utilização do canal ${radioLabel} em ${radio.utilization.toFixed(1)}%.`, recommendation: 'Monitorar. Considerar mudança de canal se piorar.', metricValue: radio.utilization.toFixed(1) + '%', thresholdValue: WIFI_THRESHOLDS.channel_utilization_warning + '%' });
    }

    if (radio.clientsCount != null && radio.clientsCount >= WIFI_THRESHOLDS.clients_per_radio_critical) {
      diags.push({ severity: 'critical', category: 'wifi', diagnosticType: 'ap_overloaded', title: `AP sobrecarregado no rádio ${radioLabel}`, description: `${radio.clientsCount} clientes conectados no rádio ${radioLabel}.`, recommendation: 'Adicionar novo AP para distribuir carga ou ativar band steering.', metricValue: String(radio.clientsCount), thresholdValue: String(WIFI_THRESHOLDS.clients_per_radio_critical) });
    } else if (radio.clientsCount != null && radio.clientsCount >= WIFI_THRESHOLDS.clients_per_radio_warning) {
      diags.push({ severity: 'warning', category: 'wifi', diagnosticType: 'ap_overloaded', title: `Muitos clientes no rádio ${radioLabel}`, description: `${radio.clientsCount} clientes conectados no rádio ${radioLabel}.`, recommendation: 'Monitorar. Considerar adicionar AP se a experiência degradar.', metricValue: String(radio.clientsCount), thresholdValue: String(WIFI_THRESHOLDS.clients_per_radio_warning) });
    }

    if (radio.retryRate != null && radio.retryRate >= WIFI_THRESHOLDS.retry_rate_critical) {
      diags.push({ severity: 'critical', category: 'wifi', diagnosticType: 'high_retry_rate', title: `Alta taxa de retry no ${radioLabel}`, description: `Taxa de retry em ${radio.retryRate.toFixed(1)}%. Indica interferência ou sinal fraco.`, recommendation: 'Verificar interferências, ajustar potência TX ou reposicionar AP.', metricValue: radio.retryRate.toFixed(1) + '%', thresholdValue: WIFI_THRESHOLDS.retry_rate_critical + '%' });
    }

    if (radio.noiseFloor != null && radio.noiseFloor > WIFI_THRESHOLDS.noise_floor_warning) {
      diags.push({ severity: 'warning', category: 'wifi', diagnosticType: 'noise_floor_high', title: `Ruído alto no ${radioLabel}`, description: `Noise floor de ${radio.noiseFloor}dBm no rádio ${radioLabel}.`, recommendation: 'Investigar fontes de interferência eletromagnética no ambiente.', metricValue: radio.noiseFloor + 'dBm', thresholdValue: WIFI_THRESHOLDS.noise_floor_warning + 'dBm' });
    }
  }

  // --- Switch ---
  for (const port of switchPorts) {
    const totalErrors = (Number(port.rxErrors) || 0) + (Number(port.txErrors) || 0);
    if (totalErrors >= SWITCH_THRESHOLDS.error_rate_critical) {
      diags.push({ severity: 'critical', category: 'switch', diagnosticType: 'port_errors', title: `Erros críticos na porta ${port.portName || port.portIdx}`, description: `${totalErrors} erros detectados na porta.`, recommendation: 'Verificar cabo, conector ou dispositivo conectado nesta porta.', metricValue: String(totalErrors), thresholdValue: String(SWITCH_THRESHOLDS.error_rate_critical) });
    } else if (totalErrors >= SWITCH_THRESHOLDS.error_rate_warning) {
      diags.push({ severity: 'warning', category: 'switch', diagnosticType: 'port_errors', title: `Erros na porta ${port.portName || port.portIdx}`, description: `${totalErrors} erros detectados na porta.`, recommendation: 'Monitorar. Trocar cabo se persistir.', metricValue: String(totalErrors), thresholdValue: String(SWITCH_THRESHOLDS.error_rate_warning) });
    }

    if (port.isUp && port.speedMbps != null && port.speedMbps === 100) {
      diags.push({ severity: 'warning', category: 'switch', diagnosticType: 'speed_mismatch', title: `Porta ${port.portName || port.portIdx} operando a 100Mbps`, description: `Porta Gigabit operando a 100Mbps. Pode indicar cabo Cat5 ou defeito.`, recommendation: 'Verificar se o cabo é Cat5e ou superior. Trocar patch cord.', metricValue: '100 Mbps', thresholdValue: '1000 Mbps' });
    }
  }

  // --- WAN / Gateway ---
  if (wanData) {
    if (wanData.packetLossPct != null && wanData.packetLossPct >= WAN_THRESHOLDS.packet_loss_critical) {
      diags.push({ severity: 'critical', category: 'gateway', diagnosticType: 'wan_packet_loss', title: 'Perda de pacotes crítica na WAN', description: `Packet loss de ${wanData.packetLossPct.toFixed(1)}% detectado.`, recommendation: 'Verificar cabo/fibra com ISP. Acionar suporte do provedor.', metricValue: wanData.packetLossPct.toFixed(1) + '%', thresholdValue: WAN_THRESHOLDS.packet_loss_critical + '%' });
    } else if (wanData.packetLossPct != null && wanData.packetLossPct >= WAN_THRESHOLDS.packet_loss_warning) {
      diags.push({ severity: 'warning', category: 'gateway', diagnosticType: 'wan_packet_loss', title: 'Perda de pacotes na WAN', description: `Packet loss de ${wanData.packetLossPct.toFixed(1)}%.`, recommendation: 'Monitorar link. Se persistir, acionar ISP.', metricValue: wanData.packetLossPct.toFixed(1) + '%', thresholdValue: WAN_THRESHOLDS.packet_loss_warning + '%' });
    }

    if (wanData.jitterMs != null && wanData.jitterMs >= WAN_THRESHOLDS.jitter_critical) {
      diags.push({ severity: 'critical', category: 'gateway', diagnosticType: 'wan_high_jitter', title: 'Jitter crítico na WAN', description: `Jitter de ${wanData.jitterMs.toFixed(1)}ms. Impacta VoIP e videoconferência.`, recommendation: 'Verificar qualidade do link com ISP. Considerar QoS.', metricValue: wanData.jitterMs.toFixed(1) + 'ms', thresholdValue: WAN_THRESHOLDS.jitter_critical + 'ms' });
    }

    if (wanData.latencyMs != null && wanData.latencyMs >= WAN_THRESHOLDS.latency_critical) {
      diags.push({ severity: 'critical', category: 'gateway', diagnosticType: 'wan_high_latency', title: 'Latência crítica na WAN', description: `Latência de ${wanData.latencyMs.toFixed(0)}ms.`, recommendation: 'Verificar rota com ISP. Considerar link dedicado.', metricValue: wanData.latencyMs.toFixed(0) + 'ms', thresholdValue: WAN_THRESHOLDS.latency_critical + 'ms' });
    } else if (wanData.latencyMs != null && wanData.latencyMs >= WAN_THRESHOLDS.latency_warning) {
      diags.push({ severity: 'warning', category: 'gateway', diagnosticType: 'wan_high_latency', title: 'Latência elevada na WAN', description: `Latência de ${wanData.latencyMs.toFixed(0)}ms.`, recommendation: 'Monitorar. Se impactar operação, acionar ISP.', metricValue: wanData.latencyMs.toFixed(0) + 'ms', thresholdValue: WAN_THRESHOLDS.latency_warning + 'ms' });
    }
  }

  return diags;
}

async function upsertDiagnostics(deviceId: string, companyId: string | null, newDiags: DiagEntry[]) {
  // Para cada diagnóstico gerado, verificar se já existe um aberto do mesmo tipo
  for (const d of newDiags) {
    const existing = await prisma.networkDiagnostic.findFirst({
      where: { deviceId, diagnosticType: d.diagnosticType, isOpen: true },
    });
    if (existing) {
      // Atualizar lastSeenAt e dados
      await prisma.networkDiagnostic.update({
        where: { id: existing.id },
        data: { lastSeenAt: new Date(), severity: d.severity, metricValue: d.metricValue, description: d.description },
      });
    } else {
      await prisma.networkDiagnostic.create({
        data: { deviceId, companyId, ...d },
      });
    }
  }

  // Auto-resolver diagnósticos que não foram gerados nesta coleta
  const openDiags = await prisma.networkDiagnostic.findMany({
    where: { deviceId, isOpen: true },
  });
  const newTypes = new Set(newDiags.map(d => d.diagnosticType));
  for (const od of openDiags) {
    if (!newTypes.has(od.diagnosticType)) {
      // Se o diagnóstico não foi re-gerado, verificar se lastSeenAt > 30 min
      const diff = Date.now() - new Date(od.lastSeenAt).getTime();
      if (diff > 30 * 60 * 1000) {
        await prisma.networkDiagnostic.update({
          where: { id: od.id },
          data: { isOpen: false, resolvedAt: new Date(), resolvedBy: 'auto', resolution: 'Auto-resolvido: condição não detectada nas últimas coletas.' },
        });
      }
    }
  }
}

// ============================================================
// POST — Agente envia dados de rede coletados
// ============================================================
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { token, hostname, devices } = body;

    if (!token || !hostname || !Array.isArray(devices)) {
      return NextResponse.json({ error: 'token, hostname e devices[] obrigatórios' }, { status: 400 });
    }

    const company = await prisma.company.findUnique({ where: { rmmToken: token } });
    if (!company) return NextResponse.json({ error: 'Token inválido' }, { status: 401 });

    const machine = await prisma.rmmMachine.findUnique({
      where: { hostname_companyId: { hostname, companyId: company.id } },
    });
    if (!machine) return NextResponse.json({ error: 'Máquina vigia não encontrada' }, { status: 404 });

    let processed = 0;
    let diagsGenerated = 0;

    for (const dev of devices.slice(0, 100)) {
      // Upsert dispositivo
      const deviceData: any = {
        name: dev.name || dev.hostname || dev.ip || 'Unknown',
        ipAddress: dev.ip,
        type: dev.type || 'other',
        vendor: dev.vendor || null,
        model: dev.model || null,
        macAddress: dev.mac || null,
        firmware: dev.firmware || null,
        status: 'online',
        lastPoll: new Date(),
        cpuPercent: dev.cpu != null ? parseFloat(dev.cpu) : null,
        memPercent: dev.mem != null ? parseFloat(dev.mem) : null,
        temperature: dev.temperature != null ? parseFloat(dev.temperature) : null,
        uptimeStr: dev.uptime || null,
        companyId: company.id,
        watcherMachineId: machine.id,
      };

      let device: any = null;
      if (dev.mac) {
        device = await prisma.snmpDevice.findFirst({ where: { macAddress: dev.mac } });
      }
      if (!device && dev.ip) {
        device = await prisma.snmpDevice.findFirst({ where: { ipAddress: dev.ip } });
      }

      if (device) {
        device = await prisma.snmpDevice.update({ where: { id: device.id }, data: deviceData });
      } else {
        device = await prisma.snmpDevice.create({ data: deviceData });
      }

      // Salvar WiFi radios
      const wifiData = dev.radios || [];
      if (wifiData.length > 0) {
        await prisma.wifiChannelHistory.createMany({
          data: wifiData.map((r: any) => ({
            deviceId: device.id,
            radio: r.radio || '2g',
            channel: r.channel != null ? parseInt(r.channel) : null,
            channelWidth: r.channel_width != null ? parseInt(r.channel_width) : null,
            txPower: r.tx_power != null ? parseInt(r.tx_power) : null,
            utilization: r.utilization != null ? parseFloat(r.utilization) : null,
            noiseFloor: r.noise_floor != null ? parseInt(r.noise_floor) : null,
            clientsCount: r.clients_count != null ? parseInt(r.clients_count) : null,
            retryRate: r.retry_rate != null ? parseFloat(r.retry_rate) : null,
            satisfaction: r.satisfaction != null ? parseInt(r.satisfaction) : null,
          })),
        });
      }

      // Salvar Switch ports
      const portData = dev.ports || [];
      if (portData.length > 0) {
        await prisma.switchPortHistory.createMany({
          data: portData.map((p: any) => ({
            deviceId: device.id,
            portIdx: parseInt(p.port_idx) || 0,
            portName: p.port_name || null,
            isUp: p.is_up ?? null,
            speedMbps: p.speed != null ? parseInt(p.speed) : null,
            vlanId: p.vlan_id != null ? parseInt(p.vlan_id) : null,
            poeWatts: p.poe_watts != null ? parseFloat(p.poe_watts) : null,
            rxBytes: p.rx_bytes != null ? BigInt(p.rx_bytes) : null,
            txBytes: p.tx_bytes != null ? BigInt(p.tx_bytes) : null,
            rxErrors: p.rx_errors != null ? BigInt(p.rx_errors) : null,
            txErrors: p.tx_errors != null ? BigInt(p.tx_errors) : null,
          })),
        });
      }

      // Salvar WAN health
      const wanData = dev.wan;
      if (wanData && wanData.interface) {
        await prisma.wanHealthHistory.create({
          data: {
            deviceId: device.id,
            wanInterface: wanData.interface || 'wan1',
            latencyMs: wanData.latency_ms != null ? parseFloat(wanData.latency_ms) : null,
            jitterMs: wanData.jitter_ms != null ? parseFloat(wanData.jitter_ms) : null,
            packetLossPct: wanData.packet_loss_pct != null ? parseFloat(wanData.packet_loss_pct) : null,
            rxMbps: wanData.rx_mbps != null ? parseFloat(wanData.rx_mbps) : null,
            txMbps: wanData.tx_mbps != null ? parseFloat(wanData.tx_mbps) : null,
            ispName: wanData.isp_name || null,
            publicIp: wanData.public_ip || null,
            isPrimary: wanData.is_primary ?? true,
          },
        });
      }

      // Executar engine de diagnóstico
      const diagResults = runDiagnosticEngine(device, wifiData, portData, wanData);
      await upsertDiagnostics(device.id, company.id, diagResults);
      diagsGenerated += diagResults.length;

      processed++;
    }

    return NextResponse.json({ ok: true, processed, diagnosticsGenerated: diagsGenerated });
  } catch (error) {
    console.error('Error saving network diagnostics:', error);
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 });
  }
}

// ============================================================
// GET — Painel: listar dispositivos + diagnósticos
// ============================================================
export async function GET(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session?.user || !['ADMIN', 'SUPPORT'].includes(session.user.role)) {
      return NextResponse.json({ error: 'Acesso negado' }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const view = searchParams.get('view') || 'overview'; // overview, device, diagnostics, wifi, wan, ports
    const deviceId = searchParams.get('deviceId');
    const companyId = searchParams.get('companyId');
    const limit = Math.min(parseInt(searchParams.get('limit') || '200'), 1000);

    if (view === 'overview') {
      const where: any = {};
      if (companyId) where.companyId = companyId;

      const devices = await prisma.snmpDevice.findMany({
        where,
        orderBy: { lastPoll: 'desc' },
        take: limit,
        select: {
          id: true, name: true, ipAddress: true, type: true, vendor: true,
          model: true, macAddress: true, firmware: true, status: true,
          lastPoll: true, uptimeStr: true, latency: true,
          cpuPercent: true, memPercent: true, temperature: true,
          company: { select: { id: true, name: true } },
          _count: { select: { networkDiagnostics: { where: { isOpen: true } } } },
        },
      });

      const openDiags = await prisma.networkDiagnostic.groupBy({
        by: ['severity'],
        where: { isOpen: true, ...(companyId ? { companyId } : {}) },
        _count: true,
      });

      return NextResponse.json({
        devices,
        diagnosticsSummary: {
          critical: openDiags.find(d => d.severity === 'critical')?._count || 0,
          warning: openDiags.find(d => d.severity === 'warning')?._count || 0,
          info: openDiags.find(d => d.severity === 'info')?._count || 0,
        },
      });
    }

    if (view === 'diagnostics') {
      const where: any = {};
      if (deviceId) where.deviceId = deviceId;
      if (companyId) where.companyId = companyId;
      const onlyOpen = searchParams.get('onlyOpen') !== 'false';
      if (onlyOpen) where.isOpen = true;

      const diagnostics = await prisma.networkDiagnostic.findMany({
        where,
        orderBy: [{ severity: 'asc' }, { lastSeenAt: 'desc' }],
        take: limit,
        include: { device: { select: { name: true, ipAddress: true, type: true, vendor: true, model: true } } },
      });

      return NextResponse.json(diagnostics);
    }

    if (view === 'wifi' && deviceId) {
      const history = await prisma.wifiChannelHistory.findMany({
        where: { deviceId },
        orderBy: { collectedAt: 'desc' },
        take: limit,
      });
      return NextResponse.json(history);
    }

    if (view === 'wan' && deviceId) {
      const history = await prisma.wanHealthHistory.findMany({
        where: { deviceId },
        orderBy: { collectedAt: 'desc' },
        take: limit,
      });
      return NextResponse.json(history);
    }

    if (view === 'ports' && deviceId) {
      // Pegar último snapshot de cada porta
      const ports = await prisma.$queryRaw`
        SELECT DISTINCT ON ("portIdx") *
        FROM "SwitchPortHistory"
        WHERE "deviceId" = ${deviceId}
        ORDER BY "portIdx", "collectedAt" DESC
      ` as any[];
      return NextResponse.json(ports);
    }

    return NextResponse.json({ error: 'View inválida' }, { status: 400 });
  } catch (error) {
    console.error('Error fetching network diagnostics:', error);
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 });
  }
}

// ============================================================
// PATCH — Resolver diagnóstico
// ============================================================
export async function PATCH(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session?.user || !['ADMIN', 'SUPPORT'].includes(session.user.role)) {
      return NextResponse.json({ error: 'Acesso negado' }, { status: 403 });
    }

    const body = await request.json();
    const { diagnosticId, action, resolution } = body;

    if (!diagnosticId || !action) {
      return NextResponse.json({ error: 'diagnosticId e action obrigatórios' }, { status: 400 });
    }

    if (action === 'resolve') {
      await prisma.networkDiagnostic.update({
        where: { id: diagnosticId },
        data: {
          isOpen: false,
          resolvedAt: new Date(),
          resolvedBy: session.user.name || session.user.id,
          resolution: resolution || 'Resolvido manualmente.',
        },
      });
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('Error updating diagnostic:', error);
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 });
  }
}
