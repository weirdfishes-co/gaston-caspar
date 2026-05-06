import NextAuth from "next-auth";
import MicrosoftEntraID from "next-auth/providers/microsoft-entra-id";

export const authEnabled = process.env.AUTH_ENABLED === "true";

const tenantId = process.env.AZURE_AD_TENANT_ID ?? "common";

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [
    MicrosoftEntraID({
      clientId: process.env.AZURE_AD_CLIENT_ID ?? "",
      clientSecret: process.env.AZURE_AD_CLIENT_SECRET ?? "",
      issuer: `https://login.microsoftonline.com/${tenantId}/v2.0`,
    }),
  ],
  session: { strategy: "jwt", maxAge: 30 * 24 * 60 * 60 }, // 30 days
  pages: { signIn: "/signin" },
  callbacks: {
    async signIn({ profile }) {
      if (!authEnabled) return true;

      // Only allow accounts from the configured Nyenrode tenant.
      // The `tid` claim on the Entra ID profile must match.
      if (tenantId === "common") return true;
      const profileTid = (profile as { tid?: string } | null)?.tid;
      return profileTid === tenantId;
    },
    async session({ session, token }) {
      if (session.user && token.sub) {
        session.user.id = token.sub;
      }
      return session;
    },
  },
});

declare module "next-auth" {
  interface Session {
    user: {
      id?: string;
      name?: string | null;
      email?: string | null;
      image?: string | null;
    };
  }
}
