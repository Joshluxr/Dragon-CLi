#!/usr/bin/env python3
"""Set up Dragon sandbox server via SSH (Docker + base image)."""
import os
import sys

try:
    import paramiko
except ImportError:
    print("Installing paramiko...")
    import subprocess
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
    host = os.environ.get("SANDBOX_SERVER_HOST", "23.239.108.30")
    user = os.environ.get("SANDBOX_SERVER_USER", "root")
    password = os.environ.get("SANDBOX_SERVER_PASSWORD", "")
    if not password:
        print("Set SANDBOX_SERVER_PASSWORD environment variable")
        sys.exit(1)

    workspace = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    setup_script = os.path.join(workspace, "scripts", "sandbox-server-setup.sh")

    # Read and run the setup script remotely
    with open(setup_script) as f:
        script_content = f.read()

    # Run via bash -s so we can pipe the script
    print(">>> Uploading and running sandbox server setup...")
    code, out, err = run_ssh(
        host, user, password,
        f"bash -s << 'SCRIPT_END'\n{script_content}\nSCRIPT_END",
        timeout=300,
    )
    if out:
        print(out)
    if err:
        print(err, file=sys.stderr)
    if code != 0:
        print(f"Failed (exit {code})")
        sys.exit(1)
    print("\n>>> Sandbox server setup complete")


if __name__ == "__main__":
    main()
