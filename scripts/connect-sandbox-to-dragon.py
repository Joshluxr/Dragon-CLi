#!/usr/bin/env python3
"""Connect sandbox server to main Dragon server: SSH keys + DOCKER_HOST."""
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

    # 1. On main server: ensure SSH key exists, get public key
    print(">>> Setting up SSH key on main Dragon server...")
    key_cmd = """
    mkdir -p ~/.ssh
    chmod 700 ~/.ssh
    if [ ! -f ~/.ssh/id_rsa ]; then
      ssh-keygen -t rsa -N "" -f ~/.ssh/id_rsa -q
    fi
    cat ~/.ssh/id_rsa.pub 2>/dev/null || cat ~/.ssh/id_ed25519.pub 2>/dev/null
    """
    code, out, err = run_ssh(main_host, "root", main_password, key_cmd)
    if code != 0:
        print(err)
        sys.exit(1)
    pubkey = out.strip().split("\n")[-1]
    if not pubkey or "ssh-" not in pubkey:
        print("Failed to get public key")
        sys.exit(1)
    print("Got public key:", pubkey[:60] + "...")

    # 2. On sandbox server: add main server's public key to authorized_keys
    print(">>> Adding key to sandbox server authorized_keys...")
    auth_cmd = f"""
    mkdir -p ~/.ssh
    chmod 700 ~/.ssh
    echo '{pubkey}' >> ~/.ssh/authorized_keys
    chmod 600 ~/.ssh/authorized_keys
    sort -u ~/.ssh/authorized_keys -o ~/.ssh/authorized_keys
    echo "Key added"
    """
    code, out, err = run_ssh(sandbox_host, "root", sandbox_password, auth_cmd)
    if code != 0:
        print(err)
        sys.exit(1)

    # 3. On main server: test SSH, add DOCKER_HOST to env, restart
    print(">>> Testing SSH from main to sandbox...")
    test_cmd = f"ssh -o StrictHostKeyChecking=no -o BatchMode=yes root@{sandbox_host} 'echo OK'"
    code, out, err = run_ssh(main_host, "root", main_password, test_cmd)
    if code != 0:
        # First connection might need to accept host key - use a different approach
        test_cmd2 = f"ssh -o StrictHostKeyChecking=accept-new root@{sandbox_host} 'echo OK' 2>/dev/null || true"
        code2, out2, _ = run_ssh(main_host, "root", main_password, test_cmd2)
        if "OK" not in out2:
            print("SSH test failed. Host key may need manual acceptance.")
            print("Run on main server: ssh root@23.239.108.30 (accept fingerprint)")

    # 4. Add DOCKER_HOST to main server's env file
    print(">>> Adding DOCKER_HOST to main server env...")
    env_update = f"""
    cd /opt/dragon
    ENV_FILE="apps/www/.env.production.local"
    if [ -f "$ENV_FILE" ]; then
      if ! grep -q "^DOCKER_HOST=" "$ENV_FILE"; then
        echo "DOCKER_HOST=ssh://root@{sandbox_host}" >> "$ENV_FILE"
        echo "Added DOCKER_HOST"
      else
        sed -i "s|^DOCKER_HOST=.*|DOCKER_HOST=ssh://root@{sandbox_host}|" "$ENV_FILE"
        echo "Updated DOCKER_HOST"
      fi
    else
      echo "DOCKER_HOST=ssh://root@{sandbox_host}" >> "$ENV_FILE"
      echo "Created with DOCKER_HOST"
    fi
    """
    code, out, err = run_ssh(main_host, "root", main_password, env_update)
    print(out)

    # 5. Restart PM2
    print(">>> Restarting Dragon app...")
    code, out, err = run_ssh(main_host, "root", main_password,
        "cd /opt/dragon && pm2 restart ecosystem.config.cjs")
    print(out)
    if err:
        print(err, file=sys.stderr)

    print("\n>>> Done. Users can select 'Docker (self-hosted)' in Sandbox settings.")
    print(">>> REDIS: For production rate limiting, use Upstash (console.upstash.com) or the app will allow sandbox creation when Redis fails.")


if __name__ == "__main__":
    main()
