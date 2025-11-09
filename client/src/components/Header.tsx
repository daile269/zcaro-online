import { useState } from "react";
import GoogleLogin, { type AuthUser } from "./GoogleLogin";
import ProfileModal from "./ProfileModal";

interface HeaderProps {
  user?: AuthUser | null;
  onSignIn?: (u: AuthUser) => void;
  onSignOut?: () => void;
  onHome?: () => void;
  onLeaveRoom?: () => void;
}

export default function Header(props: Readonly<HeaderProps>) {
  const { user, onSignIn, onSignOut, onHome, onLeaveRoom } = props;
  const [showProfile, setShowProfile] = useState(false);
  const [showDonate, setShowDonate] = useState(false);
  const [donateCopied, setDonateCopied] = useState(false);
  return (
    <div className="flex justify-center">
      <div className="w-full max-w-[737.59px] mx-auto px-4 flex justify-between items-center p-4 border-b border-gray-200">
        <button
          className="text-2xl"
          onClick={() => {
            try {
              // If provided, perform leave-room logic (emit to server) before navigating home
              try {
                onLeaveRoom?.();
              } catch {
                /* ignore */
              }
              onHome?.();
            } catch {
              /* ignore */
            }
          }}
        >
          <img src="./home.png" alt="Home" width={30} height={30} />
        </button>
        {/* Donate button centered in header */}
        <div className="flex-1 flex justify-center">
          <button
            onClick={() => setShowDonate(true)}
            className="bg-yellow-400 hover:bg-yellow-450 text-black px-8 py-2 rounded-lg font-semibold shadow-sm"
            aria-label="Donate"
          >
            Donate
          </button>
        </div>
        <div className="flex items-center gap-3">
          {user ? (
            <div className="flex items-center gap-3">
              <button
                onClick={() => setShowProfile(true)}
                className="flex items-center gap-3 focus:outline-none"
                aria-label="Open profile"
              >
                {user.avatar ? (
                  <img
                    src={user.avatar}
                    alt={user.name}
                    className="w-9 h-9 rounded-full"
                  />
                ) : (
                  <div className="w-12 h-12 bg-teal-500 rounded-full flex items-center justify-center text-white font-bold text-lg">
                    {user.name ? user.name.charAt(0).toUpperCase() : "U"}
                  </div>
                )}
              </button>
            </div>
          ) : (
            <div>
              <GoogleLogin onSignIn={(u) => onSignIn?.(u)} />
            </div>
          )}
        </div>

        {/* profile modal controlled locally */}
        {user && showProfile && (
          <ProfileModal
            user={user}
            onClose={() => setShowProfile(false)}
            onSignOut={onSignOut}
          />
        )}

        {/* Donate modal */}
        {showDonate && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center"
            aria-modal="true"
            role="dialog"
            onClick={() => setShowDonate(false)}
          >
            <div className="absolute inset-0 bg-black/50" />
            <div
              className="relative bg-white rounded-lg p-6 max-w-sm w-full mx-4 shadow-2xl z-10 text-center"
              onClick={(e) => e.stopPropagation()}
            >
              <button
                onClick={() => setShowDonate(false)}
                className="absolute -top-3 -right-3 bg-white rounded-full w-7 h-7 flex items-center justify-center shadow"
                aria-label="Close donate modal"
              >
                ×
              </button>

              {/* QR image - replace src with your actual asset path */}
              <div className="mb-4">
                <img
                  src="./momo-qr.png"
                  alt="Donate QR"
                  className="mx-auto w-40 h-40 object-cover"
                />
              </div>

              <div className="mb-2">
                <a
                  href="https://me.momo.vn/nguyencongquyen"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-600 hover:underline text-sm"
                >
                  https://me.momo.vn/nguyencongquyen
                </a>
              </div>

              <div className="mb-1 text-sm">
                <span className="font-semibold">STK:</span> 0933905525
                <button
                  onClick={async () => {
                    try {
                      await navigator.clipboard.writeText("0933905525");
                      setDonateCopied(true);
                      setTimeout(() => setDonateCopied(false), 2000);
                    } catch {
                      try {
                        // fallback
                        const ta = document.createElement("textarea");
                        ta.value = "0933905525";
                        document.body.appendChild(ta);
                        ta.select();
                        document.execCommand("copy");
                        document.body.removeChild(ta);
                        setDonateCopied(true);
                        setTimeout(() => setDonateCopied(false), 2000);
                      } catch {
                        /* ignore */
                      }
                    }
                  }}
                  className="ml-2 inline-block text-xs px-2 py-1 bg-gray-100 rounded"
                >
                  {donateCopied ? "Copied" : "Copy"}
                </button>
              </div>

              <div className="text-sm font-medium">
                Ngân hàng: VP Bank - Nguyễn Công Quyền
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
