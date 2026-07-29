/**
 * useOpenDocument — opens a stored document by fetching a fresh pre-signed URL
 * before navigating, so expired R2 presigned URLs never cause an "ExpiredRequest" error.
 *
 * Accepts either:
 *   - a bare R2 object key (e.g. "documents/file.pdf")
 *   - a full stored URL (any format: R2 presigned, R2 public, Forge CDN)
 *
 * The server extracts the key from the URL when needed and returns a fresh URL.
 *
 * Usage:
 *   const { openDocument, loading } = useOpenDocument();
 *   <button onClick={() => openDocument(doc.fileKey ?? doc.url, doc.submissionId)}>Open</button>
 */
import { useState, useCallback } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";

export function useOpenDocument() {
  const utils = trpc.useUtils();
  const [loading, setLoading] = useState<string | null>(null); // key/url currently loading

  const openDocument = useCallback(
    async (fileKeyOrUrl: string | null | undefined, submissionId?: number | null) => {
      if (!fileKeyOrUrl) {
        toast.error("Document reference is missing — cannot open file.");
        return;
      }
      setLoading(fileKeyOrUrl);
      try {
        // Pass the key or full URL directly — the server handles both formats
        const { url } = await utils.admin.documents.getFreshUrl.fetch({
          fileKey: fileKeyOrUrl,
          submissionId: submissionId ?? null,
        });
        window.open(url, "_blank", "noopener,noreferrer");
      } catch (err) {
        console.error("[openDocument] failed to get fresh URL:", err);
        toast.error("Could not open document. Please try again.");
      } finally {
        setLoading(null);
      }
    },
    [utils]
  );

  return { openDocument, loading };
}
