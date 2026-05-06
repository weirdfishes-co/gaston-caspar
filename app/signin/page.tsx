import { signIn } from "@/auth";

export const metadata = { title: "Sign in — Gaston Caspar" };

export default function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ callbackUrl?: string; error?: string }>;
}) {
  return (
    <div className="signin-page">
      <div className="signin-card">
        <img
          src="/gaston-caspar.png"
          alt="Gaston Caspar"
          className="signin-portrait"
        />
        <h1>Gaston Caspar</h1>
        <p className="signin-subtitle">Nyenrode&apos;s Academic Assistant</p>
        <p>Sign in with your Nyenrode Microsoft account to continue.</p>

        <SignInForm searchParams={searchParams} />

        <div className="signin-footer">Nyenrode. A Reward For Life</div>
      </div>
    </div>
  );
}

async function SignInForm({
  searchParams,
}: {
  searchParams: Promise<{ callbackUrl?: string; error?: string }>;
}) {
  const params = await searchParams;
  const callbackUrl = params.callbackUrl ?? "/";
  const error = params.error;

  return (
    <form
      action={async () => {
        "use server";
        await signIn("microsoft-entra-id", { redirectTo: callbackUrl });
      }}
    >
      {error && (
        <div className="signin-error">
          {error === "AccessDenied"
            ? "This account is not part of the Nyenrode tenant."
            : "Sign-in failed. Please try again."}
        </div>
      )}
      <button type="submit" className="signin-btn">
        <MicrosoftLogo />
        <span>Sign in with Microsoft</span>
      </button>
    </form>
  );
}

function MicrosoftLogo() {
  return (
    <svg width="18" height="18" viewBox="0 0 21 21" aria-hidden="true">
      <rect x="1" y="1" width="9" height="9" fill="#f25022" />
      <rect x="11" y="1" width="9" height="9" fill="#7fba00" />
      <rect x="1" y="11" width="9" height="9" fill="#00a4ef" />
      <rect x="11" y="11" width="9" height="9" fill="#ffb900" />
    </svg>
  );
}
