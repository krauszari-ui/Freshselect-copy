import { useState, useEffect } from "react";
import { useLocation, Link } from "wouter";
import { Loader2, Lock, ShieldCheck, CheckCircle2, AlertCircle, Eye, EyeOff } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { trpc } from "@/lib/trpc";

export default function ResetPassword() {
  const [, setLocation] = useLocation();
  const [token, setToken] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [success, setSuccess] = useState(false);

  // Extract token from URL query string
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const t = params.get("token");
    if (t) setToken(t);
  }, []);

  const validateQuery = trpc.passwordReset.validateToken.useQuery(
    { token },
    { enabled: token.length > 0, retry: false }
  );

  const resetMutation = trpc.passwordReset.resetPassword.useMutation({
    onSuccess: () => {
      setSuccess(true);
      setTimeout(() => setLocation("/admin/login"), 3000);
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (password !== confirm) return;
    resetMutation.mutate({ token, newPassword: password });
  };

  const passwordsMatch = password === confirm;
  const passwordStrong = password.length >= 8;

  if (!token) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-[#f0f7f0] via-background to-[#fdf6f0] flex items-center justify-center p-4">
        <Card className="w-full max-w-md border-border/50 shadow-lg">
          <CardContent className="p-8 text-center space-y-4">
            <AlertCircle className="w-12 h-12 text-destructive mx-auto" />
            <h2 className="font-semibold text-lg">Invalid Reset Link</h2>
            <p className="text-sm text-muted-foreground">This password reset link is missing a token. Please request a new one.</p>
            <Link href="/admin/forgot-password">
              <Button className="w-full">Request New Link</Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#f0f7f0] via-background to-[#fdf6f0] flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-2 mb-4">
            <div className="w-10 h-10 rounded-xl bg-primary flex items-center justify-center">
              <ShieldCheck className="w-5 h-5 text-primary-foreground" />
            </div>
            <span className="text-xl font-bold text-foreground">FreshSelect Meals</span>
          </div>
          <h1 className="text-2xl font-bold text-foreground">Set New Password</h1>
          <p className="text-muted-foreground mt-1 text-sm">Choose a strong password for your account</p>
        </div>

        <Card className="border-border/50 shadow-lg">
          <CardContent className="p-8">
            {success ? (
              <div className="text-center space-y-4">
                <div className="w-14 h-14 rounded-full bg-green-100 flex items-center justify-center mx-auto">
                  <CheckCircle2 className="w-7 h-7 text-green-600" />
                </div>
                <h2 className="font-semibold text-lg">Password Updated!</h2>
                <p className="text-sm text-muted-foreground">Your password has been changed. Redirecting you to sign in…</p>
                <Link href="/admin/login">
                  <Button className="w-full">Sign In Now</Button>
                </Link>
              </div>
            ) : validateQuery.isLoading ? (
              <div className="text-center py-8">
                <Loader2 className="w-8 h-8 animate-spin text-primary mx-auto" />
                <p className="text-sm text-muted-foreground mt-3">Validating reset link…</p>
              </div>
            ) : !validateQuery.data?.valid ? (
              <div className="text-center space-y-4">
                <AlertCircle className="w-12 h-12 text-destructive mx-auto" />
                <h2 className="font-semibold text-lg">Link Expired or Invalid</h2>
                <p className="text-sm text-muted-foreground">This reset link has expired or already been used. Please request a new one.</p>
                <Link href="/admin/forgot-password">
                  <Button className="w-full">Request New Link</Button>
                </Link>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-5">
                {validateQuery.data.email && (
                  <div className="bg-muted/50 rounded-lg p-3 text-sm text-center text-muted-foreground">
                    Resetting password for <strong>{validateQuery.data.email}</strong>
                  </div>
                )}

                <div className="space-y-2">
                  <Label htmlFor="password">New Password</Label>
                  <div className="relative">
                    <Input
                      id="password"
                      type={showPassword ? "text" : "password"}
                      placeholder="At least 8 characters"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      required
                      minLength={8}
                    />
                    <button
                      type="button"
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                      onClick={() => setShowPassword(!showPassword)}
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                  {password && !passwordStrong && (
                    <p className="text-xs text-destructive">Password must be at least 8 characters</p>
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="confirm">Confirm New Password</Label>
                  <Input
                    id="confirm"
                    type={showPassword ? "text" : "password"}
                    placeholder="Repeat your new password"
                    value={confirm}
                    onChange={(e) => setConfirm(e.target.value)}
                    required
                  />
                  {confirm && !passwordsMatch && (
                    <p className="text-xs text-destructive">Passwords do not match</p>
                  )}
                </div>

                {resetMutation.error && (
                  <p className="text-sm text-destructive text-center">{resetMutation.error.message}</p>
                )}

                <Button
                  type="submit"
                  className="w-full bg-primary hover:bg-primary/90 text-primary-foreground font-semibold h-11"
                  disabled={resetMutation.isPending || !passwordStrong || !passwordsMatch || !password || !confirm}
                >
                  {resetMutation.isPending ? (
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  ) : (
                    <Lock className="w-4 h-4 mr-2" />
                  )}
                  {resetMutation.isPending ? "Updating…" : "Set New Password"}
                </Button>
              </form>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
