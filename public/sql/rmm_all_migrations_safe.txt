-- ============================================================
-- RMM v2 — MIGRATION COMBINADA SEGURA (Phases 1 + 7 + 8)
-- 100% idempotente — pode re-executar sem erros
-- Executar: sudo -u postgres psql -d winner_helpdesk -f /tmp/rmm_all_migrations_safe.sql
-- ============================================================

BEGIN;

-- ============================================================
-- PHASE 1: Governance Core Tables
-- ============================================================

-- 1.1 Colunas extras em RmmMachine (ADD COLUMN IF NOT EXISTS)
ALTER TABLE "RmmMachine" ADD COLUMN IF NOT EXISTS "agentType" TEXT DEFAULT 'ps1';
ALTER TABLE "RmmMachine" ADD COLUMN IF NOT EXISTS "agentVersion" TEXT;
ALTER TABLE "RmmMachine" ADD COLUMN IF NOT EXISTS "lastUpdateAt" TIMESTAMP(3);
ALTER TABLE "RmmMachine" ADD COLUMN IF NOT EXISTS "updateChannel" TEXT DEFAULT 'stable';

-- 1.2 AgentVersion
CREATE TABLE IF NOT EXISTS "AgentVersion" (
    "id" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "agentType" TEXT NOT NULL,
    "channel" TEXT NOT NULL DEFAULT 'stable',
    "fileHashSha256" TEXT NOT NULL,
    "fileSizeBytes" BIGINT NOT NULL,
    "downloadUrl" TEXT NOT NULL,
    "changelog" TEXT,
    "minOsVersion" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "isCritical" BOOLEAN NOT NULL DEFAULT false,
    "createdById" TEXT,
    "tenantId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AgentVersion_pkey" PRIMARY KEY ("id")
);

-- 1.3 AgentUpdateHistory
CREATE TABLE IF NOT EXISTS "AgentUpdateHistory" (
    "id" TEXT NOT NULL,
    "machineId" TEXT NOT NULL,
    "versionId" TEXT,
    "oldVersion" TEXT,
    "newVersion" TEXT NOT NULL,
    "agentType" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "errorMessage" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "rollbackAt" TIMESTAMP(3),
    CONSTRAINT "AgentUpdateHistory_pkey" PRIMARY KEY ("id")
);

-- 1.4 EndpointActivitySession
CREATE TABLE IF NOT EXISTS "EndpointActivitySession" (
    "id" TEXT NOT NULL,
    "machineId" TEXT NOT NULL,
    "windowTitle" TEXT NOT NULL,
    "processName" TEXT NOT NULL,
    "processPath" TEXT,
    "category" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL,
    "endedAt" TIMESTAMP(3),
    "durationSeconds" INTEGER,
    "idleSeconds" INTEGER NOT NULL DEFAULT 0,
    "username" TEXT,
    "isIdle" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "EndpointActivitySession_pkey" PRIMARY KEY ("id")
);

-- 1.5 WebActivity
CREATE TABLE IF NOT EXISTS "WebActivity" (
    "id" TEXT NOT NULL,
    "machineId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "domain" TEXT NOT NULL,
    "pageTitle" TEXT,
    "browser" TEXT,
    "category" TEXT,
    "durationSeconds" INTEGER,
    "visitedAt" TIMESTAMP(3) NOT NULL,
    "username" TEXT,
    "isBlocked" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "WebActivity_pkey" PRIMARY KEY ("id")
);

-- 1.6 UsbEvent
CREATE TABLE IF NOT EXISTS "UsbEvent" (
    "id" TEXT NOT NULL,
    "machineId" TEXT NOT NULL,
    "deviceId" TEXT NOT NULL,
    "deviceName" TEXT,
    "deviceType" TEXT,
    "vendorId" TEXT,
    "productId" TEXT,
    "serialNumber" TEXT,
    "action" TEXT NOT NULL,
    "policyApplied" TEXT,
    "username" TEXT,
    "eventAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "UsbEvent_pkey" PRIMARY KEY ("id")
);

-- 1.7 UsbPolicy
CREATE TABLE IF NOT EXISTS "UsbPolicy" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "companyId" TEXT,
    "policyType" TEXT NOT NULL,
    "deviceClass" TEXT,
    "vendorId" TEXT,
    "productId" TEXT,
    "serialNumber" TEXT,
    "priority" INTEGER NOT NULL DEFAULT 100,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdById" TEXT,
    "tenantId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "UsbPolicy_pkey" PRIMARY KEY ("id")
);

-- 1.8 DriverInventory
CREATE TABLE IF NOT EXISTS "DriverInventory" (
    "id" TEXT NOT NULL,
    "machineId" TEXT NOT NULL,
    "driverName" TEXT NOT NULL,
    "driverVersion" TEXT,
    "provider" TEXT,
    "driverDate" TIMESTAMP(3),
    "deviceName" TEXT,
    "deviceClass" TEXT,
    "infName" TEXT,
    "isSigned" BOOLEAN,
    "signer" TEXT,
    "status" TEXT NOT NULL DEFAULT 'ok',
    "scannedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "DriverInventory_pkey" PRIMARY KEY ("id")
);

