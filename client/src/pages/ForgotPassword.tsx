import { useState } from "react";
import { Link } from "wouter";
import { Loader2, Mail, ShieldCheck, ArrowLeft, CheckCircle2 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { trpc } from "@/lib/trpc";

export default function ForgotPassword() {
  const [email, setEmail] = useState("");
  const [submitted, setSubmitted] = useState(false);

  const forgotMutation = trpc.passwordReset.forgotPassword.useMutation({
    onSuccess: () => setSubmitted(true),
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) return;
    forgotMutation.mutate({ email, origin: window.location.origin });
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#f0f7f0] via-background to-[#fdf6f0] flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-2 mb-4">
            <div className="w-10 h-10 rounded-xl bg-primary flex items-center justify-center">
              <ShieldCheck className="w-5 h-5 text-primary-foreground" />
            </div>
            <span className="text-xl font-bold text-foreground">FreshSelect Meals</span>
          </div>
          <h1 className="text-2xl font-bold text-foreground">Forgot Password</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Enter your email and we'll send you a reset link
          </p>
        </div>

        <Card className="border-border/50 shadow-lg">
          <CardContent className="p-8">
            {submitted ? (
              <div className="text-center space-y-4">
                <div className="w-14 h-14 rounded-full bg-green-100 flex items-center justify-center mx-auto">
                  <CheckCircle2 className="w-7 h-7 text-green-600" />
                </div>
                <div>
                  <h2 className="font-semibold text-foreground text-lg">Check your email</h2>
                  <p className="text-sm text-muted-foreground mt-2">
                    If <strong>{email}</strong> has an admin account, you'll receive a password reset link within a few minutes.
                  </p>
                  <p className="text-xs text-muted-foreground mt-2">
                    The link expires in 1 hour. Check your spam folder if you don't see it.
                  </p>
                </div>
                <Link href="/admin/login">
                  <Button variant="outline" className="w-full mt-2">
                    <ArrowLeft className="w-4 h-4 mr-2" />
                    Back to Sign In
                  </Button>
                </Link>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-5">
                <div className="text-center mb-2">
                  <div className="w-14 h-14 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-3">
                    <Mail className="w-7 h-7 text-primary" />
                  </div>
                  <p className="text-sm text-muted-foreground">
                    Enter the email address associated with your admin account.
                  </p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="email">Email Address</Label>
                  <Input
                    id="email"
                    type="email"
                    autoComplete="email"
                    placeholder="you@example.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                  />
                </div>

                {forgotMutation.error && (
                  <p className="text-sm text-destructive text-center">
                    {forgotMutation.error.message}
                  </p>
                )}

                <Button
                  type="submit"
                  className="w-full bg-primary hover:bg-primary/90 text-primary-foreground font-semibold h-11"
                  disabled={forgotMutation.isPending || !email}
                >
                  {forgotMutation.isPending ? (
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  ) : (
                    <Mail className="w-4 h-4 mr-2" />
                  )}
                  {forgotMutation.isPending ? "Sending…" : "Send Reset Link"}
                </Button>

                <Link href="/admin/login">
                  <Button variant="ghost" className="w-full text-muted-foreground">
                    <ArrowLeft className="w-4 h-4 mr-2" />
                    Back to Sign In
                  </Button>
                </Link>
              </form>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
