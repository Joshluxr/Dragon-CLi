import { cookies } from "next/headers";
import { UserCookies, getDefaultUserCookies } from "./cookies";

function getCookieValueOrNull(
  cookieStore: Awaited<ReturnType<typeof cookies>>,
  key: string,
) {
  const value = cookieStore.get(key)?.value;
  if (!value) {
    return null;
  }
  try {
    return JSON.parse(value);
  } catch (e) {
    return null;
  }
}

export async function getUserCookies(): Promise<UserCookies> {
  const cookieStore = await cookies();
  const userCookies = getDefaultUserCookies();
  for (const key of Object.keys(userCookies) as (keyof UserCookies)[]) {
    const value = getCookieValueOrNull(cookieStore, key);
    if (value !== null) {
      userCookies[key] = value;
    }
  }
  return userCookies;
}