-- 1.9 DriverUpdateJob
CREATE TABLE IF NOT EXISTS "DriverUpdateJob" (
    "id" TEXT NOT NULL,
    "machineId" TEXT NOT NULL,
    "driverInventoryId" TEXT,
    "driverName" TEXT NOT NULL,
    "currentVersion" TEXT,
    "targetVersion" TEXT,
    "downloadUrl" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "approvedById" TEXT,
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    CONSTRAINT "DriverUpdateJob_pkey" PRIMARY KEY ("id")
);

-- 1.10 ProductivityPolicy
CREATE TABLE IF NOT EXISTS "ProductivityPolicy" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "companyId" TEXT,
    "trackApps" BOOLEAN NOT NULL DEFAULT true,
    "trackUrls" BOOLEAN NOT NULL DEFAULT false,
    "trackIdle" BOOLEAN NOT NULL DEFAULT true,
    "idleTimeoutSeconds" INTEGER NOT NULL DEFAULT 300,
    "captureIntervalSeconds" INTEGER NOT NULL DEFAULT 30,
    "workingHoursStart" TEXT DEFAULT '08:00',
    "workingHoursEnd" TEXT DEFAULT '18:00',
    "workingDays" INTEGER[] DEFAULT ARRAY[1, 2, 3, 4, 5]::INTEGER[],
    "excludedProcesses" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "productiveApps" JSONB NOT NULL DEFAULT '[]',
    "unproductiveApps" JSONB NOT NULL DEFAULT '[]',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdById" TEXT,
    "tenantId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ProductivityPolicy_pkey" PRIMARY KEY ("id")
);

-- 1.11 GovernanceAuditLog
CREATE TABLE IF NOT EXISTS "GovernanceAuditLog" (
    "id" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT,
    "oldValues" JSONB,
    "newValues" JSONB,
    "performedById" TEXT,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "GovernanceAuditLog_pkey" PRIMARY KEY ("id")
);

-- 1.12 RelayDiscoveredMachine
CREATE TABLE IF NOT EXISTS "RelayDiscoveredMachine" (
    "id" TEXT NOT NULL,
    "relayMachineId" TEXT NOT NULL,
    "companyId" TEXT,
    "hostname" TEXT,
    "ipAddress" TEXT NOT NULL,
    "macAddress" TEXT,
    "osInfo" TEXT,
    "discoveryMethod" TEXT NOT NULL,
    "hasAgent" BOOLEAN NOT NULL DEFAULT false,
    "agentMachineId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'discovered',
    "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "approvedById" TEXT,
    "approvedAt" TIMESTAMP(3),
    "notes" TEXT,
    CONSTRAINT "RelayDiscoveredMachine_pkey" PRIMARY KEY ("id")
);

-- 1.13 RelayDeploymentJob
CREATE TABLE IF NOT EXISTS "RelayDeploymentJob" (
    "id" TEXT NOT NULL,
    "discoveredMachineId" TEXT NOT NULL,
    "relayMachineId" TEXT NOT NULL,
    "deployMethod" TEXT NOT NULL,
    "agentType" TEXT NOT NULL DEFAULT 'msi',
    "agentVersion" TEXT,
    "clientToken" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "progressPct" INTEGER NOT NULL DEFAULT 0,
    "errorMessage" TEXT,
    "retryCount" INTEGER NOT NULL DEFAULT 0,
    "maxRetries" INTEGER NOT NULL DEFAULT 3,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    CONSTRAINT "RelayDeploymentJob_pkey" PRIMARY KEY ("id")
);

-- 1.14 RelayCredential
CREATE TABLE IF NOT EXISTS "RelayCredential" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "encryptedPassword" TEXT NOT NULL,
    "domain" TEXT,
    "credentialType" TEXT NOT NULL DEFAULT 'windows',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "lastUsedAt" TIMESTAMP(3),
    "createdById" TEXT,
    "tenantId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "RelayCredential_pkey" PRIMARY KEY ("id")
);

-- 1.15 RelayConfig
CREATE TABLE IF NOT EXISTS "RelayConfig" (
    "id" TEXT NOT NULL,
    "machineId" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "isRelay" BOOLEAN NOT NULL DEFAULT false,
    "scanIntervalMinutes" INTEGER NOT NULL DEFAULT 60,
    "scanSubnets" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "scanMethods" TEXT[] DEFAULT ARRAY['arp', 'ping']::TEXT[],
    "autoDeploy" BOOLEAN NOT NULL DEFAULT false,
    "credentialId" TEXT,
    "lastScanAt" TIMESTAMP(3),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "RelayConfig_pkey" PRIMARY KEY ("id")
);

-- 1.16 WebFilterCategory
CREATE TABLE IF NOT EXISTS "WebFilterCategory" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT,
    "icon" TEXT,
    "isSystem" BOOLEAN NOT NULL DEFAULT false,
    "parentId" TEXT,
    "tenantId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "WebFilterCategory_pkey" PRIMARY KEY ("id")
);

