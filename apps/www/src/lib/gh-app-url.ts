export function getGHAppInstallUrl() {
  return `https://github.com/apps/${process.env.NEXT_PUBLIC_GITHUB_APP_NAME}/installations/select_target`;
}

/** URL to manage all GitHub App installations (add/remove repos) */
export function getGHAppInstallationsUrl() {
  return "https://github.com/settings/installations";
}
