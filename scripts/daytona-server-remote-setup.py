#!/usr/bin/env python3
"""Set up Daytona Server on sandbox server via SSH."""
import os
import sys

try:
    import paramiko
except ImportError:
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
    sandbox_host = os.environ.get("SANDBOX_SERVER_HOST", "23.239.108.30")
    sandbox_password = os.environ.get("SANDBOX_SERVER_PASSWORD", "")
    if not sandbox_password:
        print("Set SANDBOX_SERVER_PASSWORD")
        sys.exit(1)

    workspace = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    setup_script = os.path.join(workspace, "scripts", "daytona-server-setup.sh")

    with open(setup_script) as f:
        script_content = f.read()

    print(">>> Running Daytona Server setup on sandbox server...")
    code, out, err = run_ssh(
        sandbox_host, "root", sandbox_password,
        f"export SANDBOX_SERVER_IP={sandbox_host}; bash -s << 'SCRIPT_END'\n{script_content}\nSCRIPT_END",
        timeout=600,
    )
    print(out)
    if err:
        print(err, file=sys.stderr)
    if code != 0:
        print(f"Failed (exit {code})")
        sys.exit(1)

    print("\n>>> Daytona Server setup complete.")
    print(">>> Next: Create API key at http://" + sandbox_host + ":3000, add DAYTONA_API_KEY to Dragon env.")


if __name__ == "__main__":
    main()
