#!/bin/bash
mkdir -p /tmp/agent_cbdf13f3-8b64-4d8f-a8b7-c41223e1b6c7/.ssh
ssh-keygen -t ed25519 -C "user@host" -f /tmp/agent_cbdf13f3-8b64-4d8f-a8b7-c41223e1b6c7/.ssh/id_ed25519 -N ""
cat /tmp/agent_cbdf13f3-8b64-4d8f-a8b7-c41223e1b6c7/.ssh/id_ed25519.pub