-- 1.17 WebFilterPolicy
CREATE TABLE IF NOT EXISTS "WebFilterPolicy" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "companyId" TEXT,
    "mode" TEXT NOT NULL DEFAULT 'blacklist',
    "blockedDomains" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "allowedDomains" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "blockedCategories" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "allowedCategories" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "blockedKeywords" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "scheduleEnabled" BOOLEAN NOT NULL DEFAULT false,
    "scheduleStart" TEXT,
    "scheduleEnd" TEXT,
    "scheduleDays" INTEGER[] DEFAULT ARRAY[1, 2, 3, 4, 5]::INTEGER[],
    "blockPageMessage" TEXT DEFAULT 'Acesso bloqueado pela política da empresa.',
    "logOnly" BOOLEAN NOT NULL DEFAULT false,
    "httpsInspection" BOOLEAN NOT NULL DEFAULT false,
    "safeSearch" BOOLEAN NOT NULL DEFAULT true,
    "priority" INTEGER NOT NULL DEFAULT 100,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdById" TEXT,
    "tenantId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "WebFilterPolicy_pkey" PRIMARY KEY ("id")
);

-- 1.18 WebFilterCategoryDomain
CREATE TABLE IF NOT EXISTS "WebFilterCategoryDomain" (
    "id" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "domain" TEXT NOT NULL,
    "isRegex" BOOLEAN NOT NULL DEFAULT false,
    "source" TEXT NOT NULL DEFAULT 'manual',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "WebFilterCategoryDomain_pkey" PRIMARY KEY ("id")
);

-- 1.19 WebFilterLog
CREATE TABLE IF NOT EXISTS "WebFilterLog" (
    "id" TEXT NOT NULL,
    "machineId" TEXT NOT NULL,
    "policyId" TEXT,
    "url" TEXT NOT NULL,
    "domain" TEXT NOT NULL,
    "categoryId" TEXT,
    "action" TEXT NOT NULL,
    "reason" TEXT,
    "matchedRule" TEXT,
    "username" TEXT,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "eventAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "WebFilterLog_pkey" PRIMARY KEY ("id")
);

