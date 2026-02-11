#!/usr/bin/env python3
"""Diagnose Docker sandbox provisioning - run from your machine, tests main server."""
import os
import sys

try:
    import paramiko
except ImportError:
    import subprocess
    subprocess.check_call([sys.executable, "-m", "pip", "install", "--user", "paramiko"])
    import paramiko


def run_ssh(host, user, password, command, timeout=60):
    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    try:
        client.connect(host, username=user, password=password, timeout=15)
        stdin, stdout, stderr = client.exec_command(command, timeout=timeout)
        out = stdout.read().decode()
        err = stderr.read().decode()
        code = stdout.channel.recv_exit_status()
        return code, out, err
    finally:
        client.close()


def main():
    main_host = os.environ.get("DRAGON_MAIN_HOST", "65.75.200.136")
    main_password = os.environ.get("DRAGON_MAIN_PASSWORD", "")
    sandbox_host = os.environ.get("SANDBOX_SERVER_HOST", "23.239.108.30")
    if not main_password:
        print("Set DRAGON_MAIN_PASSWORD")
        sys.exit(1)

    print(">>> 1. Check DOCKER_HOST in env...")
    code, out, err = run_ssh(main_host, "root", main_password,
        "grep DOCKER_HOST /opt/dragon/apps/www/.env.production.local 2>/dev/null || echo 'NOT FOUND'")
    print(out or err)

    print(">>> 2. Test SSH from main to sandbox...")
    code, out, err = run_ssh(main_host, "root", main_password,
        f"timeout 10 ssh -o ConnectTimeout=5 -o BatchMode=yes root@{sandbox_host} 'echo OK' 2>&1")
    print("OK" in out and "OK" or f"FAILED: {out} {err}")

    print(">>> 3. Test Docker over SSH (docker ps on sandbox)...")
    code, out, err = run_ssh(main_host, "root", main_password,
        f"export DOCKER_HOST=ssh://root@{sandbox_host}; timeout 30 docker ps 2>&1")
    print(out[:500] if out else err[:500])

    print(">>> 4. Test Docker run (quick container)...")
    code, out, err = run_ssh(main_host, "root", main_password,
        f"export DOCKER_HOST=ssh://root@{sandbox_host}; "
        "timeout 60 docker run --rm alpine echo hello 2>&1")
    print("hello" in out and "SUCCESS" or f"FAILED/OUTPUT: {out[:300]} {err[:300]}")

    print(">>> 5. Recent PM2 logs (dragon-www)...")
    code, out, err = run_ssh(main_host, "root", main_password,
        "cd /opt/dragon && pm2 logs dragon-www --lines 30 --nostream 2>&1")
    print(out[-2000:] if len(out) > 2000 else out)


if __name__ == "__main__":
    main()
