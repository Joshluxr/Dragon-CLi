# GitHub App Setup for Dragon VPS

Configure GitHub OAuth and webhooks for your Dragon deployment at `http://65.75.200.136:3000`.

## Step 1: Create the GitHub App

1. Go to **https://github.com/settings/apps**
2. Click **"New GitHub App"**

## Step 2: Basic Information

| Field               | Value                                                |
| ------------------- | ---------------------------------------------------- |
| **GitHub App name** | `Dragon` (or your preference)                        |
| **Homepage URL**    | `http://65.75.200.136:3000`                          |
| **Callback URL**    | `http://65.75.200.136:3000/api/auth/callback/github` |
| **Webhook URL**     | `http://65.75.200.136:3000/api/webhooks/github`      |
| **Webhook secret**  | Generate with: `openssl rand -hex 32`                |
| **Webhook**         | ✅ Active                                            |

## Step 3: Permissions & Events

### Repository permissions

| Permission        | Access               |
| ----------------- | -------------------- |
| **Contents**      | Read and write       |
| **Pull requests** | Read and write       |
| **Issues**        | Read and write       |
| **Metadata**      | Read-only (required) |

### Account permissions

| Permission          | Access    |
| ------------------- | --------- |
| **Email addresses** | Read-only |

### Subscribe to events

Check these events:

- **Pull requests**
- **Issues**
- **Issue comments**
- **Pull request review comments**
- **Pull request reviews**
- **Check runs**
- **Check suites**

## Step 4: Where can this GitHub App be installed?

Choose one of:

- **Only on this account** – Your user/org only
- **Any account** – Any GitHub account

## Step 5: Create the App

Click **"Create GitHub App"**.

## Step 6: Get Credentials

On the app’s settings page:

1. **App ID** – Copy to `GITHUB_APP_ID`
2. **Client ID** – Copy to `GITHUB_CLIENT_ID`
3. **Client secrets** – Generate, copy to `GITHUB_CLIENT_SECRET`
4. **Private keys** – Generate, download `.pem`
5. **App slug** – Your app’s URL slug (e.g. `dragon` or `dragon-vps`)

## Step 7: Format the Private Key

Copy the contents of the `.pem` file. For `.env` use one of these formats:

**Option A – Single line (recommended):**

```env
GITHUB_APP_PRIVATE_KEY="-----BEGIN RSA PRIVATE KEY-----\nMIIEpAIBAAKCAQEA...\n...\n-----END RSA PRIVATE KEY-----"
```

**Option B – Multi-line (with quotes):**

```env
GITHUB_APP_PRIVATE_KEY="-----BEGIN RSA PRIVATE KEY-----
MIIEpAIBAAKCAQEA...
...
-----END RSA PRIVATE KEY-----"
```

## Step 8: Update VPS Environment

SSH into your VPS and edit the env file:

```bash
ssh root@65.75.200.136
nano /opt/dragon/apps/www/.env.production.local
```

Add or update:

```env
GITHUB_APP_ID=123456
GITHUB_CLIENT_ID=Iv1.xxxxxxxxxxxxxxxx
GITHUB_CLIENT_SECRET=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
GITHUB_WEBHOOK_SECRET=<output-of-openssl-rand-hex-32>
NEXT_PUBLIC_GITHUB_APP_NAME=dragon
GITHUB_APP_PRIVATE_KEY="-----BEGIN RSA PRIVATE KEY-----\n...\n-----END RSA PRIVATE KEY-----"
```

Keep `GITHUB_WEBHOOK_SECRET` identical to the webhook secret in the GitHub App settings.

## Step 9: Install the App

1. In the GitHub App settings, open **"Install App"**
2. Install on your user or organization
3. Choose **All repositories** or specific repos

## Step 10: Restart Dragon

```bash
cd /opt/dragon && pm2 restart dragon-www
```

## Step 11: Test

1. Open **http://65.75.200.136:3000**
2. Click **"Sign In"** or **"Get started for free"**
3. You should be redirected to GitHub to authorize the app
4. After authorizing, you should be redirected back to Dragon

## Webhook Verification

In GitHub App settings → **Advanced** → **Recent Deliveries** you can inspect webhook deliveries.

For local testing without a public URL, GitHub cannot reach `http://65.75.200.136:3000` from the internet in some setups. Ensure:

- Port 3000 is reachable from the internet
- Firewall allows inbound traffic on port 3000

## Troubleshooting

### "Callback URL mismatch"

- Confirm the callback URL in the GitHub App matches exactly:  
  `http://65.75.200.136:3000/api/auth/callback/github`

### "Webhook delivery failed"

- Check that the VPS is reachable on port 3000
- Confirm `GITHUB_WEBHOOK_SECRET` matches the webhook secret in the GitHub App

### "Invalid private key"

- Ensure the key is one continuous string with `\n` for newlines
- Ensure there are no extra spaces or line breaks

### Sign-in works but repos don’t load

- Ensure the app is installed on the repositories you want to use
- Check **Repository permissions** (Contents, Pull requests, Issues)
