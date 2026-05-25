# Infrastructure

Azure Bicep templates for deploying the WhatsApp Scheduler to a Linux VM.

## What gets deployed

| Resource | Details |
|----------|---------|
| Virtual Network | 10.0.0.0/16 with one subnet |
| Network Security Group | SSH (22), HTTP (80), HTTPS (443) |
| Public IP | Standard SKU, static |
| Network Interface | With public IP attached |
| Linux VM | Ubuntu 24.04 LTS, Standard_B1s |

## Prerequisites

- [Azure CLI](https://docs.microsoft.com/en-us/cli/azure/install-azure-cli) installed
- An Azure subscription
- An SSH key pair (`ssh-keygen -t ed25519`)

## Deploy

1. **Edit parameters** — update `infra/main.bicepparam` with your SSH public key:
   ```
   param adminPublicKey = 'ssh-ed25519 AAAA...'
   ```

2. **Create resource group:**
   ```bash
   az group create --name rg-whatsapp-scheduler --location eastus
   ```

3. **Deploy:**
   ```bash
   az deployment group create \
     --resource-group rg-whatsapp-scheduler \
     --template-file infra/main.bicep \
     --parameters infra/main.bicepparam
   ```

4. **Get outputs:**
   ```bash
   az deployment group show \
     --resource-group rg-whatsapp-scheduler \
     --name main \
     --query properties.outputs
   ```

## After deployment

The VM will automatically:
- Install Docker CE + Docker Compose
- Create `/opt/whatsapp-scheduler/` with compose files
- Set up Caddy as a reverse proxy (port 80 → app port 3000)
- Create a systemd service for auto-start on reboot

### First-time setup

SSH into the VM and:

```bash
ssh azureuser@<PUBLIC_IP>

# Navigate to app directory
cd /opt/whatsapp-scheduler

# Copy your existing data (auth + DB) from local machine:
# From your local machine:
# scp -r ./data azureuser@<PUBLIC_IP>:/opt/whatsapp-scheduler/

# Start the stack
docker compose up -d

# Check logs
docker compose logs -f
```

### Updating the app

```bash
ssh azureuser@<PUBLIC_IP>
cd /opt/whatsapp-scheduler
docker compose pull
docker compose up -d
```

## Cost estimate

| Resource | Monthly cost |
|----------|-------------|
| Standard_B1s VM | ~$7.59 |
| 32GB Standard_LRS OS disk | ~$1.54 |
| Standard public IP | ~$3.65 |
| **Total** | **~$12.78/month** |

## Security notes

- SSH: Key-only auth (no passwords)
- Web: Behind Caddy reverse proxy
- Restrict `sshAllowedCidr` and `webAllowedCidr` to your IP for best security
- The app itself has no built-in auth — restrict via NSG or add auth in a future PR
