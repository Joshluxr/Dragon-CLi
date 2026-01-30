export function getGHAppInstallUrl() {
  return `https://github.com/apps/${process.env.NEXT_PUBLIC_GITHUB_APP_NAME}/installations/select_target`;
}