-- ============================================================
-- PHASE 1: INDEXES (all IF NOT EXISTS)
-- ============================================================
CREATE INDEX IF NOT EXISTS "AgentVersion_agentType_channel_isActive_idx" ON "AgentVersion"("agentType", "channel", "isActive");
CREATE INDEX IF NOT EXISTS "AgentVersion_tenantId_idx" ON "AgentVersion"("tenantId");
CREATE UNIQUE INDEX IF NOT EXISTS "AgentVersion_version_agentType_channel_key" ON "AgentVersion"("version", "agentType", "channel");
CREATE INDEX IF NOT EXISTS "AgentUpdateHistory_machineId_startedAt_idx" ON "AgentUpdateHistory"("machineId", "startedAt" DESC);
CREATE INDEX IF NOT EXISTS "AgentUpdateHistory_status_idx" ON "AgentUpdateHistory"("status");
CREATE INDEX IF NOT EXISTS "EndpointActivitySession_machineId_startedAt_idx" ON "EndpointActivitySession"("machineId", "startedAt" DESC);
CREATE INDEX IF NOT EXISTS "EndpointActivitySession_category_startedAt_idx" ON "EndpointActivitySession"("category", "startedAt" DESC);
CREATE INDEX IF NOT EXISTS "EndpointActivitySession_processName_startedAt_idx" ON "EndpointActivitySession"("processName", "startedAt" DESC);
CREATE INDEX IF NOT EXISTS "WebActivity_machineId_visitedAt_idx" ON "WebActivity"("machineId", "visitedAt" DESC);
CREATE INDEX IF NOT EXISTS "WebActivity_domain_visitedAt_idx" ON "WebActivity"("domain", "visitedAt" DESC);
CREATE INDEX IF NOT EXISTS "UsbEvent_machineId_eventAt_idx" ON "UsbEvent"("machineId", "eventAt" DESC);
CREATE INDEX IF NOT EXISTS "UsbEvent_action_eventAt_idx" ON "UsbEvent"("action", "eventAt" DESC);
CREATE INDEX IF NOT EXISTS "UsbPolicy_companyId_priority_idx" ON "UsbPolicy"("companyId", "priority");
CREATE INDEX IF NOT EXISTS "UsbPolicy_tenantId_idx" ON "UsbPolicy"("tenantId");
CREATE INDEX IF NOT EXISTS "DriverInventory_machineId_idx" ON "DriverInventory"("machineId");
CREATE INDEX IF NOT EXISTS "DriverInventory_status_idx" ON "DriverInventory"("status");
CREATE UNIQUE INDEX IF NOT EXISTS "DriverInventory_machineId_infName_driverVersion_key" ON "DriverInventory"("machineId", "infName", "driverVersion");
CREATE INDEX IF NOT EXISTS "DriverUpdateJob_machineId_createdAt_idx" ON "DriverUpdateJob"("machineId", "createdAt" DESC);
CREATE INDEX IF NOT EXISTS "DriverUpdateJob_status_idx" ON "DriverUpdateJob"("status");
CREATE INDEX IF NOT EXISTS "ProductivityPolicy_companyId_idx" ON "ProductivityPolicy"("companyId");
CREATE INDEX IF NOT EXISTS "ProductivityPolicy_tenantId_idx" ON "ProductivityPolicy"("tenantId");
CREATE INDEX IF NOT EXISTS "GovernanceAuditLog_action_createdAt_idx" ON "GovernanceAuditLog"("action", "createdAt" DESC);
CREATE INDEX IF NOT EXISTS "GovernanceAuditLog_entityType_entityId_idx" ON "GovernanceAuditLog"("entityType", "entityId");
CREATE INDEX IF NOT EXISTS "RelayDiscoveredMachine_relayMachineId_status_idx" ON "RelayDiscoveredMachine"("relayMachineId", "status");
CREATE INDEX IF NOT EXISTS "RelayDiscoveredMachine_companyId_status_idx" ON "RelayDiscoveredMachine"("companyId", "status");
CREATE INDEX IF NOT EXISTS "RelayDiscoveredMachine_status_idx" ON "RelayDiscoveredMachine"("status");
CREATE UNIQUE INDEX IF NOT EXISTS "RelayDiscoveredMachine_relayMachineId_ipAddress_key" ON "RelayDiscoveredMachine"("relayMachineId", "ipAddress");
CREATE INDEX IF NOT EXISTS "RelayDeploymentJob_relayMachineId_status_idx" ON "RelayDeploymentJob"("relayMachineId", "status");
CREATE INDEX IF NOT EXISTS "RelayDeploymentJob_status_idx" ON "RelayDeploymentJob"("status");
CREATE INDEX IF NOT EXISTS "RelayCredential_companyId_idx" ON "RelayCredential"("companyId");
CREATE INDEX IF NOT EXISTS "RelayCredential_tenantId_idx" ON "RelayCredential"("tenantId");
CREATE UNIQUE INDEX IF NOT EXISTS "RelayConfig_machineId_key" ON "RelayConfig"("machineId");
CREATE INDEX IF NOT EXISTS "RelayConfig_companyId_idx" ON "RelayConfig"("companyId");
CREATE UNIQUE INDEX IF NOT EXISTS "WebFilterCategory_slug_key" ON "WebFilterCategory"("slug");
CREATE INDEX IF NOT EXISTS "WebFilterCategory_tenantId_idx" ON "WebFilterCategory"("tenantId");
CREATE INDEX IF NOT EXISTS "WebFilterPolicy_companyId_priority_idx" ON "WebFilterPolicy"("companyId", "priority");
CREATE INDEX IF NOT EXISTS "WebFilterPolicy_tenantId_idx" ON "WebFilterPolicy"("tenantId");
CREATE INDEX IF NOT EXISTS "WebFilterCategoryDomain_domain_idx" ON "WebFilterCategoryDomain"("domain");
CREATE UNIQUE INDEX IF NOT EXISTS "WebFilterCategoryDomain_categoryId_domain_key" ON "WebFilterCategoryDomain"("categoryId", "domain");
CREATE INDEX IF NOT EXISTS "WebFilterLog_machineId_eventAt_idx" ON "WebFilterLog"("machineId", "eventAt" DESC);
CREATE INDEX IF NOT EXISTS "WebFilterLog_domain_action_eventAt_idx" ON "WebFilterLog"("domain", "action", "eventAt" DESC);
CREATE INDEX IF NOT EXISTS "WebFilterLog_action_eventAt_idx" ON "WebFilterLog"("action", "eventAt" DESC);

