#!/usr/bin/env python3
"""Deploy Dragon to VPS via tarball upload (no git pull needed)."""
import os
import subprocess
import sys
import tempfile

try:
    import paramiko
except ImportError:
    print("Installing paramiko...")
    subprocess.check_call([sys.executable, "-m", "pip", "install", "--user", "paramiko"])
    import paramiko


def run_ssh(host, user, password, command, timeout=600):
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
    host = os.environ.get("VPS_HOST", "65.75.200.136")
    user = os.environ.get("VPS_USER", "root")
    password = os.environ.get("VPS_PASSWORD", "")
    if not password:
        print("Set VPS_PASSWORD environment variable")
        sys.exit(1)

    workspace = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    os.chdir(workspace)

    with tempfile.NamedTemporaryFile(suffix=".tar.gz", delete=False) as f:
        tarball = f.name
    try:
        print(">>> Creating tarball...")
        # Bundle apps/www and shared packages needed for www build
        subprocess.run(
            [
                "tar",
                "czf",
                tarball,
                "apps/www",
                "packages/shared",
                "packages/env",
                "packages/sandbox",
                "packages/agent",
                "packages/types",
                "package.json",
                "pnpm-workspace.yaml",
                "turbo.json",
            ],
            check=True,
        )

        print(">>> Uploading...")
        transport = paramiko.Transport((host, 22))
        transport.connect(username=user, password=password)
        sftp = paramiko.SFTPClient.from_transport(transport)
        remote_path = "/tmp/dragon-deploy.tar.gz"
        sftp.put(tarball, remote_path)
        sftp.close()
        transport.close()

        dragon_path = "/opt/dragon"
        commands = [
            f"cd {dragon_path} && tar xzf {remote_path} -C . && rm {remote_path}",
            f"cd {dragon_path} && pnpm install",
            f"cd {dragon_path} && pnpm exec turbo build --filter=@dragon/www",
            f"cd {dragon_path} && pm2 restart ecosystem.config.cjs 2>/dev/null || pm2 restart all",
        ]

        for i, cmd in enumerate(commands):
            desc = ["Extract", "Install", "Build", "Restart"][i]
            print(f"\n>>> {desc}")
            code, out, err = run_ssh(host, user, password, cmd, timeout=600)
            if out:
                print(out)
            if err:
                print(err, file=sys.stderr)
            if code != 0:
                print(f"Failed (exit {code})")
                sys.exit(1)

        print("\n>>> Deploy complete")
    finally:
        os.unlink(tarball)


if __name__ == "__main__":
    main()
