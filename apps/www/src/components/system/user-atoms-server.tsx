import { UserAtomsHydrator as UserAtomsHydratorClient } from "./user-atoms-client";
import { getUserInfoOrNull } from "@/lib/auth-server";

export async function UserAtomsHydratorServer({
  children,
}: {
  children: React.ReactNode;
}) {
  const userInfo = await getUserInfoOrNull();
  if (!userInfo) {
    return children;
  }
  return (
    <UserAtomsHydratorClient
      user={userInfo.user}
      userSettings={userInfo.userSettings}
      userFlags={userInfo.userFlags}
      userCredentials={userInfo.userCredentials}
      userFeatureFlags={userInfo.userFeatureFlags}
      userCookies={userInfo.userCookies}
      bearerToken={userInfo.session.token}
      impersonation={{
        isImpersonating: userInfo.impersonation.isImpersonating,
        impersonatedBy: userInfo.impersonation.impersonatedBy,
        impersonatedUser: userInfo.user,
      }}
    >
      {children}
    </UserAtomsHydratorClient>
  );
}
