export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { evaluateAlertPolicies, autoResolveOfflineAlerts } from '@/lib/rmm-alerts';

// POST /api/rmm/checkin — Agente envia heartbeat + dados da máquina
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      token, hostname, user, os, ram, disk_model, disk_size, status, last_login, ip_address,
      // Extended fields
      public_ip, upn_users, gpu_info, services, installed_apps,
      cpu_model, cpu_usage, ram_usage, disk_usage, antivirus_status, last_boot_time,
      // Hardware extras
      serial_number, manufacturer, machine_model,
      memory_slots_total, memory_slots_used, memory_modules,
    } = body;

    if (!token || !hostname) {
      return NextResponse.json({ error: 'Token e hostname são obrigatórios' }, { status: 400 });
    }

    // Buscar empresa pelo token RMM
    const company = await prisma.company.findUnique({
      where: { rmmToken: token },
    });

    if (!company) {
      return NextResponse.json({ error: 'Token inválido' }, { status: 401 });
    }

    // Build extended data
    const extendedData: any = {};
    if (public_ip !== undefined) extendedData.publicIp = public_ip;
    if (upn_users !== undefined) extendedData.upnUsers = typeof upn_users === 'string' ? upn_users : JSON.stringify(upn_users);
    if (gpu_info !== undefined) extendedData.gpuInfo = gpu_info;
    if (services !== undefined) extendedData.services = typeof services === 'string' ? services : JSON.stringify(services);
    if (installed_apps !== undefined) extendedData.installedApps = typeof installed_apps === 'string' ? installed_apps : JSON.stringify(installed_apps);
    if (cpu_model !== undefined) extendedData.cpuModel = cpu_model;
    if (cpu_usage !== undefined) extendedData.cpuUsage = parseFloat(cpu_usage) || null;
    if (ram_usage !== undefined) extendedData.ramUsage = parseFloat(ram_usage) || null;
    if (disk_usage !== undefined) extendedData.diskUsage = parseFloat(disk_usage) || null;
    if (antivirus_status !== undefined) extendedData.antivirusStatus = antivirus_status;
    if (last_boot_time !== undefined) extendedData.lastBootTime = new Date(last_boot_time);
    if (body.teamviewer_id !== undefined) extendedData.teamviewerId = body.teamviewer_id || null;
    // Hardware extras
    if (serial_number !== undefined) extendedData.serialNumber = serial_number || null;
    if (manufacturer !== undefined) extendedData.manufacturer = manufacturer || null;
    if (machine_model !== undefined) extendedData.model = machine_model || null;
    if (memory_slots_total !== undefined) extendedData.memorySlotsTotal = memory_slots_total != null ? parseInt(String(memory_slots_total)) || null : null;
    if (memory_slots_used !== undefined) extendedData.memorySlotsUsed = memory_slots_used != null ? parseInt(String(memory_slots_used)) || null : null;
    if (memory_modules !== undefined) {
      extendedData.memoryModulesJson = typeof memory_modules === 'string'
        ? memory_modules
        : JSON.stringify(memory_modules);
    }

    const baseData = {
      username: user || null,
      os: os || null,
      ram: ram || null,
      diskModel: disk_model || null,
      diskSize: disk_size || null,
      status: status || 'Ligado',
      lastLogin: last_login || null,
      lastCheckin: new Date(),
      ipAddress: ip_address || null,
      ...extendedData,
    };

    // Upsert da máquina (cria ou atualiza)
    const machine = await prisma.rmmMachine.upsert({
      where: {
        hostname_companyId: {
          hostname: hostname,
          companyId: company.id,
        },
      },
      update: baseData,
      create: {
        hostname: hostname,
        companyId: company.id,
        ...baseData,
      },
    });

    // Auto-resolve offline alerts (machine is alive)
    await autoResolveOfflineAlerts(machine.id);

    // Evaluate alert policies with dedup (if metrics available)
    const cpuVal = extendedData.cpuUsage ?? null;
    const ramVal = extendedData.ramUsage ?? null;
    const diskVal = extendedData.diskUsage ?? null;
    if (cpuVal != null || ramVal != null || diskVal != null) {
      await evaluateAlertPolicies(machine.id, company.id, {
        cpuPercent: cpuVal,
        memoryPercent: ramVal,
        diskPercent: diskVal,
      });
    }

    return NextResponse.json({ ok: true, machine_id: machine.id });
  } catch (error) {
    console.error('RMM checkin error:', error);
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 });
  }
}
