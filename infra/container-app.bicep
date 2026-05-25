// WhatsApp Scheduler — Azure Container Apps worker
// Runs APP_ROLE=worker (Baileys + cron) against a Neon Postgres database.
// The web UI and API are served from Vercel; only the WhatsApp worker lives here.

@description('Azure region for all resources')
param location string = 'eastus'

@description('Name prefix for all resources')
param appName string = 'whatsapp-scheduler'

@description('Container image to deploy (e.g. ghcr.io/jmarti326/whatsapp-scheduler:latest)')
param containerImage string

@description('Neon Postgres connection string')
@secure()
param databaseUrl string

@description('Express session secret')
@secure()
param sessionSecret string

@description('Admin username to seed on first boot (optional)')
param adminUser string = ''

@description('Admin password to seed on first boot (optional)')
@secure()
param adminPass string = ''

@description('Tags for all resources')
param tags object = {
  project: 'whatsapp-scheduler'
  environment: 'production'
  role: 'worker'
}

// ── Log Analytics workspace (required by Container Apps) ─────────────────────
resource logWorkspace 'Microsoft.OperationalInsights/workspaces@2022-10-01' = {
  name: '${appName}-logs'
  location: location
  tags: tags
  properties: {
    sku: { name: 'PerGB2018' }
    retentionInDays: 30
  }
}

// ── Container Apps environment ────────────────────────────────────────────────
resource caEnvironment 'Microsoft.App/managedEnvironments@2023-05-01' = {
  name: '${appName}-env'
  location: location
  tags: tags
  properties: {
    appLogsConfiguration: {
      destination: 'log-analytics'
      logAnalyticsConfiguration: {
        customerId: logWorkspace.properties.customerId
        sharedKey: logWorkspace.listKeys().primarySharedKey
      }
    }
  }
}

// ── Azure Files share for WhatsApp auth_info persistence ─────────────────────
resource storageAccount 'Microsoft.Storage/storageAccounts@2023-01-01' = {
  name: replace('${appName}stor', '-', '')
  location: location
  tags: tags
  sku: { name: 'Standard_LRS' }
  kind: 'StorageV2'
}

resource fileShare 'Microsoft.Storage/storageAccounts/fileServices/shares@2023-01-01' = {
  name: '${storageAccount.name}/default/auth-info'
}

resource caStorageMount 'Microsoft.App/managedEnvironments/storages@2023-05-01' = {
  name: 'auth-info-storage'
  parent: caEnvironment
  properties: {
    azureFile: {
      accountName: storageAccount.name
      accountKey: storageAccount.listKeys().keys[0].value
      shareName: 'auth-info'
      accessMode: 'ReadWrite'
    }
  }
}

// ── Container App (worker) ────────────────────────────────────────────────────
resource workerApp 'Microsoft.App/containerApps@2023-05-01' = {
  name: '${appName}-worker'
  location: location
  tags: tags
  properties: {
    managedEnvironmentId: caEnvironment.id
    configuration: {
      // No ingress — worker doesn't serve HTTP
      secrets: [
        { name: 'database-url', value: databaseUrl }
        { name: 'session-secret', value: sessionSecret }
        { name: 'admin-pass', value: empty(adminPass) ? 'placeholder' : adminPass }
      ]
    }
    template: {
      containers: [
        {
          name: 'worker'
          image: containerImage
          env: [
            { name: 'APP_ROLE', value: 'worker' }
            { name: 'DATABASE_URL', secretRef: 'database-url' }
            { name: 'SESSION_SECRET', secretRef: 'session-secret' }
            { name: 'ADMIN_USER', value: adminUser }
            { name: 'ADMIN_PASS', secretRef: 'admin-pass' }
            { name: 'TZ', value: 'America/Puerto_Rico' }
          ]
          resources: {
            cpu: json('0.25')
            memory: '0.5Gi'
          }
          volumeMounts: [
            {
              volumeName: 'auth-info'
              mountPath: '/app/data/auth_info'
            }
          ]
        }
      ]
      scale: {
        // Always-on: exactly 1 replica so WhatsApp connection stays live
        minReplicas: 1
        maxReplicas: 1
      }
      volumes: [
        {
          name: 'auth-info'
          storageType: 'AzureFile'
          storageName: caStorageMount.name
        }
      ]
    }
  }
}

// ── Outputs ───────────────────────────────────────────────────────────────────
output containerAppName string = workerApp.name
output environmentName string = caEnvironment.name
output storageAccountName string = storageAccount.name
