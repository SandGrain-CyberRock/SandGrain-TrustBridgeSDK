

TrustBridge Local Environment Deployment and Setup Guide

Project:
TrustBridge
Document Reference:
TB-TDD-001
Status:
Approved
Prepared for:
SandGrain BV
Classification:
Confidential
Version
1.0


Document Type
TrustBridge Local Environment Deployment and Setup Guide
Intended Audience
SandGrain BV -Full-stack Developers, DevOps Engineers, and System Integrators
Scope
Local containerized deployment of Backend, Frontend, Cloud Services, and SDK Device Simulators using Docker










Table of Content
Prerequisites and Installation	3
1. Network Initialization	4
2. Component Setup	4
2.1. Backend (BE)	4
2.2. Frontend (FE)	4
2.3. Cloud Services	4
2.4. SDK Devices	5
3. Short-cuts and Troubleshooting	5
3.1. The "One-Shot" Command	5
3.2. Port Conflicts	5
4. Verification	6



This guide provides a comprehensive walkthrough for setting up the TrustBridge ecosystem locally using Docker. All necessary configurations are located in the feat/docker-local branch across the respective repositories.
Prerequisites and Installation
Before starting, ensure you have the Docker engine installed.
Install Docker (macOS):
brew install --cask docker
Launch Docker:
open -a Docker
Verify Status:
Wait a few moments for the engine to start, then run:
docker info






Network Initialization
The components communicate over a shared virtual bridge. You must create this network once before launching containers.
docker network create trustbridge-net
Component Setup
Ensure you have checked out the feat/docker-local branch for each repository.
Backend (BE)
cd /path/to/TrustBridge-Be
cp .env.example .env        # Modify variables if necessary
docker compose up -d --build
Frontend (FE)
cd /path/to/TrustBridge-FE
cp .env.example .env
docker compose up -d --build
Cloud Services
cd /path/to/sdk-v3/Cloud
cp .env.example .env
docker compose up -d --build



SDK Devices
cd /path/to/sdk-v3
./setup.sh         # Run initialization
./start-device.sh  # Launch the device simulator

Short-cuts and Troubleshooting 
The "One-Shot" Command
If you have the orchestration script available, you can launch the entire stack at once:
cd /path/to/trustbridge-docker && ./start-all.sh up
Port Conflicts
The stack requires specific host ports. Ensure these are free before running compose up:
Port
For
3000
Backend
5173
Frontend
1883
MQTT

To check if a port (e.g., 3000) is busy:
lsof -iTCP:3000 -sTCP:LISTEN

If a process is found, kill it or update the port mapping in your .env file.

Verification
Once all containers are running, verify the services:
Frontend UI: 
http://localhost:5173
Backend Swagger Docs:
http://localhost:3000/docs
Container Status:
Run docker ps. You should see at least 5 containers prefixed with tb-*.



Use these commands to manage your TrustBridge environment daily.
Action
Command
Description
View Logs

docker compose logs -f


Follow real-time output from all services.
Stop

docker compose -p container-name stop


Stop containers without removing them.
Start

docker compose -p container-name  start


Restart stopped containers.
Restart

docker compose -p container-name  restart


Quickly reboot services to apply minor changes.
Down

docker compose -p container-name  down


Stop and remove containers and networks.
Cleanup

docker system -p container-name  prune


Remove unused data (use with caution).


!!!!!!TIPS!!!!!
To view logs for a specific service only (e.g., the backend), use:
docker logs -f tb-be-container-name



