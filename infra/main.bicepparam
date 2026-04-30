using 'main.bicep'

param location = 'eastus'
param vmName = 'vm-team-scheduler'
param adminUsername = 'azureuser'
param vmSize = 'Standard_B1s'

// Replace with your SSH public key before deploying
param adminPublicKey = '<YOUR_SSH_PUBLIC_KEY>'

// Restrict access (set to your IP for better security, e.g. '203.0.113.50/32')
param sshAllowedCidr = '*'
param webAllowedCidr = '*'

param tags = {
  project: 'team-scheduler-bot'
  environment: 'production'
  managedBy: 'bicep'
}
