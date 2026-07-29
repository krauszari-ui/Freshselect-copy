import type { Express } from "express";
import { ENV } from "./env";
import { sdk } from "./sdk";

export function registerStorageProxy(app: Express) {
  app.get("/manus-storage/:key(*)", async (req, res) => {
    // SECURITY FIX: this endpoint previously served ANY object key to ANYONE.
    // Every file retrieval must now be authorization-aware: require a valid
    // authenticated session before minting/redirecting to a signed URL. Public,
    // unauthenticated file access through this proxy is no longer permitted.
    const user = await sdk.authenticateRequest(req).catch(() => null);
    if (!user) {
      res.status(401).send("Authentication required");
      return;
    }
    // Only internal staff / assessors may retrieve stored files here. Public
    // ("user") accounts and unauthenticated callers are rejected.
    const allowedRoles = new Set(["admin", "super_admin", "worker", "viewer", "assessor"]);
    if (!allowedRoles.has(user.role)) {
      res.status(403).send("Not authorized to access stored files");
      return;
    }

    const key = req.params.key;
    if (!key) {
      res.status(400).send("Missing storage key");
      return;
    }
    // SECURITY: reject path traversal attempts (e.g. ../../etc/passwd, null bytes)
    if (key.includes("..") || key.startsWith("/") || key.includes("\x00")) {
      res.status(400).send("Invalid storage key");
      return;
    }

    // PER-CLIENT SCOPING: the assessor role is restricted to its assigned/referred
    // clients, so it must not be able to fetch another client's document just by
    // knowing/guessing the object key. Resolve the key to its owning client and
    // enforce the same access rule the tRPC layer uses; deny-by-default for keys
    // that are not tracked client documents (so key obscurity is not the boundary).
    if (user.role === "assessor") {
      try {
        const { resolveFileKeyOwnerSubmissionId, getSubmissionById } = await import("../db");
        const ownerSubmissionId = await resolveFileKeyOwnerSubmissionId(key);
        if (ownerSubmissionId == null) {
          res.status(404).send("Not found");
          return;
        }
        const submission = await getSubmissionById(ownerSubmissionId);
        const allowed = !!submission && (
          submission.assessorId === user.id ||
          (submission.referredOrgId != null && submission.referredOrgId === user.orgId)
        );
        if (!allowed) {
          res.status(403).send("Not authorized to access this document");
          return;
        }
      } catch (e) {
        console.error("[StorageProxy] scope check failed:", e);
        res.status(500).send("Storage authorization error");
        return;
      }
    }
    if (!ENV.forgeApiUrl || !ENV.forgeApiKey) {
      res.status(500).send("Storage proxy not configured");
      return;
    }
    try {
      const forgeUrl = new URL(
        "v1/storage/presign/get",
        ENV.forgeApiUrl.replace(/\/+$/, "") + "/",
      );
      forgeUrl.searchParams.set("path", key);
      const forgeResp = await fetch(forgeUrl, {
        headers: { Authorization: `Bearer ${ENV.forgeApiKey}` },
      });
      if (!forgeResp.ok) {
        const body = await forgeResp.text().catch(() => "");
        console.error(`[StorageProxy] forge error: ${forgeResp.status} ${body}`);
        res.status(502).send("Storage backend error");
        return;
      }
      const { url } = (await forgeResp.json()) as { url: string };
      if (!url) {
        res.status(502).send("Empty signed URL from backend");
        return;
      }
      res.set("Cache-Control", "no-store");
      res.redirect(307, url);
    } catch (err) {
      console.error("[StorageProxy] failed:", err);
      res.status(502).send("Storage proxy error");
    }
  });
}
