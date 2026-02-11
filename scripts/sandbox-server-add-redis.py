#!/usr/bin/env python3
"""Add Redis + serverless-redis-http to existing sandbox server, then update main Dragon env."""
import os
import sys

try:
    import paramiko
except ImportError:
    import subprocess
    subprocess.check_call([sys.executable, "-m", "pip", "install", "--user", "paramiko"])
    import paramiko


def run_ssh(host, user, password, command, timeout=120):
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
    sandbox_password = os.environ.get("SANDBOX_SERVER_PASSWORD", "")
    if not main_password or not sandbox_password:
        print("Set DRAGON_MAIN_PASSWORD and SANDBOX_SERVER_PASSWORD")
        sys.exit(1)

    redis_token = os.environ.get("REDIS_HTTP_TOKEN", "dragon_redis_sandbox_token")

    # 1. On sandbox server: allow port 8079 from main server, start Redis + serverless-redis-http
    main_ip = main_host.split("@")[-1].split(":")[0] if "@" in main_host else main_host
    print(">>> Configuring firewall and starting Redis on sandbox server...")
    fw_cmd = f"ufw allow from {main_ip} to any port 8079 2>/dev/null; ufw --force enable 2>/dev/null || true"
    run_ssh(sandbox_host, "root", sandbox_password, fw_cmd)

    print(">>> Starting Redis on sandbox server...")
    redis_cmd = f"""
    docker network create dragon_redis_net 2>/dev/null || true
    docker rm -f dragon_sandbox_redis dragon_sandbox_redis_http 2>/dev/null || true
    docker run -d --name dragon_sandbox_redis --restart unless-stopped \\
      --network dragon_redis_net \\
      -v dragon_sandbox_redis_data:/data \\
      redis:7-alpine
    docker run -d --name dragon_sandbox_redis_http --restart unless-stopped \\
      --network dragon_redis_net \\
      -p 8079:80 \\
      -e SRH_MODE=env \\
      -e SRH_TOKEN="{redis_token}" \\
      -e SRH_CONNECTION_STRING="redis://dragon_sandbox_redis:6379" \\
      hiett/serverless-redis-http:latest
    echo "Redis HTTP running on port 8079"
    """
    code, out, err = run_ssh(sandbox_host, "root", sandbox_password, redis_cmd)
    print(out)
    if err:
        print(err, file=sys.stderr)
    if code != 0:
        sys.exit(1)

    # 2. On main server: update env with REDIS_URL, REDIS_TOKEN, Dragon URL
    print(">>> Updating main Dragon server env...")
    main_host_ip = main_host.split("@")[-1].split(":")[0] if "@" in main_host else main_host
    dragon_url = os.environ.get("DRAGON_APP_URL", f"http://{main_host_ip}:3000")

    def set_env(key, val):
        return f'grep -q "^{key}=" "$ENV_FILE" && sed -i "s|^{key}=.*|{key}={val}|" "$ENV_FILE" || echo "{key}={val}" >> "$ENV_FILE"'

    env_cmd = f"""
    cd /opt/dragon
    ENV_FILE="apps/www/.env.production.local"
    touch "$ENV_FILE"
    {set_env('REDIS_URL', f'http://{sandbox_host}:8079')}
    {set_env('REDIS_TOKEN', redis_token)}
    {set_env('NEXT_PUBLIC_APP_URL', dragon_url)}
    {set_env('LOCALHOST_PUBLIC_DOMAIN', dragon_url)}
    echo "Env updated"
    """
    code, out, err = run_ssh(main_host, "root", main_password, env_cmd)
    print(out)

    # 3. Restart Dragon
    print(">>> Restarting Dragon app...")
    code, out, err = run_ssh(main_host, "root", main_password,
        "cd /opt/dragon && pm2 restart ecosystem.config.cjs")
    print(out)

    print("\n>>> Done. Redis on sandbox server, Dragon env updated with Redis + app URL.")


if __name__ == "__main__":
    main()
