/**
 * InactivityGuard
 *
 * Tracks user activity (mouse, keyboard, touch, scroll).
 * - At 55 minutes of inactivity: shows a countdown warning dialog.
 * - At 60 minutes of inactivity: automatically logs the user out.
 * - Any activity resets the timer and dismisses the warning.
 */

import { useEffect, useRef, useState, useCallback } from "react";
import { trpc } from "@/lib/trpc";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Clock } from "lucide-react";

const INACTIVITY_WARN_MS  = 55 * 60 * 1000; // 55 minutes
const INACTIVITY_LIMIT_MS = 60 * 60 * 1000; // 60 minutes
const TICK_INTERVAL_MS    = 1_000;           // update countdown every second

const ACTIVITY_EVENTS = [
  "mousemove", "mousedown", "keydown", "touchstart", "scroll", "wheel", "click",
] as const;

export default function InactivityGuard() {
  const [showWarning, setShowWarning] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(5 * 60);

  const lastActivityRef = useRef<number>(Date.now());
  const warnTimerRef    = useRef<ReturnType<typeof setTimeout> | null>(null);
  const logoutTimerRef  = useRef<ReturnType<typeof setTimeout> | null>(null);
  const tickRef         = useRef<ReturnType<typeof setInterval> | null>(null);

  const logoutMutation = trpc.auth.logout.useMutation({
    onSettled: () => {
      window.location.href = "/admin/login";
    },
  });

  // ── Helpers ──────────────────────────────────────────────────────────────
  const clearAllTimers = useCallback(() => {
    if (warnTimerRef.current)   clearTimeout(warnTimerRef.current);
    if (logoutTimerRef.current) clearTimeout(logoutTimerRef.current);
    if (tickRef.current)        clearInterval(tickRef.current);
    warnTimerRef.current   = null;
    logoutTimerRef.current = null;
    tickRef.current        = null;
  }, []);

  const startCountdownTick = useCallback(() => {
    if (tickRef.current) clearInterval(tickRef.current);
    setSecondsLeft(5 * 60);
    tickRef.current = setInterval(() => {
      setSecondsLeft((s) => {
        if (s <= 1) {
          if (tickRef.current) clearInterval(tickRef.current);
          return 0;
        }
        return s - 1;
      });
    }, TICK_INTERVAL_MS);
  }, []);

  const scheduleTimers = useCallback(() => {
    clearAllTimers();

    warnTimerRef.current = setTimeout(() => {
      setShowWarning(true);
      startCountdownTick();

      logoutTimerRef.current = setTimeout(() => {
        setShowWarning(false);
        logoutMutation.mutate();
      }, INACTIVITY_LIMIT_MS - INACTIVITY_WARN_MS);
    }, INACTIVITY_WARN_MS);
  }, [clearAllTimers, startCountdownTick, logoutMutation]);

  const resetActivity = useCallback(() => {
    lastActivityRef.current = Date.now();
    if (showWarning) {
      setShowWarning(false);
    }
    scheduleTimers();
  }, [showWarning, scheduleTimers]);

  // ── Mount / unmount ───────────────────────────────────────────────────────
  useEffect(() => {
    scheduleTimers();

    const handleActivity = () => resetActivity();
    ACTIVITY_EVENTS.forEach((evt) =>
      window.addEventListener(evt, handleActivity, { passive: true })
    );

    return () => {
      clearAllTimers();
      ACTIVITY_EVENTS.forEach((evt) =>
        window.removeEventListener(evt, handleActivity)
      );
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Re-register activity listener when resetActivity reference changes ───
  useEffect(() => {
    const handleActivity = () => resetActivity();
    ACTIVITY_EVENTS.forEach((evt) =>
      window.addEventListener(evt, handleActivity, { passive: true })
    );
    return () => {
      ACTIVITY_EVENTS.forEach((evt) =>
        window.removeEventListener(evt, handleActivity)
      );
    };
  }, [resetActivity]);

  // ── Format countdown ──────────────────────────────────────────────────────
  const mins = Math.floor(secondsLeft / 60);
  const secs = secondsLeft % 60;
  const countdown = `${mins}:${String(secs).padStart(2, "0")}`;

  return (
    <Dialog open={showWarning} onOpenChange={(open) => { if (!open) resetActivity(); }}>
      <DialogContent className="sm:max-w-md" onInteractOutside={(e) => e.preventDefault()}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-amber-700">
            <Clock className="h-5 w-5" />
            Session Expiring Soon
          </DialogTitle>
          <DialogDescription className="text-slate-600 pt-1">
            You have been inactive for 55 minutes. For security, your session will
            automatically end in:
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-center justify-center py-6">
          <div className="text-5xl font-mono font-bold text-amber-600 tabular-nums">
            {countdown}
          </div>
        </div>

        <p className="text-sm text-slate-500 text-center -mt-2">
          Any activity on the page will keep you signed in.
        </p>

        <DialogFooter className="gap-2 pt-2">
          <Button
            variant="outline"
            onClick={() => logoutMutation.mutate()}
            disabled={logoutMutation.isPending}
            className="flex-1"
          >
            Sign Out Now
          </Button>
          <Button
            onClick={resetActivity}
            className="flex-1 bg-green-700 hover:bg-green-800 text-white"
          >
            Stay Signed In
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