-- ============================================================
-- PHASE 1: FOREIGN KEYS (safe with DO blocks)
-- ============================================================
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'AgentVersion_tenantId_fkey') THEN
    ALTER TABLE "AgentVersion" ADD CONSTRAINT "AgentVersion_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'AgentUpdateHistory_machineId_fkey') THEN
    ALTER TABLE "AgentUpdateHistory" ADD CONSTRAINT "AgentUpdateHistory_machineId_fkey" FOREIGN KEY ("machineId") REFERENCES "RmmMachine"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'AgentUpdateHistory_versionId_fkey') THEN
    ALTER TABLE "AgentUpdateHistory" ADD CONSTRAINT "AgentUpdateHistory_versionId_fkey" FOREIGN KEY ("versionId") REFERENCES "AgentVersion"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'EndpointActivitySession_machineId_fkey') THEN
    ALTER TABLE "EndpointActivitySession" ADD CONSTRAINT "EndpointActivitySession_machineId_fkey" FOREIGN KEY ("machineId") REFERENCES "RmmMachine"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'WebActivity_machineId_fkey') THEN
    ALTER TABLE "WebActivity" ADD CONSTRAINT "WebActivity_machineId_fkey" FOREIGN KEY ("machineId") REFERENCES "RmmMachine"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'UsbEvent_machineId_fkey') THEN
    ALTER TABLE "UsbEvent" ADD CONSTRAINT "UsbEvent_machineId_fkey" FOREIGN KEY ("machineId") REFERENCES "RmmMachine"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'UsbPolicy_companyId_fkey') THEN
    ALTER TABLE "UsbPolicy" ADD CONSTRAINT "UsbPolicy_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'UsbPolicy_tenantId_fkey') THEN
    ALTER TABLE "UsbPolicy" ADD CONSTRAINT "UsbPolicy_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'DriverInventory_machineId_fkey') THEN
    ALTER TABLE "DriverInventory" ADD CONSTRAINT "DriverInventory_machineId_fkey" FOREIGN KEY ("machineId") REFERENCES "RmmMachine"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'DriverUpdateJob_machineId_fkey') THEN
    ALTER TABLE "DriverUpdateJob" ADD CONSTRAINT "DriverUpdateJob_machineId_fkey" FOREIGN KEY ("machineId") REFERENCES "RmmMachine"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'DriverUpdateJob_driverInventoryId_fkey') THEN
    ALTER TABLE "DriverUpdateJob" ADD CONSTRAINT "DriverUpdateJob_driverInventoryId_fkey" FOREIGN KEY ("driverInventoryId") REFERENCES "DriverInventory"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ProductivityPolicy_companyId_fkey') THEN
    ALTER TABLE "ProductivityPolicy" ADD CONSTRAINT "ProductivityPolicy_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ProductivityPolicy_tenantId_fkey') THEN
    ALTER TABLE "ProductivityPolicy" ADD CONSTRAINT "ProductivityPolicy_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'RelayDiscoveredMachine_relayMachineId_fkey') THEN
    ALTER TABLE "RelayDiscoveredMachine" ADD CONSTRAINT "RelayDiscoveredMachine_relayMachineId_fkey" FOREIGN KEY ("relayMachineId") REFERENCES "RmmMachine"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'RelayDiscoveredMachine_companyId_fkey') THEN
    ALTER TABLE "RelayDiscoveredMachine" ADD CONSTRAINT "RelayDiscoveredMachine_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'RelayDiscoveredMachine_agentMachineId_fkey') THEN
    ALTER TABLE "RelayDiscoveredMachine" ADD CONSTRAINT "RelayDiscoveredMachine_agentMachineId_fkey" FOREIGN KEY ("agentMachineId") REFERENCES "RmmMachine"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'RelayDeploymentJob_discoveredMachineId_fkey') THEN
    ALTER TABLE "RelayDeploymentJob" ADD CONSTRAINT "RelayDeploymentJob_discoveredMachineId_fkey" FOREIGN KEY ("discoveredMachineId") REFERENCES "RelayDiscoveredMachine"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'RelayDeploymentJob_relayMachineId_fkey') THEN
    ALTER TABLE "RelayDeploymentJob" ADD CONSTRAINT "RelayDeploymentJob_relayMachineId_fkey" FOREIGN KEY ("relayMachineId") REFERENCES "RmmMachine"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'RelayCredential_companyId_fkey') THEN
    ALTER TABLE "RelayCredential" ADD CONSTRAINT "RelayCredential_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'RelayCredential_tenantId_fkey') THEN
    ALTER TABLE "RelayCredential" ADD CONSTRAINT "RelayCredential_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'RelayConfig_machineId_fkey') THEN
    ALTER TABLE "RelayConfig" ADD CONSTRAINT "RelayConfig_machineId_fkey" FOREIGN KEY ("machineId") REFERENCES "RmmMachine"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'RelayConfig_companyId_fkey') THEN
    ALTER TABLE "RelayConfig" ADD CONSTRAINT "RelayConfig_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'RelayConfig_credentialId_fkey') THEN
    ALTER TABLE "RelayConfig" ADD CONSTRAINT "RelayConfig_credentialId_fkey" FOREIGN KEY ("credentialId") REFERENCES "RelayCredential"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'WebFilterCategory_parentId_fkey') THEN
    ALTER TABLE "WebFilterCategory" ADD CONSTRAINT "WebFilterCategory_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "WebFilterCategory"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'WebFilterCategory_tenantId_fkey') THEN
    ALTER TABLE "WebFilterCategory" ADD CONSTRAINT "WebFilterCategory_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'WebFilterPolicy_companyId_fkey') THEN
    ALTER TABLE "WebFilterPolicy" ADD CONSTRAINT "WebFilterPolicy_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'WebFilterPolicy_tenantId_fkey') THEN
    ALTER TABLE "WebFilterPolicy" ADD CONSTRAINT "WebFilterPolicy_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'WebFilterCategoryDomain_categoryId_fkey') THEN
    ALTER TABLE "WebFilterCategoryDomain" ADD CONSTRAINT "WebFilterCategoryDomain_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "WebFilterCategory"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'WebFilterLog_machineId_fkey') THEN
    ALTER TABLE "WebFilterLog" ADD CONSTRAINT "WebFilterLog_machineId_fkey" FOREIGN KEY ("machineId") REFERENCES "RmmMachine"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'WebFilterLog_policyId_fkey') THEN
    ALTER TABLE "WebFilterLog" ADD CONSTRAINT "WebFilterLog_policyId_fkey" FOREIGN KEY ("policyId") REFERENCES "WebFilterPolicy"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'WebFilterLog_categoryId_fkey') THEN
    ALTER TABLE "WebFilterLog" ADD CONSTRAINT "WebFilterLog_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "WebFilterCategory"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

