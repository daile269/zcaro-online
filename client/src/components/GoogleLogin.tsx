import { useEffect, useRef } from "react";
import socket from "../socket";

export interface AuthUser {
  _id?: string;
  name?: string;
  email?: string;
  avatar?: string;
}

interface GoogleLoginProps {
  onSignIn: (user: AuthUser) => void;
}

declare global {
  interface Window {
    google?: {
      accounts?: {
        id?: {
          initialize: (opts: {
            client_id: string;
            callback: (resp: CredentialResponse) => void;
          }) => void;
          renderButton: (
            el: HTMLElement,
            opts: Record<string, unknown>
          ) => void;
          disableAutoSelect?: () => void;
        };
      };
    };
  }
}

interface CredentialResponse {
  credential?: string;
  select_by?: string;
}

export default function GoogleLogin({ onSignIn }: GoogleLoginProps) {
  const btnRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID as
      | string
      | undefined;
    if (!clientId) {
      console.warn("VITE_GOOGLE_CLIENT_ID is not set");
      return;
    }

    const existing = document.getElementById("gsi-client");
    if (!existing) {
      const s = document.createElement("script");
      s.src = "https://accounts.google.com/gsi/client";
      s.id = "gsi-client";
      s.async = true;
      s.defer = true;
      document.body.appendChild(s);
      s.onload = () => initGSI(clientId);
    } else {
      initGSI(clientId);
    }

    function initGSI(clientId: string) {
      if (!window.google?.accounts?.id) return;
      window.google.accounts.id.initialize({
        client_id: clientId,
        callback: handleCredentialResponse,
      });

      if (btnRef.current) {
        window.google.accounts.id.renderButton(btnRef.current, {
          theme: "outline",
          size: "large",
        });
      }
    }

    async function handleCredentialResponse(response: CredentialResponse) {
      const idToken = response?.credential;
      if (!idToken) return;

      try {
        const res = await fetch(
          `${import.meta.env.VITE_API_BASE || ""}/auth/google`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ idToken }),
          }
        );
        const data = await res.json();
        if (res.ok && data.user) {
          const user = data.user as AuthUser;
          localStorage.setItem("zcaro_user", JSON.stringify(user));
          socket.emit("identify", { userId: user._id });
          onSignIn(user);
        } else {
          console.error("Google sign-in failed", data);
        }
      } catch (err) {
        console.error("Sign-in error", err);
      }
    }
  }, [onSignIn]);

  return <div ref={btnRef}></div>;
}
