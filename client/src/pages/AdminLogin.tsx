import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { trpc } from "@/lib/trpc";
import { Loader2, ShieldCheck, Lock } from "lucide-react";
import { useState, useEffect } from "react";
import { toast } from "sonner";

export default function AdminLogin() {
  const { user, loading } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  // Use window.location for all redirects — avoids React error #300 race condition
  // that occurs when navigate() and window.location.href fire simultaneously
  useEffect(() => {
    if (!loading && user) {
      const staffRoles = ["admin", "worker", "super_admin", "viewer", "assessor"];
      if (staffRoles.includes(user.role)) {
        // Org staff (any role with an orgId set) go to the org portal
        const orgId = (user as any).orgId;
        let dest: string;
        if (orgId) {
          dest = "/org";
        } else if (user.role === "assessor") {
          dest = "/assessor";
        } else {
          dest = "/admin/dashboard";
        }
        window.location.replace(dest);
      }
    }
  }, [user, loading]);

  const loginMutation = trpc.auth.adminLogin.useMutation({
    onSuccess: (data) => {
      // For assessors: reload THIS page so auth.me resolves with the full user
      // object (including orgId). The useEffect above will then redirect to
      // /org (if orgId is set) or /assessor (if plain assessor). This avoids
      // the race where we redirect to /assessor before knowing the orgId.
      if (data.role === "assessor") {
        window.location.reload();
      } else {
        window.location.href = "/admin/dashboard";
      }
    },
    onError: (err) => {
      toast.error(err.message || "Login failed");
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) return;
    loginMutation.mutate({ email, password });
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  // Always show the email/password form — admin auth is fully separate from Manus OAuth
  // A Manus OAuth session with role 'user' should still see the login form, not Access Denied

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#f0f7f0] via-background to-[#fdf6f0] flex items-center justify-center p-4 sm:p-6">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-2 mb-4">
            <div className="w-10 h-10 rounded-xl bg-primary flex items-center justify-center">
              <ShieldCheck className="w-5 h-5 text-primary-foreground" />
            </div>
            <span className="text-xl font-bold text-foreground">
              FreshSelect Meals
            </span>
          </div>
          <h1 className="text-2xl font-bold text-foreground">Admin Portal</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Sign in to manage applications and track submissions
          </p>
        </div>

        <Card className="border-border/50 shadow-lg">
          <CardContent className="p-5 sm:p-8">
            <form onSubmit={handleSubmit} className="space-y-5">
                <div className="text-center mb-2">
                  <div className="w-14 h-14 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-3">
                    <Lock className="w-7 h-7 text-primary" />
                  </div>
                  <p className="text-sm text-muted-foreground">
                    Enter your administrator credentials to continue.
                  </p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="email">Email</Label>
                  <Input
                    id="email"
                    type="email"
                    autoComplete="email"
                    placeholder="admin@freshselectmeals.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="password">Password</Label>
                  <Input
                    id="password"
                    type="password"
                    autoComplete="current-password"
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                  />
                </div>

                <Button
                  type="submit"
                  className="w-full bg-primary hover:bg-primary/90 text-primary-foreground font-semibold h-11"
                  disabled={loginMutation.isPending || !email || !password}
                >
                  {loginMutation.isPending ? (
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  ) : (
                    <ShieldCheck className="w-4 h-4 mr-2" />
                  )}
                  {loginMutation.isPending ? "Signing in…" : "Sign In"}
                </Button>

                <div className="text-center">
                  <a href="/admin/forgot-password" className="text-xs text-primary hover:underline">
                    Forgot your password?
                  </a>
                </div>

                <div className="flex items-center gap-2 text-xs text-muted-foreground justify-center pt-1">
                  <ShieldCheck className="w-3.5 h-3.5" />
                  Secured with bcrypt authentication
                </div>
              </form>
          </CardContent>
        </Card>

        <p className="text-center text-xs text-muted-foreground mt-6">
          <a href="/" className="hover:text-primary transition-colors">
            ← Back to FreshSelect Meals
          </a>
        </p>
      </div>
    </div>
  );
}
