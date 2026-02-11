#!/usr/bin/env python3
"""Run Dragon setup on remote VPS via SSH."""
import argparse
import sys

try:
    import paramiko
except ImportError:
    print("Installing paramiko...")
    import subprocess
    subprocess.check_call([sys.executable, "-m", "pip", "install", "--user", "paramiko"])
    import paramiko


def run_ssh_command(host, username, password, command, timeout=300):
    """Execute a command on remote host via SSH."""
    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    try:
        client.connect(host, username=username, password=password, timeout=10)
        stdin, stdout, stderr = client.exec_command(command, timeout=timeout)
        out = stdout.read().decode()
        err = stderr.read().decode()
        code = stdout.channel.recv_exit_status()
        return code, out, err
    finally:
        client.close()


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--host", default="65.75.200.136")
    parser.add_argument("--user", default="root")
    parser.add_argument("--password", required=True)
    parser.add_argument("--repo", default="https://github.com/Joshluxr/Dragon-CLi.git")
    parser.add_argument("--branch", default="cursor/initial-branch-setup-e484")
    parser.add_argument("--token", help="GitHub token for private repo clone")
    parser.add_argument("--repo-url", help="Full repo URL with auth (overrides --repo)")
    args = parser.parse_args()

    host, user, password = args.host, args.user, args.password
    repo_url = args.repo_url or args.repo
    branch = args.branch
    if args.token and not args.repo_url:
        repo_url = repo_url.replace("https://", f"https://{args.token}@")
    if not repo_url.endswith(".git"):
        repo_url = repo_url.rstrip("/") + ".git"

    clone_cmd = f"""rm -rf /opt/dragon
git clone -b {branch} {repo_url} /opt/dragon"""
    commands = [
        ("Cloning/updating repository...", clone_cmd),
        ("Running setup script...", "cd /opt/dragon && chmod +x scripts/vps-setup.sh && ./scripts/vps-setup.sh /opt/dragon"),
    ]

    for desc, cmd in commands:
        print(f"\n>>> {desc}")
        print(f"$ {cmd[:80]}...")
        code, out, err = run_ssh_command(host, user, password, cmd, timeout=600)
        if out:
            print(out)
        if err:
            print(err, file=sys.stderr)
        if code != 0:
            print(f"Command failed with exit code {code}")
            sys.exit(1)

    print("\n>>> Setup complete! Next: configure env and start services.")


if __name__ == "__main__":
    main()
