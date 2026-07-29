import { useRef, useEffect, useState, useCallback } from "react";
import SignaturePadLib from "signature_pad";
import { Button } from "@/components/ui/button";
import { Eraser, PenLine } from "lucide-react";

interface SignaturePadProps {
  value: string; // base64 data URL or ""
  onChange: (dataUrl: string) => void;
  error?: string;
  label?: string;
}

export function SignaturePad({ value, onChange, error, label }: SignaturePadProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const padRef = useRef<SignaturePadLib | null>(null);
  const [isEmpty, setIsEmpty] = useState(true);

  // Initialize the pad once
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const pad = new SignaturePadLib(canvas, {
      backgroundColor: "rgb(255,255,255)",
      penColor: "#1a1a1a",
      minWidth: 1,
      maxWidth: 2.5,
    });

    padRef.current = pad;

    // Restore existing value
    if (value) {
      pad.fromDataURL(value);
      setIsEmpty(false);
    }

    pad.addEventListener("endStroke", () => {
      setIsEmpty(pad.isEmpty());
      // Use JPEG at 50% quality to keep payload small (PNG signatures can be 100KB+)
      const dataUrl = pad.toDataURL("image/jpeg", 0.5);
      onChange(pad.isEmpty() ? "" : dataUrl);
    });

    return () => {
      pad.off();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Resize canvas to match display size (prevents blurry signature on HiDPI)
  const resizeCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    const pad = padRef.current;
    if (!canvas || !pad) return;
    const ratio = Math.max(window.devicePixelRatio || 1, 1);
    const width = canvas.offsetWidth;
    const height = canvas.offsetHeight;
    canvas.width = width * ratio;
    canvas.height = height * ratio;
    const ctx = canvas.getContext("2d");
    if (ctx) ctx.scale(ratio, ratio);
    pad.clear();
    if (value) {
      pad.fromDataURL(value);
      setIsEmpty(false);
    } else {
      setIsEmpty(true);
    }
  }, [value]);

  useEffect(() => {
    resizeCanvas();
    window.addEventListener("resize", resizeCanvas);
    return () => window.removeEventListener("resize", resizeCanvas);
  }, [resizeCanvas]);

  const handleClear = () => {
    padRef.current?.clear();
    setIsEmpty(true);
    onChange("");
  };

  return (
    <div className="space-y-2">
      {label && (
        <p className="text-sm font-medium text-stone-700">{label}</p>
      )}
      <div
        className={`relative rounded-lg border-2 bg-white overflow-hidden ${
          error ? "border-red-400" : "border-stone-300"
        }`}
        style={{ touchAction: "none" }}
      >
        <canvas
          ref={canvasRef}
          className="w-full"
          style={{ height: 130, display: "block", cursor: "crosshair" }}
        />
        {isEmpty && (
          <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none gap-1">
            <PenLine className="w-5 h-5 text-stone-300" />
            <span className="text-xs text-stone-400">Sign here using your mouse or finger</span>
          </div>
        )}
      </div>
      <div className="flex items-center justify-between">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={handleClear}
          className="text-xs gap-1.5"
        >
          <Eraser className="w-3.5 h-3.5" />
          Clear Signature
        </Button>
        {!isEmpty && (
          <span className="text-xs text-green-700 font-medium">✓ Signature captured</span>
        )}
      </div>
      {error && <p className="text-red-500 text-sm">{error}</p>}
    </div>
  );
}
