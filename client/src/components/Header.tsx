import { useState } from "react";
import GoogleLogin, { type AuthUser } from "./GoogleLogin";
import ProfileModal from "./ProfileModal";

interface HeaderProps {
  user?: AuthUser | null;
  onSignIn?: (u: AuthUser) => void;
  onSignOut?: () => void;
  onHome?: () => void;
}

export default function Header(props: Readonly<HeaderProps>) {
  const { user, onSignIn, onSignOut, onHome } = props;
  const [showProfile, setShowProfile] = useState(false);
  return (
    <div className="flex justify-between items-center p-4 border-b border-gray-200">
      <button
        className="text-2xl"
        onClick={() => {
          try {
            onHome?.();
          } catch {
            /* ignore */
          }
        }}
      >
        <img src="./home.png" alt="Home" width={60} height={60} />
      </button>
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
                  className="w-12 h-12 rounded-full"
                />
              ) : (
                <div className="w-12 h-12 bg-teal-500 rounded-full flex items-center justify-center text-white font-bold text-lg">
                  {user.name ? user.name.charAt(0).toUpperCase() : "U"}
                </div>
              )}
            </button>
            <div className="text-gray-700 font-semibold">{user.name}</div>
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
    </div>
  );
}
