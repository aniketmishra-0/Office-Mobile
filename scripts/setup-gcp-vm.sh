#!/usr/bin/env bash

# Setup script for GCP VM - run this ONCE on the VM before first deployment
set -euo pipefail

echo "========================================="
echo "GCP VM Setup Script"
echo "========================================="

# Update system
echo "Updating system packages..."
sudo apt-get update
sudo apt-get upgrade -y

# Install Node.js and npm
echo "Installing Node.js and npm..."
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs

# Install pm2 globally
echo "Installing pm2..."
sudo npm install -g pm2

# Setup pm2 to start on boot
echo "Setting up pm2 to start on boot..."
sudo pm2 startup
pm2 save

# Install git
echo "Installing git..."
sudo apt-get install -y git

# Install Python (for backend if needed)
echo "Installing Python..."
sudo apt-get install -y python3 python3-pip python3-venv

# Create SSH directory
echo "Setting up SSH..."
mkdir -p ~/.ssh
chmod 700 ~/.ssh

# Clone the repository
echo "Cloning Office-Mobile repository..."
cd ~
git clone https://github.com/aniketmishra-0/Office-Mobile.git

echo "========================================="
echo "✓ VM Setup Complete!"
echo "========================================="
echo ""
echo "Next steps:"
echo "1. cd ~/Office-Mobile/backend"
echo "2. npm install"
echo "3. pm2 start 'npm start' --name backend"
echo "4. pm2 save"
