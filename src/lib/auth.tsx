import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { Lock, ShieldCheck, UserCheck, KeyRound, LogIn, Store } from "lucide-react";
import { toast } from "sonner";
import { usersRepo, settingsRepo, useData, type User } from "@/data";
import { useI18n } from "./i18n";
import { Button, Input, Field } from "@/components/ui-kit";

interface AuthContextType {
  user: User | null;
  login: (username: string, pass: string) => Promise<boolean>;
  logout: () => void;
  isAdmin: boolean;
  isCashier: boolean;
  switchUser: (u: User) => void;
}

const AuthContext = createContext<AuthContextType | null>(null);

const SESSION_KEY = "pos_active_user_v1";

export function AuthProvider({ children }: { children: ReactNode }) {
  const { t } = useI18n();
  const settings = useData(() => settingsRepo.get(), []);
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  // Form states
  const [username, setUsername] = useState("ilyes");
  const [password, setPassword] = useState("ilyes");
  const [loginError, setLoginError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // Initialize session and default admin account
  useEffect(() => {
    async function initAuth() {
      try {
        await usersRepo.ensureDefaultAdmin();
        const saved = localStorage.getItem(SESSION_KEY);
        if (saved) {
          const parsed = JSON.parse(saved) as User;
          const dbUser = await usersRepo.getByUsername(parsed.username);
          if (dbUser) {
            setUser(dbUser);
          } else {
            localStorage.removeItem(SESSION_KEY);
          }
        }
      } catch (err) {
        console.error("Auth init error:", err);
      } finally {
        setLoading(false);
      }
    }
    void initAuth();
  }, []);

  async function login(uName: string, pass: string): Promise<boolean> {
    setSubmitting(true);
    setLoginError("");
    try {
      const cleanUser = uName.trim().toLowerCase();
      const cleanPass = pass.trim();

      // 1. Instant match for default credentials
      let matched: User | null = null;
      if (cleanUser === "ilyes" && cleanPass === "ilyes") {
        matched = {
          id: 1,
          username: "ilyes",
          password: "ilyes",
          name: "Ilyes (المدير)",
          role: "admin",
          createdAt: 1700000000000,
        };
      } else if (cleanUser === "vendeur" && cleanPass === "1234") {
        matched = {
          id: 2,
          username: "vendeur",
          password: "1234",
          name: "بائع المحل",
          role: "cashier",
          createdAt: 1700000000000,
        };
      }

      // 2. Local Database check
      if (!matched) {
        try {
          matched = await usersRepo.verifyPassword(cleanUser, cleanPass);
        } catch (dbErr) {
          console.warn("DB user check warning:", dbErr);
        }
      }

      // 3. Backend API check (tries /api/auth and /api/auth.js)
      if (!matched && typeof window !== "undefined") {
        const endpoints = ["/api/auth", "/api/auth.js"];
        for (const ep of endpoints) {
          try {
            const res = await fetch(ep, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ username: cleanUser, password: cleanPass }),
            });
            if (res.ok) {
              const data = await res.json();
              if (data.success && data.user) {
                matched = {
                  username: data.user.username,
                  password: cleanPass,
                  name: data.user.name,
                  role: data.user.role,
                  createdAt: Date.now(),
                };
                break;
              }
            }
          } catch {}
        }
      }

      if (matched) {
        setUser(matched);
        try {
          localStorage.setItem(SESSION_KEY, JSON.stringify(matched));
          await usersRepo.save(matched);
        } catch {}
        toast.success(`مرحباً بك ${matched.name}`, { icon: "👋" });
        return true;
      } else {
        setLoginError("اسم المستخدم أو كلمة المرور غير صحيحة");
        return false;
      }
    } catch (err) {
      console.error("Login caught error:", err);
      // Failsafe for ilyes / ilyes and vendeur / 1234
      const cleanUser = uName.trim().toLowerCase();
      const cleanPass = pass.trim();
      if ((cleanUser === "ilyes" && cleanPass === "ilyes") || (cleanUser === "vendeur" && cleanPass === "1234")) {
        const fallbackUser: User = cleanUser === "ilyes"
          ? { id: 1, username: "ilyes", password: "ilyes", name: "Ilyes (المدير)", role: "admin", createdAt: 1700000000000 }
          : { id: 2, username: "vendeur", password: "1234", name: "بائع المحل", role: "cashier", createdAt: 1700000000000 };
        setUser(fallbackUser);
        try {
          localStorage.setItem(SESSION_KEY, JSON.stringify(fallbackUser));
        } catch {}
        toast.success(`مرحباً بك ${fallbackUser.name}`, { icon: "👋" });
        return true;
      }
      setLoginError("حدث خطأ أثناء تسجيل الدخول");
      return false;
    } finally {
      setSubmitting(false);
    }
  }

  function logout() {
    setUser(null);
    localStorage.removeItem(SESSION_KEY);
    toast.info("تم قفل الجلسة");
  }

  function switchUser(newUser: User) {
    setUser(newUser);
    localStorage.setItem(SESSION_KEY, JSON.stringify(newUser));
  }

  const isAdmin = user?.role === "admin";
  const isCashier = user?.role === "cashier";

  const isRemoteScanner =
    typeof window !== "undefined" &&
    (window.location.pathname.includes("remote-scanner") ||
      window.location.hash.includes("remote-scanner"));

  if (loading) {
    return (
      <div className="grid min-h-screen place-items-center bg-background text-muted-foreground">
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
          <span className="text-sm">جارٍ التحقق من الأمان والحسابات...</span>
        </div>
      </div>
    );
  }

  // If not logged in and not on the remote scanner screen, display Login Screen
  if (!user && !isRemoteScanner) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/95 p-4 backdrop-blur-md">
        <div className="w-full max-w-md overflow-hidden rounded-2xl border border-border bg-card p-6 sm:p-8 shadow-2xl">
          {/* Header */}
          <div className="mb-6 text-center">
            <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary shadow-soft">
              <Store className="h-7 w-7" />
            </div>
            <h1 className="font-display text-2xl font-bold text-foreground">
              {settings?.shopName || "متجر الهواتف"}
            </h1>
            <p className="mt-1 text-xs text-muted-foreground">
              يرجى تسجيل الدخول لمتابعة العمل في نقطة البيع
            </p>
          </div>

          {/* Quick User Picker Shortcuts */}
          <div className="mb-5 flex gap-2">
            <button
              type="button"
              onClick={() => {
                setUsername("ilyes");
                setPassword("ilyes");
              }}
              className={`flex flex-1 items-center justify-center gap-2 rounded-xl border p-2.5 text-xs font-semibold transition ${
                username === "ilyes"
                  ? "border-primary bg-primary/10 text-primary shadow-xs"
                  : "border-border bg-muted/30 text-muted-foreground hover:bg-muted"
              }`}
            >
              <ShieldCheck className="h-4 w-4" />
              <span>👑 Ilyes (المدير)</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setUsername("vendeur");
                setPassword("1234");
              }}
              className={`flex flex-1 items-center justify-center gap-2 rounded-xl border p-2.5 text-xs font-semibold transition ${
                username === "vendeur"
                  ? "border-primary bg-primary/10 text-primary shadow-xs"
                  : "border-border bg-muted/30 text-muted-foreground hover:bg-muted"
              }`}
            >
              <UserCheck className="h-4 w-4" />
              <span>👤 بائع المحل</span>
            </button>
          </div>

          {/* Login Form */}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void login(username, password);
            }}
            className="space-y-4"
          >
            <Field label="اسم المستخدم">
              <Input
                autoFocus
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="ilyes"
                className="h-12 text-base font-semibold"
              />
            </Field>

            <Field label="كلمة المرور">
              <Input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••"
                className="h-12 text-base"
              />
            </Field>

            {loginError && (
              <div className="rounded-xl border border-destructive/40 bg-destructive/10 p-3 text-center text-xs font-semibold text-destructive">
                {loginError}
              </div>
            )}

            <Button
              type="submit"
              variant="primary"
              size="lg"
              disabled={submitting}
              className="w-full h-12 text-base font-bold shadow-md gap-2"
            >
              <LogIn className="h-5 w-5" />
              <span>{submitting ? "جارٍ التحقق..." : "تسجيل الدخول"}</span>
            </Button>
          </form>

          {/* Footer Hint */}
          <div className="mt-6 border-t border-border pt-4 text-center text-[11px] text-muted-foreground">
            الحساب الافتراضي للمدير: <span className="font-mono font-bold text-foreground">ilyes</span> / كلمة السر: <span className="font-mono font-bold text-foreground">ilyes</span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <AuthContext.Provider
      value={{
        user,
        login,
        logout,
        isAdmin,
        isCashier,
        switchUser,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
