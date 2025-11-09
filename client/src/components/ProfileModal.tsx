import { useState, useEffect } from "react";
import type { AuthUser } from "./GoogleLogin";

interface Props {
  user?: AuthUser | null;
  onClose: () => void;
  onSignOut?: () => void;
  onLanguageChange?: (lang: string) => void;
}

export default function ProfileModal(props: Props) {
  const { user, onClose, onSignOut } = props;
  const [liteMode, setLiteMode] = useState(false);
  // const [showIndex, setShowIndex] = useState(false);
  const [zoomMode, setZoomMode] = useState(false);
  const [showLangMenu, setShowLangMenu] = useState(false);
  const gw = globalThis as unknown as { window?: Window };
  const [language, setLanguage] = useState<string>(() => {
    try {
      if (gw.window === undefined) return "en";
      return localStorage.getItem("zcaro-lang") || "en";
    } catch (err) {
      console.debug("read language from storage failed", err);
      return "en";
    }
  });

  function chooseLanguage(lang: string) {
    setLanguage(lang);
    try {
      if (gw.window !== undefined) localStorage.setItem("zcaro-lang", lang);
    } catch (err) {
      console.debug("save language to storage failed", err);
    }
    props.onLanguageChange?.(lang);
    try {
      // notify other parts of the app in the same window
      const gw2 = globalThis as unknown as { window?: Window };
      if (
        gw2.window !== undefined &&
        typeof gw2.window.dispatchEvent === "function"
      ) {
        gw2.window.dispatchEvent(
          new CustomEvent("zcaro-language-changed", { detail: lang })
        );
      }
    } catch (err) {
      console.debug("dispatch language event failed", err);
    }
    setShowLangMenu(false);
  }

  // initialize zoomMode from localStorage
  useEffect(() => {
    try {
      const v = gw.window ? localStorage.getItem("zcaro-zoom") : null;
      if (v === "1") setZoomMode(true);
    } catch {
      /* ignore */
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // initialize liteMode from localStorage
  useEffect(() => {
    try {
      const v = gw.window ? localStorage.getItem("zcaro-lite") : null;
      if (v === "1") setLiteMode(true);
    } catch {
      /* ignore */
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // persist zoomMode and notify same-tab listeners when changed
  useEffect(() => {
    try {
      if (gw.window !== undefined) {
        localStorage.setItem("zcaro-zoom", zoomMode ? "1" : "0");
        (gw.window as Window).dispatchEvent(
          new CustomEvent("zcaro-zoom-changed", { detail: zoomMode })
        );
      }
    } catch (err) {
      console.debug("persist zoomMode failed", err);
    }
  }, [zoomMode, gw.window]);

  // persist liteMode and notify same-tab listeners when changed
  useEffect(() => {
    try {
      if (gw.window !== undefined) {
        localStorage.setItem("zcaro-lite", liteMode ? "1" : "0");
        (gw.window as Window).dispatchEvent(
          new CustomEvent("zcaro-lite-changed", { detail: liteMode })
        );
      }
    } catch (err) {
      console.debug("persist liteMode failed", err);
    }
  }, [liteMode, gw.window]);

  const translations: Record<string, Record<string, string>> = {
    en: {
      profile: "PROFILE",
      liteMode: "Lite Mode",
      showIndex: "Show index",
      zoomMode: "Zoom mode",
      name: "Name",
      language: "Language",
      logout: "Logout",
      close: "Close profile",
    },
    vi: {
      profile: "HỒ SƠ",
      liteMode: "Chế độ nhẹ",
      showIndex: "Hiển thị chỉ mục",
      zoomMode: "Chế độ phóng to",
      name: "Tên",
      language: "Ngôn ngữ",
      logout: "Đăng xuất",
      close: "Đóng",
    },
  };

  if (!user) return null;
  const t = translations[language] || translations.en;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <button
        type="button"
        onClick={onClose}
        aria-label={t.close}
        className="absolute inset-0 bg-black/40 focus:outline-none"
      />

      <div className="relative bg-white w-[520px] max-w-[95%] rounded-lg shadow-lg overflow-hidden">
        <div className="flex items-center justify-between px-6 py-3 border-b">
          <div className="text-center w-full font-semibold">{t.profile}</div>
          <button
            onClick={onClose}
            className="absolute right-3 top-3 text-gray-500 hover:text-gray-700"
            aria-label={t.close}
          >
            ✕
          </button>
        </div>

        <div className="px-8 py-6">
          <div className="flex flex-col items-center">
            {user.avatar ? (
              <img
                src={user.avatar}
                alt={user.name}
                className="w-28 h-28 rounded-full"
              />
            ) : (
              <div className="w-28 h-28 bg-teal-500 rounded-full flex items-center justify-center text-white font-bold text-2xl">
                {user.name ? user.name.charAt(0).toUpperCase() : "U"}
              </div>
            )}

            <div className="mt-6 w-full">
              <div className="flex items-center justify-between py-3 border-b">
                <div className="text-gray-800 font-medium">{t.liteMode}</div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    className="sr-only"
                    aria-label="Lite Mode toggle"
                    checked={liteMode}
                    onChange={() => setLiteMode(!liteMode)}
                  />
                  <div
                    className={`w-11 h-6 bg-gray-200 rounded-full transition-colors ${
                      liteMode ? "bg-teal-500" : ""
                    }`}
                  />
                  <span
                    aria-hidden
                    className={`absolute left-0.5 top-0.5 w-5 h-5 bg-white rounded-full shadow transform transition-transform ${
                      liteMode ? "translate-x-5" : "translate-x-0"
                    }`}
                  />
                </label>
              </div>

              {/* <div className="flex items-center justify-between py-3 border-b">
                <div className="text-gray-800 font-medium">{t.showIndex}</div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    className="sr-only"
                    aria-label="Show index toggle"
                    checked={showIndex}
                    onChange={() => setShowIndex(!showIndex)}
                  />
                  <div
                    className={`w-11 h-6 bg-gray-200 rounded-full transition-colors ${
                      showIndex ? "bg-teal-500" : ""
                    }`}
                  />
                  <span
                    aria-hidden
                    className={`absolute left-0.5 top-0.5 w-5 h-5 bg-white rounded-full shadow transform transition-transform ${
                      showIndex ? "translate-x-5" : "translate-x-0"
                    }`}
                  />
                </label>
              </div> */}

              <div className="flex items-center justify-between py-3 border-b">
                <div className="text-gray-800 font-medium">{t.zoomMode}</div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    className="sr-only"
                    aria-label="Zoom mode toggle"
                    checked={zoomMode}
                    onChange={() => setZoomMode(!zoomMode)}
                  />
                  <div
                    className={`w-11 h-6 bg-gray-200 rounded-full transition-colors ${
                      zoomMode ? "bg-teal-500" : ""
                    }`}
                  />
                  <span
                    aria-hidden
                    className={`absolute left-0.5 top-0.5 w-5 h-5 bg-white rounded-full shadow transform transition-transform ${
                      zoomMode ? "translate-x-5" : "translate-x-0"
                    }`}
                  />
                </label>
              </div>

              <div className="pt-4 text-gray-700 relative">
                <div className="mb-2">
                  {t.name}:
                  <span className="font-medium ml-2">
                    {user.name} -
                    {typeof (user as AuthUser & { elo?: number }).elo !==
                      "undefined" && (
                      <span className="text-gray-500 ml-2">
                        {(user as AuthUser & { elo?: number }).elo}
                      </span>
                    )}
                  </span>
                </div>

                <div className="mb-2">
                  {t.language}:
                  <span className="ml-2 inline-block">
                    <button
                      onClick={() => setShowLangMenu((s) => !s)}
                      className="text-blue-600 underline"
                      aria-haspopup="menu"
                      aria-expanded={showLangMenu}
                      type="button"
                    >
                      {language === "vi" ? "Tiếng Việt" : "English"}
                    </button>

                    {showLangMenu && (
                      <div className="mt-2 absolute left-0 bg-white border rounded shadow-md z-50">
                        <button
                          onClick={() => chooseLanguage("en")}
                          type="button"
                          className={`block px-4 py-2 text-left w-full ${
                            language === "en" ? "bg-gray-100" : ""
                          }`}
                        >
                          English
                        </button>
                        <button
                          onClick={() => chooseLanguage("vi")}
                          type="button"
                          className={`block px-4 py-2 text-left w-full ${
                            language === "vi" ? "bg-gray-100" : ""
                          }`}
                        >
                          Tiếng Việt
                        </button>
                      </div>
                    )}
                  </span>
                </div>
              </div>
            </div>

            <div className="w-full border-t mt-6 pt-4">
              <button
                onClick={() => {
                  onSignOut?.();
                  onClose();
                }}
                className="text-blue-600 underline"
              >
                {t.logout}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