-- ============================================================
-- PHASE 1: SEED WebFilterCategory
-- ============================================================
INSERT INTO "WebFilterCategory" ("id", "name", "slug", "description", "isSystem", "createdAt")
VALUES
  (gen_random_uuid()::text, 'Redes Sociais', 'social-media', 'Facebook, Instagram, Twitter, TikTok, etc.', true, NOW()),
  (gen_random_uuid()::text, 'Streaming de Vídeo', 'video-streaming', 'YouTube, Netflix, Disney+, etc.', true, NOW()),
  (gen_random_uuid()::text, 'Jogos', 'games', 'Sites de jogos online e plataformas de gaming', true, NOW()),
  (gen_random_uuid()::text, 'Adulto', 'adult', 'Conteúdo adulto e pornografia', true, NOW()),
  (gen_random_uuid()::text, 'Apostas', 'gambling', 'Sites de apostas e cassinos online', true, NOW()),
  (gen_random_uuid()::text, 'Shopping', 'shopping', 'E-commerce e compras online', true, NOW()),
  (gen_random_uuid()::text, 'Notícias', 'news', 'Portais de notícias e jornais', true, NOW()),
  (gen_random_uuid()::text, 'Comunicação', 'communication', 'Email, chat, mensageiros', true, NOW()),
  (gen_random_uuid()::text, 'Desenvolvimento', 'development', 'GitHub, StackOverflow, docs', true, NOW()),
  (gen_random_uuid()::text, 'Armazenamento Cloud', 'cloud-storage', 'Dropbox, Google Drive, OneDrive', true, NOW()),
  (gen_random_uuid()::text, 'Malware/Phishing', 'malware', 'Sites maliciosos conhecidos', true, NOW()),
  (gen_random_uuid()::text, 'Proxy/VPN', 'proxy-vpn', 'Serviços de anonimização', true, NOW())
ON CONFLICT DO NOTHING;

-- SEED: Domínios padrão por categoria
INSERT INTO "WebFilterCategoryDomain" ("id", "categoryId", "domain", "source", "createdAt")
SELECT gen_random_uuid()::text, c."id", d.domain, 'system', NOW()
FROM "WebFilterCategory" c
CROSS JOIN (VALUES
  ('social-media', 'facebook.com'),
  ('social-media', 'instagram.com'),
  ('social-media', 'twitter.com'),
  ('social-media', 'x.com'),
  ('social-media', 'tiktok.com'),
  ('social-media', 'linkedin.com'),
  ('video-streaming', 'youtube.com'),
  ('video-streaming', 'netflix.com'),
  ('video-streaming', 'twitch.tv'),
  ('games', 'store.steampowered.com'),
  ('games', 'epicgames.com'),
  ('development', 'github.com'),
  ('development', 'stackoverflow.com')
) AS d(slug, domain)
WHERE c."slug" = d.slug
ON CONFLICT ("categoryId", "domain") DO NOTHING;

-- ============================================================
-- PHASE 7: Disk Health Module
-- ============================================================

-- 7.1 DiskInventory
CREATE TABLE IF NOT EXISTS "DiskInventory" (
    "id"              TEXT NOT NULL DEFAULT gen_random_uuid()::text,
    "machineId"       TEXT NOT NULL,
    "diskNumber"      INTEGER NOT NULL,
    "model"           TEXT,
    "serialNumber"    TEXT,
    "firmwareRev"     TEXT,
    "mediaType"       TEXT NOT NULL DEFAULT 'Unknown',
    "busType"         TEXT,
    "sizeBytes"       BIGINT,
    "partitionCount"  INTEGER,
    "partitionsJson"  TEXT,
    "smartStatus"     TEXT NOT NULL DEFAULT 'Unknown',
    "smartEnabled"    BOOLEAN,
    "lastScanAt"      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    "createdAt"       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    "updatedAt"       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT "DiskInventory_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "DiskInventory_machineId_fkey" FOREIGN KEY ("machineId") REFERENCES "RmmMachine"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "DiskInventory_machineId_diskNumber_key" UNIQUE ("machineId", "diskNumber")
);

CREATE INDEX IF NOT EXISTS "DiskInventory_machineId_idx" ON "DiskInventory"("machineId");
CREATE INDEX IF NOT EXISTS "DiskInventory_smartStatus_idx" ON "DiskInventory"("smartStatus");
CREATE INDEX IF NOT EXISTS "DiskInventory_mediaType_idx" ON "DiskInventory"("mediaType");

