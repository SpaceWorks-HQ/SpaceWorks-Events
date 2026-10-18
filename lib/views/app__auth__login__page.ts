import { connection } from "next/server";
import { getGoogleSsoSettings, isNewUserRegistrationEnabled } from "@/lib/instanceSettings";

export async function loadLoginView() {
  await connection();
  const [accountCreationEnabled, googleSsoConfigured] = await Promise.all([
    isNewUserRegistrationEnabled(),
    getGoogleSsoSettings().then(Boolean),
  ]);
  return { googleSsoConfigured, accountCreationEnabled };
}