-- 7.2 DiskHealthMetric
CREATE TABLE IF NOT EXISTS "DiskHealthMetric" (
    "id"                  TEXT NOT NULL DEFAULT gen_random_uuid()::text,
    "machineId"           TEXT NOT NULL,
    "diskInventoryId"     TEXT NOT NULL,
    "temperature"         INTEGER,
    "powerOnHours"        INTEGER,
    "powerCycleCount"     INTEGER,
    "reallocatedSectors"  INTEGER,
    "pendingSectors"      INTEGER,
    "uncorrectableErrors" INTEGER,
    "wearLeveling"        INTEGER,
    "readErrorRate"       INTEGER,
    "writeErrorRate"      INTEGER,
    "throughputMbps"      DOUBLE PRECISION,
    "smartRawJson"        TEXT,
    "healthScore"         INTEGER,
    "collectedAt"         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT "DiskHealthMetric_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "DiskHealthMetric_machineId_fkey" FOREIGN KEY ("machineId") REFERENCES "RmmMachine"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "DiskHealthMetric_diskInventoryId_fkey" FOREIGN KEY ("diskInventoryId") REFERENCES "DiskInventory"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "DiskHealthMetric_diskInv_collected_idx" ON "DiskHealthMetric"("diskInventoryId", "collectedAt" DESC);
CREATE INDEX IF NOT EXISTS "DiskHealthMetric_machine_collected_idx" ON "DiskHealthMetric"("machineId", "collectedAt" DESC);
CREATE INDEX IF NOT EXISTS "DiskHealthMetric_healthScore_idx" ON "DiskHealthMetric"("healthScore");

-- 7.3 DiskHealthAlert
CREATE TABLE IF NOT EXISTS "DiskHealthAlert" (
    "id"              TEXT NOT NULL DEFAULT gen_random_uuid()::text,
    "machineId"       TEXT NOT NULL,
    "diskInventoryId" TEXT NOT NULL,
    "severity"        TEXT NOT NULL,
    "alertType"       TEXT NOT NULL,
    "title"           TEXT NOT NULL,
    "description"     TEXT,
    "metricName"      TEXT,
    "metricValue"     TEXT,
    "thresholdValue"  TEXT,
    "status"          TEXT NOT NULL DEFAULT 'active',
    "acknowledgedBy"  TEXT,
    "acknowledgedAt"  TIMESTAMPTZ,
    "resolvedBy"      TEXT,
    "resolvedAt"      TIMESTAMPTZ,
    "resolution"      TEXT,
    "createdAt"       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT "DiskHealthAlert_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "DiskHealthAlert_machineId_fkey" FOREIGN KEY ("machineId") REFERENCES "RmmMachine"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "DiskHealthAlert_diskInventoryId_fkey" FOREIGN KEY ("diskInventoryId") REFERENCES "DiskInventory"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "DiskHealthAlert_machine_status_idx" ON "DiskHealthAlert"("machineId", "status", "createdAt" DESC);
CREATE INDEX IF NOT EXISTS "DiskHealthAlert_severity_status_idx" ON "DiskHealthAlert"("severity", "status");
CREATE INDEX IF NOT EXISTS "DiskHealthAlert_diskInv_idx" ON "DiskHealthAlert"("diskInventoryId");
CREATE INDEX IF NOT EXISTS "DiskHealthAlert_alertType_status_idx" ON "DiskHealthAlert"("alertType", "status");

-- Trigger para auto-update de updatedAt em DiskInventory
CREATE OR REPLACE FUNCTION update_disk_inventory_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW."updatedAt" = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_disk_inventory_updated_at ON "DiskInventory";
CREATE TRIGGER trg_disk_inventory_updated_at
    BEFORE UPDATE ON "DiskInventory"
    FOR EACH ROW
    EXECUTE FUNCTION update_disk_inventory_updated_at();

-- ============================================================
-- PHASE 8: Network Diagnostics (UniFi/SNMP)
-- ============================================================

-- 8.1 Expandir SnmpDevice
ALTER TABLE "SnmpDevice" ADD COLUMN IF NOT EXISTS "snmpVersion" TEXT DEFAULT '2c';
ALTER TABLE "SnmpDevice" ADD COLUMN IF NOT EXISTS "vendor" TEXT;
ALTER TABLE "SnmpDevice" ADD COLUMN IF NOT EXISTS "model" TEXT;
ALTER TABLE "SnmpDevice" ADD COLUMN IF NOT EXISTS "macAddress" TEXT;
ALTER TABLE "SnmpDevice" ADD COLUMN IF NOT EXISTS "firmware" TEXT;
ALTER TABLE "SnmpDevice" ADD COLUMN IF NOT EXISTS "siteName" TEXT DEFAULT 'default';
ALTER TABLE "SnmpDevice" ADD COLUMN IF NOT EXISTS "cpuPercent" DOUBLE PRECISION;
ALTER TABLE "SnmpDevice" ADD COLUMN IF NOT EXISTS "memPercent" DOUBLE PRECISION;
ALTER TABLE "SnmpDevice" ADD COLUMN IF NOT EXISTS "temperature" DOUBLE PRECISION;
ALTER TABLE "SnmpDevice" ADD COLUMN IF NOT EXISTS "controllerUrl" TEXT;
ALTER TABLE "SnmpDevice" ADD COLUMN IF NOT EXISTS "unifiApiEnabled" BOOLEAN DEFAULT FALSE;
ALTER TABLE "SnmpDevice" ADD COLUMN IF NOT EXISTS "controllerUser" TEXT;
ALTER TABLE "SnmpDevice" ADD COLUMN IF NOT EXISTS "controllerPass" TEXT;

CREATE INDEX IF NOT EXISTS "SnmpDevice_vendor_type_idx" ON "SnmpDevice"("vendor", "type");

-- 8.2 NetworkDiagnostic
CREATE TABLE IF NOT EXISTS "NetworkDiagnostic" (
  "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  "deviceId" TEXT NOT NULL,
  "companyId" TEXT,
  "severity" TEXT NOT NULL,
  "category" TEXT NOT NULL,
  "diagnosticType" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "description" TEXT NOT NULL,
  "recommendation" TEXT NOT NULL,
  "metricValue" TEXT,
  "thresholdValue" TEXT,
  "isOpen" BOOLEAN DEFAULT TRUE,
  "firstSeenAt" TIMESTAMPTZ DEFAULT NOW(),
  "lastSeenAt" TIMESTAMPTZ DEFAULT NOW(),
  "resolvedAt" TIMESTAMPTZ,
  "resolvedBy" TEXT,
  "resolution" TEXT,
  CONSTRAINT "NetworkDiagnostic_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "NetworkDiagnostic_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "SnmpDevice"("id") ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS "NetworkDiagnostic_deviceId_isOpen_idx" ON "NetworkDiagnostic"("deviceId", "isOpen");
CREATE INDEX IF NOT EXISTS "NetworkDiagnostic_companyId_isOpen_severity_idx" ON "NetworkDiagnostic"("companyId", "isOpen", "severity");
CREATE INDEX IF NOT EXISTS "NetworkDiagnostic_diagnosticType_isOpen_idx" ON "NetworkDiagnostic"("diagnosticType", "isOpen");

-- 8.3 WifiChannelHistory
CREATE TABLE IF NOT EXISTS "WifiChannelHistory" (
  "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  "deviceId" TEXT NOT NULL,
  "radio" TEXT NOT NULL,
  "channel" INTEGER,
  "channelWidth" INTEGER,
  "txPower" INTEGER,
  "utilization" DOUBLE PRECISION,
  "noiseFloor" INTEGER,
  "clientsCount" INTEGER,
  "retryRate" DOUBLE PRECISION,
  "satisfaction" INTEGER,
  "collectedAt" TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT "WifiChannelHistory_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "WifiChannelHistory_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "SnmpDevice"("id") ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS "WifiChannelHistory_deviceId_radio_collectedAt_idx" ON "WifiChannelHistory"("deviceId", "radio", "collectedAt" DESC);

-- 8.4 SwitchPortHistory
CREATE TABLE IF NOT EXISTS "SwitchPortHistory" (
  "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  "deviceId" TEXT NOT NULL,
  "portIdx" INTEGER NOT NULL,
  "portName" TEXT,
  "isUp" BOOLEAN,
  "speedMbps" INTEGER,
  "vlanId" INTEGER,
  "poeWatts" DOUBLE PRECISION,
  "rxBytes" BIGINT,
  "txBytes" BIGINT,
  "rxErrors" BIGINT,
  "txErrors" BIGINT,
  "collectedAt" TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT "SwitchPortHistory_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "SwitchPortHistory_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "SnmpDevice"("id") ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS "SwitchPortHistory_deviceId_portIdx_collectedAt_idx" ON "SwitchPortHistory"("deviceId", "portIdx", "collectedAt" DESC);

-- 8.5 WanHealthHistory
CREATE TABLE IF NOT EXISTS "WanHealthHistory" (
  "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  "deviceId" TEXT NOT NULL,
  "wanInterface" TEXT NOT NULL,
  "latencyMs" DOUBLE PRECISION,
  "jitterMs" DOUBLE PRECISION,
  "packetLossPct" DOUBLE PRECISION,
  "rxMbps" DOUBLE PRECISION,
  "txMbps" DOUBLE PRECISION,
  "ispName" TEXT,
  "publicIp" TEXT,
  "isPrimary" BOOLEAN DEFAULT TRUE,
  "collectedAt" TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT "WanHealthHistory_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "WanHealthHistory_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "SnmpDevice"("id") ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS "WanHealthHistory_deviceId_wanInterface_collectedAt_idx" ON "WanHealthHistory"("deviceId", "wanInterface", "collectedAt" DESC);

COMMIT;

-- ============================================================
-- VERIFICAÇÃO FINAL
-- ============================================================
SELECT '✅ Phase 1' AS fase, count(*) AS tabelas FROM information_schema.tables WHERE table_schema = 'public' AND table_name IN ('AgentVersion','AgentUpdateHistory','EndpointActivitySession','WebActivity','UsbEvent','UsbPolicy','DriverInventory','DriverUpdateJob','ProductivityPolicy','GovernanceAuditLog','RelayDiscoveredMachine','RelayDeploymentJob','RelayCredential','RelayConfig','WebFilterCategory','WebFilterPolicy','WebFilterCategoryDomain','WebFilterLog')
UNION ALL
SELECT '✅ Phase 7', count(*) FROM information_schema.tables WHERE table_schema = 'public' AND table_name IN ('DiskInventory','DiskHealthMetric','DiskHealthAlert')
UNION ALL
SELECT '✅ Phase 8', count(*) FROM information_schema.tables WHERE table_schema = 'public' AND table_name IN ('NetworkDiagnostic','WifiChannelHistory','SwitchPortHistory','WanHealthHistory')
ORDER BY fase;
